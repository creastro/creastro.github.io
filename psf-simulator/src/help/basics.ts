/** Nội dung cửa sổ "Basics": kiến thức nền để hiểu mô phỏng. Toàn bộ bằng tiếng Anh. */
export interface BasicsSection {
  title: string
  paragraphs: readonly string[]
  formulas?: readonly string[]
}

export const BASICS: readonly BasicsSection[] = [
  {
    title: 'What this simulation shows',
    paragraphs: [
      'A star is so far away that it is a single point of light. A telescope cannot focus it to a perfect point. Light is a wave, so the image is a small pattern: a bright core surrounded by faint rings. That pattern is the Point Spread Function (PSF).',
      'Every object in a telescope image is the true scene blurred by the PSF, so the PSF describes how sharp the telescope can be.',
    ],
  },
  {
    title: 'How the PSF is computed (Fourier optics)',
    paragraphs: [
      'For a distant source, the light field in the focal plane is the Fourier transform of the field across the aperture. The aperture function A is 1 where the mirror reflects light and 0 where it is blocked. The wavefront error W adds a phase. The PSF is the squared magnitude of the transform.',
      'The program evaluates the transform with a 2D fast Fourier transform (FFT) on a 512 × 512 grid.',
    ],
    formulas: [
      'U(x, y) = A(x, y) · exp[ i · 2π · W(x, y) ]',
      'PSF(u, v) = | ∬ U(x, y) · exp[ −i · 2π (xu + yv) / (λf) ] dx dy |²',
      'Discrete form:  PSF = |FFT(U)|²',
    ],
  },
  {
    title: 'The diffraction limit and the Airy pattern',
    paragraphs: [
      'Even a perfect circular mirror gives the Airy pattern: a bright core and rings that get fainter outward. The first dark ring sets the resolution. Two equal stars closer than this angle blur into one (Rayleigh criterion).',
      'A bigger mirror or a shorter wavelength gives a sharper image. About 84 % of the light falls inside the first dark ring.',
    ],
    formulas: [
      'I(θ) = [ 2J₁(x) / x ]²,   x = π D θ / λ',
      'First dark ring:  θ = 1.22 λ/D',
      'The first dark ring encloses 83.8 % of the total energy',
    ],
  },
  {
    title: 'Angles and units',
    paragraphs: [
      'Angles are shown in arcseconds (″). The natural unit of the pattern is λ/D, the angle that depends on wavelength and diameter. A bigger telescope has a smaller λ/D, so the pattern shrinks.',
    ],
    formulas: ['1″ = 1/3600° = 4.848 × 10⁻⁶ rad', 'λ/D [″] = λ [m] / D [m] × 206 265', 'Example: λ = 550 nm, D = 1 m  →  λ/D = 0.113″'],
  },
  {
    title: 'Blocked light: central obstruction and spider vanes',
    paragraphs: [
      'Most reflecting telescopes have a secondary mirror in the middle of the beam. It blocks light, which moves energy from the core into the rings. The struts that hold it (the spider vanes) are thin strips, and each strip diffracts light into a spike perpendicular to it.',
    ],
    formulas: ['Open area = 1 − ε²,   ε = d_secondary / D', 'Spikes ⟂ vanes:  N even → N spikes,  N odd → 2N spikes'],
  },
  {
    title: 'Wavefront errors and Zernike modes',
    paragraphs: [
      'Real optics are never perfect. The wavefront error W says how far the real light wave is from an ideal one, in waves (one wave is one wavelength of path difference).',
      'A convenient description is a sum of Zernike polynomials. Each one is a simple shape (focus, astigmatism, coma, spherical aberration), scaled so that its coefficient equals its RMS size. The coefficients here are in waves RMS at the center wavelength.',
    ],
    formulas: [
      'W(ρ, θ) = Σₖ cₖ Zₖ(ρ, θ),   ρ = r / R,   0 ≤ ρ ≤ 1',
      'σ² = Σₖ cₖ²',
      'Z₄ = √3(2ρ² − 1)    Z₆ = √6 ρ² cos 2θ    Z₈ = √8(3ρ³ − 2ρ) cos θ    Z₁₁ = √5(6ρ⁴ − 6ρ² + 1)',
    ],
  },
  {
    title: 'Segmented mirrors',
    paragraphs: [
      'Mirrors much larger than about 8 m cannot be cast in one piece, so telescopes such as Keck, JWST and the ELT tile the primary mirror with hexagonal segments. Each segment can be moved a little in three ways: piston (along the axis), and tip and tilt.',
      'The PSF of a honeycomb is the PSF of one segment (a hexagon, which makes six diffraction spikes) multiplied by an array factor from the lattice of segments. If the segments are not aligned to a fraction of a wavelength (phased), the sharp core fades and light spreads into a speckle halo, so the mirror must be phased to about λ/13 RMS or better.',
    ],
    formulas: [
      'N = 3k(k + 1) + 1 segments for k rings',
      'Ã(θ) = hex̃(θ) · Σⱼ exp(−i·2π·rⱼ·θ / λ)',
      'Random piston σ_p:  S ≈ exp[ −(2π σ_p)² ]',
    ],
  },
  {
    title: 'Strehl ratio and the Maréchal criterion',
    paragraphs: [
      'The Strehl ratio S is the peak of the real PSF divided by the peak of a perfect PSF for the same aperture. For small errors it depends only on the RMS wavefront error σ. A system with S of 0.8 or more is called diffraction limited.',
    ],
    formulas: ['S = I_peak / I_peak,ideal', 'S ≈ exp[ −(2πσ)² ]   (small σ)', 'S = 0.8  ⇔  σ ≈ 0.075 wave  (about λ/13; often quoted as λ/14)'],
  },
  {
    title: 'Wavelength and bandwidth',
    paragraphs: [
      'The pattern scales with wavelength, so each color has rings of a different size. With a wide band the rings of different colors overlap and blur, and the dark rings fill in. Geometric errors of a mirror are fixed in length, so in waves they get smaller at longer wavelengths.',
    ],
    formulas: ['I_band(θ) = Σᵢ wᵢ I(θ; λᵢ)', 'c(λ) = c(λ₀) · λ₀ / λ'],
  },
  {
    title: 'Reading the display',
    paragraphs: [
      'The rings are thousands of times fainter than the core, so brightness is shown on a logarithmic scale. White is the ideal peak and black is 10⁻ᴿ of it, with R the dynamic range you choose.',
      'The false-color maps (Hot, Inferno, Viridis, Ice) only change how brightness is colored. The radial profile averages the image around the star and compares it with the ideal Airy pattern.',
    ],
    formulas: ['v = (log₁₀ I + R) / R,  clamped to [0, 1]'],
  },
  {
    title: 'Numerical method and limits',
    paragraphs: [
      'The pupil is 128 pixels wide inside a 512 × 512 grid, which gives 4 samples per λ/D and a computed field of ±64 λ/D. The FFT assumes the pattern repeats, so light beyond ±64 λ/D wraps around; the effect is tiny for clean apertures.',
      'Aperture edges are anti-aliased with sub-pixel sampling. The image is interpolated for display, and very deep dark rings are not fully resolved by the sampling.',
    ],
  },
]
