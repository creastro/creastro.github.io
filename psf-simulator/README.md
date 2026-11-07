# Telescope PSF Simulator

A web app that simulates the **point spread function (PSF)** of a telescope in real time.
In the Fraunhofer approximation the PSF is the squared magnitude of the 2D Fourier transform of the aperture:

```
PSF(θ) = | FFT( A(x, y) · exp[i·2π·W(x, y)] ) |²
```

Hover over any control or number for an explanation with formulas, or press **Basics** for the background theory.

## Run

```bash
cd psf-simulator
npm install
npm run dev        # development server
npm test           # Vitest
npm run lint       # oxlint
npm run build      # type check and production build
```

## Controls

| Group | Parameters | Notes |
|---|---|---|
| Mirror and wavelength | Diameter D, center wavelength λ, bandwidth Δλ (0–300 nm) | D and λ set λ/D, the resolution. A wide band adds 7 wavelengths and the Airy rings blur |
| Segmented mirror | Hexagonal segments: rings k, gap, empty center, piston and tip/tilt errors, JWST/Keck presets | N = 3k(k + 1) + 1 segments. D is the circumscribed diameter |
| Obstruction | Central obstruction ε, number of spider vanes, thickness, rotation | Spikes are perpendicular to the vanes |
| Aberrations | Zernike: defocus, astigmatism (2), coma (2), spherical | Coefficients are RMS wavefront errors in waves |
| Display | Field of view (arcsec), dynamic range (log decades), color map | The log scale shows the faint Airy rings. Maps: gray, hot, inferno, viridis, ice, wavelength color |

## How it is computed

- The FFT grid is 512 × 512 and the pupil is 128 px across, so there are 4 samples per λ/D and the computed field is ±64 λ/D.
- Pupil edges and spider vanes are supersampled 16 × 16 at edge pixels, so a vane thinner than one pixel keeps the right area (error below 2.5 %).
- Normalization is by `(ΣA)²`: the peak of the ideal aperture is 1. The picture shows `log10(I)` over `[-R, 0]`, with R the dynamic range.
- The image is resampled with bicubic (Catmull–Rom) interpolation to a field of view in arcseconds, so changing D or λ really changes the size of the core.
- Aberrations: the pupil field is `A · exp(i·2π·W)` with `W = Σ cₖ Zₖ` (Noll-normalized polynomials, RMS = 1 over the unit disk). The Strehl ratio is the PSF peak divided by the ideal peak of the same aperture, and is compared with the Maréchal approximation `exp[−(2π·RMS)²]`.
- Bandwidth: each wavelength sample has its own λ/D, so one angle θ maps to different ring radii and the image is a weighted sum. Zernike coefficients are given at the center wavelength and scale as 1/λ at other wavelengths (geometric path errors do not depend on λ). Without aberrations the whole band shares one PSF.
- Radial profile: the PSF averaged around the star, drawn with the ideal Airy pattern `[2J₁(x)/x]²` of the same D and band. Bicubic interpolation lifts the deepest dark rings slightly, so do not use the plot to measure null depth.
- Segmented mirror: segments sit on a triangular lattice (center of segment `(q, r)` at `x = p(q + r/2)`, `y = p·r·√3/2`, with `p = f + gap`). Edge pixels are found from the nearest lattice site, so gaps thinner than a pixel are still supersampled 8 × 8. Each segment gets a seeded Gaussian piston and tip/tilt, `Wⱼ = pⱼ + aⱼu + bⱼv`; these are geometric path errors, so they scale as 1/λ across a band like the Zernike terms. The mean Strehl over random draws matches `exp[−(2πσ_p)²]`, and the PSF shows the six hexagonal spikes.
- The pupil view picks the smallest color range (±0.05 to ±1 wave) that holds the wavefront, and prints it under the picture.
- The wavelength color map only illustrates hue. It does not model the source spectrum or the response of the eye.
- The FFT runs in a Web Worker and only the latest request is kept while a slider moves.

## Verification

Tests compare against analytic results: a naive DFT, Parseval's theorem, the Airy pattern `[2J₁(x)/x]²`, the annular-aperture pattern, 83.8 % of the energy inside the first dark ring (1.22 λ/D), and diffraction spikes.
Aberrations: Zernike orthonormality, the Maréchal approximation for each mode, energy conservation, identical images for ± defocus, an asymmetric PSF for coma, and the identity that flipping the sign of astigmatism swaps the x and y axes.
Segmented mirror: segment counts (JWST 18, Keck 36), area against `N·(√3/2)f²`, hexagonal sector structure of the PSF, mean Strehl against Maréchal, seeded and repeatable errors, and the exact piston/tilt wavefront inside a segment.
Wavelength: J₁ against reference values, profile against Airy, and dark rings that fill in for a wide band.
Help: every control has an entry, all text is English, and the core formulas are present.

## Layout

```
src/lib/fft.ts        Cooley–Tukey 1D/2D FFT
src/lib/aperture.ts   Aperture function: mirror, obstruction, spider vanes
src/lib/psf.ts        PSF, normalization, interpolation, encircled energy
src/lib/zernike.ts    Zernike polynomials and the wavefront
src/lib/segments.ts   Hexagonal segment lattice
src/lib/segmentErrors.ts  Per-segment piston and tip/tilt
src/lib/segmentPresets.ts JWST-like, Keck-like and 91-segment layouts
src/lib/pupilView.ts  Pupil preview (aperture and phase)
src/lib/bessel.ts     J₁ and the analytic Airy pattern
src/lib/spectrum.ts   Wavelength color, band sampling
src/lib/profile.ts    Radial profile
src/lib/colormap.ts   Color maps
src/lib/render.ts     Wavelength channels → RGBA image on a log scale
src/lib/frame.ts      Physical parameters → image and numbers
src/help/             Tooltip text, readout text and the Basics content
src/workers/          Frame worker
src/components/       Slider, Tip, BasicsDialog, PsfCanvas, ProfilePlot, ...
```
