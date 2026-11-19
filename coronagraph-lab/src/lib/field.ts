/**
 * Complex scalar fields on square grids, stored as split real/imaginary arrays (row-major, index y·n + x).
 *
 * Pupil-plane grids: n samples across the telescope diameter D, pixel centres at
 *   x_j = (j − (n − 1)/2) · dx,  dx = 1/n  (x in units of D).
 * Focal-plane grids: coordinates in units of λ/D at the wavelength being propagated.
 */

export interface Field {
  readonly n: number
  readonly re: Float64Array
  readonly im: Float64Array
}

export function makeField(n: number): Field {
  return { n, re: new Float64Array(n * n), im: new Float64Array(n * n) }
}

export function cloneField(f: Field): Field {
  return { n: f.n, re: f.re.slice(), im: f.im.slice() }
}

/** Real amplitude a times exp(i·φ), φ in radians. */
export function fieldFromAmpPhase(n: number, amp: Float64Array, phaseRad?: Float64Array): Field {
  const f = makeField(n)
  for (let i = 0; i < n * n; i++) {
    const p = phaseRad ? phaseRad[i] : 0
    f.re[i] = amp[i] * Math.cos(p)
    f.im[i] = amp[i] * Math.sin(p)
  }
  return f
}

export function intensity(f: Field): Float64Array {
  const out = new Float64Array(f.n * f.n)
  for (let i = 0; i < out.length; i++) out[i] = f.re[i] * f.re[i] + f.im[i] * f.im[i]
  return out
}

export function phase(f: Field): Float64Array {
  const out = new Float64Array(f.n * f.n)
  for (let i = 0; i < out.length; i++) out[i] = Math.atan2(f.im[i], f.re[i])
  return out
}

/** Σ|E|² (unweighted). Multiply by the pixel area to get the physical energy. */
export function sumIntensity(f: Field): number {
  let s = 0
  for (let i = 0; i < f.re.length; i++) s += f.re[i] * f.re[i] + f.im[i] * f.im[i]
  return s
}

/** Multiply in place by a real array. */
export function mulReal(f: Field, a: Float64Array): Field {
  for (let i = 0; i < a.length; i++) { f.re[i] *= a[i]; f.im[i] *= a[i] }
  return f
}

/** Multiply in place by exp(i·φ). */
export function mulPhase(f: Field, phaseRad: Float64Array): Field {
  for (let i = 0; i < phaseRad.length; i++) {
    const c = Math.cos(phaseRad[i]), s = Math.sin(phaseRad[i])
    const r = f.re[i] * c - f.im[i] * s
    f.im[i] = f.re[i] * s + f.im[i] * c
    f.re[i] = r
  }
  return f
}

/** Pixel-centre coordinates of an m-sample pupil-plane grid with n samples per D, in units of D. */
export function pupilCoords(m: number, n = m): Float64Array {
  const x = new Float64Array(m)
  for (let j = 0; j < m; j++) x[j] = (j - (m - 1) / 2) / n
  return x
}

/** Symmetric focal-plane coordinates: m samples, spacing 1/q (λ/D), no sample on the axis when m is even. */
export function focalCoords(m: number, q: number, shift = 0): Float64Array {
  const u = new Float64Array(m)
  for (let k = 0; k < m; k++) u[k] = (k - (m - 1) / 2) / q + shift
  return u
}
