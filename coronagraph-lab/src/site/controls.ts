/**
 * Parameter controls: a declarative list (id, label, range, how to read and write the configuration),
 * turned into `.field` rows inside the fieldsets of the page. `expert` rows are hidden in Beginner mode,
 * `show` hides rows that do not apply to the current choice.
 */
import type { LabConfig } from '../lib/config.ts'
import { CORONAGRAPH_KINDS, type CoronagraphSpec, DEFAULT_LYOT_OUTER } from '../lib/coronagraph.ts'
import type { AberrationSpec } from '../lib/optics.ts'
import type { PupilSpec } from '../lib/pupils.ts'

type Get = (c: LabConfig) => number | string | boolean
type Set = (c: LabConfig, v: number | string | boolean) => LabConfig

export interface ControlSpec {
  readonly id: string
  readonly group: string
  readonly label: string
  readonly type: 'range' | 'select' | 'check'
  readonly expert?: boolean
  readonly show?: (c: LabConfig) => boolean
  readonly min?: number
  readonly max?: number
  readonly step?: number
  /** Logarithmic slider: the slider holds log10 of the value. */
  readonly log?: boolean
  readonly options?: readonly (readonly [string, string])[]
  readonly fmt?: (v: number) => string
  readonly get: Get
  readonly set: Set
}

const cor = (c: LabConfig, p: Partial<CoronagraphSpec>): LabConfig => ({ ...c, coronagraph: { ...c.coronagraph, ...p } })
const pup = (c: LabConfig, p: Partial<PupilSpec>): LabConfig => ({ ...c, pupil: { ...c.pupil, ...p } })
const ab = (c: LabConfig, p: Partial<AberrationSpec>): LabConfig => ({ ...c, aberrations: { ...c.aberrations, ...p } })
const num = (v: number | string | boolean) => Number(v)
const has = (...k: string[]) => (c: LabConfig) => k.includes(c.coronagraph.kind)
const wfsIs = (...k: string[]) => (c: LabConfig) => k.includes(c.wfs.kind)
const f = (d: number, unit = '') => (v: number) => `${v.toFixed(d)}${unit}`
const SUP: Readonly<Record<string, string>> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }
/** 3.2 × 10⁻⁶ style. */
export const sci = (v: number): string => {
  if (!(v > 0)) return '0'
  const e = Math.floor(Math.log10(v) + 1e-9)
  const m = v / 10 ** e
  const exp = String(e).split('').map((ch) => SUP[ch] ?? ch).join('')
  return Math.abs(m - 1) < 0.05 ? `10${exp}` : `${m.toFixed(1)} × 10${exp}`
}

export const CORONAGRAPH_LABELS: Readonly<Record<string, string>> = {
  none: 'No coronagraph', lyot: 'Classical Lyot', aplc: 'Apodized pupil Lyot (APLC)', bandlimited: 'Band-limited Lyot',
  shaped: 'Shaped pupil', roddier: 'Roddier π phase mask', fqpm: 'Four-quadrant phase mask', vortex: 'Vortex', app: 'Apodizing phase plate',
}

function zern(j: number, name: string, ncpa = false): ControlSpec {
  const key = ncpa ? 'ncpaZernikeNm' : 'zernikeNm'
  return {
    id: `${ncpa ? 'ncpa' : 'z'}${j}`, group: ncpa ? 'g-ncpa' : 'g-zern', label: `${name} (Z${j})`, type: 'range', expert: true,
    min: -40, max: 40, step: 1, fmt: f(0, ' nm'),
    get: (c) => c.aberrations[key][j - 2],
    set: (c, v) => ab(c, { [key]: c.aberrations[key].map((x, i) => (i === j - 2 ? num(v) : x)) }),
  }
}

