/**
 * Closed-loop runner: one iteration of AO-style modal control (pupil-plane sensors or phase diversity), EFC or
 * speckle nulling, updating the DM command, with the history of dark-hole contrast and residual wavefront.
 */
import type { LabConfig } from './config.ts'
import { aoStep } from './control/ao.ts'
import { meanIntensity } from './control/darkHole.ts'
import { efcMatrix, efcUpdate } from './control/efc.ts'
import { adaptiveProbeNm, pairwiseEstimate, probeCommands } from './control/pairwise.ts'
import { speckleNullingStep, speckleProbeNm } from './control/speckleNulling.ts'
import { dmSurface } from './dm.ts'
import { type Memo, dmFor, opticsFor } from './frame.ts'
import type { Reconstructor } from './linalg.ts'
import { entranceField, rmsOverPupil } from './optics.ts'
import { diversityImages, phaseDiversityEstimate } from './wfs/phaseDiversity.ts'
import { DEFAULT_SCC, sccEstimate, sccFields, sccImage } from './wfs/scc.ts'
import {
  type Pause, calibrationFor, darkHoleFor, dmModesFor, isPupilWfs, jacobianFor, modelFor, pupilSensorFor, sccToHole, trueHoleField,
} from './wfsView.ts'

export interface LoopPoint { readonly iteration: number; readonly contrast: number; readonly rmsScience: number; readonly rmsWfs: number }

export class LoopState {
  cmd: Float64Array
  history: LoopPoint[] = []
  private efc: { key: string; rec: Reconstructor } | null = null
  constructor(nAct: number) { this.cmd = new Float64Array(nAct) }

  reset(nAct: number): void { this.cmd = new Float64Array(nAct); this.history = []; this.efc = null }

  /** Metrics of the current state (dark-hole contrast at λ0 and residual wavefront RMS). */
  measure(c: LabConfig, memo: Memo): LoopPoint {
    const o = opticsFor(c, memo)
    const s = dmSurface(dmFor(c), this.cmd)
    const E = trueHoleField(c, o, this.cmd, darkHoleFor(c))
    return {
      iteration: this.history.length, contrast: meanIntensity(E),
      rmsScience: rmsOverPupil(o.opdScience.map((v, i) => v + s[i]), o.pupil),
      rmsWfs: rmsOverPupil(o.opdWfs.map((v, i) => v + s[i]), o.pupil),
    }
  }

  /** One control iteration. Returns false if it was interrupted or is not possible with this configuration. */
  async step(c: LabConfig, memo: Memo, progress: (f: number) => void, pause: Pause): Promise<boolean> {
    if (this.history.length === 0) this.history.push(this.measure(c, memo))
    const o = opticsFor(c, memo)
    const dm = dmFor(c)
    const n = c.npup
    const k = c.control.kind
    if (k === 'ao') {
      const modes = dmModesFor(c, o, memo)
      if (isPupilWfs(c.wfs.kind)) {
        aoStep(pupilSensorFor(c, o, memo), calibrationFor(c, o, memo), modes, dm, o.amp, o.pupil, o.opdWfs, this.cmd, c.control.gain, c.wavelengthNm)
      } else if (c.wfs.kind === 'phase-diversity') {
        // Modal correction from phase-diversity estimates of the science-arm wavefront (corrects NCPA).
        const spec = { modes: 10, diversityNm: 0.15 * c.wavelengthNm, wavelengthNm: c.wavelengthNm }
        const s = dmSurface(dm, this.cmd)
        const coef = phaseDiversityEstimate(o.pupil, n, diversityImages(o.amp, n, o.opdScience.map((v, i) => v + s[i]), spec), spec)
        coef.forEach((v, j) => { const mc = modes.commands[j]; if (mc) for (let a = 0; a < this.cmd.length; a++) this.cmd[a] -= c.control.gain * v * mc[a] })
      } else return false
    } else {
      const dh = darkHoleFor(c)
      const meas = (off: Float64Array | null) => {
        const f = trueHoleField(c, o, off ? this.cmd.map((v, i) => v + off[i]) : this.cmd, dh)
        return f.re.map((v, i) => v * v + f.im[i] ** 2)
      }
      if (k === 'speckle-nulling') {
        const I = meas(null)
        const r = speckleNullingStep(dm, dh, meas, 6, speckleProbeNm(I.reduce((a, b) => a + b, 0) / I.length), Math.min(1, c.control.gain + 0.2))
        for (let a = 0; a < this.cmd.length; a++) this.cmd[a] += r.update[a]
      } else {
        const J = await jacobianFor(c, memo, progress, pause)
        if (!J) return false
        const key = `${J.rows}:${J.cols}:${c.control.alpha}:${JSON.stringify(c.coronagraph)}`
        if (!this.efc || this.efc.key !== key) this.efc = { key, rec: efcMatrix(J, c.control.alpha) }
        let E: { re: Float64Array; im: Float64Array }
        if (c.control.estimator === 'perfect') E = trueHoleField(c, o, this.cmd, dh)
        else if (c.control.estimator === 'scc') {
          const s = dmSurface(dm, this.cmd)
          const model = modelFor(c, memo)
          const f = sccFields(o.cor, entranceField(o.amp, o.opdScience.map((v, i) => v + s[i]), n, c.wavelengthNm, 1), DEFAULT_SCC, o.refPeak)
          const fm = sccFields(model.cor, entranceField(model.pupil, new Float64Array(n * n), n, c.wavelengthNm, 1), DEFAULT_SCC, model.refPeak)
          const est = sccEstimate(sccImage(f), f.u, fm.Er, DEFAULT_SCC)
          const pick = sccToHole(f.u, dh)
          E = { re: Float64Array.from(pick, (i) => est.re[i]), im: Float64Array.from(pick, (i) => est.im[i]) }
        } else {
          const I = meas(null)
          const unit = probeCommands(dm, dh.spec, 1, 3)
          const amp = adaptiveProbeNm(J, unit[0], I.reduce((a, b) => a + b, 0) / I.length)
          E = pairwiseEstimate(J, unit.map((p) => p.map((v) => v * amp)), (off) => meas(off))
        }
        const u = efcUpdate(this.efc.rec, J, E, this.cmd.length, c.control.gain)
        for (let a = 0; a < this.cmd.length; a++) this.cmd[a] += u[a]
      }
    }
    this.history.push(this.measure(c, memo))
    return true
  }
}
