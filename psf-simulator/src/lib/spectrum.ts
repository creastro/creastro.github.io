/** Quang phổ: màu của một bước sóng và lấy mẫu một dải sóng. */

export type Rgb = readonly [number, number, number]

/**
 * Màu gần đúng của ánh sáng đơn sắc (380–780 nm) theo xấp xỉ từng khúc phổ biến, trả về RGB trong [0, 1].
 * Kết quả được chuẩn hoá để thành phần lớn nhất bằng 1, vì độ sáng do thang log đảm nhiệm,
 * còn màu chỉ cho biết sắc độ. Ngoài khoảng nhìn thấy trả về đỏ sẫm (hồng ngoại) hoặc tím sẫm (tử ngoại).
 */
export function wavelengthToRgb(wavelengthNm: number): Rgb {
  const w = wavelengthNm
  let r = 0
  let g = 0
  let b = 0
  if (w < 440) {
    r = Math.max(0, (440 - w) / 60)
    b = 1
  } else if (w < 490) {
    g = (w - 440) / 50
    b = 1
  } else if (w < 510) {
    g = 1
    b = (510 - w) / 20
  } else if (w < 580) {
    r = (w - 510) / 70
    g = 1
  } else if (w < 645) {
    r = 1
    g = (645 - w) / 65
  } else {
    r = 1
  }
  // Gần hai đầu phổ nhìn thấy, mắt kém nhạy; giữ lại một phần nhỏ để vẫn phân biệt được hướng.
  const edge = w < 420 ? 0.3 + (0.7 * (w - 380)) / 40 : w > 700 ? 0.3 + (0.7 * (780 - w)) / 80 : 1
  const k = Math.max(0.3, Math.min(1, edge))
  const m = Math.max(r, g, b, 1e-9)
  return [(r / m) * k, (g / m) * k, (b / m) * k]
}

export interface BandSample {
  wavelengthNm: number
  /** Trọng số chuẩn hoá, tổng bằng 1. */
  weight: number
}

/** Số mẫu bước sóng khi dải sóng không bằng 0. Nhiều mẫu hơn làm ảnh mượt nhưng tốn FFT. */
export const BAND_SAMPLES = 7

/**
 * Lấy mẫu dải sóng phẳng (top-hat) rộng bandwidthNm quanh centerNm, bằng quy tắc điểm giữa.
 * Dải bằng 0 cho đúng một mẫu ở bước sóng trung tâm.
 */
export function sampleBand(centerNm: number, bandwidthNm: number): BandSample[] {
  if (!(bandwidthNm > 0)) return [{ wavelengthNm: centerNm, weight: 1 }]
  const lo = Math.max(200, centerNm - bandwidthNm / 2)
  const hi = centerNm + bandwidthNm / 2
  const out: BandSample[] = []
  for (let i = 0; i < BAND_SAMPLES; i++) {
    out.push({ wavelengthNm: lo + ((i + 0.5) / BAND_SAMPLES) * (hi - lo), weight: 1 / BAND_SAMPLES })
  }
  return out
}
