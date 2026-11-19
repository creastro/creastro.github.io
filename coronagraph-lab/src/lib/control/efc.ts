/**
 * Electric field conjugation (Give'on et al. 2007): choose the DM commands that cancel the estimated dark-hole
 * field in the least-squares sense, with Tikhonov regularisation,
 *   δa = −(GᵀG + α s I)⁻¹ Gᵀ E,   G = [Re J; Im J],  E = [Re E; Im E].
 */
import { type Reconstructor, tikhonovMatrix } from '../linalg.ts'
import type { Jacobian } from './jacobian.ts'

export function efcMatrix(J: Jacobian, alpha: number): Reconstructor {
  const G = new Float64Array(2 * J.rows * J.cols)
  G.set(J.re, 0)
  G.set(J.im, J.rows * J.cols)
  return tikhonovMatrix(G, 2 * J.rows, J.cols, alpha)
}

/** Command update (full actuator vector, nm) for the estimated field E, applied with `gain`. */
export function efcUpdate(rec: Reconstructor, J: Jacobian, E: { re: Float64Array; im: Float64Array }, nAct: number, gain: number): Float64Array {
  const b = new Float64Array(2 * J.rows)
  b.set(E.re, 0)
  b.set(E.im, J.rows)
  const x = rec.apply(b)
  const out = new Float64Array(nAct)
  J.actuators.forEach((a, c) => { out[a] = -gain * x[c] })
  return out
}
