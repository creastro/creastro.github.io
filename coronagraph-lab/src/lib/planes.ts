/**
 * Fields at every plane of the science arm for the on-axis star at λ0, for the thumbnails of the diagram:
 * A (entrance pupil, before/after apodizer or phase plate), B (focal plane, before/after the mask),
 * C (Lyot plane, before/after the stop) and D (detector).
 */
import { applyLyot, applyPlaneA } from './coronagraph.ts'
import { type Field, focalCoords, pupilCoords } from './field.ts'
import { mftGeneral } from './mft.ts'
import { entranceField } from './optics.ts'
import { type Optics, channels, toDetector } from './train.ts'

export interface Img { readonly w: number; readonly h: number; readonly data: Float32Array }

export interface PlaneSet {
  /** Intensity and phase (rad) before and after the element; the element itself (amplitude, phase), if any. */
  readonly before: { readonly intensity: Img; readonly phase: Img }
  readonly after: { readonly intensity: Img; readonly phase: Img }
  readonly element: { readonly amplitude: Img; readonly phase: Img } | null
  /** Half-width of a focal-plane panel in λ0/D (0 for pupil planes). */
  readonly halfWidth: number
}

export interface Planes { readonly A: PlaneSet; readonly B: PlaneSet; readonly C: PlaneSet; readonly D: Field; readonly dmOpd: Img }

function img(w: number, data: ArrayLike<number>): Img { return { w, h: w, data: Float32Array.from(data) } }

function ip(f: { re: Float64Array; im: Float64Array }, n: number, mask?: ArrayLike<number>) {
  const I = new Float32Array(n * n), P = new Float32Array(n * n)
  for (let i = 0; i < n * n; i++) {
    I[i] = f.re[i] ** 2 + f.im[i] ** 2
    P[i] = mask && !(mask[i] > 0) ? NaN : Math.atan2(f.im[i], f.re[i])
  }
  return { intensity: { w: n, h: n, data: I }, phase: { w: n, h: n, data: P } }
}

/** Half-width (λ0/D) of the focal-plane thumbnails: enough to show the mask and the first rings. */
export function focalHalfWidth(o: Optics): number {
  const s = o.cor.spec
  if (s.kind === 'lyot' || s.kind === 'aplc' || s.kind === 'roddier') return Math.max(4, 2.5 * s.maskRadius)
  if (s.kind === 'bandlimited') return Math.min(16, 2 / s.blEpsilon)
  return 6
}

export function tracePlanes(o: Optics, dmOpd: Float64Array | null): Planes {
  const n = o.spec.npup
  const opd = o.opdScience.map((v, i) => v + (dmOpd ? dmOpd[i] : 0))
  const E0 = entranceField(o.amp, opd, n, o.spec.wavelengthNm, 1)
  const sign = channels(o.cor)[0].sign
  const EA = applyPlaneA(o.cor, E0, 1, sign)
  const A: PlaneSet = {
    before: ip(E0, n, o.pupil), after: ip(EA, n, o.pupil), halfWidth: 0,
    element: o.cor.apodizer ? { amplitude: img(n, o.cor.apodizer), phase: img(n, new Float32Array(n * n)) }
      : o.cor.phasePlate ? { amplitude: img(n, o.pupil), phase: img(n, o.cor.phasePlate.map((p, i) => (o.pupil[i] > 0 ? sign * p : NaN))) }
        : null,
  }
  // B: focal plane on a 128-sample grid.
  const H = focalHalfWidth(o)
  const m = 128
  const u = focalCoords(m, m / (2 * H))
  const F = mftGeneral(EA.re, EA.im, pupilCoords(n), u, u, -1, 1 / (n * n))
  const maskAmp = new Float32Array(m * m), maskPh = new Float32Array(m * m)
  const after = { re: new Float64Array(m * m), im: new Float64Array(m * m) }
  for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) {
    const i = l * m + k
    const [mr, mi] = o.cor.mask ? o.cor.mask(u[k], u[l]) : [1, 0]
    maskAmp[i] = Math.hypot(mr, mi); maskPh[i] = Math.atan2(mi, mr)
    after.re[i] = F.re[i] * mr - F.im[i] * mi
    after.im[i] = F.re[i] * mi + F.im[i] * mr
  }
  const B: PlaneSet = {
    before: ip(F, m), after: ip(after, m), halfWidth: H,
    element: o.cor.mask ? { amplitude: { w: m, h: m, data: maskAmp }, phase: { w: m, h: m, data: maskPh } } : null,
  }
  // C: Lyot plane (padded grid).
  const EC = o.cor.toLyot(EA, 1, true)
  const ECs = applyLyot(o.cor, EC)
  const nC = EC.n
  const C: PlaneSet = {
    before: ip(EC, nC), after: ip(ECs, nC, o.cor.lyot ?? undefined), halfWidth: 0,
    element: o.cor.lyot ? { amplitude: img(nC, o.cor.lyot), phase: img(nC, new Float32Array(nC * nC)) } : null,
  }
  const D = toDetector(ECs, n, o.u0, 1)
  const k = 1 / Math.sqrt(o.refPeak)
  for (let i = 0; i < D.re.length; i++) { D.re[i] *= k; D.im[i] *= k }
  return { A, B, C, D, dmOpd: img(n, dmOpd ? dmOpd.map((v, i) => (o.pupil[i] > 0 ? v : NaN)) : o.pupil.map((p) => (p > 0 ? 0 : NaN))) }
}
