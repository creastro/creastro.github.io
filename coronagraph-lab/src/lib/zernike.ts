/**
 * Zernike polynomials with Noll's ordering and normalisation (Noll 1976, J. Opt. Soc. Am. 66, 207):
 * each mode has unit RMS over the unit disk, so a coefficient is directly the RMS wavefront error of that mode.
 */

/** Noll index j (≥ 1) → radial order n and signed azimuthal frequency m. */
export function nollToNM(j: number): { n: number; m: number } {
  if (!Number.isInteger(j) || j < 1) throw new RangeError(`Noll index must be a positive integer, got ${j}`)
  let n = 0
  while (((n + 1) * (n + 2)) / 2 < j) n++
  const k = j - (n * (n + 1)) / 2 - 1 // position within the radial order, 0..n
  let m = n % 2 === 0 ? 2 * Math.floor((k + 1) / 2) : 2 * Math.floor(k / 2) + 1
  // Noll: even j ↔ cos term (m > 0), odd j ↔ sin term (m < 0)
  if (m !== 0 && j % 2 === 1) m = -m
  return { n, m }
}

function factorial(k: number): number {
  let f = 1
  for (let i = 2; i <= k; i++) f *= i
  return f
}

/** Radial polynomial R_n^|m|(ρ). */
export function radial(n: number, m: number, rho: number): number {
  const am = Math.abs(m)
  let s = 0
  for (let k = 0; k <= (n - am) / 2; k++) {
    s += ((k % 2 ? -1 : 1) * factorial(n - k)) /
      (factorial(k) * factorial((n + am) / 2 - k) * factorial((n - am) / 2 - k)) * rho ** (n - 2 * k)
  }
  return s
}

/** Value of Noll mode j at polar coordinates (ρ ≤ 1, θ). Zero outside the unit disk. */
export function zernike(j: number, rho: number, theta: number): number {
  if (rho > 1) return 0
  const { n, m } = nollToNM(j)
  const r = radial(n, m, rho)
  if (m === 0) return Math.sqrt(n + 1) * r
  const norm = Math.sqrt(2 * (n + 1))
  return m > 0 ? norm * r * Math.cos(m * theta) : norm * r * Math.sin(-m * theta)
}

const modeCache = new Map<string, Float64Array>()

/** Map of Noll mode j on an n×n pupil grid (unit disk = telescope diameter D). */
export function zernikeMap(j: number, n: number): Float64Array {
  const k = `${j}:${n}`
  const hit = modeCache.get(k)
  if (hit) return hit
  const out = new Float64Array(n * n)
  for (let y = 0; y < n; y++) {
    const yy = (2 * (y - (n - 1) / 2)) / n
    for (let x = 0; x < n; x++) {
      const xx = (2 * (x - (n - 1) / 2)) / n
      out[y * n + x] = zernike(j, Math.hypot(xx, yy), Math.atan2(yy, xx))
    }
  }
  modeCache.set(k, out)
  return out
}

/** Short names of the first Noll modes, for the user interface. */
export const ZERNIKE_NAMES: Readonly<Record<number, string>> = {
  1: 'Piston', 2: 'Tip', 3: 'Tilt', 4: 'Defocus', 5: 'Astigmatism 45°', 6: 'Astigmatism 0°',
  7: 'Coma y', 8: 'Coma x', 9: 'Trefoil y', 10: 'Trefoil x', 11: 'Spherical',
}
