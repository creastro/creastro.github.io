import { describe, expect, it } from 'vitest'
import type { ApertureParams } from './aperture'
import { computePsf, marechalStrehl, sampleBicubic } from './psf'
import type { SegmentErrors } from './segmentErrors'
import { ZERO_ABERRATIONS } from './zernike'

const base: ApertureParams = {
  gridSize: 512,
  pupilDiameterPx: 128,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
}
const c = base.gridSize / 2
const pad = base.gridSize / base.pupilDiameterPx
const seg = (rings: number, removeCenter = false) => ({ rings, gapRatio: 0.02, removeCenter })
const errors = (pistonRms: number, tiltRms: number, seed: number): SegmentErrors => ({ pistonRms, tiltRms, seed })
const mean = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length

describe('PSF của gương phân đoạn không sai số', () => {
  const psf = computePsf({ ...base, segments: seg(3, true) })

  it('Strehl = 1 và PSF đối xứng tâm', () => {
    expect(psf.strehl).toBeCloseTo(1, 12)
    for (const [dx, dy] of [[3, 0], [5, 2], [9, 7], [20, 11], [33, 4]]) {
      const a = psf.intensity[(c + dy) * base.gridSize + (c + dx)]
      const b = psf.intensity[(c - dy) * base.gridSize + (c - dx)]
      expect(a).toBeCloseTo(b, 9)
    }
  })

  it('cho cấu trúc lục giác: 6 cánh ở 30° + 60°k mạnh hơn hẳn 6 hướng ở 60°k', () => {
    // Năng lượng trung bình trong 12 sector rộng 24° quanh k·30°, vành 5–15 λ/D.
    const sector = (k: number) => {
      let sum = 0
      let count = 0
      for (let r = 5; r <= 15; r += 0.25) {
        for (let da = -12; da <= 12; da += 1) {
          const a = ((k * 30 + da) * Math.PI) / 180
          sum += sampleBicubic(psf.intensity, base.gridSize, c + r * pad * Math.cos(a), c + r * pad * Math.sin(a))
          count++
        }
      }
      return sum / count
    }
    const s = Array.from({ length: 12 }, (_, k) => sector(k))
    const even = s.filter((_, k) => k % 2 === 0) // 0°, 60°, 120° …
    const odd = s.filter((_, k) => k % 2 === 1) // 30°, 90°, 150° …
    // Mỗi nhóm đồng đều (lưới vuông chỉ phá đối xứng 6 lần vài phần trăm).
    expect(Math.max(...even) / Math.min(...even)).toBeLessThan(1.05)
    expect(Math.max(...odd) / Math.min(...odd)).toBeLessThan(1.05)
    expect(Math.min(...odd) / Math.max(...even)).toBeGreaterThan(2.5)
  })
})

describe('sai pha phân đoạn', () => {
  it('piston ngẫu nhiên: Strehl trung bình theo seed khớp exp[−(2πσ)²]', () => {
    for (const rings of [3, 4]) {
      const strehls = Array.from({ length: 10 }, (_, i) =>
        computePsf({ ...base, segments: seg(rings) }, ZERO_ABERRATIONS, errors(0.05, 0, i + 1)).strehl,
      )
      expect(Math.abs(mean(strehls) - marechalStrehl(0.05)), `${rings} vòng`).toBeLessThan(0.01)
    }
  })

  it('RMS đo được khớp σ_p cho piston và ≈ 0.745 σ_t cho tilt', () => {
    // Tilt a·u + b·v trên lục giác đều có ⟨u²⟩ = ⟨v²⟩ = 5/18, nên RMS = σ_t · √(2 · 5/18) = 0.745 σ_t.
    const run = (e: (seed: number) => SegmentErrors) =>
      mean(Array.from({ length: 6 }, (_, i) => computePsf({ ...base, segments: seg(4) }, ZERO_ABERRATIONS, e(i + 1)).wavefrontRmsWaves))
    expect(Math.abs(run((s) => errors(0.1, 0, s)) / 0.1 - 1)).toBeLessThan(0.08)
    expect(Math.abs(run((s) => errors(0, 0.1, s)) / (0.745 * 0.1) - 1)).toBeLessThan(0.1)
  })

  it('tilt lớn hơn làm Strehl giảm đơn điệu', () => {
    const s = [0, 0.05, 0.15].map((t) => computePsf({ ...base, segments: seg(3) }, ZERO_ABERRATIONS, errors(0, t, 1)).strehl)
    expect(s[0]).toBeCloseTo(1, 12)
    expect(s[1]).toBeLessThan(s[0])
    expect(s[2]).toBeLessThan(s[1])
  })

  it('cùng seed cho cùng kết quả, khác seed cho kết quả khác', () => {
    const run = (seed: number) => computePsf({ ...base, segments: seg(3) }, ZERO_ABERRATIONS, errors(0.08, 0.05, seed)).strehl
    expect(run(4)).toBe(run(4))
    expect(run(4)).not.toBe(run(5))
  })

  it('bảo toàn năng lượng (Parseval)', () => {
    const total = (e: SegmentErrors) =>
      computePsf({ ...base, segments: seg(3) }, ZERO_ABERRATIONS, e).intensity.reduce((s, v) => s + v, 0)
    expect(Math.abs(total(errors(0.2, 0.1, 3)) / total(errors(0, 0, 3)) - 1)).toBeLessThan(1e-9)
  })

  it('cộng với Zernike: mặt sóng tổng RMS lớn hơn từng phần', () => {
    const e = errors(0.05, 0, 2)
    const only = computePsf({ ...base, segments: seg(3) }, ZERO_ABERRATIONS, e).wavefrontRmsWaves
    const both = computePsf({ ...base, segments: seg(3) }, { ...ZERO_ABERRATIONS, defocus: 0.05 }, e).wavefrontRmsWaves
    expect(both).toBeGreaterThan(only)
  })

  it('bỏ qua sai số phân đoạn khi gương là đĩa liền', () => {
    const plain = computePsf(base)
    const withErrors = computePsf(base, ZERO_ABERRATIONS, errors(0.3, 0.3, 1))
    expect(withErrors.strehl).toBe(plain.strehl)
    expect(withErrors.wavefrontWaves).toBeNull()
  })
})

describe('bộ nhớ đệm mặt nạ', () => {
  it('cùng tham số dùng lại mặt nạ, đổi tham số thì tạo mới', () => {
    const p = { ...base, segments: seg(2) }
    const a = computePsf(p)
    const b = computePsf({ ...p }, { ...ZERO_ABERRATIONS, defocus: 0.1 })
    expect(b.aperture).toBe(a.aperture)
    const d = computePsf({ ...p, segments: seg(3) })
    expect(d.aperture).not.toBe(a.aperture)
  })
})
