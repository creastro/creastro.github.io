/**
 * Numerical designs of the pupil-plane elements of some coronagraphs:
 * - APLC apodizer: the eigenfunction of the "pupil → occulter → pupil" operator (Soummer 2005).
 * - Shaped pupil: a binary opening whose width follows a 1D prolate spheroidal function
 *   (Kasdin et al. 2003 discuss this family of "Spergel–Kasdin" pupils).
 * - Apodizing phase plate: a phase-only pupil found with a Gerchberg–Saxton-type iteration that empties a
 *   region of the focal plane (Codona et al. 2006 used a related iterative approach).
 * Each design is cached by its parameters.
 */
import { fft2d, fftshift2d } from './fft.ts'
import { type Field, makeField, pupilCoords } from './field.ts'
import { babinetPropagate } from './focalMask.ts'
import { lanczosTop } from './linalg.ts'

const cache = new Map<string, unknown>()
function memo<T>(key: string, make: () => T): T {
  if (cache.has(key)) return cache.get(key) as T
  const v = make()
  if (cache.size > 24) cache.delete(cache.keys().next().value as string)
  cache.set(key, v)
  return v
}

export interface AplcDesign {
  /** Apodizer amplitude (max 1) on the pupil grid. */
  readonly apodizer: Float64Array
  /** Eigenvalue Λ: the fraction of the apodized field amplitude that the occulter removes. */
  readonly eigenvalue: number
}

/**
 * Power iteration for Φ = P · F⁻¹{χ_r · F{Φ}} / Λ, with χ_r the occulter disk of radius r (λ/D).
 * The leading eigenfunction gives the APLC apodizer; on axis the Lyot-plane field becomes (1 − Λ)·Φ.
 */
export function aplcApodizer(pupil: Float64Array, n: number, radius: number, key: string, steps = 12): AplcDesign {
  return memo(`aplc:${key}:${n}:${radius}:${steps}`, () => {
    const x = pupilCoords(n)
    const occulter = (u: number, v: number): readonly [number, number] => (u * u + v * v <= radius * radius ? [-1, 0] : [0, 0])
    // Symmetric operator v ↦ P·F⁻¹{χ·F{P·v}} (real for a centro-symmetric pupil and mask).
    const apply = (v: Float64Array): Float64Array => {
      const f: Field = makeField(n)
      for (let i = 0; i < n * n; i++) f.re[i] = pupil[i] * v[i]
      const rest = babinetPropagate(f, x, x, radius, occulter, 1)
      const out = new Float64Array(n * n)
      for (let i = 0; i < n * n; i++) out[i] = pupil[i] * (f.re[i] - rest.re[i])
      return out
    }
    const { value, vector } = lanczosTop(apply, pupil.slice(), steps)
    let mx = 0
    for (let i = 0; i < n * n; i++) mx = Math.max(mx, Math.abs(vector[i]))
    const sign = vector.reduce((s, v) => s + v, 0) < 0 ? -1 : 1
    return { apodizer: vector.map((v) => (sign * v) / mx), eigenvalue: value }
  })
}

/** Leading prolate spheroidal function on [−a, a] for band |u| ≤ b (u in λ/D, x in D), sampled at K points. */
export function prolate(a: number, b: number, K = 241): { x: Float64Array; psi: Float64Array; concentration: number } {
  return memo(`prolate:${a}:${b}:${K}`, () => {
    const x = new Float64Array(K)
    for (let k = 0; k < K; k++) x[k] = -a + (2 * a * k) / (K - 1)
    const h = x[1] - x[0]
    const S = new Float64Array(K * K)
    for (let i = 0; i < K; i++) {
      for (let j = 0; j < K; j++) {
        const d = x[i] - x[j]
        S[i * K + j] = (d === 0 ? 2 * b : Math.sin(2 * Math.PI * b * d) / (Math.PI * d)) * h
      }
    }
    const apply = (v: Float64Array): Float64Array => {
      const out = new Float64Array(K)
      for (let r = 0; r < K; r++) { let t = 0; for (let c = 0; c < K; c++) t += S[r * K + c] * v[c]; out[r] = t }
      return out
    }
    const top = lanczosTop(apply, new Float64Array(K).fill(1), 40)
    const psi = top.vector
    const lam = top.value
    const mx = psi[(K - 1) / 2]
    for (let i = 0; i < K; i++) psi[i] /= mx
    return { x, psi, concentration: lam }
  })
}

