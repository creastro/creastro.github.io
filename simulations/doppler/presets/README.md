# Doppler presets: real directly imaged planets and brown dwarfs

Each preset sets two numbers of the simulation: the spin inclination `i` and the equatorial speed `v_eq`.

## Pipeline
1. `fetch_sources.py` downloads the NASA Exoplanet Archive (`ps`, `pscomppars`), Exoplanet.eu and ADS abstracts into `sources/` (read-only, with `RETRIEVAL.json`: date, queries, sha256). Needs network access and an ADS token.
2. `build_presets.py` reads `targets.json`, `spin_measurements.json` and `sources/`, and writes `../presets.js`. Run `python3 -I build_presets.py`.
3. `../presets-ui.js` shows the selector and the provenance card.

## Rules
- Neither catalog lists planet spin. Spin values are in `spin_measurements.json`, each with an ADS bibcode and an evidence string checked against the abstract.
- `v_eq = v sin i / sin i` if `v sin i` is measured, otherwise `v_eq = 2πR/P`.
- Spin inclination: measured, else orbital inclination folded into 0-90° (spin assumed parallel to the orbit), else 90° (assumed). Each is tagged on the card.
- NASA values: the most recent reference among the `ps` parameter sets (tie: default flag; an unresolved tie is an error if the value is used). Exoplanet.eu has no per-value reference, so it is shown beside NASA, flagged if it differs by more than 10%, and used only where NASA has no value.
- The build fails if a preset leaves the slider ranges (`inc` 0-90, `veq` 2-50 km/s) and runs a self-test (Jupiter, 12.6 km/s).

## Not included
Objects without a readable spin measurement in ADS (for example AB Pic b, PDS 70 b) are left out rather than guessed.
