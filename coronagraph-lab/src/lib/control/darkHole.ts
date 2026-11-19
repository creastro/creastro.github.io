/**
 * The dark hole: the focal-plane region where the DM is asked to cancel the starlight, sampled at 2 samples per
 * λ0/D (Nyquist for the electric field). One-sided ("half") holes can correct phase and amplitude errors with a
 * single DM; a full annulus can only correct phase errors (Malbet et al. 1995; Give'on et al. 2007).
 */
import { focalCoords } from '../field.ts'
import { mftGeneral } from '../mft.ts'
import { type Optics, lyotOut } from '../train.ts'
import type { Field } from '../field.ts'
import { pupilCoords } from '../field.ts'

export interface DarkHoleSpec { readonly iwa: number; readonly owa: number; readonly half: boolean }

export interface DarkHole {
  readonly spec: DarkHoleSpec
  /** Sub-grid (λ0/D) on which the hole is sampled, and the indices of the hole pixels in it. */
  readonly u: Float64Array
  readonly v: Float64Array
  readonly pixels: readonly number[]
}

export function makeDarkHole(spec: DarkHoleSpec, q = 2): DarkHole {
  const m = 2 * Math.ceil(spec.owa * q) + 1
  const all = focalCoords(m, q)
  const u = spec.half ? all.filter((x) => x >= spec.iwa * 0.5) : all
  const v = all
  const pixels: number[] = []
  for (let l = 0; l < v.length; l++) for (let k = 0; k < u.length; k++) {
    const r = Math.hypot(u[k], v[l])
    if (r >= spec.iwa && r <= spec.owa && (!spec.half || u[k] >= spec.iwa * 0.5)) pixels.push(l * u.length + k)
  }
  return { spec, u: Float64Array.from(u), v: Float64Array.from(v), pixels }
}

/** Complex detector field (raw-contrast units) at the dark-hole pixels, from a pupil-plane field at λ0. */
export function fieldInHole(o: Optics, EA: Field, dh: DarkHole): { re: Float64Array; im: Float64Array } {
  const n = o.spec.npup
  const EC = lyotOut(o.cor, EA, 1, true)
  const g = mftGeneral(EC.re, EC.im, pupilCoords(EC.n, n), dh.u, dh.v, -1, 1 / (n * n))
  const k = 1 / Math.sqrt(o.refPeak)
  return { re: Float64Array.from(dh.pixels, (p) => g.re[p] * k), im: Float64Array.from(dh.pixels, (p) => g.im[p] * k) }
}

export function meanIntensity(E: { re: Float64Array; im: Float64Array }): number {
  let s = 0
  for (let i = 0; i < E.re.length; i++) s += E.re[i] ** 2 + E.im[i] ** 2
  return s / E.re.length
}
