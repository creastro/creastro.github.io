/**
 * Hình học gương phân đoạn lục giác (kiểu Keck, JWST, ELT).
 *
 * Các phân đoạn nằm trên lưới tam giác với toạ độ trục (q, r); phân đoạn (q, r) có tâm
 *   x = p (q + r/2),   y = p · r · √3/2,
 * trong đó p là bước lưới (khoảng cách giữa hai tâm kề nhau). Mỗi phân đoạn là lục giác đều có các cạnh phẳng hướng
 * về 6 phân đoạn lân cận (pháp tuyến ở 0°, 60°, 120° …), bề rộng giữa hai cạnh đối là f ("flat-to-flat"), và khe là
 * g = gapRatio · f, nên p = f + g. Vòng k gồm các phân đoạn có max(|q|, |r|, |q + r|) = k; k vòng cho 3k(k + 1) + 1 phân đoạn.
 *
 * Kích thước D của gương là đường kính của đường tròn ngoại tiếp toàn bộ mảng, nên f được suy ra từ D.
 */

export interface SegmentGeometry {
  /** Số vòng k ≥ 1 quanh phân đoạn trung tâm. */
  rings: number
  /** Bề rộng khe theo bề rộng phân đoạn, g / f. */
  gapRatio: number
  /** Bỏ phân đoạn trung tâm (JWST và Keck đều để trống tâm). */
  removeCenter: boolean
}

export const MAX_RINGS = 8

export function validateSegments(g: SegmentGeometry): void {
  if (!Number.isInteger(g.rings) || g.rings < 1 || g.rings > MAX_RINGS) {
    throw new RangeError(`rings phải là số nguyên trong [1, ${MAX_RINGS}]`)
  }
  if (!(g.gapRatio >= 0 && g.gapRatio < 0.5)) {
    throw new RangeError('gapRatio phải nằm trong [0, 0.5)')
  }
}

/** Số phân đoạn: 3k(k + 1) + 1, trừ một nếu bỏ phân đoạn trung tâm. */
export function segmentCount(rings: number, removeCenter: boolean): number {
  return 3 * rings * (rings + 1) + 1 - (removeCenter ? 1 : 0)
}

export const ringOf = (q: number, r: number): number => Math.max(Math.abs(q), Math.abs(r), Math.abs(q + r))

export interface SegmentCell {
  q: number
  r: number
  ring: number
}

/** Mọi ô của lưới trong k vòng (kể cả tâm), theo thứ tự cố định: vòng tăng dần, rồi góc tăng dần. */
export function listCells(rings: number): SegmentCell[] {
  const cells: (SegmentCell & { angle: number })[] = []
  for (let q = -rings; q <= rings; q++) {
    for (let r = Math.max(-rings, -q - rings); r <= Math.min(rings, -q + rings); r++) {
      const x = q + r / 2
      const y = (r * Math.sqrt(3)) / 2
      cells.push({ q, r, ring: ringOf(q, r), angle: Math.atan2(y, x) })
    }
  }
  cells.sort((a, b) => a.ring - b.ring || a.angle - b.angle)
  return cells
}

/** Các phân đoạn thật sự có gương (đã bỏ tâm nếu cần). */
export function listSegments(g: SegmentGeometry): SegmentCell[] {
  return listCells(g.rings).filter((c) => !(g.removeCenter && c.ring === 0))
}

/** Bán kính đường tròn ngoại tiếp toàn mảng, tính theo bề rộng phân đoạn f. */
export function arrayCircumradius(g: SegmentGeometry): number {
  const pitch = 1 + g.gapRatio
  const corner = 1 / Math.sqrt(3)
  let best = 0
  for (const c of listCells(g.rings)) {
    if (c.ring !== g.rings) continue
    const cx = pitch * (c.q + c.r / 2)
    const cy = (pitch * c.r * Math.sqrt(3)) / 2
    for (let k = 0; k < 6; k++) {
      const a = Math.PI / 6 + (k * Math.PI) / 3
      best = Math.max(best, Math.hypot(cx + corner * Math.cos(a), cy + corner * Math.sin(a)))
    }
  }
  return best
}

/** Lưới theo pixel, đã đặt tỉ lệ để toàn mảng nằm trong đường tròn bán kính radiusPx. */
export interface SegmentLattice {
  /** Bề rộng phân đoạn f, pixel. */
  fPx: number
  /** Bước lưới p = f + g, pixel. */
  pitchPx: number
  /** Nửa bề rộng f/2 (apothem), pixel. */
  apothemPx: number
  rings: number
  removeCenter: boolean
}

export function layoutFor(g: SegmentGeometry, radiusPx: number): SegmentLattice {
  validateSegments(g)
  const fPx = radiusPx / arrayCircumradius(g)
  return {
    fPx,
    pitchPx: fPx * (1 + g.gapRatio),
    apothemPx: fPx / 2,
    rings: g.rings,
    removeCenter: g.removeCenter,
  }
}

/** Ô lưới gần điểm nhất. Dùng chung một đối tượng tạm để không cấp phát trong vòng lặp nóng; đừng giữ tham chiếu. */
export const site = { q: 0, r: 0, ring: 0, cx: 0, cy: 0 }

const SQRT3 = Math.sqrt(3)

/** Tìm ô lưới gần (x, y) nhất bằng làm tròn toạ độ lập phương, kết quả ghi vào `site`. */
export function nearestSite(l: SegmentLattice, x: number, y: number): void {
  const rf = (2 * y) / (SQRT3 * l.pitchPx)
  const qf = x / l.pitchPx - rf / 2
  const sf = -qf - rf
  let q = Math.round(qf)
  let r = Math.round(rf)
  const s = Math.round(sf)
  const dq = Math.abs(q - qf)
  const dr = Math.abs(r - rf)
  const ds = Math.abs(s - sf)
  if (dq > dr && dq > ds) q = -r - s
  else if (dr > ds) r = -q - s
  site.q = q
  site.r = r
  site.ring = ringOf(q, r)
  site.cx = l.pitchPx * (q + r / 2)
  site.cy = (l.pitchPx * r * SQRT3) / 2
}

/** Ô lưới `site` có phải một phân đoạn thật không (trong k vòng, không phải tâm bị bỏ). */
export function siteHasMirror(l: SegmentLattice): boolean {
  return site.ring <= l.rings && !(l.removeCenter && site.ring === 0)
}

/** Điểm lệch (dx, dy) so với tâm ô có nằm trong lục giác phân đoạn không. */
export function insideHex(l: SegmentLattice, dx: number, dy: number): boolean {
  const a = l.apothemPx
  return (
    Math.abs(dx) <= a &&
    Math.abs(0.5 * dx + (SQRT3 / 2) * dy) <= a &&
    Math.abs(-0.5 * dx + (SQRT3 / 2) * dy) <= a
  )
}

/** Khoảng cách tuyệt đối nhỏ nhất từ điểm lệch (dx, dy) đến một trong ba cặp cạnh của lục giác. */
export function edgeDistance(l: SegmentLattice, dx: number, dy: number): number {
  const a = l.apothemPx
  return Math.min(
    Math.abs(a - Math.abs(dx)),
    Math.abs(a - Math.abs(0.5 * dx + (SQRT3 / 2) * dy)),
    Math.abs(a - Math.abs(-0.5 * dx + (SQRT3 / 2) * dy)),
  )
}
