/** Nút cấu hình có sẵn: đặt các điều khiển theo một cấu hình rồi để trang tính lại. */

import { SEGMENT_PRESETS, type SegmentPresetKey } from '../lib/segmentPresets'
import { TELESCOPE_PRESETS, type TelescopeKey } from '../lib/telescopePresets'
import { ZERNIKE_NAMES } from '../lib/zernike'
import { setValue, syncSeg, syncVanes } from './controls'
import { ZERNIKE_IDS } from './controlSpecs'
import { $, input } from './dom'

export const SEGMENT_PRESET_BUTTONS: Record<string, SegmentPresetKey> = { 'preset-jwst': 'jwst', 'preset-keck': 'keck', 'preset-91': 'rings5' }

export const TELESCOPE_BUTTONS: Record<string, TelescopeKey> = {
  'tel-hubble': 'hubble',
  'tel-vlt': 'vlt',
  'tel-jwst': 'jwst',
  'tel-keck': 'keck',
  'tel-elt': 'elt',
}

/** Gắn các nút; `onChange` được gọi sau khi điều khiển đã đổi. */
export function wirePresets(onChange: () => void): void {
  for (const [id, key] of Object.entries(SEGMENT_PRESET_BUTTONS)) {
    $(id).addEventListener('click', () => {
      const p = SEGMENT_PRESETS[key].patch
      setValue('D', p.diameterM)
      setValue('fov', p.fovArcsec)
      setValue('eps', p.obstructionRatio)
      setValue('nvane', p.vaneCount)
      setValue('seg-rings', p.segmented.rings)
      setValue('seg-gap', p.segmented.gapRatio)
      input('seg-center').checked = p.segmented.removeCenter
      input('seg-on').checked = true
      syncSeg()
      onChange()
    })
  }
  for (const [id, key] of Object.entries(TELESCOPE_BUTTONS)) {
    $(id).addEventListener('click', () => {
      const p = TELESCOPE_PRESETS[key].patch
      setValue('D', p.diameterM)
      setValue('fov', p.fovArcsec)
      setValue('eps', p.obstructionRatio)
      setValue('nvane', p.vaneCount)
      setValue('tvane', p.vaneThicknessRatio)
      setValue('avane', p.vaneAngleDeg)
      input('vane-each').checked = false
      input('seg-on').checked = p.segmented.enabled
      setValue('seg-rings', p.segmented.rings)
      setValue('seg-gap', p.segmented.gapRatio)
      input('seg-center').checked = p.segmented.removeCenter
      // Một kính lý tưởng: không quang sai, không sai số phân đoạn.
      for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], 0)
      setValue('seg-piston', 0)
      setValue('seg-tilt', 0)
      syncSeg()
      syncVanes()
      onChange()
    })
  }
}
