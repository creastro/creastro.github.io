import { describe, expect, it } from 'vitest'
import { computePsf } from './psf'
import { chooseWavefrontRange, divergingColor, pupilViewSize, renderPupil } from './pupilView'
import { ZERO_ABERRATIONS } from './zernike'

const base = {
  gridSize: 256,
  pupilDiameterPx: 64,
  obstructionRatio: 0.3,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
}
const size = pupilViewSize(base.pupilDiameterPx)
const px = (img: Uint8ClampedArray, x: number, y: number) => {
  const k = (y * size + x) * 4
  return [img[k], img[k + 1], img[k + 2]]
}

describe('divergingColor', () => {
  it('0 là trung tính, âm thiên xanh, dương thiên đỏ, và bị cắt ngoài ±1', () => {
    expect(divergingColor(0)).toEqual([240, 240, 240])
    const neg = divergingColor(-1)
    const pos = divergingColor(1)
    expect(neg[2]).toBeGreaterThan(neg[0])
    expect(pos[0]).toBeGreaterThan(pos[2])
    expect(divergingColor(5)).toEqual(pos)
  })
})

describe('renderPupil', () => {
  it('không quang sai: phần mở màu trắng, vật cản và ngoài gương màu đen', () => {
    const img = renderPupil(computePsf(base), base.pupilDiameterPx)
    expect(img.length).toBe(size * size * 4)
    expect(px(img, size / 2, size / 2)).toEqual([0, 0, 0]) // tâm bị vật cản che
    expect(px(img, size / 2 + 25, size / 2)).toEqual([240, 240, 240]) // r = 25 px, trong vành khuyên
    expect(px(img, 0, 0)).toEqual([0, 0, 0]) // góc ngoài gương
  })

  it('mất nét dương: tâm xanh (Z4 âm), mép đỏ (Z4 dương)', () => {
    const psf = computePsf({ ...base, obstructionRatio: 0 }, { ...ZERO_ABERRATIONS, defocus: 0.2 })
    const img = renderPupil(psf, base.pupilDiameterPx)
    const centre = px(img, size / 2, size / 2)
    const edge = px(img, size / 2 + 30, size / 2)
    expect(centre[2]).toBeGreaterThan(centre[0])
    expect(edge[0]).toBeGreaterThan(edge[2])
  })
})

describe('chooseWavefrontRange', () => {
  const pupil = { ...base, obstructionRatio: 0 }

  it('không có quang sai thì dùng ±1 λ', () => {
    expect(chooseWavefrontRange(computePsf(pupil))).toBe(1)
  })

  it('chọn mức nhỏ nhất chứa trọn mặt sóng, tối đa ±1', () => {
    const range = (c: number) => chooseWavefrontRange(computePsf(pupil, { ...ZERO_ABERRATIONS, defocus: c }))
    // Defocus c waves RMS có biên độ √3·c ở mép: 0.01 → 0.017, 0.05 → 0.087, 0.2 → 0.35, 2 → 3.5.
    expect(range(0.01)).toBe(0.05)
    expect(range(0.05)).toBe(0.1)
    expect(range(0.2)).toBe(0.5)
    expect(range(2)).toBe(1)
  })

  it('mức thang nhỏ làm sai số nhỏ hiện màu đậm hơn', () => {
    const psf = computePsf(pupil, { ...ZERO_ABERRATIONS, defocus: 0.02 })
    const wide = renderPupil(psf, base.pupilDiameterPx, 1)
    const fit = renderPupil(psf, base.pupilDiameterPx, chooseWavefrontRange(psf))
    const k = (size / 2) * size * 4 + (size / 2) * 4
    // Tâm có Z4 âm nên thiên xanh: kênh đỏ giảm khi thang chặt hơn.
    expect(fit[k]).toBeLessThan(wide[k])
  })
})