/**
 * Binary shaped pupil: open where |y| ≤ s·ψ(x) for |x| ≤ a, inside the telescope pupil. Along the u axis
 * the far field is the Fourier transform of the opening height, i.e. a prolate function whose energy is
 * concentrated within |u| < b, which leaves deep dark zones beyond b on both sides of the star.
 */
export function shapedPupil(pupil: Float64Array, n: number, b: number, openings: number, key: string): Float64Array {
  return memo(`sp:${key}:${n}:${b}:${openings}`, () => {
    const a = 0.46
    const N = Math.max(1, Math.round(openings))
    const { x: xs, psi } = prolate(a, b)
    const interp = (x: number): number => {
      if (Math.abs(x) >= a) return 0
      const t = ((x + a) / (2 * a)) * (xs.length - 1)
      const i = Math.min(xs.length - 2, Math.floor(t))
      return Math.max(0, psi[i] + (psi[i + 1] - psi[i]) * (t - i))
    }
    // N openings of half-height s·ψ(x)/N, centred at y_k = (k − (N − 1)/2)·2s/N: together their heights add up
    // to the prolate profile, and thinner openings keep the far field dark over a wider range of v.
    // s is the largest scale that keeps the outermost opening inside the circular aperture.
    let s = 0.5
    for (let k = 0; k < xs.length; k++) {
      const chord = Math.sqrt(Math.max(0, 0.25 - xs[k] * xs[k]))
      s = Math.min(s, (chord * N) / (N - 1 + psi[k]))
    }
    // Exact coverage in y, 16 sub-columns in x: the opening height, not a staircase, sets the far field.
    const mask = new Float64Array(n * n)
    const sub = 16
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < sub; k++) {
        const g = (s * interp((i - (n - 1) / 2 + (k + 0.5) / sub - 0.5) / n)) / N
        for (let o = 0; o < N; o++) {
          const yc = ((o - (N - 1) / 2) * 2 * s) / N
          for (let j = 0; j < n; j++) {
            const y0 = (j - n / 2) / n, y1 = y0 + 1 / n
            const cover = Math.max(0, Math.min(y1, yc + g) - Math.max(y0, yc - g)) * n
            mask[j * n + i] += cover / sub
          }
        }
      }
    }
    // Central obstruction and spiders of the telescope still block light.
    for (let i = 0; i < mask.length; i++) if (pupil[i] < 1) mask[i] = Math.min(mask[i], pupil[i])
    return mask
  })
}

/** D-shaped dark-hole region for the APP: iwa ≤ r ≤ owa on the side u > 0 (λ/D). */
export function appRegion(u: number, v: number, iwa: number, owa: number): boolean {
  const r = Math.hypot(u, v)
  return u >= iwa * 0.7 && r >= iwa && r <= owa
}

/**
 * Phase-only pupil that darkens the region `appRegion` (Gerchberg–Saxton iteration on a q = 2 FFT grid):
 * alternately zero the focal field in the slightly enlarged dark hole and keep only the phase in the pupil.
 */
export function appPhase(pupil: Float64Array, n: number, iwa: number, owa: number, key: string): Float64Array {
  return memo(`app:${key}:${n}:${iwa}:${owa}`, () => {
    const N = 2 * n
    const q = N / n
    const off = (N - n) / 2
    const ph = new Float64Array(n * n)
    const re = new Float64Array(N * N), im = new Float64Array(N * N)
    const hole = new Uint8Array(N * N)
    for (let l = 0; l < N; l++) {
      for (let k = 0; k < N; k++) {
        const u = (k - N / 2) / q, v = (l - N / 2) / q
        if (appRegion(u, v, iwa - 0.6, owa + 0.6)) hole[l * N + k] = 1
      }
    }
    for (let it = 0; it < 400; it++) {
      re.fill(0); im.fill(0)
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x, j = (y + off) * N + x + off
          re[j] = pupil[i] * Math.cos(ph[i]); im[j] = pupil[i] * Math.sin(ph[i])
        }
      }
      fftshift2d(re, N); fftshift2d(im, N)
      fft2d(re, im, N, false)
      fftshift2d(re, N); fftshift2d(im, N)
      for (let i = 0; i < N * N; i++) if (hole[i]) { re[i] = 0; im[i] = 0 }
      fftshift2d(re, N); fftshift2d(im, N)
      fft2d(re, im, N, true)
      fftshift2d(re, N); fftshift2d(im, N)
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const i = y * n + x, j = (y + off) * N + x + off
          if (pupil[i] > 0) ph[i] = Math.atan2(im[j], re[j])
        }
      }
    }
    return ph
  })
}
