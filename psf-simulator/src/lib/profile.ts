import { airyIntensity } from './bessel'
import { sampleBicubic, type PsfResult } from './psf'

/** Một bước sóng đóng góp vào profile: PSF của nó, λ/D tính bằng giây cung, và trọng số. */
export interface ProfileChannel {
  psf: PsfResult
  lambdaOverDArcsec: number
  weight: number
}

export interface RadialProfile {
  /** Khoảng cách góc từ tâm, giây cung. */
  thetaArcsec: number[]
  /** Cường độ trung bình theo góc phương vị của PSF mô phỏng, so với đỉnh lý tưởng. */
  intensity: number[]
  /** Mẫu Airy của khẩu độ tròn không che cùng D và cùng dải sóng, để đối chiếu. */
  airy: number[]
}

const ANGLES = 64

/**
 * Profile xuyên tâm: trung bình PSF theo góc phương vị tại mỗi bán kính góc θ ∈ [0, maxArcsec].
 * Với dải sóng rộng, các kênh được cộng có trọng số tại cùng θ, mỗi kênh dùng λ/D riêng.
 * Trung bình theo phương vị làm mờ cánh sao nhiễu xạ, nên profile phản ánh nền vòng Airy tổng quát.
 *
 * Hạn chế: PSF chỉ có 4 mẫu mỗi λ/D nên nội suy bicubic có sai số tuyệt đối dưới 1% đỉnh và nâng nhẹ các
 * cực tiểu sâu (vòng tối) so với mẫu giải tích. Đủ cho đồ thị log, không dùng để đo độ sâu vòng tối.
 */
export function radialProfile(
  channels: readonly ProfileChannel[],
  maxArcsec: number,
  points = 160,
): RadialProfile {
  const thetaArcsec: number[] = []
  const intensity: number[] = []
  const airy: number[] = []

  for (let j = 0; j < points; j++) {
    const theta = (j / (points - 1)) * maxArcsec
    let sum = 0
    let ideal = 0
    for (const ch of channels) {
      const rLD = theta / ch.lambdaOverDArcsec
      ideal += ch.weight * airyIntensity(rLD)

      const { gridSize: n, padFactor, intensity: data } = ch.psf
      const rPx = rLD * padFactor
      if (rPx > n / 2 - 3) continue // ngoài vùng tính toán
      let ring = 0
      for (let a = 0; a < ANGLES; a++) {
        const angle = (2 * Math.PI * a) / ANGLES
        ring += sampleBicubic(data, n, n / 2 + rPx * Math.cos(angle), n / 2 + rPx * Math.sin(angle))
      }
      sum += (ch.weight * ring) / ANGLES
    }
    thetaArcsec.push(theta)
    intensity.push(sum)
    airy.push(ideal)
  }
  return { thetaArcsec, intensity, airy }
}
