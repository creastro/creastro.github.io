import { describe, expect, it } from 'vitest'
import { DEFAULT_PARAMS, DEFAULT_SEGMENTED, IMAGE_SIZE, computeFrame, lambdaOverDArcsec } from './frame'
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

  it('có profile cùng độ dài, bắt đầu ở tâm và kết thúc ở nửa trường nhìn', () => {
    const { thetaArcsec, intensity, airy } = frame.profile
    expect(thetaArcsec.length).toBe(intensity.length)
    expect(airy.length).toBe(intensity.length)
    expect(thetaArcsec[0]).toBe(0)
    expect(thetaArcsec[thetaArcsec.length - 1]).toBeCloseTo(DEFAULT_PARAMS.fovArcsec / 2, 12)
    expect(airy[0]).toBe(1)
  })
})

describe('computeFrame — dải sóng', () => {
  const clear = { ...DEFAULT_PARAMS, vaneCount: 0, obstructionRatio: 0 }

  it('đơn sắc dùng một mẫu, dải rộng dùng nhiều mẫu', () => {
    expect(computeFrame(clear).stats.bandSamples).toBe(1)
    expect(computeFrame({ ...clear, bandwidthNm: 100 }).stats.bandSamples).toBe(7)
  })

  it('dải rộng lấp đầy vòng tối đầu tiên (các vòng của các bước sóng lệch nhau)', () => {
    const ringIndex = (f: ReturnType<typeof computeFrame>) =>
      f.profile.thetaArcsec.findIndex((t) => t >= f.stats.airyRadiusArcsec)
    const mono = computeFrame(clear)
    const poly = computeFrame({ ...clear, bandwidthNm: 200 })
    const i = ringIndex(mono)
    expect(poly.profile.intensity[i]).toBeGreaterThan(mono.profile.intensity[i] * 3)
  })

  it('Airy tham chiếu của dải sóng là trung bình các mẫu Airy, nên nông hơn vòng tối đơn sắc', () => {
    const mono = computeFrame(clear)
    const poly = computeFrame({ ...clear, bandwidthNm: 200 })
    const i = mono.profile.thetaArcsec.findIndex((t) => t >= mono.stats.airyRadiusArcsec)
    expect(poly.profile.airy[i]).toBeGreaterThan(mono.profile.airy[i])
  })

  it('Strehl tại bước sóng trung tâm không phụ thuộc bề rộng dải', () => {
    const aberrations = { ...ZERO_ABERRATIONS, comaX: 0.05 }
    const mono = computeFrame({ ...clear, aberrations })
    const poly = computeFrame({ ...clear, aberrations, bandwidthNm: 100 })
    expect(poly.stats.strehl).toBeCloseTo(mono.stats.strehl, 12)
  })

  it('hệ số quang sai được định nghĩa tại bước sóng trung tâm, nên đổi λ trung tâm không đổi Strehl', () => {
    const aberrations = { ...ZERO_ABERRATIONS, spherical: 0.08 }
    const s550 = computeFrame({ ...clear, aberrations, wavelengthNm: 550 })
    const s1100 = computeFrame({ ...clear, aberrations, wavelengthNm: 1100 })
    expect(s550.stats.wavefrontRmsWaves).toBeCloseTo(0.08, 3)
    expect(s1100.stats.wavefrontRmsWaves).toBeCloseTo(0.08, 3)
    expect(s1100.stats.strehl).toBeCloseTo(s550.stats.strehl, 12)
  })

  it('trong dải sóng rộng, quang sai tỉ lệ 1/λ: bước sóng dài hơn thấy mặt sóng nhỏ hơn theo bước sóng', () => {
    // Kiểm tra gián tiếp qua Strehl: dải rộng với cầu sai lớn cho Strehl trung tâm không đổi (tính tại λ trung tâm),
    // nhưng đỉnh ảnh tổng (profile[0]) khác đơn sắc vì các kênh khác có Strehl khác nhau.
    const aberrations = { ...ZERO_ABERRATIONS, spherical: 0.15 }
    const mono = computeFrame({ ...clear, aberrations })
    const poly = computeFrame({ ...clear, aberrations, bandwidthNm: 300 })
    expect(poly.stats.strehl).toBeCloseTo(mono.stats.strehl, 12)
    expect(poly.profile.intensity[0]).not.toBeCloseTo(mono.profile.intensity[0], 3)
  })

  it('màu theo bước sóng: sao đơn sắc 450 nm có tâm thiên xanh, 650 nm thiên đỏ', () => {
    const centre = (f: ReturnType<typeof computeFrame>) => {
      const k = (IMAGE_SIZE / 2 * IMAGE_SIZE + IMAGE_SIZE / 2) * 4
      return [f.rgba[k], f.rgba[k + 1], f.rgba[k + 2]]
    }
    const blue = centre(computeFrame({ ...clear, wavelengthNm: 450, colormap: 'spectrum' }))
    const red = centre(computeFrame({ ...clear, wavelengthNm: 650, colormap: 'spectrum' }))
    expect(blue[2]).toBeGreaterThan(blue[0])
    expect(red[0]).toBeGreaterThan(red[2])
  })
})

