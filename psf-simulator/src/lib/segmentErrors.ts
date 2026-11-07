/**
 * Sai pha của từng phân đoạn gương: piston (lệch dọc trục quang) và tip/tilt (nghiêng).
 *
 * Mỗi phân đoạn j có sai số mặt sóng phẳng trên chính nó:
 *   W_j(u, v) = p_j + a_j · u + b_j · v,
 * với (u, v) = (dx, dy) / apothem là toạ độ chuẩn hoá trong phân đoạn (u, v = ±1 ở cạnh), và
 *   p_j ~ N(0, σ_p²),  a_j, b_j ~ N(0, σ_t²)   (đơn vị: bước sóng).
 * Số ngẫu nhiên lấy từ bộ sinh mulberry32 theo seed nên cùng seed cho cùng kết quả, và đổi seed là "rút lại" lô sai số.
 * Sai số này là độ dài đường quang hình học (một phân đoạn lệch s theo trục quang cho mặt sóng 2s khi phản xạ).
 * Vì vậy tính theo bước sóng nó tỉ lệ 1/λ, như các mode Zernike.
 */

import { layoutFor, listSegments, nearestSite, site, siteHasMirror, type SegmentGeometry } from './segments'

export interface SegmentErrors {
  /** Độ lệch chuẩn của piston, bước sóng. */
  pistonRms: number
  /** Độ lệch chuẩn của mỗi thành phần tip/tilt, đo bằng bước sóng tại cạnh phân đoạn. */
  tiltRms: number
  seed: number
}

export const ZERO_SEGMENT_ERRORS: SegmentErrors = { pistonRms: 0, tiltRms: 0, seed: 1 }

export function hasSegmentErrors(e: SegmentErrors): boolean {
  return e.pistonRms !== 0 || e.tiltRms !== 0
}

/** Nhân hai độ lệch chuẩn với factor (ví dụ λ₀/λ), giữ nguyên seed. */
export function scaleSegmentErrors(e: SegmentErrors, factor: number): SegmentErrors {
  return { pistonRms: e.pistonRms * factor, tiltRms: e.tiltRms * factor, seed: e.seed }
}

/** mulberry32: bộ sinh số giả ngẫu nhiên 32 bit nhỏ gọn, đủ cho mô phỏng (không dùng cho mật mã). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Số ngẫu nhiên chuẩn N(0, 1) bằng Box–Muller. */
function gaussian(rng: () => number): number {
  const u = Math.max(rng(), 1e-12)
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng())
}

export interface SegmentDraw {
  piston: number
  tipA: number
  tipB: number
}

/**
 * Rút (piston, a, b) chuẩn N(0, 1) cho từng phân đoạn theo thứ tự cố định của `listSegments`,
 * khoá bởi "q,r". Giá trị thật là các số này nhân với σ_p hoặc σ_t.
 */
export function drawSegments(g: SegmentGeometry, seed: number): Map<string, SegmentDraw> {
  const rng = mulberry32(seed)
  const out = new Map<string, SegmentDraw>()
  for (const c of listSegments(g)) {
    out.set(`${c.q},${c.r}`, { piston: gaussian(rng), tipA: gaussian(rng), tipB: gaussian(rng) })
  }
  return out
}

/**
 * Mặt sóng của sai pha phân đoạn theo bước sóng, lưới n × n (chỉ số [y * n + x]), tâm ở (n/2, n/2).
 * Pixel nằm ngoài mọi phân đoạn bằng 0.
 */
export function segmentWavefront(
  n: number,
  pupilDiameterPx: number,
  g: SegmentGeometry,
  e: SegmentErrors,
): Float64Array {
  const wave = new Float64Array(n * n)
  if (!hasSegmentErrors(e)) return wave

  const radius = pupilDiameterPx / 2
  const lattice = layoutFor(g, radius)
  const draws = drawSegments(g, e.seed)
  const c = n / 2
  const lo = Math.max(0, Math.floor(c - radius) - 1)
  const hi = Math.min(n - 1, Math.ceil(c + radius) + 1)
  const a = lattice.apothemPx

  for (let iy = lo; iy <= hi; iy++) {
    for (let ix = lo; ix <= hi; ix++) {
      const x = ix - c
      const y = iy - c
      nearestSite(lattice, x, y)
      if (!siteHasMirror(lattice)) continue
      const d = draws.get(`${site.q},${site.r}`)
      if (!d) continue
      const u = (x - site.cx) / a
      const v = (y - site.cy) / a
      wave[iy * n + ix] = e.pistonRms * d.piston + e.tiltRms * (d.tipA * u + d.tipB * v)
    }
  }
  return wave
}
