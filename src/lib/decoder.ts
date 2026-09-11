import { getDetector, WASM_URL } from './detector.ts'
import type { DecodeResponse } from './decoder.worker.ts'

export interface Decoder {
  /** Resolves to the barcode, or null. Never rejects: a bad frame is just a miss. */
  decode(frame: ImageData): Promise<string | null>
  /** False on the WASM path, which is worth prefetching and worth caching. */
  native: boolean
}

/** A worker that never answers would leave the Start button disabled forever. */
const INIT_TIMEOUT = 15_000

let pending: Promise<Decoder> | null = null

export function openDecoder(): Promise<Decoder> {
  pending ??= openWorker().catch(() => openInline())
  return pending
}

/**
 * Warm the decoder while the user is still reading the page, then pull the WASM
 * binary down behind it on the browsers that will need it.
 *
 * The binary is 448 kB over the wire and only Safari and Firefox ever ask for
 * it, so we fetch it at low priority, only once we know we are on that path,
 * and never when the connection has told us it would rather we did not.
 */
export function warmDecoder(): void {
  void openDecoder()
    .then((decoder) => {
      if (decoder.native || !prefetchAllowed()) return
      void fetch(WASM_URL, { priority: 'low' }).catch(() => {})
    })
    .catch(() => {})
}

interface NetworkInformation {
  saveData?: boolean
  effectiveType?: string
}

function prefetchAllowed(): boolean {
  const connection = (navigator as Navigator & { connection?: NetworkInformation }).connection
  if (!connection) return true
  if (connection.saveData) return false
  // Unknown means an older browser that never told us; assume it is fine.
  return connection.effectiveType === undefined || connection.effectiveType === '4g'
}

function openWorker(): Promise<Decoder> {
  return new Promise<Decoder>((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./decoder.worker.ts', import.meta.url), { type: 'module' })
    } catch (error) {
      reject(error instanceof Error ? error : new Error('Worker unavailable'))
      return
    }

    const waiting = new Map<number, (value: string | null) => void>()
    let nextId = 1
    let settled = false

    const timer = setTimeout(() => {
      if (settled) return
      settled = true
      worker.terminate()
      reject(new Error('Decoder worker did not start'))
    }, INIT_TIMEOUT)

    const decode = (frame: ImageData) =>
      new Promise<string | null>((done) => {
        const id = nextId++
        waiting.set(id, done)
        // The buffer transfers rather than copies, so a frame costs one memcpy
        // out of the canvas and nothing more.
        worker.postMessage({ type: 'decode', id, frame }, [frame.data.buffer])
      })

    worker.onmessage = (event: MessageEvent<DecodeResponse>) => {
      const message = event.data
      if (message.type === 'result') {
        waiting.get(message.id)?.(message.value)
        waiting.delete(message.id)
        return
      }
      if (settled) return
      settled = true
      clearTimeout(timer)
      if (message.type === 'ready') {
        resolve({ decode, native: message.native })
      } else {
        worker.terminate()
        reject(new Error(message.message))
      }
    }

    worker.onerror = () => {
      // Release anything mid-flight, or the scan loop waits on a dead worker.
      waiting.forEach((done) => done(null))
      waiting.clear()
      if (settled) return
      settled = true
      clearTimeout(timer)
      worker.terminate()
      reject(new Error('Decoder worker failed'))
    }

    worker.postMessage({ type: 'init' })
  })
}

/** Same decoder, on the main thread, for anywhere module workers do not run. */
async function openInline(): Promise<Decoder> {
  const detector = await getDetector()
  return {
    native: detector.native,
    decode: (frame) =>
      detector.detect(frame).then(
        (hits) => hits[0]?.rawValue.trim() || null,
        () => null,
      ),
  }
}
