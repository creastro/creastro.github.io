import { describe, expect, it } from 'vitest'
import { createAperture, nonZeroRowRange, openArea, type ApertureParams } from './aperture'

const base: ApertureParams = {
  gridSize: 256,
  pupilDiameterPx: 64,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
}

describe('createAperture', () => {
  it('đĩa tròn có diện tích ≈ πR²', () => {
    const area = openArea(createAperture(base))
    const expected = Math.PI * 32 ** 2
    expect(Math.abs(area - expected) / expected).toBeLessThan(2e-3)
  })

  it('vật cản trung tâm trừ đúng diện tích ε² của đĩa', () => {
    const eps = 0.4
    const area = openArea(createAperture({ ...base, obstructionRatio: eps }))
    const expected = Math.PI * 32 ** 2 * (1 - eps * eps)
    expect(Math.abs(area - expected) / expected).toBeLessThan(3e-3)
  })

  it('thanh chống bỏ đúng diện tích dải nằm giữa vật cản và mép gương', () => {
    const t = 0.05
    const eps = 0.2
    const vanes = 4
    const withVanes = openArea(
      createAperture({ ...base, obstructionRatio: eps, vaneCount: vanes, vaneThicknessRatio: t }),
    )
    const without = openArea(createAperture({ ...base, obstructionRatio: eps }))

    // Diện tích chính xác một dải ngoài vật cản: ∫ (√(R² − a²) − √(rO² − a²)) da, a ∈ [−h, h].
    const R = 32
    const rO = eps * R
    const h = (t * 64) / 2
    const steps = 20000
    let strip = 0
    for (let i = 0; i < steps; i++) {
      const a = -h + ((i + 0.5) / steps) * 2 * h
      strip += (Math.sqrt(R * R - a * a) - Math.sqrt(rO * rO - a * a)) * ((2 * h) / steps)
    }
    const removed = vanes * strip
    // Dải song song trục là trường hợp xấu nhất của lấy mẫu con, sai số vẫn dưới 2.5%.
    expect(Math.abs(without - withVanes - removed) / removed).toBeLessThan(0.025)
  })

  it('đối xứng tâm khi số thanh chống chẵn', () => {
    const n = base.gridSize
    const m = createAperture({ ...base, vaneCount: 4, vaneThicknessRatio: 0.04, vaneAngleDeg: 17 })
    // Tâm ở chỉ số n/2, nên điểm đối xứng của (x, y) là (n − x, n − y).
    for (let y = 1; y < n; y += 7) {
      for (let x = 1; x < n; x += 7) {
        expect(m[y * n + x]).toBeCloseTo(m[(n - y) * n + (n - x)], 12)
      }
    }
  })

  it('giá trị luôn nằm trong [0, 1]', () => {
    const m = createAperture({ ...base, obstructionRatio: 0.3, vaneCount: 3, vaneThicknessRatio: 0.01 })
    expect(Math.min(...m)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...m)).toBeLessThanOrEqual(1)
  })

  it('thanh chống mảnh hơn một pixel vẫn có phần che từng phần', () => {
    const m = createAperture({ ...base, vaneCount: 1, vaneThicknessRatio: 0.005 })
    const partial = Array.from(m).filter((v) => v > 0 && v < 1).length
    expect(partial).toBeGreaterThan(20)
  })

  it('từ chối tham số không hợp lệ', () => {
    expect(() => createAperture({ ...base, obstructionRatio: 1 })).toThrow(RangeError)
    expect(() => createAperture({ ...base, pupilDiameterPx: 1 })).toThrow(RangeError)
    expect(() => createAperture({ ...base, vaneCount: 1.5 })).toThrow(RangeError)
  })
})

describe('nonZeroRowRange', () => {
  it('bao đúng các hàng chứa pupil', () => {
    const n = base.gridSize
    const [from, to] = nonZeroRowRange(createAperture(base), n)
    expect(from).toBeLessThanOrEqual(n / 2 - 32)
    expect(to).toBeGreaterThanOrEqual(n / 2 + 32)
    expect(to - from).toBeLessThan(base.pupilDiameterPx + 4)
  })

  it('trả về [0, 0] với mảng toàn 0', () => {
    expect(nonZeroRowRange(new Float64Array(16), 4)).toEqual([0, 0])
  })
})
