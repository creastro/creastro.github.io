/**
 * Hàm khẩu độ A(x, y) của kính thiên văn: mảng 2D truyền qua ∈ [0, 1].
 *
 * Hình học: gương chính là đĩa đường kính D (hoặc một mảng phân đoạn lục giác nội tiếp trong đĩa đó, xem segments.ts);
 * gương phụ che đĩa đồng tâm đường kính ε·D;
 * mỗi thanh chống là dải chữ nhật rộng t·D bắt đầu từ tâm và kéo dài ra mép (nửa đường thẳng).
 * Pupil nằm ở tâm chỉ số (n/2, n/2); toạ độ pixel dương theo cả x (sang phải) và y (xuống dưới).
 *
 * Mép được khử răng cưa bằng lấy mẫu con SS × SS ở các pixel sát biên, nên thanh chống mảnh hơn một
 * pixel vẫn đóng góp đúng diện tích. Điều này quan trọng cho các vòng Airy mờ và cánh sao nhiễu xạ.
 * Lưới mẫu con mịn (16 × 16) giữ sai số độ rộng dải dưới ~2%; lưới thô khiến dải song song trục bị
 * lệch nhiều phần trăm vì toạ độ mẫu chỉ rơi vào các bội số cố định của bước lưới.
 */

import {
  edgeDistance,
  insideHex,
  layoutFor,
  nearestSite,
  site,
  siteHasMirror,
  validateSegments,
  type SegmentGeometry,
  type SegmentLattice,
} from './segments'

export interface ApertureParams {
  /** Kích thước lưới n (lũy thừa của 2). */
  gridSize: number
  /** Đường kính gương chính theo pixel. */
  pupilDiameterPx: number
  /** Tỉ lệ vật cản trung tâm ε = d_phụ / D, trong [0, 0.95). */
  obstructionRatio: number
  /** Số thanh chống; phân bố đều theo góc trừ khi có `vaneAnglesDeg`. */
  vaneCount: number
  /** Độ dày thanh chống tính theo D (t / D). */
  vaneThicknessRatio: number
  /** Góc của thanh chống đầu tiên, độ, đo từ trục +x (khi các thanh chia đều). */
  vaneAngleDeg: number
  /**
   * Nếu có, góc của từng thanh chống (độ, đo từ trục +x) thay cho việc chia đều theo `vaneCount` và `vaneAngleDeg`.
   * Độ dài phải bằng `vaneCount`. Các thanh có thể ở góc bất kỳ, kể cả trùng nhau hay lệch nhau không đối xứng.
   */
  vaneAnglesDeg?: readonly number[]
  /** Có mặt thì gương chính là mảng phân đoạn lục giác thay cho đĩa đặc; D là đường kính đường tròn ngoại tiếp. */
  segments?: SegmentGeometry
}

/** Số mẫu con mỗi chiều cho pixel nằm sát biên; pixel còn lại chỉ cần một điểm. */
const SS = 16
/** Gương phân đoạn có rất nhiều cạnh nên dùng lưới mẫu thưa hơn để giữ thời gian tạo mặt nạ dưới ~100 ms. */
const SS_SEGMENTED = 8
/** Pixel cách biên gần hơn khoảng này (đơn vị pixel) được lấy mẫu mịn. */
const EDGE_BAND = 1

export function validateAperture(p: ApertureParams): void {
  if (p.pupilDiameterPx < 4 || p.pupilDiameterPx > p.gridSize - 2) {
    throw new RangeError('pupilDiameterPx phải nằm trong [4, gridSize − 2]')
  }
  if (!(p.obstructionRatio >= 0 && p.obstructionRatio < 0.95)) {
    throw new RangeError('obstructionRatio phải nằm trong [0, 0.95)')
  }
  if (p.segments) validateSegments(p.segments)
  if (!Number.isInteger(p.vaneCount) || p.vaneCount < 0) {
    throw new RangeError('vaneCount phải là số nguyên không âm')
  }
  if (p.vaneAnglesDeg) {
    if (p.vaneAnglesDeg.length !== p.vaneCount) {
      throw new RangeError('vaneAnglesDeg phải có đúng vaneCount phần tử')
    }
    if (!p.vaneAnglesDeg.every((a) => Number.isFinite(a))) {
      throw new RangeError('vaneAnglesDeg phải gồm các số hữu hạn')
    }
  }
  if (!(p.vaneThicknessRatio >= 0)) {
    throw new RangeError('vaneThicknessRatio phải không âm')
  }
}

/** Hình học của pupil theo đơn vị pixel, đã chuẩn bị sẵn để kiểm tra điểm nhanh. */
interface Geometry {
  readonly radius: number
  readonly rObs: number
  readonly halfThickness: number
  readonly ux: readonly number[]
  readonly uy: readonly number[]
  /** Có mặt thì gương chính là mảng phân đoạn thay cho đĩa. */
  readonly lattice?: SegmentLattice
}

