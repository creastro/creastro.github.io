/**
 * Matrix Fourier transform (MFT): a discrete Fourier transform evaluated on arbitrary regular output
 * coordinates, written as two matrix products (Soummer et al. 2007, Opt. Express 15, 15935).
 *
 *   F(u_k, v_l) = w · Σ_y Σ_x E(x, y) · exp[s·2πi (u_k x + v_l y)],   s = −1 forward, +1 inverse.
 *
 * With x in units of D and u in units of λ/D this is the Fraunhofer integral sampled at any resolution,
 * which is what a finely sampled focal-plane mask needs. The weight w is the area element of the input
 * grid (dx² for pupil → focal, du² for focal → pupil), so that Parseval's theorem holds in physical units.
 */
import type { Field } from './field.ts'

export interface Grid2 {
  readonly nx: number
  readonly ny: number
  readonly re: Float64Array
  readonly im: Float64Array
}

interface Kernel { readonly re: Float64Array; readonly im: Float64Array }
const cache = new Map<string, Kernel>()

function key(a: Float64Array, b: Float64Array, sign: number): string {
  const da = a.length > 1 ? a[1] - a[0] : 0
  const db = b.length > 1 ? b[1] - b[0] : 0
  return `${a.length}:${a[0]}:${da}|${b.length}:${b[0]}:${db}|${sign}`
}

/** Matrix K[k][j] = exp(s·2πi·u_k·x_j), cached for regular grids. */
function kernel(u: Float64Array, x: Float64Array, sign: number): Kernel {
  const k = key(u, x, sign)
  const hit = cache.get(k)
  if (hit) return hit
  const re = new Float64Array(u.length * x.length)
  const im = new Float64Array(u.length * x.length)
  for (let a = 0; a < u.length; a++) {
    for (let j = 0; j < x.length; j++) {
      const ph = sign * 2 * Math.PI * u[a] * x[j]
      re[a * x.length + j] = Math.cos(ph)
      im[a * x.length + j] = Math.sin(ph)
    }
  }
  if (cache.size > 64) cache.delete(cache.keys().next().value as string)
  const kk = { re, im }
  cache.set(k, kk)
  return kk
}

/**
 * General MFT. Input: yIn.length rows × xIn.length columns (yIn defaults to xIn).
 * Output: v.length rows × u.length columns.
 */
export function mftGeneral(
  inRe: Float64Array, inIm: Float64Array, xIn: Float64Array,
  u: Float64Array, v: Float64Array, sign: -1 | 1, weight: number, yIn: Float64Array = xIn,
): Grid2 {
  const n = xIn.length
  const ny = yIn.length
  const mu = u.length, mv = v.length
  const A = kernel(u, xIn, sign)
  const B = kernel(v, yIn, sign)
  // T[y][k] = Σ_x E[y][x] A[k][x]
  const tRe = new Float64Array(ny * mu)
  const tIm = new Float64Array(ny * mu)
  for (let y = 0; y < ny; y++) {
    const row = y * n
    let empty = true
    for (let x = 0; x < n; x++) if (inRe[row + x] !== 0 || inIm[row + x] !== 0) { empty = false; break }
    if (empty) continue
    for (let k = 0; k < mu; k++) {
      let sr = 0, si = 0
      const ka = k * n
      for (let x = 0; x < n; x++) {
        const er = inRe[row + x], ei = inIm[row + x]
        const ar = A.re[ka + x], ai = A.im[ka + x]
        sr += er * ar - ei * ai
        si += er * ai + ei * ar
      }
      tRe[y * mu + k] = sr
      tIm[y * mu + k] = si
    }
  }
  // F[l][k] = w Σ_y B[l][y] T[y][k]
  const re = new Float64Array(mv * mu)
  const im = new Float64Array(mv * mu)
  for (let l = 0; l < mv; l++) {
    const lb = l * ny
    const o = l * mu
    for (let y = 0; y < ny; y++) {
      const br = B.re[lb + y], bi = B.im[lb + y]
      const t = y * mu
      for (let k = 0; k < mu; k++) {
        const tr = tRe[t + k], ti = tIm[t + k]
        re[o + k] += br * tr - bi * ti
        im[o + k] += br * ti + bi * tr
      }
    }
    for (let k = 0; k < mu; k++) { re[o + k] *= weight; im[o + k] *= weight }
  }
  return { nx: mu, ny: mv, re, im }
}

/** Pupil (x in D) → focal plane (u in λ/D), square output. */
export function mftForward(f: Field, xIn: Float64Array, u: Float64Array): Field {
  const dx = xIn[1] - xIn[0]
  const g = mftGeneral(f.re, f.im, xIn, u, u, -1, dx * dx)
  return { n: u.length, re: g.re, im: g.im }
}

/** Focal plane (u in λ/D) → pupil plane (x in D), square output. */
export function mftInverse(f: Field, u: Float64Array, xOut: Float64Array): Field {
  const du = u[1] - u[0]
  const g = mftGeneral(f.re, f.im, u, xOut, xOut, 1, du * du)
  return { n: xOut.length, re: g.re, im: g.im }
}
