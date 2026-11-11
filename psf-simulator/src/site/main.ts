/*
 * Telescope PSF simulation: page code.
 *
 * Builds the controls, runs the physics (in a Web Worker when the page can start one, otherwise on the main thread)
 * and draws the results. The physics is in src/lib; this file only connects it to the page, in the same style as the
 * other simulations of the site. Run `npm run build:site` in psf-simulator to regenerate telescope-psf.js from it.
 */

import { computeFrame, type FrameResult } from '../lib/frame'
import { lambdaOverDArcsec, type SimParams } from '../lib/params'
import { ZERNIKE_NAMES } from '../lib/zernike'
import type { WorkerRequest, WorkerResponse } from '../workers/psf.worker'
import {
  applyUiState,
  buildControls,
  getSeed,
  initVaneAngles,
  readParams,
  readUiState,
  resetDisplayControls,
  setSeed,
  setValue,
  syncOutputs,
  syncSeg,
  syncVanes,
} from './controls'
import { READ_ROWS, ZERNIKE_IDS, specById } from './controlSpecs'

import { $, input } from './dom'
import { downloadText, saveAperture, savePsfImage, saveProfileImage } from './exportImages'
import { SETTINGS_FILE_NAME, wavelengthText } from './files'
import { wirePresets } from './presets'
import { drawProfile, drawPsf, drawPupil } from './plots'
import { MAX_SETTINGS_BYTES, SettingsError, parseSettings, serializeSettings } from './settings'
import { ZOOM_STEP, fitFov, wheelFactor, zoomFov } from './zoom'

buildControls()
const fovSpec = (): NonNullable<ReturnType<typeof specById>> => {
  const spec = specById('fov')
  if (!spec) throw new Error('Missing fov spec')
  return spec
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
    label: wavelengthText(params),
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
  syncVanes()
  schedule()
}

/* ---------- events ---------- */

$('controls').addEventListener('input', onInput)
$('controls').addEventListener('change', onInput)
$('controls').addEventListener('reset', () => {
  setSeed(1)
  resetDisplayControls()
  setTimeout(() => {
    syncSeg()
    onInput()
  }, 0)
})
$('cmap').addEventListener('change', onInput)
$('showring').addEventListener('change', render)
input('seg-on').addEventListener('change', syncSeg)
input('vane-each').addEventListener('change', () => {
  if (input('vane-each').checked) initVaneAngles()
})

$('seg-draw').addEventListener('click', () => {
  setSeed(getSeed() + 1)
  onInput()
})
$('clear-zern').addEventListener('click', () => {
  for (const name of ZERNIKE_NAMES) setValue(ZERNIKE_IDS[name], 0)
  onInput()
})
wirePresets(onInput)

/* ---------- zoom: the field of view is the zoom ---------- */

function zoomBy(factor: number): void {
  const p = readParams()
  const ld = lambdaOverDArcsec(p.diameterM, p.wavelengthNm)
  setValue('fov', zoomFov(p.fovArcsec, factor, ld, fovSpec()))
  onInput()
}
$('zoom-in').addEventListener('click', () => zoomBy(1 / ZOOM_STEP))
$('zoom-out').addEventListener('click', () => zoomBy(ZOOM_STEP))
$('zoom-reset').addEventListener('click', () => {
  const p = readParams()
  const ld = lambdaOverDArcsec(p.diameterM, p.wavelengthNm)
  setValue('fov', fitFov(ld, fovSpec()))
  onInput()
})
// Ctrl or ⌘ + wheel zooms the image; a plain wheel still scrolls the page.
$('psf').addEventListener(
  'wheel',
  (e) => {
    if (!e.ctrlKey && !e.metaKey) return
    e.preventDefault()
    zoomBy(wheelFactor(e.deltaY, e.deltaMode))
  },
  { passive: false },
)

/* ---------- saving images and settings ---------- */

function withFrame(action: (f: Shown, p: SimParams) => void): void {
  if (last) action(last.frame, last.params)
}
$('save-psf').addEventListener('click', () =>
  withFrame((f, p) => savePsfImage(f, p, psfOff, input('showring').checked)),
)
$('save-pupil').addEventListener('click', () => withFrame((f, p) => saveAperture(f, p, pupOff)))
$('save-profile').addEventListener('click', () => withFrame((f, p) => saveProfileImage(f, p)))

const settingsNote = $('settings-note')
function say(text: string, bad = false): void {
  settingsNote.textContent = text
  settingsNote.classList.toggle('bad', bad)
}
$('save-settings').addEventListener('click', () => {
  downloadText(serializeSettings(readUiState(), new Date()), SETTINGS_FILE_NAME)
  say('Settings saved.')
})
$('load-settings').addEventListener('click', () => $('settings-file').click())
$('settings-file').addEventListener('change', async () => {
  const file = input('settings-file').files?.[0]
  input('settings-file').value = '' // so that choosing the same file again still triggers a change
  if (!file) return
  try {
    if (file.size > MAX_SETTINGS_BYTES) throw new SettingsError('The file is too large to be a settings file.')
    const { state, notes } = parseSettings(await file.text())
    applyUiState(state)
    onInput()
    say(notes.length ? `Settings loaded. ${notes.join(' ')}` : 'Settings loaded.')
  } catch (err) {
    say(err instanceof SettingsError ? err.message : 'The file could not be read.', true)
  }
})

if (typeof ResizeObserver !== 'undefined') {
  const ro = new ResizeObserver(render)
  for (const id of ['psf', 'pupil', 'profile']) ro.observe($(id))
} else {
  window.addEventListener('resize', render)
}

syncSeg()
syncOutputs()
syncVanes()
schedule()
