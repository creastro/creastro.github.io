/**
 * The telescope and its errors: aberrations as an optical path difference (OPD, nm) and amplitude errors,
 * for the science arm or the wavefront-sensor arm (they differ by the non-common-path aberrations).
 */
import { type Field, makeField, pupilCoords } from './field.ts'
import { normaliseOverPupil, powerLawScreen } from './screens.ts'
import { zernikeMap } from './zernike.ts'

export interface AberrationSpec {
  /** Zernike coefficients (nm RMS) for Noll modes 2, 3, …, 11 (index 0 is tip). */
  readonly zernikeNm: readonly number[]
  /** Power-law phase screen: RMS (nm), PSD slope α, seed. */
  readonly screenRmsNm: number
  readonly screenSlope: number
  readonly screenSeed: number
  /** Amplitude errors: RMS fractional transmission error, seed. */
  readonly amplitudeRms: number
  readonly amplitudeSeed: number
  /** Non-common-path aberrations, only in the science arm: Zernike coefficients (Noll 2…11) and a screen. */
  readonly ncpaZernikeNm: readonly number[]
  readonly ncpaRmsNm: number
  readonly ncpaSeed: number
}

export const NO_ABERRATIONS: AberrationSpec = {
  zernikeNm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], screenRmsNm: 0, screenSlope: 2.5, screenSeed: 1,
  amplitudeRms: 0, amplitudeSeed: 2, ncpaZernikeNm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ncpaRmsNm: 0, ncpaSeed: 3,
}

export type Arm = 'science' | 'wfs'

function addZernikes(opd: Float64Array, n: number, coeffs: readonly number[]): void {
  coeffs.forEach((c, k) => {
    if (!c) return
    const z = zernikeMap(k + 2, n)
    for (let i = 0; i < opd.length; i++) opd[i] += c * z[i]
  })
}

/** Common-path aberration OPD plus, for the science arm, the non-common-path aberrations (nm). */
export function aberrationOpd(spec: AberrationSpec, pupil: Float64Array, n: number, arm: Arm): Float64Array {
  const opd = new Float64Array(n * n)
  addZernikes(opd, n, spec.zernikeNm)
  if (spec.screenRmsNm > 0) {
    const s = normaliseOverPupil(powerLawScreen(n, spec.screenSlope, spec.screenSeed).slice(), pupil, spec.screenRmsNm)
    for (let i = 0; i < opd.length; i++) opd[i] += s[i]
  }
  if (arm === 'science') {
    addZernikes(opd, n, spec.ncpaZernikeNm)
    if (spec.ncpaRmsNm > 0) {
      const s = normaliseOverPupil(powerLawScreen(n, 2.5, spec.ncpaSeed).slice(), pupil, spec.ncpaRmsNm)
      for (let i = 0; i < opd.length; i++) opd[i] += s[i]
    }
  }
  return opd
}

/** Pupil amplitude including the amplitude errors: A = P · (1 + δ), δ with the requested RMS. */
export function pupilAmplitude(spec: AberrationSpec, pupil: Float64Array, n: number): Float64Array {
  if (spec.amplitudeRms <= 0) return pupil
  const s = normaliseOverPupil(powerLawScreen(n, 2, spec.amplitudeSeed).slice(), pupil, spec.amplitudeRms)
  return pupil.map((p, i) => Math.max(0, p * (1 + s[i])))
}

/**
 * Entrance field at wavelength λ: A · exp(i 2π OPD/λ) · exp(i 2π (u x + v y) λ0/λ),
 * for a source at (u, v) λ0/D from the axis.
 */
export function entranceField(amp: Float64Array, opdNm: Float64Array, n: number, wavelengthNm: number,
  scale: number, u = 0, v = 0): Field {
  const f = makeField(n)
  const x = pupilCoords(n)
  const k = (2 * Math.PI) / wavelengthNm
  for (let yy = 0; yy < n; yy++) {
    for (let xx = 0; xx < n; xx++) {
      const i = yy * n + xx
      if (amp[i] === 0) continue
      const ph = k * opdNm[i] + 2 * Math.PI * scale * (u * x[xx] + v * x[yy])
      f.re[i] = amp[i] * Math.cos(ph)
      f.im[i] = amp[i] * Math.sin(ph)
    }
  }
  return f
}

/** Weighted RMS of an OPD map over the pupil (piston removed), nm. */
export function rmsOverPupil(opd: Float64Array, pupil: Float64Array): number {
  let w = 0, s = 0, s2 = 0
  for (let i = 0; i < opd.length; i++) { w += pupil[i]; s += pupil[i] * opd[i]; s2 += pupil[i] * opd[i] * opd[i] }
  if (w === 0) return 0
  const m = s / w
  return Math.sqrt(Math.max(0, s2 / w - m * m))
}
