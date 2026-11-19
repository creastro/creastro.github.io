/**
 * Off-axis (planet) throughput: low inside the inner working angle, recovering outside it.
 * Core throughput = energy within 0.7 λ/D of the planet, relative to the bare telescope.
 */
import { describe, expect, it } from 'vitest'
import { type CoronagraphKind } from './coronagraph.ts'
import { designIwa, innerWorkingAngle, throughputCurve } from './metrics.ts'
import { buildOptics } from './train.ts'
import { system } from './testSetup.ts'

const seps = [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 2.5, 3, 3.5, 4, 5, 6, 8, 10]
const curve = (kind: CoronagraphKind, cor = {}) => throughputCurve(buildOptics(system(kind, {}, cor)), seps)
const at = (c: { r: number[]; value: number[] }, s: number) => c.value[c.r.indexOf(s)]

describe('planet throughput', () => {
  it('the bare telescope has unit relative throughput everywhere and no IWA', () => {
    const c = curve('none')
    for (const v of c.value) expect(v).toBeCloseTo(1, 6)
    expect(innerWorkingAngle(c)).toBeNaN()
  })

  const masked: [CoronagraphKind, number][] = [['lyot', 3], ['aplc', 2.35], ['bandlimited', 2.5], ['roddier', 0.8], ['fqpm', 0.5], ['vortex', 1]]
  for (const [kind, nominal] of masked) {
    it(`${kind}: on-axis throughput ≈ 0, below half its maximum inside ~IWA/2, recovered beyond 3 × IWA`, () => {
      const c = curve(kind)
      const max = Math.max(...c.value)
      expect(at(c, 0)).toBeLessThan(0.02 * max)
      const iwa = innerWorkingAngle(c)
      expect(iwa).toBeGreaterThan(0.5 * nominal)
      expect(iwa).toBeLessThan(2 * nominal)
      const far = c.value.filter((_, i) => c.r[i] >= 3 * iwa)
      for (const v of far) expect(v).toBeGreaterThan(0.6 * max)
    })
  }

  it('classical Lyot: the IWA follows the occulter radius', () => {
    // A planet behind the opaque occulter is blocked; it reappears once its core clears the edge.
    const iwa = innerWorkingAngle(curve('lyot', { maskRadius: 3 }))
    expect(Math.abs(iwa - 3)).toBeLessThan(0.6)
  })

  it('vortex: the IWA grows with the topological charge (about 1, 2 and 3 λ/D for charges 2, 4, 6)', () => {
    const iwa = [2, 4, 6].map((charge) => innerWorkingAngle(curve('vortex', { charge })))
    expect(iwa[0]).toBeGreaterThan(0.7); expect(iwa[0]).toBeLessThan(1.5)
    expect(iwa[1]).toBeGreaterThan(iwa[0]); expect(iwa[2]).toBeGreaterThan(iwa[1])
  })

  it('designs without a focal mask (shaped pupil, APP) do not dim off-axis sources; their IWA is the dark-zone edge', () => {
    for (const kind of ['shaped', 'app'] as const) {
      const o = buildOptics(system(kind))
      const c = throughputCurve(o, seps)
      expect(innerWorkingAngle(c)).toBeNaN()
      expect(designIwa(o.cor.spec)).toBeGreaterThan(1)
      for (const v of c.value) expect(v).toBeGreaterThan(0.02)
    }
  })
})
