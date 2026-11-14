/**
 * Jacobian of the dark-hole field with respect to the DM actuators, from the (unaberrated) model of the
 * instrument. The coronagraph is linear in the pupil field, so for a small command δa_k (nm):
 *   δE = C{ i (2π/λ) h_k · E_0 } δa_k,
 * one propagation per actuator.
 */
import { type Dm, activeActuators } from '../dm.ts'
import { makeField } from '../field.ts'
import { entranceField } from '../optics.ts'
import type { Optics } from '../train.ts'
import { type DarkHole, fieldInHole } from './darkHole.ts'

export interface Jacobian {
  readonly actuators: readonly number[]
  /** Rows = dark-hole pixels, columns = actuators; field per nm of command. */
  readonly re: Float64Array
  readonly im: Float64Array
  readonly rows: number
  readonly cols: number
}

export function computeJacobian(model: Optics, dm: Dm, dh: DarkHole, onProgress?: (f: number) => void): Jacobian {
  const n = model.spec.npup
  const lam = model.spec.wavelengthNm
  const E0 = entranceField(model.pupil, new Float64Array(n * n), n, lam, 1)
  const actuators = activeActuators(dm)
  const rows = dh.pixels.length, cols = actuators.length
  const re = new Float64Array(rows * cols), im = new Float64Array(rows * cols)
  const k0 = (2 * Math.PI) / lam
  actuators.forEach((a, c) => {
    const f = makeField(n)
    const ids = dm.idx[a], vs = dm.val[a]
    for (let t = 0; t < ids.length; t++) {
      const i = ids[t], w = k0 * vs[t]
      // i·w·E0
      f.re[i] = -w * E0.im[i]
      f.im[i] = w * E0.re[i]
    }
    const g = fieldInHole(model, f, dh)
    for (let r = 0; r < rows; r++) { re[r * cols + c] = g.re[r]; im[r * cols + c] = g.im[r] }
    if (onProgress && c % 16 === 0) onProgress(c / cols)
  })
  return { actuators, re, im, rows, cols }
}

/** Field change (dark-hole pixels) predicted by the Jacobian for active-actuator commands x (nm). */
export function applyJacobian(J: Jacobian, x: ArrayLike<number>): { re: Float64Array; im: Float64Array } {
  const re = new Float64Array(J.rows), im = new Float64Array(J.rows)
  for (let r = 0; r < J.rows; r++) {
    let sr = 0, si = 0
    const o = r * J.cols
    for (let c = 0; c < J.cols; c++) { sr += J.re[o + c] * x[c]; si += J.im[o + c] * x[c] }
    re[r] = sr; im[r] = si
  }
  return { re, im }
}
