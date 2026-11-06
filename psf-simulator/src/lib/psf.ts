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
import { ZERO_ABERRATIONS, buildWavefront, hasAberration, type Aberrations } from './zernike'

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
  /** Hàm khẩu độ A (n × n). */
  readonly aperture: Float64Array
  /** Mặt sóng theo bước sóng (n × n), hoặc null khi không có quang sai. */
  readonly wavefrontWaves: Float64Array | null
  /** Sai số mặt sóng RMS trên phần khẩu độ mở, sau khi trừ piston, đơn vị bước sóng. */
  readonly wavefrontRmsWaves: number
}

/** Gần đúng Maréchal cho quang sai nhỏ: S ≈ exp(−σ²) với σ = 2π · RMS (rad). */
export function marechalStrehl(rmsWaves: number): number {
  return Math.exp(-((2 * Math.PI * rmsWaves) ** 2))
}

export function computePsf(
  params: ApertureParams,
  aberrations: Aberrations = ZERO_ABERRATIONS,
): PsfResult {
  const n = params.gridSize
  const mask = createAperture(params)
  const area = openArea(mask)

  // Trường pupil U = A · exp(i · 2π · W). Phép nhân với pha không đổi |U| nên không thay đổi
  // tổng năng lượng (định lý Parseval), chỉ phân bố lại năng lượng trong ảnh.
  const wavefront = hasAberration(aberrations)
    ? buildWavefront(n, params.pupilDiameterPx, aberrations)
    : null
  const re = mask.slice()
  const im = new Float64Array(n * n)
  let rms = 0
  if (wavefront) {
    let sumW = 0
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] === 0) continue
      const phase = 2 * Math.PI * wavefront[i]
      re[i] = mask[i] * Math.cos(phase)
      im[i] = mask[i] * Math.sin(phase)
      sumW += mask[i] * wavefront[i]
    }
    const mean = sumW / area
    let sumVar = 0
    for (let i = 0; i < mask.length; i++) sumVar += mask[i] * (wavefront[i] - mean) ** 2
    rms = Math.sqrt(sumVar / area)
  }
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
    aperture: mask,
    wavefrontWaves: wavefront,
    wavefrontRmsWaves: rms,
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

/** Nội suy Catmull–Rom một chiều giữa p1 và p2 (t ∈ [0, 1]) với hai điểm lân cận p0, p3. */
function catmullRom(p0: number, p1: number, p2: number, p3: number, t: number): number {
  return (
    p1 +
    0.5 *
      t *
      (p2 - p0 + t * (2 * p0 - 5 * p1 + 4 * p2 - p3 + t * (3 * (p1 - p2) + p3 - p0)))
  )
}

/**
 * Nội suy bicubic (Catmull–Rom) cường độ. Chính xác hơn song tuyến ở lân cận các vòng tối, nơi hàm lồi
 * và nội suy tuyến tính luôn cho giá trị cao hơn thực. Kết quả âm do dao động được cắt về 0.
 * Sát biên lưới (không đủ 4 × 4 lân cận) dùng nội suy song tuyến.
 */
export function sampleBicubic(intensity: Float64Array, n: number, px: number, py: number): number {
  const x0 = Math.floor(px)
  const y0 = Math.floor(py)
  if (x0 < 1 || y0 < 1 || x0 > n - 3 || y0 > n - 3) return sampleBilinear(intensity, n, px, py)

  const tx = px - x0
  const ty = py - y0
  // Bốn hàng lân cận, mỗi hàng nội suy theo x; viết tường minh để tránh cấp phát mảng cho từng pixel.
  const base = (y0 - 1) * n + x0
  const c0 = catmullRom(intensity[base - 1], intensity[base], intensity[base + 1], intensity[base + 2], tx)
  const r1 = base + n
  const c1 = catmullRom(intensity[r1 - 1], intensity[r1], intensity[r1 + 1], intensity[r1 + 2], tx)
  const r2 = r1 + n
  const c2 = catmullRom(intensity[r2 - 1], intensity[r2], intensity[r2 + 1], intensity[r2 + 2], tx)
  const r3 = r2 + n
  const c3 = catmullRom(intensity[r3 - 1], intensity[r3], intensity[r3 + 1], intensity[r3 + 2], tx)
  return Math.max(0, catmullRom(c0, c1, c2, c3, ty))
}
