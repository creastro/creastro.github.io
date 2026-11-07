/**
 * Quang sai Zernike (chuẩn hoá Noll) cho mặt sóng của khẩu độ.
 *
 * Mỗi đa thức Z_k(ρ, θ) trực chuẩn trên đĩa đơn vị: trung bình bằng 0 và RMS bằng 1. Vì vậy hệ số c_k
 * chính là sai số mặt sóng RMS của riêng mode đó, tính theo bước sóng (waves).
 * Pha đưa vào khẩu độ là  φ = 2π · Σ c_k Z_k.
 *
 * Toạ độ: ρ = r / R (R là bán kính gương chính), θ = atan2(y, x), x sang phải, y xuống dưới.
 */

export type ZernikeName =
  | 'defocus'
  | 'astigmatism0'
  | 'astigmatism45'
  | 'comaX'
  | 'comaY'
  | 'spherical'

/** Hệ số của từng mode, đơn vị: bước sóng RMS. */
export type Aberrations = Record<ZernikeName, number>

export const ZERNIKE_NAMES: readonly ZernikeName[] = [
  'defocus',
  'astigmatism0',
  'astigmatism45',
  'comaX',
  'comaY',
  'spherical',
]

export const ZERO_ABERRATIONS: Aberrations = {
  defocus: 0,
  astigmatism0: 0,
  astigmatism45: 0,
  comaX: 0,
  comaY: 0,
  spherical: 0,
}

export const ZERNIKE_LABELS: Record<ZernikeName, { label: string; noll: string }> = {
  defocus: { label: 'Mất nét (defocus)', noll: 'Z4' },
  astigmatism0: { label: 'Loạn thị 0°/90°', noll: 'Z6' },
  astigmatism45: { label: 'Loạn thị 45°', noll: 'Z5' },
  comaX: { label: 'Coma theo x', noll: 'Z8' },
  comaY: { label: 'Coma theo y', noll: 'Z7' },
  spherical: { label: 'Cầu sai (spherical)', noll: 'Z11' },
}

/** Giá trị Z_k(ρ, θ) chuẩn hoá Noll. */
export function zernike(name: ZernikeName, rho: number, theta: number): number {
  const r2 = rho * rho
  switch (name) {
    case 'defocus':
      return Math.sqrt(3) * (2 * r2 - 1)
    case 'astigmatism0':
      return Math.sqrt(6) * r2 * Math.cos(2 * theta)
    case 'astigmatism45':
      return Math.sqrt(6) * r2 * Math.sin(2 * theta)
    case 'comaX':
      return Math.sqrt(8) * (3 * r2 * rho - 2 * rho) * Math.cos(theta)
    case 'comaY':
      return Math.sqrt(8) * (3 * r2 * rho - 2 * rho) * Math.sin(theta)
    case 'spherical':
      return Math.sqrt(5) * (6 * r2 * r2 - 6 * r2 + 1)
  }
}

export function hasAberration(a: Aberrations): boolean {
  return ZERNIKE_NAMES.some((name) => a[name] !== 0)
}

/**
 * Mặt sóng W(x, y) theo bước sóng trên lưới n × n (chỉ số [y * n + x]), tâm pupil ở (n/2, n/2).
 * Các pixel ngoài hình vuông bao quanh pupil để bằng 0.
 */
export function buildWavefront(n: number, pupilDiameterPx: number, a: Aberrations): Float64Array {
  const wave = new Float64Array(n * n)
  const c = n / 2
  const radius = pupilDiameterPx / 2
  const active = ZERNIKE_NAMES.filter((name) => a[name] !== 0)
  if (active.length === 0) return wave

  const lo = Math.max(0, Math.floor(c - radius) - 1)
  const hi = Math.min(n - 1, Math.ceil(c + radius) + 1)
  for (let iy = lo; iy <= hi; iy++) {
    for (let ix = lo; ix <= hi; ix++) {
      const x = ix - c
      const y = iy - c
      const rho = Math.hypot(x, y) / radius
      const theta = Math.atan2(y, x)
      let w = 0
      for (const name of active) w += a[name] * zernike(name, rho, theta)
      wave[iy * n + ix] = w
    }
  }
  return wave
}
