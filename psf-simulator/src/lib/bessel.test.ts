import { describe, expect, it } from 'vitest'
import { airyIntensity, besselJ1 } from './bessel'

describe('besselJ1', () => {
  it('khớp các giá trị tham chiếu đã biết', () => {
    expect(besselJ1(1)).toBeCloseTo(0.4400505857449335, 12)
    expect(besselJ1(2)).toBeCloseTo(0.5767248077568734, 12)
    expect(besselJ1(10)).toBeCloseTo(0.04347274616886144, 12)
    expect(besselJ1(50)).toBeCloseTo(-0.0975118281251, 10)
  })

  it('có không điểm đầu tiên tại 3.8317059702', () => {
    expect(Math.abs(besselJ1(3.8317059702075125))).toBeLessThan(1e-10)
  })

  it('là hàm lẻ và J1(0) = 0', () => {
    expect(besselJ1(0)).toBe(0)
    expect(besselJ1(-3)).toBeCloseTo(-besselJ1(3), 14)
  })

  it('xấp xỉ x/2 khi x nhỏ', () => {
    expect(besselJ1(1e-4)).toBeCloseTo(5e-5, 12)
  })
})

describe('airyIntensity', () => {
  it('bằng 1 ở tâm, bằng 0 tại 1.2197 λ/D và có vòng sáng 1.75% tại 1.635 λ/D', () => {
    expect(airyIntensity(0)).toBe(1)
    expect(airyIntensity(1.2196698912665045)).toBeLessThan(1e-12)
    expect(airyIntensity(1.6347)).toBeCloseTo(0.0175, 4)
  })
})
