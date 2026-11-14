/** Shared system definitions for the physics tests. */
import { type CoronagraphKind, type CoronagraphSpec, DEFAULT_CORONAGRAPH, DEFAULT_LYOT_OUTER } from './coronagraph.ts'
import { NO_ABERRATIONS } from './optics.ts'
import type { PupilSpec } from './pupils.ts'
import type { SystemSpec } from './train.ts'

export const CIRCULAR: PupilSpec = { kind: 'circular', obscuration: 0, spiders: 0, spiderWidth: 0, rings: 0, gap: 0 }

/** Default mask sizes used by the tests: the classical 3 λ/D Lyot occulter, a 4.7 λ/D-diameter APLC mask and
 *  the Roddier disk of 0.53 λ/D radius that balances the field inside and outside the disk for a circular pupil. */
export function corSpec(kind: CoronagraphKind, over: Partial<CoronagraphSpec> = {}): CoronagraphSpec {
  const maskRadius = kind === 'roddier' ? 0.53 : kind === 'aplc' ? 2.35 : 3
  return { ...DEFAULT_CORONAGRAPH, kind, lyotOuter: DEFAULT_LYOT_OUTER[kind], maskRadius, ...over }
}

export function system(kind: CoronagraphKind, over: Partial<SystemSpec> = {}, cor: Partial<CoronagraphSpec> = {}): SystemSpec {
  return {
    npup: 64, q: 4, fov: 12, wavelengthNm: 1600, bandwidth: 0, nLambda: 1,
    pupil: CIRCULAR, coronagraph: corSpec(kind, cor), aberrations: NO_ABERRATIONS, ...over,
  }
}
