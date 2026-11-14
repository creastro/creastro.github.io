/**
 * Coronagraph Lab page: state, worker messages and rendering. The physics runs in coronagraph-worker.js
 * (or on the main thread when the page is opened from a file and workers cannot start).
 */
import { DEFAULT_CONFIG, type LabConfig } from '../lib/config.ts'
import type { FrameData } from '../lib/frame.ts'
import type { LoopPoint } from '../lib/loop.ts'
import type { Curve } from '../lib/metrics.ts'
import type { WfsData } from '../lib/wfsView.ts'
import { createEngine } from '../worker/engine.ts'
import type { Reply, Request } from '../worker/protocol.ts'
import { COLORMAP_NAMES, drawImage, gradientCss } from './canvas.ts'
import { CORONAGRAPH_LABELS, buildControls, sci } from './controls.ts'
import { PLANE_NAMES, type PlaneId, diagramSvg } from './diagram.ts'
import { contrastCsv, loopCsv, savePng, saveText, throughputCsv } from './files.ts'
import { type Content, renderBibliography, renderInfo } from './panels.ts'
import { buildStrip, fillDialog, fillStrip, planePanels } from './planeView.ts'
import { PALETTE, drawPlot } from './plots.ts'
import { PRESETS, TOUR } from './tour.ts'

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T
const content = (window as unknown as { CORONAGRAPH_LAB_CONTENT?: Content }).CORONAGRAPH_LAB_CONTENT

const state = {
  config: DEFAULT_CONFIG as LabConfig,
  expert: false,
  cmap: 'magma', log: true, decades: 8,
  frame: null as FrameData | null, wfs: null as WfsData | null, wfsReason: '',
  throughput: null as { curve: Curve; iwa: number; designIwa: number } | null,
  history: [] as readonly LoopPoint[], running: false,
  frames: 0, wfsCount: 0,
  tour: 0, highlight: [] as readonly PlaneId[], openPlane: null as PlaneId | null,
}

/* ---------- worker ---------- */

let send: (r: Request) => void
function startWorker(): void {
  try {
    const w = new Worker('coronagraph-worker.js')
    w.onmessage = (e: MessageEvent<Reply>) => onReply(e.data)
    w.onerror = () => { w.terminate(); fallback() }
    send = (r) => w.postMessage(r)
  } catch { fallback() }
}
function fallback(): void {
  const engine = createEngine((r) => setTimeout(() => onReply(r), 0))
  send = (r) => setTimeout(() => engine(r), 0)
  inFlight = false
  requestFrame()
}

let frameId = 0, inFlight = false, pending = false
function requestFrame(): void {
  pending = true
  if (inFlight) return
  pending = false
  inFlight = true
  send({ type: 'frame', id: ++frameId, config: state.config })
}

function onReply(r: Reply): void {
  if (r.type === 'frame') {
    state.frame = r.data
    state.frames++
    if (r.id === frameId) { inFlight = false; if (pending) requestFrame() }
    renderFrame()
  } else if (r.type === 'wfs') {
    state.wfs = r.data; state.wfsReason = r.reason
    state.wfsCount++
    renderWfs()
  } else if (r.type === 'throughput') {
    state.throughput = { curve: r.curve, iwa: r.iwa, designIwa: r.designIwa }
    $<HTMLButtonElement>('tp-run').disabled = false
    renderCurves(); renderReadouts()
  } else if (r.type === 'progress') {
    const p = $('progress')
    p.hidden = !r.what
    p.textContent = r.what ? `${r.what}… ${Math.round(r.fraction * 100)} %` : ''
  } else if (r.type === 'loop') {
    state.history = r.history; state.running = r.running
    $('loop-status').textContent = r.message
    $<HTMLButtonElement>('loop-run').disabled = r.running
    $<HTMLButtonElement>('loop-stop').disabled = !r.running
    renderLoop(); renderReadouts()
  } else if (r.type === 'error') {
    $('loop-status').textContent = `Error: ${r.message}`
    inFlight = false
  }
}

/* ---------- configuration changes ---------- */

let refreshControls: () => void = () => {}
function setConfig(c: LabConfig): void {
  const kindsChanged = c.coronagraph.kind !== state.config.coronagraph.kind || c.wfs.kind !== state.config.wfs.kind || c.control.kind !== state.config.control.kind
  state.config = c
  state.throughput = null
  refreshControls()
  renderDiagram()
  if (kindsChanged) renderInfoPanels()
  requestFrame()
}

/* ---------- rendering ---------- */

