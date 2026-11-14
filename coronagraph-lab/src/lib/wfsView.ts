/**
 * The wavefront-sensor panel: raw sensor signal, the reconstructed wavefront (or estimated field) and the truth,
 * with the error between them. Also provides the cached sensors, calibrations and Jacobians used by the loops.
 */
import { type LabConfig, sccCompatible } from './config.ts'
import { type DmModes, calibrateOnDm, dmZernikeModes } from './control/ao.ts'
import { type DarkHole, fieldInHole, makeDarkHole } from './control/darkHole.ts'
import { type Jacobian, computeJacobianAsync } from './control/jacobian.ts'
import { adaptiveProbeNm, pairwiseEstimate, probeCommands } from './control/pairwise.ts'
import { dmSurface } from './dm.ts'
import { type Memo, dmFor, opticsFor } from './frame.ts'
import { NO_ABERRATIONS, entranceField, rmsOverPupil } from './optics.ts'
import type { Img } from './planes.ts'
import { type Optics } from './train.ts'
import { type Calibration, modalMap, reconstruct } from './wfs/calibration.ts'
import { curvature } from './wfs/curvature.ts'
import { diversityImages, phaseDiversityEstimate } from './wfs/phaseDiversity.ts'
import { pyramid } from './wfs/pyramid.ts'
import { DEFAULT_SCC, sccEstimate, sccFields, sccImage } from './wfs/scc.ts'
import { shackHartmann } from './wfs/shackHartmann.ts'
import { type PupilSensor, PUPIL_WFS_KINDS, type PupilWfsKind } from './wfs/types.ts'
import { zernikeWfs } from './wfs/zernikeWfs.ts'
import { zernikeMap } from './zernike.ts'

export interface WfsData {
  readonly kind: string
  readonly raw: Img
  readonly estimate: Img | null
  readonly truth: Img | null
  /** 'nm': wavefront maps; 'contrast': focal-plane intensity maps of the dark hole. */
  readonly units: 'nm' | 'contrast'
  /** RMS of the truth and of (estimate − truth): nm for wavefronts, relative field error for focal sensors. */
  readonly truthRms: number
  readonly errorRms: number
  readonly note: string
}

export type Pause = () => Promise<boolean>

export function isPupilWfs(kind: string): kind is PupilWfsKind {
  return (PUPIL_WFS_KINDS as readonly string[]).includes(kind)
}

export function pupilSensorFor(c: LabConfig, o: Optics, memo: Memo): PupilSensor {
  const w = c.wfs
  return memo.get(`sensor:${w.kind}:${w.nsub}:${w.modulation}:${w.curvatureDistance}:${c.npup}:${JSON.stringify(c.pupil)}`, () => {
    switch (w.kind as PupilWfsKind) {
      case 'shack-hartmann': return shackHartmann(o.pupil, c.npup, w.nsub)
      case 'pyramid': return pyramid(o.pupil, c.npup, w.modulation)
      case 'zernike': return zernikeWfs(o.pupil, c.npup)
      case 'curvature': return curvature(o.pupil, c.npup, w.curvatureDistance)
    }
  })
}

export function dmModesFor(c: LabConfig, o: Optics, memo: Memo): DmModes {
  return memo.get(`modes:${JSON.stringify(c.dm)}:${c.npup}:${JSON.stringify(c.pupil)}:${c.wfs.modes}`, () => dmZernikeModes(dmFor(c), o.pupil, c.wfs.modes))
}

export function calibrationFor(c: LabConfig, o: Optics, memo: Memo): Calibration {
  const sensor = pupilSensorFor(c, o, memo)
  const modes = dmModesFor(c, o, memo)
  const a = c.aberrations
  return memo.get(`cal:${JSON.stringify(c.wfs)}:${JSON.stringify(c.dm)}:${c.npup}:${JSON.stringify(c.pupil)}:${a.amplitudeRms}:${a.amplitudeSeed}:${c.wavelengthNm}`,
    () => calibrateOnDm(sensor, o.amp, c.npup, modes, c.wavelengthNm))
}

export function darkHoleFor(c: LabConfig): DarkHole {
  return makeDarkHole({ iwa: c.control.iwa, owa: c.control.owa, half: c.control.half })
}

/** Unaberrated model of the instrument, the basis of the Jacobian. */
export function modelFor(c: LabConfig, memo: Memo): Optics {
  return opticsFor({ ...c, aberrations: NO_ABERRATIONS, bandwidth: 0 }, memo)
}

