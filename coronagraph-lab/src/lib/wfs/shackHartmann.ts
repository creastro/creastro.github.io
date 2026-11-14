/**
 * Shack–Hartmann sensor (Platt & Shack 2001): a lenslet array cuts the pupil into nsub × nsub subapertures and
 * each lenslet forms a spot; the spot displacement is the average wavefront slope over its subaperture.
 * Each spot is the |FFT|² of the subaperture field zero-padded 4× (4 pixels per λ/d, a field of ±P/8 λ/d), so that
 * the spot wings are not truncated and the centroid stays linear.
 */
import { fft2d, fftshift2d } from '../fft.ts'
import type { Field } from '../field.ts'
import type { PupilSensor } from './types.ts'

export function shackHartmann(pupil: Float64Array, n: number, nsub: number): PupilSensor {
  const p = n / nsub
  if (!Number.isInteger(p)) throw new RangeError('The pupil size must be a multiple of the number of subapertures')
  const P = Math.max(16, 4 * 2 ** Math.ceil(Math.log2(p)))
  // Valid subapertures: at least half illuminated.
  const valid: number[] = []
  for (let j = 0; j < nsub; j++) for (let i = 0; i < nsub; i++) {
    let s = 0
    for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) s += pupil[(j * p + y) * n + i * p + x]
    if (s >= 0.5 * p * p) valid.push(j * nsub + i)
  }
  const re = new Float64Array(P * P), im = new Float64Array(P * P)
  return {
    kind: 'shack-hartmann',
    measure(E: Field) {
      const W = nsub * P
      const image = new Float64Array(W * W)
      const signal = new Float64Array(2 * valid.length)
      valid.forEach((sa, k) => {
        const i = sa % nsub, j = Math.floor(sa / nsub)
        re.fill(0); im.fill(0)
        const o = (P - p) / 2
        for (let y = 0; y < p; y++) for (let x = 0; x < p; x++) {
          const src = (j * p + y) * n + i * p + x
          re[(y + o) * P + x + o] = E.re[src]
          im[(y + o) * P + x + o] = E.im[src]
        }
        fftshift2d(re, P); fftshift2d(im, P)
        fft2d(re, im, P)
        fftshift2d(re, P); fftshift2d(im, P)
        let s = 0, sx = 0, sy = 0
        for (let y = 0; y < P; y++) for (let x = 0; x < P; x++) {
          const I = re[y * P + x] ** 2 + im[y * P + x] ** 2
          image[(j * P + y) * W + i * P + x] = I
          s += I; sx += I * (x - P / 2); sy += I * (y - P / 2)
        }
        signal[k] = s > 0 ? sx / s : 0
        signal[valid.length + k] = s > 0 ? sy / s : 0
      })
      return { signal, image: { w: W, h: W, data: image } }
    },
  }
}
