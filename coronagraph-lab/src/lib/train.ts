/**
 * The full optical train of the science arm:
 *   star / planets → pupil (aberrations, DM) → A: apodizer / phase plate → B: focal mask → C: Lyot stop → D: detector.
 * Images are normalised to the peak of the off-axis PSF of the same instrument without its focal-plane mask
 * and without aberrations ("raw contrast" units), so a perfect off-axis source peaks at 1.
 */
import { type Coronagraph, type CoronagraphSpec, applyLyot, applyPlaneA, buildCoronagraph } from './coronagraph.ts'
import { type Field, focalCoords, pupilCoords } from './field.ts'
import { mftGeneral } from './mft.ts'
import { type AberrationSpec, aberrationOpd, entranceField, pupilAmplitude } from './optics.ts'
import { type PupilSpec, makePupil } from './pupils.ts'

export interface Planet { readonly sep: number; readonly pa: number; readonly contrast: number }

export interface SystemSpec {
  /** Samples across the pupil diameter D. */
  readonly npup: number
  /** Detector samples per λ0/D and half-width of the detector field (λ0/D). */
  readonly q: number
  readonly fov: number
  readonly wavelengthNm: number
  /** Fractional bandwidth Δλ/λ0 and number of wavelength samples (1 = monochromatic). */
  readonly bandwidth: number
  readonly nLambda: number
  readonly pupil: PupilSpec
  readonly coronagraph: CoronagraphSpec
  readonly aberrations: AberrationSpec
}

/** Wavelength samples (nm) and their scale factors λ0/λ, uniformly spread over the band. */
export function wavelengths(s: SystemSpec): { lam: number[]; scale: number[] } {
  const k = s.bandwidth > 0 ? Math.max(1, s.nLambda) : 1
  const lam: number[] = []
  for (let i = 0; i < k; i++) lam.push(s.wavelengthNm * (1 + (k === 1 ? 0 : s.bandwidth * (i / (k - 1) - 0.5))))
  return { lam, scale: lam.map((l) => s.wavelengthNm / l) }
}

export function detectorCoords(s: SystemSpec): Float64Array {
  return focalCoords(2 * Math.round(s.fov * s.q) + 1, s.q)
}

/**
 * Detector field from a pupil-plane field sampled with n samples per D: u0 in λ0/D becomes u0·λ0/λ in λ/D
 * at the current wavelength.
 */
export function toDetector(EC: Field, n: number, u0: Float64Array, scale: number): Field {
  const xC = pupilCoords(EC.n, n)
  const u = u0.map((v) => v * scale)
  const g = mftGeneral(EC.re, EC.im, xC, u, u, -1, 1 / (n * n))
  return { n: u.length, re: g.re, im: g.im }
}

export interface Optics {
  readonly spec: SystemSpec
  readonly cor: Coronagraph
  readonly pupil: Float64Array
  readonly amp: Float64Array
  /** Science-arm aberration OPD (nm), DM not included. */
  readonly opdScience: Float64Array
  readonly opdWfs: Float64Array
  readonly u0: Float64Array
  /** Peak of the unaberrated off-axis PSF (broadband-weighted), the normalisation of every image. */
  readonly refPeak: number
}

export function buildOptics(spec: SystemSpec): Optics {
  const n = spec.npup
  const pupil = makePupil(spec.pupil, n)
  const cor = buildCoronagraph(spec.coronagraph, spec.pupil, n)
  const amp = pupilAmplitude(spec.aberrations, pupil, n)
  const opdScience = aberrationOpd(spec.aberrations, pupil, n, 'science')
  const opdWfs = aberrationOpd(spec.aberrations, pupil, n, 'wfs')
  const u0 = detectorCoords(spec)
  const { lam, scale } = wavelengths(spec)
  let refPeak = 0
  const flat = new Float64Array(n * n)
  for (let i = 0; i < lam.length; i++) {
    for (const ch of channels(cor)) {
      const E = lyotOut(cor, entranceField(pupil, flat, n, lam[i], scale[i]), scale[i], false, ch.sign)
      let sr = 0, si = 0
      for (let j = 0; j < E.re.length; j++) { sr += E.re[j]; si += E.im[j] }
      const dx = 1 / n
      refPeak += ch.weight * scale[i] * scale[i] * (sr * sr + si * si) * dx ** 4 / lam.length
    }
  }
  return { spec, cor, pupil, amp, opdScience, opdWfs, u0, refPeak }
}

