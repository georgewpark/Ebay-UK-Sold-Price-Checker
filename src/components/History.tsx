import { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react'
import type { FocusEvent } from 'react'
import { describeScanTime, formatScanTime, isoScanTime } from '../lib/time.ts'
import type { ScanEntry } from '../lib/types.ts'

interface Props {
  entries: ScanEntry[]
  onRecall: (entry: ScanEntry) => void
  onRemove: (entry: ScanEntry) => void
  onClear: () => void
}

/** Where focus should land once the list has re-rendered without the button
    that was just pressed: a row index, or the heading. */
type Restore = number | 'heading'

/**
 * Scan the same item twice and you get two rows with the same label, so
 * "Removed Heinz Beans from recent scans." can repeat word for word. React
 * writes the identical string, the DOM never changes, and a live region with
 * nothing to notice says nothing: the second removal was announced to nobody.
 * The count moves every time, so there is always a change to speak, and it
 * answers the question you would ask next anyway.
 */
function remaining(count: number): string {
  if (count <= 0) return 'No scans left.'
  return count === 1 ? '1 scan left.' : `${count} scans left.`
}

function History({ entries, onRecall, onRemove, onClear }: Props) {
  const headingId = useId()
  const headingRef = useRef<HTMLHeadingElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const restore = useRef<Restore | null>(null)
  /** The button inside the list that focus is sitting on, if any. */
  const seat = useRef<HTMLElement | null>(null)
  const [message, setMessage] = useState('')

  // Read inside a stable callback, so removing a row does not have to take the
  // row's index as a prop. An index prop would change for every row below a new
  // scan, which is exactly the re-render the memo on Row exists to avoid.
  const latest = useRef(entries)
  useEffect(() => {
    latest.current = entries
  })

  /**
   * Anything that rebuilds this list can take the focused button out of the
   * document with it. Browsers drop focus to <body> when that happens, so a
   * keyboard or screen reader user is silently moved to the top of the page.
   * Put focus somewhere deliberate instead, before the browser paints.
   *
   * Two ways in. Either a button here was pressed and we already know where
   * focus should land, or the list changed underneath us and we have to work it
   * out from where focus was.
   */
  useLayoutEffect(() => {
    const target = restore.current
    restore.current = null

    if (target !== null) {
      seat.current = null
      const toHeading = () => headingRef.current?.focus({ preventScroll: true })
      if (target === 'heading') return toHeading()

      const buttons = listRef.current?.querySelectorAll<HTMLButtonElement>('[data-remove]')
      if (!buttons?.length) return toHeading()
      // The row that took the removed one's place, or the new last row.
      buttons[Math.min(target, buttons.length - 1)].focus()
      return
    }

    /**
     * Nothing here asked for focus to move, so the list changed underneath us:
     * recording a scan of something already in the list drops its row and
     * rebuilds it at the top. That takes the focused button out of the document
     * just the same, and a browser blurs an element when it is only moved as
     * well, so neither a stable key nor React's own reordering would save it.
     * Put focus back on the same button of the same row, if it is still here.
     */
    const gone = seat.current
    const active = document.activeElement
    if (!gone || gone.isConnected) return
    if (active && active !== document.body) return

    // closest still walks the detached row the button was torn out with.
    const label = gone.closest<HTMLElement>('[data-label]')?.dataset.label
    if (!label) return

    const rows = listRef.current?.querySelectorAll<HTMLElement>('[data-label]')
    const row = Array.from(rows ?? []).find((node) => node.dataset.label === label)
    const button = row?.querySelector<HTMLButtonElement>(
      gone.hasAttribute('data-remove') ? '[data-remove]' : 'button',
    )
    button?.focus({ preventScroll: true })
  }, [entries])

  const remove = useCallback(
    (entry: ScanEntry) => {
      const index = latest.current.findIndex(
        (candidate) => candidate.at === entry.at && candidate.code === entry.code,
      )
      restore.current = index < 0 ? 'heading' : index
      setMessage(
        `Removed ${entry.label} from recent scans. ${remaining(latest.current.length - 1)}`,
      )
      onRemove(entry)
    },
    [onRemove],
  )

  const clear = () => {
    restore.current = 'heading'
    setMessage('Recent scans cleared.')
    onClear()
  }

  // onFocus is focusin, so one handler on the list keeps track of every row
  // without giving each button its own.
  const takeSeat = (event: FocusEvent<HTMLElement>) => {
    seat.current = event.target
  }

  return (
    // Naming the section makes it a landmark, the way the scanner and search
    // panels already are. Without a name it was just a div with a heading in it.
    <section
      aria-labelledby={headingId}
      className="rounded-card border border-line bg-surface px-4 py-3 shadow-xs"
    >
      {/* Removing one row out of ten changes nothing a screen reader would
          otherwise notice, so say what happened. Permanently mounted, so the
          region is in the accessibility tree before it has anything to report. */}
      <p role="status" className="sr-only">
        {message}
      </p>

      <div className="flex items-baseline justify-between gap-3">
        {/* tabIndex -1 so it can take focus when the list empties, without
            joining the tab order for everyone else. */}
        <h2
          id={headingId}
          ref={headingRef}
          tabIndex={-1}
          className="text-sm font-semibold text-ink"
        >
          Recent scans
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={clear}
            className="-my-1.5 -mr-2 px-2 py-1.5 text-[0.8125rem] text-muted underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 && (
        <p className="py-2 text-[0.8125rem] text-muted">
          Nothing scanned yet. Your last 40 lookups stay on this device.
        </p>
      )}

      {entries.length > 0 && (
        <ul ref={listRef} onFocus={takeSeat} className="mt-1 divide-y divide-line">
          {entries.map((entry) => (
            <li
              key={`${entry.code}-${entry.at}`}
              data-label={entry.label}
              className="flex items-center gap-1"
            >
              <Row entry={entry} onRecall={onRecall} onRemove={remove} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

/** Memoised per row so recording a scan only re-renders the row that changed. */
const Row = memo(function Row({
  entry,
  onRecall,
  onRemove,
}: {
  entry: ScanEntry
  onRecall: (entry: ScanEntry) => void
  onRemove: (entry: ScanEntry) => void
}) {
  const when = describeScanTime(entry.at)

  return (
    <>
      <button
        type="button"
        onClick={() => onRecall(entry)}
        className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left"
      >
        <span className="min-w-0">
          {/* Wraps rather than truncates. A real product name runs to about
              twice the width of this column, and an ellipsis put the rest out
              of reach of anyone reading the screen: title is no answer here,
              for the same reason it was not for the date below. */}
          <span className="block wrap-break-word text-[0.9375rem] text-ink">{entry.label}</span>
          {entry.code !== entry.label && (
            <span className="block font-mono text-[0.6875rem] tracking-wider text-muted tabular">
              {entry.code}
            </span>
          )}
        </span>
        {/* The row shows "14:32" for today and a date for anything older, so
            yesterday's scan is no longer indistinguishable from this morning's.
            The unabbreviated version used to live only in the title, which never
            reaches a touch or keyboard user, so it is spoken instead. */}
        <time
          dateTime={isoScanTime(entry.at)}
          title={when}
          className="shrink-0 text-[0.8125rem] text-muted tabular"
        >
          <span aria-hidden="true">{formatScanTime(entry.at)}</span>
          <span className="sr-only">{when}</span>
        </time>
      </button>

      {/* Clearing everything was the only way to lose one bad lookup. 44px
          square, so it clears WCAG 2.5.8 with room to spare. */}
      <button
        type="button"
        data-remove
        onClick={() => onRemove(entry)}
        aria-label={`Remove ${entry.label} from recent scans`}
        className="-mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted transition hover:text-ink"
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 16 16"
          className="size-4"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        >
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
    </>
  )
})

export default memo(History)
