import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS } from '../lib/params'
import { SETTINGS_FILE_NAME, captionFor, imageFileName, wavelengthText } from './files'

describe('imageFileName', () => {
  it('có loại ảnh, đường kính và bước sóng, đuôi .png', () => {
    expect(imageFileName('psf', DEFAULT_PARAMS)).toBe('telescope-psf_psf_D1.00m_550nm.png')
    expect(imageFileName('aperture', DEFAULT_PARAMS)).toBe('telescope-psf_aperture_D1.00m_550nm.png')
    expect(imageFileName('profile', DEFAULT_PARAMS)).toBe('telescope-psf_profile_D1.00m_550nm.png')
  })

  it('ghi dải sóng và số phân đoạn khi có', () => {
    const p = { ...DEFAULT_PARAMS, diameterM: 6.5, bandwidthNm: 200 }
    expect(imageFileName('psf', p, 18)).toBe('telescope-psf_psf_D6.50m_450-650nm_hex18.png')
  })

  it('chỉ chứa ký tự an toàn cho tên tệp', () => {
    const p = { ...DEFAULT_PARAMS, bandwidthNm: 120, diameterM: 0.123 }
    for (const kind of ['psf', 'aperture', 'profile'] as const) {
      expect(imageFileName(kind, p, 36)).toMatch(/^[A-Za-z0-9._-]+$/)
    }
  })

  it('tên tệp cấu hình cố định, đuôi .json', () => {
    expect(SETTINGS_FILE_NAME).toBe('telescope-psf-settings.json')
  })
})

describe('wavelengthText', () => {
  it('một giá trị hoặc một dải', () => {
    expect(wavelengthText({ wavelengthNm: 550, bandwidthNm: 0 })).toBe('550 nm')
    expect(wavelengthText({ wavelengthNm: 550, bandwidthNm: 200 })).toBe('450–650 nm')
  })

  it('không đi xuống dưới 200 nm', () => {
    expect(wavelengthText({ wavelengthNm: 250, bandwidthNm: 400 })).toBe('200–450 nm')
  })
})

describe('captionFor', () => {
  const stats = { strehl: 0.853, segmentCount: 0 }

  it('ảnh PSF ghi đường kính, bước sóng, vật cản, số thanh chống, trường nhìn và Strehl', () => {
    expect(captionFor('psf', DEFAULT_PARAMS, { strehl: 1, segmentCount: 0 })).toBe(
      'D = 1.00 m · λ = 550 nm · ε = 30 % · 4 vanes · field of view 3.00″ · Strehl 1.000',
    )
  })

  it('ảnh khẩu độ và profile không ghi trường nhìn', () => {
    expect(captionFor('aperture', DEFAULT_PARAMS, stats)).not.toContain('field of view')
    expect(captionFor('profile', DEFAULT_PARAMS, stats)).not.toContain('field of view')
  })

  it('gương phân đoạn ghi số phân đoạn, và bỏ các phần bằng 0', () => {
    const p = { ...DEFAULT_PARAMS, obstructionRatio: 0, vaneCount: 0 }
    const text = captionFor('psf', p, { strehl: 0.853, segmentCount: 18 })
    expect(text).toContain('18 hexagonal segments')
    expect(text).not.toContain('ε')
    expect(text).not.toContain('vane')
  })

  it('đếm số thanh chống theo mảng góc riêng nếu có, và số ít không có "s"', () => {
    expect(captionFor('psf', { ...DEFAULT_PARAMS, vaneAnglesDeg: [10] }, stats)).toContain('1 vane ·')
    expect(captionFor('psf', { ...DEFAULT_PARAMS, vaneAnglesDeg: [10, 20, 30] }, stats)).toContain('3 vanes')
  })
})