const jacobians = new Map<string, Jacobian>()
export async function jacobianFor(c: LabConfig, memo: Memo, progress: (f: number) => void, pause: Pause): Promise<Jacobian | null> {
  const key = `${JSON.stringify(c.coronagraph)}:${JSON.stringify(c.pupil)}:${c.npup}:${JSON.stringify(c.dm)}:${JSON.stringify(darkHoleFor(c).spec)}:${c.wavelengthNm}`
  const hit = jacobians.get(key)
  if (hit) return hit
  const J = await computeJacobianAsync(modelFor(c, memo), dmFor(c), darkHoleFor(c), progress, pause)
  if (J) { if (jacobians.size > 3) jacobians.delete(jacobians.keys().next().value as string); jacobians.set(key, J) }
  return J
}

/** True dark-hole field (mono, λ0) with the DM command `cmd`. */
export function trueHoleField(c: LabConfig, o: Optics, cmd: Float64Array, dh: DarkHole) {
  const s = dmSurface(dmFor(c), cmd)
  return fieldInHole(o, entranceField(o.amp, o.opdScience.map((v, i) => v + s[i]), c.npup, c.wavelengthNm, 1), dh)
}

/** Dark-hole pixels as an image on the hole's sub-grid (NaN outside the hole). */
export function holeImage(dh: DarkHole, values: ArrayLike<number>): Img {
  const w = dh.u.length, h = dh.v.length
  const data = new Float32Array(w * h).fill(NaN)
  dh.pixels.forEach((p, i) => { data[p] = values[i] })
  return { w, h, data }
}

function relErr(a: { re: ArrayLike<number>; im: ArrayLike<number> }, b: { re: ArrayLike<number>; im: ArrayLike<number> }): number {
  let e = 0, r = 0
  for (let i = 0; i < b.re.length; i++) { e += (a.re[i] - b.re[i]) ** 2 + (a.im[i] - b.im[i]) ** 2; r += b.re[i] ** 2 + b.im[i] ** 2 }
  return r > 0 ? Math.sqrt(e / r) : NaN
}

const masked = (o: Optics, map: ArrayLike<number>) => Float32Array.from(o.pupil, (p, i) => (p > 0 ? map[i] : NaN))

