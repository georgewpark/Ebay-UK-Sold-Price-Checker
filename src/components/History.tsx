import type { ScanEntry } from '../lib/types.ts'

interface Props {
  entries: ScanEntry[]
  onRecall: (entry: ScanEntry) => void
  onClear: () => void
}

const time = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

export default function History({ entries, onRecall, onClear }: Props) {
  return (
    <section className="rounded-card border border-line bg-surface px-4 py-3 shadow-xs">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold text-ink">Recent scans</h2>
        {entries.length > 0 && (
          <button
            type="button"
            onClick={onClear}
            className="text-[13px] text-muted underline underline-offset-2"
          >
            Clear
          </button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="py-2 text-[13px] text-muted">
          Nothing scanned yet. Your last 40 lookups stay on this device.
        </p>
      ) : (
        <ul className="mt-1 divide-y divide-line">
          {entries.map((entry) => (
            <li key={`${entry.code}-${entry.at}`}>
              <button
                type="button"
                onClick={() => onRecall(entry)}
                className="flex w-full items-center justify-between gap-3 py-3 text-left"
              >
                <span className="min-w-0">
                  <span className="block truncate text-[15px] text-ink">{entry.label}</span>
                  {entry.code !== entry.label && (
                    <span className="block font-mono text-[11px] tracking-wider text-muted tabular">
                      {entry.code}
                    </span>
                  )}
                </span>
                <span className="shrink-0 text-[13px] text-muted tabular">
                  {time.format(entry.at)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
