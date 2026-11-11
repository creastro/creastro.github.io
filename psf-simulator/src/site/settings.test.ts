import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { ZERO_ABERRATIONS } from '../lib/zernike'
import { RANGE_SPECS, VANE_IDS } from './controlSpecs'
import {
  HANDLED_PARAM_KEYS,
  MAX_SETTINGS_BYTES,
  SETTINGS_FORMAT,
  SETTINGS_VERSION,
  SettingsError,
  parseSettings,
  serializeSettings,
  type UiState,
} from './settings'

const defaults: UiState = {
  params: DEFAULT_PARAMS,
  vaneSlots: VANE_IDS.map((_, i) => i * 45),
  individualVanes: false,
  showRing: false,
}

/** Một trạng thái dùng mọi điều khiển, để kiểm tra khứ hồi. */
const busy: UiState = {
  params: {
    diameterM: 6.5,
    wavelengthNm: 700,
    bandwidthNm: 120,
    obstructionRatio: 0.12,
    vaneCount: 3,
    vaneThicknessRatio: 0.008,
    vaneAngleDeg: 25,
    vaneAnglesDeg: [10.5, 130, 250.2],
    aberrations: { ...ZERO_ABERRATIONS, defocus: 0.05, comaX: -0.12, spherical: 0.03 },
    segmented: { enabled: true, rings: 3, gapRatio: 0.005, removeCenter: false, pistonRms: 0.06, tiltRms: 0.02, seed: 7 },
    fovArcsec: 0.8,
    dynamicRangeDecades: 6.5,
    colormap: 'viridis',
  },
  vaneSlots: [10.5, 130, 250.2, 135, 180, 225, 270, 315],
  individualVanes: true,
  showRing: true,
}

const edit = (mutate: (doc: Record<string, Record<string, unknown>>) => void): string => {
  const doc = JSON.parse(serializeSettings(defaults)) as Record<string, Record<string, unknown>>
  mutate(doc)
  return JSON.stringify(doc)
}

describe('khứ hồi', () => {
  it('trạng thái mặc định được lưu rồi nạp lại giống hệt, không có ghi chú', () => {
    const { state, notes } = parseSettings(serializeSettings(defaults))
    expect(state).toEqual(defaults)
    expect(notes).toEqual([])
  })

  it('trạng thái dùng mọi điều khiển được lưu rồi nạp lại giống hệt', () => {
    const { state, notes } = parseSettings(serializeSettings(busy))
    expect(state).toEqual(busy)
    expect(notes).toEqual([])
  })

  it('các trường của tệp có tên dễ đọc, có định dạng, phiên bản và thời điểm lưu', () => {
    const doc = JSON.parse(serializeSettings(busy, new Date('2026-11-07T08:00:00Z')))
    expect(doc.format).toBe(SETTINGS_FORMAT)
    expect(doc.version).toBe(SETTINGS_VERSION)
    expect(doc.savedAt).toBe('2026-11-07T08:00:00.000Z')
    expect(doc.mirror).toEqual({ diameterM: 6.5, wavelengthNm: 700, bandwidthNm: 120 })
    expect(doc.vanes.anglesDeg).toHaveLength(8)
    expect(doc.aberrations.comaX).toBe(-0.12)
    expect(doc.display.colormap).toBe('viridis')
  })

  it('làm tròn để số không dài lê thê (thanh trượt log cho giá trị như 2.9999999)', () => {
    const noisy: UiState = { ...defaults, params: { ...DEFAULT_PARAMS, fovArcsec: 2.999999999999, diameterM: 0.30000000000000004 } }
    const doc = JSON.parse(serializeSettings(noisy))
    expect(doc.display.fovArcsec).toBe(3)
    expect(doc.mirror.diameterM).toBe(0.3)
  })

  it('góc riêng chỉ có hiệu lực khi bật, và là phần đầu của 8 giá trị', () => {
    const off = parseSettings(edit((d) => (d.vanes.individualAngles = false))).state.params.vaneAnglesDeg
    expect(off).toBeNull()
    const on = parseSettings(edit((d) => { d.vanes.individualAngles = true; d.vanes.count = 2 })).state.params
    expect(on.vaneAnglesDeg).toEqual([0, 45])
  })
})

