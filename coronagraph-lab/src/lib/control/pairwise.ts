/**
 * Pairwise DM probing (Give'on et al. 2007; Groff et al. 2016): apply ± probe shapes on the DM and record the
 * images. For each probe k,  I_k⁺ − I_k⁻ = 4 Re(E* ΔE_k),  with ΔE_k the probe field predicted by the model
 * Jacobian. With two or more probes, each pixel gives a small least-squares problem for (Re E, Im E).
 * The probes are "sinc–sinc–cosine" shapes whose far field covers the dark hole evenly.
 */
import type { Dm } from '../dm.ts'
import type { DarkHoleSpec } from './darkHole.ts'
import { type Jacobian, applyJacobian } from './jacobian.ts'

/** Probe commands (full actuator vectors, nm) with phases spread over π. */
export function probeCommands(dm: Dm, spec: DarkHoleSpec, amplitudeNm: number, count: number): Float64Array[] {
  const sinc = (x: number) => (x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x))
  const wx = spec.half ? spec.owa - spec.iwa * 0.5 : 2 * spec.owa
  const wy = 2 * spec.owa
  const cx = spec.half ? (spec.owa + spec.iwa * 0.5) / 2 : 0
  const out: Float64Array[] = []
  for (let k = 0; k < count; k++) {
    const th = (Math.PI * k) / count
    out.push(Float64Array.from(dm.ax, (x, a) => {
      const y = dm.ay[a]
      // Offset by a quarter actuator so that the sincs do not vanish on the actuator grid.
      return amplitudeNm * sinc(wx * x) * sinc(wy * y) * Math.cos(2 * Math.PI * cx * x + th + (spec.half ? 0 : Math.PI / 4))
    }))
  }
  return out
}

/**
 * Estimate the dark-hole field from probe images. `measure(offset)` returns the dark-hole intensities with the
 * DM command offset by `offset` (full actuator vector, nm). Pixels with an ill-conditioned probe matrix are
 * returned as zero and flagged invalid.
 */
export function pairwiseEstimate(J: Jacobian, probes: readonly Float64Array[], measure: (offset: Float64Array) => Float64Array) {
  const P = J.rows
  const dE = probes.map((p) => applyJacobian(J, J.actuators.map((a) => p[a])))
  const diff = probes.map((p) => {
    const plus = measure(p), minus = measure(p.map((v) => -v))
    return plus.map((v, i) => v - minus[i])
  })
  const re = new Float64Array(P), im = new Float64Array(P)
  const valid = new Uint8Array(P)
  for (let i = 0; i < P; i++) {
    let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0
    for (let k = 0; k < probes.length; k++) {
      const h1 = 4 * dE[k].re[i], h2 = 4 * dE[k].im[i]
      a11 += h1 * h1; a12 += h1 * h2; a22 += h2 * h2
      b1 += h1 * diff[k][i]; b2 += h2 * diff[k][i]
    }
    const det = a11 * a22 - a12 * a12
    const tr = a11 + a22
    if (!(tr > 0) || det < 1e-4 * tr * tr) continue
    re[i] = (a22 * b1 - a12 * b2) / det
    im[i] = (a11 * b2 - a12 * b1) / det
    valid[i] = 1
  }
  return { re, im, valid }
}

/**
 * Probe amplitude (nm) giving a probe intensity close to the current dark-hole intensity, which balances the
 * signal against the non-linear |ΔE|² term: scale a unit probe so that mean |J p|² ≈ mean contrast.
 */
export function adaptiveProbeNm(J: Jacobian, unitProbe: Float64Array, meanContrast: number): number {
  const d = applyJacobian(J, J.actuators.map((a) => unitProbe[a]))
  let s = 0
  for (let i = 0; i < d.re.length; i++) s += d.re[i] ** 2 + d.im[i] ** 2
  s /= d.re.length
  return s > 0 ? Math.sqrt(meanContrast / s) : 1
}
