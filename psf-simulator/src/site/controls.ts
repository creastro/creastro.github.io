/**
 * Các điều khiển của trang: dựng thanh trượt từ đặc tả, đọc giá trị thật, và đọc hoặc áp dụng toàn bộ trạng thái
 * (dùng cho lưu và nạp cấu hình). Thanh trượt logarit lưu vị trí, nên mọi truy cập đi qua `value` và `setValue`.
 */

import { COLORMAP_LABELS, type ColormapName } from '../lib/colormap'
import type { SimParams } from '../lib/params'
import { ZERNIKE_NAMES } from '../lib/zernike'
import {
  LOG_STEPS,
  RANGE_SPECS,
  VANE_IDS,
  ZERNIKE_IDS,
  fromPosition,
  specById,
  toPosition,
  type RangeSpec,
} from './controlSpecs'
import { $, input, select } from './dom'
import type { UiState } from './settings'

function fieldHtml(s: RangeSpec): string {
  const min = s.log ? 0 : s.min
  const max = s.log ? LOG_STEPS : s.max
  const step = s.log ? 1 : s.step
  const value = s.log ? Math.round(toPosition(s, s.value)) : s.value
  return (
    `<div class="field"><label for="${s.id}">${s.label}</label>` +
    `<input id="${s.id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">` +
    `<output for="${s.id}"></output></div>`
  )
}

/** Dựng các hàng thanh trượt vào các nhóm, và các lựa chọn của bảng màu. */
export function buildControls(): void {
  for (const group of ['mirror', 'seg', 'vanes', 'vaneEach', 'zern', 'display'] as const) {
    $(`g-${group}`).innerHTML = RANGE_SPECS.filter((s) => s.group === group).map(fieldHtml).join('')
  }
  $('cmap').innerHTML = (Object.keys(COLORMAP_LABELS) as ColormapName[])
    .map((k) => `<option value="${k}"${k === 'hot' ? ' selected' : ''}>${COLORMAP_LABELS[k]}</option>`)
    .join('')
}

/** Giá trị thật của một thanh trượt (đã đổi từ vị trí nếu là thang log). */
export function value(id: string): number {
  const spec = specById(id)
  if (!spec) throw new Error(`Unknown control ${id}`)
  return fromPosition(spec, +input(id).value)
}

export function setValue(id: string, v: number): void {
  const spec = specById(id)
  if (spec) input(id).value = String(toPosition(spec, v))
}

export function syncOutputs(): void {
  document.querySelectorAll<HTMLOutputElement>('#controls output').forEach((o) => {
    const spec = specById(o.htmlFor.toString())
    if (spec) o.textContent = spec.format(value(spec.id))
  })
}

let seed = 1
export const getSeed = (): number => seed
export const setSeed = (n: number): void => {
  seed = n
}

export function readParams(): SimParams {
  const aberrations = {} as SimParams['aberrations']
  for (const name of ZERNIKE_NAMES) aberrations[name] = value(ZERNIKE_IDS[name])
  return {
    diameterM: value('D'),
    wavelengthNm: value('lam'),
    bandwidthNm: value('band'),
    obstructionRatio: value('eps'),
    vaneCount: Math.round(value('nvane')),
    vaneThicknessRatio: value('tvane'),
    vaneAngleDeg: value('avane'),
    vaneAnglesDeg: input('vane-each').checked
      ? VANE_IDS.slice(0, Math.round(value('nvane'))).map((id) => value(id))
      : null,
    aberrations,
    segmented: {
      enabled: input('seg-on').checked,
      rings: Math.round(value('seg-rings')),
      gapRatio: value('seg-gap'),
      removeCenter: input('seg-center').checked,
      pistonRms: value('seg-piston'),
      tiltRms: value('seg-tilt'),
      seed,
    },
    fovArcsec: value('fov'),
    dynamicRangeDecades: value('range'),
    colormap: select('cmap').value as ColormapName,
  }
}

/** Toàn bộ trạng thái hiện tại của giao diện, gồm cả những thanh trượt góc đang ẩn và vòng đánh dấu. */
export function readUiState(): UiState {
  return {
    params: readParams(),
    vaneSlots: VANE_IDS.map((id) => value(id)),
    individualVanes: input('vane-each').checked,
    showRing: input('showring').checked,
  }
}

/** Phần "Segmented mirror" chỉ hiện khi bật. */
export function syncSeg(): void {
  $('seg-more').hidden = !input('seg-on').checked
}

/** Góc riêng của từng thanh chống: chỉ hiện thanh trượt của những thanh đang có, và chỉ khi tuỳ chọn đang bật. */
export function syncVanes(): void {
  $('vane-more').hidden = !input('vane-each').checked
  const n = Math.round(value('nvane'))
  VANE_IDS.forEach((id, i) => {
    const field = input(id).closest<HTMLElement>('.field')
    if (field) field.hidden = i >= n
  })
}

/** Bắt đầu từ những góc mà các thanh chống đang có (cách đều, trước khi cộng góc xoay), để ảnh không nhảy. */
export function initVaneAngles(): void {
  const n = Math.max(1, Math.round(value('nvane')))
  VANE_IDS.forEach((id, i) => setValue(id, i < n ? (360 * i) / n : (45 * i) % 360))
  syncOutputs()
}

/** Bảng màu và vòng đánh dấu nằm ngoài biểu mẫu nên biểu mẫu không tự đặt lại chúng. */
export function resetDisplayControls(): void {
  select('cmap').value = 'hot'
  input('showring').checked = false
}

/** Đặt mọi điều khiển theo `state` (nạp cấu hình). Người gọi cần gọi lại phần tính toán sau đó. */
export function applyUiState(state: UiState): void {
  const p = state.params
  setValue('D', p.diameterM)
  setValue('lam', p.wavelengthNm)
  setValue('band', p.bandwidthNm)
  setValue('eps', p.obstructionRatio)
  setValue('nvane', p.vaneCount)
  setValue('tvane', p.vaneThicknessRatio)
  setValue('avane', p.vaneAngleDeg)
  for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], p.aberrations[name])
  const s = p.segmented
  input('seg-on').checked = s.enabled
  setValue('seg-rings', s.rings)
  setValue('seg-gap', s.gapRatio)
  input('seg-center').checked = s.removeCenter
  setValue('seg-piston', s.pistonRms)
  setValue('seg-tilt', s.tiltRms)
  setSeed(s.seed)
  setValue('fov', p.fovArcsec)
  setValue('range', p.dynamicRangeDecades)
  select('cmap').value = p.colormap
  input('showring').checked = state.showRing
  VANE_IDS.forEach((id, i) => setValue(id, state.vaneSlots[i]))
  input('vane-each').checked = state.individualVanes
  syncSeg()
  syncVanes()
  syncOutputs()
}
