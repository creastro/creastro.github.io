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

describe('góc riêng của từng thanh chống', () => {
  const n = base.gridSize
  const c = n / 2
  const vaned = { ...base, vaneThicknessRatio: 0.05 }
  const maxDiff = (a: Float64Array, b: Float64Array) => a.reduce((m, v, i) => Math.max(m, Math.abs(v - b[i])), 0)

  it('góc chia đều viết tường minh cho đúng mặt nạ như chia đều tự động', () => {
    const auto = createAperture({ ...vaned, vaneCount: 4, vaneAngleDeg: 17 })
    const explicit = createAperture({ ...vaned, vaneCount: 4, vaneAnglesDeg: [17, 107, 197, 287] })
    expect(maxDiff(auto, explicit)).toBeLessThan(1e-9)
  })

  it('một thanh ở góc bất kỳ giống một thanh xoay tới góc đó', () => {
    const a = createAperture({ ...vaned, vaneCount: 1, vaneAngleDeg: 30 })
    const b = createAperture({ ...vaned, vaneCount: 1, vaneAnglesDeg: [30] })
    expect(maxDiff(a, b)).toBeLessThan(1e-9)
  })

  it('hai thanh ngược nhau ở 0° và 180° giống chia đều hai thanh', () => {
    const a = createAperture({ ...vaned, vaneCount: 2 })
    const b = createAperture({ ...vaned, vaneCount: 2, vaneAnglesDeg: [0, 180] })
    expect(maxDiff(a, b)).toBeLessThan(1e-9)
  })

  it('hai thanh ở 0° và 90° chỉ chặn nửa trục +x và +y: mặt nạ không đối xứng tâm', () => {
    const m = createAperture({ ...vaned, vaneCount: 2, vaneAnglesDeg: [0, 90] })
    expect(m[c * n + (c + 20)]).toBe(0) // trên thanh theo +x
    expect(m[c * n + (c - 20)]).toBe(1) // phía −x không có thanh
    expect(m[(c + 20) * n + c]).toBe(0) // trên thanh theo +y
    expect(m[(c - 20) * n + c]).toBe(1) // phía −y không có thanh
  })

  it('hai thanh trùng góc chỉ che một lần', () => {
    const one = openArea(createAperture({ ...vaned, vaneCount: 1, vaneAnglesDeg: [40] }))
    const twice = openArea(createAperture({ ...vaned, vaneCount: 2, vaneAnglesDeg: [40, 40] }))
    expect(twice).toBeCloseTo(one, 9)
  })

  it('mỗi thanh bỏ đi cùng một diện tích dù ở góc nào (xa tâm: thanh không chạm nhau)', () => {
    const base0 = openArea(createAperture(vaned))
    const removed = (angle: number) => base0 - openArea(createAperture({ ...vaned, vaneCount: 1, vaneAnglesDeg: [angle] }))
    const r0 = removed(0)
    for (const a of [15, 45, 70, 133, 250]) expect(Math.abs(removed(a) / r0 - 1), `${a}°`).toBeLessThan(0.04)
  })

  it('từ chối độ dài không khớp vaneCount hoặc góc không hữu hạn', () => {
    expect(() => createAperture({ ...vaned, vaneCount: 3, vaneAnglesDeg: [0, 90] })).toThrow(RangeError)
    expect(() => createAperture({ ...vaned, vaneCount: 1, vaneAnglesDeg: [Number.NaN] })).toThrow(RangeError)
  })
})
