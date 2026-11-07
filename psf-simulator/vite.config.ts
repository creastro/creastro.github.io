import { defineConfig } from 'vitest/config'

// Cấu hình cho Vitest. Trang web tĩnh được build bằng vite.site.main.config.ts và vite.site.worker.config.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
