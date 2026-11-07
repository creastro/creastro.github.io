/**
 * Zoom của ảnh PSF: đổi trường nhìn (giây cung) quanh ngôi sao ở tâm.
 *
 * Giới hạn tính theo λ/D của kính hiện tại: không thu hẹp quá ±1 λ/D (ảnh chỉ có 4 mẫu mỗi λ/D, hẹp hơn chỉ là nội suy)
 * và không nới quá vùng tính toán ±64 λ/D (ngoài đó ảnh bị tô đen). Hai giới hạn còn bị kẹp bởi khoảng của thanh trượt.
 */

export const ZOOM_STEP = 1.5
/** Bề rộng toàn phần nhỏ nhất của ảnh, đơn vị λ/D (±1 λ/D). */
export const MIN_FIELD_LD = 2
/** Bề rộng toàn phần lớn nhất của ảnh, đơn vị λ/D (vùng tính toán ±64 λ/D). */
export const MAX_FIELD_LD = 128
/** Bề rộng của ảnh khi "vừa khít" quanh ngôi sao: ±12 λ/D. */
export const FIT_FIELD_LD = 24

export interface FovRange {
  min: number
  max: number
}

/** Khoảng trường nhìn cho phép với λ/D = ldArcsec. */
export function zoomLimits(range: FovRange, ldArcsec: number): { lo: number; hi: number } {
  const hi = Math.min(range.max, MAX_FIELD_LD * ldArcsec)
  const lo = Math.min(hi, Math.max(range.min, MIN_FIELD_LD * ldArcsec))
  return { lo, hi }
}

const clamp = (v: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, v))

/** Nhân trường nhìn với `factor` (nhỏ hơn 1 là phóng to), kẹp vào khoảng cho phép. */
export function zoomFov(fov: number, factor: number, ldArcsec: number, range: FovRange): number {
  const { lo, hi } = zoomLimits(range, ldArcsec)
  return clamp(fov * factor, lo, hi)
}

/** Trường nhìn vừa khít ±FIT_FIELD_LD/2 quanh ngôi sao, bất kể đường kính và bước sóng. */
export function fitFov(ldArcsec: number, range: FovRange): number {
  const { lo, hi } = zoomLimits(range, ldArcsec)
  return clamp(FIT_FIELD_LD * ldArcsec, lo, hi)
}

/**
 * Hệ số nhân trường nhìn cho một sự kiện lăn chuột hoặc chụm hai ngón (Ctrl + lăn): lăn xuống hoặc chụm lại là thu nhỏ.
 * `deltaMode` là của WheelEvent (0 điểm ảnh, 1 dòng, 2 trang).
 */
export function wheelFactor(deltaY: number, deltaMode = 0): number {
  const pixels = deltaY * (deltaMode === 1 ? 16 : deltaMode === 2 ? 100 : 1)
  return Math.exp(clamp(pixels, -300, 300) * 0.002)
}
