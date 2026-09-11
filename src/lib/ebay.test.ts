import { describe, expect, it, vi } from 'vitest'
import { ebayUrl, openTab } from './ebay.ts'

describe('ebayUrl', () => {
  it('asks for completed, sold listings when sold prices are wanted', () => {
    const url = new URL(ebayUrl('nintendo switch', true))
    expect(url.origin + url.pathname).toBe('https://www.ebay.co.uk/sch/i.html')
    expect(url.searchParams.get('_nkw')).toBe('nintendo switch')
    expect(url.searchParams.get('LH_Sold')).toBe('1')
    expect(url.searchParams.get('LH_Complete')).toBe('1')
  })

  it('leaves the sold filters off for live listings', () => {
    const url = new URL(ebayUrl('nintendo switch', false))
    expect(url.searchParams.has('LH_Sold')).toBe(false)
    expect(url.searchParams.has('LH_Complete')).toBe(false)
  })

  it('escapes terms rather than letting them add parameters', () => {
    const url = new URL(ebayUrl('lego&LH_Sold=0 #1', true))
    expect(url.searchParams.get('_nkw')).toBe('lego&LH_Sold=0 #1')
    expect(url.searchParams.get('LH_Sold')).toBe('1')
  })
})

describe('openTab', () => {
  it('opens a new tab without handing it a window reference', () => {
    const open = vi.fn()
    vi.stubGlobal('open', open)
    openTab('https://example.com/')
    // noopener matters: eBay gets no handle on the page that opened it.
    expect(open).toHaveBeenCalledWith('https://example.com/', '_blank', 'noopener')
  })
})