function planet(i: number, beginner: boolean): ControlSpec[] {
  const exists = (c: LabConfig) => c.planets.length > i
  const upd = (c: LabConfig, p: Partial<LabConfig['planets'][number]>) => ({ ...c, planets: c.planets.map((x, k) => (k === i ? { ...x, ...p } : x)) })
  const n = i + 1
  return [
    { id: `p${n}-sep`, group: 'g-planet', label: `Planet ${n} separation`, type: 'range', expert: !beginner, show: exists, min: 0.5, max: 14, step: 0.25, fmt: f(2, ' λ/D'), get: (c) => c.planets[i]?.sep ?? 5, set: (c, v) => upd(c, { sep: num(v) }) },
    { id: `p${n}-pa`, group: 'g-planet', label: `Planet ${n} position angle`, type: 'range', expert: true, show: exists, min: 0, max: 360, step: 5, fmt: f(0, '°'), get: (c) => c.planets[i]?.pa ?? 0, set: (c, v) => upd(c, { pa: num(v) }) },
    { id: `p${n}-flux`, group: 'g-planet', label: `Planet ${n} flux ratio`, type: 'range', expert: !beginner, show: exists, min: -10, max: -2, step: 0.25, log: true, fmt: sci, get: (c) => c.planets[i]?.contrast ?? 1e-5, set: (c, v) => upd(c, { contrast: num(v) }) },
  ]
}

