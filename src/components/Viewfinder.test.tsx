import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Viewfinder from './Viewfinder.tsx'
import type { ScannerStatus } from '../hooks/useScanner.ts'

const base = {
  videoRef: createRef<HTMLVideoElement>(),
  notice: null,
  flashKey: 0,
  keepScanning: { on: false, toggle: vi.fn() },
  onToggleScan: vi.fn(),
}

/** The trailing button stands in for the rest of the page. */
function view(status: ScannerStatus, available: boolean) {
  return (
    <>
      <Viewfinder {...base} status={status} torch={{ available, on: available, toggle: vi.fn() }} />
      <button type="button">Somewhere else</button>
    </>
  )
}

const torchButton = () => screen.queryByRole('button', { name: 'Torch' })

describe('Viewfinder', () => {
  it('offers the torch only while there is a camera to light it', () => {
    const { rerender } = render(view('scanning', true))
    expect(torchButton()).toBeInTheDocument()

    rerender(view('idle', false))
    expect(torchButton()).not.toBeInTheDocument()
  })

  /**
   * A successful scan stops the camera, and releasing it takes the torch pill
   * away. Focus used to land on <body>, so a keyboard or screen reader user was
   * silently returned to the top of the document at the moment their scan
   * worked, with the whole page to tab through again.
   */
  describe('focus, once the torch has gone', () => {
    it('moves to the scan button when the camera stops', () => {
      const { rerender } = render(view('scanning', true))
      torchButton()!.focus()

      rerender(view('idle', false))

      expect(screen.getByRole('button', { name: 'Start scanning' })).toHaveFocus()
    })

    it('leaves focus alone when the user has already moved on', () => {
      const { rerender } = render(view('scanning', true))
      torchButton()!.focus()
      const elsewhere = screen.getByRole('button', { name: 'Somewhere else' })
      elsewhere.focus()

      rerender(view('idle', false))

      expect(elsewhere).toHaveFocus()
    })
  })
})
