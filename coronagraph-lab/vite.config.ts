import { defineConfig } from 'vitest/config'

// Vitest configuration. The static page is built with vite.site.*.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    testTimeout: 120000,
  },
})
