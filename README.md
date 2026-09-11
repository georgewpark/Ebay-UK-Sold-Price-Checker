# eBay UK - Sold Price Checker

Scan a barcode, get the product name, jump straight to what the product actually sold for on eBay UK.

Point your phone at a barcode. The app reads it, looks up a product name, and opens eBay UK's completed listings in a new tab. Useful in a charity shop, a car boot sale, or anywhere you need to know what something is worth before you buy it.

Built with React 19 and TypeScript, bundled by Vite 8, styled with Tailwind CSS 4.

## What it does

- Reads EAN-13, EAN-8, UPC-A, UPC-E, Code 128, Code 39 and ITF barcodes from the camera.
- Turns the barcode into a product name using two free databases, and lets you edit the result before searching.
- Opens sold prices or live listings on eBay UK. The app is UK only by design: every search goes to `ebay.co.uk`.
- Keeps your last 40 lookups on the device, so you can re-run a search without scanning again.
- Installs to the Android home screen from the web manifest, and adapts to light or dark mode.
- Toggles the torch where the camera supports it.

## Quick start

```bash
npm install
npm run dev
```

Then open http://localhost:5173.

| Script | What it does |
| --- | --- |
| `npm run dev` | Dev server with hot reload |
| `npm run dev -- --host` | Also serves on your LAN, for phone testing |
| `npm run build` | Type-checks, then bundles to `dist/` |
| `npm run preview` | Serves the production build locally |
| `npm run typecheck` | Type-checks without building |

## Testing on a phone

`getUserMedia` only works in a secure context. `localhost` counts, so the desktop dev server is fine. Your LAN address is not, so a phone on `http://192.168.x.x:5173` will see a "Needs HTTPS" message instead of a camera feed.

Tunnel the dev server to get HTTPS:

```bash
npm run dev -- --host
cloudflared tunnel --url http://localhost:5173
```

Then open the `https://` address the tunnel prints. `ngrok http 5173` does the same job.

## Deploying

`npm run build` produces a static `dist/` folder. Any static host will serve it: Azure Static Web Apps, Netlify, Vercel, GitHub Pages, or a plain container.

Serving from a subdirectory needs a base path in `vite.config.ts`, and the same path on the manifest entries in `public/manifest.webmanifest`:

```ts
export default defineConfig({
  base: '/ebay-sold-price-checker/',
  // ...
})
```

Serve it over HTTPS. Without it, the camera never starts.

## How it works

1. **Detect.** The app uses the browser's own `BarcodeDetector` where it exists. Where it does not, it dynamically imports the `barcode-detector` WASM ponyfill. Vite code-splits that import, so the extra 43 kB only downloads on browsers that need it. The scan loop polls the video element every 140 ms and stops on the first hit.
2. **Name.** The barcode goes to Open Food Facts, then to UPCitemdb if that misses. Neither needs an API key. If both miss, the search falls back to the raw barcode number.
3. **Search.** Sold prices open `https://www.ebay.co.uk/sch/i.html` with `LH_Sold=1` and `LH_Complete=1`. eBay requires a signed-in session to show sold listings, so sign in once on the device and every lookup after that goes straight through.

## Browser support

| Browser | Scanner |
| --- | --- |
| Chrome and Edge, Android and desktop | Native `BarcodeDetector` |
| Safari, iOS and macOS | WASM ponyfill |
| Firefox | WASM ponyfill |

Typing a product name by hand works everywhere, camera or not.

## Privacy

Recent scans sit in `localStorage` on the device. There is no account, no analytics and no backend. The only outbound calls are the two barcode lookups, which send the barcode number and nothing else. Clearing recent scans clears the stored copy.

## Customising

**Point it at another eBay site.** Change `DOMAIN` in [src/lib/ebay.ts](src/lib/ebay.ts). Nothing else in the app assumes a site.

**Change the palette or fonts.** Both live in the `@theme` block in [src/index.css](src/index.css). Dark mode overrides the same custom properties under `prefers-color-scheme`, so a colour only needs defining twice and every utility follows automatically. Fonts load from Google Fonts in [index.html](index.html).

**Change how many scans are kept.** `LIMIT` in [src/hooks/useHistory.ts](src/hooks/useHistory.ts).

**Change which barcode formats are read.** `FORMATS` in [src/lib/detector.ts](src/lib/detector.ts).

## Project structure

```
index.html              Fonts, manifest, theme colour, root element
vite.config.ts          React and Tailwind plugins
public/                 Manifest and icons
src/
  App.tsx               State and wiring
  components/           Masthead, Viewfinder, SearchPanel, History
  hooks/
    useScanner.ts       Camera, torch, detect loop
    useHistory.ts       Recent scans, persisted
  lib/
    detector.ts         Native detector, with WASM fallback
    lookup.ts           Barcode to product name
    ebay.ts             eBay UK search URL building
    storage.ts          localStorage that never throws
    types.ts            Scan entries
  index.css             Tailwind theme
```

## Known limits

- Sold prices open on eBay rather than being parsed into the app. eBay has no public API for completed listings, and scraping it from the browser is blocked by CORS.
- Open Food Facts covers groceries well and other categories poorly. UPCitemdb's free tier is rate limited. Expect to type a name yourself for anything unusual.
- Barcodes on curved or shiny packaging need good light. Use the torch.
- There is no service worker yet, so the installed app still needs a connection to load.
