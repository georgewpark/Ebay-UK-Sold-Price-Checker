export const FORMATS = [
  'ean_13',
  'ean_8',
  'upc_a',
  'upc_e',
  'code_128',
  'code_39',
  'itf',
] as const

export interface Detector {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue: string }>>
}

interface NativeDetectorCtor {
  new (options: { formats: string[] }): Detector
  getSupportedFormats(): Promise<string[]>
}

let cached: Detector | null = null

/**
 * Prefer the browser's own BarcodeDetector. Where it is missing (Safari, Firefox)
 * fall back to the WASM ponyfill, which only downloads when it is actually needed.
 */
export async function getDetector(): Promise<Detector> {
  if (cached) return cached

  const native = (window as unknown as { BarcodeDetector?: NativeDetectorCtor }).BarcodeDetector
  if (native) {
    try {
      const supported = await native.getSupportedFormats()
      if (supported.includes('ean_13')) {
        cached = new native({ formats: FORMATS.filter((f) => supported.includes(f)) })
        return cached
      }
    } catch {
      /* fall through to the ponyfill */
    }
  }

  const { BarcodeDetector } = await import('barcode-detector/pure')
  cached = new BarcodeDetector({ formats: [...FORMATS] }) as unknown as Detector
  return cached
}