export async function computeWfs(c: LabConfig, cmd: Float64Array, memo: Memo, progress: (f: number) => void, pause: Pause): Promise<WfsData | null> {
  const o = opticsFor(c, memo)
  const n = c.npup
  const dmOpd = dmSurface(dmFor(c), cmd)
  if (isPupilWfs(c.wfs.kind)) {
    const sensor = pupilSensorFor(c, o, memo)
    const cal = calibrationFor(c, o, memo)
    const opd = o.opdWfs.map((v, i) => v + dmOpd[i])
    const meas = sensor.measure(entranceField(o.amp, opd, n, c.wavelengthNm, 1))
    const rec = modalMap(cal, reconstruct(cal, meas.signal), n)
    const mean = opd.reduce((s, v, i) => s + v * o.pupil[i], 0) / o.pupil.reduce((s, v) => s + v, 0)
    const truth = opd.map((v) => v - mean)
    return {
      kind: c.wfs.kind, raw: { w: meas.image.w, h: meas.image.h, data: Float32Array.from(meas.image.data) },
      estimate: { w: n, h: n, data: masked(o, rec) }, truth: { w: n, h: n, data: masked(o, truth) }, units: 'nm',
      truthRms: rmsOverPupil(truth, o.pupil), errorRms: rmsOverPupil(truth.map((v, i) => v - rec[i]), o.pupil),
      note: `WFS arm at λ0, ${c.wfs.modes} modes. Non-common-path aberrations are invisible here.`,
    }
  }
  if (c.wfs.kind === 'phase-diversity') {
    const spec = { modes: 10, diversityNm: 0.15 * c.wavelengthNm, wavelengthNm: c.wavelengthNm }
    const opd = o.opdScience.map((v, i) => v + dmOpd[i])
    const imgs = diversityImages(o.amp, n, opd, spec)
    const coef = phaseDiversityEstimate(o.pupil, n, imgs, spec)
    const rec = new Float64Array(n * n)
    coef.forEach((v, j) => { const z = zernikeMap(j + 2, n); for (let i = 0; i < rec.length; i++) rec[i] += v * z[i] })
    const mean = opd.reduce((s, v, i) => s + v * o.pupil[i], 0) / o.pupil.reduce((s, v) => s + v, 0)
    const truth = opd.map((v) => v - mean)
    const m = 33
    const raw = new Float32Array(2 * m * m)
    for (let y = 0; y < m; y++) for (let x = 0; x < m; x++) { raw[y * 2 * m + x] = imgs[y * m + x]; raw[y * 2 * m + m + x] = imgs[m * m + y * m + x] }
    return {
      kind: c.wfs.kind, raw: { w: 2 * m, h: m, data: raw }, estimate: { w: n, h: n, data: masked(o, rec) },
      truth: { w: n, h: n, data: masked(o, truth) }, units: 'nm',
      truthRms: rmsOverPupil(truth, o.pupil), errorRms: rmsOverPupil(truth.map((v, i) => v - rec[i]), o.pupil),
      note: 'Science arm (NCPA included), coronagraph mask removed; fit of Noll modes 2–11 only.',
    }
  }
  const dh = darkHoleFor(c)
  const truthField = trueHoleField(c, o, cmd, dh)
  const truthI = truthField.re.map((v, i) => v * v + truthField.im[i] ** 2)
  if (c.wfs.kind === 'scc') {
    if (!sccCompatible(c.coronagraph)) return null
    const model = modelFor(c, memo)
    const f = sccFields(o.cor, entranceField(o.amp, o.opdScience.map((v, i) => v + dmOpd[i]), n, c.wavelengthNm, 1), DEFAULT_SCC, o.refPeak)
    const fm = memo.get(`sccref:${JSON.stringify(c.coronagraph)}:${JSON.stringify(c.pupil)}:${n}`, () =>
      sccFields(model.cor, entranceField(model.pupil, new Float64Array(n * n), n, c.wavelengthNm, 1), DEFAULT_SCC, model.refPeak))
    const I = sccImage(f)
    const est = sccEstimate(I, f.u, fm.Er, DEFAULT_SCC)
    const pick = sccToHole(f.u, dh)
    const e = { re: pick.map((i) => est.re[i]), im: pick.map((i) => est.im[i]) }
    return {
      kind: c.wfs.kind, raw: { w: f.u.length, h: f.u.length, data: Float32Array.from(I) },
      estimate: holeImage(dh, e.re.map((v, i) => v * v + e.im[i] ** 2)), truth: holeImage(dh, truthI), units: 'contrast',
      truthRms: Math.sqrt(truthI.reduce((s, v) => s + v, 0) / truthI.length), errorRms: relErr(e, truthField),
      note: `Reference hole at ${DEFAULT_SCC.xi0} D; one fringed image at 6 samples per λ/D.`,
    }
  }
  // Pairwise probing (needs the Jacobian).
  const J = await jacobianFor(c, memo, progress, pause)
  if (!J) return null
  const dm = dmFor(c)
  const unit = probeCommands(dm, dh.spec, 1, 3)
  const meanI = truthI.reduce((s, v) => s + v, 0) / truthI.length
  const amp = adaptiveProbeNm(J, unit[0], meanI)
  const measure = (off: Float64Array) => { const f = trueHoleField(c, o, cmd.map((v, i) => v + off[i]), dh); return f.re.map((v, i) => v * v + f.im[i] ** 2) }
  const probes = unit.map((p) => p.map((v) => v * amp))
  const est = pairwiseEstimate(J, probes, measure)
  const plus = measure(probes[0]), minus = measure(probes[0].map((v) => -v))
  return {
    kind: c.wfs.kind, raw: holeImage(dh, plus.map((v, i) => v - minus[i])),
    estimate: holeImage(dh, est.re.map((v, i) => v * v + est.im[i] ** 2)), truth: holeImage(dh, truthI), units: 'contrast',
    truthRms: Math.sqrt(meanI), errorRms: relErr(est, truthField),
    note: `Three probe pairs of ${amp.toFixed(2)} nm; raw signal = I⁺ − I⁻ of the first probe.`,
  }
}

/** Indices of the SCC image samples (q = 6 grid) that coincide with the dark-hole pixels (q = 2 grid). */
export function sccToHole(u: Float64Array, dh: DarkHole): number[] {
  const m = u.length
  const near = (x: number) => { let b = 0; for (let k = 1; k < m; k++) if (Math.abs(u[k] - x) < Math.abs(u[b] - x)) b = k; return b }
  const ix = Array.from(dh.u, near), iy = Array.from(dh.v, near)
  return dh.pixels.map((p) => iy[Math.floor(p / dh.u.length)] * m + ix[p % dh.u.length])
}