function renderDiagram(): void {
  const host = $('diagram')
  host.innerHTML = diagramSvg(state.config)
  for (const g of Array.from(host.querySelectorAll<SVGGElement>('.plane'))) {
    const id = g.dataset.plane as PlaneId
    g.classList.toggle('hl', state.highlight.includes(id))
    g.addEventListener('click', () => openPlane(id))
    g.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPlane(id) } })
  }
}

function renderImage(): void {
  const f = state.frame
  if (!f) return
  const cv = $<HTMLCanvasElement>('image')
  drawImage(cv, f.image, state.log ? { kind: 'log', max: 1, decades: state.decades, cmap: state.cmap } : { kind: 'linear', min: 0, max: Math.max(1e-30, Math.max(...f.image.data)), cmap: state.cmap }, 0, true)
  const ctx = cv.getContext('2d')
  if (!ctx) return
  const s = cv.width / (2 * f.fov)
  ctx.lineWidth = Math.max(1, cv.width / 400)
  for (const p of state.config.planets) {
    const t = (p.pa * Math.PI) / 180
    const x = cv.width / 2 + p.sep * Math.cos(t) * s, y = cv.height / 2 - p.sep * Math.sin(t) * s
    ctx.strokeStyle = PALETTE.sky; ctx.beginPath(); ctx.arc(x, y, 1.6 * s, 0, 2 * Math.PI); ctx.stroke()
  }
  ctx.fillStyle = '#edf2ff'; ctx.font = `${Math.round(cv.width / 40)}px system-ui, sans-serif`
  ctx.fillText(`±${f.fov} λ/D`, 8, cv.height - 10)
  $('cbar-min').textContent = state.log ? `10⁻${state.decades}` : '0'
  $('cbar-max').textContent = state.log ? '1' : sci(Math.max(...f.image.data))
}

function renderCurves(): void {
  const f = state.frame
  if (!f) return
  drawPlot($<HTMLCanvasElement>('curve'), {
    xLabel: 'Separation (λ0/D)', yLabel: 'Raw contrast', logY: true, xMin: 0, xMax: f.fov,
    series: [
      { label: CORONAGRAPH_LABELS[state.config.coronagraph.kind], x: f.contrast.r, y: f.contrast.value, color: PALETTE.orange },
      { label: 'Bare telescope', x: f.baseline.r, y: f.baseline.value, color: PALETTE.grey, dash: [5, 4] },
      ...state.config.planets.map((p, i) => ({ label: i ? '' : 'Planets', x: [p.sep], y: [p.contrast], color: PALETTE.sky, points: true })),
    ],
  })
  const t = state.throughput
  const tpc = $<HTMLCanvasElement>('tp')
  if (t) {
    drawPlot(tpc, {
      xLabel: 'Planet separation (λ0/D)', yLabel: 'Core throughput', logY: false, yMin: 0, yMax: 1.05, xMin: 0,
      series: [{ label: 'Relative to the bare telescope', x: t.curve.r, y: t.curve.value, color: PALETTE.green, points: true }],
      markers: [{ x: Number.isFinite(t.iwa) ? t.iwa : t.designIwa, label: 'IWA', color: PALETTE.yellow }],
    })
  } else {
    const ctx = tpc.getContext('2d')
    if (ctx) { tpc.width = tpc.clientWidth; tpc.height = tpc.clientHeight; ctx.fillStyle = '#b3bfd8'; ctx.font = '13px system-ui, sans-serif'; ctx.fillText('Press “Compute throughput”.', 16, 30) }
  }
}

function renderWfs(): void {
  const w = state.wfs
  const host = $('wfs-views')
  $('wfs-note').textContent = w ? w.note : state.wfsReason || 'Measuring…'
  const err = $('wfs-err')
  if (w) err.textContent = w.units === 'nm' ? `True wavefront ${w.truthRms.toFixed(1)} nm RMS · difference ${w.errorRms.toFixed(1)} nm RMS` : `Field estimate error ${(100 * w.errorRms).toFixed(1)} % RMS`
  else err.textContent = ''
  if (state.frame) {
    fillDialog(host, planePanels('WFS', state.frame, w, state.cmap, state.decades), state.expert)
    fillStrip($('strip'), state.frame, w, state.cmap, state.decades, state.expert)
  }
  if (state.openPlane === 'WFS') openPlane('WFS')
}

