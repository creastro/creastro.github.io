import { describe, expect, it } from 'vitest'
import type { ApertureParams } from './aperture'
import { computePsf, encircledEnergy, sampleBilinear } from './psf'

const base: ApertureParams = {
  gridSize: 512,
  pupilDiameterPx: 128,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
}

/** J1(x) bằng tích phân Bessel: J1(x) = (1/π) ∫₀^π cos(τ − x sin τ) dτ. */
function besselJ1(x: number): number {
  const steps = 4000
  let sum = 0
  for (let i = 0; i < steps; i++) {
    const tau = ((i + 0.5) / steps) * Math.PI
    sum += Math.cos(tau - x * Math.sin(tau))
  }
  return sum / steps
}

/** Mẫu Airy chuẩn hoá I(x) = [2 J1(x) / x]², x = π r (r tính theo λ/D). */
function airy(rLD: number): number {
  if (rLD === 0) return 1
  const x = Math.PI * rLD
  return ((2 * besselJ1(x)) / x) ** 2
}

/** Mẫu của khẩu độ vành khuyên, ε = tỉ lệ vật cản. */
function annularAiry(rLD: number, eps: number): number {
  if (rLD === 0) return 1
  const x = Math.PI * rLD
  const amp = (2 * besselJ1(x)) / x - eps * eps * ((2 * besselJ1(eps * x)) / (eps * x))
  return (amp / (1 - eps * eps)) ** 2
}

const c = base.gridSize / 2
const pad = base.gridSize / base.pupilDiameterPx

describe('computePsf — khẩu độ tròn không che', () => {
  const psf = computePsf(base)

  it('có đỉnh bằng 1 ở tâm và Strehl = 1', () => {
    expect(psf.intensity[c * base.gridSize + c]).toBeCloseTo(1, 12)
    expect(psf.strehl).toBeCloseTo(1, 12)
  })

  it('khớp mẫu Airy [2J₁(x)/x]² tại các pixel lưới', () => {
    let worst = 0
    for (const [dx, dy] of [[1, 0], [2, 0], [4, 0], [5, 0], [7, 0], [0, 9], [3, 4], [6, 8], [9, 12], [12, 5]]) {
      const got = psf.intensity[(c + dy) * base.gridSize + (c + dx)]
      const want = airy(Math.hypot(dx, dy) / pad)
      worst = Math.max(worst, Math.abs(got - want))
    }
    expect(worst).toBeLessThan(2e-3)
  })

  it('vòng tối đầu tiên nằm tại 1.22 λ/D', () => {
    // Đọc trực tiếp các pixel lưới dọc trục x (không nội suy: nội suy tuyến tính luôn
    // đánh giá cao hơn tại cực tiểu lồi). Pixel i ứng với r = i / padFactor λ/D, nên i = 5 gần 1.22 nhất.
    const at = (i: number) => psf.intensity[c * base.gridSize + c + i]
    expect(at(5)).toBeLessThan(1e-3)
    expect(at(5)).toBeLessThan(at(4) / 10)
    expect(at(5)).toBeLessThan(at(6) / 10)
  })

  it('có 83.8% năng lượng trong vòng tối đầu tiên', () => {
    expect(encircledEnergy(psf, 1.2197)).toBeCloseTo(0.838, 2)
  })
})

describe('computePsf — vật cản trung tâm', () => {
  it('khớp mẫu khẩu độ vành khuyên và giữ đỉnh chuẩn hoá bằng 1', () => {
    const eps = 0.5
    const psf = computePsf({ ...base, obstructionRatio: eps })
    expect(psf.strehl).toBeCloseTo(1, 12)
    let worst = 0
    for (const [dx, dy] of [[1, 0], [3, 0], [5, 0], [8, 0], [0, 11], [6, 8], [10, 10]]) {
      const got = psf.intensity[(c + dy) * base.gridSize + (c + dx)]
      worst = Math.max(worst, Math.abs(got - annularAiry(Math.hypot(dx, dy) / pad, eps)))
    }
    expect(worst).toBeLessThan(3e-3)
  })

  it('đẩy năng lượng ra các vòng ngoài: EE trong 1.22 λ/D giảm khi ε tăng', () => {
    const open = encircledEnergy(computePsf(base), 1.2197)
    const obstructed = encircledEnergy(computePsf({ ...base, obstructionRatio: 0.5 }), 1.2197)
    expect(obstructed).toBeLessThan(open - 0.1)
  })
})

