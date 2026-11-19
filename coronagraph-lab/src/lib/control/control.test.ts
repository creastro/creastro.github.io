/**
 * Closed loops. Pupil-plane sensors drive an AO integrator that must reduce the residual wavefront RMS.
 * Focal-plane loops dig a one-sided dark hole (3–7 λ/D, 16 × 16 actuator DM) behind a classical Lyot coronagraph:
 * EFC must improve the dark-hole contrast by at least 10× (requirement), with perfect knowledge of the field and
 * with the field estimated by pairwise probing; speckle nulling must also improve it.
 */
import { describe, expect, it } from 'vitest'
import { dmSurface, makeDm } from '../dm.ts'
import { type AberrationSpec, entranceField, rmsOverPupil } from '../optics.ts'
import { system } from '../testSetup.ts'
import { buildOptics } from '../train.ts'
import { curvature } from '../wfs/curvature.ts'
import { pyramid } from '../wfs/pyramid.ts'
import { shackHartmann } from '../wfs/shackHartmann.ts'
import type { PupilSensor } from '../wfs/types.ts'
import { zernikeWfs } from '../wfs/zernikeWfs.ts'
import { aoStep, calibrateOnDm, dmZernikeModes, modalFittingResidual } from './ao.ts'
import { fieldInHole, makeDarkHole, meanIntensity } from './darkHole.ts'
import { efcMatrix, efcUpdate } from './efc.ts'
import { computeJacobian } from './jacobian.ts'
import { adaptiveProbeNm, pairwiseEstimate, probeCommands } from './pairwise.ts'
import { speckleNullingStep, speckleProbeNm } from './speckleNulling.ts'

const n = 64, lam = 1600
const zero = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0]
const AB: AberrationSpec = {
  zernikeNm: [0, 0, 3, 2, 0, 0, 0, 0, 0, 0], screenRmsNm: 8, screenSlope: 2.5, screenSeed: 7,
  amplitudeRms: 0.01, amplitudeSeed: 3, ncpaZernikeNm: zero, ncpaRmsNm: 0, ncpaSeed: 5,
}

describe('AO loop with pupil-plane sensors', () => {
  const ab: AberrationSpec = { ...AB, zernikeNm: [5, -4, 30, -20, 15, 10, -12, 8, 0, 6], screenRmsNm: 20, amplitudeRms: 0 }
  const o = buildOptics(system('none', { aberrations: ab }))
  const dm = makeDm({ nact: 16, coupling: 0.15 }, n)
  const modes = dmZernikeModes(dm, o.pupil, 30)
  const sensors: [string, PupilSensor][] = [
    ['Shack–Hartmann', shackHartmann(o.pupil, n, 8)], ['pyramid', pyramid(o.pupil, n, 3)],
    ['Zernike', zernikeWfs(o.pupil, n)], ['curvature', curvature(o.pupil, n, 0.05)],
  ]
  for (const [name, s] of sensors) {
    // The loop cannot beat the fitting error of its 30 modes; it must reach it within 25 % (+1 nm), and halve the RMS.
    // (A Shack–Hartmann aliases the uncorrected high orders into the controlled modes, so its residual can creep up
    // slightly after the first iterations: the loop settles where the measured slopes vanish, not at minimum RMS.)
    it(`${name}: residual RMS reaches the modal fitting error in 10 iterations (gain 0.5)`, () => {
      const cal = calibrateOnDm(s, o.amp, n, modes, lam)
      const cmd = new Float64Array(dm.ax.length)
      const rms: number[] = []
      for (let k = 0; k < 10; k++) rms.push(aoStep(s, cal, modes, dm, o.amp, o.pupil, o.opdWfs, cmd, 0.5, lam).rmsBefore)
      const surf = dmSurface(dm, cmd)
      const final = rmsOverPupil(o.opdWfs.map((v, i) => v + surf[i]), o.pupil)
      const floor = modalFittingResidual(o.opdWfs, modes.shapes, o.pupil)
      expect(final).toBeLessThan(rms[0] / 2)
      expect(final).toBeLessThan(1.25 * floor + 1)
      expect(final).toBeLessThan(rms[1])
    })
  }

  it('the AO loop cannot see non-common-path aberrations', () => {
    const o2 = buildOptics(system('none', { aberrations: { ...ab, screenRmsNm: 0, ncpaZernikeNm: [0, 0, 20, 0, 0, 0, 0, 0, 0, 0] } }))
    const s = shackHartmann(o2.pupil, n, 8)
    const cal = calibrateOnDm(s, o2.amp, n, modes, lam)
    const cmd = new Float64Array(dm.ax.length)
    for (let k = 0; k < 15; k++) aoStep(s, cal, modes, dm, o2.amp, o2.pupil, o2.opdWfs, cmd, 0.5, lam)
    const surf = dmSurface(dm, cmd)
    const wfs = rmsOverPupil(o2.opdWfs.map((v, i) => v + surf[i]), o2.pupil)
    const sci = rmsOverPupil(o2.opdScience.map((v, i) => v + surf[i]), o2.pupil)
    expect(sci).toBeGreaterThan(15) // the 20 nm of NCPA defocus remain in the science arm
    expect(wfs).toBeLessThan(sci / 2)
  })
})

