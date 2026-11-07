import { describe, expect, it } from 'vitest'
import type { ApertureParams } from './aperture'
import { getLut } from './colormap'
import { computePsf, sampleBicubic, sampleBilinear } from './psf'
import { renderPsf } from './render'

const base: ApertureParams = {
  gridSize: 512,
  pupilDiameterPx: 128,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
}

function besselJ1(x: number): number {
  const steps = 4000
  let sum = 0
  for (let i = 0; i < steps; i++) {
    const tau = ((i + 0.5) / steps) * Math.PI
    sum += Math.cos(tau - x * Math.sin(tau))
  }
  return sum / steps
}
const airy = (r: number) => (r === 0 ? 1 : ((2 * besselJ1(Math.PI * r)) / (Math.PI * r)) ** 2)

describe('getLut', () => {
  it('thang xám đi từ đen đến trắng và tăng dần', () => {
    const lut = getLut('gray')
    expect([lut[0], lut[1], lut[2]]).toEqual([0, 0, 0])
    // Mục cuối (255) bắt đầu ở chỉ số 255 * 3 = 765.
    expect([lut[765], lut[766], lut[767]]).toEqual([255, 255, 255])
    for (let i = 1; i < 256; i++) expect(lut[i * 3]).toBeGreaterThanOrEqual(lut[(i - 1) * 3])
  })

  it('thang nóng đi qua đỏ rồi vàng', () => {
    const lut = getLut('hot')
    const at = (t: number) => Array.from(lut.slice(Math.round(t * 255) * 3, Math.round(t * 255) * 3 + 3))
    expect(at(0.36)[0]).toBe(255)
    expect(at(0.36)[1]).toBeLessThan(10)
    expect(at(0.75)[1]).toBeGreaterThanOrEqual(250)
    expect(at(0.75)[2]).toBeLessThan(10)
  })
})

describe('sampleBicubic', () => {
  const psf = computePsf(base)
  const c = base.gridSize / 2

  it('bằng giá trị lưới tại điểm nguyên', () => {
    expect(sampleBicubic(psf.intensity, 512, c + 3, c + 5)).toBeCloseTo(psf.intensity[(c + 5) * 512 + c + 3], 12)
  })

  it('gần mẫu Airy hơn nội suy song tuyến tại điểm giữa các pixel lưới', () => {
    let errCubic = 0
    let errLinear = 0
    for (const dx of [0.5, 1.5, 2.5, 4.5, 5.5, 7.5]) {
      const want = airy(dx / 4)
      errCubic = Math.max(errCubic, Math.abs(sampleBicubic(psf.intensity, 512, c + dx, c) - want))
      errLinear = Math.max(errLinear, Math.abs(sampleBilinear(psf.intensity, 512, c + dx, c) - want))
    }
    expect(errCubic).toBeLessThan(errLinear)
    expect(errCubic).toBeLessThan(5e-3)
  })
})

describe('renderPsf', () => {
  const psf = computePsf(base)
  const opts = { size: 64, halfFovLD: 6, dynamicRangeDecades: 6, colormap: 'gray' as const }
  const out = renderPsf(psf, opts)
  const gray = (x: number, y: number) => out[(y * 64 + x) * 4]

  it('trả ảnh RGBA đúng kích thước và mờ đục hoàn toàn', () => {
    expect(out.length).toBe(64 * 64 * 4)
    for (let i = 3; i < out.length; i += 4) expect(out[i]).toBe(255)
  })

  it('đỉnh PSF ở giữa ảnh là điểm sáng nhất', () => {
    const centre = Math.max(gray(31, 31), gray(32, 31), gray(31, 32), gray(32, 32))
    expect(centre).toBeGreaterThan(240)
    expect(centre).toBeGreaterThanOrEqual(Math.max(...Array.from({ length: 64 * 64 }, (_, i) => out[i * 4])))
  })

  it('thang log: vòng Airy thứ nhất (I ≈ 1.75%) sáng hơn nền xa, ở đúng mức log', () => {
    // Vòng sáng thứ nhất ở r = 1.635 λ/D → 1.635 / 6 · 32 ≈ 8.7 pixel từ tâm.
    const ring = gray(32 + 9, 32)
    const expected = (Math.log10(0.0175) + 6) / 6 // ≈ 0.707
    expect(Math.abs(ring / 255 - expected)).toBeLessThan(0.08)
  })

  it('dải động lớn hơn làm vùng mờ sáng lên', () => {
    const wide = renderPsf(psf, { ...opts, dynamicRangeDecades: 8 })
    const narrow = renderPsf(psf, { ...opts, dynamicRangeDecades: 3 })
    const i = (40 * 64 + 50) * 4
    expect(wide[i]).toBeGreaterThanOrEqual(narrow[i] === 0 ? 0 : 1)
    expect(wide[i]).toBeGreaterThan(narrow[i] - 1)
  })

  it('phần ngoài lưới tính toán là màu nền (đen)', () => {
    const huge = renderPsf(psf, { ...opts, halfFovLD: 500 })
    expect(huge[0]).toBe(0)
  })
})
