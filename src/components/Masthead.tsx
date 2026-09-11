export default function Masthead() {
  return (
    <header className="px-1">
      {/* Scales with the viewport so the name stays on one line on small phones. */}
      <h1 className="whitespace-nowrap text-[clamp(17px,5vw,20px)] font-semibold tracking-[-0.03em] text-ink">
        eBay UK
        <span className="mx-1.5 text-muted">-</span>
        Sold Price Checker
      </h1>
      <p className="mt-1 text-[13px] text-muted">
        Scan a barcode to see what it recently sold for on eBay UK.
      </p>
    </header>
  )
}
