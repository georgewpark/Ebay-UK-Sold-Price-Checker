/**
 * The scan window, as a fraction inset from each edge of the camera frame.
 * Viewfinder draws its reticle from these same numbers, so what the user lines
 * the barcode up against is exactly what we hand to the decoder.
 */
export const RETICLE = { x: 0.12, y: 0.22 } as const

/**
 * Width we downscale the cropped region to before decoding. A 1280x720 frame
 * cropped to the reticle is 972x404; at 640 wide an EAN-13 spanning 70% of the
 * box still lands 4.7 pixels per module, well clear of what ZXing needs, for
 * roughly a sixth of the pixels of the full frame.
 */
const SCAN_WIDTH = 640

/**
 * Builds a reusable cropper. The canvas is allocated once per scanning session
 * and resized only if the camera changes resolution mid-stream.
 *
 * A plain detached canvas rather than an OffscreenCanvas: we are on the main
 * thread either way, and a canvas element is the better-trodden path through
 * every BarcodeDetector implementation.
 */
export function createFrameGrabber() {
  let canvas: HTMLCanvasElement | null = null
  let context: CanvasRenderingContext2D | null = null

  return function grabFrame(video: HTMLVideoElement): HTMLCanvasElement | null {
    const frameWidth = video.videoWidth
    const frameHeight = video.videoHeight
    if (!frameWidth || !frameHeight) return null

    const cropX = Math.round(frameWidth * RETICLE.x)
    const cropY = Math.round(frameHeight * RETICLE.y)
    const cropWidth = frameWidth - cropX * 2
    const cropHeight = frameHeight - cropY * 2
    if (cropWidth < 1 || cropHeight < 1) return null

    // Never upscale: a low-resolution camera is better read at its own size.
    const scale = Math.min(1, SCAN_WIDTH / cropWidth)
    const width = Math.max(1, Math.round(cropWidth * scale))
    const height = Math.max(1, Math.round(cropHeight * scale))

    if (!canvas) {
      canvas = document.createElement('canvas')
      // ZXing reads the pixels straight back out, so keep them on the CPU side.
      context = canvas.getContext('2d', { willReadFrequently: true })
    }
    if (!context) return null
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width
      canvas.height = height
    }

    context.drawImage(video, cropX, cropY, cropWidth, cropHeight, 0, 0, width, height)
    return canvas
  }
}
