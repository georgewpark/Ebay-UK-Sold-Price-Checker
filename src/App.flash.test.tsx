import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FLASH_GAP_MS } from './components/Viewfinder.tsx'

/**
 * Its own file because the useScanner mock below is hoisted to the top of the
 * module and so applies to every test beside it, and the rest of App's suite
 * wants the real hook. Mocking it is what makes this testable at all: the flash
 * is driven by detections, and driving those for real would mean a camera, a
 * decoder and a canvas, none of which jsdom has.
 */
const harness = vi.hoisted(() => ({
  onDetect: null as ((value: string) => void) | null,
  // Stable across renders, the way the real hook's useMemo result is.
  scanner: {
    videoRef: { current: null },
    status: 'scanning',
    notice: null,
    start: () => Promise.resolve(),
    stop: () => {},
    torch: { available: false, on: false, toggle: () => {} },
    keepScanning: { on: true, toggle: () => {} },
  },
}))

vi.mock('./hooks/useScanner.ts', () => ({
  useScanner: (onDetect: (value: string) => void) => {
    harness.onDetect = onDetect
    return harness.scanner
  },
}))

vi.mock('./lib/decoder.ts', () => ({
  NO_BARCODE: { value: null, failed: false },
  openDecoder: vi.fn(),
  warmDecoder: vi.fn(),
}))

import App from './App.tsx'

/** A real clock value, because the throttle compares against a ref that starts
    at 0 and the first flash has to clear it. */
const BASE = 1_700_000_000_000

/** Only the throttle's clock is stubbed, so real timers keep working. */
const clockAt = (offset: number) => vi.spyOn(Date, 'now').mockReturnValue(BASE + offset)

/** One read, at a given point on that clock. The inner await lets the state
    update and the microtask the lookup queues behind it both settle. */
const read = async (value: string, offset: number) => {
  clockAt(offset)
  await act(async () => {
    harness.onDetect!(value)
    await Promise.resolve()
  })
}

const flashCount = () =>
  Number(document.querySelector('[data-flash]')?.getAttribute('data-flash') ?? 0)

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  // The lookup is fired and forgotten by handleDetect; nothing here waits on it.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => new Promise(() => {})),
  )
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

/**
 * Keep scanning reads as fast as the camera delivers frames, about ten times a
 * second. A flash per read is a strobe over most of the screen rather than a
 * confirmation: the accent at 85% over a dark shot swings relative luminance by
 * about 0.5, and the viewfinder is far larger than the small safe area that
 * WCAG 2.3.1 exempts.
 */
describe('the scan flash', () => {
  it('still flashes on a single scan', async () => {
    render(<App />)
    await read('A', 0)
    expect(flashCount()).toBe(1)
  })

  it('stays at or under three flashes in any one second', async () => {
    render(<App />)

    // Ten reads a second for two seconds, alternating so that nothing upstream
    // could mistake them for a repeat of one item.
    for (let i = 0; i < 20; i++) await read(i % 2 === 0 ? 'A' : 'B', i * 100)

    // Two seconds of reads, so three a second would be six.
    expect(flashCount()).toBeLessThanOrEqual(6)
    // And it has not quietly stopped flashing, or slowed to a crawl.
    expect(flashCount()).toBeGreaterThanOrEqual(3)
  })

  it('leaves at least the gap between consecutive flashes', async () => {
    render(<App />)

    await read('A', 0)
    expect(flashCount()).toBe(1)

    // One millisecond short of the gap: still the same flash.
    await read('B', FLASH_GAP_MS - 1)
    expect(flashCount()).toBe(1)

    await read('C', FLASH_GAP_MS)
    expect(flashCount()).toBe(2)
  })

  /** The flash is held back, the scan itself never is. */
  it('takes the second scan even when its flash is skipped', async () => {
    render(<App />)

    await read('5000157024671', 0)
    await read('5012345678900', 50)

    // One flash covers both reads, because 50ms apart is a strobe...
    expect(flashCount()).toBe(1)
    // ...but the second read is still the one on the panel and in the field.
    expect(screen.getByText('5012345678900')).toBeInTheDocument()
    expect(screen.getByLabelText(/search eBay UK for/i)).toHaveValue('5012345678900')
  })
})
