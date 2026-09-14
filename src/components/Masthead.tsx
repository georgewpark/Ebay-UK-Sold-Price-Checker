import { memo } from 'react'

function Masthead() {
  return (
    <header className="px-1">
      {/* Scales with the viewport, but is free to wrap: pinning it to one line
          clipped the title at 320px once WCAG 1.4.12 text spacing was applied. */}
      <h1 className="text-[clamp(1.0625rem,5vw,1.25rem)] font-semibold tracking-[-0.03em] text-ink">
        eBay UK
        <span className="mx-1.5 text-muted">-</span>
        Sold Price Checker
      </h1>
      <p className="mt-1 text-[0.8125rem] text-muted">
        Scan a barcode to see what it recently sold for on eBay UK.
      </p>
    </header>
  )
}

export default memo(Masthead)
