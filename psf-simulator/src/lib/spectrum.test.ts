import { describe, expect, it } from 'vitest'
import { BAND_SAMPLES, sampleBand, wavelengthToRgb } from './spectrum'

describe('wavelengthToRgb', () => {
  it('tím/xanh/lục/vàng/đỏ có hướng màu đúng', () => {
    const [r450, g450, b450] = wavelengthToRgb(450)
    expect(b450).toBeGreaterThan(r450)
    expect(b450).toBeGreaterThan(g450)

    const [r530, g530, b530] = wavelengthToRgb(530)
    expect(g530).toBeGreaterThan(b530)
    expect(g530).toBeGreaterThanOrEqual(r530)

    const [r580, g580, b580] = wavelengthToRgb(580)
    expect(r580).toBeGreaterThan(0.9)
    expect(g580).toBeGreaterThan(0.9)
    expect(b580).toBe(0)

    const [r650, g650, b650] = wavelengthToRgb(650)
    expect(r650).toBeGreaterThan(g650)
    expect(r650).toBeGreaterThan(b650)
  })

  it('thành phần lớn nhất đạt 1 trong vùng nhìn thấy giữa và luôn nằm trong [0, 1]', () => {
    for (let w = 300; w <= 1000; w += 10) {
      const rgb = wavelengthToRgb(w)
      for (const c of rgb) {
        expect(c).toBeGreaterThanOrEqual(0)
        expect(c).toBeLessThanOrEqual(1)
      }
    }
    expect(Math.max(...wavelengthToRgb(550))).toBe(1)
  })
})

describe('sampleBand', () => {
  it('dải bằng 0 cho một mẫu duy nhất', () => {
    expect(sampleBand(550, 0)).toEqual([{ wavelengthNm: 550, weight: 1 }])
  })

  it('dải rộng cho BAND_SAMPLES mẫu, trọng số tổng 1, trung bình bằng tâm', () => {
    const s = sampleBand(600, 140)
    expect(s).toHaveLength(BAND_SAMPLES)
    expect(s.reduce((a, b) => a + b.weight, 0)).toBeCloseTo(1, 12)
    expect(s.reduce((a, b) => a + b.weight * b.wavelengthNm, 0)).toBeCloseTo(600, 9)
    expect(s[0].wavelengthNm).toBeGreaterThan(530)
    expect(s[s.length - 1].wavelengthNm).toBeLessThan(670)
  })

  it('không đi xuống dưới 200 nm', () => {
    expect(Math.min(...sampleBand(250, 400).map((x) => x.wavelengthNm))).toBeGreaterThanOrEqual(200)
  })
})
