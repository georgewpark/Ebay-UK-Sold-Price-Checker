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

  /**
   * Nothing here pressed anything: recording a scan of something already in the
   * list drops that row and rebuilds it at the top, which takes the focused
   * button out of the document just as surely. A browser blurs an element when
   * it is only moved as well, so React reordering a stable key would not save it
   * either. Either way the row is still on screen, so focus belongs back on it.
   */
  describe('focus, when a scan rewrites the list underneath', () => {
    /** What useHistory.record does to a label it already holds. */
    const rescanned = (entries: ScanEntry[], label: string): ScanEntry[] => {
      const entry = entries.find((one) => one.label === label)!
      return [{ ...entry, at: NOW }, ...entries.filter((one) => one !== entry)]
    }

    it('keeps focus on the row that moved', () => {
      const props = { entries: ENTRIES, onRecall: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }
      const { rerender } = render(<History {...props} />)
      removeButton('Nintendo Switch').focus()

      rerender(<History {...props} entries={rescanned(ENTRIES, 'Nintendo Switch')} />)

      expect(removeButton('Nintendo Switch')).toHaveFocus()
    })

    it('puts focus back on the same button of that row, not just the row', () => {
      const props = { entries: ENTRIES, onRecall: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }
      const { rerender } = render(<History {...props} />)
      screen.getByRole('button', { name: /^Nintendo Switch/ }).focus()

      rerender(<History {...props} entries={rescanned(ENTRIES, 'Nintendo Switch')} />)

      expect(screen.getByRole('button', { name: /^Nintendo Switch/ })).toHaveFocus()
    })

    it('leaves focus alone when it was never in the list', () => {
      const props = { entries: ENTRIES, onRecall: vi.fn(), onRemove: vi.fn(), onClear: vi.fn() }
      const { rerender } = render(
        <>
          <button type="button">Somewhere else</button>
          <History {...props} />
        </>,
      )
      const elsewhere = screen.getByRole('button', { name: 'Somewhere else' })
      elsewhere.focus()

      rerender(
        <>
          <button type="button">Somewhere else</button>
          <History {...props} entries={rescanned(ENTRIES, 'Nintendo Switch')} />
        </>,
      )

      expect(elsewhere).toHaveFocus()
    })
  })

  it('says what happened, since removing one row of three looks like nothing', async () => {
    render(<Live initial={ENTRIES} />)
    await userEvent.click(removeButton('Heinz Beans'))
    expect(screen.getByRole('status')).toHaveTextContent('Removed Heinz Beans from recent scans.')
  })

  /**
   * Scan the same item twice and both rows carry the same label. The message
   * used to be the label alone, so the second removal wrote a string identical
   * to the first: React touched nothing, and a live region with no change to
   * report announces nothing at all.
   */
  it('still announces the second removal of two identically named rows', async () => {
    const twice: ScanEntry[] = [
      { code: '5000157024671', label: 'Heinz Beans', at: NOW - 1_000 },
      { code: '5000157024671', label: 'Heinz Beans', at: NOW - 2_000 },
    ]
    render(<Live initial={twice} />)
    const region = screen.getByRole('status')
    const pressFirst = async () =>
      userEvent.click(screen.getAllByRole('button', { name: /^Remove Heinz Beans/ })[0])

    await pressFirst()
    const first = region.textContent

    await pressFirst()
    const second = region.textContent

    expect(first).toContain('Removed Heinz Beans from recent scans.')
    expect(second).toContain('Removed Heinz Beans from recent scans.')
    // The part that makes it a change a screen reader can notice.
    expect(second).not.toBe(first)
  })
})