export const CONTROLS: readonly ControlSpec[] = [
  // Telescope and light
  { id: 'pupil', group: 'g-tel', label: 'Telescope pupil', type: 'select', options: [['circular', 'Clear circular'], ['obscured', 'Obscured + spiders'], ['segmented', 'Segmented (hexagons)']],
    get: (c) => c.pupil.kind, set: (c, v) => pup(c, { kind: v as PupilSpec['kind'] }) },
  { id: 'obsc', group: 'g-tel', label: 'Central obstruction', type: 'range', expert: true, show: (c) => c.pupil.kind !== 'circular', min: 0, max: 0.4, step: 0.01, fmt: f(2, ' D'),
    get: (c) => c.pupil.obscuration, set: (c, v) => pup(c, { obscuration: num(v) }) },
  { id: 'spiders', group: 'g-tel', label: 'Spider vanes', type: 'select', expert: true, show: (c) => c.pupil.kind === 'obscured', options: [['0', 'None'], ['3', '3'], ['4', '4'], ['6', '6']],
    get: (c) => String(c.pupil.spiders), set: (c, v) => pup(c, { spiders: num(v) }) },
  { id: 'spiderw', group: 'g-tel', label: 'Vane width', type: 'range', expert: true, show: (c) => c.pupil.kind === 'obscured', min: 0.002, max: 0.03, step: 0.001, fmt: f(3, ' D'),
    get: (c) => c.pupil.spiderWidth, set: (c, v) => pup(c, { spiderWidth: num(v) }) },
  { id: 'rings', group: 'g-tel', label: 'Segment rings', type: 'range', expert: true, show: (c) => c.pupil.kind === 'segmented', min: 1, max: 4, step: 1, fmt: f(0),
    get: (c) => c.pupil.rings, set: (c, v) => pup(c, { rings: num(v) }) },
  { id: 'gap', group: 'g-tel', label: 'Segment gap', type: 'range', expert: true, show: (c) => c.pupil.kind === 'segmented', min: 0, max: 0.06, step: 0.005, fmt: f(3),
    get: (c) => c.pupil.gap, set: (c, v) => pup(c, { gap: num(v) }) },
  { id: 'lam', group: 'g-tel', label: 'Central wavelength λ0', type: 'range', expert: true, min: 500, max: 2200, step: 10, fmt: f(0, ' nm'),
    get: (c) => c.wavelengthNm, set: (c, v) => ({ ...c, wavelengthNm: num(v) }) },
  { id: 'band', group: 'g-tel', label: 'Bandwidth Δλ/λ0', type: 'range', expert: true, min: 0, max: 0.3, step: 0.01, fmt: (v) => `${(v * 100).toFixed(0)} %`,
    get: (c) => c.bandwidth, set: (c, v) => ({ ...c, bandwidth: num(v) }) },
  { id: 'nlam', group: 'g-tel', label: 'Wavelength samples', type: 'range', expert: true, show: (c) => c.bandwidth > 0, min: 3, max: 9, step: 2, fmt: f(0),
    get: (c) => c.nLambda, set: (c, v) => ({ ...c, nLambda: num(v) }) },
  { id: 'npup', group: 'g-tel', label: 'Pupil sampling', type: 'select', expert: true, options: [['64', '64 px (fast)'], ['128', '128 px (fine)']],
    get: (c) => String(c.npup), set: (c, v) => ({ ...c, npup: num(v) }) },
  { id: 'fov', group: 'g-tel', label: 'Detector half-field', type: 'range', expert: true, min: 8, max: 20, step: 1, fmt: f(0, ' λ/D'),
    get: (c) => c.fov, set: (c, v) => ({ ...c, fov: num(v) }) },
  // Coronagraph
  { id: 'cor', group: 'g-cor', label: 'Coronagraph', type: 'select', options: CORONAGRAPH_KINDS.map((k) => [k, CORONAGRAPH_LABELS[k]] as const),
    get: (c) => c.coronagraph.kind,
    set: (c, v) => { const k = v as CoronagraphSpec['kind']; return cor(c, { kind: k, lyotOuter: DEFAULT_LYOT_OUTER[k], maskRadius: k === 'roddier' ? 0.53 : k === 'aplc' ? 2 : 3 }) } },
  { id: 'charge', group: 'g-cor', label: 'Vortex charge', type: 'select', show: has('vortex'), options: [['2', '2'], ['4', '4'], ['6', '6']],
    get: (c) => String(c.coronagraph.charge), set: (c, v) => cor(c, { charge: num(v) }) },
  { id: 'rmask', group: 'g-cor', label: 'Mask radius', type: 'range', expert: true, show: has('lyot', 'aplc', 'roddier'), min: 0.3, max: 6, step: 0.05, fmt: f(2, ' λ/D'),
    get: (c) => c.coronagraph.maskRadius, set: (c, v) => cor(c, { maskRadius: num(v) }) },
  { id: 'eps', group: 'g-cor', label: 'Band-limit ε', type: 'range', expert: true, show: has('bandlimited'), min: 0.1, max: 0.4, step: 0.01, fmt: f(2, ' D'),
    get: (c) => c.coronagraph.blEpsilon, set: (c, v) => cor(c, { blEpsilon: num(v) }) },
  { id: 'lyout', group: 'g-cor', label: 'Lyot stop diameter', type: 'range', expert: true, show: has('lyot', 'aplc', 'roddier', 'fqpm', 'vortex', 'bandlimited'), min: 0.5, max: 1, step: 0.01, fmt: f(2, ' D'),
    get: (c) => c.coronagraph.lyotOuter, set: (c, v) => cor(c, { lyotOuter: num(v) }) },
  { id: 'lyin', group: 'g-cor', label: 'Lyot stop central block', type: 'range', expert: true, show: has('lyot', 'aplc', 'roddier', 'fqpm', 'vortex'), min: 0, max: 0.5, step: 0.01, fmt: f(2, ' D'),
    get: (c) => c.coronagraph.lyotInner, set: (c, v) => cor(c, { lyotInner: num(v) }) },
  { id: 'spband', group: 'g-cor', label: 'Shaped pupil band b', type: 'range', expert: true, show: has('shaped'), min: 2, max: 6, step: 0.25, fmt: f(2, ' λ/D'),
    get: (c) => c.coronagraph.shapedBand, set: (c, v) => cor(c, { shapedBand: num(v) }) },
  { id: 'spopen', group: 'g-cor', label: 'Shaped pupil openings', type: 'range', expert: true, show: has('shaped'), min: 1, max: 6, step: 1, fmt: f(0),
    get: (c) => c.coronagraph.shapedOpenings, set: (c, v) => cor(c, { shapedOpenings: num(v) }) },
  { id: 'appiwa', group: 'g-cor', label: 'APP dark hole inner edge', type: 'range', expert: true, show: has('app'), min: 1.5, max: 4, step: 0.25, fmt: f(2, ' λ/D'),
    get: (c) => c.coronagraph.appIwa, set: (c, v) => cor(c, { appIwa: num(v) }) },
  { id: 'appowa', group: 'g-cor', label: 'APP dark hole outer edge', type: 'range', expert: true, show: has('app'), min: 6, max: 14, step: 0.5, fmt: f(1, ' λ/D'),
    get: (c) => c.coronagraph.appOwa, set: (c, v) => cor(c, { appOwa: num(v) }) },
  { id: 'vapp', group: 'g-cor', label: 'Vector APP (geometric phase)', type: 'check', expert: true, show: has('app'),
    get: (c) => c.coronagraph.appVector, set: (c, v) => cor(c, { appVector: Boolean(v) }) },
  { id: 'vchan', group: 'g-cor', label: 'vAPP channel', type: 'select', expert: true, show: (c) => c.coronagraph.kind === 'app' && c.coronagraph.appVector,
    options: [['left', 'Left circular (hole on the right)'], ['right', 'Right circular (hole on the left)'], ['sum', 'Both, unseparated']],
    get: (c) => c.coronagraph.vappChannel, set: (c, v) => cor(c, { vappChannel: v as CoronagraphSpec['vappChannel'] }) },
  { id: 'vleak', group: 'g-cor', label: 'vAPP leakage', type: 'range', expert: true, show: (c) => c.coronagraph.kind === 'app' && c.coronagraph.appVector, min: 0, max: 0.1, step: 0.005, fmt: (v) => `${(v * 100).toFixed(1)} %`,
    get: (c) => c.coronagraph.vappLeakage, set: (c, v) => cor(c, { vappLeakage: num(v) }) },
  // Aberrations
  { id: 'screen', group: 'g-ab', label: 'Random wavefront error', type: 'range', min: 0, max: 40, step: 1, fmt: f(0, ' nm RMS'),
    get: (c) => c.aberrations.screenRmsNm, set: (c, v) => ab(c, { screenRmsNm: num(v) }) },
  { id: 'slope', group: 'g-ab', label: 'Screen PSD slope α', type: 'range', expert: true, min: 1.5, max: 4, step: 0.1, fmt: f(1),
    get: (c) => c.aberrations.screenSlope, set: (c, v) => ab(c, { screenSlope: num(v) }) },
  { id: 'ampl', group: 'g-ab', label: 'Amplitude errors', type: 'range', expert: true, min: 0, max: 0.05, step: 0.002, fmt: (v) => `${(v * 100).toFixed(1)} % RMS`,
    get: (c) => c.aberrations.amplitudeRms, set: (c, v) => ab(c, { amplitudeRms: num(v) }) },
  zern(2, 'Tip'), zern(3, 'Tilt'), zern(4, 'Defocus'), zern(5, 'Astigmatism 45°'), zern(6, 'Astigmatism 0°'),
  zern(7, 'Coma y'), zern(8, 'Coma x'), zern(9, 'Trefoil y'), zern(10, 'Trefoil x'), zern(11, 'Spherical'),
  { id: 'ncpa', group: 'g-ncpa', label: 'Random NCPA', type: 'range', min: 0, max: 20, step: 1, fmt: f(0, ' nm RMS'),
    get: (c) => c.aberrations.ncpaRmsNm, set: (c, v) => ab(c, { ncpaRmsNm: num(v) }) },
  zern(4, 'NCPA defocus', true), zern(5, 'NCPA astigmatism 45°', true), zern(6, 'NCPA astigmatism 0°', true), zern(8, 'NCPA coma x', true),
  // Planets
  { id: 'nplanets', group: 'g-planet', label: 'Number of planets', type: 'select', expert: true, options: [['0', 'None'], ['1', '1'], ['2', '2'], ['3', '3']],
    get: (c) => String(c.planets.length),
    set: (c, v) => { const n = num(v); const base = [{ sep: 5, pa: 30, contrast: 1e-5 }, { sep: 8, pa: 200, contrast: 1e-6 }, { sep: 2.5, pa: 110, contrast: 1e-4 }]; return { ...c, planets: base.slice(0, n).map((p, i) => c.planets[i] ?? p) } } },
  ...planet(0, true), ...planet(1, false), ...planet(2, false),
  // Wavefront sensing and control
  { id: 'wfs', group: 'g-wfs', label: 'Wavefront sensor', type: 'select',
    options: [['shack-hartmann', 'Shack–Hartmann (pupil)'], ['pyramid', 'Pyramid (pupil)'], ['zernike', 'Zernike (pupil)'], ['curvature', 'Curvature (pupil)'], ['pairwise', 'Pairwise probing (focal)'], ['phase-diversity', 'Phase diversity (focal)'], ['scc', 'Self-coherent camera (focal)']],
    get: (c) => c.wfs.kind,
    set: (c, v) => {
      const kind = v as LabConfig['wfs']['kind']
      const focal = kind === 'pairwise' || kind === 'scc'
      const control = focal ? { ...c.control, kind: c.control.kind === 'ao' ? 'efc' as const : c.control.kind, estimator: kind === 'scc' ? 'scc' as const : 'pairwise' as const } : { ...c.control, kind: 'ao' as const }
      return { ...c, wfs: { ...c.wfs, kind }, control }
    } },
  { id: 'nsub', group: 'g-wfs', label: 'Subapertures across', type: 'select', expert: true, show: wfsIs('shack-hartmann'), options: [['4', '4'], ['8', '8'], ['16', '16']],
    get: (c) => String(c.wfs.nsub), set: (c, v) => ({ ...c, wfs: { ...c.wfs, nsub: num(v) } }) },
  { id: 'mod', group: 'g-wfs', label: 'Pyramid modulation', type: 'range', expert: true, show: wfsIs('pyramid'), min: 0, max: 6, step: 0.5, fmt: f(1, ' λ/D'),
    get: (c) => c.wfs.modulation, set: (c, v) => ({ ...c, wfs: { ...c.wfs, modulation: num(v) } }) },
  { id: 'zdist', group: 'g-wfs', label: 'Defocus distance z′', type: 'range', expert: true, show: wfsIs('curvature'), min: 0.01, max: 0.2, step: 0.01, fmt: f(2),
    get: (c) => c.wfs.curvatureDistance, set: (c, v) => ({ ...c, wfs: { ...c.wfs, curvatureDistance: num(v) } }) },
  { id: 'modes', group: 'g-wfs', label: 'Controlled modes', type: 'range', expert: true, show: wfsIs('shack-hartmann', 'pyramid', 'zernike', 'curvature'), min: 5, max: 50, step: 5, fmt: f(0),
    get: (c) => c.wfs.modes, set: (c, v) => ({ ...c, wfs: { ...c.wfs, modes: num(v) } }) },
  { id: 'ctl', group: 'g-ctl', label: 'Control law', type: 'select', expert: true,
    options: [['ao', 'AO integrator (modal)'], ['efc', 'Electric field conjugation'], ['speckle-nulling', 'Speckle nulling']],
    get: (c) => c.control.kind, set: (c, v) => ({ ...c, control: { ...c.control, kind: v as LabConfig['control']['kind'] } }) },
  { id: 'est', group: 'g-ctl', label: 'EFC field estimate', type: 'select', expert: true, show: (c) => c.control.kind === 'efc',
    options: [['pairwise', 'Pairwise probing'], ['scc', 'Self-coherent camera'], ['perfect', 'Perfect knowledge (model)']],
    get: (c) => c.control.estimator, set: (c, v) => ({ ...c, control: { ...c.control, estimator: v as LabConfig['control']['estimator'] } }) },
  { id: 'gain', group: 'g-ctl', label: 'Loop gain', type: 'range', expert: true, min: 0.1, max: 1, step: 0.05, fmt: f(2),
    get: (c) => c.control.gain, set: (c, v) => ({ ...c, control: { ...c.control, gain: num(v) } }) },
  { id: 'dhiwa', group: 'g-ctl', label: 'Dark hole inner edge', type: 'range', expert: true, min: 1.5, max: 6, step: 0.5, fmt: f(1, ' λ/D'),
    get: (c) => c.control.iwa, set: (c, v) => ({ ...c, control: { ...c.control, iwa: num(v) } }) },
  { id: 'dhowa', group: 'g-ctl', label: 'Dark hole outer edge', type: 'range', expert: true, min: 4, max: 10, step: 0.5, fmt: f(1, ' λ/D'),
    get: (c) => c.control.owa, set: (c, v) => ({ ...c, control: { ...c.control, owa: num(v) } }) },
  { id: 'dhhalf', group: 'g-ctl', label: 'One-sided dark hole', type: 'check', expert: true,
    get: (c) => c.control.half, set: (c, v) => ({ ...c, control: { ...c.control, half: Boolean(v) } }) },
  { id: 'alpha', group: 'g-ctl', label: 'EFC regularisation α', type: 'range', expert: true, show: (c) => c.control.kind === 'efc', min: -6, max: -1, step: 0.25, log: true, fmt: sci,
    get: (c) => c.control.alpha, set: (c, v) => ({ ...c, control: { ...c.control, alpha: num(v) } }) },
  { id: 'nact', group: 'g-ctl', label: 'DM actuators across', type: 'select', expert: true, options: [['8', '8 × 8'], ['12', '12 × 12'], ['16', '16 × 16'], ['20', '20 × 20']],
    get: (c) => String(c.dm.nact), set: (c, v) => ({ ...c, dm: { ...c.dm, nact: num(v) } }) },
  { id: 'coupling', group: 'g-ctl', label: 'Actuator coupling', type: 'range', expert: true, min: 0.05, max: 0.3, step: 0.01, fmt: f(2),
    get: (c) => c.dm.coupling, set: (c, v) => ({ ...c, dm: { ...c.dm, coupling: num(v) } }) },
  // Detector
  { id: 'noise', group: 'g-det', label: 'Photon and read noise', type: 'check', expert: true,
    get: (c) => c.detector.noise, set: (c, v) => ({ ...c, detector: { ...c.detector, noise: Boolean(v) } }) },
  { id: 'photons', group: 'g-det', label: 'Photons in the PSF peak', type: 'range', expert: true, show: (c) => c.detector.noise, min: 4, max: 12, step: 0.5, log: true, fmt: sci,
    get: (c) => c.detector.peakPhotons, set: (c, v) => ({ ...c, detector: { ...c.detector, peakPhotons: num(v) } }) },
  { id: 'rn', group: 'g-det', label: 'Read noise', type: 'range', expert: true, show: (c) => c.detector.noise, min: 0, max: 20, step: 0.5, fmt: f(1, ' e⁻'),
    get: (c) => c.detector.readNoise, set: (c, v) => ({ ...c, detector: { ...c.detector, readNoise: num(v) } }) },
]

