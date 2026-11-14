/**
 * The coronagraphs: each is described by the elements it puts in the beam (apodizer or phase plate in
 * plane A, focal-plane mask in plane B, Lyot stop in plane C) and by how light goes from A to C.
 */
import { type Field, cloneField, pupilCoords } from './field.ts'
import { type MaskFn, babinetGrid, babinetPropagate, embed, multiscaleGrid, multiscalePropagate } from './focalMask.ts'
import type { Grid2 } from './mft.ts'
import { aplcApodizer, appPhase, shapedPupil } from './designs.ts'
import { type PupilSpec, makeLyotStop, makePupil } from './pupils.ts'

export const CORONAGRAPH_KINDS = ['none', 'lyot', 'aplc', 'bandlimited', 'shaped', 'roddier', 'fqpm', 'vortex', 'app'] as const
export type CoronagraphKind = (typeof CORONAGRAPH_KINDS)[number]

export interface CoronagraphSpec {
  readonly kind: CoronagraphKind
  /** Occulter radius in λ0/D (Lyot, APLC) or phase-disk radius (Roddier). */
  readonly maskRadius: number
  /** Lyot stop outer diameter and central obstruction, fractions of D. */
  readonly lyotOuter: number
  readonly lyotInner: number
  /** Band-limited mask: width of the pupil-plane kernel, as a fraction of D (the Lyot stop shrinks by this much). */
  readonly blEpsilon: number
  /** Vortex topological charge. */
  readonly charge: number
  /** Shaped pupil: half-width (λ/D) of the band in which the prolate pattern is concentrated. */
  readonly shapedBand: number
  /** Shaped pupil: number of stacked openings (more openings widen the dark zones in the v direction). */
  readonly shapedOpenings: number
  /** APP dark hole: inner and outer radius (λ0/D). */
  readonly appIwa: number
  readonly appOwa: number
  /** Vector APP: geometric (achromatic) phase, two circular-polarisation channels with mirrored dark holes. */
  readonly appVector: boolean
  readonly vappChannel: 'left' | 'right' | 'sum'
  /** vAPP polarisation leakage: fraction of the light that passes with no phase (adds a normal PSF). */
  readonly vappLeakage: number
}

export const DEFAULT_CORONAGRAPH: CoronagraphSpec = {
  kind: 'vortex', maskRadius: 2.5, lyotOuter: 0.95, lyotInner: 0, blEpsilon: 0.2, charge: 2,
  shapedBand: 4, shapedOpenings: 4, appIwa: 2.5, appOwa: 10, appVector: false, vappChannel: 'left', vappLeakage: 0.01,
}

/** Default Lyot stop for each coronagraph (outer diameter as a fraction of D). */
export const DEFAULT_LYOT_OUTER: Readonly<Record<CoronagraphKind, number>> = {
  none: 1, lyot: 0.8, aplc: 1, bandlimited: 1, shaped: 1, roddier: 0.9, fqpm: 0.95, vortex: 0.95, app: 1,
}

export interface Coronagraph {
  readonly spec: CoronagraphSpec
  /** Pupil grid size and Lyot-plane grid size (the Lyot plane is padded to show light outside D). */
  readonly n: number
  readonly nC: number
  readonly pupil: Float64Array
  /** Amplitude apodizer (APLC) or binary shaped pupil, on the n grid; null if none. */
  readonly apodizer: Float64Array | null
  /** Phase plate in radians at λ0 (APP), on the n grid; null if none. */
  readonly phasePlate: Float64Array | null
  /** Lyot stop on the nC grid; null if the coronagraph has none. */
  readonly lyot: Float64Array | null
  /** Focal-plane mask transmission in λ0/D (for display); null if none. */
  readonly mask: MaskFn | null
  /** Extra numbers from the design, e.g. the APLC eigenvalue. */
  readonly info: Readonly<Record<string, number>>
  /**
   * Plane A (after apodizer / plate) → plane C before the Lyot stop, at wavelength λ with scale = λ0/λ.
   * With `withMask` false the focal-plane mask is removed (used for the off-axis reference PSF).
   */
  toLyot(EA: Field, scale: number, withMask: boolean): Field
  /**
   * Lyot-plane field (before the stop) on an arbitrary grid, in units of D, used for the self-coherent camera's
   * reference hole outside the pupil. Null for designs without a focal-plane mask that sends light there.
   */
  readonly toLyotGrid: ((EA: Field, scale: number, xs: Float64Array, ys: Float64Array) => Grid2) | null
}

