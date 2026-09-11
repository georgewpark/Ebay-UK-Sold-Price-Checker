import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { visualizer } from 'rollup-plugin-visualizer'

const require = createRequire(import.meta.url)

/**
 * We self-host zxing's wasm binary, so the copy we ship has to be the exact copy
 * barcode-detector's glue code expects. If a future release of barcode-detector
 * pins a different version, npm installs a second copy and the mismatch surfaces
 * only on Safari and Firefox, at runtime, as a cryptic decoder failure. Compare
 * the resolved paths instead: one file means one version, by definition.
 */
function assertOneDecoderCopy(): void {
  const subpath = 'zxing-wasm/reader/zxing_reader.wasm'
  const ours = require.resolve(subpath)
  const theirs = createRequire(require.resolve('barcode-detector/pure')).resolve(subpath)
  if (ours !== theirs) {
    throw new Error(
      `Two copies of zxing-wasm are installed, so the self-hosted binary would not match the decoder.\n` +
        `  app:              ${ours}\n` +
        `  barcode-detector: ${theirs}\n` +
        `Align the zxing-wasm version in package.json with the one barcode-detector depends on.`,
    )
  }
}

assertOneDecoderCopy()

/**
 * The body font is declared inside the CSS bundle, so the browser cannot see it
 * until the stylesheet has downloaded and parsed. That is one round trip of
 * invisible text on the slowest connection. The filename is hashed, so read it
 * back out of the bundle and inject the preload at build time.
 *
 * Only the latin sans face: latin-ext and the mono face are both conditional,
 * and preloading a font nothing on screen needs is worse than not preloading.
 */
function preloadBodyFont(): Plugin {
  let base = '/'
  return {
    name: 'preload-body-font',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(_html, ctx) {
        const file = Object.keys(ctx.bundle ?? {}).find((name) =>
          /geist-latin-wght-normal.*\.woff2$/.test(name),
        )
        if (!file) return
        return [
          {
            tag: 'link',
            attrs: {
              rel: 'preload',
              as: 'font',
              type: 'font/woff2',
              href: `${base}${file}`,
              crossorigin: '',
            },
            injectTo: 'head-prepend',
          },
        ]
      },
    },
  }
}

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    tailwindcss(),
    preloadBodyFont(),
    VitePWA({
      registerType: 'autoUpdate',
      // The manifest is hand-written and served from public/, so the plugin
      // should cache it rather than generate a second one.
      manifest: false,
      includeAssets: [],
      workbox: {
        globPatterns: ['**/*.{js,css,html,woff2,svg,png,webmanifest}'],
        /**
         * Deliberately not the 1 MB decoder. Only Safari and Firefox ever ask
         * for it, so precaching would charge every Chrome user for a file they
         * will never open. The runtime rule below catches it on first use.
         */
        globIgnores: ['**/*.wasm'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.endsWith('.wasm'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'decoder-wasm',
              // Content-hashed, so a hit is always the right binary.
              expiration: { maxEntries: 4, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /**
             * Product names do not change, and a scan you have made before
             * should still resolve in a shop with no signal. Revalidate in the
             * background so a correction upstream still reaches us eventually.
             */
            urlPattern: ({ url }) =>
              url.hostname === 'world.openfoodfacts.org' || url.hostname === 'api.upcitemdb.com',
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'barcode-names',
              expiration: { maxEntries: 300, maxAgeSeconds: 60 * 60 * 24 * 90 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
      },
      devOptions: {
        // Off by default: a service worker caching a dev server is a good way
        // to spend an afternoon debugging a stale bundle.
        enabled: false,
      },
    }),
    // `npm run analyse`. A mode rather than an env var, because an inline
    // VAR=1 prefix in an npm script does not survive cmd.exe.
    mode === 'analyse'
      ? visualizer({ filename: 'stats.html', gzipSize: true, brotliSize: true })
      : null,
  ],
  worker: {
    /**
     * Vite defaults workers to iife, which cannot code-split, so the dynamic
     * import of the ponyfill was being inlined and every Chrome user paid 43 kB
     * for a decoder their browser will never run. An ES worker keeps it lazy.
     */
    format: 'es',
  },
  build: {
    // There is no analytics and no backend, so a user-reported error is all the
    // signal we get. Maps make one readable.
    sourcemap: true,
  },
  server: {
    // Camera access needs a secure context. localhost counts, but to test on a
    // phone run `npm run dev -- --host` and tunnel it over HTTPS.
    host: true,
  },
}))
