import { describe, expect, it } from 'vitest'
import { COLORMAP_LABELS } from '../lib/colormap'
import { ZERNIKE_LABELS, ZERNIKE_NAMES } from '../lib/zernike'
import { BASICS, CONTROL_HELP, READOUT_HELP, SEGMENT_HELP, ZERNIKE_HELP, type HelpEntry } from './index'

/**
 * Ký tự chỉ có trong tiếng Việt (dấu thanh trên â/ê/ô/ă/ơ/ư, chữ đ…). Cố ý bỏ các chữ có dấu dùng chung với ngôn ngữ khác
 * như é, ã, à: tên "Maréchal" và ký hiệu Ã(θ) hợp lệ trong văn bản tiếng Anh.
 */
const VIETNAMESE = /[ạảấầẩẫậắằẳẵặẹẻẽếềểễệỉịĩọỏốồổỗộớờởỡợụủũứừửữựỳỵỷỹđơưăâêô]/i

const entries: [string, HelpEntry][] = [
  ...Object.entries(CONTROL_HELP),
  ...Object.entries(ZERNIKE_HELP),
  ...Object.entries(READOUT_HELP),
  ...Object.entries(SEGMENT_HELP),
]

describe('help entries', () => {
  it('có đủ mục cho mọi mode Zernike', () => {
    for (const name of ZERNIKE_NAMES) expect(ZERNIKE_HELP[name], name).toBeDefined()
  })

  it('mỗi mục có tiêu đề và giải thích đủ dài', () => {
    for (const [key, e] of entries) {
      expect(e.title.length, key).toBeGreaterThan(2)
      expect(e.body.length, `${key} body`).toBeGreaterThan(30)
    }
  })

  it('các thông số vật lý có công thức, công thức không rỗng', () => {
    const needFormula = ['diameter', 'wavelength', 'bandwidth', 'obstruction', 'vaneCount', 'fov', 'dynamicRange', 'defocus', 'comaX', 'spherical']
    for (const key of needFormula) {
      const e = CONTROL_HELP[key as keyof typeof CONTROL_HELP] ?? ZERNIKE_HELP[key as keyof typeof ZERNIKE_HELP]
      expect(e.formulas?.length, key).toBeGreaterThan(0)
    }
    for (const [key, e] of entries) for (const f of e.formulas ?? []) expect(f.trim().length, key).toBeGreaterThan(3)
  })

  it('toàn bộ chú thích bằng tiếng Anh, không còn dấu tiếng Việt', () => {
    for (const [key, e] of entries) {
      const text = [e.title, e.body, e.note ?? '', ...(e.formulas ?? [])].join(' ')
      expect(VIETNAMESE.test(text), key).toBe(false)
    }
  })
})

describe('segmented mirror help', () => {
  it('mỗi điều khiển của gương phân đoạn có chú thích với công thức', () => {
    for (const key of ['segmented', 'presets', 'rings', 'gap', 'removeCenter', 'pistonRms', 'tiltRms', 'newDraw'] as const) {
      expect(SEGMENT_HELP[key].formulas?.length, key).toBeGreaterThan(0)
    }
  })

  it('công thức đếm phân đoạn và Maréchal cho piston xuất hiện', () => {
    expect(SEGMENT_HELP.rings.formulas?.join(' ')).toContain('3k(k + 1) + 1')
    expect(SEGMENT_HELP.pistonRms.formulas?.join(' ')).toContain('exp[ −(2π σ_p)² ]')
  })

  it('Basics có mục về gương phân đoạn', () => {
    expect(BASICS.some((s) => s.title === 'Segmented mirrors')).toBe(true)
  })
})

describe('basics', () => {
  it('có các mục nền tảng chính và mỗi mục có nội dung', () => {
    expect(BASICS.length).toBeGreaterThanOrEqual(9)
    const titles = BASICS.map((s) => s.title.toLowerCase()).join(' | ')
    for (const word of ['fourier', 'airy', 'zernike', 'strehl', 'wavelength', 'logarithmic'.slice(0, 3)]) {
      expect(titles.includes(word) || BASICS.some((s) => s.paragraphs.join(' ').toLowerCase().includes(word)), word).toBe(true)
    }
    for (const s of BASICS) {
      expect(s.paragraphs.length, s.title).toBeGreaterThan(0)
    }
  })

  it('bằng tiếng Anh', () => {
    for (const s of BASICS) {
      expect(VIETNAMESE.test([s.title, ...s.paragraphs, ...(s.formulas ?? [])].join(' ')), s.title).toBe(false)
    }
  })

  it('công thức cốt lõi xuất hiện: PSF = |FFT|², Airy 1.22 λ/D, Maréchal', () => {
    const all = BASICS.flatMap((s) => s.formulas ?? []).join('\n')
    expect(all).toContain('|FFT(U)|²')
    expect(all).toContain('1.22 λ/D')
    expect(all).toContain('exp[ −(2πσ)² ]')
  })
})

describe('nhãn trong thư viện', () => {
  it('thang màu và Zernike có nhãn tiếng Anh', () => {
    for (const label of Object.values(COLORMAP_LABELS)) expect(VIETNAMESE.test(label), label).toBe(false)
    for (const { label } of Object.values(ZERNIKE_LABELS)) expect(VIETNAMESE.test(label), label).toBe(false)
  })
})
