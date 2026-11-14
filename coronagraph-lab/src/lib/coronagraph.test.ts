/**
 * Each coronagraph, on a perfect wavefront and an unobstructed circular pupil, must suppress the star relative to
 * the no-coronagraph baseline by an amount that matches its design. Raw contrast is normalised to the peak of the
 * off-axis PSF of the same instrument (no focal mask), so the baseline peaks at 1.
 */
import { describe, expect, it } from 'vitest'
import { buildOptics, sourceImage } from './train.ts'
import { darkZone, meanInRegion } from './metrics.ts'
import { system } from './testSetup.ts'
import type { CoronagraphKind } from './coronagraph.ts'

function measure(kind: CoronagraphKind, cor = {}, over = {}) {
  const o = buildOptics(system(kind, over, cor))
  const img = sourceImage(o, null)
  const m = o.u0.length
  let peak = 0
  for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) if (Math.hypot(o.u0[k], o.u0[l]) < 1.5) peak = Math.max(peak, img[l * m + k])
  return { o, img, peak }
}

const baseline = measure('none')
function zoneMean(kind: CoronagraphKind, img: Float64Array, inner: number, outer: number, cor = {}) {
  const o = buildOptics(system(kind, {}, cor))
  const zone = darkZone(o.cor.spec, inner, outer)
  return { cor: meanInRegion(img, o.u0, zone), base: meanInRegion(baseline.img, o.u0, zone) }
}

describe('baseline', () => {
  it('the bare telescope peaks at 1 in raw-contrast units', () => {
    expect(baseline.peak).toBeCloseTo(1, 6)
  })
})

describe('amplitude-mask coronagraphs', () => {
  it('classical Lyot (3 λ/D occulter, 0.8 D stop): ≥ 100× peak suppression, ≥ 5× deeper halo at 4–10 λ/D', () => {
    // A hard-edged occulter cannot null the star; the Lyot stop only removes the light diffracted to the pupil edge.
    const r = measure('lyot')
    expect(r.peak).toBeLessThan(1e-2)
    const z = zoneMean('lyot', r.img, 4, 10)
    expect(z.cor).toBeLessThan(0.2 * z.base)
  })

  it('APLC (4.7 λ/D mask): eigenvalue Λ close to 1 and on-axis residual far below the baseline', () => {
    // Soummer (2005): with the prolate apodizer the Lyot-plane field is (1 − Λ)·Φ, i.e. a peak of (1 − Λ)².
    const r = measure('aplc')
    const lam = r.o.cor.info.eigenvalue
    expect(lam).toBeGreaterThan(0.9999)
    // (1 − Λ)² ≈ 5e-9; the grey pupil edge of the sampled aperture leaves a floor near 1e-7.
    expect(r.peak).toBeLessThan(1e-5)
    const z = zoneMean('aplc', r.img, 3, 10)
    expect(z.cor).toBeLessThan(1e-3 * z.base)
  })

  it('APLC eigenvalue grows with the mask size', () => {
    const small = buildOptics(system('aplc', {}, { maskRadius: 1.5 })).cor.info.eigenvalue
    const large = buildOptics(system('aplc', {}, { maskRadius: 2.35 })).cor.info.eigenvalue
    expect(small).toBeLessThan(large)
  })

  it('band-limited (ε = 0.2): a perfect null in monochromatic light, leakage in a 20 % band', () => {
    // Kuchner & Traub (2002): the convolution kernel of the mask is confined to ±εD, so inside the eroded stop
    // the field cancels exactly at the design wavelength.
    const r = measure('bandlimited')
    expect(r.peak).toBeLessThan(1e-10)
    const wide = measure('bandlimited', {}, { bandwidth: 0.2, nLambda: 5 })
    expect(wide.peak).toBeGreaterThan(r.peak)
  })

  it('shaped pupil (4 openings, prolate band 4 λ/D): dark zones beyond the band along x', () => {
    const r = measure('shaped')
    // Along the axis the far field is the transform of a prolate function, with 1 − λ0 ≈ 2e-9 of its energy
    // outside |u| < 4 λ/D: the contrast there must be below 1e-8.
    const m = r.o.u0.length, c = (m - 1) / 2
    let axis = 0, cnt = 0
    for (let k = 0; k < m; k++) if (Math.abs(r.o.u0[k]) >= 5) { axis += r.img[c * m + k]; cnt++ }
    expect(axis / cnt).toBeLessThan(1e-8)
    const z = zoneMean('shaped', r.img, 5, 12)
    expect(z.cor).toBeLessThan(1e-6)
    expect(z.cor).toBeLessThan(1e-2 * z.base)
  })
})

describe('phase-mask coronagraphs', () => {
  it('Roddier & Roddier π disk (0.53 λ/D): ≥ 100× peak suppression', () => {
    const r = measure('roddier')
    expect(r.peak).toBeLessThan(1e-2)
    const z = zoneMean('roddier', r.img, 3, 10)
    expect(z.cor).toBeLessThan(0.2 * z.base)
  })

  it('four-quadrant phase mask: near-total null for a circular pupil, limited only by sampling', () => {
    // Rouan et al. (2000): the FQPM rejects all the light of a centred circular pupil outside the geometric pupil.
    const r = measure('fqpm')
    expect(r.peak).toBeLessThan(1e-6)
    const z = zoneMean('fqpm', r.img, 3, 10)
    expect(z.cor).toBeLessThan(1e-7)
  })

  for (const charge of [2, 4, 6]) {
    it(`vortex of charge ${charge}: near-total null for a circular pupil`, () => {
      // Mawet et al. (2005); Foo et al. (2005): every even charge nulls an unobstructed circular pupil.
      const r = measure('vortex', { charge })
      expect(r.peak).toBeLessThan(1e-6)
      const z = zoneMean('vortex', r.img, 3, 10, { charge })
      expect(z.cor).toBeLessThan(1e-7)
    })
  }

  it('vortex of charge 2 no longer nulls a centrally obscured pupil', () => {
    const obs = { pupil: { kind: 'obscured' as const, obscuration: 0.3, spiders: 0, spiderWidth: 0, rings: 0, gap: 0 } }
    const r = measure('vortex', { charge: 2, lyotInner: 0.36 }, obs)
    expect(r.peak).toBeGreaterThan(1e-4)
  })

  it('apodizing phase plate: dark D-shaped region 100× below the baseline, star core kept', () => {
    const r = measure('app')
    expect(r.peak).toBeGreaterThan(0.3) // the APP keeps the stellar core (it is the reference PSF itself)
    const z = zoneMean('app', r.img, 2.5, 10)
    expect(z.cor).toBeLessThan(1e-5)
    expect(z.cor).toBeLessThan(1e-2 * z.base)
  })

  it('vector APP: the two circular polarisations have mirrored dark holes', () => {
    const left = measure('app', { appVector: true, vappChannel: 'left', vappLeakage: 0 })
    const right = measure('app', { appVector: true, vappChannel: 'right', vappLeakage: 0 })
    const m = left.o.u0.length
    let maxDiff = 0, scale = 0
    for (let l = 0; l < m; l++) for (let k = 0; k < m; k++) {
      maxDiff = Math.max(maxDiff, Math.abs(left.img[l * m + k] - right.img[l * m + (m - 1 - k)]))
      scale = Math.max(scale, left.img[l * m + k])
    }
    expect(maxDiff / scale).toBeLessThan(1e-9)
  })
})
