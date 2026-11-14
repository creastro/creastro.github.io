/**
 * Deformable mirror: an N×N grid of actuators across the pupil with Gaussian influence functions,
 *   h_k(x, y) = exp[ ln(c) · ((x − x_k)² + (y − y_k)²) / p² ],
 * where p = D/N is the actuator pitch and c the coupling (the response at the neighbouring actuator).
 * Commands and the resulting surface are expressed directly as wavefront optical path difference (nm),
 * i.e. the factor of 2 of a reflection is included in the command.
 * An N-actuator mirror controls spatial frequencies up to N/2 cycles per pupil, i.e. a dark hole out to N/2 λ/D.
 */
import { choleskySolve } from './linalg.ts'

export interface DmSpec {
  readonly nact: number
  readonly coupling: number
}

export interface Dm {
  readonly spec: DmSpec
  readonly n: number
  /** Actuator positions in units of D. */
  readonly ax: Float64Array
  readonly ay: Float64Array
  /** Sparse influence functions: pixel indices and weights for each actuator. */
  readonly idx: readonly Int32Array[]
  readonly val: readonly Float64Array[]
}

const cache = new Map<string, Dm>()

export function makeDm(spec: DmSpec, n: number): Dm {
  const key = `${spec.nact}:${spec.coupling}:${n}`
  const hit = cache.get(key)
  if (hit) return hit
  const N = spec.nact
  const pitch = 1 / N
  const lnc = Math.log(spec.coupling)
  const reach = pitch * Math.sqrt(Math.log(1e-4) / lnc) // radius where the influence drops below 1e-4
  const ax = new Float64Array(N * N), ay = new Float64Array(N * N)
  const idx: Int32Array[] = [], val: Float64Array[] = []
  for (let j = 0; j < N; j++) {
    for (let i = 0; i < N; i++) {
      const k = j * N + i
      ax[k] = (i - (N - 1) / 2) * pitch
      ay[k] = (j - (N - 1) / 2) * pitch
      const ids: number[] = [], vs: number[] = []
      for (let y = 0; y < n; y++) {
        const yy = (y - (n - 1) / 2) / n - ay[k]
        if (Math.abs(yy) > reach) continue
        for (let x = 0; x < n; x++) {
          const xx = (x - (n - 1) / 2) / n - ax[k]
          const r2 = xx * xx + yy * yy
          if (r2 > reach * reach) continue
          ids.push(y * n + x)
          vs.push(Math.exp((lnc * r2) / (pitch * pitch)))
        }
      }
      idx.push(Int32Array.from(ids))
      val.push(Float64Array.from(vs))
    }
  }
  const dm = { spec, n, ax, ay, idx, val }
  cache.set(key, dm)
  return dm
}

/** Wavefront OPD map (nm) produced by the actuator commands (nm). */
export function dmSurface(dm: Dm, commandsNm: ArrayLike<number>): Float64Array {
  const out = new Float64Array(dm.n * dm.n)
  for (let k = 0; k < dm.idx.length; k++) {
    const a = commandsNm[k]
    if (!a) continue
    const ids = dm.idx[k], vs = dm.val[k]
    for (let t = 0; t < ids.length; t++) out[ids[t]] += a * vs[t]
  }
  return out
}

/** Least-squares fit of DM commands to a target OPD over the pupil (normal equations, Cholesky). */
export function fitDm(dm: Dm, targetNm: Float64Array, pupil: Float64Array, active: readonly number[]): Float64Array {
  const m = active.length
  const A = new Float64Array(m * m)
  const b = new Float64Array(m)
  // Dense maps of the active influence functions on the pupil.
  const dense = active.map((k) => {
    const d = new Map<number, number>()
    const ids = dm.idx[k], vs = dm.val[k]
    for (let t = 0; t < ids.length; t++) if (pupil[ids[t]] > 0) d.set(ids[t], vs[t] * pupil[ids[t]])
    return d
  })
  for (let a = 0; a < m; a++) {
    for (const [i, v] of dense[a]) b[a] += v * targetNm[i]
    for (let c = a; c < m; c++) {
      let s = 0
      const [small, big] = dense[a].size < dense[c].size ? [dense[a], dense[c]] : [dense[c], dense[a]]
      for (const [i, v] of small) { const w = big.get(i); if (w !== undefined) s += v * w }
      A[a * m + c] = s
      A[c * m + a] = s
    }
  }
  for (let a = 0; a < m; a++) A[a * m + a] += 1e-6 * A[a * m + a] + 1e-12
  const x = choleskySolve(A, b, m)
  const out = new Float64Array(dm.idx.length)
  active.forEach((k, a) => { out[k] = x[a] })
  return out
}

/** Actuators whose centre lies within the pupil radius plus half a pitch. */
export function activeActuators(dm: Dm, margin = 0.5): number[] {
  const r = 0.5 + margin / dm.spec.nact
  const out: number[] = []
  for (let k = 0; k < dm.ax.length; k++) if (Math.hypot(dm.ax[k], dm.ay[k]) <= r) out.push(k)
  return out
}