/** The polarisation channels of a vAPP (two signs of the geometric phase), or a single channel otherwise. */
export function channels(cor: Coronagraph): { sign: 1 | -1; weight: number }[] {
  if (!cor.phasePlate || !cor.spec.appVector) return [{ sign: 1, weight: 1 }]
  const leak = cor.spec.vappLeakage
  if (cor.spec.vappChannel === 'left') return [{ sign: 1, weight: 1 - leak }]
  if (cor.spec.vappChannel === 'right') return [{ sign: -1, weight: 1 - leak }]
  return [{ sign: 1, weight: (1 - leak) / 2 }, { sign: -1, weight: (1 - leak) / 2 }]
}

/** Plane A → C after the Lyot stop. */
export function lyotOut(cor: Coronagraph, E: Field, scale: number, withMask: boolean, sign: 1 | -1 = 1): Field {
  return applyLyot(cor, cor.toLyot(applyPlaneA(cor, E, scale, sign), scale, withMask))
}

/** Sum of the vAPP leakage term: a fraction of light that sees no phase plate. */
function leakage(cor: Coronagraph): number {
  return cor.phasePlate && cor.spec.appVector ? cor.spec.vappLeakage : 0
}

/**
 * Normalised detector intensity of a point source at (u, v) λ0/D with the given DM OPD (nm, may be null).
 */
export function sourceImage(o: Optics, dmOpd: Float64Array | null, u = 0, v = 0, withMask = true, arm: 'science' | 'wfs' = 'science'): Float64Array {
  const n = o.spec.npup
  const { lam, scale } = wavelengths(o.spec)
  const opd = (arm === 'science' ? o.opdScience : o.opdWfs).slice()
  if (dmOpd) for (let i = 0; i < opd.length; i++) opd[i] += dmOpd[i]
  const m = o.u0.length
  const img = new Float64Array(m * m)
  const leak = leakage(o.cor)
  for (let i = 0; i < lam.length; i++) {
    const EA = entranceField(o.amp, opd, n, lam[i], scale[i], u, v)
    const w = (scale[i] * scale[i]) / lam.length / o.refPeak
    for (const ch of channels(o.cor)) {
      const D = toDetector(lyotOut(o.cor, EA, scale[i], withMask, ch.sign), n, o.u0, scale[i])
      for (let j = 0; j < img.length; j++) img[j] += ch.weight * w * (D.re[j] * D.re[j] + D.im[j] * D.im[j])
    }
    if (leak > 0) {
      const bare = { ...o.cor, phasePlate: null }
      const D = toDetector(lyotOut(bare, EA, scale[i], withMask), n, o.u0, scale[i])
      for (let j = 0; j < img.length; j++) img[j] += leak * w * (D.re[j] * D.re[j] + D.im[j] * D.im[j])
    }
  }
  return img
}

/** Complex detector field of the star at λ0 (single channel), normalised so that |E|² is in raw-contrast units. */
export function starField(o: Optics, dmOpd: Float64Array | null, u0: Float64Array, withMask = true): Field {
  const n = o.spec.npup
  const opd = o.opdScience.slice()
  if (dmOpd) for (let i = 0; i < opd.length; i++) opd[i] += dmOpd[i]
  const EA = entranceField(o.amp, opd, n, o.spec.wavelengthNm, 1)
  const D = toDetector(lyotOut(o.cor, EA, 1, withMask, channels(o.cor)[0].sign), n, u0, 1)
  const k = 1 / Math.sqrt(o.refPeak)
  for (let j = 0; j < D.re.length; j++) { D.re[j] *= k; D.im[j] *= k }
  return D
}

export { buildCoronagraph, makePupil }
export type { Coronagraph, CoronagraphSpec }
