import { describe, expect, it } from 'vitest'
import { lambdaOverDArcsec } from '../lib/params'
import { RANGE_SPECS } from './controlSpecs'
import {
  FIT_FIELD_LD,
  MAX_FIELD_LD,
  MIN_FIELD_LD,
  ZOOM_STEP,
  fitFov,
  wheelFactor,
  zoomFov,
  zoomLimits,
} from './zoom'

const range = (() => {
  const s = RANGE_SPECS.find((r) => r.id === 'fov')
  if (!s) throw new Error('no fov spec')
  return { min: s.min, max: s.max }
})()
const ld1m = lambdaOverDArcsec(1, 550)

describe('zoomLimits', () => {
  it('kính 1 m ở 550 nm: từ ±1 λ/D đến ±64 λ/D', () => {
    const { lo, hi } = zoomLimits(range, ld1m)
    expect(lo).toBeCloseTo(MIN_FIELD_LD * ld1m, 12)
    expect(hi).toBeCloseTo(MAX_FIELD_LD * ld1m, 12)
  })

  it('kính nhỏ: giới hạn trên bị kẹp bởi khoảng của thanh trượt', () => {
    expect(zoomLimits(range, lambdaOverDArcsec(0.1, 1000)).hi).toBe(range.max)
  })

  it('kính rất lớn: giới hạn dưới bị kẹp bởi khoảng của thanh trượt', () => {
    expect(zoomLimits(range, lambdaOverDArcsec(10, 380)).lo).toBe(range.min)
  })

  it('luôn có lo ≤ hi và nằm trong khoảng thanh trượt với mọi D và λ', () => {
    for (const D of [0.1, 0.3, 1, 3, 10]) {
      for (const lam of [380, 550, 1000]) {
        const { lo, hi } = zoomLimits(range, lambdaOverDArcsec(D, lam))
        expect(lo, `${D} m ${lam} nm`).toBeLessThanOrEqual(hi)
        expect(lo).toBeGreaterThanOrEqual(range.min)
        expect(hi).toBeLessThanOrEqual(range.max)
      }
    }
  })
})

describe('zoomFov', () => {
  it('phóng to chia trường nhìn cho ZOOM_STEP, thu nhỏ nhân với ZOOM_STEP', () => {
    expect(zoomFov(3, 1 / ZOOM_STEP, ld1m, range)).toBeCloseTo(2, 12)
    expect(zoomFov(3, ZOOM_STEP, ld1m, range)).toBeCloseTo(4.5, 12)
  })

  it('phóng to nhiều lần dừng ở ±1 λ/D, thu nhỏ nhiều lần dừng ở ±64 λ/D', () => {
    let fov = 3
    for (let i = 0; i < 40; i++) fov = zoomFov(fov, 1 / ZOOM_STEP, ld1m, range)
    expect(fov).toBeCloseTo(MIN_FIELD_LD * ld1m, 12)
    for (let i = 0; i < 40; i++) fov = zoomFov(fov, ZOOM_STEP, ld1m, range)
    expect(fov).toBeCloseTo(MAX_FIELD_LD * ld1m, 12)
  })

  it('phóng to rồi thu nhỏ trở lại đúng chỗ cũ khi chưa chạm giới hạn', () => {
    const there = zoomFov(zoomFov(3, 1 / ZOOM_STEP, ld1m, range), ZOOM_STEP, ld1m, range)
    expect(there).toBeCloseTo(3, 12)
  })

  it('từ ngoài khoảng cho phép (kéo thanh trượt quá) thu nhỏ không làm trường nhìn nhảy ra xa hơn nữa', () => {
    const wide = 20 // ±88 λ/D ở D = 1 m: vượt vùng tính toán
    expect(zoomFov(wide, ZOOM_STEP, ld1m, range)).toBeCloseTo(MAX_FIELD_LD * ld1m, 12)
    expect(zoomFov(wide, 1 / ZOOM_STEP, ld1m, range)).toBeLessThanOrEqual(MAX_FIELD_LD * ld1m + 1e-12)
  })
})

describe('fitFov', () => {
  it('vừa khít ±12 λ/D quanh ngôi sao và tỉ lệ theo λ/D', () => {
    expect(fitFov(ld1m, range)).toBeCloseTo(FIT_FIELD_LD * ld1m, 12)
    expect(fitFov(lambdaOverDArcsec(6.5, 550), range)).toBeCloseTo(FIT_FIELD_LD * lambdaOverDArcsec(6.5, 550), 12)
  })

  it('luôn nằm trong giới hạn zoom', () => {
    for (const D of [0.1, 1, 10]) {
      for (const lam of [380, 1000]) {
        const ld = lambdaOverDArcsec(D, lam)
        const { lo, hi } = zoomLimits(range, ld)
        const f = fitFov(ld, range)
        expect(f).toBeGreaterThanOrEqual(lo)
        expect(f).toBeLessThanOrEqual(hi)
      }
    }
  })
})

describe('wheelFactor', () => {
  it('lăn xuống là thu nhỏ (hệ số > 1), lăn lên là phóng to (< 1), không lăn là 1', () => {
    expect(wheelFactor(100)).toBeGreaterThan(1)
    expect(wheelFactor(-100)).toBeLessThan(1)
    expect(wheelFactor(0)).toBe(1)
  })

  it('đối xứng: lăn xuống rồi lên cùng lượng trả về chỗ cũ', () => {
    expect(wheelFactor(80) * wheelFactor(-80)).toBeCloseTo(1, 12)
  })

  it('một nấc chuột (100 điểm ảnh) đổi khoảng 22 %, và có giới hạn cho cú lăn rất mạnh', () => {
    expect(wheelFactor(100)).toBeCloseTo(Math.exp(0.2), 12)
    expect(wheelFactor(1e6)).toBeCloseTo(Math.exp(0.6), 12)
    expect(wheelFactor(-1e6)).toBeCloseTo(Math.exp(-0.6), 12)
  })

  it('chế độ theo dòng và theo trang được đổi ra điểm ảnh', () => {
    expect(wheelFactor(3, 1)).toBeCloseTo(wheelFactor(48, 0), 12)
    expect(wheelFactor(1, 2)).toBeCloseTo(wheelFactor(100, 0), 12)
  })
})
