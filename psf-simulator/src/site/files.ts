/** Tên tệp và chú thích cho ảnh và cấu hình lưu ra. Là hàm thuần để kiểm thử được. */

import type { SimParams } from '../lib/params'

export type ImageKind = 'psf' | 'aperture' | 'profile'

export const SETTINGS_FILE_NAME = 'telescope-psf-settings.json'

/** Nhãn bước sóng: một giá trị hoặc một dải. */
export function wavelengthText(p: Pick<SimParams, 'wavelengthNm' | 'bandwidthNm'>): string {
  if (p.bandwidthNm <= 0) return `${p.wavelengthNm.toFixed(0)} nm`
  const lo = Math.max(200, p.wavelengthNm - p.bandwidthNm / 2)
  return `${lo.toFixed(0)}–${(p.wavelengthNm + p.bandwidthNm / 2).toFixed(0)} nm`
}

/** Tên tệp ảnh, ví dụ telescope-psf_aperture_D6.50m_550nm_hex18.png. Chỉ có chữ, số, dấu chấm, gạch dưới và gạch nối. */
export function imageFileName(kind: ImageKind, p: SimParams, segments = 0): string {
  const lam = p.bandwidthNm > 0 ? wavelengthText(p).replace('–', '-').replace(' nm', 'nm') : `${p.wavelengthNm.toFixed(0)}nm`
  const parts = ['telescope-psf', kind, `D${p.diameterM.toFixed(2)}m`, lam]
  if (segments > 0) parts.push(`hex${segments}`)
  return parts.join('_') + '.png'
}

export interface CaptionStats {
  strehl: number
  segmentCount: number
}

/** Dòng chú thích ghi sẵn trên ảnh, để ảnh lưu ra tự mô tả được. */
export function captionFor(kind: ImageKind, p: SimParams, s: CaptionStats): string {
  const parts = [`D = ${p.diameterM.toFixed(2)} m`, `λ = ${wavelengthText(p)}`]
  if (s.segmentCount > 0) parts.push(`${s.segmentCount} hexagonal segments`)
  if (p.obstructionRatio > 0) parts.push(`ε = ${(p.obstructionRatio * 100).toFixed(0)} %`)
  const vanes = p.vaneAnglesDeg ? p.vaneAnglesDeg.length : p.vaneCount
  if (vanes > 0) parts.push(`${vanes} vane${vanes === 1 ? '' : 's'}`)
  if (kind === 'psf') parts.push(`field of view ${p.fovArcsec.toFixed(p.fovArcsec < 10 ? 2 : 1)}″`)
  parts.push(`Strehl ${s.strehl.toFixed(3)}`)
  return parts.join(' · ')
}
