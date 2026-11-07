/*
 * Telescope PSF simulation: page code.
 *
 * Builds the controls, runs the physics (in a Web Worker when the page can start one, otherwise on the main thread)
 * and draws the results. The physics is in src/lib; this file only connects it to the page, in the same style as the
 * other simulations of the site. Run `npm run build:site` in psf-simulator to regenerate telescope-psf.js from it.
 */

import { COLORMAP_LABELS, type ColormapName } from '../lib/colormap'
import { computeFrame, type FrameResult } from '../lib/frame'
import type { SimParams } from '../lib/params'
import { SEGMENT_PRESETS, type SegmentPresetKey } from '../lib/segmentPresets'
import { ZERNIKE_NAMES } from '../lib/zernike'
import type { WorkerRequest, WorkerResponse } from '../workers/psf.worker'
import {
  RANGE_SPECS,
  READ_ROWS,
  ZERNIKE_IDS,
  LOG_STEPS,
  fromPosition,
  specById,
  toPosition,
  type RangeSpec,
} from './controlSpecs'
import { drawProfile, drawPsf, drawPupil } from './plots'

const $ = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const el = document.getElementById(id)
  if (!el) throw new Error(`Missing element #${id}`)
  return el as T
}
const input = (id: string) => $<HTMLInputElement>(id)

/* ---------- controls ---------- */

function fieldHtml(s: RangeSpec): string {
  const min = s.log ? 0 : s.min
  const max = s.log ? LOG_STEPS : s.max
  const step = s.log ? 1 : s.step
  const value = s.log ? Math.round(toPosition(s, s.value)) : s.value
  return (
    `<div class="field"><label for="${s.id}">${s.label}</label>` +
    `<input id="${s.id}" type="range" min="${min}" max="${max}" step="${step}" value="${value}">` +
    `<output for="${s.id}"></output></div>`
  )
}

for (const group of ['mirror', 'seg', 'vanes', 'zern', 'display'] as const) {
  $(`g-${group}`).innerHTML = RANGE_SPECS.filter((s) => s.group === group).map(fieldHtml).join('')
}
$('cmap').innerHTML = (Object.keys(COLORMAP_LABELS) as ColormapName[])
  .map((k) => `<option value="${k}"${k === 'hot' ? ' selected' : ''}>${COLORMAP_LABELS[k]}</option>`)
  .join('')

/** Giá trị thật của một thanh trượt (đã đổi từ vị trí nếu là thang log). */
function value(id: string): number {
  const spec = specById(id)
  if (!spec) throw new Error(`Unknown control ${id}`)
  return fromPosition(spec, +input(id).value)
}

function setValue(id: string, v: number): void {
  const spec = specById(id)
  if (spec) input(id).value = String(toPosition(spec, v))
}

function syncOutputs(): void {
  document.querySelectorAll<HTMLOutputElement>('#controls output').forEach((o) => {
    const spec = specById(o.htmlFor.toString())
    if (spec) o.textContent = spec.format(value(spec.id))
  })
}

let seed = 1

function readParams(): SimParams {
  const aberrations = {} as SimParams['aberrations']
  for (const name of ZERNIKE_NAMES) aberrations[name] = value(ZERNIKE_IDS[name])
  return {
    diameterM: value('D'),
    wavelengthNm: value('lam'),
    bandwidthNm: value('band'),
    obstructionRatio: value('eps'),
    vaneCount: Math.round(value('nvane')),
    vaneThicknessRatio: value('tvane'),
    vaneAngleDeg: value('avane'),
    aberrations,
    segmented: {
      enabled: input('seg-on').checked,
      rings: Math.round(value('seg-rings')),
      gapRatio: value('seg-gap'),
      removeCenter: input('seg-center').checked,
      pistonRms: value('seg-piston'),
      tiltRms: value('seg-tilt'),
      seed,
    },
    fovArcsec: value('fov'),
    dynamicRangeDecades: value('range'),
    colormap: $<HTMLSelectElement>('cmap').value as ColormapName,
  }
}

/* ---------- derived readouts ---------- */

const readCells: Record<string, { dt: HTMLElement; dd: HTMLElement }> = {}
{
  const dl = $('read')
  for (const [key, text, topic] of READ_ROWS) {
    const dt = document.createElement('dt')
    dt.dataset.tipKey = `read-${key}`
    const b = document.createElement('button')
    b.type = 'button'
    b.className = 'term'
    b.dataset.topic = topic
    b.textContent = text
    b.setAttribute('aria-haspopup', 'dialog')
    dt.appendChild(b)
    const dd = document.createElement('dd')
    dl.appendChild(dt)
    dl.appendChild(dd)
    readCells[key] = { dt, dd }
  }
}

const arcsec = (v: number): string => `${v.toFixed(v < 0.1 ? 4 : 3)}″`

function setRow(key: string, text: string, visible = true): void {
  const c = readCells[key]
  c.dd.textContent = text
  c.dt.hidden = !visible
  c.dd.hidden = !visible
}

function bandLabel(p: SimParams): string {
  if (p.bandwidthNm <= 0) return `${p.wavelengthNm.toFixed(0)} nm`
  const lo = Math.max(200, p.wavelengthNm - p.bandwidthNm / 2)
  return `${lo.toFixed(0)}–${(p.wavelengthNm + p.bandwidthNm / 2).toFixed(0)} nm`
}

/* ---------- drawing ---------- */

type Shown = FrameResult & { ms: number }
let last: { frame: Shown; params: SimParams } | null = null
const psfOff = document.createElement('canvas')
const pupOff = document.createElement('canvas')

function toCanvas(target: HTMLCanvasElement, rgba: Uint8ClampedArray, size: number): void {
  target.width = size
  target.height = size
  const ctx = target.getContext('2d')
  if (!ctx) return
  const img = ctx.createImageData(size, size)
  img.data.set(rgba)
  ctx.putImageData(img, 0, 0)
}

