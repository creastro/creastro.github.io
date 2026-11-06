import { getLut, type ColormapName } from './colormap'
import { sampleBicubic, type PsfResult } from './psf'

export interface RenderOptions {
  /** Cạnh ảnh đầu ra, pixel. */
  size: number
  /** Nửa bề rộng trường nhìn, đơn vị λ/D. */
  halfFovLD: number
  /** Số bậc độ lớn (decade) hiển thị dưới đỉnh lý tưởng. */
  dynamicRangeDecades: number
  colormap: ColormapName
}

/** Cường độ tối thiểu, tránh log(0). */
const FLOOR = 1e-30

/**
 * Chuyển PSF thành ảnh RGBA theo thang logarit: giá trị tô màu
 *   v = (log10(I) + R) / R,  cắt về [0, 1],  với R = dynamicRangeDecades,
 * nên I = 1 (đỉnh lý tưởng) ứng với trắng và I = 10^−R ứng với đen. Thang log cho thấy các vòng Airy
 * rất mờ mà thang tuyến tính che mất.
 */
export function renderPsf(psf: PsfResult, o: RenderOptions): Uint8ClampedArray {
  const { gridSize: n, padFactor, intensity } = psf
  const lut = getLut(o.colormap)
  const out = new Uint8ClampedArray(o.size * o.size * 4)
  const c = n / 2
  const scale = (2 * o.halfFovLD * padFactor) / o.size

  for (let oy = 0; oy < o.size; oy++) {
    const py = c + (oy + 0.5 - o.size / 2) * scale
    for (let ox = 0; ox < o.size; ox++) {
      const px = c + (ox + 0.5 - o.size / 2) * scale
      const value = sampleBicubic(intensity, n, px, py)
      const v = (Math.log10(Math.max(value, FLOOR)) + o.dynamicRangeDecades) / o.dynamicRangeDecades
      const idx = Math.round(Math.min(1, Math.max(0, v)) * 255) * 3
      const k = (oy * o.size + ox) * 4
      out[k] = lut[idx]
      out[k + 1] = lut[idx + 1]
      out[k + 2] = lut[idx + 2]
      out[k + 3] = 255
    }
  }
  return out
}
