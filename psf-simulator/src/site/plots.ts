/**
 * Vẽ lên canvas theo phong cách của các simulation khác trong repo: cùng màu, phông, lưới và cách co theo mật độ điểm ảnh.
 * Mỗi hàm `paint…` vẽ lên một `Target` bất kỳ, nên cùng một mã vẽ cho cả canvas trên trang lẫn ảnh lưu ra (xem exportImages.ts).
 */

import type { RadialProfile } from '../lib/profile'
import { COLOR, FONT, arcsecLabel, niceBar, niceStep, pow10Label } from './plotTools'

/** Nơi để vẽ: một ngữ cảnh 2D và kích thước logic (đơn vị CSS) của vùng vẽ. */
export interface Target {
  ctx: CanvasRenderingContext2D
  w: number
  h: number
}

/** Đặt kích thước điểm ảnh của canvas theo kích thước hiển thị và mật độ màn hình (tối đa 2×). */
export function fitCanvas(canvas: HTMLCanvasElement): Target | null {
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

export interface PsfOverlay {
  fovArcsec: number
  airyRadiusArcsec: number
  showRing: boolean
  /** Chữ ở góc trên bên phải, ví dụ "550 nm". */
  label: string
}

/** Vẽ ảnh PSF (đã tô màu) lên canvas, kèm thanh tỉ lệ và vòng tối đầu tiên tuỳ chọn. */
export function drawPsf(canvas: HTMLCanvasElement, source: CanvasImageSource, o: PsfOverlay): void {
  const t = fitCanvas(canvas)
  if (t) paintPsf(t, source, o)
}

export function paintPsf({ ctx, w, h }: Target, source: CanvasImageSource, o: PsfOverlay): void {
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
  const t = fitCanvas(canvas)
  if (t) paintPupil(t, source)
}

export function paintPupil({ ctx, w, h }: Target, source: CanvasImageSource): void {
  ctx.clearRect(0, 0, w, h)
  ctx.imageSmoothingEnabled = true
  ctx.drawImage(source, 0, 0, w, h)
}

/** Profile xuyên tâm trên trục log, so với mẫu Airy lý tưởng. */
export function drawProfile(canvas: HTMLCanvasElement, profile: RadialProfile, decades: number): void {
  const t = fitCanvas(canvas)
  if (t) paintProfile(t, profile, decades)
}

export function paintProfile({ ctx, w, h }: Target, profile: RadialProfile, decades: number): void {
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
