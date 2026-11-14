/**
 * The complete, serialisable state of the lab (what the page sends to the worker), with its defaults.
 */
import { type CoronagraphSpec, DEFAULT_CORONAGRAPH } from './coronagraph.ts'
import { type AberrationSpec, NO_ABERRATIONS } from './optics.ts'
import { DEFAULT_PUPIL, type PupilSpec } from './pupils.ts'
import type { Planet, SystemSpec } from './train.ts'
import type { WfsKind } from './wfs/types.ts'

export type ControlKind = 'ao' | 'efc' | 'speckle-nulling'
export type Estimator = 'perfect' | 'pairwise' | 'scc'

export interface LabConfig {
  readonly npup: number
  readonly fov: number
  readonly wavelengthNm: number
  readonly bandwidth: number
  readonly nLambda: number
  readonly pupil: PupilSpec
  readonly coronagraph: CoronagraphSpec
  readonly aberrations: AberrationSpec
  readonly planets: readonly Planet[]
  readonly dm: { readonly nact: number; readonly coupling: number }
  readonly detector: { readonly noise: boolean; readonly peakPhotons: number; readonly readNoise: number; readonly seed: number }
  readonly wfs: {
    readonly kind: WfsKind
    readonly nsub: number
    readonly modulation: number
    readonly curvatureDistance: number
    readonly modes: number
  }
  readonly control: {
    readonly kind: ControlKind
    readonly gain: number
    readonly estimator: Estimator
    readonly iwa: number
    readonly owa: number
    readonly half: boolean
    readonly alpha: number
  }
}

export const DEFAULT_CONFIG: LabConfig = {
  npup: 64, fov: 14, wavelengthNm: 1600, bandwidth: 0, nLambda: 1,
  pupil: { ...DEFAULT_PUPIL, kind: 'circular' },
  coronagraph: DEFAULT_CORONAGRAPH,
  aberrations: { ...NO_ABERRATIONS, zernikeNm: [0, 0, 4, -3, 0, 2, 0, 0, 0, 0], screenRmsNm: 8, screenSlope: 2.5 },
  planets: [{ sep: 5, pa: 30, contrast: 1e-5 }],
  dm: { nact: 16, coupling: 0.15 },
  detector: { noise: false, peakPhotons: 1e9, readNoise: 3, seed: 11 },
  wfs: { kind: 'shack-hartmann', nsub: 8, modulation: 3, curvatureDistance: 0.05, modes: 30 },
  control: { kind: 'ao', gain: 0.5, estimator: 'pairwise', iwa: 3, owa: 7, half: true, alpha: 1e-3 },
}

/** The detector sampling (samples per λ0/D). */
export const DETECTOR_Q = 4

export function systemSpec(c: LabConfig): SystemSpec {
  return {
    npup: c.npup, q: DETECTOR_Q, fov: c.fov, wavelengthNm: c.wavelengthNm,
    bandwidth: c.bandwidth, nLambda: c.bandwidth > 0 ? c.nLambda : 1,
    pupil: c.pupil, coronagraph: c.coronagraph, aberrations: c.aberrations,
  }
}

/** Coronagraphs whose Lyot stop receives starlight outside the pupil, as the self-coherent camera requires. */
export function sccCompatible(c: CoronagraphSpec): boolean {
  return ['lyot', 'aplc', 'roddier', 'fqpm', 'vortex'].includes(c.kind)
}
