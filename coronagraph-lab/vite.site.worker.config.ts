import { defineConfig } from 'vite'

// Generates simulations/coronagraph-lab/coronagraph-worker.js. Not minified, so the committed file stays readable.
// The file is committed; CI rebuilds it and fails if it differs.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: '../simulations/coronagraph-lab',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    lib: { entry: 'src/worker/worker.ts', name: 'CoronagraphLabWorker', formats: ['iife'], fileName: () => 'coronagraph-worker.js' },
    rollupOptions: {
      output: { banner: '/* Generated from coronagraph-lab/src/worker/worker.ts by "npm run build:site". Do not edit. */' },
    },
  },
})
