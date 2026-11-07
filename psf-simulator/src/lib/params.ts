/**
 * Tham số của mô phỏng và các hằng số dùng chung. Tệp này cố ý nhẹ (chỉ phụ thuộc zernike.ts) để giao diện trang web
 * có thể dùng mà không kéo theo toàn bộ thư viện tính toán.
 */

import type { ColormapName } from './colormap'
import { ZERO_ABERRATIONS, type Aberrations } from './zernike'

/** Số giây cung trong một radian. */
export const ARCSEC_PER_RAD = (180 / Math.PI) * 3600

export const GRID_SIZE = 512
export const PUPIL_PX = 128
export const IMAGE_SIZE = 512

/** Gương chính phân đoạn lục giác (xem segments.ts, segmentErrors.ts). */
export interface SegmentedSettings {
  /** Bật thì gương chính là mảng phân đoạn thay cho đĩa liền. */
  enabled: boolean
  rings: number
  /** Bề rộng khe theo bề rộng phân đoạn. */
  gapRatio: number
  removeCenter: boolean
  /** Sai số piston và tip/tilt (RMS, bước sóng tại λ trung tâm) và seed của lần rút ngẫu nhiên. */
  pistonRms: number
  tiltRms: number
  seed: number
}

export const DEFAULT_SEGMENTED: SegmentedSettings = {
  enabled: false,
  rings: 2,
  gapRatio: 0.02,
  removeCenter: true,
  pistonRms: 0,
  tiltRms: 0,
  seed: 1,
}

export interface SimParams {
  /** Đường kính gương chính, mét. */
  diameterM: number
  /** Bước sóng trung tâm, nanômét. */
  wavelengthNm: number
  /** Bề rộng dải sóng phẳng quanh bước sóng trung tâm, nanômét. 0 là đơn sắc. */
  bandwidthNm: number
  /** Tỉ lệ vật cản trung tâm so với đường kính gương chính. */
  obstructionRatio: number
  vaneCount: number
  /** Độ dày thanh chống / D. */
  vaneThicknessRatio: number
  vaneAngleDeg: number
  /** Quang sai Zernike tại bước sóng trung tâm, bước sóng RMS. */
  aberrations: Aberrations
  segmented: SegmentedSettings
  /** Bề rộng toàn phần của trường nhìn, giây cung. */
  fovArcsec: number
  dynamicRangeDecades: number
  colormap: ColormapName
}

export const DEFAULT_PARAMS: SimParams = {
  diameterM: 1,
  wavelengthNm: 550,
  bandwidthNm: 0,
  obstructionRatio: 0.3,
  vaneCount: 4,
  vaneThicknessRatio: 0.015,
  vaneAngleDeg: 0,
  aberrations: ZERO_ABERRATIONS,
  segmented: DEFAULT_SEGMENTED,
  fovArcsec: 3,
  dynamicRangeDecades: 5,
  colormap: 'hot',
}

export function lambdaOverDArcsec(diameterM: number, wavelengthNm: number): number {
  return (wavelengthNm * 1e-9 * ARCSEC_PER_RAD) / diameterM
}
