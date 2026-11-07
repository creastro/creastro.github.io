/**
 * Lưu và nạp cấu hình của mô phỏng ra tệp JSON.
 *
 * Tệp dùng tên trường dễ đọc, theo từng nhóm điều khiển, và giá trị thật (đơn vị SI hoặc giây cung, không phải vị trí
 * thanh trượt), nên đọc được bằng mắt và không phụ thuộc id của giao diện. Khi nạp, trường thiếu lấy giá trị mặc định,
 * trường lạ bị bỏ qua, và giá trị ngoài khoảng cho phép bị kẹp vào khoảng đó; mọi điều chỉnh được ghi lại để báo cho người dùng.
 * Chỉ tệp hỏng hẳn (không phải JSON, sai định dạng, từ phiên bản mới hơn) mới bị từ chối.
 */

import { COLORMAP_LABELS, type ColormapName } from '../lib/colormap'
import type { SimParams } from '../lib/params'
import { ZERNIKE_NAMES } from '../lib/zernike'
import { MAX_VANES, VANE_IDS, ZERNIKE_IDS, specById } from './controlSpecs'

export const SETTINGS_FORMAT = 'telescope-psf-settings'
export const SETTINGS_VERSION = 1
/** Tệp lớn hơn mức này chắc chắn không phải tệp cấu hình. */
export const MAX_SETTINGS_BYTES = 200_000

/** Trạng thái đầy đủ của giao diện: tham số mô phỏng và những thứ chỉ có trên giao diện. */
export interface UiState {
  params: SimParams
  /** Góc của cả 8 thanh trượt "Vane angle", kể cả những thanh đang ẩn. */
  vaneSlots: number[]
  /** Bật thì dùng các góc riêng; `params.vaneAnglesDeg` là phần đầu của `vaneSlots`. */
  individualVanes: boolean
  /** Có vẽ vòng tối đầu tiên lên ảnh PSF không. */
  showRing: boolean
}

/** Mọi khoá của SimParams mà tệp cấu hình xử lý; test so với DEFAULT_PARAMS để không sót khoá khi thêm tham số mới. */
export const HANDLED_PARAM_KEYS = [
  'diameterM', 'wavelengthNm', 'bandwidthNm', 'obstructionRatio', 'vaneCount', 'vaneThicknessRatio', 'vaneAngleDeg',
  'vaneAnglesDeg', 'aberrations', 'segmented', 'fovArcsec', 'dynamicRangeDecades', 'colormap',
] as const

export class SettingsError extends Error {}

const r6 = (v: number): number => Number(v.toPrecision(6))

export function serializeSettings(state: UiState, savedAt: Date = new Date()): string {
  const p = state.params
  const doc = {
    format: SETTINGS_FORMAT,
    version: SETTINGS_VERSION,
    savedAt: savedAt.toISOString(),
    mirror: { diameterM: r6(p.diameterM), wavelengthNm: r6(p.wavelengthNm), bandwidthNm: r6(p.bandwidthNm) },
    segmented: {
      enabled: p.segmented.enabled,
      rings: p.segmented.rings,
      gapRatio: r6(p.segmented.gapRatio),
      removeCenter: p.segmented.removeCenter,
      pistonRms: r6(p.segmented.pistonRms),
      tiltRms: r6(p.segmented.tiltRms),
      seed: p.segmented.seed,
    },
    vanes: {
      obstructionRatio: r6(p.obstructionRatio),
      count: p.vaneCount,
      thicknessRatio: r6(p.vaneThicknessRatio),
      rotationDeg: r6(p.vaneAngleDeg),
      individualAngles: state.individualVanes,
      anglesDeg: state.vaneSlots.map(r6),
    },
    aberrations: Object.fromEntries(ZERNIKE_NAMES.map((n) => [n, r6(p.aberrations[n])])),
    display: {
      fovArcsec: r6(p.fovArcsec),
      dynamicRangeDecades: r6(p.dynamicRangeDecades),
      colormap: p.colormap,
      markFirstDarkRing: state.showRing,
    },
  }
  return JSON.stringify(doc, null, 2) + '\n'
}

type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface ParsedSettings {
  state: UiState
  /** Điều chỉnh đã làm khi nạp (giá trị ngoài khoảng, sai kiểu), để hiển thị cho người dùng. */
  notes: string[]
}

