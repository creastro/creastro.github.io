# Coronagraph Lab — progress

Living checklist. Update after every milestone. See `SPEC.md` for the requirements and thresholds.

## Milestones

- [x] **M1 Engine core** — FFT, MFT, pupils (circular, obscured + spiders, hex segmented), Zernike (Noll),
  power-law screens, amplitude errors, NCPA, DM (Gaussian influence), broadband, propagation tests.
- [x] **M2 Coronagraphs** — none, Lyot, APLC, band-limited, shaped pupil, Roddier, FQPM, vortex 2/4/6, APP/vAPP;
  suppression and throughput tests.
- [x] **M3 Wavefront sensors and control** — SH, pyramid, Zernike, curvature, pairwise probing, phase diversity,
  SCC; AO integrator, speckle nulling, EFC.
- [x] **M4 Diagram and UI** — page, worker, SVG diagram, plane thumbnails, outputs, Beginner/Expert, export.
- [x] **M5 Explanations and citations** — verified references, info panels, help topics, bibliography, citation check.
- [x] **M6 End-to-end tests and polish** — Playwright, `npm run verify`, screenshots, preview, card, CI.
- [ ] Stretch goals (not started): PIAA, hybrid Lyot.

## Visual checks done (browser screenshots)

- Bare telescope: Airy rings; planet at 4 λ/D buried under rings ~100× brighter.
- Classical Lyot, plane C: bright ring on the pupil edge, fainter ringing inside, removed by the stop.
- Vortex, plane C: dark pupil interior, light outside; detector: planet stands out.
- Aberrated vortex: speckle halo; AO (SH, 10 iterations): 1.5e-6 → 1.6e-7; NCPA leave a halo the AO cannot remove.
- EFC + pairwise probing: one-sided dark hole 3–7 λ/D, ~4e-6 → ~2e-10 in 8 iterations, planet revealed.

## Layout (after user review)

- Tour presets replaced by reversible variations (pupil choice, optical errors, bandwidth) with a status line and
  "Reset this step".
- Streamlined page: image and parameters side by side (image sticky); parameters in tabs (Instrument / Sensing &
  control / Detector) with foldable groups; results in tabs (Contrast / Wavefront sensor / Closed loop / All numbers);
  "How it works" as three short cards whose full theory opens in a dialog; "What to look for" and the bibliography
  folded at the end. Desktop page height went from about 6600 px to 3500 px.

## Bugs found by the visual and end-to-end checks (fixed)

- A loop requested while another was running was silently dropped (fast clicks through the tour); runs now queue.
- Pupil-plane grid spacing was wrong for the padded Lyot plane (caught by the first coronagraph tests).

## Notes

- Focal-plane control (EFC, pairwise probing, speckle nulling, SCC) works at the central wavelength λ0 only;
  the broadband image is still displayed.
- The Jacobian is computed from the unaberrated model of the instrument (as on real testbeds).

- `npm run verify` lives in `coronagraph-lab/`.
- Detector noise is only applied to the science image; the wavefront sensors are noiseless (documented limit).

## Citation verification (November 2026)

All 31 entries of `coronagraph-lab/src/content/references.ts` were confirmed by web search against the publisher
page, ADS, arXiv or a library record (see each entry's `checkedAgainst`). Corrections made while checking:

- Roddier & Roddier 1997: DOI is 10.1086/133949 (not …950) and the published title spells "Coronograph".
- Soummer 2005: appeared online in December 2004; the ApJL volume (618) is dated 2005, as ADS lists it.

## Unverified or excluded references (not shown on the site)

- **Codona et al. 2006, Proc. SPIE 6269** (APP): the exact title and pages could not be confirmed; the search found a
  record titled "A high-contrast coronagraph for the MMT using phase apodization…". Replaced by the verified journal
  papers Codona & Angel 2004 (ApJL 604, L117) and Kenworthy et al. 2007 (ApJ 660, 762).
- **Snik et al. 2012, Proc. SPIE 8450** (vAPP): conference paper whose article number could not be confirmed;
  replaced by Otten et al. 2017 (ApJ 834, 175) for the vAPP.
- Direct DOI resolution (doi.org, Crossref) is blocked from this environment; confirmations rely on search results.

Two non-journal entries are kept and marked `peerReviewed: false`: Baudoz et al. 2006 (IAU Colloquium 200, the original
SCC paper, always cited together with the journal paper Galicher et al. 2010) and Por et al. 2018 (HCIPy, the requested
simulation reference). No panel relies on them alone; the citation check enforces this.
