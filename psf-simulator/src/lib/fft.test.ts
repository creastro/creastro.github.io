import { describe, expect, it } from 'vitest'
import { fft1dInPlace, fft2d, isPowerOfTwo } from './fft'

/** DFT 2D ngây thơ O(n⁴) làm giá trị tham chiếu. */
function naiveDft2d(re: Float64Array, im: Float64Array, n: number) {
  const outRe = new Float64Array(n * n)
  const outIm = new Float64Array(n * n)
  for (let ky = 0; ky < n; ky++) {
    for (let kx = 0; kx < n; kx++) {
      let sr = 0
      let si = 0
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          const phase = (-2 * Math.PI * (kx * x + ky * y)) / n
          const c = Math.cos(phase)
          const s = Math.sin(phase)
          sr += re[y * n + x] * c - im[y * n + x] * s
          si += re[y * n + x] * s + im[y * n + x] * c
        }
      }
      outRe[ky * n + kx] = sr
      outIm[ky * n + kx] = si
    }
  }
  return { re: outRe, im: outIm }
}

/** Bộ sinh giả ngẫu nhiên xác định để test lặp lại được. */
function lcg(seed: number) {
  let s = seed
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296
    return s / 4294967296 - 0.5
  }
}

function randomField(n: number, seed: number) {
  const rnd = lcg(seed)
  const re = new Float64Array(n * n)
  const im = new Float64Array(n * n)
  for (let i = 0; i < n * n; i++) {
    re[i] = rnd()
    im[i] = rnd()
  }
  return { re, im }
}

function maxAbsDiff(a: Float64Array, b: Float64Array) {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('isPowerOfTwo', () => {
  it('nhận dạng đúng lũy thừa của 2', () => {
    expect([1, 2, 64, 512].every(isPowerOfTwo)).toBe(true)
    expect([0, 3, 12, 100, -4, 2.5].some(isPowerOfTwo)).toBe(false)
  })
})

describe('fft1dInPlace', () => {
  it('xung đơn vị cho phổ phẳng bằng 1', () => {
    const re = new Float64Array(16)
    const im = new Float64Array(16)
    re[0] = 1
    fft1dInPlace(re, im, 0, 16)
    for (let k = 0; k < 16; k++) {
      expect(re[k]).toBeCloseTo(1, 12)
      expect(im[k]).toBeCloseTo(0, 12)
    }
  })

  it('hằng số cho phổ chỉ có thành phần DC bằng n', () => {
    const re = new Float64Array(8).fill(1)
    const im = new Float64Array(8)
    fft1dInPlace(re, im, 0, 8)
    expect(re[0]).toBeCloseTo(8, 12)
    for (let k = 1; k < 8; k++) expect(Math.hypot(re[k], im[k])).toBeLessThan(1e-12)
  })

  it('sóng cos tần số 3 cho đỉnh tại k = 3 và k = n − 3', () => {
    const n = 32
    const re = new Float64Array(n)
    const im = new Float64Array(n)
    for (let x = 0; x < n; x++) re[x] = Math.cos((2 * Math.PI * 3 * x) / n)
    fft1dInPlace(re, im, 0, n)
    expect(re[3]).toBeCloseTo(n / 2, 10)
    expect(re[n - 3]).toBeCloseTo(n / 2, 10)
    expect(Math.abs(re[5])).toBeLessThan(1e-10)
  })

  it('từ chối kích thước không phải lũy thừa của 2', () => {
    expect(() => fft1dInPlace(new Float64Array(6), new Float64Array(6), 0, 6)).toThrow(RangeError)
  })
})

describe('fft2d', () => {
  it('khớp với DFT 2D ngây thơ (n = 8)', () => {
    const n = 8
    const { re, im } = randomField(n, 7)
    const expected = naiveDft2d(re, im, n)
    fft2d(re, im, n)
    expect(maxAbsDiff(re, expected.re)).toBeLessThan(1e-10)
    expect(maxAbsDiff(im, expected.im)).toBeLessThan(1e-10)
  })

  it('biến đổi nghịch khôi phục tín hiệu gốc', () => {
    const n = 32
    const { re, im } = randomField(n, 11)
    const re0 = re.slice()
    const im0 = im.slice()
    fft2d(re, im, n)
    fft2d(re, im, n, { inverse: true })
    expect(maxAbsDiff(re, re0)).toBeLessThan(1e-12)
    expect(maxAbsDiff(im, im0)).toBeLessThan(1e-12)
  })

  it('thoả định lý Parseval: Σ|F|² = n² · Σ|f|²', () => {
    const n = 64
    const { re, im } = randomField(n, 3)
    let energyIn = 0
    for (let i = 0; i < n * n; i++) energyIn += re[i] ** 2 + im[i] ** 2
    fft2d(re, im, n)
    let energyOut = 0
    for (let i = 0; i < n * n; i++) energyOut += re[i] ** 2 + im[i] ** 2
    expect(energyOut / (n * n * energyIn)).toBeCloseTo(1, 12)
  })

  it('bỏ qua hàng toàn 0 cho kết quả giống hệt FFT đầy đủ', () => {
    const n = 64
    const full = randomField(n, 5)
    // Chỉ giữ các hàng 20..39, xoá phần còn lại.
    for (let y = 0; y < n; y++) {
      if (y < 20 || y >= 40) {
        full.re.fill(0, y * n, (y + 1) * n)
        full.im.fill(0, y * n, (y + 1) * n)
      }
    }
    const pruned = { re: full.re.slice(), im: full.im.slice() }
    fft2d(full.re, full.im, n)
    fft2d(pruned.re, pruned.im, n, { nonZeroRows: [20, 40] })
    expect(maxAbsDiff(full.re, pruned.re)).toBe(0)
    expect(maxAbsDiff(full.im, pruned.im)).toBe(0)
  })

  it('từ chối mảng sai độ dài', () => {
    expect(() => fft2d(new Float64Array(10), new Float64Array(10), 4)).toThrow(RangeError)
  })
})