describe('focal-plane wavefront control (dark hole 3–7 λ/D)', () => {
  const o = buildOptics(system('lyot', { aberrations: AB }))
  const model = buildOptics(system('lyot'))
  const dm = makeDm({ nact: 16, coupling: 0.15 }, n)
  const dh = makeDarkHole({ iwa: 3, owa: 7, half: true })
  const J = computeJacobian(model, dm, dh)
  const rec = efcMatrix(J, 1e-3)
  const field = (cmd: Float64Array) => {
    const s = dmSurface(dm, cmd)
    return fieldInHole(o, entranceField(o.amp, o.opdScience.map((v, i) => v + s[i]), n, lam, 1), dh)
  }
  const intensity = (cmd: Float64Array) => { const f = field(cmd); return f.re.map((v, i) => v * v + f.im[i] ** 2) }

  it('pairwise probing estimates the dark-hole field within 15 %', () => {
    const cmd = new Float64Array(dm.ax.length)
    const E = field(cmd)
    const unit = probeCommands(dm, dh.spec, 1, 3)
    const amp = adaptiveProbeNm(J, unit[0], meanIntensity(E))
    const est = pairwiseEstimate(J, unit.map((p) => p.map((v) => v * amp)), (off) => intensity(cmd.map((v, i) => v + off[i])))
    let e = 0, r = 0
    for (let i = 0; i < E.re.length; i++) { e += (est.re[i] - E.re[i]) ** 2 + (est.im[i] - E.im[i]) ** 2; r += E.re[i] ** 2 + E.im[i] ** 2 }
    expect(Math.sqrt(e / r)).toBeLessThan(0.15)
  })

  it('EFC with perfect field knowledge improves the contrast ≥ 10× in 5 iterations', () => {
    const cmd = new Float64Array(dm.ax.length)
    const start = meanIntensity(field(cmd))
    for (let k = 0; k < 5; k++) { const u = efcUpdate(rec, J, field(cmd), cmd.length, 1); for (let i = 0; i < cmd.length; i++) cmd[i] += u[i] }
    expect(meanIntensity(field(cmd))).toBeLessThan(start / 10)
  })

  it('EFC with pairwise-probe estimation improves the contrast ≥ 10× in 6 iterations', () => {
    const cmd = new Float64Array(dm.ax.length)
    const start = meanIntensity(field(cmd))
    const unit = probeCommands(dm, dh.spec, 1, 3)
    for (let k = 0; k < 6; k++) {
      const c = meanIntensity({ re: intensity(cmd).map(Math.sqrt), im: new Float64Array(J.rows) })
      const amp = adaptiveProbeNm(J, unit[0], c)
      const est = pairwiseEstimate(J, unit.map((p) => p.map((v) => v * amp)), (off) => intensity(cmd.map((v, i) => v + off[i])))
      const u = efcUpdate(rec, J, est, cmd.length, 0.8)
      for (let i = 0; i < cmd.length; i++) cmd[i] += u[i]
    }
    expect(meanIntensity(field(cmd))).toBeLessThan(start / 10)
  })

  it('speckle nulling improves the contrast ≥ 10× in 15 iterations', () => {
    const cmd = new Float64Array(dm.ax.length)
    const start = meanIntensity(field(cmd))
    for (let k = 0; k < 15; k++) {
      const c = intensity(cmd).reduce((a, b) => a + b) / J.rows
      const r = speckleNullingStep(dm, dh, (off) => intensity(off ? cmd.map((v, i) => v + off[i]) : cmd), 6, speckleProbeNm(c), 0.7)
      for (let i = 0; i < cmd.length; i++) cmd[i] += r.update[i]
    }
    expect(meanIntensity(field(cmd))).toBeLessThan(start / 10)
  })
})
