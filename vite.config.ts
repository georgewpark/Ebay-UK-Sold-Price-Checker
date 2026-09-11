import { createRequire } from 'node:module'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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

export default defineConfig({
  plugins: [react(), tailwindcss(), preloadBodyFont()],
  worker: {
    /**
     * Vite defaults workers to iife, which cannot code-split, so the dynamic
     * import of the ponyfill was being inlined and every Chrome user paid 43 kB
     * for a decoder their browser will never run. An ES worker keeps it lazy.
     */
    format: 'es',
  },
  server: {
    // Camera access needs a secure context. localhost counts, but to test on a
    // phone run `npm run dev -- --host` and tunnel it over HTTPS.
    host: true,
  },
})