/** Điểm (x, y) tính từ tâm có truyền qua không. */
function isOpen(g: Geometry, x: number, y: number): boolean {
  const d2 = x * x + y * y
  if (g.lattice) {
    nearestSite(g.lattice, x, y)
    if (!siteHasMirror(g.lattice) || !insideHex(g.lattice, x - site.cx, y - site.cy)) return false
  } else if (d2 > g.radius * g.radius) {
    return false
  }
  if (d2 < g.rObs * g.rObs) return false
  for (let j = 0; j < g.ux.length; j++) {
    if (x * g.ux[j] + y * g.uy[j] >= 0 && Math.abs(x * g.uy[j] - y * g.ux[j]) <= g.halfThickness) {
      return false
    }
  }
  return true
}

/** Điểm có nằm trong EDGE_BAND quanh một biên nào đó (gương, vật cản, thanh chống) không. */
function nearEdge(g: Geometry, x: number, y: number): boolean {
  const r = Math.hypot(x, y)
  let outerEdge: boolean
  if (g.lattice) {
    // Gần cạnh lục giác của ô gần nhất (kể cả ô không có gương, vì cạnh của phân đoạn kề trùng với cạnh ảo đó);
    // cộng bề rộng khe vì đường biên Voronoi nằm cách mép phân đoạn nửa khe.
    nearestSite(g.lattice, x, y)
    outerEdge = edgeDistance(g.lattice, x - site.cx, y - site.cy) < EDGE_BAND + (g.lattice.pitchPx - g.lattice.fPx)
  } else {
    outerEdge = Math.abs(r - g.radius) < EDGE_BAND
  }
  if (outerEdge || Math.abs(r - g.rObs) < EDGE_BAND) return true
  for (let j = 0; j < g.ux.length; j++) {
    const along = x * g.ux[j] + y * g.uy[j]
    const across = Math.abs(x * g.uy[j] - y * g.ux[j])
    // Gần hai mép dọc, hoặc gần đầu thanh chống ở tâm.
    if (along > -EDGE_BAND && Math.abs(across - g.halfThickness) < EDGE_BAND) return true
    if (Math.abs(along) < EDGE_BAND && across < g.halfThickness + EDGE_BAND) return true
  }
  return false
}

/** Tạo mảng truyền qua n × n lưu theo hàng, chỉ số [y * n + x]. */
export function createAperture(p: ApertureParams): Float64Array {
  validateAperture(p)
  const n = p.gridSize
  const mask = new Float64Array(n * n)

  const c = n / 2
  const radius = p.pupilDiameterPx / 2
  const ux: number[] = []
  const uy: number[] = []
  for (let j = 0; j < p.vaneCount; j++) {
    const angle = p.vaneAnglesDeg
      ? (p.vaneAnglesDeg[j] * Math.PI) / 180
      : (p.vaneAngleDeg * Math.PI) / 180 + (2 * Math.PI * j) / p.vaneCount
    ux.push(Math.cos(angle))
    uy.push(Math.sin(angle))
  }
  const g: Geometry = {
    radius,
    rObs: p.obstructionRatio * radius,
    halfThickness: (p.vaneThicknessRatio * p.pupilDiameterPx) / 2,
    ux,
    uy,
    lattice: p.segments ? layoutFor(p.segments, radius) : undefined,
  }
  const samples = p.segments ? SS_SEGMENTED : SS

  const lo = Math.max(0, Math.floor(c - radius) - 1)
  const hi = Math.min(n - 1, Math.ceil(c + radius) + 1)
  const offsets: number[] = []
  for (let s = 0; s < samples; s++) offsets.push((s + 0.5) / samples - 0.5)

  for (let iy = lo; iy <= hi; iy++) {
    for (let ix = lo; ix <= hi; ix++) {
      const x0 = ix - c
      const y0 = iy - c
      if (!nearEdge(g, x0, y0)) {
        mask[iy * n + ix] = isOpen(g, x0, y0) ? 1 : 0
        continue
      }
      let open = 0
      for (const oy of offsets) {
        for (const ox of offsets) {
          if (isOpen(g, x0 + ox, y0 + oy)) open++
        }
      }
      mask[iy * n + ix] = open / (samples * samples)
    }
  }
  return mask
}

/** Tổng truyền qua ΣA, bằng diện tích mở tính theo pixel. */
export function openArea(mask: Float64Array): number {
  let sum = 0
  for (let i = 0; i < mask.length; i++) sum += mask[i]
  return sum
}

/** Khoảng hàng [from, to) chứa mọi giá trị khác 0, dùng để bỏ qua hàng 0 trong FFT. */
export function nonZeroRowRange(mask: Float64Array, n: number): [number, number] {
  let first = -1
  let last = -1
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      if (mask[y * n + x] !== 0) {
        if (first < 0) first = y
        last = y
        break
      }
    }
  }
  return first < 0 ? [0, 0] : [first, last + 1]
}
