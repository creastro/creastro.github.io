/**
 * Lưu ảnh PSF, ảnh khẩu độ (pupil) và profile ra tệp PNG, và lưu cấu hình ra tệp JSON.
 *
 * Ảnh được vẽ lại trên một canvas ẩn bằng chính các hàm vẽ của trang, ở độ phân giải gấp đôi, kèm một dòng chú thích
 * ghi sẵn các tham số chính để ảnh lưu ra tự mô tả được.
 */

import type { FrameResult } from '../lib/frame'
import type { SimParams } from '../lib/params'
import { captionFor, imageFileName, wavelengthText } from './files'
import { COLOR, EXPORT_BACKGROUND, FONT } from './plotTools'
import { paintProfile, paintPsf, paintPupil, type Target } from './plots'

/**
 * Canvas ẩn để vẽ ảnh lưu ra, với kích thước logic w × h và độ phân giải `scale` lần (mặc định 2×), đã tô màu nền.
 * Cùng các hàm vẽ như trên màn hình, nên ảnh lưu ra giống hệt ảnh đang xem, chỉ sắc nét hơn.
 */
function exportCanvas(w: number, h: number, scale = 2): { canvas: HTMLCanvasElement; target: Target } | null {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(w * scale)
  canvas.height = Math.round(h * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.fillStyle = EXPORT_BACKGROUND
  ctx.fillRect(0, 0, w, h)
  return { canvas, target: { ctx, w, h } }
}

/** Thang màu của mặt sóng (xanh, trắng, cam) kèm hai nhãn ở hai đầu, dùng cho ảnh pupil lưu ra. */
function paintWavefrontScale(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, minLabel: string, maxLabel: string): void {
  const barW = Math.min(260, w * 0.5)
  const bx = x + (w - barW) / 2
  const gradient = ctx.createLinearGradient(bx, 0, bx + barW, 0)
  gradient.addColorStop(0, '#5ab9ff')
  gradient.addColorStop(0.5, '#edf2ff')
  gradient.addColorStop(1, '#ffaa46')
  ctx.fillStyle = gradient
  ctx.fillRect(bx, y + 11, barW, 10)
  ctx.strokeStyle = 'rgba(255,255,255,.25)'
  ctx.lineWidth = 1
  ctx.strokeRect(bx + 0.5, y + 11.5, barW - 1, 9)
  ctx.font = '12px ui-monospace, monospace'
  ctx.fillStyle = COLOR.text
  ctx.textBaseline = 'middle'
  ctx.textAlign = 'right'
  ctx.fillText(minLabel, bx - 10, y + 16)
  ctx.textAlign = 'left'
  ctx.fillText(maxLabel, bx + barW + 10, y + 16)
}

/** Dải chú thích (một dòng chữ ở giữa) ở y .. y + h, dùng cho ảnh lưu ra. */
function paintCaption(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, text: string): void {
  ctx.fillStyle = EXPORT_BACKGROUND
  ctx.fillRect(x, y, w, h)
  ctx.strokeStyle = 'rgba(255,255,255,.14)'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(x, y + 0.5)
  ctx.lineTo(x + w, y + 0.5)
  ctx.stroke()
  ctx.font = FONT
  ctx.fillStyle = COLOR.text
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillText(text, x + w / 2, y + h / 2 + 0.5, w - 16)
}


/** Kích thước logic của ảnh lưu ra (đơn vị CSS); canvas thật gấp đôi. */
const IMAGE_W = 640
const CAPTION_H = 34
const SCALE_H = 36
const PROFILE_H = 380

/** Cho trình duyệt tải một đối tượng Blob xuống với tên cho trước. */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  a.rel = 'noopener'
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Cho trình duyệt thời gian bắt đầu tải trước khi thu hồi địa chỉ.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Lưu nội dung văn bản (ví dụ tệp cấu hình JSON). */
export function downloadText(text: string, name: string, mime = 'application/json'): void {
  downloadBlob(new Blob([text], { type: mime }), name)
}

function savePng(canvas: HTMLCanvasElement, name: string): void {
  canvas.toBlob((blob) => {
    if (blob) downloadBlob(blob, name)
  }, 'image/png')
}

/** Ảnh PSF như đang xem (kèm thanh tỉ lệ, vòng tối đầu tiên nếu đang bật, nhãn bước sóng) và dòng chú thích. */
export function savePsfImage(
  frame: FrameResult,
  params: SimParams,
  source: CanvasImageSource,
  showRing: boolean,
): void {
  const out = exportCanvas(IMAGE_W, IMAGE_W + CAPTION_H)
  if (!out) return
  const { canvas, target } = out
  const area: Target = { ctx: target.ctx, w: IMAGE_W, h: IMAGE_W }
  paintPsf(area, source, {
    fovArcsec: params.fovArcsec,
    airyRadiusArcsec: frame.stats.airyRadiusArcsec,
    showRing,
    label: wavelengthText(params),
  })
  paintCaption(target.ctx, 0, IMAGE_W, IMAGE_W, CAPTION_H, captionFor('psf', params, frame.stats))
  savePng(canvas, imageFileName('psf', params, frame.stats.segmentCount))
}

/** Ảnh khẩu độ và mặt sóng, với thang màu của mặt sóng phía trên và dòng chú thích phía dưới. */
export function saveAperture(frame: FrameResult, params: SimParams, source: CanvasImageSource): void {
  const out = exportCanvas(IMAGE_W, SCALE_H + IMAGE_W + CAPTION_H)
  if (!out) return
  const { canvas, target } = out
  const r = frame.pupilRangeWaves
  paintWavefrontScale(target.ctx, 0, 0, IMAGE_W, `−${r} λ`, `+${r} λ`)
  target.ctx.save()
  target.ctx.translate(0, SCALE_H)
  paintPupil({ ctx: target.ctx, w: IMAGE_W, h: IMAGE_W }, source)
  target.ctx.restore()
  paintCaption(target.ctx, 0, SCALE_H + IMAGE_W, IMAGE_W, CAPTION_H, captionFor('aperture', params, frame.stats))
  savePng(canvas, imageFileName('aperture', params, frame.stats.segmentCount))
}

/** Đồ thị profile xuyên tâm (đường mô phỏng và mẫu Airy lý tưởng) và dòng chú thích. */
export function saveProfileImage(frame: FrameResult, params: SimParams): void {
  const out = exportCanvas(IMAGE_W, PROFILE_H + CAPTION_H)
  if (!out) return
  const { canvas, target } = out
  paintProfile({ ctx: target.ctx, w: IMAGE_W, h: PROFILE_H }, frame.profile, params.dynamicRangeDecades)
  paintCaption(target.ctx, 0, PROFILE_H, IMAGE_W, CAPTION_H, captionFor('profile', params, frame.stats))
  savePng(canvas, imageFileName('profile', params, frame.stats.segmentCount))
}
