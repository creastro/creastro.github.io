import type { HelpEntry } from './types'

export type SegmentKey =
  | 'segmented'
  | 'presets'
  | 'rings'
  | 'gap'
  | 'removeCenter'
  | 'pistonRms'
  | 'tiltRms'
  | 'newDraw'

export const SEGMENT_HELP: Record<SegmentKey, HelpEntry> = {
  segmented: {
    title: 'Segmented hexagonal mirror',
    body:
      'Very large telescopes (Keck, JWST, the ELT) build the primary mirror from many hexagonal segments. Switching this on replaces the solid disk with a honeycomb. ' +
      'The star image is then the diffraction pattern of one hexagon (which gives six spikes) multiplied by the pattern of the lattice of segments. ' +
      'D becomes the diameter of the circle that just encloses all segments.',
    formulas: [
      'A(x, y) = Σⱼ hex(x − xⱼ, y − yⱼ)',
      'Ã(θ) = hex̃(θ) · Σⱼ exp(−i·2π·rⱼ·θ / λ)     (segment shape × lattice sum)',
      'Segment centers:  x = p (q + r/2),  y = p · r · √3/2,  p = f + gap',
    ],
    note: 'The central obstruction and spider vanes still apply on top of the segments.',
  },
  presets: {
    title: 'Telescope presets',
    body:
      'Sets the segment layout of a real telescope: JWST has 18 segments (2 rings, empty center), Keck has 36 (3 rings, empty center). "91 segments" is a 5-ring mirror in the 30 m class. ' +
      'A preset also sets D and the field of view so that the pattern fits the picture, and turns off the obstruction and vanes so the mirror\'s own pattern is visible. ' +
      'Gap sizes are approximate.',
    formulas: ['JWST: D ≈ 6.5 m, 18 segments of 1.32 m flat-to-flat', 'Keck: D = 10 m, 36 segments'],
  },
  rings: {
    title: 'Number of rings k',
    body: 'How many hexagonal rings surround the center segment. More rings mean more, smaller segments in the same diameter D.',
    formulas: [
      'Segments N = 3k(k + 1) + 1:  7, 19, 37, 61, 91  for k = 1…5',
      'Ring j holds 6j segments',
      'With the center removed: N = 3k(k + 1)  (JWST k = 2 → 18, Keck k = 3 → 36)',
    ],
  },
  gap: {
    title: 'Gap between segments',
    body:
      'Width of the empty strip between neighboring segments, as a fraction of the segment width. Gaps lose a little light and scatter a small fraction of it into faint spikes along the three directions of the segment edges. ' +
      'Real gaps are tiny (JWST: about 0.5 %), so on the screen they are far thinner than a pixel and are handled by sub-pixel sampling.',
    formulas: ['gap = g × f,   f = segment width between opposite edges', 'Segment area = (√3/2) f²'],
  },
  removeCenter: {
    title: 'Remove center segment',
    body:
      'Leaves the middle of the mirror empty, as on JWST and Keck. The hole lets the beam pass through or keeps the center for other hardware. Together with the central obstruction it removes light from the middle of the pupil.',
    formulas: ['N = 3k(k + 1) + 1 − 1 = 3k(k + 1)'],
  },
  pistonRms: {
    title: 'Segment piston error (RMS)',
    body:
      'Each segment sits slightly in front of or behind its ideal position. The errors are random (Gaussian, a different draw for each segment) and are given as wavefront error in waves at the center wavelength. ' +
      'Piston errors destroy the phasing between segments: the sharp core shrinks and light goes into a speckle halo. A surface offset s gives a wavefront error of 2s when light reflects.',
    formulas: [
      'Wⱼ = pⱼ,   pⱼ ~ N(0, σ_p²)  in waves',
      'S ≈ exp[ −(2π σ_p)² ]   (mean over random draws)',
      'Phasing goal: σ_p ≲ 0.075 wave (about λ/13) for S ≥ 0.8',
    ],
    note: 'The error is a fixed length, so in waves it scales as 1/λ across a wide band.',
  },
  tiltRms: {
    title: 'Segment tip/tilt error (RMS)',
    body:
      'Each segment is also tilted a little in two directions. The value is the RMS of each tilt component, measured as the wavefront change in waves at the edge of a segment. ' +
      'A tilted segment sends its light to a slightly different place in the image, so the picture breaks into displaced copies of the single-segment pattern.',
    formulas: [
      'Wⱼ(u, v) = aⱼ·u + bⱼ·v,   u = x/a, v = y/a  (a = segment apothem = f/2)',
      'aⱼ, bⱼ ~ N(0, σ_t²)',
      'Resulting wavefront RMS over a hexagon ≈ 0.745 σ_t',
    ],
  },
  newDraw: {
    title: 'New random draw',
    body: 'Draws a new set of random piston and tilt errors with the same RMS. The same seed always gives the same errors, so a result can be repeated.',
    formulas: ['Errors come from a seeded generator (mulberry32) and Box–Muller Gaussians'],
  },
}
