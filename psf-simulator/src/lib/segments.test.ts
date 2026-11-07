import { describe, expect, it } from 'vitest'
import {
  arrayCircumradius,
  edgeDistance,
  insideHex,
  layoutFor,
  listCells,
  listSegments,
  nearestSite,
  ringOf,
  segmentCount,
  site,
  siteHasMirror,
  validateSegments,
} from './segments'

describe('segmentCount', () => {
  it('3k(k + 1) + 1 phân đoạn: 7, 19, 37, 61, 91', () => {
    expect([1, 2, 3, 4, 5].map((k) => segmentCount(k, false))).toEqual([7, 19, 37, 61, 91])
  })

  it('bỏ tâm: JWST (2 vòng) có 18 phân đoạn, Keck (3 vòng) có 36', () => {
    expect(segmentCount(2, true)).toBe(18)
    expect(segmentCount(3, true)).toBe(36)
  })
})

describe('listCells / listSegments', () => {
  it('số ô khớp công thức, không trùng, đúng vòng', () => {
    for (const k of [1, 2, 3, 5]) {
      const cells = listCells(k)
      expect(cells).toHaveLength(segmentCount(k, false))
      expect(new Set(cells.map((c) => `${c.q},${c.r}`)).size).toBe(cells.length)
      for (const c of cells) expect(c.ring).toBe(ringOf(c.q, c.r))
      // vòng k có đúng 6k ô (k ≥ 1)
      expect(cells.filter((c) => c.ring === k)).toHaveLength(6 * k)
    }
  })

  it('thứ tự cố định: vòng tăng dần', () => {
    const rings = listCells(3).map((c) => c.ring)
    expect(rings).toEqual([...rings].sort((a, b) => a - b))
  })

  it('bỏ tâm loại đúng một ô', () => {
    expect(listSegments({ rings: 2, gapRatio: 0.01, removeCenter: true })).toHaveLength(18)
    expect(listSegments({ rings: 2, gapRatio: 0.01, removeCenter: false })).toHaveLength(19)
  })
})

describe('arrayCircumradius', () => {
  it('1 vòng, không khe: góc ngoài cùng ở √((1 + 1/2)² + 1/12) bề rộng phân đoạn', () => {
    expect(arrayCircumradius({ rings: 1, gapRatio: 0, removeCenter: false })).toBeCloseTo(Math.sqrt(2.25 + 1 / 12), 12)
  })

  it('tăng theo số vòng và theo khe', () => {
    const r = (rings: number, gap: number) => arrayCircumradius({ rings, gapRatio: gap, removeCenter: false })
    expect(r(2, 0)).toBeGreaterThan(r(1, 0))
    expect(r(3, 0.05)).toBeGreaterThan(r(3, 0))
  })
})

describe('layoutFor', () => {
  const g = { rings: 3, gapRatio: 0.04, removeCenter: true }
  const l = layoutFor(g, 64)

  it('bước lưới bằng f + khe và apothem bằng f/2', () => {
    expect(l.pitchPx).toBeCloseTo(l.fPx * 1.04, 12)
    expect(l.apothemPx).toBeCloseTo(l.fPx / 2, 12)
  })

  it('toàn mảng nằm vừa trong đường tròn bán kính 64 px', () => {
    expect(arrayCircumradius(g) * l.fPx).toBeCloseTo(64, 9)
  })
})

describe('nearestSite / insideHex / edgeDistance', () => {
  const l = layoutFor({ rings: 2, gapRatio: 0.02, removeCenter: false }, 64)

  it('gốc toạ độ thuộc ô trung tâm và nằm trong phân đoạn', () => {
    nearestSite(l, 0, 0)
    expect([site.q, site.r, site.ring]).toEqual([0, 0, 0])
    expect(insideHex(l, 0, 0)).toBe(true)
  })

  it('tâm ô lân cận ở đúng toạ độ lưới và cách tâm một bước lưới', () => {
    nearestSite(l, l.pitchPx, 0)
    expect([site.q, site.r]).toEqual([1, 0])
    expect(Math.hypot(site.cx, site.cy)).toBeCloseTo(l.pitchPx, 9)
    nearestSite(l, l.pitchPx * 0.5, l.pitchPx * Math.sqrt(3) / 2)
    expect([site.q, site.r]).toEqual([0, 1])
  })

  it('lục giác có 6 cạnh ở apothem f/2 và 6 góc ở bán kính f/√3', () => {
    const a = l.apothemPx
    expect(insideHex(l, a - 1e-9, 0)).toBe(true)
    expect(insideHex(l, a + 1e-6, 0)).toBe(false)
    const R = l.fPx / Math.sqrt(3)
    for (let k = 0; k < 6; k++) {
      const ang = Math.PI / 6 + (k * Math.PI) / 3
      expect(insideHex(l, (R - 1e-6) * Math.cos(ang), (R - 1e-6) * Math.sin(ang))).toBe(true)
      expect(insideHex(l, (R + 1e-6) * Math.cos(ang), (R + 1e-6) * Math.sin(ang))).toBe(false)
    }
  })

  it('khoảng cách tới cạnh bằng 0 trên cạnh và apothem ở tâm', () => {
    expect(edgeDistance(l, l.apothemPx, 0)).toBeCloseTo(0, 12)
    expect(edgeDistance(l, 0, 0)).toBeCloseTo(l.apothemPx, 12)
  })

  it('siteHasMirror: ngoài k vòng và tâm bị bỏ thì không có gương', () => {
    nearestSite(l, 2.2 * l.pitchPx * 2, 0)
    expect(siteHasMirror(l)).toBe(false)
    const hole = layoutFor({ rings: 2, gapRatio: 0.02, removeCenter: true }, 64)
    nearestSite(hole, 0, 0)
    expect(siteHasMirror(hole)).toBe(false)
    nearestSite(hole, hole.pitchPx, 0)
    expect(siteHasMirror(hole)).toBe(true)
  })
})

describe('validateSegments', () => {
  it('từ chối số vòng hoặc khe không hợp lệ', () => {
    expect(() => validateSegments({ rings: 0, gapRatio: 0, removeCenter: false })).toThrow(RangeError)
    expect(() => validateSegments({ rings: 1.5, gapRatio: 0, removeCenter: false })).toThrow(RangeError)
    expect(() => validateSegments({ rings: 99, gapRatio: 0, removeCenter: false })).toThrow(RangeError)
    expect(() => validateSegments({ rings: 2, gapRatio: 0.6, removeCenter: false })).toThrow(RangeError)
    expect(() => validateSegments({ rings: 2, gapRatio: -0.1, removeCenter: false })).toThrow(RangeError)
  })
})