describe('tệp thiếu hoặc có trường lạ', () => {
  it('tệp chỉ có định dạng và phiên bản cho cấu hình mặc định, không ghi chú', () => {
    const { state, notes } = parseSettings(JSON.stringify({ format: SETTINGS_FORMAT, version: 1 }))
    expect(state).toEqual(defaults)
    expect(notes).toEqual([])
  })

  it('tệp một phần: trường có thì dùng, trường thiếu lấy mặc định, trường lạ bị bỏ qua', () => {
    const text = JSON.stringify({ format: SETTINGS_FORMAT, version: 1, mirror: { diameterM: 2 }, colour: 'blue', extra: { a: 1 } })
    const { state, notes } = parseSettings(text)
    expect(state.params.diameterM).toBe(2)
    expect(state.params.wavelengthNm).toBe(550)
    expect(notes).toEqual([])
  })

  it('giá trị mặc định của đặc tả điều khiển khớp DEFAULT_PARAMS (thiếu trường thì thật sự là mặc định)', () => {
    const v = (id: string) => RANGE_SPECS.find((s) => s.id === id)?.value
    expect([v('D'), v('lam'), v('band'), v('eps'), v('nvane'), v('tvane'), v('avane'), v('fov'), v('range')]).toEqual([
      DEFAULT_PARAMS.diameterM, DEFAULT_PARAMS.wavelengthNm, DEFAULT_PARAMS.bandwidthNm, DEFAULT_PARAMS.obstructionRatio,
      DEFAULT_PARAMS.vaneCount, DEFAULT_PARAMS.vaneThicknessRatio, DEFAULT_PARAMS.vaneAngleDeg, DEFAULT_PARAMS.fovArcsec,
      DEFAULT_PARAMS.dynamicRangeDecades,
    ])
    expect([v('seg-rings'), v('seg-gap'), v('seg-piston'), v('seg-tilt')]).toEqual([
      DEFAULT_PARAMS.segmented.rings, DEFAULT_PARAMS.segmented.gapRatio, DEFAULT_PARAMS.segmented.pistonRms, DEFAULT_PARAMS.segmented.tiltRms,
    ])
  })

  it('mọi khoá của SimParams đều được xử lý: thêm tham số mới mà quên lưu sẽ làm test này hỏng', () => {
    expect([...HANDLED_PARAM_KEYS].sort()).toEqual(Object.keys(DEFAULT_PARAMS).sort())
  })
})

describe('giá trị không hợp lệ', () => {
  it('giá trị ngoài khoảng bị kẹp vào khoảng và có ghi chú', () => {
    const { state, notes } = parseSettings(edit((d) => {
      d.mirror.diameterM = 500
      d.mirror.wavelengthNm = 5
      d.display.dynamicRangeDecades = -3
    }))
    expect(state.params.diameterM).toBe(40)
    expect(state.params.wavelengthNm).toBe(380)
    expect(state.params.dynamicRangeDecades).toBe(2)
    expect(notes).toHaveLength(3)
    expect(notes[0]).toContain('outside the allowed range')
  })

  it('số lượng được làm tròn thành số nguyên trong khoảng', () => {
    const { state } = parseSettings(edit((d) => {
      d.vanes.count = 3.6
      d.segmented.rings = 99
    }))
    expect(state.params.vaneCount).toBe(4)
    expect(state.params.segmented.rings).toBe(8)
  })

  it('sai kiểu dữ liệu thì dùng mặc định và có ghi chú', () => {
    const { state, notes } = parseSettings(edit((d) => {
      d.mirror.diameterM = 'big'
      d.segmented.enabled = 'yes'
      d.display.colormap = 'rainbow'
      d.segmented.seed = 'x'
    }))
    expect(state.params.diameterM).toBe(1)
    expect(state.params.segmented.enabled).toBe(false)
    expect(state.params.colormap).toBe('hot')
    expect(state.params.segmented.seed).toBe(1)
    expect(notes).toHaveLength(4)
  })

  it('NaN, Infinity và null không lọt qua', () => {
    const text = serializeSettings(defaults).replace('"diameterM": 1', '"diameterM": null')
    const { state, notes } = parseSettings(text)
    expect(state.params.diameterM).toBe(1)
    expect(notes).toHaveLength(1)
  })

  it('góc được quấn quanh 360° thay vì kẹp, và chỉ dùng tối đa 8 góc', () => {
    const { state, notes } = parseSettings(edit((d) => {
      d.vanes.anglesDeg = [-30, 370, 720, 10, 20, 30, 40, 50, 60, 70] as unknown as never
    }))
    expect(state.vaneSlots.slice(0, 4)).toEqual([330, 10, 0, 10])
    expect(state.vaneSlots).toHaveLength(8)
    expect(notes).toEqual(['Only the first 8 vane angles are used.'])
  })

  it('hạt giống ngẫu nhiên là số nguyên dương', () => {
    expect(parseSettings(edit((d) => (d.segmented.seed = 12.9))).state.params.segmented.seed).toBe(12)
    expect(parseSettings(edit((d) => (d.segmented.seed = -4))).state.params.segmented.seed).toBe(1)
  })
})

describe('tệp bị từ chối', () => {
  const reject = (text: string, message: RegExp) => {
    expect(() => parseSettings(text)).toThrow(SettingsError)
    expect(() => parseSettings(text)).toThrow(message)
  }

  it('không phải JSON', () => reject('this is not json', /not valid JSON/))
  it('JSON nhưng không phải tệp cấu hình', () => {
    reject('{"a":1}', /not a telescope PSF settings file/)
    reject('[1,2,3]', /not a telescope PSF settings file/)
    reject('null', /not a telescope PSF settings file/)
  })
  it('thiếu hoặc sai phiên bản', () => {
    reject(JSON.stringify({ format: SETTINGS_FORMAT }), /no valid version/)
    reject(JSON.stringify({ format: SETTINGS_FORMAT, version: 0 }), /no valid version/)
    reject(JSON.stringify({ format: SETTINGS_FORMAT, version: 'one' }), /no valid version/)
  })
  it('từ phiên bản mới hơn', () => reject(JSON.stringify({ format: SETTINGS_FORMAT, version: SETTINGS_VERSION + 1 }), /newer version/))
  it('quá lớn', () => reject(' '.repeat(MAX_SETTINGS_BYTES + 1), /too large/))
})
