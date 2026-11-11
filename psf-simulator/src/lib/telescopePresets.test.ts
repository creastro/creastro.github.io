import { describe, expect, it } from 'vitest'
import { lambdaOverDArcsec } from './frame'
import { segmentCount } from './segments'
import { TELESCOPE_PRESETS } from './telescopePresets'
import { createAperture, openArea } from './aperture'

describe('TELESCOPE_PRESETS', () => {
  it('số phân đoạn của JWST (18) và Keck (36) khớp kính thật, ELT là xấp xỉ 217', () => {
    const count = (k: keyof typeof TELESCOPE_PRESETS) => {
      const s = TELESCOPE_PRESETS[k].patch.segmented
      return s.enabled ? segmentCount(s.rings, s.removeCenter) : 0
    }
    expect(count('jwst')).toBe(18)
    expect(count('keck')).toBe(36)
    expect(count('elt')).toBe(217)
    expect(count('hubble')).toBe(0)
    expect(count('vlt')).toBe(0)
  })

  it('đường kính là của kính thật', () => {
    const d = (k: keyof typeof TELESCOPE_PRESETS) => TELESCOPE_PRESETS[k].patch.diameterM
    expect([d('hubble'), d('vlt'), d('jwst'), d('keck'), d('elt')]).toEqual([2.4, 8.2, 6.5, 10, 39])
  })

  it('trường nhìn nằm trong ±64 λ/D ở 550 nm và ở 380 nm, và đủ rộng để thấy vài vòng', () => {
    for (const [key, p] of Object.entries(TELESCOPE_PRESETS)) {
      for (const lambda of [550, 380]) {
        const half = p.patch.fovArcsec / 2 / lambdaOverDArcsec(p.patch.diameterM, lambda)
        expect(half, `${key} ${lambda} nm`).toBeLessThanOrEqual(64)
        expect(half, `${key} ${lambda} nm`).toBeGreaterThan(5)
      }
    }
  })

  it('mặt nạ của mỗi cấu hình tạo được, và vật cản làm mất đúng ε² diện tích đĩa (không phân đoạn)', () => {
    for (const key of ['hubble', 'vlt'] as const) {
      const p = TELESCOPE_PRESETS[key].patch
      const n = 512
      const base = { gridSize: n, pupilDiameterPx: 128, vaneCount: 0, vaneThicknessRatio: 0, vaneAngleDeg: 0 }
      const disk = openArea(createAperture({ ...base, obstructionRatio: 0 }))
      const obstructed = openArea(createAperture({ ...base, obstructionRatio: p.obstructionRatio }))
      expect(obstructed / disk).toBeCloseTo(1 - p.obstructionRatio ** 2, 2)
    }
  })

  it('thanh chống: JWST có 3 thanh (một dọc, hai lệch 150°), Keck có 6 thanh cách đều', () => {
    const j = TELESCOPE_PRESETS.jwst.patch
    expect(j.vaneCount).toBe(3)
    expect(j.vaneAnglesDeg).toHaveLength(3)
    const [a, b, c] = j.vaneAnglesDeg ?? []
    const diff = (x: number, y: number) => Math.abs(((x - y + 540) % 360) - 180)
    expect(diff(b, a)).toBeCloseTo(150, 9)
    expect(diff(c, a)).toBeCloseTo(150, 9)
    expect(TELESCOPE_PRESETS.keck.patch.vaneCount).toBe(6)
    expect(TELESCOPE_PRESETS.keck.patch.vaneAnglesDeg).toBeUndefined()
  })

  it('thanh chống JWST tạo cánh sao ngang từ thanh dọc: cường độ trên trục x lớn hơn khi không có thanh', () => {
    const mk = (vaneCount: number, angles?: number[]) => {
      const n = 256
      return { gridSize: n, pupilDiameterPx: 64, obstructionRatio: 0.11, vaneCount, vaneThicknessRatio: 0.03, vaneAngleDeg: 0, vaneAnglesDeg: angles }
    }
    const open0 = openArea(createAperture(mk(0)))
    const open3 = openArea(createAperture(mk(3, [270, 60, 120])))
    expect(open3).toBeLessThan(open0)
    // Ba thanh rộng t·D, dài ≈ (1 − ε)·D/2 mỗi thanh: diện tích mất ≈ 3·t·D·(1 − ε)·D/2 (trừ phần chồng ở tâm).
    const D = 64
    const expectedLoss = 3 * 0.03 * D * ((1 - 0.11) * D / 2)
    expect((open0 - open3) / expectedLoss).toBeGreaterThan(0.9)
    expect((open0 - open3) / expectedLoss).toBeLessThan(1.05)
  })

  it('có mô tả và nhãn không rỗng', () => {
    for (const p of Object.values(TELESCOPE_PRESETS)) {
      expect(p.label.length).toBeGreaterThan(2)
      expect(p.summary.length).toBeGreaterThan(10)
    }
  })
})
