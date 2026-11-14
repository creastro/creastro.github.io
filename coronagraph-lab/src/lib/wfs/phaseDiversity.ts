/**
 * Phase diversity (Gonsalves 1982): an in-focus image and an image with a known extra defocus. For a point
 * source both are known functions of the unknown wavefront, and the pair removes the sign ambiguity of a single
 * image. The Zernike coefficients are fitted by damped Gauss–Newton (Levenberg–Marquardt) least squares.
 * Images are taken on the science camera without the coronagraph mask, so the method sees the non-common-path
 * aberrations that the pupil-plane sensor misses.
 */
import { focalCoords } from '../field.ts'
import { fieldFromAmpPhase } from '../field.ts'
import { choleskySolve } from '../linalg.ts'
import { mftForward } from '../mft.ts'
import { pupilCoords } from '../field.ts'
import { zernikeMap } from '../zernike.ts'

export interface PhaseDiversitySpec { readonly modes: number; readonly diversityNm: number; readonly wavelengthNm: number }

/** In-focus and defocused images (each normalised to unit total), stacked: q = 2 over ±8 λ/D. */
export function diversityImages(amp: Float64Array, n: number, opdNm: Float64Array, spec: PhaseDiversitySpec): Float64Array {
  const u = focalCoords(33, 2)
  const z4 = zernikeMap(4, n)
  const k = (2 * Math.PI) / spec.wavelengthNm
  const x = pupilCoords(n)
  const out = new Float64Array(2 * u.length * u.length)
  ;[0, spec.diversityNm].forEach((d, s) => {
    const F = mftForward(fieldFromAmpPhase(n, amp, opdNm.map((v, i) => k * (v + d * z4[i]))), x, u)
    let tot = 0
    for (let i = 0; i < F.re.length; i++) tot += F.re[i] ** 2 + F.im[i] ** 2
    for (let i = 0; i < F.re.length; i++) out[s * F.re.length + i] = (F.re[i] ** 2 + F.im[i] ** 2) / tot
  })
  return out
}

/** Fit Zernike coefficients Noll 2 … modes+1 (nm) to the measured image pair, from the known pupil amplitude. */
export function phaseDiversityEstimate(amp: Float64Array, n: number, measured: Float64Array, spec: PhaseDiversitySpec, iterations = 12): Float64Array {
  const J = spec.modes
  const modes = Array.from({ length: J }, (_, j) => zernikeMap(j + 2, n))
  const c = new Float64Array(J)
  const opdOf = (coef: Float64Array) => {
    const o = new Float64Array(n * n)
    coef.forEach((v, j) => { if (v) for (let i = 0; i < o.length; i++) o[i] += v * modes[j][i] })
    return o
  }
  let lambda = 1e-3
  let model = diversityImages(amp, n, opdOf(c), spec)
  let cost = model.reduce((s, v, i) => s + (v - measured[i]) ** 2, 0)
  const h = 0.5
  for (let it = 0; it < iterations; it++) {
    const Jm: Float64Array[] = []
    for (let j = 0; j < J; j++) {
      const cp = c.slice(); cp[j] += h
      const mp = diversityImages(amp, n, opdOf(cp), spec)
      Jm.push(mp.map((v, i) => (v - model[i]) / h))
    }
    const A = new Float64Array(J * J), b = new Float64Array(J)
    for (let a = 0; a < J; a++) {
      for (let i = 0; i < model.length; i++) b[a] += Jm[a][i] * (measured[i] - model[i])
      for (let d = a; d < J; d++) { let s = 0; for (let i = 0; i < model.length; i++) s += Jm[a][i] * Jm[d][i]; A[a * J + d] = s; A[d * J + a] = s }
    }
    let accepted = false
    for (let tries = 0; tries < 6 && !accepted; tries++) {
      const Ad = A.slice()
      for (let a = 0; a < J; a++) Ad[a * J + a] *= 1 + lambda
      const step = choleskySolve(Ad, b, J)
      const cn = c.map((v, j) => v + step[j])
      const mn = diversityImages(amp, n, opdOf(cn), spec)
      const cn2 = mn.reduce((s, v, i) => s + (v - measured[i]) ** 2, 0)
      if (cn2 < cost) { c.set(cn); model = mn; cost = cn2; lambda /= 3; accepted = true } else lambda *= 4
    }
    if (!accepted) break
  }
  return c
}
