/**
 * Telescope pupils and Lyot stops as transmission maps on an n×n grid (n samples across D).
 * Edge pixels are supersampled so that the open area, and hence the diffraction pattern, is accurate.
 */

export type PupilKind = 'circular' | 'obscured' | 'segmented'

export interface PupilSpec {
  readonly kind: PupilKind
  /** Central obstruction diameter as a fraction of D (obscured pupils; also used for an empty central segment). */
  readonly obscuration: number
  /** Number of spider vanes (obscured pupils). */
  readonly spiders: number
  /** Vane width as a fraction of D. */
  readonly spiderWidth: number
  /** Hexagonal rings around the central segment (segmented pupils). */
  readonly rings: number
  /** Gap between segments as a fraction of the segment flat-to-flat width. */
  readonly gap: number
}

export const DEFAULT_PUPIL: PupilSpec = { kind: 'circular', obscuration: 0.14, spiders: 4, spiderWidth: 0.01, rings: 2, gap: 0.02 }

type Inside = (x: number, y: number) => boolean

/**
 * Supersampled rasterisation on an m×m grid with n samples per D (m ≥ n pads the pupil plane):
 * x, y in units of D, origin at the grid centre.
 */
export function rasterize(n: number, inside: Inside, ss = 4, m = n): Float64Array {
  const out = new Float64Array(m * m)
  const d = 1 / n
  for (let j = 0; j < m; j++) {
    const yc = (j - (m - 1) / 2) * d
    for (let i = 0; i < m; i++) {
      const xc = (i - (m - 1) / 2) * d
      // Fast path: the four corners agree → the whole pixel has that value.
      const h = d / 2
      const c = [inside(xc - h, yc - h), inside(xc + h, yc - h), inside(xc - h, yc + h), inside(xc + h, yc + h), inside(xc, yc)]
      if (c.every((v) => v === c[0])) { out[j * m + i] = c[0] ? 1 : 0; continue }
      let s = 0
      for (let b = 0; b < ss; b++) {
        const y = yc + ((b + 0.5) / ss - 0.5) * d
        for (let a = 0; a < ss; a++) if (inside(xc + ((a + 0.5) / ss - 0.5) * d, y)) s++
      }
      out[j * m + i] = s / (ss * ss)
    }
  }
  return out
}

function onSpider(x: number, y: number, count: number, width: number, angle0: number): boolean {
  for (let k = 0; k < count; k++) {
    const t = angle0 + (2 * Math.PI * k) / count
    const along = x * Math.cos(t) + y * Math.sin(t)
    const across = -x * Math.sin(t) + y * Math.cos(t)
    if (along > 0 && Math.abs(across) < width / 2) return true
  }
  return false
}

/** Segment centres of a hexagonal honeycomb (pointy-top hexagons), with the pitch normalised to D = 1. */
export function hexLayout(rings: number, emptyCentre: boolean): { centres: [number, number][]; pitch: number } {
  const raw: [number, number][] = []
  for (let q = -rings; q <= rings; q++) {
    for (let r = -rings; r <= rings; r++) {
      if (Math.abs(q + r) > rings) continue
      if (emptyCentre && q === 0 && r === 0) continue
      raw.push([q + r / 2, (Math.sqrt(3) / 2) * r])
    }
  }
  // Circumradius of a pointy-top hexagon of unit flat-to-flat width is 1/√3.
  let rmax = 0
  for (const [x, y] of raw) {
    for (let v = 0; v < 6; v++) {
      const a = Math.PI / 2 + (v * Math.PI) / 3
      rmax = Math.max(rmax, Math.hypot(x + Math.cos(a) / Math.sqrt(3), y + Math.sin(a) / Math.sqrt(3)))
    }
  }
  const pitch = 0.5 / rmax
  return { centres: raw.map(([x, y]) => [x * pitch, y * pitch]), pitch }
}

function insideHex(x: number, y: number, apothem: number): boolean {
  const ax = Math.abs(x), ay = Math.abs(y)
  return ax <= apothem && ax * 0.5 + ay * (Math.sqrt(3) / 2) <= apothem
}

/** Function telling whether (x, y) is inside the open aperture. */
export function pupilInside(spec: PupilSpec): Inside {
  if (spec.kind === 'circular') return (x, y) => x * x + y * y <= 0.25
  if (spec.kind === 'obscured') {
    const ro = spec.obscuration / 2
    return (x, y) => {
      const r2 = x * x + y * y
      return r2 <= 0.25 && r2 >= ro * ro && !onSpider(x, y, spec.spiders, spec.spiderWidth, Math.PI / 4)
    }
  }
  const { centres, pitch } = hexLayout(spec.rings, spec.obscuration > 0)
  const apothem = (pitch * (1 - spec.gap)) / 2
  return (x, y) => {
    for (const [cx, cy] of centres) {
      if (Math.abs(x - cx) <= apothem && insideHex(x - cx, y - cy, apothem)) return true
    }
    return false
  }
}

const pupilCache = new Map<string, Float64Array>()

export function makePupil(spec: PupilSpec, n: number): Float64Array {
  const k = JSON.stringify([spec, n])
  const hit = pupilCache.get(k)
  if (hit) return hit
  const p = rasterize(n, pupilInside(spec))
  if (pupilCache.size > 16) pupilCache.delete(pupilCache.keys().next().value as string)
  pupilCache.set(k, p)
  return p
}

export interface LyotSpec {
  /** Outer diameter of the stop as a fraction of D. */
  readonly outer: number
  /** Inner (central) diameter as a fraction of D; 0 for none. */
  readonly inner: number
  /** Vane width as a fraction of D (only used when the pupil has spiders). */
  readonly spiderWidth: number
}

/**
 * Lyot stop: a scaled-down copy of the pupil outline (circle for segmented pupils), oversized obstruction
 * and vanes, on an m×m grid with n samples per D.
 */
export function makeLyotStop(pupil: PupilSpec, stop: LyotSpec, n: number, m = n): Float64Array {
  const k = JSON.stringify(['lyot', pupil, stop, n, m])
  const hit = pupilCache.get(k)
  if (hit) return hit
  // Segmented outlines are approximated by their inscribed circle (√3/2 of the circumscribed one).
  const rOut = (stop.outer / 2) * (pupil.kind === 'segmented' ? Math.sqrt(3) / 2 : 1)
  const rIn = stop.inner / 2
  const vanes = pupil.kind === 'obscured' ? pupil.spiders : 0
  const p = rasterize(n, (x, y) => {
    const r2 = x * x + y * y
    return r2 <= rOut * rOut && r2 >= rIn * rIn && !(vanes > 0 && onSpider(x, y, vanes, stop.spiderWidth, Math.PI / 4))
  }, 4, m)
  pupilCache.set(k, p)
  return p
}
