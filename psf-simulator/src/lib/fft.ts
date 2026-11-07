/**
 * FFT 1D/2D Cooley–Tukey radix-2 (thời gian, in-place) cho mảng phức tách re/im.
 *
 * Quy ước: biến đổi thuận dùng nhân tử exp(−2πi·jk/n), không chia n.
 * Biến đổi nghịch dùng exp(+2πi·jk/n) và chia n (1D) hoặc n² (2D) khi `scale = true`.
 * Với mỗi n, bảng sin/cos và bảng đảo bit được tính một lần rồi dùng lại.
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

function getPlan(n: number): Plan {
  if (!isPowerOfTwo(n)) {
    throw new RangeError(`Kích thước FFT phải là lũy thừa của 2, nhận được ${n}`)
  }
  let plan = plans.get(n)
  if (plan) return plan

  const cos = new Float64Array(n / 2)
  const sin = new Float64Array(n / 2)
  for (let k = 0; k < n / 2; k++) {
    cos[k] = Math.cos((2 * Math.PI * k) / n)
    sin[k] = Math.sin((2 * Math.PI * k) / n)
  }
  const bits = Math.log2(n)
  const rev = new Uint32Array(n)
  for (let i = 0; i < n; i++) {
    let r = 0
    for (let b = 0; b < bits; b++) {
      if (i & (1 << b)) r |= 1 << (bits - 1 - b)
    }
    rev[i] = r
  }
  plan = { cos, sin, rev }
  plans.set(n, plan)
  return plan
}

/** FFT 1D tại chỗ trên đoạn [offset, offset + n) của re/im. Không chia tỉ lệ. */
export function fft1dInPlace(
  re: Float64Array,
  im: Float64Array,
  offset: number,
  n: number,
  inverse = false,
): void {
  const { cos, sin, rev } = getPlan(n)

  for (let i = 0; i < n; i++) {
    const j = rev[i]
    if (j > i) {
      const a = offset + i
      const b = offset + j
      const tr = re[a]
      re[a] = re[b]
      re[b] = tr
      const ti = im[a]
      im[a] = im[b]
      im[b] = ti
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
        const a = offset + start + k
        const b = a + half
        const tr = wr * re[b] - wi * im[b]
        const ti = wr * im[b] + wi * re[b]
        re[b] = re[a] - tr
        im[b] = im[a] - ti
        re[a] += tr
        im[a] += ti
      }
    }
  }
}

/** Chuyển vị tại chỗ ma trận vuông n×n, duyệt theo khối để thân thiện với cache. */
function transposeInPlace(data: Float64Array, n: number): void {
  const block = 32
  for (let bi = 0; bi < n; bi += block) {
    for (let bj = bi; bj < n; bj += block) {
      const iEnd = Math.min(bi + block, n)
      const jEnd = Math.min(bj + block, n)
      for (let i = bi; i < iEnd; i++) {
        for (let j = Math.max(bj, i + 1); j < jEnd; j++) {
          const a = i * n + j
          const b = j * n + i
          const t = data[a]
          data[a] = data[b]
          data[b] = t
        }
      }
    }
  }
}

export interface Fft2dOptions {
  inverse?: boolean
  /** Chia cho n² sau biến đổi nghịch (mặc định true khi inverse). */
  scale?: boolean
  /**
   * Nửa khoảng [from, to) các hàng có thể khác 0 ở đầu vào. Các hàng ngoài khoảng này được
   * bỏ qua ở bước FFT theo hàng vì biến đổi của hàng toàn 0 cũng toàn 0.
   */
  nonZeroRows?: readonly [number, number]
}

/**
 * FFT 2D tại chỗ trên ma trận n×n lưu theo hàng. Chỉ số [y * n + x].
 * Thực hiện: FFT các hàng, chuyển vị, FFT các hàng (tức các cột cũ), chuyển vị lại.
 */
export function fft2d(
  re: Float64Array,
  im: Float64Array,
  n: number,
  options: Fft2dOptions = {},
): void {
  const { inverse = false, nonZeroRows } = options
  const scale = options.scale ?? inverse
  if (re.length !== n * n || im.length !== n * n) {
    throw new RangeError('Độ dài mảng re/im phải bằng n × n')
  }

  const [r0, r1] = nonZeroRows ?? [0, n]
  for (let y = Math.max(0, r0); y < Math.min(n, r1); y++) {
    fft1dInPlace(re, im, y * n, n, inverse)
  }
  transposeInPlace(re, n)
  transposeInPlace(im, n)
  for (let y = 0; y < n; y++) {
    fft1dInPlace(re, im, y * n, n, inverse)
  }
  transposeInPlace(re, n)
  transposeInPlace(im, n)

  if (inverse && scale) {
    const s = 1 / (n * n)
    for (let i = 0; i < re.length; i++) {
      re[i] *= s
      im[i] *= s
    }
  }
}
