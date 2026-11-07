/**
 * Ghép tham số vật lý của người dùng (mét, nanômét, giây cung) thành ảnh PSF, ảnh pupil và profile.
 * Đây là lớp mỏng giữa giao diện và các module tính toán; không phụ thuộc DOM nên test được.
 *
 * Dải sóng: mỗi mẫu bước sóng có PSF riêng (cùng khẩu độ, quang sai tỉ lệ 1/λ), được cộng có trọng số tại cùng
 * góc θ. Khi không có quang sai, mọi bước sóng dùng chung một PSF theo λ/D, chỉ khác nhau ở tỉ lệ hiển thị.
 */

import type { ApertureParams } from './aperture'
import { GRID_SIZE, IMAGE_SIZE, PUPIL_PX, lambdaOverDArcsec, type SimParams } from './params'
import { computePsf, marechalStrehl, type PsfResult } from './psf'
import { radialProfile, type RadialProfile } from './profile'
import { chooseWavefrontRange, pupilViewSize, renderPupil } from './pupilView'
import { renderChannels, type RenderChannel } from './render'
import { hasSegmentErrors, scaleSegmentErrors, type SegmentErrors } from './segmentErrors'
import { segmentCount } from './segments'
import { sampleBand, wavelengthToRgb } from './spectrum'
import { hasAberration, scaleAberrations } from './zernike'

export * from './params'

export interface FrameStats {
  /** λ/D tại bước sóng trung tâm, giây cung. */
  lambdaOverDArcsec: number
  /** Bán kính vòng tối đầu tiên của mẫu Airy, 1.22 λ/D, giây cung. */
  airyRadiusArcsec: number
  /** Nửa trường nhìn theo λ/D của bước sóng trung tâm. */
  halfFovLD: number
  /** false nếu trường nhìn vượt vùng tính toán (±PUPIL_PX/2 λ/D) ở bước sóng ngắn nhất. */
  fovCovered: boolean
  /** Diện tích thu sáng so với gương tròn không che cùng đường kính. */
  throughput: number
  /** Cường độ đỉnh so với gương tròn không che cùng đường kính: throughput² × Strehl. */
  relativePeak: number
  /** Tỉ số Strehl tại bước sóng trung tâm. */
  strehl: number
  /** Sai số mặt sóng RMS tại bước sóng trung tâm trên phần khẩu độ mở, bước sóng. */
  wavefrontRmsWaves: number
  /** Strehl ước lượng bằng công thức Maréchal exp(−(2π·RMS)²), để đối chiếu. */
  marechalStrehl: number
  /** Số mẫu bước sóng đã cộng. */
  bandSamples: number
  /** Số phân đoạn gương, 0 nếu gương là đĩa liền. */
  segmentCount: number
}

export interface FrameResult {
  /** Ảnh RGBA IMAGE_SIZE × IMAGE_SIZE. */
  rgba: Uint8ClampedArray
  /** Ảnh RGBA xem trước pupil, cạnh pupilSize. */
  pupilRgba: Uint8ClampedArray
  pupilSize: number
  /** Thang màu của ảnh pupil: màu bão hoà ở ±pupilRangeWaves. */
  pupilRangeWaves: number
  profile: RadialProfile
  stats: FrameStats
}

export function computeFrame(p: SimParams): FrameResult {
  const aperture: ApertureParams = {
    gridSize: GRID_SIZE,
    pupilDiameterPx: PUPIL_PX,
    obstructionRatio: p.obstructionRatio,
    vaneCount: p.vaneAnglesDeg ? p.vaneAnglesDeg.length : p.vaneCount,
    vaneThicknessRatio: p.vaneThicknessRatio,
    vaneAngleDeg: p.vaneAngleDeg,
    vaneAnglesDeg: p.vaneAnglesDeg ? p.vaneAnglesDeg.map((a) => a + p.vaneAngleDeg) : undefined,
    segments: p.segmented.enabled
      ? { rings: p.segmented.rings, gapRatio: p.segmented.gapRatio, removeCenter: p.segmented.removeCenter }
      : undefined,
  }
  const baseErrors: SegmentErrors = {
    pistonRms: p.segmented.pistonRms,
    tiltRms: p.segmented.tiltRms,
    seed: p.segmented.seed,
  }
  const hasErrors = p.segmented.enabled && hasSegmentErrors(baseErrors)
  const samples = sampleBand(p.wavelengthNm, p.bandwidthNm)

  // Không quang sai: PSF theo λ/D giống nhau ở mọi bước sóng, chỉ tính một lần.
  // Cả quang sai Zernike và sai pha phân đoạn là độ dài đường quang hình học nên tỉ lệ 1/λ.
  let shared: PsfResult | null = null
  const psfs = samples.map((s) => {
    if (!hasAberration(p.aberrations) && !hasErrors) return (shared ??= computePsf(aperture))
    const factor = p.wavelengthNm / s.wavelengthNm
    return computePsf(aperture, scaleAberrations(p.aberrations, factor), scaleSegmentErrors(baseErrors, factor))
  })

  // Mẫu gần bước sóng trung tâm nhất cung cấp Strehl, mặt sóng và ảnh pupil.
  let centre = 0
  samples.forEach((s, i) => {
    if (Math.abs(s.wavelengthNm - p.wavelengthNm) < Math.abs(samples[centre].wavelengthNm - p.wavelengthNm)) {
      centre = i
    }
  })
  const centrePsf = psfs[centre]

  const lds = samples.map((s) => lambdaOverDArcsec(p.diameterM, s.wavelengthNm))
  const channels: RenderChannel[] = samples.map((s, i) => ({
    psf: psfs[i],
    halfFovLD: p.fovArcsec / 2 / lds[i],
    weight: s.weight,
    rgb: wavelengthToRgb(s.wavelengthNm),
  }))
  const rgba = renderChannels(channels, {
    size: IMAGE_SIZE,
    dynamicRangeDecades: p.dynamicRangeDecades,
    colormap: p.colormap,
  })
  const profile = radialProfile(
    samples.map((s, i) => ({ psf: psfs[i], lambdaOverDArcsec: lds[i], weight: s.weight })),
    p.fovArcsec / 2,
  )

  const throughput = centrePsf.openArea / (Math.PI * (PUPIL_PX / 2) ** 2)
  const centreLd = lambdaOverDArcsec(p.diameterM, p.wavelengthNm)
  const pupilRangeWaves = chooseWavefrontRange(centrePsf)
  return {
    rgba,
    pupilRgba: renderPupil(centrePsf, PUPIL_PX, pupilRangeWaves),
    pupilSize: pupilViewSize(PUPIL_PX),
    pupilRangeWaves,
    profile,
    stats: {
      lambdaOverDArcsec: centreLd,
      airyRadiusArcsec: 1.22 * centreLd,
      halfFovLD: p.fovArcsec / 2 / centreLd,
      fovCovered: Math.max(...channels.map((c) => c.halfFovLD)) <= PUPIL_PX / 2,
      throughput,
      relativePeak: throughput * throughput * centrePsf.strehl,
      strehl: centrePsf.strehl,
      wavefrontRmsWaves: centrePsf.wavefrontRmsWaves,
      marechalStrehl: marechalStrehl(centrePsf.wavefrontRmsWaves),
      bandSamples: samples.length,
      segmentCount: p.segmented.enabled ? segmentCount(p.segmented.rings, p.segmented.removeCenter) : 0,
    },
  }
}
