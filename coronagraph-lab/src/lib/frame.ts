/**
 * One frame of the lab: the science image (star + planets, optional noise), the plane thumbnails, the radial
 * contrast curve against the bare telescope, and the numeric readouts. Pure computation, run in the worker.
 */
import { type LabConfig, systemSpec } from './config.ts'
import { DEFAULT_CORONAGRAPH } from './coronagraph.ts'
import { type Dm, dmSurface, makeDm } from './dm.ts'
import { type Curve, darkZone, designIwa, meanInRegion, radialProfile } from './metrics.ts'
import { rmsOverPupil } from './optics.ts'
import { type Img, type Planes, tracePlanes } from './planes.ts'
import { gaussian, mulberry32, poisson } from './rng.ts'
import { type Optics, buildOptics, sourceImage } from './train.ts'

/** Small keyed cache shared by the frame, the sensors and the loops. */
export class Memo {
  private readonly map = new Map<string, unknown>()
  private readonly size: number
  constructor(size = 12) { this.size = size }
  get<T>(key: string, make: () => T): T {
    if (this.map.has(key)) return this.map.get(key) as T
    const v = make()
    if (this.map.size >= this.size) this.map.delete(this.map.keys().next().value as string)
    this.map.set(key, v)
    return v
  }
}

export function opticsFor(c: LabConfig, memo: Memo): Optics {
  const spec = systemSpec(c)
  return memo.get(`optics:${JSON.stringify(spec)}`, () => buildOptics(spec))
}

export function dmFor(c: LabConfig): Dm {
  return makeDm(c.dm, c.npup)
}

export interface Readouts {
  /** Mean raw contrast of the star in the design's dark zone (3 λ/D … fov, or the dark hole). */
  readonly meanContrast: number
  readonly baselineContrast: number
  readonly peak: number
  readonly rmsScienceNm: number
  readonly rmsWfsNm: number
  readonly strehl: number
  readonly designIwa: number
  readonly eigenvalue: number
  readonly timeMs: number
}

export interface FrameData {
  readonly image: Img
  readonly fov: number
  readonly q: number
  readonly planes: Omit<Planes, 'D'>
  readonly contrast: Curve
  readonly baseline: Curve
  readonly readouts: Readouts
}

function applyNoise(img: Float64Array, c: LabConfig): Float64Array {
  const d = c.detector
  if (!d.noise) return img
  const rand = mulberry32(d.seed)
  const g = gaussian(rand)
  return img.map((v) => (poisson(Math.max(0, v) * d.peakPhotons, rand, g) + d.readNoise * g()) / d.peakPhotons)
}

export function computeFrame(c: LabConfig, cmd: Float64Array, memo: Memo): FrameData {
  const t0 = performance.now()
  const o = opticsFor(c, memo)
  const dm = dmFor(c)
  const dmOpd = dmSurface(dm, cmd)
  const star = sourceImage(o, dmOpd)
  const img = star.slice()
  for (const p of c.planets) {
    const t = (p.pa * Math.PI) / 180
    const pl = sourceImage(o, dmOpd, p.sep * Math.cos(t), p.sep * Math.sin(t))
    for (let i = 0; i < img.length; i++) img[i] += p.contrast * pl[i]
  }
  const noisy = applyNoise(img, c)
  const planes = tracePlanes(o, dmOpd)
  // Bare telescope with the same errors and DM, for the comparison curve.
  const bare = opticsFor({ ...c, coronagraph: { ...DEFAULT_CORONAGRAPH, kind: 'none', lyotOuter: 1 } }, memo)
  const base = sourceImage(bare, dmOpd)
  const zone = darkZone(o.cor.spec, 3, c.fov)
  const contrast = radialProfile(star, o.u0, 0.5, zone)
  const baseline = radialProfile(base, o.u0, 0.5, zone)
  const m = o.u0.length
  let peak = 0
  for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) if (Math.hypot(o.u0[k], o.u0[l]) < 1.5) peak = Math.max(peak, star[l * m + k])
  const rmsSci = rmsOverPupil(o.opdScience.map((v, i) => v + dmOpd[i]), o.pupil)
  const rmsWfs = rmsOverPupil(o.opdWfs.map((v, i) => v + dmOpd[i]), o.pupil)
  const { D: _d, ...rest } = planes
  void _d
  return {
    image: { w: m, h: m, data: Float32Array.from(noisy) }, fov: c.fov, q: (m - 1) / (2 * c.fov), planes: rest,
    contrast, baseline,
    readouts: {
      meanContrast: meanInRegion(star, o.u0, zone), baselineContrast: meanInRegion(base, o.u0, zone), peak,
      rmsScienceNm: rmsSci, rmsWfsNm: rmsWfs,
      strehl: Math.exp(-(((2 * Math.PI * rmsSci) / c.wavelengthNm) ** 2)),
      designIwa: designIwa(o.cor.spec), eigenvalue: o.cor.info.eigenvalue ?? NaN,
      timeMs: performance.now() - t0,
    },
  }
}
