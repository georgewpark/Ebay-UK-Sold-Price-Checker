import { getDetector } from './detector.ts'

/**
 * The decode half of the scanner, moved off the main thread.
 *
 * ZXing scans a 640x404 buffer in tens of milliseconds. On the main thread that
 * lands in the middle of the scan-line animation and any scroll the user starts,
 * which is exactly the moment they are holding a phone steady over a barcode.
 */

export type DecodeRequest = { type: 'init' } | { type: 'decode'; id: number; frame: ImageData }

export type DecodeResponse =
  | { type: 'ready'; native: boolean }
  | { type: 'error'; message: string }
  | { type: 'result'; id: number; value: string | null }

/** Declaring the shape we use avoids pulling the WebWorker lib in alongside DOM. */
interface WorkerScope {
  postMessage(message: DecodeResponse): void
  addEventListener(type: 'message', listener: (event: MessageEvent<DecodeRequest>) => void): void
}

const ctx = self as unknown as WorkerScope

ctx.addEventListener('message', (event) => {
  const message = event.data

  if (message.type === 'init') {
    void getDetector().then(
      (detector) => ctx.postMessage({ type: 'ready', native: detector.native }),
      (error: unknown) => ctx.postMessage({ type: 'error', message: String(error) }),
    )
    return
  }

  void getDetector()
    .then((detector) => detector.detect(message.frame))
    .then(
      (hits) =>
        ctx.postMessage({
          type: 'result',
          id: message.id,
          value: hits[0]?.rawValue.trim() || null,
        }),
      // A dropped frame is not worth surfacing. Reply anyway, or the scan loop
      // waits on a promise that will never settle.
      () => ctx.postMessage({ type: 'result', id: message.id, value: null }),
    )
})
