import { useState } from 'react'
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

/** Focus only moves once the list has actually re-rendered without the button
    that was pressed, so these cases need the list to own its own state. */
function Live({ initial }: { initial: ScanEntry[] }) {
  const [entries, setEntries] = useState(initial)
  return (
    <History
      entries={entries}
      onRecall={vi.fn()}
      onRemove={(entry) => setEntries((current) => current.filter((one) => one !== entry))}
      onClear={() => setEntries([])}
    />
  )
}

const removeButton = (label: string) =>
  screen.getByRole('button', { name: `Remove ${label} from recent scans` })

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

  it('spells the date out for a screen reader, not only in a tooltip', () => {
    setup()
    // The tooltip never reaches a touch or keyboard user, so the row says it.
    expect(screen.getByRole('button', { name: /^Heinz Beans/ })).toHaveAccessibleName(
      /11 September 2025/,
    )
  })

  /**
   * Every one of these used to drop focus to <body>, because the button that
   * was pressed is the button that goes away. A keyboard or screen reader user
   * was silently moved to the top of the document.
   */
  describe('focus, once the pressed button has gone', () => {
    const THREE: ScanEntry[] = [
      ...ENTRIES,
      { code: '5060337502900', label: 'Brewdog Punk IPA', at: NOW - 172_800_000 },
    ]

    it('moves to the row that took the removed row’s place', async () => {
      render(<Live initial={THREE} />)
      await userEvent.click(removeButton('Heinz Beans'))
      expect(removeButton('Nintendo Switch')).toHaveFocus()
    })

    it('moves to the new last row when the last one goes', async () => {
      render(<Live initial={THREE} />)
      await userEvent.click(removeButton('Brewdog Punk IPA'))
      expect(removeButton('Nintendo Switch')).toHaveFocus()
    })

    it('falls back to the heading when the last row goes', async () => {
      render(<Live initial={[ENTRIES[0]]} />)
      await userEvent.click(removeButton('Heinz Beans'))
      expect(screen.getByRole('heading', { name: 'Recent scans' })).toHaveFocus()
    })

    it('lands on the heading after clearing', async () => {
      render(<Live initial={THREE} />)
      await userEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(screen.getByRole('heading', { name: 'Recent scans' })).toHaveFocus()
    })
  })

  it('says what happened, since removing one row of three looks like nothing', async () => {
    render(<Live initial={ENTRIES} />)
    await userEvent.click(removeButton('Heinz Beans'))
    expect(screen.getByRole('status')).toHaveTextContent('Removed Heinz Beans from recent scans.')
  })
})
