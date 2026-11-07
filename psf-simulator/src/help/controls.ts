import type { HelpEntry } from './types'
import type { ZernikeName } from '../lib/zernike'

export type ControlKey =
  | 'diameter'
  | 'wavelength'
  | 'bandwidth'
  | 'obstruction'
  | 'vaneCount'
  | 'vaneThickness'
  | 'vaneAngle'
  | 'fov'
  | 'dynamicRange'
  | 'colormap'
  | 'clearAberrations'
  | 'resetAll'

export const CONTROL_HELP: Record<ControlKey, HelpEntry> = {
  diameter: {
    title: 'Primary mirror diameter D',
    body:
      'Size of the telescope aperture. Diffraction limits how sharp a star can look: the larger D is, the smaller the star image in angle. ' +
      'The field of view is fixed in arcseconds, so a larger D visibly shrinks the pattern.',
    formulas: [
      'λ/D [rad] = λ [m] / D [m]',
      '1 λ/D = λ/D × 206 265 arcsec',
      'Rayleigh limit: θ = 1.22 λ/D',
      'Example: λ = 550 nm, D = 1 m → λ/D = 0.113″',
    ],
  },
  wavelength: {
    title: 'Center wavelength λ',
    body:
      'Center wavelength of the light. The whole diffraction pattern scales with λ: red light gives a larger star image than blue light in the same telescope. ' +
      'The aberration coefficients below are defined at this wavelength.',
    formulas: ['θ_Airy = 1.22 λ/D', 'Visible light: 380–750 nm (blue ≈ 450, green ≈ 550, red ≈ 650)'],
  },
  bandwidth: {
    title: 'Bandwidth Δλ',
    body:
      'Width of a flat spectral band centered on λ. Zero means a single wavelength (monochromatic). A wider band adds up 7 wavelengths. ' +
      'The rings of different wavelengths have different sizes, so they do not line up and the dark rings fill in.',
    formulas: [
      'I_band(θ) = Σᵢ wᵢ · I(θ; λᵢ),  i = 1…7,  wᵢ = 1/7',
      'λᵢ evenly spaced in [λ − Δλ/2, λ + Δλ/2]',
      'Geometric aberrations in waves scale as c(λ) = c(λ₀) · λ₀/λ',
    ],
    note: 'With aberrations each wavelength needs its own FFT, so the image updates more slowly.',
  },
  obstruction: {
    title: 'Central obstruction ε',
    body:
      'Diameter of the secondary mirror (or any central blockage) as a fraction of D. It removes light from the middle of the pupil, ' +
      'which moves energy from the bright core into the diffraction rings.',
    formulas: [
      'ε = d_secondary / D',
      'Open area fraction = 1 − ε²',
      'Peak intensity vs. a clear circle = (1 − ε²)²',
      'I(x) = [ 2J₁(x)/x − ε² · 2J₁(εx)/(εx) ]² / (1 − ε²)²,   x = πDθ/λ',
    ],
  },
  vaneCount: {
    title: 'Number of spider vanes N',
    body:
      'The struts that hold the secondary mirror. Each vane is a thin opaque strip, and its diffraction pattern is a bright spike perpendicular to the vane. ' +
      'An even number of vanes gives N spikes, an odd number gives 2N spikes.',
    formulas: [
      'Spike direction ⟂ vane direction',
      'Number of spikes = N (N even),  2N (N odd)',
      'Strip transform (vane along x, length L, width t):  Ã(θx, θy) ∝ t·L · sinc(πLθx/λ) · sinc(πtθy/λ)',
    ],
  },
  vaneThickness: {
    title: 'Vane thickness t',
    body:
      'Width of each vane as a fraction of D. Thicker vanes block more light and make brighter spikes. ' +
      'Each spike is narrow across (about λ/L, with L the vane length) and long along its length (about λ/t).',
    formulas: ['Vane width = (t/D) × D', 'Spike peak intensity grows roughly as (t·L)², the square of the vane area'],
  },
  vaneAngle: {
    title: 'Vane rotation φ₀',
    body: 'Rotates the whole set of vanes. The diffraction spikes rotate with them.',
    formulas: ['Direction of vane j:  φⱼ = φ₀ + 360° · j / N'],
  },
  fov: {
    title: 'Field of view',
    body:
      'Full angular width of the image, in arcseconds. Zoom in to see the core, zoom out to see the rings and spikes. ' +
      'The computation covers ±64 λ/D; outside that the image is black and a warning appears.',
    formulas: ['Half-width in λ/D = (FOV / 2) / (λ/D)', '1 arcsec = 4.848 × 10⁻⁶ rad'],
  },
  dynamicRange: {
    title: 'Dynamic range (log scale)',
    body:
      'Number of decades (factors of 10) of intensity shown below the ideal peak. White is the peak, black is 10⁻ᴿ of the peak. ' +
      'Raise it to reveal faint rings, lower it for more contrast.',
    formulas: [
      'v = clamp[ (log₁₀ I + R) / R,  0,  1 ]',
      'I = 1 is the peak of the ideal PSF;  R = dynamic range in decades',
      'Example: R = 5 → black at I = 10⁻⁵ (0.001 % of the peak)',
    ],
  },
  colormap: {
    title: 'Color map',
    body:
      'How brightness becomes color. Gray, Hot, Inferno, Viridis and Ice are false-color maps of the log intensity: same data, different colors. ' +
      '"Wavelength color" tints each wavelength channel with its own spectral hue. It is only illustrative: it does not model the source spectrum or the response of the eye.',
    formulas: ['color = LUT(v),  with v from the log scale above'],
  },
  clearAberrations: {
    title: 'Clear aberrations',
    body: 'Sets all Zernike coefficients to zero, which gives a perfect wavefront and a Strehl ratio of 1.',
  },
  resetAll: {
    title: 'Reset to defaults',
    body: 'Restores every control to its starting value.',
  },
}