function renderLoop(): void {
  const h = state.history
  const x = h.map((p) => p.iteration)
  drawPlot($<HTMLCanvasElement>('loop-c'), { xLabel: 'Iteration', yLabel: 'Dark-hole contrast', logY: true, xMin: 0, xMax: Math.max(5, ...x), series: [{ label: 'Mean raw contrast in the dark hole', x, y: h.map((p) => p.contrast), color: PALETTE.orange, points: true }] })
  drawPlot($<HTMLCanvasElement>('loop-r'), {
    xLabel: 'Iteration', yLabel: 'Residual wavefront (nm RMS)', logY: false, yMin: 0, xMin: 0, xMax: Math.max(5, ...x),
    series: [{ label: 'Science arm', x, y: h.map((p) => p.rmsScience), color: PALETTE.vermillion, points: true }, { label: 'WFS arm', x, y: h.map((p) => p.rmsWfs), color: PALETTE.sky, dash: [5, 4] }],
  })
}

function readout(dl: HTMLElement, rows: [string, string, string][]): void {
  dl.textContent = ''
  for (const [id, name, value] of rows) {
    const dt = document.createElement('dt'); dt.textContent = name; dt.dataset.tipKey = id
    const dd = document.createElement('dd'); dd.textContent = value; dd.id = id
    dl.append(dt, dd)
  }
}

function renderReadouts(): void {
  const f = state.frame
  if (!f) return
  const r = f.readouts
  const t = state.throughput
  const last = state.history.at(-1)
  const rows: [string, string, string][] = [
    ['r-contrast', 'Mean raw contrast (dark zone)', sci(r.meanContrast)],
    ['r-base', 'Bare telescope, same zone', sci(r.baselineContrast)],
    ['r-gain', 'Suppression factor', r.meanContrast > 0 ? `${(r.baselineContrast / r.meanContrast).toPrecision(3)}×` : '∞'],
    ['r-peak', 'Residual star peak', sci(r.peak)],
    ['r-strehl', 'Strehl ratio (science arm)', r.strehl.toFixed(3)],
    ['r-wfe', 'Wavefront error: science / WFS arm', `${r.rmsScienceNm.toFixed(1)} / ${r.rmsWfsNm.toFixed(1)} nm`],
    ['r-iwa', 'Inner working angle', t ? `${(Number.isFinite(t.iwa) ? t.iwa : t.designIwa).toFixed(2)} λ/D` : Number.isFinite(r.designIwa) ? `${r.designIwa.toFixed(2)} λ/D (dark-zone edge)` : '—'],
  ]
  if (Number.isFinite(r.eigenvalue)) rows.push(['r-lambda', 'APLC eigenvalue Λ', r.eigenvalue.toFixed(6)])
  if (last) rows.push(['r-dh', `Dark-hole contrast after ${last.iteration} iterations`, sci(last.contrast)])
  rows.push(['r-time', 'Frame time', `${r.timeMs.toFixed(0)} ms`])
  readout($('read'), rows)
  $('stats').textContent = `Contrast ${sci(r.meanContrast)} · ${r.meanContrast > 0 ? (r.baselineContrast / r.meanContrast).toPrecision(3) : '∞'}× below the bare telescope · Strehl ${r.strehl.toFixed(2)}`
}

function renderFrame(): void {
  renderImage(); renderCurves(); renderReadouts()
  if (state.frame) fillStrip($('strip'), state.frame, state.wfs, state.cmap, state.decades, state.expert)
  if (state.openPlane && state.openPlane !== 'WFS') openPlane(state.openPlane)
}

function renderInfoPanels(): void {
  if (!content) return
  const c = state.config
  const pick = (list: Content['coronagraphs'], id: string) => list.find((e) => e.id === id)
  const cor = pick(content.coronagraphs, c.coronagraph.kind)
  const wfs = pick(content.sensors, c.wfs.kind)
  const ctl = pick(content.control, c.control.kind)
  if (cor) renderInfo($('info-cor'), cor, content, state.expert)
  if (wfs) renderInfo($('info-wfs'), wfs, content, state.expert)
  if (ctl) renderInfo($('info-ctl'), ctl, content, state.expert)
}

/* ---------- large plane view ---------- */

function openPlane(id: PlaneId): void {
  const f = state.frame
  const dlg = $<HTMLDialogElement>('plane-dlg')
  if (!f) return
  state.openPlane = id
  $('plane-title').textContent = PLANE_NAMES[id]
  fillDialog($('plane-body'), planePanels(id, f, state.wfs, state.cmap, state.decades), state.expert)
  if (!dlg.open) dlg.showModal()
}

/* ---------- mode, tour and wiring ---------- */

function setMode(expert: boolean): void {
  state.expert = expert
  document.body.classList.toggle('mode-expert', expert)
  document.body.classList.toggle('mode-beginner', !expert)
  $<HTMLInputElement>('mode-expert').checked = expert
  $<HTMLInputElement>('mode-beginner').checked = !expert
  renderInfoPanels()
  renderFrame(); renderWfs()
}

