/** Data export: PNG images and CSV tables. */
import type { LoopPoint } from '../lib/loop.ts'
import type { Curve } from '../lib/metrics.ts'

export function download(name: string, blob: Blob): void {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  document.body.appendChild(a)
  a.click()
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove() }, 0)
}

export function savePng(canvas: HTMLCanvasElement, name: string): void {
  canvas.toBlob((b) => { if (b) download(name, b) }, 'image/png')
}

export function csv(header: readonly string[], rows: readonly (readonly number[])[]): string {
  return [header.join(','), ...rows.map((r) => r.map((v) => (Number.isFinite(v) ? v.toPrecision(6) : '')).join(','))].join('\n') + '\n'
}

export function contrastCsv(c: Curve, base: Curve): string {
  return csv(['separation_lambda_over_D', 'raw_contrast', 'bare_telescope'], c.r.map((r, i) => [r, c.value[i], base.value[base.r.indexOf(r)] ?? NaN]))
}

export function throughputCsv(t: Curve): string {
  return csv(['separation_lambda_over_D', 'core_throughput'], t.r.map((r, i) => [r, t.value[i]]))
}

export function loopCsv(h: readonly LoopPoint[]): string {
  return csv(['iteration', 'dark_hole_contrast', 'rms_science_nm', 'rms_wfs_nm'], h.map((p) => [p.iteration, p.contrast, p.rmsScience, p.rmsWfs]))
}

export function saveText(name: string, text: string): void {
  download(name, new Blob([text], { type: 'text/csv' }))
}
