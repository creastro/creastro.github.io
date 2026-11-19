/** Small seeded random number generators so that every random draw is reproducible. */

/** Mulberry32: a fast 32-bit generator returning uniform numbers in [0, 1). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Standard normal deviates by the Box–Muller transform. */
export function gaussian(rand: () => number): () => number {
  let spare: number | null = null
  return () => {
    if (spare !== null) { const s = spare; spare = null; return s }
    let u = 0
    while (u <= 1e-300) u = rand()
    const v = rand()
    const r = Math.sqrt(-2 * Math.log(u))
    spare = r * Math.sin(2 * Math.PI * v)
    return r * Math.cos(2 * Math.PI * v)
  }
}

/** Poisson deviate (Knuth for small means, normal approximation above 50). */
export function poisson(mean: number, rand: () => number, gauss: () => number): number {
  if (mean <= 0) return 0
  if (mean > 50) return Math.max(0, Math.round(mean + Math.sqrt(mean) * gauss()))
  const l = Math.exp(-mean)
  let k = 0, p = 1
  do { k++; p *= rand() } while (p > l)
  return k - 1
}
