import { describe, expect, it } from 'vitest'
import type { ApertureParams } from './aperture'
import { computePsf, marechalStrehl } from './psf'
import { ZERNIKE_NAMES, ZERO_ABERRATIONS, type Aberrations } from './zernike'

const base: ApertureParams = {
  gridSize: 512,
  pupilDiameterPx: 128,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
}
const c = base.gridSize / 2
const n = base.gridSize

const only = (name: keyof Aberrations, value: number): Aberrations => ({ ...ZERO_ABERRATIONS, [name]: value })
const at = (psf: { intensity: Float64Array }, dx: number, dy: number) => psf.intensity[(c + dy) * n + (c + dx)]

function maxAbsDiff(a: Float64Array, b: Float64Array): number {
  let m = 0
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]))
  return m
}

describe('Strehl theo gần đúng Maréchal', () => {
  for (const name of ZERNIKE_NAMES) {
    it(`${name}: 0.05 waves RMS cho Strehl ≈ exp(−(2π·0.05)²) ≈ 0.906`, () => {
      const psf = computePsf(base, only(name, 0.05))
      expect(psf.wavefrontRmsWaves).toBeCloseTo(0.05, 3)
      expect(Math.abs(psf.strehl - marechalStrehl(0.05))).toBeLessThan(0.01)
    })
  }

  it('Strehl giảm đơn điệu khi quang sai tăng', () => {
    const s = [0, 0.05, 0.1, 0.2].map((v) => computePsf(base, only('defocus', v)).strehl)
    expect(s[0]).toBeCloseTo(1, 12)
    for (let i = 1; i < s.length; i++) expect(s[i]).toBeLessThan(s[i - 1])
  })

  it('với vật cản và thanh chống, Maréchal dùng RMS đo trên phần khẩu độ mở vẫn đúng', () => {
    const p = { ...base, obstructionRatio: 0.3, vaneCount: 4, vaneThicknessRatio: 0.015 }
    const psf = computePsf(p, only('spherical', 0.06))
    expect(Math.abs(psf.strehl - marechalStrehl(psf.wavefrontRmsWaves))).toBeLessThan(0.015)
  })
})

describe('bảo toàn năng lượng và đối xứng', () => {
  const sum = (a: Float64Array) => a.reduce((s, v) => s + v, 0)

  it('quang sai chỉ phân bố lại năng lượng: tổng cường độ không đổi (Parseval)', () => {
    const clean = sum(computePsf(base).intensity)
    for (const name of ZERNIKE_NAMES) {
      const total = sum(computePsf(base, only(name, 0.2)).intensity)
      expect(Math.abs(total / clean - 1), name).toBeLessThan(1e-9)
    }
  })

  it('mất nét dương và âm cho ảnh giống hệt nhau', () => {
    const plus = computePsf(base, only('defocus', 0.3))
    const minus = computePsf(base, only('defocus', -0.3))
    expect(maxAbsDiff(plus.intensity, minus.intensity)).toBeLessThan(1e-9)
  })

  it('mất nét cho PSF đối xứng tâm', () => {
    const psf = computePsf(base, only('defocus', 0.3))
    for (const [dx, dy] of [[3, 0], [5, 2], [9, 7], [20, 11]]) {
      expect(at(psf, dx, dy)).toBeCloseTo(at(psf, -dx, -dy), 9)
    }
  })

  it('coma theo x làm PSF bất đối xứng trái phải nhưng đối xứng trên dưới', () => {
    const psf = computePsf(base, only('comaX', 0.3))
    expect(Math.abs(at(psf, 5, 0) - at(psf, -5, 0)) / Math.max(at(psf, 5, 0), at(psf, -5, 0))).toBeGreaterThan(0.1)
    for (const [dx, dy] of [[4, 3], [8, 6], [-6, 9]]) {
      expect(at(psf, dx, dy)).toBeCloseTo(at(psf, dx, -dy), 9)
    }
  })

  it('đổi dấu loạn thị tương đương hoán vị trục x và y', () => {
    const plus = computePsf(base, only('astigmatism0', 0.3))
    const minus = computePsf(base, only('astigmatism0', -0.3))
    for (const [dx, dy] of [[3, 1], [6, 2], [10, 4], [2, 12]]) {
      expect(at(plus, dx, dy)).toBeCloseTo(at(minus, dy, dx), 9)
    }
  })
})
