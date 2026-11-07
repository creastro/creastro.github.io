# Telescope PSF simulation: source and tests

The simulation page is **`simulations/telescope-psf/`**. It is a static page like the other simulations of the site
(Doppler, adaptive optics): `index.html`, `help.js`, a preview image, and the shared `simulations/shared/explain.js`
(tooltips and the theory dialog with KaTeX formulas). It needs no build step to be served.

This folder holds the TypeScript that the page is made from, and its tests:

- the physics, in `src/lib`;
- the page code, in `src/site`, which `npm run build:site` turns into `simulations/telescope-psf/telescope-psf.js`;
- the Web Worker, in `src/workers`, which becomes `simulations/telescope-psf/psf-worker.js`.

The two generated scripts are committed (and readable, not minified), and CI fails if they differ from what the sources
produce. Do not edit them by hand.

## Run

Serve the repository root with any static file server and open `/simulations/telescope-psf/`:

```bash
python3 -m http.server
```

The page also works when `index.html` is opened from a file: the Web Worker cannot start there, so the physics runs
on the main thread instead.

## Develop

```bash
cd psf-simulator
npm install
npm test             # Vitest
npm run lint         # oxlint
npm run typecheck    # tsc
npm run build:site   # regenerate telescope-psf.js and psf-worker.js
```

`npm run build` runs the type check and then `build:site`.

## How the physics works

In the Fraunhofer approximation the PSF is the squared magnitude of the 2D Fourier transform of the pupil field:

```
PSF(θ) = | FFT( A(x, y) · exp[i·2π·W(x, y)] ) |²
```

- The FFT grid is 512 × 512 and the pupil is 128 px across, so there are 4 samples per λ/D and the computed field is ±64 λ/D.
- Pupil edges, spider vanes and segment edges are supersampled inside edge pixels (16 × 16, or 8 × 8 for a segmented mirror), so a vane thinner than one pixel keeps the right area.
- Normalization is by `(ΣA)²`: the peak of the ideal aperture is 1. The picture shows `log10(I)` over `[-R, 0]`, with R the dynamic range.
- The image is resampled with bicubic (Catmull–Rom) interpolation to a field of view in arcseconds, so changing D or λ changes the size of the core.
- Aberrations: `W = Σ cₖ Zₖ` with Noll-normalized Zernike polynomials (RMS = 1 over the unit disk). The Strehl ratio is the PSF peak divided by the ideal peak of the same aperture, compared with the Maréchal approximation `exp[−(2π·RMS)²]`.
- Bandwidth: each wavelength sample has its own λ/D, so one angle maps to different ring radii and the image is a weighted sum of 7 samples. Geometric errors scale as 1/λ. Without errors the whole band shares one PSF.
- Segmented mirror: hexagons on a triangular lattice (`N = 3k(k+1)+1` for k rings, optional empty center), a gap, and seeded Gaussian piston and tip/tilt per segment, `Wⱼ = pⱼ + aⱼu + bⱼv`. D is the diameter of the circle that encloses all segments.
- Radial profile: the PSF averaged around the star, drawn with the ideal Airy pattern `[2J₁(x)/x]²` of the same D and band.
- The wavelength color map only illustrates hue. It does not model the source spectrum or the response of the eye.

## Verification

Tests compare against analytic results:

- FFT: a naive DFT, Parseval's theorem, the inverse, and equivalence of the zero-row shortcut.
- Aperture and PSF: the Airy pattern `[2J₁(x)/x]²`, the annular-aperture pattern, 83.8 % of the energy inside the first dark ring, vane areas against the exact integral, and diffraction spikes.
- Aberrations: Zernike orthonormality, the Maréchal approximation for each mode, energy conservation, identical images for ± defocus, an asymmetric PSF for coma, and the astigmatism sign identity.
- Wavelength: J₁ against reference values, profile against Airy, dark rings filling in for a wide band.
- Segmented mirror: segment counts (JWST 18, Keck 36), area against `N·(√3/2)f²`, the hexagonal sector structure of the PSF, mean Strehl against Maréchal, seeded errors, and the exact piston and tilt wavefront inside a segment.
- The page: `src/site/site.test.ts` loads `help.js` and `index.html` and checks that every control and readout has a tooltip, every topic can be reached, every cross-reference resolves, and every formula compiles in the KaTeX of the repository in strict mode. It also checks that the text is English and that the ids used by `main.ts` exist in the page.

## Layout

```
src/lib/        physics: fft, aperture, segments, segmentErrors, zernike, psf, profile, render, frame, ...
src/site/       the page: main.ts (controls, worker, drawing), controlSpecs.ts, plots.ts, tests
src/workers/    the frame worker
```
