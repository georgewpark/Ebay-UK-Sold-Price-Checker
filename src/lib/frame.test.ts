import { describe, expect, it } from 'vitest'
import { RETICLE, scanRegion, scanSize, visibleRegion } from './frame.ts'

const HD = { width: 1280, height: 720 }
/** The viewfinder is aspect-4/3, at a typical phone width. */
const VIEWFINDER = { width: 390, height: 292.5 }

describe('visibleRegion', () => {
  it('crops the sides when the camera is wider than the element', () => {
    const visible = visibleRegion(HD, VIEWFINDER)
    // 4:3 of a 720-tall frame is 960 wide, so 160px goes from each side.
    expect(visible).toEqual({ x: 160, y: 0, width: 960, height: 720 })
  })

  it('crops the top and bottom when the camera is taller than the element', () => {
    const visible = visibleRegion({ width: 640, height: 480 }, { width: 400, height: 200 })
    expect(visible).toEqual({ x: 0, y: 80, width: 640, height: 320 })
  })

  it('crops nothing when the aspect ratios already agree', () => {
    const visible = visibleRegion({ width: 640, height: 480 }, { width: 400, height: 300 })
    expect(visible).toEqual({ x: 0, y: 0, width: 640, height: 480 })
  })

  it('falls back to the whole frame before the element has been laid out', () => {
    const visible = visibleRegion(HD, { width: 0, height: 0 })
    expect(visible).toEqual({ x: 0, y: 0, width: 1280, height: 720 })
  })
})

describe('scanRegion', () => {
  /**
   * The bug this guards. The reticle is drawn as a percentage inset of the
   * element, so the decoded region has to be that same inset of the part of the
   * frame the element shows, not of the raw frame. Reading the raw frame meant
   * decoding a band 120px wider on each side than the box on screen.
   */
  it('matches the reticle the viewfinder draws, not the raw frame', () => {
    const region = scanRegion(HD, VIEWFINDER)!
    const visible = visibleRegion(HD, VIEWFINDER)

    expect(region.x).toBe(Math.round(visible.x + visible.width * RETICLE.x))
    expect(region.width).toBe(Math.round(visible.width * (1 - RETICLE.x * 2)))

    // Concretely: 12% in from each side of the visible 960px, not of 1280.
    expect(region).toEqual({ x: 275, y: 158, width: 730, height: 403 })
  })

  it('stays inside the frame', () => {
    const region = scanRegion(HD, VIEWFINDER)!
    expect(region.x).toBeGreaterThanOrEqual(0)
    expect(region.y).toBeGreaterThanOrEqual(0)
    expect(region.x + region.width).toBeLessThanOrEqual(HD.width)
    expect(region.y + region.height).toBeLessThanOrEqual(HD.height)
  })

  it('returns null before the camera reports a size', () => {
    expect(scanRegion({ width: 0, height: 0 }, VIEWFINDER)).toBeNull()
  })
})

describe('scanSize', () => {
  it('downscales a large region to the decode width', () => {
    expect(scanSize({ width: 730, height: 403 })).toEqual({ width: 640, height: 353 })
  })

  it('never upscales a low-resolution camera', () => {
    const small = { width: 320, height: 180 }
    expect(scanSize(small)).toEqual(small)
  })
})
