import { describe, expect, it } from 'vitest'
import { createAperture, openArea, type ApertureParams } from './aperture'
import { arrayCircumradius, layoutFor, segmentCount, type SegmentGeometry } from './segments'

const N = 256
const PX = 128
const R = PX / 2
const c = N / 2

const make = (segments: SegmentGeometry, extra: Partial<ApertureParams> = {}): ApertureParams => ({
  gridSize: N,
  pupilDiameterPx: PX,
  obstructionRatio: 0,
  vaneCount: 0,
  vaneThicknessRatio: 0,
  vaneAngleDeg: 0,
  segments,
  ...extra,
})

/** Diện tích lục giác đều có bề rộng giữa hai cạnh f: (√3/2) f². */
const hexArea = (f: number) => (Math.sqrt(3) / 2) * f * f

describe('khẩu độ phân đoạn', () => {
  for (const [rings, removeCenter] of [[1, false], [2, true], [3, true], [4, false]] as const) {
    it(`diện tích ≈ số phân đoạn × diện tích lục giác (${rings} vòng, bỏ tâm: ${removeCenter})`, () => {
      const g = { rings, gapRatio: 0.03, removeCenter }
      const f = layoutFor(g, R).fPx
      const want = segmentCount(rings, removeCenter) * hexArea(f)
      const got = openArea(createAperture(make(g)))
      expect(Math.abs(got - want) / want).toBeLessThan(0.02)
    })
  }

  it('toàn mảng nằm trong đường tròn ngoại tiếp và gần chạm biên của nó', () => {
    const m = createAperture(make({ rings: 3, gapRatio: 0.02, removeCenter: true }))
    let maxR = 0
    for (let y = 0; y < N; y++) {
      for (let x = 0; x < N; x++) if (m[y * N + x] > 0) maxR = Math.max(maxR, Math.hypot(x - c, y - c))
    }
    expect(maxR).toBeLessThan(R + 1.5)
    expect(maxR).toBeGreaterThan(R - 3)
  })

  it('bỏ phân đoạn trung tâm giảm đúng một lục giác', () => {
    const g = { rings: 2, gapRatio: 0.02, removeCenter: false }
    const full = openArea(createAperture(make(g)))
    const hole = openArea(createAperture(make({ ...g, removeCenter: true })))
    const f = layoutFor(g, R).fPx
    expect(Math.abs(full - hole - hexArea(f)) / hexArea(f)).toBeLessThan(0.03)
    // Tâm thật sự trống.
    const m = createAperture(make({ ...g, removeCenter: true }))
    expect(m[c * N + c]).toBe(0)
  })

  it('khe rộng hơn làm giảm diện tích, và khe 0 cho phân đoạn chạm nhau', () => {
    const area = (gapRatio: number) => openArea(createAperture(make({ rings: 3, gapRatio, removeCenter: true })))
    expect(area(0.08)).toBeLessThan(area(0.02))
    expect(area(0.02)).toBeLessThan(area(0))
  })

  it('đối xứng tâm (xoay 180°)', () => {
    const m = createAperture(make({ rings: 3, gapRatio: 0.03, removeCenter: true }))
    let worst = 0
    for (let y = 1; y < N; y += 3) {
      for (let x = 1; x < N; x += 3) worst = Math.max(worst, Math.abs(m[y * N + x] - m[(N - y) * N + (N - x)]))
    }
    expect(worst).toBeLessThan(1e-9)
  })

  it('giá trị luôn trong [0, 1]', () => {
    const m = createAperture(make({ rings: 4, gapRatio: 0.01, removeCenter: false }))
    expect(Math.min(...m)).toBeGreaterThanOrEqual(0)
    expect(Math.max(...m)).toBeLessThanOrEqual(1)
  })

  it('vật cản trung tâm và thanh chống vẫn che thêm trên gương phân đoạn', () => {
    const g = { rings: 3, gapRatio: 0.02, removeCenter: false }
    const base = openArea(createAperture(make(g)))
    const obs = openArea(createAperture(make(g, { obstructionRatio: 0.2 })))
    const vanes = openArea(createAperture(make(g, { vaneCount: 3, vaneThicknessRatio: 0.02 })))
    expect(obs).toBeLessThan(base)
    expect(vanes).toBeLessThan(base)
    const rObs = 0.2 * R
    const expectedObs = Math.PI * rObs * rObs
    expect(Math.abs(base - obs - expectedObs) / expectedObs).toBeLessThan(0.1)
  })

  it('không có ô gương nào nằm ngoài k vòng', () => {
    const g = { rings: 2, gapRatio: 0.02, removeCenter: false }
    const m = createAperture(make(g))
    // Điểm chắc chắn thuộc vòng thứ 3 theo hướng 0°: cách tâm 3 bước lưới.
    const l = layoutFor(g, R)
    const x = Math.round(c + 3 * l.pitchPx)
    expect(m[c * N + x]).toBe(0)
    expect(arrayCircumradius(g) * l.fPx).toBeCloseTo(R, 9)
  })
})
