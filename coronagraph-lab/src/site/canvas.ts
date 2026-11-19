/**
 * Colour maps and image drawing. Intensity maps use perceptually uniform, colour-blind-safe maps (viridis,
 * magma: polynomial fits; cividis: piecewise-linear through its published key colours). Wavefront maps use a
 * diverging blue–white–orange map, phases a cyclic map, masks grey levels.
 */
import type { Img } from '../lib/planes.ts'

type RGB = [number, number, number]
const poly = (c: readonly RGB[]) => (t: number): RGB =>
  [0, 1, 2].map((k) => c.reduceRight((acc, ck) => acc * t + ck[k], 0)) as RGB

const viridis = poly([
  [0.2777273272234177, 0.005407344544966578, 0.3340998053353061], [0.1050930431085774, 1.404613529898575, 1.384590162594685],
  [-0.3308618287255563, 0.214847559468213, 0.09509516302823659], [-4.634230498983486, -5.799100973351585, -19.33244095627987],
  [6.228269936347081, 14.17993336680509, 56.69055260068105], [4.776384997670288, -13.74514537774601, -65.35303263337234],
  [-5.435455855934631, 4.645852612178535, 26.3124352495832],
])
const magma = poly([
  [-0.002136485053939582, -0.000749655052795221, -0.005386127855323933], [0.2516605407371642, 0.6775232436837668, 2.494026599312351],
  [8.353717279216625, -3.577719514958484, 0.3144679030132573], [-27.66873308576866, 14.26473078096533, -13.64921318813922],
  [52.17613981234068, -27.94360607168351, 12.94416944238394], [-50.76852536473588, 29.04658282127291, 4.23415299384598],
  [18.65570506591883, -11.48977351997711, -5.601961508734096],
])
const piecewise = (pts: readonly RGB[]) => (t: number): RGB => {
  const x = Math.min(0.999999, Math.max(0, t)) * (pts.length - 1)
  const i = Math.floor(x), f = x - i
  return [0, 1, 2].map((k) => pts[i][k] + (pts[i + 1][k] - pts[i][k]) * f) as RGB
}
const hex = (h: string): RGB => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255) as RGB
const cividis = piecewise(['#00204D', '#00336F', '#39486B', '#575C6D', '#707173', '#8A8779', '#A69D75', '#C4B56C', '#E4CF5B', '#FFEA46'].map(hex))
const diverging = piecewise(['#2c5aa0', '#5ab9ff', '#edf2ff', '#ffaa46', '#c0582b'].map(hex))
const cyclic = piecewise(['#e2d9e2', '#7a9fcf', '#3c3b8f', '#2f1436', '#8f3b3b', '#d6935a', '#e2d9e2'].map(hex))

export const COLORMAPS: Readonly<Record<string, (t: number) => RGB>> = { viridis, magma, cividis }
export const COLORMAP_NAMES = Object.keys(COLORMAPS)

const luts = new Map<string, Uint8ClampedArray>()
function lut(name: string, f: (t: number) => RGB): Uint8ClampedArray {
  const hit = luts.get(name)
  if (hit) return hit
  const out = new Uint8ClampedArray(256 * 3)
  for (let i = 0; i < 256; i++) { const c = f(i / 255); out[3 * i] = c[0] * 255; out[3 * i + 1] = c[1] * 255; out[3 * i + 2] = c[2] * 255 }
  luts.set(name, out)
  return out
}

export type Scale =
  | { readonly kind: 'log'; readonly max: number; readonly decades: number; readonly cmap: string }
  | { readonly kind: 'linear'; readonly min: number; readonly max: number; readonly cmap: string }
  | { readonly kind: 'diverging'; readonly limit: number }
  | { readonly kind: 'phase' }
  | { readonly kind: 'grey'; readonly min: number; readonly max: number }

/** Normalised value in [0, 1] (NaN stays NaN). */
function norm(v: number, s: Scale): number {
  switch (s.kind) {
    case 'log': return v > 0 ? 1 + Math.log10(v / s.max) / s.decades : 0
    case 'linear': case 'grey': return (v - s.min) / (s.max - s.min || 1)
    case 'diverging': return 0.5 + v / (2 * (s.limit || 1))
    case 'phase': return (v + Math.PI) / (2 * Math.PI)
  }
}

export function toImageData(img: Img, s: Scale): ImageData {
  const table = s.kind === 'diverging' ? lut('div', diverging) : s.kind === 'phase' ? lut('cyc', cyclic)
    : s.kind === 'grey' ? lut('grey', (t) => [t, t, t]) : lut(s.cmap, COLORMAPS[s.cmap] ?? viridis)
  const out = new ImageData(img.w, img.h)
  for (let i = 0; i < img.w * img.h; i++) {
    const v = img.data[i]
    if (Number.isNaN(v)) { out.data[4 * i + 3] = 0; continue }
    const t = Math.min(255, Math.max(0, Math.round(norm(v, s) * 255)))
    out.data[4 * i] = table[3 * t]; out.data[4 * i + 1] = table[3 * t + 1]; out.data[4 * i + 2] = table[3 * t + 2]; out.data[4 * i + 3] = 255
  }
  return out
}

/** Draw an image scaled to the canvas (nearest neighbour unless `smooth`), flipping y so that +v is up. */
export function drawImage(canvas: HTMLCanvasElement, img: Img, s: Scale, size = 0, smooth = false): void {
  const w = size || canvas.clientWidth || img.w
  const h = Math.round((w * img.h) / img.w)
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  const tmp = document.createElement('canvas')
  tmp.width = img.w; tmp.height = img.h
  tmp.getContext('2d')?.putImageData(toImageData(img, s), 0, 0)
  ctx.save()
  ctx.imageSmoothingEnabled = smooth
  ctx.fillStyle = '#05070f'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.translate(0, canvas.height); ctx.scale(1, -1)
  ctx.drawImage(tmp, 0, 0, canvas.width, canvas.height)
  ctx.restore()
}

export function maxOf(img: Img): number {
  let m = 0
  for (const v of img.data) if (v > m) m = v
  return m
}

export function absMax(img: Img): number {
  let m = 0
  for (const v of img.data) if (Math.abs(v) > m) m = Math.abs(v)
  return m
}

/** CSS gradient of a colour map, for colour bars. */
export function gradientCss(name: string): string {
  const f = COLORMAPS[name] ?? viridis
  const stops = Array.from({ length: 9 }, (_, i) => { const c = f(i / 8); return `rgb(${c.map((x) => Math.round(x * 255)).join(',')}) ${i * 12.5}%` })
  return `linear-gradient(90deg, ${stops.join(', ')})`
}