/** Build the rows inside their fieldsets. `onChange` receives the new configuration. */
export function buildControls(getConfig: () => LabConfig, onChange: (c: LabConfig) => void): () => void {
  const rows: { spec: ControlSpec; row: HTMLElement; input: HTMLInputElement | HTMLSelectElement; out: HTMLOutputElement | null }[] = []
  for (const spec of CONTROLS) {
    const host = document.getElementById(spec.group)
    if (!host) continue
    const row = document.createElement('div')
    row.className = spec.type === 'check' ? 'field chk-field' : 'field'
    if (spec.expert) row.classList.add('expert-only')
    const label = document.createElement('label')
    label.htmlFor = spec.id
    label.textContent = spec.label
    let input: HTMLInputElement | HTMLSelectElement
    let out: HTMLOutputElement | null = null
    if (spec.type === 'select') {
      const s = document.createElement('select')
      for (const [v, t] of spec.options ?? []) { const o = document.createElement('option'); o.value = v; o.textContent = t; s.appendChild(o) }
      input = s
    } else {
      const i = document.createElement('input')
      i.type = spec.type === 'check' ? 'checkbox' : 'range'
      if (spec.type === 'range') { i.min = String(spec.min); i.max = String(spec.max); i.step = String(spec.step) }
      input = i
      if (spec.type === 'range') { out = document.createElement('output'); out.htmlFor.add(spec.id) }
    }
    input.id = spec.id
    const update = () => {
      const raw = input instanceof HTMLInputElement && input.type === 'checkbox' ? input.checked : input instanceof HTMLInputElement ? Number(input.value) : input.value
      const v = spec.log && typeof raw === 'number' ? 10 ** raw : raw
      onChange(spec.set(getConfig(), v))
    }
    input.addEventListener(spec.type === 'range' ? 'input' : 'change', update)
    row.append(label, input)
    if (out) row.appendChild(out)
    host.appendChild(row)
    rows.push({ spec, row, input, out })
  }
  // Refresh values and visibility from the configuration.
  return () => {
    const c = getConfig()
    for (const { spec, row, input, out } of rows) {
      row.hidden = spec.show ? !spec.show(c) : false
      const v = spec.get(c)
      if (input instanceof HTMLInputElement && input.type === 'checkbox') input.checked = Boolean(v)
      else if (input instanceof HTMLInputElement) {
        const x = spec.log ? Math.log10(Number(v)) : Number(v)
        if (document.activeElement !== input) input.value = String(x)
        if (out) out.textContent = spec.fmt ? spec.fmt(Number(v)) : String(v)
        input.setAttribute('aria-valuetext', out?.textContent ?? String(v))
      } else input.value = String(v)
    }
  }
}
