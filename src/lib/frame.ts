/**
 * The scan window, as a fraction inset from each edge of the *visible* camera
 * frame. Viewfinder draws its reticle from these same numbers.
 */
export const RETICLE = { x: 0.12, y: 0.22 } as const

/**
 * Width we downscale the cropped region to before decoding. A 1280x720 frame
 * cropped to the reticle is 730x403; at 640 wide an EAN-13 spanning 70% of the
 * box still lands 4.7 pixels per module, well clear of what ZXing needs, for
 * roughly a fifth of the pixels of the full frame.
 */
const SCAN_WIDTH = 640

export interface Size {
  width: number
  height: number
}

export interface Rect extends Size {
  x: number
  y: number
}

/**
 * The part of the source frame an `object-fit: cover` element actually shows.
 *
 * The camera hands us 16:9 and the viewfinder is 4:3, so a quarter of the frame
 * width never reaches the screen. Cropping the reticle out of the raw frame,
 * as we used to, meant the decoder read a band wider than the box the user was
 * lining the barcode up against. Measure the visible region first and the drawn
 * reticle and the decoded region become the same rectangle, whatever aspect
 * ratio the camera decides to give us.
 */
export function visibleRegion(frame: Size, box: Size): Rect {
  const full = { x: 0, y: 0, width: frame.width, height: frame.height }
  if (box.width <= 0 || box.height <= 0) return full

  const frameAspect = frame.width / frame.height
  const boxAspect = box.width / box.height

  if (frameAspect > boxAspect) {
    // Source is wider than the element, so the sides are cropped away.
    const width = frame.height * boxAspect
    return { x: (frame.width - width) / 2, y: 0, width, height: frame.height }
  }

  // Source is taller, so the top and bottom go instead.
  const height = frame.width / boxAspect
  return { x: 0, y: (frame.height - height) / 2, width: frame.width, height }
}

/** The reticle, in source-frame pixels. Null when the frame is not measurable yet. */
export function scanRegion(frame: Size, box: Size): Rect | null {
  if (!frame.width || !frame.height) return null

  const visible = visibleRegion(frame, box)
  const rect = {
    x: Math.round(visible.x + visible.width * RETICLE.x),
    y: Math.round(visible.y + visible.height * RETICLE.y),
    width: Math.round(visible.width * (1 - RETICLE.x * 2)),
    height: Math.round(visible.height * (1 - RETICLE.y * 2)),
  }
  return rect.width >= 1 && rect.height >= 1 ? rect : null
}

/** The size we decode at: the region, capped at SCAN_WIDTH, never upscaled. */
export function scanSize(region: Size): Size {
  const scale = Math.min(1, SCAN_WIDTH / region.width)
  return {
    width: Math.max(1, Math.round(region.width * scale)),
    height: Math.max(1, Math.round(region.height * scale)),
  }
}

export interface FrameGrabber {
  grab(video: HTMLVideoElement): ImageData | null
  release(): void
}

/**
 * Builds a reusable cropper. The canvas is allocated once per scanning session
 * and resized only if the camera changes resolution mid-stream.
 *
 * We hand back ImageData rather than the canvas itself because the decoder now
 * runs in a worker. ImageData is what ZXing consumes natively, so there is no
 * conversion at the far end, and its buffer transfers without a copy.
 */
export function createFrameGrabber(): FrameGrabber {
  let canvas: HTMLCanvasElement | null = null
  let context: CanvasRenderingContext2D | null = null

  return {
    grab(video) {
      const frame = { width: video.videoWidth, height: video.videoHeight }
      const box = { width: video.clientWidth, height: video.clientHeight }
      const region = scanRegion(frame, box)
      if (!region) return null

      const size = scanSize(region)

      if (!canvas) {
        canvas = document.createElement('canvas')
        // We read every pixel straight back out, so keep them on the CPU side.
        context = canvas.getContext('2d', { willReadFrequently: true })
      }
      if (!context) return null
      if (canvas.width !== size.width || canvas.height !== size.height) {
        canvas.width = size.width
        canvas.height = size.height
      }

      context.drawImage(
        video,
        region.x,
        region.y,
        region.width,
        region.height,
        0,
        0,
        size.width,
        size.height,
      )
      return context.getImageData(0, 0, size.width, size.height)
    },

    release() {
      // Freeing a 640x404 willReadFrequently surface is worth the two lines.
      if (canvas) {
        canvas.width = 0
        canvas.height = 0
      }
      canvas = null
      context = null
    },
  }
}
