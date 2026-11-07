import { defineConfig } from 'vite'

// Sinh telescope-psf.js cho trang simulations/telescope-psf/. Không nén để file đọc được như các simulation khác trong repo.
// File sinh ra được commit; CI chạy lại lệnh build và báo lỗi nếu nó khác bản đã commit.
export default defineConfig({
  publicDir: false,
  build: {
    outDir: '../simulations/telescope-psf',
    emptyOutDir: false,
    minify: false,
    target: 'es2022',
    lib: { entry: 'src/site/main.ts', name: 'TelescopePsf', formats: ['iife'], fileName: () => 'telescope-psf.js' },
    rollupOptions: {
      output: { banner: '/* Generated from psf-simulator/src/site/main.ts by "npm run build:site". Do not edit. */' },
    },
  },
})
