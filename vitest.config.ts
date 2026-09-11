import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

/**
 * Kept apart from vite.config.ts on purpose. That file runs the duplicate-wasm
 * guard and builds a service worker, neither of which a unit test wants, and
 * both of which would run on every watch-mode reload.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/**/*.test.{ts,tsx}', 'src/test/**', 'src/main.tsx', 'src/vite-env.d.ts'],
    },
  },
})
