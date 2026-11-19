/**
 * Adaptive-optics-style closed loop for the pupil-plane sensors: the sensor measures the WFS-arm wavefront,
 * a modal reconstructor turns the signal into Zernike coefficients, and an integrator updates the DM:
 *   a_{k+1} = a_k − g · M · R · (s_k − s_ref),
 * with M the DM commands that best fit each mode. The loop flattens the wavefront seen by the sensor; the
 * non-common-path aberrations of the science arm are invisible to it.
 */
import { type Dm, activeActuators, dmFitter, dmSurface } from '../dm.ts'
import { fieldFromAmpPhase } from '../field.ts'
import { choleskySolve } from '../linalg.ts'
import { rmsOverPupil } from '../optics.ts'
import { type Calibration, calibrate, reconstruct } from '../wfs/calibration.ts'
import type { Measurement, PupilSensor } from '../wfs/types.ts'
import { zernikeMap } from '../zernike.ts'

export interface DmModes {
  /** Wavefront produced by each mode, per nm of mode amplitude. */
  readonly shapes: readonly Float64Array[]
  /** Actuator commands of each mode, per nm. */
  readonly commands: readonly Float64Array[]
}

/** Zernike modes Noll 2 … nModes+1 as fitted by the DM. */
export function dmZernikeModes(dm: Dm, pupil: Float64Array, nModes: number): DmModes {
  const fit = dmFitter(dm, pupil, activeActuators(dm))
  const commands: Float64Array[] = [], shapes: Float64Array[] = []
  for (let j = 2; j < nModes + 2; j++) {
    const c = fit(zernikeMap(j, dm.n))
    commands.push(c)
    shapes.push(dmSurface(dm, c))
  }
  return { shapes, commands }
}

/** Calibrate the sensor on the DM modes (push-pull of pokeNm). */
export function calibrateOnDm(sensor: PupilSensor, amp: Float64Array, n: number, modes: DmModes, wavelengthNm: number, pokeNm = 2): Calibration {
  return calibrate(sensor, amp, n, modes.shapes, wavelengthNm, pokeNm)
}

export interface AoStepResult {
  readonly measurement: Measurement
  /** Reconstructed modal coefficients (nm) of the wavefront before this correction. */
  readonly coeffs: Float64Array
  /** RMS of the WFS-arm wavefront before this correction (nm). */
  readonly rmsBefore: number
}

/** One loop iteration; updates `cmd` in place. `opdWfs` is the aberration seen by the sensor (nm). */
export function aoStep(sensor: PupilSensor, cal: Calibration, modes: DmModes, dm: Dm, amp: Float64Array, pupil: Float64Array,
  opdWfs: Float64Array, cmd: Float64Array, gain: number, wavelengthNm: number): AoStepResult {
  const n = dm.n
  const surf = dmSurface(dm, cmd)
  const opd = opdWfs.map((v, i) => v + surf[i])
  const k = (2 * Math.PI) / wavelengthNm
  const measurement = sensor.measure(fieldFromAmpPhase(n, amp, opd.map((v) => k * v)))
  const coeffs = reconstruct(cal, measurement.signal)
  coeffs.forEach((c, j) => {
    const mc = modes.commands[j]
    for (let a = 0; a < cmd.length; a++) cmd[a] -= gain * c * mc[a]
  })
  return { measurement, coeffs, rmsBefore: rmsOverPupil(opd, pupil) }
}

/**
 * The best any modal loop can do: RMS of the wavefront after removing its least-squares projection on the
 * controlled mode shapes (the fitting error of the modal basis), nm.
 */
export function modalFittingResidual(opd: Float64Array, shapes: readonly Float64Array[], pupil: Float64Array): number {
  const m = shapes.length
  const A = new Float64Array(m * m), b = new Float64Array(m)
  for (let a = 0; a < m; a++) {
    for (let i = 0; i < opd.length; i++) b[a] += pupil[i] * shapes[a][i] * opd[i]
    for (let c = a; c < m; c++) {
      let t = 0
      for (let i = 0; i < opd.length; i++) t += pupil[i] * shapes[a][i] * shapes[c][i]
      A[a * m + c] = t; A[c * m + a] = t
    }
  }
  const x = choleskySolve(A, b, m)
  const res = opd.slice()
  x.forEach((c, a) => { for (let i = 0; i < res.length; i++) res[i] -= c * shapes[a][i] })
  return rmsOverPupil(res, pupil)
}
