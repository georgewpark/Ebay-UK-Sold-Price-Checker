import { memo } from 'react'

/** Kept in one place so the spoken and the visible copy cannot drift apart. */
const SPOKEN =
  'You are offline. Scanning and your recent scans still work. Searching needs a connection, because prices open on eBay.'

/**
 * Every search on this page ends up on ebay.co.uk, so losing the connection
 * takes away the one thing the app exists to do. Say so, and say what still
 * works, rather than letting someone tap a button that opens a dead tab.
 *
 * The live region is a permanently mounted sr-only node, the same split
 * SearchPanel uses for the scan caption. It used to be the wrapper around the
 * visible banner, with `empty:hidden` to keep it from eating a flex gap: that
 * put the region at `display: none` whenever it had nothing to say, which takes
 * it out of the accessibility tree, so the region and its text arrived in the
 * same tick and screen readers had nothing to notice a change against.
 * sr-only is absolutely positioned, so it stays out of the flex flow instead.
 */
function OfflineBanner({ online }: { online: boolean }) {
  return (
    <>
      <p role="status" className="sr-only">
        {online ? '' : SPOKEN}
      </p>

      {!online && (
        <div className="px-1">
          <p className="rounded-xl border border-notice-line bg-notice px-3 py-2 text-[0.8125rem] leading-relaxed text-notice-ink">
            <strong className="font-semibold">You are offline.</strong> Scanning and your recent
            scans still work. Searching needs a connection, because prices open on eBay.
          </p>
        </div>
      )}
    </>
  )
}

export default memo(OfflineBanner)
