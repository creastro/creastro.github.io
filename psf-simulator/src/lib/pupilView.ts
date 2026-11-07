import type { PsfResult } from './psf'

/** Mặt sóng hiển thị trong khoảng ±RANGE_WAVES; ngoài khoảng bị cắt. */
export const RANGE_WAVES = 1

type Rgb = readonly [number, number, number]

const BLUE: Rgb = [59, 76, 192]
const NEUTRAL: Rgb = [240, 240, 240]
const RED: Rgb = [180, 4, 38]

/** Thang phân kỳ xanh–trắng–đỏ cho t ∈ [−1, 1]. */
export function divergingColor(t: number): Rgb {
  const x = Math.max(-1, Math.min(1, t))
  const end = x < 0 ? BLUE : RED
  const f = Math.abs(x)
  return [
    NEUTRAL[0] + (end[0] - NEUTRAL[0]) * f,
    NEUTRAL[1] + (end[1] - NEUTRAL[1]) * f,
    NEUTRAL[2] + (end[2] - NEUTRAL[2]) * f,
  ]
}

/** Các mức thang màu có thể chọn, bước sóng. */
const RANGE_STEPS = [0.05, 0.1, 0.25, 0.5, 1]

/**
 * Mức thang nhỏ nhất (trong RANGE_STEPS) chứa trọn mặt sóng trên phần khẩu độ mở, tối đa ±1 bước sóng.
 * Nhờ đó sai số nhỏ vẫn hiện rõ màu; mức thang được ghi dưới hình để người xem biết màu ứng với bao nhiêu bước sóng.
 */
export function chooseWavefrontRange(psf: PsfResult): number {
  if (!psf.wavefrontWaves) return RANGE_WAVES
  let peak = 0
  for (let i = 0; i < psf.aperture.length; i++) {
    if (psf.aperture[i] > 0) peak = Math.max(peak, Math.abs(psf.wavefrontWaves[i]))
  }
  return RANGE_STEPS.find((r) => r >= peak) ?? RANGE_WAVES
}

/** Cạnh ảnh xem trước pupil: pupil cộng lề 2 pixel mỗi phía. */
export function pupilViewSize(pupilDiameterPx: number): number {
  return pupilDiameterPx + 4
}

/**
 * Ảnh RGBA của pupil: màu theo mặt sóng (xanh âm, đỏ dương, trắng là 0), độ sáng theo truyền qua.
 * Nhờ vậy cùng một hình cho thấy cả hình học khẩu độ (vật cản, thanh chống) lẫn quang sai.
 */
export function renderPupil(
  psf: PsfResult,
  pupilDiameterPx: number,
  rangeWaves: number = RANGE_WAVES,
): Uint8ClampedArray {
  const n = psf.gridSize
  const size = pupilViewSize(pupilDiameterPx)
  const start = n / 2 - size / 2
  const out = new Uint8ClampedArray(size * size * 4)

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const src = (start + y) * n + (start + x)
      const a = psf.aperture[src]
      const w = psf.wavefrontWaves ? psf.wavefrontWaves[src] : 0
      const [r, g, b] = divergingColor(w / rangeWaves)
      const k = (y * size + x) * 4
      out[k] = r * a
      out[k + 1] = g * a
      out[k + 2] = b * a
      out[k + 3] = 255
    }
  }
  return out
}
