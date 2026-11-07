import { describe, expect, it } from 'vitest'
import { arcsecLabel, niceBar, niceStep, pow10Label } from './plots'

describe('niceStep', () => {
  it('cho bước 1, 2 hoặc 5 nhân luỹ thừa của 10 với khoảng 3–8 vạch', () => {
    for (const range of [0.15, 0.4, 1.5, 3, 7, 20, 130]) {
      const step = niceStep(range, 5)
      const mantissa = step / 10 ** Math.floor(Math.log10(step))
      expect([1, 2, 5]).toContain(Math.round(mantissa))
      expect(range / step).toBeGreaterThan(2)
      expect(range / step).toBeLessThan(10)
    }
  })
})

describe('niceBar', () => {
  it('luôn là 1, 2 hoặc 5 × 10^k và không vượt 30 % khoảng', () => {
    for (const fov of [0.2, 0.3, 0.8, 1, 3, 10, 30]) {
      const bar = niceBar(fov)
      const mantissa = bar / 10 ** Math.floor(Math.log10(bar))
      expect([1, 2, 5]).toContain(Math.round(mantissa * 1000) / 1000)
      expect(bar).toBeLessThanOrEqual(fov * 0.3 + 1e-12)
      expect(bar).toBeGreaterThan(fov * 0.05)
    }
  })

  it('trường nhìn 3″ cho thanh 0.5″', () => {
    expect(niceBar(3)).toBeCloseTo(0.5, 12)
  })
})

describe('nhãn', () => {
  it('lũy thừa của 10 dùng chỉ số trên', () => {
    expect(pow10Label(0)).toBe('1')
    expect(pow10Label(-1)).toBe('10⁻¹')
    expect(pow10Label(-6)).toBe('10⁻⁶')
    expect(pow10Label(-12)).toBe('10⁻¹²')
  })

  it('giây cung có hai chữ số có nghĩa', () => {
    expect(arcsecLabel(0.5)).toBe('0.5″')
    expect(arcsecLabel(0.20000000000000004)).toBe('0.2″')
    expect(arcsecLabel(5)).toBe('5″')
  })
})
