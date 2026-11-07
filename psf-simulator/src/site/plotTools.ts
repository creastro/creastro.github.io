/** Công cụ thuần cho việc vẽ đồ thị: màu, phông, bước chia và nhãn. Không phụ thuộc DOM nên kiểm thử được. */

export const COLOR = {
  text: '#b3bfd8',
  grid: 'rgba(255,255,255,.08)',
  frame: 'rgba(255,255,255,.25)',
  accent: '#8fe3ff',
  white: '#edf2ff',
  grey: 'rgba(179,191,216,.8)',
}
export const FONT = '12px system-ui, sans-serif'

/** Màu nền của ảnh lưu ra: cùng màu nền của trang, để ảnh đọc được trên mọi nền. */
export const EXPORT_BACKGROUND = '#0b1326'

/** Bước chia "tròn" (1, 2, 5 × 10^k) sao cho có khoảng n vạch trên khoảng range. */
export function niceStep(range: number, n: number): number {
  const raw = range / n
  const p = 10 ** Math.floor(Math.log10(raw))
  const f = raw / p
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * p
}

/** Độ dài thanh tỉ lệ "tròn" (1, 2, 5 × 10^k) gần 22 % bề rộng, không vượt quá 30 %. */
export function niceBar(range: number): number {
  const target = range * 0.22
  const exp = Math.floor(Math.log10(target))
  let best = 10 ** exp
  for (const m of [1, 2, 5, 10]) {
    const c = m * 10 ** exp
    if (c <= range * 0.3 && Math.abs(c - target) < Math.abs(best - target)) best = c
  }
  return best
}

const SUPERSCRIPT: Record<string, string> = { '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹' }

/** Nhãn lũy thừa của 10 ở trục log: 0 → "1", −3 → "10⁻³". */
export function pow10Label(exponent: number): string {
  if (exponent === 0) return '1'
  return '10' + String(exponent).split('').map((c) => SUPERSCRIPT[c] ?? c).join('')
}

export function arcsecLabel(v: number): string {
  return `${Number(v.toPrecision(2))}″`
}

