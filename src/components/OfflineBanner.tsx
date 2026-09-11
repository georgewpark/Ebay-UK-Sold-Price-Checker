import { memo } from 'react'

/**
 * Every search on this page ends up on ebay.co.uk, so losing the connection
 * takes away the one thing the app exists to do. Say so, and say what still
 * works, rather than letting someone tap a button that opens a dead tab.
 *
 * The live region stays mounted and empty so the message is announced when it
 * arrives. A region that appears at the same moment as its content is not
 * reliably picked up.
 */
function OfflineBanner({ online }: { online: boolean }) {
  return (
    <div role="status" className="px-1 empty:hidden">
      {!online && (
        <p className="rounded-xl border border-notice-line bg-notice px-3 py-2 text-[13px] leading-relaxed text-notice-ink">
          <strong className="font-semibold">You are offline.</strong> Scanning and your recent scans
          still work. Searching needs a connection, because prices open on eBay.
        </p>
      )}
    </div>
  )
}

export default memo(OfflineBanner)