function showTourStep(i: number, apply: boolean): void {
  state.tour = Math.max(0, Math.min(TOUR.length - 1, i))
  const s = TOUR[state.tour]
  $('tour-title').textContent = s.title
  $('tour-text').textContent = s.text
  $('tour-count').textContent = `Step ${state.tour + 1} of ${TOUR.length}`
  $<HTMLButtonElement>('tour-prev').disabled = state.tour === 0
  $<HTMLButtonElement>('tour-next').disabled = state.tour === TOUR.length - 1
  state.highlight = s.highlight
  if (!apply) { renderDiagram(); return }
  const c = s.config(state.config)
  if (s.resetDm) send({ type: 'loop', action: 'reset', config: c, iterations: 0 })
  setConfig(c)
  if (s.runLoop) send({ type: 'loop', action: 'run', config: c, iterations: s.runLoop })
}

function wire(): void {
  refreshControls = buildControls(() => state.config, setConfig)
  for (const p of PRESETS) {
    const b = document.createElement('button')
    b.type = 'button'; b.className = 'button small'; b.id = p.id; b.textContent = p.label
    b.addEventListener('click', () => setConfig(p.config(state.config)))
    $('presets').appendChild(b)
  }
  const cm = $<HTMLSelectElement>('cmap')
  for (const n of COLORMAP_NAMES) { const o = document.createElement('option'); o.value = n; o.textContent = n; cm.appendChild(o) }
  cm.value = state.cmap
  const cb = () => { $('cbar-grad').style.background = gradientCss(state.cmap) }
  cb()
  cm.addEventListener('change', () => { state.cmap = cm.value; cb(); renderFrame(); renderWfs() })
  $<HTMLSelectElement>('scale').addEventListener('change', (e) => { state.log = (e.target as HTMLSelectElement).value === 'log'; renderImage() })
  const range = $<HTMLInputElement>('range')
  range.addEventListener('input', () => { state.decades = Number(range.value); $('range-out').textContent = `${range.value} decades`; renderImage(); fillStrip($('strip'), state.frame as FrameData, state.wfs, state.cmap, state.decades, state.expert) })
  $('mode-beginner').addEventListener('change', () => setMode(false))
  $('mode-expert').addEventListener('change', () => setMode(true))
  $('tour-prev').addEventListener('click', () => showTourStep(state.tour - 1, true))
  $('tour-next').addEventListener('click', () => showTourStep(state.tour + 1, true))
  $('tour-start').addEventListener('click', () => showTourStep(0, true))
  const iters = $<HTMLInputElement>('loop-n')
  $('loop-run').addEventListener('click', () => send({ type: 'loop', action: 'run', config: state.config, iterations: Number(iters.value) || 10 }))
  $('loop-stop').addEventListener('click', () => send({ type: 'loop', action: 'stop', config: state.config, iterations: 0 }))
  $('loop-reset').addEventListener('click', () => send({ type: 'loop', action: 'reset', config: state.config, iterations: 0 }))
  $('tp-run').addEventListener('click', () => { ($('tp-run') as HTMLButtonElement).disabled = true; send({ type: 'throughput', id: frameId, config: state.config }) })
  $('save-image').addEventListener('click', () => savePng($<HTMLCanvasElement>('image'), 'coronagraph-lab-image.png'))
  $('save-curve').addEventListener('click', () => { if (state.frame) saveText('coronagraph-lab-contrast.csv', contrastCsv(state.frame.contrast, state.frame.baseline)) })
  $('save-tp').addEventListener('click', () => { if (state.throughput) saveText('coronagraph-lab-throughput.csv', throughputCsv(state.throughput.curve)) })
  $('save-loop').addEventListener('click', () => saveText('coronagraph-lab-loop.csv', loopCsv(state.history)))
  const dlg = $<HTMLDialogElement>('plane-dlg')
  $('plane-close').addEventListener('click', () => dlg.close())
  dlg.addEventListener('close', () => { state.openPlane = null })
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close() })
  buildStrip($('strip'), openPlane)
  let resize = 0
  window.addEventListener('resize', () => { clearTimeout(resize); resize = window.setTimeout(() => { renderFrame(); renderLoop() }, 150) })
}

wire()
refreshControls()
setMode(false)
renderLoop()
startWorker()
showTourStep(0, true)
document.addEventListener('DOMContentLoaded', () => {
  renderInfoPanels()
  if (content) renderBibliography($('bib'), content.references)
})
;(window as unknown as Record<string, unknown>).CoronagraphLab = { state, setConfig, CORONAGRAPH_LABELS }
