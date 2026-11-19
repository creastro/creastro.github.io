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
import { type Grid2, mftGeneral } from './mft.ts'

/** Complex mask value at focal coordinates (u, v) in λ0/D. */
export type MaskFn = (u: number, v: number) => readonly [number, number]

/** Raised-cosine radial window: 1 for r ≤ a, 0 for r ≥ b. */
export function radialWindow(r: number, a: number, b: number): number {
  if (r <= a) return 1
  if (r >= b) return 0
  return 0.5 * (1 + Math.cos((Math.PI * (r - a)) / (b - a)))
}

/** Sampled mask values, cached per mask function and grid (masks are evaluated once, not at every propagation). */
const maskCache = new WeakMap<object, Map<string, { re: Float64Array; im: Float64Array }>>()

function sampledMask(owner: object, key: string, nu: number, nv: number,
  value: (k: number, l: number) => readonly [number, number]): { re: Float64Array; im: Float64Array } {
  let m = maskCache.get(owner)
  if (!m) { m = new Map(); maskCache.set(owner, m) }
  const hit = m.get(key)
  if (hit) return hit
  const re = new Float64Array(nu * nv), im = new Float64Array(nu * nv)
  for (let l = 0; l < nv; l++) for (let k = 0; k < nu; k++) { const [a, b] = value(k, l); re[l * nu + k] = a; im[l * nu + k] = b }
  if (m.size > 32) m.delete(m.keys().next().value as string)
  const out = { re, im }
  m.set(key, out)
  return out
}

function mulInPlace(g: { re: Float64Array; im: Float64Array }, m: { re: Float64Array; im: Float64Array }): void {
  for (let i = 0; i < g.re.length; i++) {
    const mr = m.re[i], mi = m.im[i]
    if (mr === 0 && mi === 0) { g.re[i] = 0; g.im[i] = 0; continue }
    const r = g.re[i] * mr - g.im[i] * mi
    g.im[i] = g.re[i] * mi + g.im[i] * mr
    g.re[i] = r
  }
}

/**
 * Babinet propagation for a mask that differs from 1 only inside radius `radius0` (λ0/D).
 * `deltaMask(u, v)` returns (m − 1) at λ0/D coordinates; it is averaged over sub-pixels for accurate edges.
 */
export function babinetPropagate(E: Field, xIn: Float64Array, xOut: Float64Array, radius0: number,
  deltaMask: MaskFn, scale: number): Field {
  const g = babinetGrid(E, xIn, xOut, xOut, radius0, deltaMask, scale)
  return { n: xOut.length, re: g.re, im: g.im }
}

/** Babinet propagation to an arbitrary rectangular output grid (yOut rows × xOut columns, same spacing as xIn). */
export function babinetGrid(E: Field, xIn: Float64Array, xOut: Float64Array, yOut: Float64Array, radius0: number,
  deltaMask: MaskFn, scale: number): Grid2 {
  const R = radius0 * scale * 1.02
  // About 10 samples per λ/D across the mask (each averaged over 4×4 sub-samples), at least 32 in total.
  const samples = Math.min(128, Math.max(32, 2 * Math.ceil(R * 10)))
  const q = samples / (2 * R)
  const u = focalCoords(samples, q)
  const dx = xIn[1] - xIn[0]
  const F = mftGeneral(E.re, E.im, xIn, u, u, -1, dx * dx)
  const ss = 4
  const m = sampledMask(deltaMask, `b:${R}:${samples}`, samples, samples, (k, l) => {
    let sr = 0, si = 0
    for (let b = 0; b < ss; b++) {
      for (let a = 0; a < ss; a++) {
        const [r, i] = deltaMask((u[k] + ((a + 0.5) / ss - 0.5) / q) / scale, (u[l] + ((b + 0.5) / ss - 0.5) / q) / scale)
        sr += r; si += i
      }
    }
    return [sr / (ss * ss), si / (ss * ss)]
  })
  mulInPlace(F, m)
  const back = mftGeneral(F.re, F.im, u, xOut, yOut, 1, 1 / (q * q))
  // Add E_A itself where the output samples coincide with input samples.
  addAligned(back, E, xIn, xOut, yOut)
  return back
}