export function parseSettings(text: string): ParsedSettings {
  if (text.length > MAX_SETTINGS_BYTES) throw new SettingsError('The file is too large to be a settings file.')
  let doc: unknown
  try {
    doc = JSON.parse(text)
  } catch {
    throw new SettingsError('The file is not valid JSON.')
  }
  if (!isRec(doc) || doc.format !== SETTINGS_FORMAT) {
    throw new SettingsError('This is not a telescope PSF settings file.')
  }
  if (typeof doc.version !== 'number' || !Number.isFinite(doc.version) || doc.version < 1) {
    throw new SettingsError('The settings file has no valid version number.')
  }
  if (doc.version > SETTINGS_VERSION) {
    throw new SettingsError(`The file was saved by a newer version of this page (version ${doc.version}).`)
  }

  const notes: string[] = []
  const section = (key: string): Rec => {
    const v = doc[key]
    if (v === undefined) return {}
    if (!isRec(v)) {
      notes.push(`"${key}" was ignored because it is not an object.`)
      return {}
    }
    return v
  }
  const num = (rec: Rec, key: string, id: string, label: string, integer = false): number => {
    const spec = specById(id)
    if (!spec) throw new Error(`Unknown control ${id}`)
    const raw = rec[key]
    if (raw === undefined) return spec.value
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      notes.push(`${label}: not a number, using ${spec.format(spec.value)}.`)
      return spec.value
    }
    const v = integer ? Math.round(raw) : raw
    const clamped = Math.min(spec.max, Math.max(spec.min, v))
    if (clamped !== v) notes.push(`${label}: ${spec.format(v)} is outside the allowed range, using ${spec.format(clamped)}.`)
    return clamped
  }
  const bool = (rec: Rec, key: string, fallback: boolean, label: string): boolean => {
    const raw = rec[key]
    if (raw === undefined) return fallback
    if (typeof raw !== 'boolean') {
      notes.push(`${label}: not true or false, using ${fallback ? 'true' : 'false'}.`)
      return fallback
    }
    return raw
  }

  const mirror = section('mirror')
  const seg = section('segmented')
  const vanes = section('vanes')
  const aberr = section('aberrations')
  const display = section('display')

  const aberrations = {} as SimParams['aberrations']
  for (const name of ZERNIKE_NAMES) aberrations[name] = num(aberr, name, ZERNIKE_IDS[name], `Aberration ${name}`)

  const count = num(vanes, 'count', 'nvane', 'Number of vanes', true)
  const individual = bool(vanes, 'individualAngles', false, 'Individual vane angles')
  const rawAngles = vanes.anglesDeg
  if (rawAngles !== undefined && !Array.isArray(rawAngles)) notes.push('Vane angles were ignored because they are not a list.')
  const slots = VANE_IDS.map((id, i) => {
    const fallback = specById(id)?.value ?? i * 45
    const v = Array.isArray(rawAngles) ? rawAngles[i] : undefined
    if (v === undefined) return fallback
    if (typeof v !== 'number' || !Number.isFinite(v)) {
      notes.push(`Vane ${i + 1} angle: not a number, using ${fallback}°.`)
      return fallback
    }
    // An angle is a direction: wrap it into [0, 360) instead of clamping. Leave it untouched when it is already there,
    // because adding and removing 360 would add rounding error to a value that was fine.
    return v >= 0 && v < 360 ? v : ((v % 360) + 360) % 360
  })
  if (Array.isArray(rawAngles) && rawAngles.length > MAX_VANES) {
    notes.push(`Only the first ${MAX_VANES} vane angles are used.`)
  }

  const colormapRaw = display.colormap
  let colormap: ColormapName = 'hot'
  if (colormapRaw !== undefined) {
    if (typeof colormapRaw === 'string' && colormapRaw in COLORMAP_LABELS) colormap = colormapRaw as ColormapName
    else notes.push('Color map: unknown name, using "hot".')
  }
  const seedRaw = seg.seed
  let seed = 1
  if (seedRaw !== undefined) {
    if (typeof seedRaw === 'number' && Number.isFinite(seedRaw)) seed = Math.min(1_000_000_000, Math.max(1, Math.trunc(seedRaw)))
    else notes.push('Random seed: not a number, using 1.')
  }

  const params: SimParams = {
    diameterM: num(mirror, 'diameterM', 'D', 'Mirror diameter'),
    wavelengthNm: num(mirror, 'wavelengthNm', 'lam', 'Wavelength'),
    bandwidthNm: num(mirror, 'bandwidthNm', 'band', 'Bandwidth'),
    obstructionRatio: num(vanes, 'obstructionRatio', 'eps', 'Central obstruction'),
    vaneCount: count,
    vaneThicknessRatio: num(vanes, 'thicknessRatio', 'tvane', 'Vane thickness'),
    vaneAngleDeg: num(vanes, 'rotationDeg', 'avane', 'Vane rotation'),
    vaneAnglesDeg: individual ? slots.slice(0, count) : null,
    aberrations,
    segmented: {
      enabled: bool(seg, 'enabled', false, 'Segmented mirror'),
      rings: num(seg, 'rings', 'seg-rings', 'Rings', true),
      gapRatio: num(seg, 'gapRatio', 'seg-gap', 'Segment gap'),
      removeCenter: bool(seg, 'removeCenter', true, 'Remove center segment'),
      pistonRms: num(seg, 'pistonRms', 'seg-piston', 'Piston error'),
      tiltRms: num(seg, 'tiltRms', 'seg-tilt', 'Tip/tilt error'),
      seed,
    },
    fovArcsec: num(display, 'fovArcsec', 'fov', 'Field of view'),
    dynamicRangeDecades: num(display, 'dynamicRangeDecades', 'range', 'Dynamic range'),
    colormap,
  }
  return {
    state: { params, vaneSlots: slots, individualVanes: individual, showRing: bool(display, 'markFirstDarkRing', false, 'Mark the first dark ring') },
    notes,
  }
}
