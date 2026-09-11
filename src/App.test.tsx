import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App.tsx'

/**
 * The decoder pulls in a 1 MB WASM binary and a worker, neither of which jsdom
 * has any use for. Stubbing it here keeps this a test of the wiring: scan goes
 * in, name is looked up, history and the search buttons follow.
 */
vi.mock('./lib/decoder.ts', () => ({
  openDecoder: vi.fn(() => Promise.resolve({ decode: () => Promise.resolve(null), native: true })),
  warmDecoder: vi.fn(),
}))

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200 }))
}

beforeEach(() => {
  localStorage.clear()
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
  vi.stubGlobal(
    'fetch',
    vi.fn((input: string | URL) =>
      new URL(input).hostname === 'world.openfoodfacts.org'
        ? json({ status: 1, product: { brands: 'Heinz', product_name: 'Baked Beans' } })
        : json({ items: [] }),
    ),
  )
  vi.stubGlobal('open', vi.fn())
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('App', () => {
  it('renders the three panels as landmarks', () => {
    render(<App />)
    expect(screen.getByRole('region', { name: 'Barcode scanner' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Search eBay UK' })).toBeInTheDocument()
    expect(screen.getByRole('region', { name: 'Recent scans' })).toBeInTheDocument()
  })

  it('opens eBay sold listings for a typed term and remembers it', async () => {
    render(<App />)

    await userEvent.type(screen.getByLabelText(/search eBay UK for/i), 'vintage teapot')
    await userEvent.click(screen.getByRole('button', { name: /see sold prices/i }))

    expect(window.open).toHaveBeenCalledOnce()
    const [url] = vi.mocked(window.open).mock.calls[0]
    const parsed = new URL(String(url))
    expect(parsed.searchParams.get('_nkw')).toBe('vintage teapot')
    expect(parsed.searchParams.get('LH_Sold')).toBe('1')

    expect(await screen.findByRole('button', { name: /^vintage teapot/ })).toBeInTheDocument()
  })

  it('recalls a past scan back into the search field', async () => {
    localStorage.setItem(
      'sold.history.v1',
      JSON.stringify([{ code: '5000157024671', label: 'Heinz Baked Beans', at: Date.now() }]),
    )
    render(<App />)

    await userEvent.click(screen.getByRole('button', { name: /^Heinz Baked Beans/ }))
    expect(screen.getByLabelText(/search eBay UK for/i)).toHaveValue('Heinz Baked Beans')
  })

  /** The whole point of the app is a link to eBay, so losing the network has
      to be visible rather than producing a tab that cannot load. */
  describe('offline', () => {
    beforeEach(() => {
      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    })

    it('explains what still works and refuses to open a dead tab', async () => {
      render(<App />)

      expect(screen.getByText(/you are offline/i)).toBeInTheDocument()

      await userEvent.type(screen.getByLabelText(/search eBay UK for/i), 'vintage teapot')
      await userEvent.click(screen.getByRole('button', { name: /see sold prices/i }))

      expect(window.open).not.toHaveBeenCalled()
    })

    it('hides the banner again once the connection returns', async () => {
      render(<App />)
      expect(screen.getByText(/you are offline/i)).toBeInTheDocument()

      vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(true)
      window.dispatchEvent(new Event('online'))

      await waitFor(() => {
        expect(screen.queryByText(/you are offline/i)).not.toBeInTheDocument()
      })
    })
  })
})
