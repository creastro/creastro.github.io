/** Small canvas line plots (linear x, linear or log y) with axes, grid and a legend. */

export interface Series {
  readonly label: string
  readonly x: readonly number[]
  readonly y: readonly number[]
  readonly color: string
  readonly dash?: readonly number[]
  readonly points?: boolean
}

export interface PlotSpec {
  readonly xLabel: string
  readonly yLabel: string
  readonly logY: boolean
  readonly series: readonly Series[]
  readonly xMin?: number
  readonly xMax?: number
  readonly yMin?: number
  readonly yMax?: number
  /** Vertical marker lines (e.g. the inner working angle). */
  readonly markers?: readonly { readonly x: number; readonly label: string; readonly color: string }[]
}

/** Okabe–Ito colours, distinguishable with the common forms of colour blindness. */
export const PALETTE = { orange: '#E69F00', sky: '#56B4E9', green: '#009E73', yellow: '#F0E442', blue: '#0072B2', vermillion: '#D55E00', pink: '#CC79A7', grey: '#b3bfd8' }

export function drawPlot(canvas: HTMLCanvasElement, p: PlotSpec): void {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  const W = canvas.clientWidth || 480, H = canvas.clientHeight || 280
  canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  if (!ctx) return
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  ctx.clearRect(0, 0, W, H)
  const L = 58, R = 12, T = 12, B = 40
  const xs = p.series.flatMap((s) => s.x)
  const ys = p.series.flatMap((s) => s.y).filter((v) => Number.isFinite(v) && (!p.logY || v > 0))
  const xMin = p.xMin ?? Math.min(...xs, 0), xMax = p.xMax ?? Math.max(...xs, 1)
  let yMin = p.yMin ?? Math.min(...ys), yMax = p.yMax ?? Math.max(...ys)
  if (!ys.length) { yMin = p.logY ? 1e-10 : 0; yMax = 1 }
  if (p.logY) { yMin = 10 ** Math.floor(Math.log10(yMin)); yMax = 10 ** Math.ceil(Math.log10(yMax)); if (yMin === yMax) yMin = yMax / 10 }
  else if (yMin === yMax) { yMin -= 1; yMax += 1 }
  const X = (x: number) => L + ((x - xMin) / (xMax - xMin || 1)) * (W - L - R)
  const Y = (y: number) => {
    const t = p.logY ? (Math.log10(y) - Math.log10(yMin)) / (Math.log10(yMax) - Math.log10(yMin)) : (y - yMin) / (yMax - yMin)
    return H - B - t * (H - T - B)
  }
  ctx.font = '11px ui-monospace, monospace'
  ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.fillStyle = '#b3bfd8'; ctx.lineWidth = 1
  // grid and tick labels
  if (p.logY) {
    const d0 = Math.log10(yMin), d1 = Math.log10(yMax)
    const step = Math.max(1, Math.ceil((d1 - d0) / 6))
    for (let d = d0; d <= d1; d += step) {
      const y = Y(10 ** d)
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke()
      ctx.textAlign = 'right'; ctx.fillText(`1e${d}`, L - 6, y + 4)
    }
  } else {
    for (let i = 0; i <= 4; i++) {
      const v = yMin + ((yMax - yMin) * i) / 4, y = Y(v)
      ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(W - R, y); ctx.stroke()
      ctx.textAlign = 'right'; ctx.fillText(Math.abs(v) >= 100 ? v.toFixed(0) : v.toPrecision(2), L - 6, y + 4)
    }
  }
  const xt = niceStep((xMax - xMin) / 6)
  for (let v = Math.ceil(xMin / xt) * xt; v <= xMax + 1e-9; v += xt) {
    const x = X(v)
    ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, H - B); ctx.stroke()
    ctx.textAlign = 'center'; ctx.fillText(String(+v.toFixed(2)), x, H - B + 15)
  }
  ctx.fillStyle = '#edf2ff'; ctx.font = '12px system-ui, sans-serif'; ctx.textAlign = 'center'
  ctx.fillText(p.xLabel, L + (W - L - R) / 2, H - 6)
  ctx.save(); ctx.translate(13, T + (H - T - B) / 2); ctx.rotate(-Math.PI / 2); ctx.fillText(p.yLabel, 0, 0); ctx.restore()
  ctx.save()
  ctx.beginPath(); ctx.rect(L, T, W - L - R, H - T - B); ctx.clip()
  for (const m of p.markers ?? []) {
    if (!Number.isFinite(m.x)) continue
    ctx.strokeStyle = m.color; ctx.setLineDash([3, 3]); ctx.beginPath(); ctx.moveTo(X(m.x), T); ctx.lineTo(X(m.x), H - B); ctx.stroke()
    ctx.setLineDash([]); ctx.fillStyle = m.color; ctx.textAlign = 'left'; ctx.font = '11px system-ui, sans-serif'; ctx.fillText(m.label, X(m.x) + 4, T + 12)
  }
  for (const s of p.series) {
    ctx.strokeStyle = s.color; ctx.fillStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash ? [...s.dash] : [])
    ctx.beginPath()
    let started = false
    s.x.forEach((x, i) => {
      const y = s.y[i]
      if (!Number.isFinite(y) || (p.logY && y <= 0)) { started = false; return }
      if (!started) { ctx.moveTo(X(x), Y(y)); started = true } else ctx.lineTo(X(x), Y(y))
    })
    ctx.stroke()
    if (s.points) s.x.forEach((x, i) => { const y = s.y[i]; if (Number.isFinite(y) && (!p.logY || y > 0)) { ctx.beginPath(); ctx.arc(X(x), Y(y), 3, 0, 2 * Math.PI); ctx.fill() } })
  }
  ctx.restore()
  ctx.setLineDash([])
  // legend
  ctx.font = '11px system-ui, sans-serif'; ctx.textAlign = 'left'
  let lx = L + 8
  for (const s of p.series) {
    ctx.strokeStyle = s.color; ctx.lineWidth = 2; ctx.setLineDash(s.dash ? [...s.dash] : [])
    ctx.beginPath(); ctx.moveTo(lx, T + 10); ctx.lineTo(lx + 16, T + 10); ctx.stroke(); ctx.setLineDash([])
    ctx.fillStyle = '#edf2ff'; ctx.fillText(s.label, lx + 20, T + 14)
    lx += 28 + ctx.measureText(s.label).width
  }
}

function niceStep(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw || 1))
  const f = raw / p
  return (f < 1.5 ? 1 : f < 3 ? 2 : f < 7 ? 5 : 10) * p
}
