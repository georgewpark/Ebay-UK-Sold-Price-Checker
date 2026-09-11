/** This app searches eBay UK only. Change the domain here to point it elsewhere. */
const DOMAIN = 'www.ebay.co.uk'

export function ebayUrl(term: string, sold: boolean): string {
  const params = new URLSearchParams({ _nkw: term })
  if (sold) {
    params.set('LH_Sold', '1')
    params.set('LH_Complete', '1')
  }
  return `https://${DOMAIN}/sch/i.html?${params.toString()}`
}

export function openTab(url: string): void {
  window.open(url, '_blank', 'noopener')
}
