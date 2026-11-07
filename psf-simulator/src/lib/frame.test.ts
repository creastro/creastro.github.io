import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, IMAGE_SIZE, computeFrame, lambdaOverDArcsec } from './frame'
import { ZERO_ABERRATIONS } from './zernike'

/** Số pixel có độ sáng đỏ ≥ ngưỡng, dùng đo kích thước lõi sáng. */
function brightPixels(rgba: Uint8ClampedArray, threshold: number): number {
  let count = 0
  for (let i = 0; i < rgba.length; i += 4) if (rgba[i] >= threshold) count++
  return count
}

describe('lambdaOverDArcsec', () => {
  it('λ/D của gương 1 m ở 550 nm là 0.1134″', () => {
    expect(lambdaOverDArcsec(1, 550)).toBeCloseTo(0.11345, 4)
  })

  it('tỉ lệ nghịch với đường kính và thuận với bước sóng', () => {
    expect(lambdaOverDArcsec(2, 550)).toBeCloseTo(lambdaOverDArcsec(1, 550) / 2, 12)
    expect(lambdaOverDArcsec(1, 1100)).toBeCloseTo(lambdaOverDArcsec(1, 550) * 2, 12)
  })
})

describe('computeFrame', () => {
  const frame = computeFrame(DEFAULT_PARAMS)

  it('trả ảnh RGBA đúng kích thước', () => {
    expect(frame.rgba.length).toBe(IMAGE_SIZE * IMAGE_SIZE * 4)
  })

  it('thống kê khớp công thức: bán kính Airy = 1.22 λ/D, throughput = 1 − ε² (chưa tính thanh chống)', () => {
    const clear = computeFrame({ ...DEFAULT_PARAMS, vaneCount: 0 })
    expect(clear.stats.airyRadiusArcsec).toBeCloseTo(1.22 * lambdaOverDArcsec(1, 550), 10)
    expect(clear.stats.throughput).toBeCloseTo(1 - 0.3 ** 2, 2)
    expect(clear.stats.relativePeak).toBeCloseTo(clear.stats.throughput ** 2, 12)
  })

  it('thanh chống làm giảm diện tích thu sáng', () => {
    const clear = computeFrame({ ...DEFAULT_PARAMS, vaneCount: 0 })
    expect(frame.stats.throughput).toBeLessThan(clear.stats.throughput)
  })

  it('gương lớn hơn cho lõi sáng nhỏ hơn trong cùng trường nhìn (phân giải tốt hơn)', () => {
    const small = computeFrame({ ...DEFAULT_PARAMS, diameterM: 0.5, vaneCount: 0, obstructionRatio: 0 })
    const large = computeFrame({ ...DEFAULT_PARAMS, diameterM: 2, vaneCount: 0, obstructionRatio: 0 })
    expect(brightPixels(large.rgba, 200)).toBeLessThan(brightPixels(small.rgba, 200) / 4)
  })

  it('bước sóng dài hơn làm lõi sáng to hơn', () => {
    const blue = computeFrame({ ...DEFAULT_PARAMS, wavelengthNm: 450, vaneCount: 0 })
    const red = computeFrame({ ...DEFAULT_PARAMS, wavelengthNm: 700, vaneCount: 0 })
    expect(brightPixels(red.rgba, 200)).toBeGreaterThan(brightPixels(blue.rgba, 200))
  })

  it('cảnh báo khi trường nhìn vượt vùng tính toán', () => {
    const wide = computeFrame({ ...DEFAULT_PARAMS, diameterM: 8, fovArcsec: 20 })
    expect(wide.stats.fovCovered).toBe(false)
    expect(frame.stats.fovCovered).toBe(true)
  })

  it('không quang sai: Strehl = 1 và RMS = 0', () => {
    expect(frame.stats.strehl).toBeCloseTo(1, 12)
    expect(frame.stats.wavefrontRmsWaves).toBe(0)
  })

  it('quang sai làm giảm Strehl theo Maréchal và giảm đỉnh tương đối', () => {
    const aberrated = computeFrame({
      ...DEFAULT_PARAMS,
      vaneCount: 0,
      obstructionRatio: 0,
      aberrations: { ...ZERO_ABERRATIONS, comaX: 0.06 },
    })
    expect(aberrated.stats.strehl).toBeLessThan(0.9)
    expect(Math.abs(aberrated.stats.strehl - aberrated.stats.marechalStrehl)).toBeLessThan(0.01)
    expect(aberrated.stats.relativePeak).toBeCloseTo(aberrated.stats.throughput ** 2 * aberrated.stats.strehl, 12)
  })

  it('trả ảnh xem trước pupil đúng kích thước', () => {
    expect(frame.pupilRgba.length).toBe(frame.pupilSize * frame.pupilSize * 4)
  })
})
