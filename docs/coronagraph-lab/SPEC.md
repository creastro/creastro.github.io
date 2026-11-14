# Coronagraph Lab — specification

An interactive coronagraphy simulator on the Simulations page of this site
(`simulations/coronagraph-lab/`). Static GitHub Pages site: everything runs in the browser, no backend.
All user-facing text, code comments and docs are in English.

## 1. Audience

One tool for two audiences, switched by a **Beginner / Expert** toggle.

- **Beginner:** guided walkthrough, plain-language captions, presets, few controls.
- **Expert:** every parameter exposed, log-scale images, contrast curves, numeric readouts, data export (PNG/CSV).

## 2. Physics engine

TypeScript, framework-independent (`coronagraph-lab/src/lib`), run in a Web Worker.

- Scalar Fraunhofer propagation between pupil and focal planes with FFTs, plus a matrix Fourier transform (MFT)
  for finely sampled focal-plane masks. Complex fields throughout.
- Optical train: star (on axis) + one or more planets (separation in λ/D, position angle, flux ratio)
  → telescope pupil → aberrations → deformable mirror → coronagraph → science detector, with a beam-splitter
  branch to the wavefront sensor.
- Pupils: unobstructed circular; centrally obscured with spiders; segmented (hexagonal).
- Aberrations: Zernike modes (Noll 2–11) with adjustable coefficients; power-law random phase screens;
  optional amplitude errors; optional non-common-path aberrations (NCPA) between the WFS and science arms.
- Monochromatic by default; broadband by incoherently summing several wavelengths.
- Detector: optional photon and read noise.
- Deformable mirror: N×N actuators with Gaussian influence functions.

### Coronagraphs

Amplitude masks: classical Lyot; apodized pupil Lyot (APLC); band-limited Lyot; shaped pupil.
Phase masks: Roddier & Roddier π disk; four-quadrant phase mask (FQPM); vortex (charge 2, 4, 6);
apodizing phase plate (APP and vector APP). A "no coronagraph" baseline. Stretch goal (only after everything
else passes): PIAA, hybrid Lyot.

### Wavefront sensors

Pupil plane: Shack–Hartmann; pyramid with modulation; Zernike phase-contrast; curvature.
Focal plane: pairwise DM probing; phase diversity; self-coherent camera (SCC).

Control: closed loop from WFS measurements to the DM — AO-style integrator for the pupil-plane sensors,
speckle nulling and electric field conjugation (EFC) for focal-plane sensing to dig a dark hole. Loop
iterations shown live with a contrast-vs-iteration plot.

## 3. Visualization

- Interactive SVG optical-train diagram (original drawing): telescope, lenses, labelled planes
  (A entrance pupil, B focal-plane mask, C Lyot stop, D detector), on-axis starlight and off-axis planet beams in
  different colours. Adapts to the coronagraph (apodizer for APLC, no focal mask for APP, …) and shows the WFS
  branch for the selected sensor.
- Each plane: live thumbnails of the mask and of the intensity (and phase in Expert mode) before and after the
  element; clicking a plane opens a large view.
- Outputs: final image (linear/log), radial raw-contrast curve, planet throughput, inner working angle estimate,
  WFS raw signal, reconstructed vs. true wavefront, residual RMS.
- Responsive, keyboard accessible, colour-blind-safe perceptually uniform colour maps, site look and feel.

## 4. Explanations and citations

Every coronagraph and wavefront sensor has an info panel (what it is; how it works in a short beginner version
and an expert version with key equations; strengths; limitations; instruments using it) citing peer-reviewed
sources. References live in one structured file (`coronagraph-lab/src/content/references.ts`: authors, year,
title, journal, volume, pages, DOI) rendered as a bibliography. Every reference is verified by web search
against its DOI/ADS record; unverifiable ones are removed and listed in PROGRESS.md.

## 5. Verification

`npm run verify` (in `coronagraph-lab/`) runs in order and exits non-zero on any failure:

1. type check and lint;
2. physics unit tests (Vitest);
3. citation check;
4. production build of the site scripts;
5. end-to-end browser tests (Playwright, desktop and mobile viewports).

Thresholds come from the physics (below); tests are never weakened, skipped or deleted to pass.

## 6. Working method

Milestones: engine core → coronagraphs → wavefront sensors and control → diagram/UI → explanations and
citations → end-to-end tests and polish. Commit after each on the feature branch; never push to the default
branch. Target < ~200 ms per update at the default resolution.

---

## Implementation decisions

### Layout in the repository

- `coronagraph-lab/` — TypeScript package (same toolchain as `psf-simulator/`: Vite, Vitest, oxlint, tsc).
  - `src/lib/` physics engine (no DOM), `src/worker/` Web Worker, `src/site/` page code,
    `src/content/` references and info panels, `scripts/` verify and citation check, `e2e/` Playwright tests.
- `simulations/coronagraph-lab/` — the static page: hand-written `index.html`, and the generated
  `coronagraph-lab.js`, `coronagraph-worker.js` and `help.js` (committed, regenerated by `npm run build:site`,
  checked by CI). It reuses `simulations/shared/explain.js`, `explain.css` and KaTeX like the other pages.

### Numerical model

- Pupil grid: `npup` samples across D (64 by default, 128 in Expert). Edge pixels are supersampled (4×4).
- Lyot plane: padded by `npup/8` on each side so that light diffracted just outside the pupil is visible.
- Detector: MFT to `q = 4` samples per λ0/D over ±fov (default ±16 λ0/D); an odd number of samples puts the star
  on a pixel. Broadband: the detector coordinates are scaled by λ0/λ, each wavelength weighted by (λ0/λ)².
- Units: raw contrast = intensity divided by the peak of the unaberrated off-axis PSF of the same instrument
  without its focal-plane mask (so the APP and shaped pupil are normalised to their own core).
