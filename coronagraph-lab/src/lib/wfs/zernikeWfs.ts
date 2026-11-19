/**
 * Zernike wavefront sensor (N'Diaye et al. 2013, ZELDA): a small focal-plane dimple of diameter ≈ 1.06 λ/D that
 * delays the light by π/2 makes a reference wave that interferes with the rest of the beam, turning phase into
 * pupil-plane intensity (phase-contrast principle). Modelled with the Babinet MFT propagation.
 */
import type { Field } from '../field.ts'
import { pupilCoords } from '../field.ts'
import { babinetPropagate } from '../focalMask.ts'
import type { PupilSensor } from './types.ts'

export const ZWFS_RADIUS = 0.53
export const ZWFS_PHASE = Math.PI / 2

export function zernikeWfs(pupil: Float64Array, n: number): PupilSensor {
  const x = pupilCoords(n)
  const valid: number[] = []
  for (let i = 0; i < n * n; i++) if (pupil[i] > 0.5) valid.push(i)
  const r = ZWFS_RADIUS
  const delta = (u: number, v: number): readonly [number, number] =>
    u * u + v * v <= r * r ? [Math.cos(ZWFS_PHASE) - 1, Math.sin(ZWFS_PHASE)] : [0, 0]
  return {
    kind: 'zernike',
    measure(E: Field) {
      const out = babinetPropagate(E, x, x, r, delta, 1)
      const I = new Float64Array(n * n)
      for (let i = 0; i < n * n; i++) I[i] = out.re[i] ** 2 + out.im[i] ** 2
      const signal = Float64Array.from(valid, (i) => I[i])
      return { signal, image: { w: n, h: n, data: I } }
    },
  }
}
