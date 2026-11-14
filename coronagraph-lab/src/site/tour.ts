/** Beginner walkthrough: each step sets a configuration, highlights part of the diagram and explains it. */
import { DEFAULT_CONFIG, type LabConfig } from '../lib/config.ts'
import { DEFAULT_LYOT_OUTER } from '../lib/coronagraph.ts'
import type { PlaneId } from './diagram.ts'

export interface TourStep {
  readonly title: string
  readonly text: string
  readonly highlight: readonly PlaneId[]
  readonly config: (c: LabConfig) => LabConfig
  /** Run the control loop after applying the step. */
  readonly runLoop?: number
  readonly resetDm?: boolean
}

const corOf = (c: LabConfig, kind: LabConfig['coronagraph']['kind']) =>
  ({ ...c, coronagraph: { ...c.coronagraph, kind, charge: 2, lyotOuter: DEFAULT_LYOT_OUTER[kind], maskRadius: kind === 'aplc' ? 2 : 3 } })
const perfect = (c: LabConfig): LabConfig => ({ ...c, aberrations: { ...c.aberrations, screenRmsNm: 0, zernikeNm: c.aberrations.zernikeNm.map(() => 0), ncpaRmsNm: 0, ncpaZernikeNm: c.aberrations.ncpaZernikeNm.map(() => 0), amplitudeRms: 0 } })
const base: LabConfig = { ...DEFAULT_CONFIG, planets: [{ sep: 4, pa: 30, contrast: 1e-5 }] }
/** Mostly low-order errors (18 nm RMS), which a 30-mode AO loop can correct. */
const rough = { ...DEFAULT_CONFIG.aberrations, zernikeNm: [0, 0, 10, -8, 6, 5, -4, 4, 0, 3], screenRmsNm: 4, screenSlope: 3.5 }

export const TOUR: readonly TourStep[] = [
  {
    title: '1. A star and a faint planet',
    text: 'The image on the right is what a perfect telescope sees: a bright star surrounded by rings of diffracted light. A planet 100 000 times fainter sits 4 λ/D from the star (λ/D is the telescope’s natural angular unit). Its circle marks where it is: the rings there are about 100 times brighter than the planet, so it is completely lost.',
    highlight: ['D'], resetDm: true, config: () => perfect(corOf(base, 'none')),
  },
  {
    title: '2. Block the star: the Lyot coronagraph',
    text: 'An opaque spot (plane B) blocks the core of the star image, and a stop in the next pupil image (plane C) removes the light diffracted around the spot. Click plane C in the diagram: the leftover starlight forms a bright ring at the edge of the pupil, which the stop cuts away. The star is now about 1000 times dimmer.',
    highlight: ['B', 'C'], resetDm: true, config: () => perfect(corOf(base, 'lyot')),
  },
  {
    title: '3. Phase masks: the vortex',
    text: 'Instead of blocking light, a vortex mask changes its phase in a spiral around the centre. For a perfect circular telescope this sends all of the starlight outside the pupil, where the Lyot stop removes it: an almost complete null, while the planet passes through.',
    highlight: ['B', 'C'], resetDm: true, config: () => perfect(corOf(base, 'vortex')),
  },
  {
    title: '4. Real optics are not perfect',
    text: 'Now the optics have small errors, about 18 nanometres in total. Starlight leaks through the coronagraph as a cloud of “speckles” that can look like planets. Compare the contrast curve with the bare telescope below the image.',
    highlight: ['A', 'D'], resetDm: true, config: () => corOf({ ...base, aberrations: rough }, 'vortex'),
  },
  {
    title: '5. Measure and correct: adaptive optics',
    text: 'A beam splitter sends part of the light to a Shack–Hartmann wavefront sensor. It measures the errors and a deformable mirror (DM) bends to cancel them. Watch the loop run: the residual wavefront error drops and the speckles fade.',
    highlight: ['DM', 'WFS'], resetDm: true, runLoop: 10,
    config: () => corOf({ ...base, aberrations: rough, wfs: { ...DEFAULT_CONFIG.wfs, kind: 'shack-hartmann' }, control: { ...DEFAULT_CONFIG.control, kind: 'ao' } }, 'vortex'),
  },
  {
    title: '6. Errors the sensor cannot see',
    text: 'Some errors sit in the camera arm only, after the beam splitter (“non-common-path aberrations”). The sensor never sees them, so the loop cannot remove them: speckles remain even with the loop running.',
    highlight: ['WFS', 'D'], resetDm: true, runLoop: 10,
    config: () => corOf({ ...base, aberrations: { ...rough, ncpaRmsNm: 6 }, wfs: { ...DEFAULT_CONFIG.wfs, kind: 'shack-hartmann' }, control: { ...DEFAULT_CONFIG.control, kind: 'ao' } }, 'vortex'),
  },
  {
    title: '7. Dig a dark hole',
    text: 'Now the science camera itself is the sensor. The DM adds small probe ripples, the change in the image reveals the speckle field, and electric field conjugation (EFC) shapes the DM to cancel it in a region on one side of the star. The planet at 4 λ/D appears clearly.',
    highlight: ['DM', 'D'], resetDm: true, runLoop: 8,
    config: () => corOf({ ...base, aberrations: { ...DEFAULT_CONFIG.aberrations, screenRmsNm: 8, ncpaRmsNm: 4 }, wfs: { ...DEFAULT_CONFIG.wfs, kind: 'pairwise' }, control: { ...DEFAULT_CONFIG.control, kind: 'efc', estimator: 'pairwise' } }, 'vortex'),
  },
]