/** Index of the input sample at coordinate x, or −1 if x is not on the input grid. */
function alignedIndex(xIn: Float64Array, x: number): number {
  const dx = xIn[1] - xIn[0]
  const i = Math.round((x - xIn[0]) / dx)
  return i >= 0 && i < xIn.length && Math.abs(xIn[i] - x) < 1e-6 * dx ? i : -1
}

function addAligned(out: Grid2, E: Field, xIn: Float64Array, xOut: Float64Array, yOut: Float64Array): void {
  const ix = Array.from(xOut, (x) => alignedIndex(xIn, x))
  for (let l = 0; l < yOut.length; l++) {
    const iy = alignedIndex(xIn, yOut[l])
    if (iy < 0) continue
    for (let k = 0; k < xOut.length; k++) {
      if (ix[k] < 0) continue
      out.re[l * xOut.length + k] += E.re[iy * E.n + ix[k]]
      out.im[l * xOut.length + k] += E.im[iy * E.n + ix[k]]
    }
  }
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
const LEVELS: readonly Level[] = [{ half: 4, q: 8 }, { half: 1, q: 32 }, { half: 0.25, q: 128 }]
const FFT_Q = 4

/**
 * Multi-scale propagation through a mask that covers the whole focal plane. The star is placed between
 * focal samples (the FFT level uses a half-sample offset) so the singular point is never sampled.
 */
export function multiscalePropagate(E: Field, xIn: Float64Array, xOut: Float64Array, mask: MaskFn, scale: number): Field {
  const g = multiscaleGrid(E, xIn, xOut, xOut, mask, scale)
  return { n: xOut.length, re: g.re, im: g.im }
}

/** Multi-scale propagation to an arbitrary rectangular output grid (yOut rows × xOut columns, same spacing). */
export function multiscaleGrid(E: Field, xIn: Float64Array, xOut: Float64Array, yOut: Float64Array, mask: MaskFn, scale: number): Grid2 {
  const n = E.n
  const mx = xOut.length, my = yOut.length
  const out: Grid2 = { nx: mx, ny: my, re: new Float64Array(mx * my), im: new Float64Array(mx * my) }
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
    const m0 = sampledMask(mask, `fft:${N}:${scale}`, N, N, (k, l) => {
      const u = (k - N / 2) * du - shift, v = (l - N / 2) * du - shift
      const w = 1 - wOuter(Math.hypot(u, v))
      if (w === 0) return [0, 0]
      const [mr, mi] = mask(u / scale, v / scale)
      return [mr * w, mi * w]
    })
    mulInPlace({ re, im }, m0)
    fftshift2d(re, N); fftshift2d(im, N)
    fft2d(re, im, N, true)
    fftshift2d(re, N); fftshift2d(im, N)
    const norm = 1 / (N * N)
    // Output sample at x sits at index x·n + N/2 − 1/2 of the periodic FFT grid.
    const idx = (x: number) => (((Math.round(x * n + N / 2 - 0.5) % N) + N) % N)
    const kx = Array.from(xOut, idx)
    for (let l = 0; l < my; l++) {
      const row = idx(yOut[l]) * N
      for (let k = 0; k < mx; k++) {
        const i = row + kx[k]
        const ph = -2 * Math.PI * shift * (xOut[k] + yOut[l])
        const c = Math.cos(ph), s = Math.sin(ph)
        out.re[l * mx + k] += (re[i] * c - im[i] * s) * norm
        out.im[l * mx + k] += (re[i] * s + im[i] * c) * norm
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
    const mk = sampledMask(mask, `lvl:${li}:${scale}`, M, M, (k, l) => {
      const r = Math.hypot(u[k], u[l])
      const w = wPrev(r) - wNext(r)
      if (w === 0) return [0, 0]
      const [mr, mi] = mask(u[k] / scale, u[l] / scale)
      return [mr * w, mi * w]
    })
    mulInPlace(F, mk)
    const back = mftGeneral(F.re, F.im, u, xOut, yOut, 1, 1 / (L.q * L.q))
    for (let i = 0; i < out.re.length; i++) { out.re[i] += back.re[i]; out.im[i] += back.im[i] }
  }
  return out
}
