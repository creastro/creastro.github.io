/**
 * Speckle nulling (Bordé & Traub 2006; Trauger & Traub 2007): model-free. Pick the brightest speckles in the dark
 * hole; for each, a DM sine wave of the matching spatial frequency adds a field at that point. Four images with
 * the sine phase stepped by π/2 give the speckle phase and the probe amplitude; then a sine with the opposite
 * phase and the matching amplitude cancels the speckle. Several well-separated speckles are treated at once.
 */
import type { Dm } from '../dm.ts'
import type { DarkHole } from './darkHole.ts'

export interface Speckle { readonly pixel: number; readonly u: number; readonly v: number }

/** The brightest pixels of the hole, at least `minSep` λ/D apart. */
export function brightestSpeckles(dh: DarkHole, I: Float64Array, count: number, minSep = 2): Speckle[] {
  const order = Array.from(I.keys()).sort((a, b) => I[b] - I[a])
  const out: Speckle[] = []
  for (const i of order) {
    const p = dh.pixels[i]
    const u = dh.u[p % dh.u.length], v = dh.v[Math.floor(p / dh.u.length)]
    if (out.every((s) => Math.hypot(s.u - u, s.v - v) >= minSep)) out.push({ pixel: i, u, v })
    if (out.length >= count) break
  }
  return out
}

/** DM command (nm) of a sine wave at focal position (u, v) λ/D, i.e. u, v cycles per pupil. */
export function sineCommand(dm: Dm, u: number, v: number, amplitudeNm: number, phase: number): Float64Array {
  return Float64Array.from(dm.ax, (x, a) => amplitudeNm * Math.cos(2 * Math.PI * (u * x + v * dm.ay[a]) + phase))
}

/**
 * One speckle-nulling iteration. `measure(offset)` returns the dark-hole intensities with the DM command offset
 * (nm). Returns the command update (nm) to add, and the number of images taken.
 */
export function speckleNullingStep(dm: Dm, dh: DarkHole, measure: (offset: Float64Array | null) => Float64Array,
  count: number, probeNm: number, gain: number): { update: Float64Array; images: number; speckles: Speckle[] } {
  const I0 = measure(null)
  const speckles = brightestSpeckles(dh, I0, count)
  const phases = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]
  // All speckles probed together: one image per phase step.
  const imgs = phases.map((ph) => {
    const off = new Float64Array(dm.ax.length)
    for (const s of speckles) { const c = sineCommand(dm, s.u, s.v, probeNm, ph); for (let a = 0; a < off.length; a++) off[a] += c[a] }
    return measure(off)
  })
  const update = new Float64Array(dm.ax.length)
  for (const s of speckles) {
    const [a, b, c, d] = imgs.map((im) => im[s.pixel])
    const e0 = I0[s.pixel]
    // I(φ) = |E|² + B² + 2|E|B cos(φ − ψ): a − c = 4|E|B cos ψ, b − d = 4|E|B sin ψ, (a + c)/2 = |E|² + B².
    const B2 = Math.max(1e-30, (a + c) / 2 - e0)
    const B = Math.sqrt(B2)
    const psi = Math.atan2(b - d, a - c)
    const amp = Math.sqrt(Math.max(0, e0)) / B // fraction of the probe amplitude that matches the speckle
    const cmd = sineCommand(dm, s.u, s.v, gain * amp * probeNm, psi + Math.PI)
    for (let i = 0; i < update.length; i++) update[i] += cmd[i]
  }
  return { update, images: 5, speckles }
}

/** Probe amplitude (nm) that scales with the speckle field: about 0.5 nm at a raw contrast of 1e-5. */
export function speckleProbeNm(meanContrast: number): number {
  return Math.max(0.05, 0.5 * Math.sqrt(meanContrast / 1e-5))
}
