/**
 * Radix-2 Cooley–Tukey FFT on split real/imaginary arrays.
 *
 * Convention: the forward transform uses exp(−2πi·jk/n) and is not scaled; the inverse uses
 * exp(+2πi·jk/n) and is not scaled either (callers apply the physical sampling weights).
 * Twiddle and bit-reversal tables are cached per size.
 */

interface Plan {
  readonly cos: Float64Array
  readonly sin: Float64Array
  readonly rev: Uint32Array
}

const plans = new Map<number, Plan>()

export function isPowerOfTwo(n: number): boolean {
  return Number.isInteger(n) && n >= 1 && (n & (n - 1)) === 0
}

function plan(n: number): Plan {
  if (!isPowerOfTwo(n)) throw new RangeError(`FFT size must be a power of two, got ${n}`)
  const cached = plans.get(n)
  if (cached) return cached
  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n)
    sin[k] = Math.sin((2 * Math.PI * k) / n)
  }
  const bits = Math.round(Math.log2(n))
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) if (i & (1 << b)) r |= 1 << (bits - 1 - b)
    rev[i] = r
  }
  const p = { cos, sin, rev }
  plans.set(n, p)
  return p
}

/** In-place 1D FFT of n points starting at `offset` with the given `stride`. */
export function fft1d(re: Float64Array, im: Float64Array, n: number, inverse = false, offset = 0, stride = 1): void {
  const { cos, sin, rev } = plan(n)
  for (let i = 0; i < n; i++) {
    const j = rev[i]
    if (j > i) {
      const a = offset + i * stride
      const b = offset + j * stride
      let t = re[a]; re[a] = re[b]; re[b] = t
      t = im[a]; im[a] = im[b]; im[b] = t
    }
  }
  const sign = inverse ? 1 : -1
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1
    const step = n / size
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const wr = cos[k * step]
        const wi = sign * sin[k * step]
        const a = offset + (start + k) * stride
        const b = a + half * stride
        const xr = re[b] * wr - im[b] * wi
        const xi = re[b] * wi + im[b] * wr
        re[b] = re[a] - xr
        im[b] = im[a] - xi
        re[a] += xr
        im[a] += xi
      }
    }
  }
}

/** In-place 2D FFT of an n×n row-major array (unscaled in both directions). */
export function fft2d(re: Float64Array, im: Float64Array, n: number, inverse = false): void {
  for (let y = 0; y < n; y++) fft1d(re, im, n, inverse, y * n, 1)
  for (let x = 0; x < n; x++) fft1d(re, im, n, inverse, x, n)
}

/** Swap quadrants so that the zero frequency moves between index 0 and index n/2 (n even). */
export function fftshift2d(a: Float64Array, n: number): void {
  const h = n >> 1
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      const j = (y + h) * n + ((x + h) % n)
      const t = a[i]; a[i] = a[j]; a[j] = t
    }
  }
}
