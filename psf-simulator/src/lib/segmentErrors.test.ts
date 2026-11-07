import { describe, expect, it } from 'vitest'
import { drawSegments, mulberry32, scaleSegmentErrors, segmentWavefront } from './segmentErrors'
import { layoutFor } from './segments'

const N = 256
const PX = 128
const c = N / 2
const geometry = { rings: 3, gapRatio: 0.02, removeCenter: false }

describe('mulberry32', () => {
  it('lặp lại được theo seed, khác nhau giữa các seed, và nằm trong [0, 1)', () => {
    const a = mulberry32(7)
    const b = mulberry32(7)
    const c2 = mulberry32(8)
    const xs = Array.from({ length: 100 }, () => a())
    expect(xs).toEqual(Array.from({ length: 100 }, () => b()))
    expect(xs).not.toEqual(Array.from({ length: 100 }, () => c2()))
    for (const x of xs) {
      expect(x).toBeGreaterThanOrEqual(0)
      expect(x).toBeLessThan(1)
    }
  })

  it('xấp xỉ phân bố đều: trung bình 0.5, phương sai 1/12', () => {
    const r = mulberry32(1)
    const xs = Array.from({ length: 20000 }, () => r())
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length
    const variance = xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length
    expect(mean).toBeCloseTo(0.5, 2)
    expect(variance).toBeCloseTo(1 / 12, 2)
  })
})

describe('drawSegments', () => {
  it('một lần rút cho mỗi phân đoạn, xác định theo seed', () => {
    const d1 = drawSegments(geometry, 3)
    const d2 = drawSegments(geometry, 3)
    expect(d1.size).toBe(37)
    expect([...d1.entries()]).toEqual([...d2.entries()])
    expect(drawSegments(geometry, 4).get('1,0')).not.toEqual(d1.get('1,0'))
  })

  it('xấp xỉ chuẩn N(0, 1): trung bình ≈ 0 và độ lệch chuẩn ≈ 1', () => {
    const d = drawSegments({ rings: 8, gapRatio: 0.01, removeCenter: false }, 5)
    const xs = [...d.values()].flatMap((v) => [v.piston, v.tipA, v.tipB])
    expect(xs).toHaveLength(3 * 217)
    const mean = xs.reduce((s, v) => s + v, 0) / xs.length
    const sd = Math.sqrt(xs.reduce((s, v) => s + (v - mean) ** 2, 0) / xs.length)
    expect(Math.abs(mean)).toBeLessThan(0.12)
    expect(Math.abs(sd - 1)).toBeLessThan(0.1)
  })
})

describe('segmentWavefront', () => {
  const l = layoutFor(geometry, PX / 2)
  const draws = drawSegments(geometry, 9)
  const centre = draws.get('0,0')!

  it('toàn 0 khi không có sai số', () => {
    expect(Math.max(...segmentWavefront(N, PX, geometry, { pistonRms: 0, tiltRms: 0, seed: 1 }))).toBe(0)
  })

  it('chỉ piston: hằng số trên mỗi phân đoạn và bằng σ_p · giá trị rút', () => {
    const w = segmentWavefront(N, PX, geometry, { pistonRms: 0.1, tiltRms: 0, seed: 9 })
    expect(w[c * N + c]).toBeCloseTo(0.1 * centre.piston, 12)
    expect(w[c * N + c + 3]).toBeCloseTo(w[c * N + c], 12)
    expect(w[(c + 2) * N + c - 2]).toBeCloseTo(w[c * N + c], 12)
  })

  it('chỉ tilt: tuyến tính trong phân đoạn, độ dốc bằng σ_t · a / apothem', () => {
    const w = segmentWavefront(N, PX, geometry, { pistonRms: 0, tiltRms: 0.2, seed: 9 })
    const dx = (w[c * N + c + 4] - w[c * N + c]) / 4
    const dy = (w[(c + 4) * N + c] - w[c * N + c]) / 4
    expect(dx).toBeCloseTo((0.2 * centre.tipA) / l.apothemPx, 12)
    expect(dy).toBeCloseTo((0.2 * centre.tipB) / l.apothemPx, 12)
    expect(w[c * N + c]).toBeCloseTo(0, 12) // tâm phân đoạn: u = v = 0
  })

  it('pixel ngoài mảng bằng 0', () => {
    const w = segmentWavefront(N, PX, geometry, { pistonRms: 0.3, tiltRms: 0.3, seed: 2 })
    expect(w[2 * N + 2]).toBe(0)
    expect(w[(N - 3) * N + (N - 3)]).toBe(0)
  })
})

describe('scaleSegmentErrors', () => {
  it('nhân hai độ lệch chuẩn và giữ nguyên seed', () => {
    const s = scaleSegmentErrors({ pistonRms: 0.1, tiltRms: 0.2, seed: 5 }, 0.5)
    expect(s).toEqual({ pistonRms: 0.05, tiltRms: 0.1, seed: 5 })
  })
})
