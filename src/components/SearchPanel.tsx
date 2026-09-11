import { memo, useId } from 'react'
import type { RefObject } from 'react'
import type { ScanStatus } from '../lib/types.ts'

interface Props {
  code: string
  status: ScanStatus
  term: string
  termRef: RefObject<HTMLInputElement | null>
  online: boolean
  onTermChange: (term: string) => void
  onSold: () => void
  onLive: () => void
}

function SearchPanel({
  code,
  status,
  term,
  termRef,
  online,
  onTermChange,
  onSold,
  onLive,
}: Props) {
  const noteId = useId()
  const empty = term.trim().length === 0
  const blocked = empty || !online

  // A disabled button leaves the tab order, so a keyboard user arrives at the
  // buttons, finds nothing, and is told nothing. aria-disabled keeps them
  // reachable and lets aria-describedby explain why they will not fire.
  const guard = (run: () => void) => () => {
    if (!blocked) run()
  }

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
            if (event.key === 'Enter' && !blocked) onSold()
          }}
          placeholder="Scan a barcode, or type a product name"
          autoComplete="off"
          enterKeyHint="search"
          className="w-full rounded-xl border border-field bg-sunken px-3.5 py-3 text-[15px] text-ink placeholder:text-muted"
        />
      </label>

      {blocked && (
        <p id={noteId} className="mt-2 text-[13px] text-muted">
          {online
            ? 'Scan a barcode or type a product name to search.'
            : 'No connection, so eBay cannot open. Reconnect and try again.'}
        </p>
      )}

      <div className="mt-3 grid gap-2">
        <button
          type="button"
          onClick={guard(onSold)}
          aria-disabled={blocked}
          aria-describedby={blocked ? noteId : undefined}
          className={`rounded-xl px-4 py-4 text-base font-semibold transition active:scale-[0.99] ${
            blocked ? 'bg-sunken text-muted' : 'bg-accent text-accent-ink'
          }`}
        >
          See sold prices
        </button>
        <button
          type="button"
          onClick={guard(onLive)}
          aria-disabled={blocked}
          aria-describedby={blocked ? noteId : undefined}
          className={`rounded-xl border border-field bg-surface px-4 py-3 text-sm font-semibold transition active:scale-[0.99] ${
            blocked ? 'text-muted' : 'text-ink'
          }`}
        >
          Live listings
        </button>
      </div>
    </section>
  )
}

export default memo(SearchPanel)