export const ZERNIKE_HELP: Record<ZernikeName, HelpEntry> = {
  defocus: {
    title: 'Defocus  (Z4)',
    body:
      'Focus error: the detector sits slightly in front of or behind the focus. It spreads the core symmetrically and pushes light into the rings. ' +
      'Positive and negative values give identical star images; only the colors of the pupil view change.',
    formulas: ['Z₄ = √3 (2ρ² − 1),   ρ = r / R', 'φ = 2π · c · Z₄   (c in waves RMS)', 'Strehl ≈ exp[ −(2πc)² ]'],
  },
  astigmatism0: {
    title: 'Astigmatism 0°/90°  (Z6)',
    body:
      'The mirror is more curved along one axis than the other. A star is stretched in one direction on one side of focus and in the perpendicular direction on the other side. ' +
      'Changing the sign swaps the x and y axes.',
    formulas: ['Z₆ = √6 · ρ² · cos 2θ', 'RMS of this mode over a full circle = |c|'],
  },
  astigmatism45: {
    title: 'Astigmatism 45°  (Z5)',
    body: 'Same as astigmatism 0°/90° but with the axes rotated by 45°.',
    formulas: ['Z₅ = √6 · ρ² · sin 2θ'],
  },
  comaX: {
    title: 'Coma along x  (Z8)',
    body:
      'Caused by misaligned or off-axis optics. The star becomes comet-shaped with a tail along x: one side of the core is sharp and bright, the other side is smeared. ' +
      'The pattern is no longer symmetric about the center.',
    formulas: ['Z₈ = √8 · (3ρ³ − 2ρ) · cos θ'],
  },
  comaY: {
    title: 'Coma along y  (Z7)',
    body: 'Same as coma along x but with the tail along y.',
    formulas: ['Z₇ = √8 · (3ρ³ − 2ρ) · sin θ'],
  },
  spherical: {
    title: 'Spherical aberration  (Z11)',
    body:
      'Rays from the center and the edge of the pupil focus at different distances. The star gets a bright core with a halo, and the dark rings fill in. The pattern stays circular.',
    formulas: ['Z₁₁ = √5 · (6ρ⁴ − 6ρ² + 1)'],
  },
}