- Focal-plane masks:
  - compact masks (Lyot occulter, Roddier disk, Zernike sensor dimple): Babinet form
    `E_C = E_A + F⁻¹{(m − 1)·F{E_A}}` with a finely sampled MFT over the mask only (Soummer et al. 2007);
  - vortex and FQPM: multi-scale scheme — an FFT (4× padding) for the outer field plus MFT levels at 16, 64 and
    256 samples per λ/D towards the centre, joined by a smooth radial partition of unity; the star falls between
    samples so the singular point is never sampled;
  - band-limited: applied as its exact pupil-plane equivalent `E − E ⊛ K` (K a unit-area triangle of half-width εD).
- APLC apodizer: leading eigenfunction of `P·F⁻¹{χ·F{P·}}` found with Lanczos iterations; the Lyot-plane residual
  on axis is `(1 − Λ)·Φ`.
- Shaped pupil: N stacked binary openings whose total height follows the 1D prolate spheroidal function
  concentrated in |u| < b (exact y-coverage rasterisation); dark zones along ±x.
- APP: phase-only pupil found with a Gerchberg–Saxton iteration that empties a D-shaped region (iwa–owa, u > 0).
  The vAPP uses the opposite sign of a geometric phase in the two circular polarisations (mirrored holes), is
  achromatic, and adds a leakage term.
- DM: `nact × nact` actuators, pitch D/nact, Gaussian influence with coupling c at the neighbour; commands are
  wavefront OPD (nm). Controls up to nact/2 cycles per pupil.

### Physics test thresholds (circular unobstructed pupil, perfect wavefront, npup = 64, λ0 = 1600 nm, mono)

Peak = maximum normalised intensity within 1.5 λ/D; zone mean = mean raw contrast in the design's dark zone.

| Test | Threshold | Physical reason |
|---|---|---|
| Airy first dark ring | |r − 1.2197| < 0.01 λ/D | Born & Wolf §8.5 |
| Encircled energy at 8 λ/D (npup 256) | error < 0.003 and falling with npup | analytic 1 − J0² − J1²; sampled edge error ∝ 1/npup |
| FFT, MFT (full period) Parseval | 1e-10 relative | unitary transforms |
| Multi-scale mask, unit mask | relative amplitude error < 1e-4 | sets a contrast floor ≈ 1e-8 |
| Classical Lyot (r = 3 λ/D, stop 0.8 D) | peak < 1e-2; zone 4–10 λ/D < 0.2 × baseline | a hard occulter does not null the star |
| APLC (4.7 λ/D diameter) | Λ > 0.9999; peak < 1e-5; zone < 1e-3 × baseline | residual (1 − Λ)² ≈ 5e-9 plus grey-edge floor |
| Band-limited (ε = 0.2) | peak < 1e-10 mono; larger in a 20 % band | exact null inside the eroded stop at λ0 |
| Shaped pupil (4 openings, b = 4) | axis contrast beyond 5 λ/D < 1e-8; ±25° wedge < 1e-6 and < 1e-2 × baseline | prolate 1 − λ0 ≈ 2e-9 |
| Roddier (r = 0.53 λ/D) | peak < 1e-2; zone < 0.2 × baseline | partial null for a circular pupil |
| FQPM | peak < 1e-6; zone < 1e-7 | perfect null in theory; numerical floor ≈ 1e-8 |
| Vortex charge 2, 4, 6 | peak < 1e-6; zone < 1e-7 | even charges null a circular pupil |
| Vortex 2, obscured pupil (ε = 0.3) | peak > 1e-4 | the null needs a clear circular pupil |
| APP | zone < 1e-5 and < 1e-2 × baseline; core kept | phase-only dark hole |
| vAPP | channels mirror images to 1e-9 | conjugate geometric phases |
| Throughput | ≈ 0 on axis; IWA within ×2 of nominal; > 0.6 max beyond 3 × IWA | |
| Vortex IWA | 0.7–1.5 λ/D for charge 2, increasing with charge | |

### Wavefront sensing and control thresholds

Injected aberration for the sensor tests: Noll 4, 5, 7, 11 = 10, −8, 6, −5 nm at λ = 1600 nm (14.9 nm RMS,
≈ 0.06 rad), well inside the linear range of every sensor.

| Test | Threshold | Reason |
|---|---|---|
| SH (8×8), pyramid (r_mod = 3 λ/D), Zernike, curvature (z' = 0.05) | modal error < 10 % of the injected RMS | linear-range error is a few % |
| Pyramid linear range | error without modulation > with modulation (90 nm RMS) | modulation extends the linear range |
| Phase diversity (0.15 λ RMS defocus diversity) | error < 10 %, signs recovered | Gonsalves (1982) |
| SCC (ξ0 = 1.65 D, hole 0.08 D) behind vortex and Lyot | field error < 15 % in 3–8 λ/D | Galicher et al. (2010) |
| Pairwise probing (3 probes, adaptive amplitude) | field error < 15 % | Give'on et al. (2007) |
| AO loop, each pupil-plane sensor, 30 DM modes, 10 iterations | final RMS < initial/2 and < 1.25 × modal fitting error + 1 nm | the loop cannot beat the fitting error of its basis |
| AO loop and NCPA | science-arm RMS stays > 15 nm with 20 nm NCPA, WFS arm < half of it | the WFS cannot see NCPA |
| EFC, perfect knowledge, one-sided hole 3–7 λ/D, 16×16 DM | contrast improves ≥ 10× in 5 iterations | requirement; measured ≈ 1000× |
| EFC with pairwise probing | ≥ 10× in 6 iterations | requirement |
| Speckle nulling | ≥ 10× in 15 iterations | Bordé & Traub (2006) |
