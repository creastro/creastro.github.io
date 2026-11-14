/**
 * Propagation from a pupil plane, through a focal-plane mask, to the next pupil plane (the Lyot plane):
 *   E_C = F⁻¹{ m · F{E_A} }.
 * Two exact-in-the-continuum strategies are used:
 *
 * 1. Babinet (compact masks: Lyot occulter, Roddier phase disk, Zernike dimple). Write m = 1 + (m − 1)·χ,
 *    with χ the mask support of radius R. Then E_C = E_A + F⁻¹{(m − 1)·F{E_A}}, and the second term only
 *    needs the focal field inside R, computed with a finely sampled MFT (Soummer et al. 2007).
 *
 * 2. Multi-scale (masks that extend over the whole plane: vortex, four-quadrant). The mask is split with a
 *    smooth radial partition of unity, m = Σ_i m·(W_{i−1} − W_i), and each piece is propagated on its own
 *    focal grid: an FFT for the coarse outer part, and MFTs with ever finer sampling towards the centre,
 *    where the vortex has its singularity. The pieces add up in the Lyot plane.
 *
 * Coordinates: pupil x in units of D; focal u in units of λ/D at the current wavelength.
 * `scale` = λ0/λ converts a mask defined in λ0/D (fixed physical size) to λ/D: u0 = u / scale.
 */
import { fft2d, fftshift2d } from './fft.ts'
import { type Field, focalCoords, makeField } from './field.ts'
import { mftGeneral } from './mft.ts'

/** Complex mask value at focal coordinates (u, v) in λ0/D. */
export type MaskFn = (u: number, v: number) => readonly [number, number]

/** Raised-cosine radial window: 1 for r ≤ a, 0 for r ≥ b. */
export function radialWindow(r: number, a: number, b: number): number {
  if (r <= a) return 1
  if (r >= b) return 0
  return 0.5 * (1 + Math.cos((Math.PI * (r - a)) / (b - a)))
}

function mulMaskOnGrid(g: { re: Float64Array; im: Float64Array }, u: Float64Array, v: Float64Array,
  mask: (u: number, v: number) => readonly [number, number]): void {
  for (let l = 0; l < v.length; l++) {
    for (let k = 0; k < u.length; k++) {
      const i = l * u.length + k
      const [mr, mi] = mask(u[k], v[l])
      const r = g.re[i] * mr - g.im[i] * mi
      g.im[i] = g.re[i] * mi + g.im[i] * mr
      g.re[i] = r
    }
  }
}

/**
 * Babinet propagation for a mask that differs from 1 only inside radius `radius0` (λ0/D).
 * `deltaMask(u, v)` returns (m − 1) at λ0/D coordinates; it is averaged over sub-pixels for accurate edges.
 */
export function babinetPropagate(E: Field, xIn: Float64Array, xOut: Float64Array, radius0: number,
  deltaMask: MaskFn, scale: number, samples = 128): Field {
  const R = radius0 * scale * 1.02
  const q = samples / (2 * R)
  const u = focalCoords(samples, q)
  const dx = xIn[1] - xIn[0]
  const F = mftGeneral(E.re, E.im, xIn, u, u, -1, dx * dx)
  const ss = 4
  mulMaskOnGrid(F, u, u, (uu, vv) => {
    let sr = 0, si = 0
    for (let b = 0; b < ss; b++) {
      for (let a = 0; a < ss; a++) {
        const [r, i] = deltaMask((uu + ((a + 0.5) / ss - 0.5) / q) / scale, (vv + ((b + 0.5) / ss - 0.5) / q) / scale)
        sr += r; si += i
      }
    }
    return [sr / (ss * ss), si / (ss * ss)]
  })
  const back = mftGeneral(F.re, F.im, u, xOut, xOut, 1, 1 / (q * q))
  // E_A resampled on the output grid (same spacing, centred): copy, then add the mask term.
  const out = embed(E, xOut.length)
  for (let i = 0; i < out.re.length; i++) { out.re[i] += back.re[i]; out.im[i] += back.im[i] }
  return out
}

/** Copy an n×n field into the centre of an m×m grid (m ≥ n, same parity). */
export function embed(E: Field, m: number): Field {
  const out = makeField(m)
  const o = (m - E.n) / 2
  for (let y = 0; y < E.n; y++) {
    out.re.set(E.re.subarray(y * E.n, (y + 1) * E.n), (y + o) * m + o)
    out.im.set(E.im.subarray(y * E.n, (y + 1) * E.n), (y + o) * m + o)
  }
  return out
}

