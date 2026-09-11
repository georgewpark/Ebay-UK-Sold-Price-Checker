import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import History from './History.tsx'
import type { ScanEntry } from '../lib/types.ts'

const NOW = new Date(2025, 8, 11, 14, 30).getTime()

/**
 * The rows are dated against the real clock, so pin it. Only Date is faked:
 * faking timers as well would stall userEvent, which waits on them.
 */
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})
afterAll(() => vi.useRealTimers())

const ENTRIES: ScanEntry[] = [
  { code: '5000157024671', label: 'Heinz Beans', at: NOW - 3_600_000 },
  { code: '0045496453435', label: 'Nintendo Switch', at: NOW - 86_400_000 },
]

function setup(entries = ENTRIES) {
  const props = { entries, onRecall: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }
  render(<History {...props} />)
  return props
}

describe('History', () => {
  it('is a landmark a screen reader can jump to', () => {
    setup()
    expect(screen.getByRole('region', { name: 'Recent scans' })).toBeInTheDocument()
  })

  it('recalls an entry when its row is chosen', async () => {
    const props = setup()
    // Anchored: "Remove Heinz Beans from recent scans" matches otherwise.
    await userEvent.click(screen.getByRole('button', { name: /^Heinz Beans/ }))
    expect(props.onRecall).toHaveBeenCalledWith(ENTRIES[0])
  })

  it('removes one entry without clearing the rest', async () => {
    const props = setup()
    await userEvent.click(
      screen.getByRole('button', { name: 'Remove Nintendo Switch from recent scans' }),
    )
    expect(props.onRemove).toHaveBeenCalledWith(ENTRIES[1])
    expect(props.onClear).not.toHaveBeenCalled()
  })

  it('dates older rows so they cannot be mistaken for today', () => {
    setup()
    const rows = screen.getAllByRole('listitem')
    expect(within(rows[1]).getByText('Yesterday')).toBeInTheDocument()
    // Today's row keeps a clock time.
    expect(within(rows[0]).getByText(/^\d{2}:\d{2}$/)).toBeInTheDocument()
  })

  it('offers no clear button when there is nothing to clear', () => {
    setup([])
    expect(screen.queryByRole('button', { name: 'Clear' })).not.toBeInTheDocument()
    expect(screen.getByText(/nothing scanned yet/i)).toBeInTheDocument()
  })

  it('hides the barcode when it is the same as the label', () => {
    setup([{ code: 'vintage teapot', label: 'vintage teapot', at: NOW }])
    expect(screen.getAllByText('vintage teapot')).toHaveLength(1)
  })
})
