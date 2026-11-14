# Coronagraph Lab — progress

Living checklist. Update after every milestone. See `SPEC.md` for the requirements and thresholds.

## Milestones

- [x] **M1 Engine core** — FFT, MFT, pupils (circular, obscured + spiders, hex segmented), Zernike (Noll),
  power-law screens, amplitude errors, NCPA, DM (Gaussian influence), broadband, propagation tests.
- [x] **M2 Coronagraphs** — none, Lyot, APLC, band-limited, shaped pupil, Roddier, FQPM, vortex 2/4/6, APP/vAPP;
  suppression and throughput tests.
- [x] **M3 Wavefront sensors and control** — SH, pyramid, Zernike, curvature, pairwise probing, phase diversity,
  SCC; AO integrator, speckle nulling, EFC.
- [ ] **M4 Diagram and UI** — page, worker, SVG diagram, plane thumbnails, outputs, Beginner/Expert, export.
- [ ] **M5 Explanations and citations** — verified references, info panels, bibliography, citation check.
- [ ] **M6 End-to-end tests and polish** — Playwright, `npm run verify`, screenshots, preview, CI.

## Notes

- Focal-plane control (EFC, pairwise probing, speckle nulling, SCC) works at the central wavelength λ0 only;
  the broadband image is still displayed.
- The Jacobian is computed from the unaberrated model of the instrument (as on real testbeds).

- `npm run verify` lives in `coronagraph-lab/`.
- Detector noise is only applied to the science image; the wavefront sensors are noiseless (documented limit).

## Unverified references

(none yet)
