import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'
import type { Frame } from './frame.ts'

/** Exported so the app can prefetch the binary on the browsers that need it. */
export const WASM_URL = wasmUrl

/** Hoisted so the reference stays stable: prepareZXingModule caches by shallow
    equality, and a fresh object each call would re-instantiate the module. */
const WASM_OVERRIDES = { locateFile: () => wasmUrl }

export const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf'] as const

export interface Detector {
  /** An ImageBitmap on the fast capture path, ImageData on the fallback. */
  detect(source: Frame): Promise<Array<{ rawValue: string }>>
  /** False when we fell back to the WASM ponyfill, which the app prefetches. */
  native: boolean
}

interface NativeDetectorCtor {
  new (options: { formats: string[] }): { detect: Detector['detect'] }
  getSupportedFormats(): Promise<string[]>
}

/** Cache the promise, not the value: two warm calls must not build two decoders. */
let pending: Promise<Detector> | null = null

export function getDetector(): Promise<Detector> {
  pending ??= build()
  return pending
}

/**
 * Prefer the platform's own BarcodeDetector. Where it is missing (Safari, Firefox)
 * fall back to the WASM ponyfill, which only downloads when it is actually needed.
 *
 * Reads `globalThis` rather than `window` so this runs unchanged inside the
 * decoder worker, where Chrome also exposes a native detector.
 */
async function build(): Promise<Detector> {
  const native = (globalThis as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
  if (native) {
    try {
      const supported = await native.getSupportedFormats()
      if (supported.includes('ean_13')) {
        const instance = new native({ formats: FORMATS.filter((f) => supported.includes(f)) })
        return { detect: (source) => instance.detect(source), native: true }
      }
    } catch {
      /* fall through to the ponyfill */
    }
  }

  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/pure')
  // Serve the ~1 MB decoder from our own origin. Left alone, zxing-wasm fetches it
  // from jsDelivr at scan time, which costs a fresh DNS lookup and TLS handshake on
  // the one path that is already the slow one.
  prepareZXingModule({ overrides: WASM_OVERRIDES })
  const instance = new BarcodeDetector({ formats: [...FORMATS] })
  return { detect: (source) => instance.detect(source), native: false }
}
