/**
 * Hàm Bessel loại một bậc 1:  J1(x) = (1/2π) ∫₀^{2π} cos(τ − x sin τ) dτ.
 *
 * Tích phân của hàm tuần hoàn giải tích bằng quy tắc hình thang hội tụ theo cấp số nhân khi số điểm N lớn
 * hơn |x| một chút, nên chọn N = ⌈|x|⌉ + 40. Cách này đơn giản, chính xác tới ~1e-14 và không cần bảng hệ số.
 */
export function besselJ1(x: number): number {
  const ax = Math.abs(x)
  if (ax < 1e-8) return x / 2
  const n = Math.ceil(ax) + 40
  let sum = 0
  for (let k = 0; k < n; k++) {
    const tau = (2 * Math.PI * k) / n
    sum += Math.cos(tau - ax * Math.sin(tau))
  }
  const value = sum / n
  return x < 0 ? -value : value
}

/**
 * Mẫu Airy chuẩn hoá của khẩu độ tròn không che: I(r) = [2 J1(πr) / (πr)]²,
 * với r là khoảng cách góc tính theo λ/D. I(0) = 1.
 */
export function airyIntensity(rLD: number): number {
  if (rLD === 0) return 1
  const x = Math.PI * rLD
  return ((2 * besselJ1(x)) / x) ** 2
}
