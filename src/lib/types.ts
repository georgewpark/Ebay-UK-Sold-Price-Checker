export interface ScanEntry {
  /** The raw barcode, or the typed term when there was no scan. */
  code: string
  /** What we search eBay for. */
  label: string
  /** Epoch milliseconds. */
  at: number
}
