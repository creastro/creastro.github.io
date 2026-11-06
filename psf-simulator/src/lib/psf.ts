/**
 * Point Spread Function (PSF) của kính thiên văn.
 *
 * Trong gần đúng Fraunhofer, trường ở mặt phẳng ảnh là biến đổi Fourier 2D của hàm khẩu độ,
 * và PSF là bình phương độ lớn của nó:  PSF = |FFT(A · e^{iφ})|² = Re² + Im².
 *
 * Lấy mẫu: pupil đường kính D chiếm `pupilDiameterPx` pixel trong lưới n × n, nên ảnh có bước
 * (λ/D) / padFactor với padFactor = n / pupilDiameterPx. Trường nhìn tổng cộng rộng n / padFactor =
 * pupilDiameterPx đơn vị λ/D, tức ±pupilDiameterPx / 2 quanh tâm (ví dụ ±64 λ/D với pupil 128 px).
 *
 * Chuẩn hoá: chia cho (ΣA)², là cường độ đỉnh của cùng khẩu độ khi không có quang sai. Nhờ đó
 * PSF lý tưởng có đỉnh đúng bằng 1 và đỉnh của PSF thật chính là tỉ số Strehl.
 */

import { createAperture, nonZeroRowRange, openArea, type ApertureParams } from './aperture'
import { fft2d } from './fft'

export const ARCSEC_PER_RAD = (180 / Math.PI) * 3600

export interface PsfResult {
  readonly gridSize: number
  /** Số mẫu trên mỗi λ/D. */
  readonly padFactor: number
  /** Cường độ đã chuẩn hoá, tâm ở chỉ số (n/2, n/2), lưu theo hàng [y * n + x]. */
  readonly intensity: Float64Array
  /** Cường độ cực đại so với đỉnh lý tưởng (tỉ số Strehl). */
  readonly strehl: number
  /** Diện tích mở của khẩu độ, tính theo pixel². */
  readonly openArea: number
}

export function computePsf(params: ApertureParams): PsfResult {
  const n = params.gridSize
  const mask = createAperture(params)
  const area = openArea(mask)

  const re = mask.slice()
  const im = new Float64Array(n * n)
  fft2d(re, im, n, { nonZeroRows: nonZeroRowRange(mask, n) })

  // Cường độ rồi dịch tâm (fftshift): tần số 0 chuyển về chỉ số (n/2, n/2).
  const intensity = new Float64Array(n * n)
  const norm = 1 / (area * area)
  const half = n / 2
  let peak = 0
  for (let y = 0; y < n; y++) {
    const ys = (y + half) % n
    for (let x = 0; x < n; x++) {
      const i = y * n + x
      const v = (re[i] * re[i] + im[i] * im[i]) * norm
      intensity[ys * n + ((x + half) % n)] = v
      if (v > peak) peak = v
    }
  }

  return {
    gridSize: n,
    padFactor: n / params.pupilDiameterPx,
    intensity,
    strehl: peak,
    openArea: area,
  }
}

/** Nội suy song tuyến cường độ tại toạ độ liên tục (px, py) theo chỉ số mảng; ngoài biên trả về 0. */
export function sampleBilinear(intensity: Float64Array, n: number, px: number, py: number): number {
  if (px < 0 || py < 0 || px > n - 1 || py > n - 1) return 0
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  const x1 = Math.min(x0 + 1, n - 1)
  const y1 = Math.min(y0 + 1, n - 1)
  const fx = px - x0
  const fy = py - y0
  const top = intensity[y0 * n + x0] * (1 - fx) + intensity[y0 * n + x1] * fx
  const bottom = intensity[y1 * n + x0] * (1 - fx) + intensity[y1 * n + x1] * fx
  return top * (1 - fy) + bottom * fy
}

/** Tỉ lệ năng lượng nằm trong bán kính radiusLD (đơn vị λ/D) quanh tâm ảnh. */
export function encircledEnergy(psf: PsfResult, radiusLD: number): number {
  const { gridSize: n, padFactor, intensity } = psf
  const c = n / 2
  const rPx = radiusLD * padFactor
  let inside = 0
  let total = 0
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = intensity[y * n + x]
      total += v
      if ((x - c) ** 2 + (y - c) ** 2 <= rPx * rPx) inside += v
    }
  }
  return inside / total
}
