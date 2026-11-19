/**
 * Curvature sensor (Roddier 1988): two images of the beam a short distance before and after focus. In the
 * geometric-optics limit their normalised difference (I₁ − I₂)/(I₁ + I₂) is proportional to the Laplacian of the
 * wavefront inside the pupil and to its radial slope at the edge. Equivalent here to Fresnel propagation of the
 * pupil field by ±z, written with the dimensionless distance z' = λz/D² (angular spectrum on a 2× padded grid).
 */
import { fft2d, fftshift2d } from '../fft.ts'
import type { Field } from '../field.ts'
import { type PupilSensor, binField } from './types.ts'

export function curvature(pupil: Float64Array, n: number, distance: number): PupilSensor {
  const b = Math.max(1, n / 32)
  const m = n / b
  const N = 2 * m
  const off = (N - m) / 2
  // Pixels inside the pupil and in a ring just outside it, where the edge signal appears.
  const valid: number[] = []
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    if (Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / m <= 0.5 + 2 / m) valid.push(y * N + x)
  }
  void pupil
  const H = (sign: number) => {
    const re = new Float64Array(N * N), im = new Float64Array(N * N)
    for (let l = 0; l < N; l++) for (let k = 0; k < N; k++) {
      const fx = ((k - N / 2) * m) / N, fy = ((l - N / 2) * m) / N // cycles per D
      const ph = -sign * Math.PI * distance * (fx * fx + fy * fy)
      re[l * N + k] = Math.cos(ph); im[l * N + k] = Math.sin(ph)
    }
    return { re, im }
  }
  const Hp = H(1), Hm = H(-1)
  const propagate = (E: Field, h: { re: Float64Array; im: Float64Array }) => {
    const re = new Float64Array(N * N), im = new Float64Array(N * N)
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { re[(y + off) * N + x + off] = E.re[y * m + x]; im[(y + off) * N + x + off] = E.im[y * m + x] }
    fftshift2d(re, N); fftshift2d(im, N)
    fft2d(re, im, N)
    fftshift2d(re, N); fftshift2d(im, N)
    for (let i = 0; i < N * N; i++) { const r = re[i] * h.re[i] - im[i] * h.im[i]; im[i] = re[i] * h.im[i] + im[i] * h.re[i]; re[i] = r }
    fftshift2d(re, N); fftshift2d(im, N)
    fft2d(re, im, N, true)
    fftshift2d(re, N); fftshift2d(im, N)
    const I = new Float64Array(N * N)
    for (let i = 0; i < N * N; i++) I[i] = (re[i] ** 2 + im[i] ** 2) / (N * N) ** 2
    return I
  }
  return {
    kind: 'curvature',
    measure(E0: Field) {
      const E = binField(E0, b)
      const I1 = propagate(E, Hp), I2 = propagate(E, Hm)
      const signal = Float64Array.from(valid, (i) => { const s = I1[i] + I2[i]; return s > 1e-12 ? (I1[i] - I2[i]) / s : 0 })
      const data = new Float64Array(2 * N * N)
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) { data[y * 2 * N + x] = I1[y * N + x]; data[y * 2 * N + N + x] = I2[y * N + x] }
      return { signal, image: { w: 2 * N, h: N, data } }
    },
  }
}
