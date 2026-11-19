# Coronagraph Lab: source and tests

The page is **`simulations/coronagraph-lab/`**, a static page like the other simulations of the site. This folder holds
the TypeScript it is built from:

- `src/lib/` — the physics engine (no DOM): FFT and matrix Fourier transforms, pupils, aberrations, deformable mirror,
  nine coronagraphs, seven wavefront sensors, AO / EFC / speckle-nulling loops, metrics.
- `src/worker/` — the Web Worker that runs the engine (`coronagraph-worker.js`).
- `src/site/` — the page (`coronagraph-lab.js`) and its help content (`help.js`).
- `src/content/` — the verified references and the info panels.
- `scripts/` — `verify.ts` and the citation check; `e2e/` — Playwright tests.

The three generated scripts are committed (readable, not minified) and CI fails if they differ from the sources.

## Commands

```bash
npm install
npm run verify        # type check + lint, physics tests, citation check, build, end-to-end tests
npm test              # physics and content tests (Vitest)
npm run build:site    # regenerate the scripts in simulations/coronagraph-lab/
npm run e2e           # Playwright tests (Chromium) against a local static server
```

Specification, thresholds and progress: `docs/coronagraph-lab/SPEC.md` and `docs/coronagraph-lab/PROGRESS.md`.