/** True when the optics have any wavefront or amplitude error. */
export function hasErrors(c: LabConfig): boolean {
  const a = c.aberrations
  return a.screenRmsNm > 0 || a.ncpaRmsNm > 0 || a.amplitudeRms > 0 || a.zernikeNm.some((z) => z !== 0) || a.ncpaZernikeNm.some((z) => z !== 0)
}

/** Telescope shapes offered as variations of a tour step (one is always selected). */
export const PUPIL_CHOICES = [
  { kind: 'circular', label: 'Clear circular', tip: 'A clear circular mirror: the vortex and four-quadrant masks reach a full null.' },
  { kind: 'obscured', label: 'Obscured + spiders', tip: 'A secondary mirror and four spider vanes block part of the pupil, as on most large telescopes.' },
  { kind: 'segmented', label: 'Segmented mirror', tip: 'A mirror made of hexagonal segments with gaps, like Keck or JWST.' },
] as const

export function withPupil(c: LabConfig, kind: LabConfig['pupil']['kind']): LabConfig {
  if (kind === 'obscured') return { ...c, pupil: { ...c.pupil, kind, obscuration: 0.14, spiders: 4, spiderWidth: 0.01 } }
  if (kind === 'segmented') return { ...c, pupil: { ...c.pupil, kind, rings: 2, gap: 0.02, obscuration: 0.15 } }
  return { ...c, pupil: { ...c.pupil, kind } }
}

/** On/off variations of a tour step. Turning one off restores what the step itself uses. */
export interface Toggle {
  readonly id: string
  readonly label: string
  readonly tip: string
  readonly isOn: (c: LabConfig) => boolean
  readonly set: (c: LabConfig, on: boolean, step: LabConfig) => LabConfig
}

export const TOGGLES: readonly Toggle[] = [
  {
    id: 'var-errors', label: 'Optical errors', tip: 'Small wavefront errors in the optics. Off: a perfect telescope.',
    isOn: hasErrors,
    set: (c, on, step) => ({ ...c, aberrations: on ? (hasErrors(step) ? step.aberrations : rough) : perfect(c).aberrations }),
  },
  {
    id: 'var-band', label: '20 % bandwidth', tip: 'Add up 5 wavelengths across a 20 % band instead of one wavelength.',
    isOn: (c) => c.bandwidth > 0,
    set: (c, on) => ({ ...c, bandwidth: on ? 0.2 : 0, nLambda: 5 }),
  },
]
