import { describe, expect, it } from 'vitest'
import { airyIntensity } from './bessel'
import { computePsf } from './psf'
import { radialProfile } from './profile'
import { renderChannels } from './render'

const clear = computePsf({
  gridSize: 512,
  pupilDiameterPx: 128,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
})

describe('radialProfile', () => {
  it('khẩu độ tròn không che khớp mẫu Airy giải tích tại mọi bán kính', () => {
    // λ/D = 1″ nên bán kính tính bằng giây cung bằng đúng số λ/D.
    const p = radialProfile([{ psf: clear, lambdaOverDArcsec: 1, weight: 1 }], 10, 101)
    // Profile dùng nội suy bicubic (4 mẫu mỗi λ/D). Sai số lớn nhất nằm sát đỉnh nhọn (≈ 0.7% ở r = 0.2 λ/D),
    // sai số trung bình cỡ 3e-4. Các cực tiểu sâu bị nâng nhẹ vì nội suy không dựng lại được điểm không.
    let worst = 0
    let sum = 0
    for (let j = 0; j < p.thetaArcsec.length; j++) {
      const d = Math.abs(p.intensity[j] - airyIntensity(p.thetaArcsec[j]))
      worst = Math.max(worst, d)
      sum += d
    }
    expect(worst).toBeLessThan(8e-3)
    expect(sum / p.thetaArcsec.length).toBeLessThan(1e-3)
    expect(p.intensity[0]).toBeCloseTo(1, 6)
  })

  it('mẫu Airy tham chiếu bằng 1 ở tâm và dùng đúng λ/D', () => {
    const p = radialProfile([{ psf: clear, lambdaOverDArcsec: 0.5, weight: 1 }], 2, 41)
    expect(p.airy[0]).toBe(1)
    expect(p.airy[40]).toBeCloseTo(airyIntensity(4), 12) // θ = 2″ = 4 λ/D
  })

  it('hai bước sóng trộn đúng bằng trung bình có trọng số của hai mẫu Airy', () => {
    const p = radialProfile(
      [
        { psf: clear, lambdaOverDArcsec: 1, weight: 0.5 },
        { psf: clear, lambdaOverDArcsec: 1.5, weight: 0.5 },
      ],
      8,
      81,
    )
    for (const j of [10, 30, 55, 80]) {
      const t = p.thetaArcsec[j]
      const want = 0.5 * airyIntensity(t / 1) + 0.5 * airyIntensity(t / 1.5)
      expect(p.airy[j]).toBeCloseTo(want, 12)
      expect(Math.abs(p.intensity[j] - want)).toBeLessThan(5e-3)
    }
  })

  it('ngoài vùng tính toán đóng góp bằng 0', () => {
    const p = radialProfile([{ psf: clear, lambdaOverDArcsec: 0.01, weight: 1 }], 10, 11)
    expect(p.intensity[10]).toBe(0)
  })
})

describe('renderChannels — màu quang phổ', () => {
  const opts = { size: 32, dynamicRangeDecades: 4, colormap: 'spectrum' as const }
  const centre = (img: Uint8ClampedArray) => {
    const k = (16 * 32 + 16) * 4
    return [img[k], img[k + 1], img[k + 2]]
  }

  it('kênh xanh lam cho tâm thiên xanh, kênh đỏ cho tâm thiên đỏ', () => {
    const blue = renderChannels([{ psf: clear, halfFovLD: 3, weight: 1, rgb: [0, 0.2, 1] }], opts)
    const red = renderChannels([{ psf: clear, halfFovLD: 3, weight: 1, rgb: [1, 0.2, 0] }], opts)
    expect(centre(blue)[2]).toBeGreaterThan(centre(blue)[0])
    expect(centre(red)[0]).toBeGreaterThan(centre(red)[2])
  })

  it('hai kênh xanh và đỏ cùng cường độ trộn thành màu tím ở tâm', () => {
    const img = renderChannels(
      [
        { psf: clear, halfFovLD: 3, weight: 0.5, rgb: [0, 0, 1] },
        { psf: clear, halfFovLD: 3, weight: 0.5, rgb: [1, 0, 0] },
      ],
      opts,
    )
    const [r, g, b] = centre(img)
    expect(r).toBeGreaterThan(100)
    expect(b).toBeGreaterThan(100)
    expect(g).toBeLessThan(5)
    expect(Math.abs(r - b)).toBeLessThan(5)
  })
})
