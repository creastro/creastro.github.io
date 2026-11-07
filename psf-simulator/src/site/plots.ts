/**
 * Vẽ lên canvas theo phong cách của các simulation khác trong repo: cùng màu, phông, lưới và cách co theo mật độ điểm ảnh.
 */

import type { RadialProfile } from '../lib/profile'

export const COLOR = {
  text: '#b3bfd8',
  grid: 'rgba(255,255,255,.08)',
  frame: 'rgba(255,255,255,.25)',
  accent: '#8fe3ff',
  white: '#edf2ff',
  grey: 'rgba(179,191,216,.8)',
}
const FONT = '12px system-ui, sans-serif'

/** Đặt kích thước điểm ảnh của canvas theo kích thước hiển thị và mật độ màn hình (tối đa 2×). */
export function fitCanvas(canvas: HTMLCanvasElement): { ctx: CanvasRenderingContext2D; w: number; h: number } | null {
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  const w = canvas.clientWidth
  const h = canvas.clientHeight
  if (!w || !h) return null
  const pw = Math.round(w * dpr)
  const ph = Math.round(h * dpr)
  if (canvas.width !== pw || canvas.height !== ph) {
    canvas.width = pw
    canvas.height = ph
  }
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  return { ctx, w, h }
}

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

export interface PsfOverlay {
  fovArcsec: number
  airyRadiusArcsec: number
  showRing: boolean
  /** Chữ ở góc trên bên phải, ví dụ "550 nm". */
  label: string
}

/** Vẽ ảnh PSF (đã tô màu) lên canvas, kèm thanh tỉ lệ và vòng tối đầu tiên tuỳ chọn. */
export function drawPsf(canvas: HTMLCanvasElement, source: CanvasImageSource, o: PsfOverlay): void {
  const f = fitCanvas(canvas)
  if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, 0, 0, w, h)

  if (o.showRing) {
    const r = (o.airyRadiusArcsec / o.fovArcsec) * w
    ctx.strokeStyle = 'rgba(143,227,255,.7)'
    ctx.lineWidth = 1.2
    ctx.setLineDash([6, 5])
    ctx.beginPath()
    ctx.arc(w / 2, h / 2, r, 0, Math.PI * 2)
    ctx.stroke()
    ctx.setLineDash([])
    if (r < w / 2 - 40) {
      ctx.fillStyle = COLOR.accent
      ctx.font = FONT
      ctx.textAlign = 'left'
      ctx.textBaseline = 'bottom'
      ctx.fillText('1.22 λ/D', w / 2 + r * 0.72 + 4, h / 2 - r * 0.72)
    }
  }

  const bar = niceBar(o.fovArcsec)
  const px = (bar / o.fovArcsec) * w
  ctx.strokeStyle = COLOR.white
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(14, h - 16)
  ctx.lineTo(14 + px, h - 16)
  ctx.stroke()
  ctx.fillStyle = COLOR.white
  ctx.font = FONT
  ctx.textAlign = 'left'
  ctx.textBaseline = 'bottom'
  ctx.fillText(arcsecLabel(bar), 14, h - 20)
  ctx.textAlign = 'right'
  ctx.textBaseline = 'top'
  ctx.fillText(o.label, w - 12, 10)
}

/** Vẽ ảnh pupil lên canvas. */
export function drawPupil(canvas: HTMLCanvasElement, source: CanvasImageSource): void {
  const f = fitCanvas(canvas)
  if (!f) return
  f.ctx.clearRect(0, 0, f.w, f.h)
  f.ctx.imageSmoothingEnabled = true
  f.ctx.drawImage(source, 0, 0, f.w, f.h)
}

/** Profile xuyên tâm trên trục log, so với mẫu Airy lý tưởng. */
export function drawProfile(canvas: HTMLCanvasElement, profile: RadialProfile, decades: number): void {
  const f = fitCanvas(canvas)
  if (!f) return
  const { ctx, w, h } = f
  ctx.clearRect(0, 0, w, h)
  const m = { l: 56, r: 12, t: 10, b: 38 }
  const pw = w - m.l - m.r
  const ph = h - m.t - m.b
  const maxTheta = profile.thetaArcsec[profile.thetaArcsec.length - 1]
  const X = (t: number) => m.l + (t / maxTheta) * pw
  const Y = (v: number) => {
    const l = Math.max(-decades, Math.min(0, Math.log10(Math.max(v, 1e-12))))
    return m.t + (-l / decades) * ph
  }

  ctx.font = FONT
  ctx.textAlign = 'right'
  ctx.textBaseline = 'middle'
  for (let d = 0; d <= Math.floor(decades); d++) {
    const y = Math.round(Y(10 ** -d)) + 0.5
    ctx.strokeStyle = COLOR.grid
    ctx.beginPath()
    ctx.moveTo(m.l, y)
    ctx.lineTo(w - m.r, y)
    ctx.stroke()
    ctx.fillStyle = COLOR.text
    ctx.fillText(pow10Label(-d), m.l - 8, y)
  }
  ctx.textAlign = 'center'
  ctx.textBaseline = 'top'
  const step = niceStep(maxTheta, 5)
  for (let t = 0; t <= maxTheta + 1e-9; t += step) {
    const x = Math.round(X(t)) + 0.5
    ctx.strokeStyle = COLOR.grid
    ctx.beginPath()
    ctx.moveTo(x, m.t)
    ctx.lineTo(x, h - m.b)
    ctx.stroke()
    ctx.fillStyle = COLOR.text
    ctx.fillText(String(Number(t.toPrecision(3))), x, h - m.b + 7)
  }
  ctx.strokeStyle = COLOR.frame
  ctx.lineWidth = 1
  ctx.strokeRect(m.l + 0.5, m.t + 0.5, pw - 1, ph - 1)
  ctx.fillStyle = COLOR.text
  ctx.textBaseline = 'bottom'
  ctx.fillText('angular distance from the star (arcsec)', m.l + pw / 2, h - 2)

  const line = (values: number[], style: string, width: number, dash: number[]) => {
    ctx.strokeStyle = style
    ctx.lineWidth = width
    ctx.setLineDash(dash)
    ctx.beginPath()
    values.forEach((v, i) => {
      const x = X(profile.thetaArcsec[i])
      const y = Y(v)
      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    })
    ctx.stroke()
    ctx.setLineDash([])
  }
  ctx.save()
  ctx.beginPath()
  ctx.rect(m.l, m.t, pw, ph)
  ctx.clip()
  line(profile.airy, COLOR.grey, 1.2, [5, 4])
  line(profile.intensity, COLOR.accent, 1.8, [])
  ctx.restore()

  // legend
  const lx = w - m.r - 150
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = COLOR.text
  ctx.strokeStyle = COLOR.accent
  ctx.lineWidth = 1.8
  ctx.beginPath()
  ctx.moveTo(lx, m.t + 14)
  ctx.lineTo(lx + 18, m.t + 14)
  ctx.stroke()
  ctx.fillText('simulation', lx + 24, m.t + 14)
  ctx.strokeStyle = COLOR.grey
  ctx.lineWidth = 1.2
  ctx.setLineDash([5, 4])
  ctx.beginPath()
  ctx.moveTo(lx, m.t + 32)
  ctx.lineTo(lx + 18, m.t + 32)
  ctx.stroke()
  ctx.setLineDash([])
  ctx.fillText('ideal Airy pattern', lx + 24, m.t + 32)
}