export function lyotPadding(n: number): number {
  return 2 * Math.round(n / 16)
}

/** Erode a transmission map along x by ±halfWidth (fraction of D): the band-limited Lyot stop. */
function erodeX(map: Float64Array, n: number, perD: number, halfWidth: number): Float64Array {
  const h = Math.round(halfWidth * perD)
  const out = new Float64Array(n * n)
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let m = 1
      for (let s = -h; s <= h; s++) {
        const xx = x + s
        m = Math.min(m, xx < 0 || xx >= n ? 0 : map[y * n + xx])
        if (m === 0) break
      }
      out[y * n + x] = m
    }
  }
  return out
}

/** Band-limited mask, applied as its exact pupil-plane equivalent: E_C = E − E ⊛ K, K a unit-area triangle in x. */
function bandLimitedPropagate(E: Field, nC: number, perD: number, eps: number): Field {
  const half = Math.max(1, Math.round(eps * perD))
  const w = new Float64Array(2 * half + 1)
  let s = 0
  for (let k = -half; k <= half; k++) { w[k + half] = 1 - Math.abs(k) / (half + 1); s += w[k + half] }
  for (let k = 0; k < w.length; k++) w[k] /= s
  const big = embed(E, nC)
  const out = cloneField(big)
  for (let y = 0; y < nC; y++) {
    for (let x = 0; x < nC; x++) {
      let cr = 0, ci = 0
      for (let k = -half; k <= half; k++) {
        const xx = x - k
        if (xx < 0 || xx >= nC) continue
        cr += w[k + half] * big.re[y * nC + xx]
        ci += w[k + half] * big.im[y * nC + xx]
      }
      out.re[y * nC + x] -= cr
      out.im[y * nC + x] -= ci
    }
  }
  return out
}

/** Band-limited amplitude transmission: m(u) = 1 − sinc²(π ε u), the Fourier transform of δ − triangle. */
export function bandLimitedMask(eps: number): MaskFn {
  return (u) => {
    const a = Math.PI * eps * u
    const sinc = a === 0 ? 1 : Math.sin(a) / a
    return [1 - sinc * sinc, 0]
  }
}

export function vortexMask(charge: number): MaskFn {
  return (u, v) => { const t = charge * Math.atan2(v, u); return [Math.cos(t), Math.sin(t)] }
}

export const fqpmMask: MaskFn = (u, v) => [Math.sign(u) * Math.sign(v) || 1, 0]