/** Levels of the multi-scale scheme: focal half-width (λ/D) and samples per λ/D, plus the window radii. */
interface Level { readonly half: number; readonly q: number }
const LEVELS: readonly Level[] = [{ half: 4, q: 16 }, { half: 1, q: 64 }, { half: 0.25, q: 256 }]
const FFT_Q = 4

/**
 * Multi-scale propagation through a mask that covers the whole focal plane. The star is placed between
 * focal samples (the FFT level uses a half-sample offset) so the singular point is never sampled.
 */
export function multiscalePropagate(E: Field, xIn: Float64Array, xOut: Float64Array, mask: MaskFn, scale: number): Field {
  const n = E.n
  const m = xOut.length
  const out = makeField(m)
  const wOuter = (r: number) => radialWindow(r, 0.5 * LEVELS[0].half, LEVELS[0].half)
  // Level 0: FFT on an n·FFT_Q grid, mask · (1 − W0). Half-sample tilt keeps the axis between samples.
  {
    const N = n * FFT_Q
    const re = new Float64Array(N * N), im = new Float64Array(N * N)
    const off = (N - n) / 2
    const du = 1 / FFT_Q
    const shift = du / 2
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const ph = 2 * Math.PI * shift * (xIn[x] + xIn[y])
        const c = Math.cos(ph), s = Math.sin(ph)
        const er = E.re[y * n + x], ei = E.im[y * n + x]
        re[(y + off) * N + x + off] = er * c - ei * s
        im[(y + off) * N + x + off] = er * s + ei * c
      }
    }
    // Pupil sample j sits at x = (j − N/2 + 1/2)/n; the FFT treats index N/2 as x = 0, i.e. a uniform
    // half-pixel shift, which is undone exactly by the inverse FFT below.
    fftshift2d(re, N); fftshift2d(im, N)
    fft2d(re, im, N, false)
    fftshift2d(re, N); fftshift2d(im, N)
    for (let l = 0; l < N; l++) {
      const v = (l - N / 2) * du - shift
      for (let k = 0; k < N; k++) {
        const u = (k - N / 2) * du - shift
        const w = 1 - wOuter(Math.hypot(u, v))
        const i = l * N + k
        if (w === 0) { re[i] = 0; im[i] = 0; continue }
        const [mr, mi] = mask(u / scale, v / scale)
        const r = (re[i] * mr - im[i] * mi) * w
        im[i] = (re[i] * mi + im[i] * mr) * w
        re[i] = r
      }
    }
    fftshift2d(re, N); fftshift2d(im, N)
    fft2d(re, im, N, true)
    fftshift2d(re, N); fftshift2d(im, N)
    const o2 = (N - m) / 2
    const norm = 1 / (N * N)
    for (let y = 0; y < m; y++) {
      for (let x = 0; x < m; x++) {
        const i = (y + o2) * N + x + o2
        const ph = -2 * Math.PI * shift * (xOut[x] + xOut[y])
        const c = Math.cos(ph), s = Math.sin(ph)
        out.re[y * m + x] += (re[i] * c - im[i] * s) * norm
        out.im[y * m + x] += (re[i] * s + im[i] * c) * norm
      }
    }
  }
  // Finer levels: MFT with mask · (W_{i−1} − W_i).
  const dx = xIn[1] - xIn[0]
  for (let li = 0; li < LEVELS.length; li++) {
    const L = LEVELS[li]
    const next = LEVELS[li + 1]
    const M = Math.round(2 * L.half * L.q)
    const u = focalCoords(M, L.q)
    const F = mftGeneral(E.re, E.im, xIn, u, u, -1, dx * dx)
    const wPrev = (r: number) => radialWindow(r, 0.5 * L.half, L.half)
    const wNext = (r: number) => (next ? radialWindow(r, 0.5 * next.half, next.half) : 0)
    mulMaskOnGrid(F, u, u, (uu, vv) => {
      const r = Math.hypot(uu, vv)
      const w = wPrev(r) - wNext(r)
      if (w === 0) return [0, 0]
      const [mr, mi] = mask(uu / scale, vv / scale)
      return [mr * w, mi * w]
    })
    const back = mftGeneral(F.re, F.im, u, xOut, xOut, 1, 1 / (L.q * L.q))
    for (let i = 0; i < out.re.length; i++) { out.re[i] += back.re[i]; out.im[i] += back.im[i] }
  }
  return out
}
