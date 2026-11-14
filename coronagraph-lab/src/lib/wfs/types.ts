/** Shared types and helpers of the wavefront sensors. */
import type { Field } from '../field.ts'

/** A detector frame of a sensor, w × h, row-major. */
export interface WfsImage { readonly w: number; readonly h: number; readonly data: Float64Array }

export interface Measurement {
  /** Signal vector used by the reconstructor (before subtracting the flat-wavefront reference). */
  readonly signal: Float64Array
  /** Raw detector frame, for display. */
  readonly image: WfsImage
}

export const PUPIL_WFS_KINDS = ['shack-hartmann', 'pyramid', 'zernike', 'curvature'] as const
export type PupilWfsKind = (typeof PUPIL_WFS_KINDS)[number]

export interface PupilSensor {
  readonly kind: PupilWfsKind
  measure(E: Field): Measurement
}

/** Average a complex n×n field over b×b blocks (the sensor's coarser pixels). */
export function binField(E: Field, b: number): Field {
  if (b === 1) return E
  const m = E.n / b
  const re = new Float64Array(m * m), im = new Float64Array(m * m)
  for (let y = 0; y < E.n; y++) for (let x = 0; x < E.n; x++) {
    const j = Math.floor(y / b) * m + Math.floor(x / b)
    re[j] += E.re[y * E.n + x] / (b * b)
    im[j] += E.im[y * E.n + x] / (b * b)
  }
  return { n: m, re, im }
}

/** Average a real n×n map over b×b blocks. */
export function binMap(a: Float64Array, n: number, b: number): Float64Array {
  if (b === 1) return a
  const m = n / b
  const out = new Float64Array(m * m)
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) out[Math.floor(y / b) * m + Math.floor(x / b)] += a[y * n + x] / (b * b)
  return out
}
