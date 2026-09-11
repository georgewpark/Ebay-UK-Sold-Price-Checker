import { getDetector } from './detector.ts'
import { closeFrame } from './frame.ts'
import type { Frame } from './frame.ts'

/**
 * The decode half of the scanner, moved off the main thread.
 *
 * ZXing scans a 640x404 buffer in tens of milliseconds. On the main thread that
 * lands in the middle of the scan-line animation and any scroll the user starts,
 * which is exactly the moment they are holding a phone steady over a barcode.
 */

export type DecodeRequest = { type: 'init' } | { type: 'decode'; id: number; frame: Frame }

export type DecodeResponse =
  | { type: 'ready'; native: boolean }
  | { type: 'error'; message: string }
  /** `failed` separates "the decoder threw" from "there was no barcode". */
  | { type: 'result'; id: number; value: string | null; failed: boolean }

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

  const { id, frame } = message

  void getDetector()
    .then((detector) => detector.detect(frame))
    .then(
      (hits) =>
        ctx.postMessage({
          type: 'result',
          id,
          value: hits[0]?.rawValue.trim() || null,
          failed: false,
        }),
      // A dropped frame is not worth surfacing on its own, but the scanner has
      // to be able to tell one from a barcode that simply is not there: a run
      // of them means the capture path is wrong, not that the shelf is empty.
      // Reply either way, or the scan loop waits on a promise that never settles.
      () => ctx.postMessage({ type: 'result', id, value: null, failed: true }),
    )
    // The frame was transferred here, so this worker owns it now.
    .finally(() => closeFrame(frame))
})
