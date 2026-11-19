/**
 * Propagation primitives: energy conservation (Parseval) for every transform, and the Airy pattern.
 * Analytic references: Born & Wolf, Principles of Optics, §8.5 (Airy pattern, first zero at 1.2197 λ/D;
 * encircled energy 1 − J0²(πr) − J1²(πr) for r in λ/D, Rayleigh's formula).
 */
import { describe, expect, it } from 'vitest'
import { fft2d } from './fft.ts'
import { focalCoords, makeField, pupilCoords, sumIntensity } from './field.ts'
import { babinetPropagate, multiscalePropagate } from './focalMask.ts'
import { mftForward, mftGeneral, mftInverse } from './mft.ts'
import { makePupil } from './pupils.ts'
import { mulberry32 } from './rng.ts'
import { bandLimitedMask, vortexMask } from './coronagraph.ts'

function randomField(n: number, seed: number) {
  const r = mulberry32(seed)
  const f = makeField(n)
  for (let i = 0; i < n * n; i++) { f.re[i] = r() - 0.5; f.im[i] = r() - 0.5 }
  return f
}

/** Bessel J0 and J1 by their integral representation (Simpson, 400 panels: error < 1e-10 for x < 40). */
function besselJ(order: 0 | 1, x: number): number {
  const N = 400
  let s = 0
  for (let k = 0; k <= N; k++) {
    const t = (Math.PI * k) / N
    const w = k === 0 || k === N ? 1 : k % 2 ? 4 : 2
    s += w * Math.cos(order * t - x * Math.sin(t))
  }
  return (s * Math.PI) / (3 * N) / Math.PI
}

describe('energy conservation (Parseval)', () => {
  it('2D FFT: Σ|F|² = N² Σ|E|², and the inverse recovers the field', () => {
    const n = 32
    const f = randomField(n, 1)
    const e0 = sumIntensity(f)
    const re = f.re.slice(), im = f.im.slice()
    fft2d(re, im, n)
    expect(sumIntensity({ n, re, im }) / (n * n * e0)).toBeCloseTo(1, 12)
    fft2d(re, im, n, true)
    for (let i = 0; i < n * n; i++) expect(re[i] / (n * n)).toBeCloseTo(f.re[i], 12)
  })

  it('MFT over one full period is a unitary DFT: Σ|F|² du² = Σ|E|² dx², inverse recovers E', () => {
    const n = 24, q = 2
    const f = randomField(n, 2)
    const x = pupilCoords(n)
    const u = focalCoords(n * q, q)
    const F = mftForward(f, x, u)
    expect((sumIntensity(F) / (q * q)) / (sumIntensity(f) / (n * n))).toBeCloseTo(1, 10)
    const back = mftInverse(F, u, x)
    // With q = 2 the inverse samples are the field itself (exact DFT pair on the period q·D … restricted to D).
    for (let i = 0; i < n * n; i++) expect(back.re[i]).toBeCloseTo(f.re[i], 9)
  })

  // The sampled pupil edge removes some of the far-angle diffraction of a sharp edge, an error that falls as 1/n.
  it('pupil → detector: energy inside radius R converges to the analytic encircled energy of the Airy pattern', () => {
    const R = 8
    const ee = 1 - besselJ(0, Math.PI * R) ** 2 - besselJ(1, Math.PI * R) ** 2
    const err = [128, 256].map((n) => {
      const P = makePupil({ kind: 'circular', obscuration: 0, spiders: 0, spiderWidth: 0, rings: 0, gap: 0 }, n)
      const E = { n, re: P, im: new Float64Array(n * n) }
      const q = 4
      const u = focalCoords(2 * R * q, q)
      const F = mftForward(E, pupilCoords(n), u)
      let inside = 0
      for (let l = 0; l < u.length; l++) for (let k = 0; k < u.length; k++) {
        if (Math.hypot(u[k], u[l]) <= R) inside += F.re[l * u.length + k] ** 2 + F.im[l * u.length + k] ** 2
      }
      inside /= q * q
      // Parseval: the energy can never exceed the pupil energy.
      const total = sumIntensity(E) / (n * n)
      expect(inside).toBeLessThan(total)
      return Math.abs(inside / total - ee)
    })
    expect(err[1]).toBeLessThan(0.003)
    expect(err[1]).toBeLessThan(0.6 * err[0])
  })

  it('multi-scale focal-plane propagation with a unit mask returns the input field (partition of unity)', () => {
    const n = 32
    const x = pupilCoords(n)
    const f = randomField(n, 3)
    const out = multiscalePropagate(f, x, x, () => [1, 0], 1)
    // Tolerance: a relative amplitude error of 1e-4 limits the contrast floor of the phase masks to ~1e-8.
    let err = 0
    for (let i = 0; i < n * n; i++) err = Math.max(err, Math.hypot(out.re[i] - f.re[i], out.im[i] - f.im[i]))
    expect(err / Math.sqrt(sumIntensity(f) / (n * n))).toBeLessThan(1e-4)
  })

  it('a unit-modulus vortex mask conserves energy at the focal plane and loses none in the Lyot plane beyond the grid', () => {
    const n = 32
    const x = pupilCoords(n)
    const f = randomField(n, 4)
    const big = pupilCoords(4 * n, n)
    const out = multiscalePropagate(f, x, big, vortexMask(2), 1)
    // A random (white) field puts most of its light at high spatial frequencies where the mask only changes the
    // phase; the output must neither gain energy nor lose more than the small part diffracted beyond the 4D grid.
    const ratio = sumIntensity(out) / sumIntensity(f)
    expect(ratio).toBeLessThan(1 + 1e-6)
    expect(ratio).toBeGreaterThan(0.97)
  })

  it('Babinet propagation with a zero mask change is the identity', () => {
    const n = 32
    const x = pupilCoords(n)
    const f = randomField(n, 5)
    const out = babinetPropagate(f, x, x, 1, () => [0, 0], 1)
    for (let i = 0; i < n * n; i++) expect(out.re[i]).toBeCloseTo(f.re[i], 12)
  })

  it('band-limited mask has unit transmission far from the star and zero on axis', () => {
    const m = bandLimitedMask(0.2)
    expect(m(0, 0)[0]).toBe(0)
    expect(m(1 / 0.2, 0)[0]).toBeCloseTo(1, 12) // sinc² zero at u = 1/ε
  })
})

describe('Airy pattern', () => {
  it('first dark ring of a circular pupil at 1.22 λ/D', () => {
    const n = 128
    const P = makePupil({ kind: 'circular', obscuration: 0, spiders: 0, spiderWidth: 0, rings: 0, gap: 0 }, n)
    const x = pupilCoords(n)
    const q = 200
    const u = new Float64Array(161).map((_, k) => 0.9 + k / q)
    const g = mftGeneral(P, new Float64Array(n * n), x, u, new Float64Array([0]), -1, 1 / (n * n))
    let best = 0
    for (let k = 1; k < u.length; k++) if (g.re[k] ** 2 + g.im[k] ** 2 < g.re[best] ** 2 + g.im[best] ** 2) best = k
    expect(Math.abs(u[best] - 1.2197)).toBeLessThan(0.01)
    // Peak normalisation: |F(0)|² = (area)², area = π/4 in units of D².
    const c = mftGeneral(P, new Float64Array(n * n), x, new Float64Array([0]), new Float64Array([0]), -1, 1 / (n * n))
    expect(c.re[0]).toBeCloseTo(Math.PI / 4, 3)
  })
})