describe('computePsf — thanh chống', () => {
  const along = (psf: ReturnType<typeof computePsf>, angleDeg: number, rLD: number) => {
    const a = (angleDeg * Math.PI) / 180
    const r = rLD * pad
    return sampleBilinear(psf.intensity, base.gridSize, c + r * Math.cos(a), c + r * Math.sin(a))
  }

  it('một thanh chống ngang tạo cánh sao dọc trục y, vuông góc với thanh', () => {
    const psf = computePsf({ ...base, vaneCount: 2, vaneThicknessRatio: 0.02, vaneAngleDeg: 0 })
    const spike = along(psf, 90, 20)
    const off = along(psf, 45, 20)
    expect(spike / off).toBeGreaterThan(50)
  })

  it('không có thanh chống thì không có cánh sao: mọi hướng cùng cường độ cỡ Airy', () => {
    const psf = computePsf(base)
    const ratio = along(psf, 90, 20) / along(psf, 45, 20)
    expect(ratio).toBeGreaterThan(0.01)
    expect(ratio).toBeLessThan(100)
    expect(along(psf, 90, 20)).toBeLessThan(1e-3)
  })

  it('4 thanh chống 90° cho cánh sao 4 nhánh dọc theo hai trục', () => {
    const psf = computePsf({ ...base, vaneCount: 4, vaneThicknessRatio: 0.02, vaneAngleDeg: 0 })
    const axes = [0, 90, 180, 270].map((a) => along(psf, a, 20))
    const diag = along(psf, 45, 20)
    for (const v of axes) expect(v / diag).toBeGreaterThan(50)
  })
})

describe('sampleBilinear', () => {
  it('nội suy tuyến tính giữa bốn pixel và trả 0 ngoài biên', () => {
    const grid = new Float64Array([0, 1, 2, 3])
    expect(sampleBilinear(grid, 2, 0.5, 0.5)).toBeCloseTo(1.5, 12)
    expect(sampleBilinear(grid, 2, 1, 1)).toBe(3)
    expect(sampleBilinear(grid, 2, -0.1, 0)).toBe(0)
    expect(sampleBilinear(grid, 2, 0, 1.2)).toBe(0)
  })
})

describe('computePsf — góc riêng của từng thanh chống', () => {
  const along = (psf: ReturnType<typeof computePsf>, angleDeg: number, rLD: number) => {
    const a = (angleDeg * Math.PI) / 180
    const r = rLD * pad
    return sampleBilinear(psf.intensity, base.gridSize, c + r * Math.cos(a), c + r * Math.sin(a))
  }

  // Một thanh đơn chỉ cho nửa biên độ của hai thanh đối nhau (hai thanh tạo thành một đường thẳng), tức là cường độ cánh sao
  // chỉ bằng khoảng một phần tư; vì vậy ngưỡng ở đây thấp hơn ngưỡng 50 của test hai thanh đối nhau.
  it('một thanh ở 20° cho cánh sao vuông góc với nó, ở 110° (và 290°)', () => {
    const psf = computePsf({ ...base, vaneCount: 1, vaneThicknessRatio: 0.02, vaneAnglesDeg: [20] })
    expect(along(psf, 110, 20) / along(psf, 65, 20)).toBeGreaterThan(15)
    expect(along(psf, 290, 20) / along(psf, 245, 20)).toBeGreaterThan(15)
  })

  it('ba thanh ở 0°, 60° và 200° cho ba đường cánh sao ở 90°, 150° và 110° (mod 180°)', () => {
    const psf = computePsf({ ...base, vaneCount: 3, vaneThicknessRatio: 0.02, vaneAnglesDeg: [0, 60, 200] })
    const off = along(psf, 45, 20)
    for (const line of [90, 150, 110]) {
      expect(along(psf, line, 20) / off, `${line}°`).toBeGreaterThan(30)
      expect(along(psf, line + 180, 20) / off, `${line + 180}°`).toBeGreaterThan(30)
    }
  })

  it('xoay một thanh chuyển cánh sao theo đúng góc đó', () => {
    const at = (angle: number) => computePsf({ ...base, vaneCount: 1, vaneThicknessRatio: 0.02, vaneAnglesDeg: [angle] })
    const a = at(0)
    const b = at(37)
    expect(along(a, 90, 20)).toBeGreaterThan(along(a, 127, 20) * 15)
    expect(along(b, 127, 20)).toBeGreaterThan(along(b, 90, 20) * 15)
  })
})
