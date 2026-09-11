import { memo, useId } from 'react'
import { describeScanTime, formatScanTime, isoScanTime } from '../lib/time.ts'
import type { ScanEntry } from '../lib/types.ts'

interface Props {
  entries: ScanEntry[]
  onRecall: (entry: ScanEntry) => void
  onRemove: (entry: ScanEntry) => void
  onClear: () => void
}

function History({ entries, onRecall, onRemove, onClear }: Props) {
  const headingId = useId()

  return (
    // Naming the section makes it a landmark, the way the scanner and search
    // panels already are. Without a name it was just a div with a heading in it.
    <section
      aria-labelledby={headingId}
      className="rounded-card border border-line bg-surface px-4 py-3 shadow-xs"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-sm font-semibold text-ink">
          Recent scans
        </h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="-my-1.5 -mr-2 px-2 py-1.5 text-[13px] text-muted underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      <div role="status">
        {entries.length === 0 && (
          <p className="py-2 text-[13px] text-muted">
            Nothing scanned yet. Your last 40 lookups stay on this device.
          </p>
        )}
      </div>

      {entries.length > 0 && (
        <ul className="mt-1 divide-y divide-line">
          {entries.map((entry) => (
            <li key={`${entry.code}-${entry.at}`} className="flex items-center gap-1">
              <Row entry={entry} onRecall={onRecall} onRemove={onRemove} />
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
          <span className="block truncate text-[15px] text-ink">{entry.label}</span>
          {entry.code !== entry.label && (
            <span className="block font-mono text-[11px] tracking-wider text-muted tabular">
              {entry.code}
            </span>
          )}
        </span>
        {/* The row shows "14:32" for today and a date for anything older, so
            yesterday's scan is no longer indistinguishable from this morning's.
            The title and the datetime carry the unabbreviated version. */}
        <time
          dateTime={isoScanTime(entry.at)}
          title={when}
          className="shrink-0 text-[13px] text-muted tabular"
        >
          {formatScanTime(entry.at)}
        </time>
      </button>

      {/* Clearing everything was the only way to lose one bad lookup. 44px
          square, so it clears WCAG 2.5.8 with room to spare. */}
      <button
        type="button"
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
