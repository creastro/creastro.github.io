/**
 * Pyramid wavefront sensor (Ragazzoni 1996): a four-sided glass pyramid at focus splits the focal plane into
 * quadrants and forms four images of the pupil. Their intensity differences measure the wavefront slopes, with a
 * gain and linear range set by a circular tip/tilt modulation of the beam around the apex (radius r_mod λ/D,
 * incoherent average over the modulation path).
 * Modelled with FFTs on a 4× padded grid; the beam is offset by half a sample so the apex lies between samples.
 */
import { fft2d, fftshift2d } from '../fft.ts'
import type { Field } from '../field.ts'
import { type PupilSensor, binField, binMap } from './types.ts'

const SPLIT = 0.75 // pupil image centres at (±0.75 D, ±0.75 D)

export function pyramid(pupil: Float64Array, n: number, modulation: number): PupilSensor {
  const b = Math.max(1, n / 32)
  const m = n / b
  const N = 4 * m
  const pb = binMap(pupil, n, b)
  const valid: number[] = []
  for (let i = 0; i < m * m; i++) if (pb[i] > 0.5) valid.push(i)
  const npts = modulation > 0 ? Math.max(8, 4 * Math.ceil(modulation)) : 1
  const q = N / m
  // Pyramid phase 2π·SPLIT·(|u| + |v|) (u, v in λ/D), with the half-sample offset of the beam.
  const pyr = new Float64Array(N * N)
  const shift = 1 / (2 * q)
  for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) {
    const u = (k - N / 2) / q - shift, v = (l - N / 2) / q - shift
    pyr[l * N + k] = 2 * Math.PI * SPLIT * (Math.abs(u) + Math.abs(v))
  }
  const re = new Float64Array(N * N), im = new Float64Array(N * N)
  const off = (N - m) / 2
  const centre = Math.round(SPLIT * m)
  return {
    kind: 'pyramid',
    measure(E0: Field) {
      const E = binField(E0, b)
      const I = new Float64Array(N * N)
      for (let t = 0; t < npts; t++) {
        const th = (2 * Math.PI * t) / npts
        const tx = modulation * Math.cos(th) + shift, ty = modulation * Math.sin(th) + shift
        re.fill(0); im.fill(0)
        for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) {
          const ph = 2 * Math.PI * (tx * (x - (m - 1) / 2) + ty * (y - (m - 1) / 2)) / m
          const c = Math.cos(ph), s = Math.sin(ph), i = y * m + x
          re[(y + off) * N + x + off] = E.re[i] * c - E.im[i] * s
          im[(y + off) * N + x + off] = E.re[i] * s + E.im[i] * c
        }
        fftshift2d(re, N); fftshift2d(im, N)
        fft2d(re, im, N)
        fftshift2d(re, N); fftshift2d(im, N)
        for (let i = 0; i < N * N; i++) {
          const c = Math.cos(pyr[i]), s = Math.sin(pyr[i])
          const r = re[i] * c - im[i] * s
          im[i] = re[i] * s + im[i] * c
          re[i] = r
        }
        fftshift2d(re, N); fftshift2d(im, N)
        fft2d(re, im, N, true)
        fftshift2d(re, N); fftshift2d(im, N)
        for (let i = 0; i < N * N; i++) I[i] += (re[i] ** 2 + im[i] ** 2) / npts
      }
      // The four pupil images: quadrant (sx, sy) centred at (sx·SPLIT, sy·SPLIT) D.
      const quad = (sx: number, sy: number, i: number) => {
        const x = i % m, y = Math.floor(i / m)
        return I[(N / 2 + sy * centre - m / 2 + y) * N + N / 2 + sx * centre - m / 2 + x]
      }
      let mean = 0
      for (const i of valid) mean += quad(-1, -1, i) + quad(1, -1, i) + quad(-1, 1, i) + quad(1, 1, i)
      mean /= valid.length
      const signal = new Float64Array(2 * valid.length)
      valid.forEach((i, k) => {
        const a = quad(-1, -1, i), bq = quad(1, -1, i), c = quad(-1, 1, i), d = quad(1, 1, i)
        signal[k] = (bq + d - a - c) / mean
        signal[valid.length + k] = (c + d - a - bq) / mean
      })
      return { signal, image: { w: N, h: N, data: I } }
    },
  }
}
