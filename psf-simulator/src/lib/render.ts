import { getLut, type ColormapName } from './colormap'
import { sampleBicubic, type PsfResult } from './psf'
import type { Rgb } from './spectrum'

export interface RenderOptions {
  /** Cạnh ảnh đầu ra, pixel. */
  size: number
  /** Nửa bề rộng trường nhìn, đơn vị λ/D. */
  halfFovLD: number
  /** Số bậc độ lớn (decade) hiển thị dưới đỉnh lý tưởng. */
  dynamicRangeDecades: number
  colormap: ColormapName
}

/** Một kênh bước sóng của ảnh đa sắc. */
export interface RenderChannel {
  psf: PsfResult
  /** Nửa trường nhìn theo λ/D của chính bước sóng này (nhỏ hơn khi λ dài, vì λ/D lớn hơn). */
  halfFovLD: number
  /** Trọng số; tổng các kênh nên bằng 1 để đỉnh lý tưởng ứng với 1. */
  weight: number
  /** Sắc độ dùng cho thang 'spectrum'; thiếu thì dùng trắng. */
  rgb?: Rgb
}

export interface ChannelRenderOptions {
  size: number
  dynamicRangeDecades: number
  colormap: ColormapName
}

/** Cường độ tối thiểu, tránh log(0). */
const FLOOR = 1e-30
const WHITE: Rgb = [1, 1, 1]

/**
 * Chuyển một hoặc nhiều PSF (mỗi kênh một bước sóng) thành ảnh RGBA theo thang logarit.
 *
 * Cường độ tổng L = Σ wᵢ Iᵢ(θ), trong đó mỗi Iᵢ được lấy mẫu tại cùng góc θ nhưng theo λ/D riêng của kênh,
 * nên vòng Airy của bước sóng dài lớn hơn và các vòng nhoè đi khi dải sóng rộng. Giá trị tô màu là
 *   v = (log10(L) + R) / R,  cắt về [0, 1],  với R = dynamicRangeDecades,
 * nên L = 1 (đỉnh lý tưởng) là sáng nhất và L = 10^−R là tối nhất. Thang log cho thấy các vòng Airy rất mờ.
 *
 * Với 'spectrum', màu mỗi pixel là sắc độ trung bình theo cường độ của các kênh, nhân với v.
 */
export function renderChannels(channels: readonly RenderChannel[], o: ChannelRenderOptions): Uint8ClampedArray {
  const out = new Uint8ClampedArray(o.size * o.size * 4)
  const spectrum = o.colormap === 'spectrum'
  const lut = o.colormap === 'spectrum' ? null : getLut(o.colormap)

  const prepared = channels.map((ch) => ({
    intensity: ch.psf.intensity,
    n: ch.psf.gridSize,
    c: ch.psf.gridSize / 2,
    scale: (2 * ch.halfFovLD * ch.psf.padFactor) / o.size,
    weight: ch.weight,
    rgb: ch.rgb ?? WHITE,
  }))

  for (let oy = 0; oy < o.size; oy++) {
    for (let ox = 0; ox < o.size; ox++) {
      let total = 0
      let cr = 0
      let cg = 0
      let cb = 0
      for (const ch of prepared) {
        const value =
          ch.weight *
          sampleBicubic(
            ch.intensity,
            ch.n,
            ch.c + (ox + 0.5 - o.size / 2) * ch.scale,
            ch.c + (oy + 0.5 - o.size / 2) * ch.scale,
          )
        total += value
        if (spectrum) {
          cr += value * ch.rgb[0]
          cg += value * ch.rgb[1]
          cb += value * ch.rgb[2]
        }
      }
      const v = Math.min(
        1,
        Math.max(0, (Math.log10(Math.max(total, FLOOR)) + o.dynamicRangeDecades) / o.dynamicRangeDecades),
      )
      const k = (oy * o.size + ox) * 4
      if (lut) {
        const idx = Math.round(v * 255) * 3
        out[k] = lut[idx]
        out[k + 1] = lut[idx + 1]
        out[k + 2] = lut[idx + 2]
      } else {
        const norm = total > 0 ? (255 * v) / total : 0
        out[k] = cr * norm
        out[k + 1] = cg * norm
        out[k + 2] = cb * norm
      }
      out[k + 3] = 255
    }
  }
  return out
}

/** Ảnh đơn sắc của một PSF: trường hợp riêng của `renderChannels` với một kênh. */
export function renderPsf(psf: PsfResult, o: RenderOptions): Uint8ClampedArray {
  return renderChannels([{ psf, halfFovLD: o.halfFovLD, weight: 1 }], o)
}
