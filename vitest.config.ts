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
    /**
     * Building a fresh jsdom per file was 71% of the run. vmThreads reuses one
     * per worker while still giving each file its own module registry, which
     * this suite needs: lookup.ts caches names and decoder.ts caches the worker
     * in module scope, so sharing those across files would make the order tests
     * run in part of whether they pass.
     */
    pool: 'vmThreads',
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
