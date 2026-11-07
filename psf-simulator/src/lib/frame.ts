/**
 * Ghép tham số vật lý của người dùng (mét, nanômét, giây cung) thành ảnh PSF.
 * Đây là lớp mỏng giữa giao diện và `computePsf` / `renderPsf`; không phụ thuộc DOM nên test được.
 */

import type { ColormapName } from './colormap'
import { ARCSEC_PER_RAD, computePsf, marechalStrehl } from './psf'
import { renderPupil, pupilViewSize } from './pupilView'
import { renderPsf } from './render'
import { ZERO_ABERRATIONS, type Aberrations } from './zernike'

export const GRID_SIZE = 512
export const PUPIL_PX = 128
export const IMAGE_SIZE = 512

export interface SimParams {
  /** Đường kính gương chính, mét. */
  diameterM: number
  /** Bước sóng, nanômét. */
  wavelengthNm: number
  /** Tỉ lệ vật cản trung tâm so với đường kính gương chính. */
  obstructionRatio: number
  vaneCount: number
  /** Độ dày thanh chống / D. */
  vaneThicknessRatio: number
  vaneAngleDeg: number
  /** Quang sai Zernike, bước sóng RMS. */
  aberrations: Aberrations
  /** Bề rộng toàn phần của trường nhìn, giây cung. */
  fovArcsec: number
  dynamicRangeDecades: number
  colormap: ColormapName
}

export const DEFAULT_PARAMS: SimParams = {
  diameterM: 1,
  wavelengthNm: 550,
  obstructionRatio: 0.3,
  vaneCount: 4,
  vaneThicknessRatio: 0.015,
  vaneAngleDeg: 0,
  aberrations: ZERO_ABERRATIONS,
  fovArcsec: 3,
  dynamicRangeDecades: 5,
  colormap: 'hot',
}

export interface FrameStats {
  /** λ/D, giây cung. */
  lambdaOverDArcsec: number
  /** Bán kính vòng tối đầu tiên của mẫu Airy, 1.22 λ/D, giây cung. */
  airyRadiusArcsec: number
  /** Nửa trường nhìn theo đơn vị λ/D. */
  halfFovLD: number
  /** false nếu trường nhìn vượt vùng tính toán (±PUPIL_PX/2 λ/D), phần ngoài bị cắt thành đen. */
  fovCovered: boolean
  /** Diện tích thu sáng so với gương tròn không che cùng đường kính. */
  throughput: number
  /** Cường độ đỉnh so với gương tròn không che cùng đường kính: throughput² × Strehl. */
  relativePeak: number
  /** Tỉ số Strehl: đỉnh PSF so với đỉnh của cùng khẩu độ không quang sai. */
  strehl: number
  /** Sai số mặt sóng RMS trên phần khẩu độ mở, bước sóng. */
  wavefrontRmsWaves: number
  /** Strehl ước lượng bằng công thức Maréchal exp(−(2π·RMS)²), để đối chiếu. */
  marechalStrehl: number
}

export interface FrameResult {
  /** Ảnh RGBA IMAGE_SIZE × IMAGE_SIZE. */
  rgba: Uint8ClampedArray
  /** Ảnh RGBA xem trước pupil, cạnh pupilSize. */
  pupilRgba: Uint8ClampedArray
  pupilSize: number
  stats: FrameStats
}

export function lambdaOverDArcsec(diameterM: number, wavelengthNm: number): number {
  return (wavelengthNm * 1e-9 * ARCSEC_PER_RAD) / diameterM
}

export function computeFrame(p: SimParams): FrameResult {
  const psf = computePsf({
    gridSize: GRID_SIZE,
    pupilDiameterPx: PUPIL_PX,
    obstructionRatio: p.obstructionRatio,
    vaneCount: p.vaneCount,
    vaneThicknessRatio: p.vaneThicknessRatio,
    vaneAngleDeg: p.vaneAngleDeg,
  }, p.aberrations)

  const ld = lambdaOverDArcsec(p.diameterM, p.wavelengthNm)
  const halfFovLD = p.fovArcsec / 2 / ld
  const rgba = renderPsf(psf, {
    size: IMAGE_SIZE,
    halfFovLD,
    dynamicRangeDecades: p.dynamicRangeDecades,
    colormap: p.colormap,
  })

  const throughput = psf.openArea / (Math.PI * (PUPIL_PX / 2) ** 2)
  return {
    rgba,
    pupilRgba: renderPupil(psf, PUPIL_PX),
    pupilSize: pupilViewSize(PUPIL_PX),
    stats: {
      lambdaOverDArcsec: ld,
      airyRadiusArcsec: 1.22 * ld,
      halfFovLD,
      fovCovered: halfFovLD <= PUPIL_PX / 2,
      throughput,
      relativePeak: throughput * throughput * psf.strehl,
      strehl: psf.strehl,
      wavefrontRmsWaves: psf.wavefrontRmsWaves,
      marechalStrehl: marechalStrehl(psf.wavefrontRmsWaves),
    },
  }
}
