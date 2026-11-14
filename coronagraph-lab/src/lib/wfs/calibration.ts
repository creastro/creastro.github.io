/**
 * Linear reconstruction for the pupil-plane sensors: an interaction matrix measured by pushing and pulling each
 * mode of a modal basis, and its regularised pseudo-inverse. This is how real adaptive-optics systems are
 * calibrated, and it lets every sensor deliver the same output: modal coefficients of the wavefront (nm).
 */
import { type Field, fieldFromAmpPhase } from '../field.ts'
import { type Reconstructor, tikhonovMatrix } from '../linalg.ts'
import type { PupilSensor } from './types.ts'

export interface Calibration {
  readonly modes: readonly Float64Array[]
  readonly reference: Float64Array
  readonly rec: Reconstructor
  /** Interaction matrix (signals × modes), per nm of mode amplitude. */
  readonly D: Float64Array
}

function fieldWith(amp: Float64Array, n: number, opdNm: Float64Array, wavelengthNm: number): Field {
  const k = (2 * Math.PI) / wavelengthNm
  return fieldFromAmpPhase(n, amp, opdNm.map((v) => k * v))
}

/** Calibrate `sensor` with `modes` (OPD maps per nm), poking ±pokeNm around `baseOpd`. */
export function calibrate(sensor: PupilSensor, amp: Float64Array, n: number, modes: readonly Float64Array[],
  wavelengthNm: number, pokeNm: number, alpha = 1e-3, baseOpd?: Float64Array): Calibration {
  const base = baseOpd ?? new Float64Array(n * n)
  const reference = sensor.measure(fieldWith(amp, n, base, wavelengthNm)).signal
  const rows = reference.length, cols = modes.length
  const D = new Float64Array(rows * cols)
  modes.forEach((mode, j) => {
    const plus = sensor.measure(fieldWith(amp, n, base.map((v, i) => v + pokeNm * mode[i]), wavelengthNm)).signal
    const minus = sensor.measure(fieldWith(amp, n, base.map((v, i) => v - pokeNm * mode[i]), wavelengthNm)).signal
    for (let r = 0; r < rows; r++) D[r * cols + j] = (plus[r] - minus[r]) / (2 * pokeNm)
  })
  return { modes, reference, rec: tikhonovMatrix(D, rows, cols, alpha), D }
}

/** Modal coefficients (nm) from a measurement. */
export function reconstruct(cal: Calibration, signal: Float64Array): Float64Array {
  return cal.rec.apply(signal.map((v, i) => v - cal.reference[i]))
}

/** Wavefront map (nm) from modal coefficients. */
export function modalMap(cal: Calibration, coeffs: Float64Array, n: number): Float64Array {
  const out = new Float64Array(n * n)
  cal.modes.forEach((m, j) => { const c = coeffs[j]; if (c) for (let i = 0; i < out.length; i++) out[i] += c * m[i] })
  return out
}