function render(): void {
  if (!last) return
  const { frame, params } = last
  drawPsf($('psf'), psfOff, {
    fovArcsec: params.fovArcsec,
    airyRadiusArcsec: frame.stats.airyRadiusArcsec,
    showRing: input('showring').checked,
    label: bandLabel(params),
  })
  drawPupil($('pupil'), pupOff)
  drawProfile($('profile'), frame.profile, params.dynamicRangeDecades)
}

function present(frame: Shown, params: SimParams): void {
  last = { frame, params }
  toCanvas(psfOff, frame.rgba, Math.round(Math.sqrt(frame.rgba.length / 4)))
  toCanvas(pupOff, frame.pupilRgba, frame.pupilSize)
  render()

  const s = frame.stats
  $('stats').innerHTML =
    `λ/D = <b>${arcsec(s.lambdaOverDArcsec)}</b> · first dark ring <b>${arcsec(s.airyRadiusArcsec)}</b> · ` +
    `field of view ±<b>${s.halfFovLD.toFixed(1)}</b> λ/D`
  $('warn').classList.toggle('on', !s.fovCovered)
  $('pb-min').textContent = `−${frame.pupilRangeWaves} λ`
  $('pb-max').textContent = `+${frame.pupilRangeWaves} λ`
  $('pupil-stats').innerHTML =
    `Wavefront error <b>${s.wavefrontRmsWaves.toFixed(3)} λ</b> RMS · Strehl ratio <b>${s.strehl.toFixed(3)}</b>`

  setRow('ld', arcsec(s.lambdaOverDArcsec))
  setRow('airy', arcsec(s.airyRadiusArcsec))
  setRow('area', `${(s.throughput * 100).toFixed(1)} %`)
  setRow('strehl', s.strehl.toFixed(3))
  setRow('rms', `${s.wavefrontRmsWaves.toFixed(3)} λ`)
  setRow('marechal', s.marechalStrehl.toFixed(3))
  setRow('peak', `${(s.relativePeak * 100).toFixed(1)} %`)
  setRow('segs', String(s.segmentCount), s.segmentCount > 0)
  setRow('samples', String(s.bandSamples), s.bandSamples > 1)
  setRow('time', `${frame.ms.toFixed(0)} ms`)
}

/* ---------- computing: a worker when possible, the main thread otherwise ---------- */

let worker: Worker | null = null
let busy = false
let inflight: SimParams | null = null
let pending: SimParams | null = null
let nextId = 0

function done(frame: Shown): void {
  busy = false
  if (inflight) present(frame, inflight)
  const next = pending
  pending = null
  if (next) send(next)
}

function computeHere(p: SimParams): void {
  // Leave the browser a moment to paint the sliders before the heavy computation.
  setTimeout(() => {
    const t0 = performance.now()
    const frame = computeFrame(p)
    done({ ...frame, ms: performance.now() - t0 })
  }, 0)
}

function send(p: SimParams): void {
  busy = true
  inflight = p
  if (worker) {
    const request: WorkerRequest = { id: nextId++, params: p }
    worker.postMessage(request)
  } else {
    computeHere(p)
  }
}

function request(p: SimParams): void {
  if (busy) pending = p
  else send(p)
}

try {
  worker = new Worker('psf-worker.js')
  worker.onmessage = (e: MessageEvent<WorkerResponse>) => done(e.data)
  worker.onerror = () => {
    // The worker could not be loaded (for example when the page is opened from a file): compute on the main thread.
    worker = null
    if (busy && inflight) computeHere(inflight)
  }
} catch {
  worker = null
}

let raf = 0
function schedule(): void {
  if (raf) return
  raf = requestAnimationFrame(() => {
    raf = 0
    request(readParams())
  })
}

function onInput(): void {
  syncOutputs()
  schedule()
}

/* ---------- events ---------- */

const segMore = $('seg-more')
const syncSeg = (): void => {
  segMore.hidden = !input('seg-on').checked
}

$('controls').addEventListener('input', onInput)
$('controls').addEventListener('change', onInput)
$('controls').addEventListener('reset', () => {
  seed = 1
  // The color map and the ring marker sit in the image panel, outside the form, so the form does not reset them.
  $<HTMLSelectElement>('cmap').value = 'hot'
  input('showring').checked = false
  setTimeout(() => {
    syncSeg()
    onInput()
  }, 0)
})
$('cmap').addEventListener('change', onInput)
$('showring').addEventListener('change', render)
input('seg-on').addEventListener('change', syncSeg)

$('seg-draw').addEventListener('click', () => {
  seed += 1
  onInput()
})
$('clear-zern').addEventListener('click', () => {
  for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], 0)
  onInput()
})
const presetButtons: Record<string, SegmentPresetKey> = { 'preset-jwst': 'jwst', 'preset-keck': 'keck', 'preset-91': 'rings5' }
for (const [id, key] of Object.entries(presetButtons)) {
  $(id).addEventListener('click', () => {
    const p = SEGMENT_PRESETS[key].patch
    setValue('D', p.diameterM)
    setValue('fov', p.fovArcsec)
    setValue('eps', p.obstructionRatio)
    setValue('nvane', p.vaneCount)
    setValue('seg-rings', p.segmented.rings)
    setValue('seg-gap', p.segmented.gapRatio)
    input('seg-center').checked = p.segmented.removeCenter
    input('seg-on').checked = true
    syncSeg()
    onInput()
  })
}

if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(render)
  for (const id of ['psf', 'pupil', 'profile']) ro.observe($(id))
} else {
  window.addEventListener('resize', render)
}

syncSeg()
syncOutputs()
schedule()
