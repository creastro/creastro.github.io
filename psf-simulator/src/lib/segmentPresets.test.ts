import { describe, expect, it } from 'vitest'
import { lambdaOverDArcsec } from './frame'
import { SEGMENT_PRESETS } from './segmentPresets'
import { segmentCount } from './segments'

describe('SEGMENT_PRESETS', () => {
  it('JWST-like có 18 phân đoạn và Keck-like có 36, như kính thật', () => {
    const count = (k: keyof typeof SEGMENT_PRESETS) => {
      const s = SEGMENT_PRESETS[k].patch.segmented
      return segmentCount(s.rings, s.removeCenter)
    }
    expect(count('jwst')).toBe(18)
    expect(count('keck')).toBe(36)
    expect(count('rings5')).toBe(91)
  })

  it('trường nhìn của mỗi cấu hình nằm trong vùng tính toán ±64 λ/D ở 550 nm và ở 380 nm', () => {
    for (const [key, p] of Object.entries(SEGMENT_PRESETS)) {
      for (const lambda of [550, 380]) {
        const half = p.patch.fovArcsec / 2 / lambdaOverDArcsec(p.patch.diameterM, lambda)
        expect(half, `${key} ${lambda} nm`).toBeLessThanOrEqual(64)
        expect(half, `${key} ${lambda} nm`).toBeGreaterThan(5)
      }
    }
  })

  it('tắt vật cản và thanh chống để thấy cấu trúc riêng của gương', () => {
    for (const p of Object.values(SEGMENT_PRESETS)) {
      expect(p.patch.obstructionRatio).toBe(0)
      expect(p.patch.vaneCount).toBe(0)
    }
  })
})
