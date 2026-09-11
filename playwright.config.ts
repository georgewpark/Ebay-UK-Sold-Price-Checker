import { defineConfig, devices } from '@playwright/test'
import { fileURLToPath } from 'node:url'

const fixture = fileURLToPath(new URL('./e2e/fixtures/barcode.y4m', import.meta.url))

/**
 * The unit tests stub the decoder, because jsdom has no camera and no WASM.
 * This suite does the opposite: a real Chromium, reading a real EAN-13 through
 * the real ZXing build, from a video file standing in for the webcam. It is the
 * only place the scanner is proved to work end to end.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? 'github' : 'list',

  use: {
    baseURL: 'http://localhost:4318',
    trace: 'on-first-retry',
    // The app refuses to start the camera outside a secure context, and
    // localhost counts, so no certificate juggling is needed.
    permissions: ['camera'],
    /**
     * Blocked by default. The service worker runtime-caches both lookup APIs,
     * so with it running the stubbed routes never fire and the tests quietly
     * hit the real internet. The installability suite opts back in.
     */
    serviceWorkers: 'block',
  },

  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        launchOptions: {
          args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            `--use-file-for-fake-video-capture=${fixture}`,
          ],
        },
      },
    },
  ],

  // Preview rather than dev: the service worker, the hashed assets and the
  // ES worker all only exist in a production build.
  webServer: {
    command: 'npm run build && npx vite preview --port 4318',
    url: 'http://localhost:4318',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
})
