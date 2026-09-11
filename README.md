# eBay UK - Sold Price Checker

Scan a barcode, get the product name, jump straight to what the product actually sold for on eBay UK.

Point your phone at a barcode. The app reads it, looks up a product name, and opens eBay UK's completed listings in a new tab. Useful in a charity shop, a car boot sale, or anywhere you need to know what something is worth before you buy it.

Built with React 19 and TypeScript, bundled by Vite 8, styled with Tailwind CSS 4.

## What it does

- Reads EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 and ITF barcodes from the camera.
- Decodes off the main thread, so the viewfinder stays smooth while ZXing works.
- Turns the barcode into a product name using two free databases, and lets you edit the result before searching.
- Opens sold prices or live listings on eBay UK. The app is UK only by design: every search goes to `ebay.co.uk`.
- Keeps your last 40 lookups on the device, so you can re-run a search without scanning again.
- Installs to the home screen on Android and iOS, and adapts to light or dark mode.
- Toggles the torch, and will keep scanning item after item if you ask it to.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script                  | What it does                                   |
| ----------------------- | ---------------------------------------------- |
| `npm run dev`           | Dev server with hot reload                     |
| `npm run dev -- --host` | Also serves on your LAN, for phone testing     |
| `npm run build`         | Type-checks, then bundles to `dist/`           |
| `npm run preview`       | Serves the production build locally            |
| `npm run typecheck`     | Type-checks without building                   |
| `npm run lint`          | ESLint, including React hooks and jsx-a11y     |
| `npm run format`        | Prettier over the repo                         |
| `npm test`              | Unit and component tests (Vitest)              |
| `npm run test:e2e`      | Real browser, real decoder, fake camera        |
| `npm run coverage`      | Unit test coverage report                      |
| `npm run analyse`       | Build and write `stats.html`, a bundle treemap |
| `npm run icons`         | Regenerate the PNG icons from the SVG sources  |

## Connectivity

Prices live on eBay, so the app cannot show you a price without a connection. It is honest about that rather than opening a tab that cannot load:

- **Online.** Everything works.
- **Offline.** A banner says so. Scanning still works, recent scans still work, and a product you have scanned before still resolves to its name from the cache. The two search buttons stay in the tab order but refuse to fire, and explain why.
- **Back online.** The banner clears itself.

The service worker precaches the app shell, so a repeat visit starts instantly and the installed app opens without a round trip. It deliberately does **not** precache the 1 MB WASM decoder: only Safari and Firefox ever need it, so it is cached the first time it is actually fetched.

## Testing on a phone

`getUserMedia` only works in a secure context. `localhost` counts, so the desktop dev server is fine. Your LAN address is not, so a phone on `http://192.168.x.x:5173` will see a "Needs HTTPS" message instead of a camera feed.

Tunnel the dev server to get HTTPS:

```bash
npm run dev -- --host
cloudflared tunnel --url http://localhost:5173
```

Then open the `https://` address the tunnel prints. `ngrok http 5173` does the same job.

## Tests

Three layers, and each one exists because the layer below it cannot reach that far.

- **Unit and component tests** (`npm test`) cover the pure logic and the interface: reticle geometry, URL building, the lookup fallbacks and their failure modes, history persistence, and how each panel behaves online and offline. jsdom has no camera and no WASM, so the decoder is stubbed here.
- **End-to-end tests** (`npm run test:e2e`) prove the scanner actually scans. `scripts/make-barcode-video.mjs` encodes a real EAN-13 and writes it as an uncompressed Y4M video; Chromium takes that file as its webcam via `--use-file-for-fake-video-capture`, and the real decoder reads it. Nothing is mocked but the two lookup APIs and eBay itself.
- **Manual**, for the WASM path. Chromium has a native `BarcodeDetector`, and no browser without one lets a test script supply a video file as the camera, so the ponyfill route is only exercised for real in Safari and Firefox. Check it there before shipping a decoder change.

## Deploying

`npm run build` produces a static `dist/` folder. Any static host will serve it: Azure Static Web Apps, Netlify, Vercel, GitHub Pages, or a plain container.

**Serve it over HTTPS.** Without it, the camera never starts.

### Headers

`public/_headers` ships a content security policy, a camera permissions policy and cache rules, in the format Netlify and Cloudflare Pages read. On any other host, express the same rules its own way. The two that are easy to get wrong:

- The decoder needs `'wasm-unsafe-eval'` in `script-src`. It does not need `'unsafe-eval'`: nothing in the bundle calls `eval` or `new Function`.
- `index.html`, `sw.js` and `registerSW.js` must not be cached. They are how an update reaches anyone. Everything under `/assets/` is content-hashed and can be `immutable`.

### Subdirectories

Serving from a subdirectory needs a base path in `vite.config.ts`, and the same path on the manifest entries in `public/manifest.webmanifest`:

```ts
export default defineConfig({
  base: '/ebay-sold-price-checker/',
  // ...
})
```

## How it works