describe('computeFrame — gương phân đoạn', () => {
  const seg = { ...DEFAULT_SEGMENTED, enabled: true, rings: 3, removeCenter: true, gapRatio: 0.02 }
  const params = { ...DEFAULT_PARAMS, vaneCount: 0, obstructionRatio: 0, segmented: seg }

  it('đĩa liền có 0 phân đoạn, gương phân đoạn có số phân đoạn đúng', () => {
    expect(computeFrame(DEFAULT_PARAMS).stats.segmentCount).toBe(0)
    expect(computeFrame(params).stats.segmentCount).toBe(36)
  })

  it('diện tích thu sáng nhỏ hơn đĩa tròn cùng đường kính (lục giác trong đường tròn, khe và lỗ ở tâm)', () => {
    const f = computeFrame(params)
    expect(f.stats.throughput).toBeLessThan(0.85)
    expect(f.stats.throughput).toBeGreaterThan(0.5)
  })

  it('piston ngẫu nhiên làm giảm Strehl theo Maréchal; không có sai số thì Strehl = 1', () => {
    expect(computeFrame(params).stats.strehl).toBeCloseTo(1, 12)
    const f = computeFrame({ ...params, segmented: { ...seg, pistonRms: 0.06 } })
    expect(f.stats.strehl).toBeLessThan(0.95)
    expect(Math.abs(f.stats.strehl - f.stats.marechalStrehl)).toBeLessThan(0.03)
  })

  it('sai số phân đoạn tỉ lệ 1/λ trong dải rộng: đỉnh ảnh đa sắc khác đơn sắc dù Strehl ở λ trung tâm giống nhau', () => {
    const noisy = { ...params, segmented: { ...seg, pistonRms: 0.1 } }
    const mono = computeFrame(noisy)
    const poly = computeFrame({ ...noisy, bandwidthNm: 300 })
    expect(poly.stats.strehl).toBeCloseTo(mono.stats.strehl, 12)
    expect(poly.profile.intensity[0]).not.toBeCloseTo(mono.profile.intensity[0], 3)
  })

  it('sai số phân đoạn bị bỏ qua khi tắt chế độ phân đoạn', () => {
    const f = computeFrame({ ...params, segmented: { ...seg, enabled: false, pistonRms: 0.3 } })
    expect(f.stats.strehl).toBeCloseTo(1, 12)
    expect(f.stats.segmentCount).toBe(0)
  })

  it('thang màu pupil co giãn theo sai số', () => {
    expect(computeFrame(params).pupilRangeWaves).toBe(1)
    const small = computeFrame({ ...params, segmented: { ...seg, pistonRms: 0.01 } }).pupilRangeWaves
    expect(small).toBeLessThan(0.25)
  })
})

describe('computeFrame — góc riêng của từng thanh chống', () => {
  it('bốn góc chia đều viết tường minh cho đúng ảnh như bốn thanh chia đều', () => {
    const auto = computeFrame(DEFAULT_PARAMS)
    const explicit = computeFrame({ ...DEFAULT_PARAMS, vaneAnglesDeg: [0, 90, 180, 270] })
    expect(explicit.stats.throughput).toBeCloseTo(auto.stats.throughput, 12)
    expect(explicit.rgba).toEqual(auto.rgba)
  })

  it('số thanh là độ dài của mảng góc, và góc xoay chung được cộng thêm vào từng thanh', () => {
    const a = computeFrame({ ...DEFAULT_PARAMS, vaneCount: 7, vaneAnglesDeg: [30, 120], vaneAngleDeg: 0 })
    const b = computeFrame({ ...DEFAULT_PARAMS, vaneCount: 2, vaneAnglesDeg: [0, 90], vaneAngleDeg: 30 })
    // Hai thanh ở 30° và 120°, dù viết bằng cách nào, cho cùng một khẩu độ.
    expect(a.stats.throughput).toBeCloseTo(b.stats.throughput, 12)
    expect(a.pupilRgba).toEqual(b.pupilRgba)
    const four = computeFrame(DEFAULT_PARAMS)
    expect(a.stats.throughput).toBeGreaterThan(four.stats.throughput) // ít thanh hơn thì che ít hơn
  })

  it('mảng góc rỗng là không có thanh chống nào', () => {
    const none = computeFrame({ ...DEFAULT_PARAMS, vaneAnglesDeg: [] })
    const zero = computeFrame({ ...DEFAULT_PARAMS, vaneCount: 0 })
    expect(none.stats.throughput).toBeCloseTo(zero.stats.throughput, 12)
  })
})

