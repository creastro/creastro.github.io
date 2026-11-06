import { describe, expect, it } from 'vitest'
import {
  ZERNIKE_NAMES,
  ZERO_ABERRATIONS,
  buildWavefront,
  hasAberration,
  zernike,
  type ZernikeName,
} from './zernike'

/**
 * Tích phân trên đĩa đơn vị bằng lưới cực (quy tắc điểm giữa): trả về (1/π) ∫ f(ρ,θ) ρ dρ dθ.
 * Sai số cầu phương tỉ lệ 1/nr² (đã kiểm tra: giảm đúng 4 lần khi nr gấp đôi), cỡ 4e-5 ở nr = 400.
 * Một hệ số chuẩn hoá sai sẽ lệch cỡ 1e-1, nên dung sai 1e-4 vẫn đủ nhạy.
 */
function diskAverage(f: (rho: number, theta: number) => number): number {
  const nr = 400
  const nt = 400
  let sum = 0
  for (let i = 0; i < nr; i++) {
    const rho = (i + 0.5) / nr
    for (let j = 0; j < nt; j++) {
      const theta = ((j + 0.5) / nt) * 2 * Math.PI
      sum += f(rho, theta) * rho
    }
  }
  return (sum * (1 / nr) * ((2 * Math.PI) / nt)) / Math.PI
}

describe('đa thức Zernike chuẩn hoá Noll', () => {
  it('mỗi mode có trung bình 0 và RMS 1 trên đĩa đơn vị', () => {
    for (const name of ZERNIKE_NAMES) {
      const mean = diskAverage((r, t) => zernike(name, r, t))
      const meanSquare = diskAverage((r, t) => zernike(name, r, t) ** 2)
      expect(Math.abs(mean), `${name} trung bình`).toBeLessThan(1e-4)
      expect(Math.abs(meanSquare - 1), `${name} bình phương`).toBeLessThan(1e-4)
    }
  })

  it('các mode trực giao đôi một', () => {
    for (let i = 0; i < ZERNIKE_NAMES.length; i++) {
      for (let j = i + 1; j < ZERNIKE_NAMES.length; j++) {
        const a: ZernikeName = ZERNIKE_NAMES[i]
        const b: ZernikeName = ZERNIKE_NAMES[j]
        const inner = diskAverage((r, t) => zernike(a, r, t) * zernike(b, r, t))
        expect(Math.abs(inner), `${a}·${b}`).toBeLessThan(1e-4)
      }
    }
  })

  it('giá trị đặc trưng khớp công thức', () => {
    expect(zernike('defocus', 0, 0)).toBeCloseTo(-Math.sqrt(3), 12)
    expect(zernike('defocus', 1, 0)).toBeCloseTo(Math.sqrt(3), 12)
    expect(zernike('astigmatism0', 1, 0)).toBeCloseTo(Math.sqrt(6), 12)
    expect(zernike('astigmatism0', 1, Math.PI / 2)).toBeCloseTo(-Math.sqrt(6), 12)
    expect(zernike('comaX', 1, 0)).toBeCloseTo(Math.sqrt(8), 12)
    expect(zernike('comaY', 1, Math.PI / 2)).toBeCloseTo(Math.sqrt(8), 12)
    expect(zernike('spherical', 0, 0)).toBeCloseTo(Math.sqrt(5), 12)
  })
})

describe('buildWavefront', () => {
  it('toàn 0 khi không có quang sai', () => {
    expect(hasAberration(ZERO_ABERRATIONS)).toBe(false)
    expect(Math.max(...buildWavefront(64, 32, ZERO_ABERRATIONS))).toBe(0)
  })

  it('mặt sóng mất nét 0.1 waves RMS có RMS 0.1 trên đĩa', () => {
    const n = 256
    const px = 128
    const wave = buildWavefront(n, px, { ...ZERO_ABERRATIONS, defocus: 0.1 })
    const c = n / 2
    let sum = 0
    let sum2 = 0
    let count = 0
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        if (Math.hypot(x - c, y - c) <= px / 2) {
          sum += wave[y * n + x]
          sum2 += wave[y * n + x] ** 2
          count++
        }
      }
    }
    expect(sum / count).toBeCloseTo(0, 3)
    expect(Math.sqrt(sum2 / count)).toBeCloseTo(0.1, 3)
  })

  it('hệ số âm đảo dấu mặt sóng', () => {
    const plus = buildWavefront(64, 32, { ...ZERO_ABERRATIONS, comaX: 0.05 })
    const minus = buildWavefront(64, 32, { ...ZERO_ABERRATIONS, comaX: -0.05 })
    for (let i = 0; i < plus.length; i++) expect(minus[i]).toBeCloseTo(-plus[i], 14)
  })
})
