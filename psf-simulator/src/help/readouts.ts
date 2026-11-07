import type { HelpEntry } from './types'

export type ReadoutKey =
  | 'lambdaOverD'
  | 'airyRadius'
  | 'throughput'
  | 'strehl'
  | 'wavefrontRms'
  | 'marechal'
  | 'relativePeak'
  | 'bandSamples'
  | 'computeTime'
  | 'psfImage'
  | 'pupilView'
  | 'profilePlot'

export const READOUT_HELP: Record<ReadoutKey, HelpEntry> = {
  lambdaOverD: {
    title: 'λ/D',
    body: 'The natural angular unit of diffraction: wavelength divided by mirror diameter, converted to arcseconds.',
    formulas: ['λ/D [″] = λ [m] / D [m] × 206 265'],
  },
  airyRadius: {
    title: 'Airy radius 1.22 λ/D',
    body:
      'Angular radius of the first dark ring around the star. Two equal stars closer than this are barely resolved (Rayleigh criterion).',
    formulas: ['θ₁ = 1.22 λ/D', 'First zero of J₁ at x = 3.8317  →  θ₁ = 3.8317 · λ / (πD)'],
  },
  throughput: {
    title: 'Light-collecting area',
    body: 'Open area of the aperture divided by the area of a full circle of diameter D. Obstruction, vanes and gaps lower it.',
    formulas: ['A_open / (πD²/4)', 'Central obstruction only: 1 − ε²'],
  },
  strehl: {
    title: 'Strehl ratio S',
    body: 'Peak brightness of the star image compared with a perfect telescope of the same aperture. 1 is perfect; 0.8 or more is called diffraction limited.',
    formulas: ['S = I_peak / I_peak(ideal, same aperture)'],
  },
  wavefrontRms: {
    title: 'Wavefront error σ (RMS)',
    body: 'Root-mean-square deviation of the wavefront from a perfect flat wave, over the open part of the pupil, with the average (piston) removed. In waves.',
    formulas: ['σ = √( ⟨W²⟩ − ⟨W⟩² )', 'For Zernike modes over a full circle: σ² = Σₖ cₖ²'],
  },
  marechal: {
    title: 'Strehl from the Maréchal approximation',
    body:
      'Estimate of S from σ alone. Accurate for small errors (σ below about 0.1 wave). Compare it with the simulated Strehl above to see where it stops working.',
    formulas: ['S ≈ exp[ −(2πσ)² ]  ≈ 1 − (2πσ)²', 'S = 0.8 at σ ≈ 0.075 wave (about λ/13)'],
  },
  relativePeak: {
    title: 'Peak vs. a clear circular telescope',
    body: 'Peak brightness compared with an unobstructed, unaberrated circular mirror of the same diameter.',
    formulas: ['(A_open / A_circle)² × S'],
  },
  bandSamples: {
    title: 'Wavelength samples',
    body: 'How many wavelengths are added together. 1 means monochromatic light.',
  },
  computeTime: {
    title: 'Compute time',
    body: 'Time the background worker needed for the last frame (FFTs and drawing).',
  },
  psfImage: {
    title: 'Point Spread Function (PSF)',
    body:
      'The image of a point source (a star) made by the telescope, on a logarithmic brightness scale. The bright center is the core (Airy disk), the rings are diffraction, ' +
      'the spikes come from the spider vanes, and distortions come from aberrations.',
    formulas: ['PSF(θ) = | FFT{ A(x,y) · exp[ i·2π·W(x,y) ] } |²', 'A: aperture (1 open, 0 blocked);  W: wavefront error in waves'],
  },
  pupilView: {
    title: 'Pupil view',
    body: 'The telescope aperture as the star sees it. Brightness is transmission (black is blocked). Color is the wavefront error W: blue negative, red positive, white zero, with a scale of ±1 wave.',
  },
  profilePlot: {
    title: 'Radial profile',
    body:
      'Intensity averaged around circles centered on the star, against angular distance, on a log axis. Amber is the simulation. ' +
      'Dashed gray is the ideal Airy pattern of a clear circular telescope with the same D and band.',
    formulas: ['I(θ) = [ 2J₁(x)/x ]²,   x = πDθ/λ', 'Ring peaks: 1.75 %, 0.42 %, 0.16 % of the central peak …'],
    note: 'The image is sampled 4 times per λ/D, so interpolation lifts the deepest dark rings slightly above theory.',
  },
}
