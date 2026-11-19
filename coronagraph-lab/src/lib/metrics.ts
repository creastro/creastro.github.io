/**
 * Performance metrics of a coronagraph: the region where it is designed to be dark, the radial raw-contrast
 * curve, the planet core throughput against separation, and the inner working angle.
 */
import type { CoronagraphSpec } from './coronagraph.ts'
import { appRegion } from './designs.ts'
import { focalCoords } from './field.ts'
import { type Optics, channels, lyotOut, wavelengths } from './train.ts'
import { mftGeneral } from './mft.ts'
import { entranceField } from './optics.ts'
import { pupilCoords } from './field.ts'

export type Region = (u: number, v: number) => boolean

/** The part of the focal plane each design is meant to darken (all of an annulus for symmetric designs). */
export function darkZone(spec: CoronagraphSpec, inner: number, outer: number): Region {
  switch (spec.kind) {
    case 'shaped': {
      const t = Math.tan((25 * Math.PI) / 180)
      return (u, v) => { const r = Math.hypot(u, v); return r >= inner && r <= outer && Math.abs(v) <= t * Math.abs(u) }
    }
    case 'app': {
      if (spec.appVector && spec.vappChannel === 'sum') return (u, v) => { const r = Math.hypot(u, v); return r >= inner && r <= outer }
      const side = spec.appVector && spec.vappChannel === 'right' ? -1 : 1
      return (u, v) => appRegion(side * u, v, Math.max(inner, spec.appIwa), Math.min(outer, spec.appOwa))
    }
    default:
      return (u, v) => { const r = Math.hypot(u, v); return r >= inner && r <= outer }
  }
}

/**
 * Position angle (degrees) along which planets are placed for the throughput curve: +x, except 45° for the
 * four-quadrant mask (whose phase transitions lie along the axes) and 180° for the mirrored vAPP channel.
 */
export function darkAxisPa(spec: CoronagraphSpec): number {
  if (spec.kind === 'fqpm') return 45
  return spec.kind === 'app' && spec.appVector && spec.vappChannel === 'right' ? 180 : 0
}

/**
 * Designs without a focal-plane mask do not dim off-axis sources: their inner working angle is the inner edge
 * of the dark zone they create. Returns NaN when the design has no dark zone (bare telescope).
 */
export function designIwa(spec: CoronagraphSpec): number {
  if (spec.kind === 'shaped') return spec.shapedBand
  if (spec.kind === 'app') return spec.appIwa
  return NaN
}

export interface Curve { readonly r: number[]; readonly value: number[] }

/** Mean of a square image (coords u0 on both axes) in annuli of width `bin`, restricted to `zone`. */
export function radialProfile(img: Float64Array, u0: Float64Array, bin: number, zone: Region | null): Curve {
  const m = u0.length
  const rmax = Math.abs(u0[0])
  const nb = Math.floor(rmax / bin)
  const s = new Float64Array(nb), c = new Float64Array(nb)
  for (let l = 0; l < m; l++) {
    for (let k = 0; k < m; k++) {
      const u = u0[k], v = u0[l]
      if (zone && !zone(u, v)) continue
      const b = Math.floor(Math.hypot(u, v) / bin)
      if (b < nb) { s[b] += img[l * m + k]; c[b]++ }
    }
  }
  const r: number[] = [], value: number[] = []
  for (let b = 0; b < nb; b++) if (c[b] > 0) { r.push((b + 0.5) * bin); value.push(s[b] / c[b]) }
  return { r, value }
}

export function meanInRegion(img: Float64Array, u0: Float64Array, zone: Region): number {
  const m = u0.length
  let s = 0, c = 0
  for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) if (zone(u0[k], u0[l])) { s += img[l * m + k]; c++ }
  return c ? s / c : NaN
}

/**
 * Energy of a point source at (u, v) λ0/D inside a circle of radius `aperture` (λ0/D) centred on the source,
 * computed on a fine local grid. `withCoronagraph` false gives the bare telescope (no apodizer, mask or stop).
 */
export function coreEnergy(o: Optics, u: number, v: number, aperture: number, withCoronagraph: boolean): number {
  const n = o.spec.npup
  const q = 8
  const half = Math.ceil(aperture * q)
  const loc = focalCoords(2 * half + 1, q)
  const { lam, scale } = wavelengths(o.spec)
  const flat = new Float64Array(n * n)
  let e = 0
  for (let i = 0; i < lam.length; i++) {
    const EA = entranceField(o.pupil, flat, n, lam[i], scale[i], u, v)
    const parts = withCoronagraph ? channels(o.cor).map((ch) => ({ w: ch.weight, E: lyotOut(o.cor, EA, scale[i], true, ch.sign) })) : [{ w: 1, E: EA }]
    for (const p of parts) {
      const x = pupilCoords(p.E.n, n)
      const ux = loc.map((t) => (t + u) * scale[i]), vy = loc.map((t) => (t + v) * scale[i])
      const g = mftGeneral(p.E.re, p.E.im, x, ux, vy, -1, 1 / (n * n))
      for (let l = 0; l < loc.length; l++) for (let k = 0; k < loc.length; k++) {
        if (Math.hypot(loc[k], loc[l]) > aperture) continue
        const j = l * loc.length + k
        e += (p.w * scale[i] * scale[i] * (g.re[j] ** 2 + g.im[j] ** 2)) / (q * q) / lam.length
      }
    }
  }
  return e
}

/** Core throughput (aperture radius 0.7 λ0/D) relative to the bare telescope, along the dark axis. */
export function throughputCurve(o: Optics, seps: readonly number[]): Curve {
  const pa = (darkAxisPa(o.cor.spec) * Math.PI) / 180
  const ref = coreEnergy(o, 0, 0, 0.7, false)
  const value = seps.map((s) => coreEnergy(o, s * Math.cos(pa), s * Math.sin(pa), 0.7, true) / ref)
  return { r: [...seps], value }
}

/**
 * Inner working angle: the smallest separation where the throughput reaches half of its maximum.
 * NaN if the throughput never varies (no focal-plane mask): use designIwa then.
 */
export function innerWorkingAngle(t: Curve): number {
  const max = Math.max(...t.value)
  if (Math.min(...t.value) > 0.95 * max) return NaN
  for (let i = 0; i < t.r.length; i++) {
    if (t.value[i] >= 0.5 * max) {
      if (i === 0) return t.r[0]
      const f = (0.5 * max - t.value[i - 1]) / (t.value[i] - t.value[i - 1])
      return t.r[i - 1] + f * (t.r[i] - t.r[i - 1])
    }
  }
  return NaN
}
