/**
 * Đặc tả các điều khiển của trang: id, nhãn, khoảng giá trị và cách hiển thị. Là dữ liệu thuần (không DOM) để
 * trang web và test kiểm tra nội dung giải tích dùng chung, nên id điều khiển không thể lệch khỏi help.js.
 */

import { ZERNIKE_LABELS, ZERNIKE_NAMES, type ZernikeName } from '../lib/zernike'

export type ControlGroup = 'mirror' | 'seg' | 'vanes' | 'vaneEach' | 'zern' | 'display'

export interface RangeSpec {
  id: string
  group: ControlGroup
  /** HTML được phép (chỉ dùng ký tự và thẻ đơn giản). */
  label: string
  min: number
  max: number
  step: number
  value: number
  /** Thanh trượt theo thang logarit: hữu ích cho đại lượng trải nhiều bậc độ lớn. */
  log?: boolean
  format: (v: number) => string
}

/** Số bước của thanh trượt logarit: giá trị = min · (max / min)^(vị trí / LOG_STEPS). */
export const LOG_STEPS = 10000

export function toPosition(spec: Pick<RangeSpec, 'min' | 'max' | 'log'>, value: number): number {
  if (!spec.log) return value
  return (Math.log(value / spec.min) / Math.log(spec.max / spec.min)) * LOG_STEPS
}

export function fromPosition(spec: Pick<RangeSpec, 'min' | 'max' | 'log'>, position: number): number {
  if (!spec.log) return position
  return spec.min * (spec.max / spec.min) ** (position / LOG_STEPS)
}

const signed = (v: number): string => `${v < 0 ? '−' : v > 0 ? '+' : ''}${Math.abs(v).toFixed(3)} λ`

/** Id của thanh trượt từng mode Zernike. */
export const ZERNIKE_IDS: Record<ZernikeName, string> = {
  defocus: 'z-defocus',
  astigmatism0: 'z-ast0',
  astigmatism45: 'z-ast45',
  comaX: 'z-comax',
  comaY: 'z-comay',
  spherical: 'z-sph',
}

/** Số thanh chống tối đa, và id thanh trượt góc riêng của từng thanh (va1 … va8). */
export const MAX_VANES = 8
export const VANE_IDS: readonly string[] = Array.from({ length: MAX_VANES }, (_, i) => `va${i + 1}`)

const vaneAngleSpecs: RangeSpec[] = VANE_IDS.map((id, i) => ({
  id,
  group: 'vaneEach',
  label: `Vane ${i + 1} angle`,
  min: 0,
  max: 360,
  step: 0.1,
  value: i * 45,
  format: (v) => `${v.toFixed(1)}°`,
}))

const zernikeSpecs: RangeSpec[] = ZERNIKE_NAMES.map((name) => ({
  id: ZERNIKE_IDS[name],
  group: 'zern',
  label: `${ZERNIKE_LABELS[name].label} (${ZERNIKE_LABELS[name].noll})`,
  min: -0.5,
  max: 0.5,
  step: 0.005,
  value: 0,
  format: signed,
}))

export const RANGE_SPECS: readonly RangeSpec[] = [
  { id: 'D', group: 'mirror', label: 'Mirror diameter D', min: 0.1, max: 10, step: 0.01, value: 1, log: true, format: (v) => `${v.toFixed(2)} m` },
  { id: 'lam', group: 'mirror', label: 'Center wavelength λ', min: 380, max: 1000, step: 5, value: 550, format: (v) => `${v.toFixed(0)} nm` },
  { id: 'band', group: 'mirror', label: 'Bandwidth Δλ', min: 0, max: 300, step: 5, value: 0, format: (v) => (v === 0 ? 'single λ' : `${v.toFixed(0)} nm`) },

  { id: 'seg-rings', group: 'seg', label: 'Rings k', min: 1, max: 5, step: 1, value: 2, format: (v) => String(v) },
  { id: 'seg-gap', group: 'seg', label: 'Gap between segments', min: 0, max: 0.1, step: 0.001, value: 0.02, format: (v) => `${(v * 100).toFixed(1)} %` },
  { id: 'seg-piston', group: 'seg', label: 'Piston error (RMS)', min: 0, max: 0.3, step: 0.005, value: 0, format: (v) => `${v.toFixed(3)} λ` },
  { id: 'seg-tilt', group: 'seg', label: 'Tip/tilt error (RMS)', min: 0, max: 0.3, step: 0.005, value: 0, format: (v) => `${v.toFixed(3)} λ` },

  { id: 'eps', group: 'vanes', label: 'Central obstruction ε', min: 0, max: 0.7, step: 0.01, value: 0.3, format: (v) => `${(v * 100).toFixed(0)} % of D` },
  { id: 'nvane', group: 'vanes', label: 'Spider vanes N', min: 0, max: 8, step: 1, value: 4, format: (v) => String(v) },
  { id: 'tvane', group: 'vanes', label: 'Vane thickness t', min: 0.002, max: 0.05, step: 0.001, value: 0.015, format: (v) => `${(v * 100).toFixed(1)} % of D` },
  { id: 'avane', group: 'vanes', label: 'Vane rotation φ₀', min: 0, max: 180, step: 1, value: 0, format: (v) => `${v.toFixed(0)}°` },
  ...vaneAngleSpecs,

  ...zernikeSpecs,

  { id: 'fov', group: 'display', label: 'Field of view', min: 0.2, max: 30, step: 0.1, value: 3, log: true, format: (v) => `${v.toFixed(v < 10 ? 2 : 1)}″` },
  { id: 'range', group: 'display', label: 'Dynamic range', min: 2, max: 8, step: 0.5, value: 5, format: (v) => `${v.toFixed(1)} decades` },
]

/** Điều khiển không phải thanh trượt (công tắc, danh sách, nút). */
export const OTHER_CONTROL_IDS = [
  'seg-on',
  'seg-center',
  'seg-draw',
  'vane-each',
  'preset-jwst',
  'preset-keck',
  'preset-91',
  'cmap',
  'showring',
  'clear-zern',
  'reset',
] as const

/** Các dòng số liệu dẫn xuất: khoá, nhãn, và chủ đề giải thích khi bấm vào tên. */
export const READ_ROWS = [
  ['ld', 'λ/D', 'ld'],
  ['airy', 'First dark ring 1.22 λ/D', 'airy'],
  ['area', 'Light-collecting area', 'area'],
  ['strehl', 'Strehl ratio', 'strehl'],
  ['rms', 'Wavefront error (RMS)', 'wavefront'],
  ['marechal', 'Strehl from Maréchal', 'strehl'],
  ['peak', 'Peak vs. clear circle', 'relpeak'],
  ['segs', 'Mirror segments', 'seg'],
  ['samples', 'Wavelength samples', 'band'],
  ['time', 'Compute time', 'numerics'],
] as const

/** Id tĩnh mà mã trang cần có trong index.html. */
export const REQUIRED_IDS = [
  'controls',
  'g-mirror',
  'g-seg',
  'g-vanes',
  'g-vaneEach',
  'vane-more',
  'g-zern',
  'g-display',
  'seg-more',
  'read',
  'psf',
  'pupil',
  'profile',
  'stats',
  'pupil-stats',
  'warn',
  't-psf',
  't-pupil',
  't-profile',
  'pb-min',
  'pb-max',
] as const

export const specById = (id: string): RangeSpec | undefined => RANGE_SPECS.find((s) => s.id === id)