1. **Detect.** The app uses the browser's own `BarcodeDetector` where it exists. Where it does not, it dynamically imports the `barcode-detector` WASM ponyfill, which only downloads on the browsers that need it. Either way the decoder runs in a worker: the main thread only crops a frame and posts it across, so the scan-line animation and any scrolling stay smooth. The loop waits on `requestVideoFrameCallback`, so it never decodes the same frame twice.
2. **Crop.** Only the reticle is decoded, downscaled to 640px wide. The crop is measured against the part of the frame the viewfinder actually shows, not the raw camera frame, so the box you line the barcode up against is exactly the box being read.
3. **Name.** The barcode goes to Open Food Facts, then to UPCitemdb if that misses. Neither needs an API key. A miss, a rate limit and an unreachable database say different things, because they mean different things. Results are cached in memory and by the service worker.
4. **Search.** Sold prices open `https://www.ebay.co.uk/sch/i.html` with `LH_Sold=1` and `LH_Complete=1`. eBay requires a signed-in session to show sold listings, so sign in once on the device and every lookup after that goes straight through.

## Accessibility

The target is WCAG 2.2 AA, and it is treated as a requirement rather than a nice-to-have.

- Every colour pair in `src/index.css` is chosen against a measured contrast ratio, including the boundary colours that 1.4.11 covers, not just text.
- Scanner state is announced: routine updates politely, errors assertively.
- The torch and keep-scanning controls carry a fixed label plus `aria-pressed`, so a screen reader never has to guess which half of "Torch on, pressed" is the state. Their on state also carries a mark, so colour is not doing the work alone.
- The search buttons say they open a new tab, and when they will not fire they stay focusable and explain why via `aria-describedby`.
- `eslint-plugin-jsx-a11y` runs on every commit, which catches the static mistakes. It does not catch the rest, so test with a screen reader before shipping interface changes.

## Browser support

| Browser                              | Scanner                  |
| ------------------------------------ | ------------------------ |
| Chrome and Edge, Android and desktop | Native `BarcodeDetector` |
| Safari, iOS and macOS                | WASM ponyfill            |
| Firefox                              | WASM ponyfill            |

Typing a product name by hand works everywhere, camera or not.

## Privacy

Recent scans sit in `localStorage` on the device. There is no account, no analytics and no backend. The only outbound calls are the two barcode lookups, which send the barcode number and nothing else. Clearing recent scans clears the stored copy.

## Customising

**Point it at another eBay site.** Change `DOMAIN` in [src/lib/ebay.ts](src/lib/ebay.ts). Nothing else in the app assumes a site.

**Change the palette or fonts.** Both live in the `@theme` block in [src/index.css](src/index.css). Dark mode overrides the same custom properties under `prefers-color-scheme`, so a colour only needs defining twice and every utility follows automatically. Fonts are self-hosted from `@fontsource-variable`, subset by `unicode-range`, and the body face is preloaded by a small plugin in [vite.config.ts](vite.config.ts).

**Change how many scans are kept.** `LIMIT` in [src/hooks/useHistory.ts](src/hooks/useHistory.ts).

**Change which barcode formats are read.** `FORMATS` in [src/lib/detector.ts](src/lib/detector.ts).

**Change the scan window.** `RETICLE` in [src/lib/frame.ts](src/lib/frame.ts). The viewfinder draws its box from the same numbers.

**Change the bundle budget.** `BUDGETS` in [scripts/check-size.mjs](scripts/check-size.mjs). Raise it on purpose, not because CI went red.

## Project structure

```
index.html              Meta tags, icons, manifest, root element
vite.config.ts          React, Tailwind, PWA, font preload, bundle analysis
vitest.config.ts        Unit and component tests
playwright.config.ts    End-to-end tests, with a file standing in for the camera
eslint.config.js        Type-aware lint, React hooks, jsx-a11y
public/                 Manifest, icons, _headers
scripts/
  generate-icons.mjs    PNG icons from the SVG sources
  make-barcode-video.mjs  The fake camera feed for the e2e tests
  check-size.mjs        Bundle budget
e2e/                    Playwright specs
src/
  App.tsx               State and wiring
  components/           Masthead, OfflineBanner, Viewfinder, SearchPanel, History
  hooks/
    useScanner.ts       Camera, torch, continuous mode, detect loop
    useHistory.ts       Recent scans, persisted and synced across tabs
    useOnline.ts        Connectivity
  lib/
    decoder.ts          Worker-backed decoder, with a main-thread fallback
    decoder.worker.ts   Where the decoding actually happens
    detector.ts         Native detector, with WASM fallback
    frame.ts            Reticle geometry and frame cropping
    lookup.ts           Barcode to product name
    status.ts           Caption and screen reader copy
    ebay.ts             eBay UK search URL building
    storage.ts          localStorage that never throws
    time.ts             Relative dates for recent scans
  index.css             Tailwind theme
```

## Known limits

- Sold prices open on eBay rather than being parsed into the app. eBay has no public API for completed listings, and scraping it from the browser is blocked by CORS. This also means the app is useless without a connection, however well it caches.
- Open Food Facts covers groceries well and other categories poorly. UPCitemdb's free tier is rate limited. Expect to type a name yourself for anything unusual.
- Barcodes on curved or shiny packaging need good light. Use the torch.
- The WASM decoder path has no automated coverage in a real browser. See **Tests**.
