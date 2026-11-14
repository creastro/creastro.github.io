/**
 * Builds help.js: window.SIM_HELP for the shared explain.js (tooltips, clickable parameter names, theory dialog)
 * and window.CORONAGRAPH_LAB_CONTENT (info panels and references) for the page.
 */
import { CORONAGRAPH_INFO } from '../content/coronagraphInfo.ts'
import type { InfoEntry } from '../content/infoTypes.ts'
import { REFERENCES, type Reference, fullCite } from '../content/references.ts'
import { CONTROL_INFO, SENSOR_INFO } from '../content/sensorInfo.ts'
import { PARAMETER_TOPICS, TIPS } from './helpTopics.ts'

interface Topic { title: string; what: string; theory: string[]; formulas: { tex: string; note: string }[]; sim: string; refs: { c: string; u: string }[]; see: string[] }

const ref = (k: string): { c: string; u: string } => {
  const r = REFERENCES.find((x) => x.key === k) as Reference
  return { c: fullCite(r), u: `https://doi.org/${r.doi}` }
}

function fromInfo(e: InfoEntry, see: string[]): Topic {
  return {
    title: e.name, what: e.beginner,
    theory: [...e.expert, `Strengths: ${e.strengths.join(' ')}`, `Limitations: ${e.limitations.join(' ')}`, `Used on: ${e.instruments.join('; ')}.`],
    formulas: e.formulas.map((f) => ({ ...f })), sim: e.sim, refs: e.refs.map(ref), see,
  }
}

const topics: Record<string, Topic> = {}
for (const e of CORONAGRAPH_INFO) topics[e.id] = fromInfo(e, ['coronagraphs', 'contrast', 'throughput'])
for (const e of SENSOR_INFO) topics[e.id] = fromInfo(e, ['sensors', 'loop'])
for (const e of CONTROL_INFO) topics[e.id] = fromInfo(e, ['loop', 'darkhole'])
for (const [k, t] of Object.entries(PARAMETER_TOPICS)) topics[k] = { ...t, refs: t.refs.map(ref) }

const bind: Record<string, string> = {
  pupil: 'pupil', obsc: 'pupil', spiders: 'pupil', spiderw: 'pupil', rings: 'pupil', gap: 'pupil',
  lam: 'wavelength', band: 'wavelength', nlam: 'wavelength', npup: 'numerics', fov: 'numerics',
  cor: 'coronagraphs', charge: 'vortex', rmask: 'lyot', eps: 'bandlimited', lyout: 'lyotstop', lyin: 'lyotstop',
  spband: 'shaped', spopen: 'shaped', appiwa: 'app', appowa: 'app', vapp: 'app', vchan: 'app', vleak: 'app',
  screen: 'aberrations', slope: 'aberrations', ampl: 'aberrations', ncpa: 'ncpa', nplanets: 'planets',
  wfs: 'sensors', nsub: 'shack-hartmann', mod: 'pyramid', zdist: 'curvature', modes: 'ao',
  ctl: 'loop', est: 'pairwise', gain: 'loop', dhiwa: 'darkhole', dhowa: 'darkhole', dhhalf: 'darkhole', alpha: 'efc',
  nact: 'dm', coupling: 'dm', noise: 'noise', photons: 'noise', rn: 'noise', cmap: 'image', scale: 'image', range: 'image',
}
for (let j = 2; j <= 11; j++) bind[`z${j}`] = 'aberrations'
for (const j of [4, 5, 6, 8]) bind[`ncpa${j}`] = 'ncpa'
for (const n of [1, 2, 3]) for (const s of ['sep', 'pa', 'flux']) bind[`p${n}-${s}`] = 'planets'

const panels: Record<string, string> = {
  't-train': 'planes', 't-image': 'image', 't-curves': 'contrast', 't-wfs': 'sensors', 't-loop': 'loop',
  't-read': 'contrast', 't-controls': 'basics', 't-info': 'coronagraphs', 't-bib': 'numerics', 't-tour': 'basics',
}

const w = window as unknown as Record<string, unknown>
w.SIM_HELP = { tips: TIPS, bind, panels, topics }
w.CORONAGRAPH_LAB_CONTENT = { coronagraphs: CORONAGRAPH_INFO, sensors: SENSOR_INFO, control: CONTROL_INFO, references: REFERENCES }
