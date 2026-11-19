/**
 * Every wavefront sensor must recover a known injected aberration in its linear range.
 * Injected: Noll 4, 5, 7, 11 with 10, −8, 6, −5 nm at λ = 1600 nm (14.9 nm RMS ≈ λ/107, 0.06 rad).
 * Tolerance: 10 % of the injected RMS for the pupil-plane sensors and phase diversity (the linear-range error
 * of these sensors is a few percent at this amplitude); 15 % of the field RMS for the focal-plane field estimators.
 */
import { describe, expect, it } from 'vitest'
import { fieldFromAmpPhase } from '../field.ts'
import { makePupil } from '../pupils.ts'
import { zernikeMap } from '../zernike.ts'
import { CIRCULAR, system } from '../testSetup.ts'
import { calibrate, reconstruct } from './calibration.ts'
import { curvature } from './curvature.ts'
import { phaseDiversityEstimate, diversityImages } from './phaseDiversity.ts'
import { pyramid } from './pyramid.ts'
import { shackHartmann } from './shackHartmann.ts'
import { zernikeWfs } from './zernikeWfs.ts'
import { DEFAULT_SCC, sccEstimate, sccFields, sccImage } from './scc.ts'
import { buildOptics } from '../train.ts'
import { entranceField } from '../optics.ts'
import type { PupilSensor } from './types.ts'

const n = 64, lam = 1600, J = 20
const P = makePupil(CIRCULAR, n)
const modes = Array.from({ length: J }, (_, k) => zernikeMap(k + 2, n))
const truth = new Float64Array(J)
truth[2] = 10; truth[3] = -8; truth[5] = 6; truth[9] = -5
const opd = new Float64Array(n * n)
truth.forEach((c, j) => { for (let i = 0; i < n * n; i++) opd[i] += c * modes[j][i] })
const relErr = (est: ArrayLike<number>, ref: ArrayLike<number>) => {
  let e = 0, r = 0
  for (let j = 0; j < ref.length; j++) { e += (est[j] - ref[j]) ** 2; r += ref[j] ** 2 }
  return Math.sqrt(e / r)
}

describe('pupil-plane sensors recover injected Zernike modes', () => {
  const sensors: [string, PupilSensor][] = [
    ['Shack–Hartmann (8 × 8)', shackHartmann(P, n, 8)],
    ['pyramid (modulation 3 λ/D)', pyramid(P, n, 3)],
    ['Zernike sensor', zernikeWfs(P, n)],
    ['curvature (z′ = 0.05)', curvature(P, n, 0.05)],
  ]
  for (const [name, s] of sensors) {
    it(name, () => {
      const cal = calibrate(s, P, n, modes, lam, 2)
      const est = reconstruct(cal, s.measure(fieldFromAmpPhase(n, P, opd.map((v) => (2 * Math.PI * v) / lam))).signal)
      expect(relErr(est, truth)).toBeLessThan(0.1)
    })
  }

  it('the unmodulated pyramid has a smaller linear range than the modulated one', () => {
    const big = opd.map((v) => 6 * v) // 90 nm RMS
    const err = [0, 3].map((mod) => {
      const s = pyramid(P, n, mod)
      const cal = calibrate(s, P, n, modes, lam, 2)
      return relErr(reconstruct(cal, s.measure(fieldFromAmpPhase(n, P, big.map((v) => (2 * Math.PI * v) / lam))).signal), truth.map((v) => 6 * v))
    })
    expect(err[0]).toBeGreaterThan(err[1])
  })
})

describe('focal-plane sensors', () => {
  it('phase diversity recovers the injected modes (with their signs)', () => {
    const spec = { modes: 10, diversityNm: 0.15 * lam, wavelengthNm: lam }
    const est = phaseDiversityEstimate(P, n, diversityImages(P, n, opd, spec), spec)
    expect(relErr(est, truth.slice(0, 10))).toBeLessThan(0.1)
  })

  for (const kind of ['vortex', 'lyot'] as const) {
    it(`self-coherent camera estimates the speckle field behind a ${kind} coronagraph`, () => {
      const ab = { zernikeNm: [0, 0, 10, -8, 0, 6, 0, 0, 0, -5], screenRmsNm: 0, screenSlope: 2.5, screenSeed: 1, amplitudeRms: 0, amplitudeSeed: 2, ncpaZernikeNm: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0], ncpaRmsNm: 0, ncpaSeed: 3 }
      const o = buildOptics(system(kind, { aberrations: ab }))
      const model = buildOptics(system(kind))
      const f = sccFields(o.cor, entranceField(o.amp, o.opdScience, n, lam, 1), DEFAULT_SCC, o.refPeak)
      const fm = sccFields(model.cor, entranceField(model.pupil, new Float64Array(n * n), n, lam, 1), DEFAULT_SCC, model.refPeak)
      const est = sccEstimate(sccImage(f), f.u, fm.Er, DEFAULT_SCC)
      const m = f.u.length
      const a: number[] = [], b: number[] = []
      for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) {
        const r = Math.hypot(f.u[k], f.u[l])
        if (r < 3 || r > 8) continue
        a.push(est.re[l * m + k], est.im[l * m + k]); b.push(f.Es.re[l * m + k], f.Es.im[l * m + k])
      }
      expect(relErr(a, b)).toBeLessThan(0.15)
    })
  }
})
