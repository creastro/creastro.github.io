/**
 * Self-coherent camera (Baudoz et al. 2006; Galicher et al. 2010): a small reference hole in the Lyot stop, at a
 * distance ξ0 from the pupil centre, lets through some of the starlight that the focal-plane mask diffracts
 * outside the pupil. It interferes with the stellar speckles on the detector and makes fringes. In the Fourier
 * transform of the image the term E_S·E_R* sits apart from the rest (around −ξ0); isolating it and dividing by the
 * known reference field gives the speckle field E_S, from a single image.
 */
import { type Coronagraph, applyLyot, applyPlaneA } from '../coronagraph.ts'
import { type Field, focalCoords, pupilCoords } from '../field.ts'
import { type Grid2, mftGeneral } from '../mft.ts'
import { rasterize } from '../pupils.ts'

export interface SccSpec {
  /** Hole centre distance from the pupil centre and hole diameter, in units of D. */
  readonly xi0: number
  readonly holeDiameter: number
  /** Half-width of the analysed image (λ/D) and the dark-hole outer radius (window plateau). */
  readonly fov: number
  readonly owa: number
}

export const DEFAULT_SCC: SccSpec = { xi0: 1.65, holeDiameter: 0.08, fov: 10, owa: 8 }
const Q = 6 // samples per λ/D: the fringes need q > 2(ξ0 + (1 + d)/2)

export interface SccFields { readonly u: Float64Array; readonly Es: Grid2; readonly Er: Grid2 }

/** Science (main pupil) and reference (hole) fields on the SCC detector grid, at λ0. */
export function sccFields(cor: Coronagraph, EA: Field, spec: SccSpec, normalisation: number): SccFields {
  if (!cor.toLyotGrid || !cor.lyot) throw new Error('The self-coherent camera needs a focal-plane mask and a Lyot stop')
  const n = cor.n
  const u = focalCoords(2 * Math.round(spec.fov * Q) + 1, Q)
  const Ea = applyPlaneA(cor, EA, 1)
  const main = applyLyot(cor, cor.toLyot(Ea, 1, true))
  const k = 1 / Math.sqrt(normalisation)
  const Es = mftGeneral(main.re, main.im, pupilCoords(main.n, n), u, u, -1, k / (n * n))
  // Hole: a small grid around (ξ0, 0) with the pupil sampling.
  const mh = Math.ceil(spec.holeDiameter * n) + 4
  const hx = pupilCoords(mh, n).map((x) => x + Math.round(spec.xi0 * n) / n)
  const hy = pupilCoords(mh, n)
  const hole = rasterize(n, (x, y) => x * x + y * y <= (spec.holeDiameter / 2) ** 2, 8, mh)
  const H = cor.toLyotGrid(Ea, 1, hx, hy)
  for (let i = 0; i < hole.length; i++) { H.re[i] *= hole[i]; H.im[i] *= hole[i] }
  const Er = mftGeneral(H.re, H.im, hx, u, u, -1, k / (n * n), hy)
  return { u, Es, Er }
}

export function sccImage(f: SccFields): Float64Array {
  return f.Es.re.map((r, i) => (r + f.Er.re[i]) ** 2 + (f.Es.im[i] + f.Er.im[i]) ** 2)
}

/** Smooth window: 1 inside the dark hole, falling to 0 at the image edge (avoids truncation leakage). */
function windowAt(u: number, v: number, spec: SccSpec): number {
  const r = Math.hypot(u, v)
  if (r <= spec.owa) return 1
  if (r >= spec.fov) return 0
  return 0.5 * (1 + Math.cos((Math.PI * (r - spec.owa)) / (spec.fov - spec.owa)))
}

/** Estimate E_S on the image grid from the fringed image and a model of the reference field E_R. */
export function sccEstimate(I: Float64Array, u: Float64Array, ErModel: Grid2, spec: SccSpec): Grid2 {
  const m = u.length
  const w = new Float64Array(m * m)
  for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) w[l * m + k] = I[l * m + k] * windowAt(u[k], u[l], spec)
  // Transform to the pupil plane around (−ξ0, 0), radius (1 + d)/2.
  const R = (1 + spec.holeDiameter) / 2
  const dx = 1 / (2.5 * spec.fov)
  const nx = 2 * Math.ceil(R / dx) + 1
  const gx = focalCoords(nx, 1 / dx).map((x) => x - spec.xi0)
  const gy = focalCoords(nx, 1 / dx)
  const G = mftGeneral(w, new Float64Array(m * m), u, gx, gy, 1, 1 / (Q * Q))
  for (let l = 0; l < nx; l++) for (let k = 0; k < nx; k++) {
    if (Math.hypot(gx[k] + spec.xi0, gy[l]) > R) { G.re[l * nx + k] = 0; G.im[l * nx + k] = 0 }
  }
  const Im = mftGeneral(G.re, G.im, gx, u, u, -1, dx * dx, gy)
  // I_- = E_S · E_R*  ⇒  E_S = I_- · E_R / |E_R|²
  const re = new Float64Array(m * m), im = new Float64Array(m * m)
  for (let i = 0; i < m * m; i++) {
    const a = Im.re[i], b = Im.im[i], c = ErModel.re[i], d = ErModel.im[i]
    const den = c * c + d * d
    if (den <= 0) continue
    re[i] = (a * c - b * d) / den
    im[i] = (a * d + b * c) / den
  }
  return { nx: m, ny: m, re, im }
}
