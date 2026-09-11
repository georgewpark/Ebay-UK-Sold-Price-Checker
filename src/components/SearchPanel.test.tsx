import { createRef } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import SearchPanel from './SearchPanel.tsx'

function setup(overrides: Partial<Parameters<typeof SearchPanel>[0]> = {}) {
  const props = {
    code: '5000157024671',
    status: { caption: 'Looking up a product name', spoken: 'Looking up a product name' },
    term: 'Heinz Beans',
    termRef: createRef<HTMLInputElement>(),
    online: true,
    onTermChange: vi.fn(),
    onSold: vi.fn(),
    onLive: vi.fn(),
    ...overrides,
  }
  render(<SearchPanel {...props} />)
  return props
}

const soldButton = () => screen.getByRole('button', { name: /see sold prices/i })
const liveButton = () => screen.getByRole('button', { name: /live listings/i })

describe('SearchPanel', () => {
  it('says that the searches leave the page', () => {
    setup()
    expect(soldButton()).toHaveAccessibleName(/opens in a new tab/i)
    expect(liveButton()).toHaveAccessibleName(/opens in a new tab/i)
  })

  it('searches sold prices when the field is submitted', async () => {
    const props = setup()
    await userEvent.type(screen.getByLabelText(/search ebay uk for/i), '{Enter}')
    expect(props.onSold).toHaveBeenCalledOnce()
  })

  it('runs each search from its own button', async () => {
    const props = setup()
    await userEvent.click(soldButton())
    await userEvent.click(liveButton())
    expect(props.onSold).toHaveBeenCalledOnce()
    expect(props.onLive).toHaveBeenCalledOnce()
  })

  /**
   * Offline, every search would open a tab that cannot load. Block it, but keep
   * the buttons in the tab order so a keyboard user can reach the explanation
   * rather than finding two controls that are simply not there.
   */
  describe('offline', () => {
    it('refuses to open a tab that cannot load', async () => {
      const props = setup({ online: false })
      await userEvent.click(soldButton())
      await userEvent.click(liveButton())
      expect(props.onSold).not.toHaveBeenCalled()
      expect(props.onLive).not.toHaveBeenCalled()
    })

    it('keeps the buttons reachable and explains why they will not fire', () => {
      setup({ online: false })
      expect(soldButton()).toHaveAttribute('aria-disabled', 'true')
      expect(soldButton()).not.toBeDisabled()
      expect(soldButton()).toHaveAccessibleDescription(/no connection/i)
    })
  })

  describe('with nothing to search for', () => {
    it('does not search on an empty term', async () => {
      const props = setup({ term: '   ', code: '' })
      await userEvent.click(soldButton())
      expect(props.onSold).not.toHaveBeenCalled()
      expect(soldButton()).toHaveAccessibleDescription(/scan a barcode or type a product name/i)
    })
  })

  it('announces the scan status without showing it twice', () => {
    setup({
      status: {
        caption: 'From your recent scans.',
        spoken: 'Heinz Beans, from your recent scans.',
      },
    })
    expect(screen.getByText('From your recent scans.')).toBeInTheDocument()
    expect(screen.getByText('Heinz Beans, from your recent scans.')).toHaveClass('sr-only')
  })
})