export function buildCoronagraph(spec: CoronagraphSpec, pupilSpec: PupilSpec, n: number): Coronagraph {
  const pupil = makePupil(pupilSpec, n)
  const pad = lyotPadding(n)
  const nC = n + 2 * pad
  const pkey = JSON.stringify(pupilSpec)
  const xA = pupilCoords(n)
  const xC = pupilCoords(nC, n)
  const inner = pupilSpec.kind === 'circular' ? spec.lyotInner : Math.max(spec.lyotInner, pupilSpec.kind === 'obscured' ? pupilSpec.obscuration * 1.1 : spec.lyotInner)
  const stop = () => makeLyotStop(pupilSpec, { outer: spec.lyotOuter, inner, spiderWidth: pupilSpec.spiderWidth * 2 }, n, nC)
  const none = (E: Field) => embed(E, nC)
  const base = { spec, n, nC, pupil, apodizer: null, phasePlate: null, lyot: null, mask: null, info: {}, toLyotGrid: null }
  const bab = (d: MaskFn) => (E: Field, s: number, xs: Float64Array, ys: Float64Array) => babinetGrid(E, xA, xs, ys, r, d, s)
  const msc = (m: MaskFn) => (E: Field, s: number, xs: Float64Array, ys: Float64Array) => multiscaleGrid(E, xA, xs, ys, m, s)
  const r = spec.maskRadius
  const occ: MaskFn = (u, v) => (u * u + v * v <= r * r ? [-1, 0] : [0, 0])
  switch (spec.kind) {
    case 'none':
      return { ...base, toLyot: none }
    case 'lyot':
      return {
        ...base, lyot: stop(), mask: (u, v) => (u * u + v * v <= r * r ? [0, 0] : [1, 0]),
        toLyot: (E, s, m) => (m ? babinetPropagate(E, xA, xC, r, occ, s) : none(E)), toLyotGrid: bab(occ),
      }
    case 'aplc': {
      const d = aplcApodizer(pupil, n, r, pkey)
      return {
        ...base, apodizer: d.apodizer, lyot: stop(), mask: (u, v) => (u * u + v * v <= r * r ? [0, 0] : [1, 0]),
        info: { eigenvalue: d.eigenvalue }, toLyotGrid: bab(occ),
        toLyot: (E, s, m) => (m ? babinetPropagate(E, xA, xC, r, occ, s) : none(E)),
      }
    }
    case 'roddier': {
      // π phase disk: m − 1 = e^{iπ} − 1 = −2 inside the disk.
      const rod: MaskFn = (u, v) => (u * u + v * v <= r * r ? [-2, 0] : [0, 0])
      return {
        ...base, lyot: stop(), mask: (u, v) => (u * u + v * v <= r * r ? [-1, 0] : [1, 0]),
        toLyot: (E, s, m) => (m ? babinetPropagate(E, xA, xC, r, rod, s) : none(E)), toLyotGrid: bab(rod),
      }
    }
    case 'bandlimited': {
      const eps = spec.blEpsilon
      const padded = embed({ n, re: pupil, im: new Float64Array(n * n) }, nC).re
      const circle = makeLyotStop({ ...pupilSpec, kind: 'circular' }, { outer: spec.lyotOuter, inner: 0, spiderWidth: 0 }, n, nC)
      const eroded = erodeX(padded.map((v) => (v > 0.99 ? 1 : 0)), nC, n, eps)
      const lyot = eroded.map((v, i) => v * circle[i])
      return {
        ...base, lyot, mask: bandLimitedMask(eps), info: { kernelHalfWidth: eps },
        // The mask is fixed in λ0/D: at wavelength λ its pupil-plane kernel is ε·λ/λ0 = ε/scale wide.
        toLyot: (E, s, m) => (m ? bandLimitedPropagate(E, nC, n, eps / s) : none(E)),
      }
    }
    case 'shaped':
      return { ...base, apodizer: shapedPupil(pupil, n, spec.shapedBand, spec.shapedOpenings, pkey), toLyot: none }
    case 'fqpm':
      return {
        ...base, lyot: stop(), mask: fqpmMask,
        toLyot: (E, s, m) => (m ? multiscalePropagate(E, xA, xC, fqpmMask, s) : none(E)), toLyotGrid: msc(fqpmMask),
      }
    case 'vortex': {
      const vm = vortexMask(spec.charge)
      return {
        ...base, lyot: stop(), mask: vm,
        toLyot: (E, s, m) => (m ? multiscalePropagate(E, xA, xC, vm, s) : none(E)), toLyotGrid: msc(vm),
      }
    }
    case 'app':
      return { ...base, phasePlate: appPhase(pupil, n, spec.appIwa, spec.appOwa, pkey), toLyot: none }
  }
}

/** Plane A: pupil field after the apodizer or phase plate. `channel` = ±1 picks the vAPP phase sign. */
export function applyPlaneA(c: Coronagraph, E: Field, scale: number, channel: 1 | -1 = 1): Field {
  const out = cloneField(E)
  if (c.apodizer) for (let i = 0; i < out.re.length; i++) { out.re[i] *= c.apodizer[i]; out.im[i] *= c.apodizer[i] }
  if (c.phasePlate) {
    // Classical APP: a thickness, so the phase scales as λ0/λ. vAPP: geometric phase, the same at every λ.
    const k = c.spec.appVector ? channel : scale
    for (let i = 0; i < out.re.length; i++) {
      const p = k * c.phasePlate[i]
      const cs = Math.cos(p), sn = Math.sin(p)
      const r = out.re[i] * cs - out.im[i] * sn
      out.im[i] = out.re[i] * sn + out.im[i] * cs
      out.re[i] = r
    }
  }
  return out
}

/** Plane C after the Lyot stop. */
export function applyLyot(c: Coronagraph, EC: Field): Field {
  if (!c.lyot) return EC
  const out = cloneField(EC)
  for (let i = 0; i < out.re.length; i++) { out.re[i] *= c.lyot[i]; out.im[i] *= c.lyot[i] }
  return out
}
