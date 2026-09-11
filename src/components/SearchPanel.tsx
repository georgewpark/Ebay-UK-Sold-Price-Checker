import type { RefObject } from 'react'
import type { ScanStatus } from '../lib/types.ts'

interface Props {
  code: string
  status: ScanStatus
  term: string
  termRef: RefObject<HTMLInputElement | null>
  onTermChange: (term: string) => void
  onSold: () => void
  onLive: () => void
}

export default function SearchPanel({
  code,
  status,
  term,
  termRef,
  onTermChange,
  onSold,
  onLive,
}: Props) {
  const ready = term.trim().length > 0

  return (
    <section
      aria-label="Search eBay UK"
      className="rounded-card border border-line bg-surface p-4 shadow-xs"
    >
      <div className="flex items-baseline justify-between gap-3">
        {/* The dashes are a visual stand-in for an empty slot, not content.
            How a screen reader treats them depends on the user's punctuation
            verbosity, so hide them rather than leave it to chance. */}
        <p
          aria-hidden={!code}
          className={`min-w-0 break-all font-mono text-xl tracking-[0.12em] tabular ${code ? 'text-ink' : 'text-muted'}`}
        >
          {code || '–––––––'}
        </p>
        {code && (
          <span className="shrink-0 text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
            Barcode
          </span>
        )}
      </div>

      <p className="mt-1 min-h-4 text-[13px] text-muted">{status.caption}</p>
      <p role="status" className="sr-only">
        {status.spoken}
      </p>

      <label className="mt-4 block">
        <span className="mb-1.5 block text-[13px] font-medium text-muted">Search eBay UK for</span>
        <input
          ref={termRef}
          type="search"
          value={term}
          onChange={(event) => onTermChange(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && ready) onSold()
          }}
          placeholder="Scan a barcode, or type a product name"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-xl border border-field bg-sunken px-3.5 py-3 text-[15px] text-ink placeholder:text-muted"
        />
      </label>

      <div className="mt-3 grid gap-2">
        <button
          type="button"
          onClick={onSold}
          disabled={!ready}
          className="rounded-xl bg-accent px-4 py-4 text-base font-semibold text-accent-ink transition active:scale-[0.99] disabled:bg-sunken disabled:text-muted"
        >
          See sold prices
        </button>
        <button
          type="button"
          onClick={onLive}
          disabled={!ready}
          className="rounded-xl border border-field bg-surface px-4 py-3 text-sm font-semibold text-ink transition active:scale-[0.99] disabled:text-muted"
        >
          Live listings
        </button>
      </div>
    </section>
  )
}
