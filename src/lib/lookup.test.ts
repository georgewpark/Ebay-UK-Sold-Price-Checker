import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { clearLookupCache, lookupName } from './lookup.ts'

const FOOD_FACTS = 'world.openfoodfacts.org'
const UPC_ITEM_DB = 'api.upcitemdb.com'

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

/** Routes by hostname, so a test only states the replies it cares about. */
function route(replies: Partial<Record<string, () => Promise<Response>>>) {
  const fetchMock = vi.fn(async (input: string | URL) => {
    const { hostname } = new URL(input)
    const reply = replies[hostname]
    if (!reply) throw new Error(`unexpected request to ${hostname}`)
    return reply()
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function setOnline(value: boolean) {
  vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(value)
}

beforeEach(() => {
  clearLookupCache()
  setOnline(true)
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('lookupName', () => {
  it('returns the Open Food Facts name without waiting for the second source', async () => {
    const fetchMock = route({
      [FOOD_FACTS]: () =>
        Promise.resolve(json({ status: 1, product: { brands: 'Heinz', product_name: 'Beans' } })),
    })

    await expect(lookupName('5000157024671')).resolves.toEqual({
      name: 'Heinz Beans',
      outcome: 'found',
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('falls through to UPCitemdb when the grocery database does not know the product', async () => {
    route({
      [FOOD_FACTS]: () => Promise.resolve(json({ status: 0 })),
      [UPC_ITEM_DB]: () =>
        Promise.resolve(json({ items: [{ brand: 'Nintendo', title: 'Switch OLED' }] })),
    })

    await expect(lookupName('0045496453435')).resolves.toEqual({
      name: 'Nintendo Switch OLED',
      outcome: 'found',
    })
  })

  it('reports a miss when both databases answer and neither knows it', async () => {
    route({
      [FOOD_FACTS]: () => Promise.resolve(json({ status: 0 })),
      [UPC_ITEM_DB]: () => Promise.resolve(json({ items: [] })),
    })

    await expect(lookupName('1111111111111')).resolves.toEqual({ name: null, outcome: 'none' })
  })

  /** A refusal is not a miss: telling someone the product is unknown, when we
      were simply turned away, sends them off to type a name for no reason. */
  it('separates a rate limit from a miss', async () => {
    route({
      [FOOD_FACTS]: () => Promise.resolve(json({ status: 0 })),
      [UPC_ITEM_DB]: () => Promise.resolve(json({ code: 'TOO_FAST' }, 429)),
    })

    await expect(lookupName('2222222222222')).resolves.toEqual({ name: null, outcome: 'limited' })
  })

  it('reports being offline when the requests fail and the device says so', async () => {
    setOnline(false)
    route({
      [FOOD_FACTS]: () => Promise.reject(new TypeError('Failed to fetch')),
      [UPC_ITEM_DB]: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    await expect(lookupName('3333333333333')).resolves.toEqual({ name: null, outcome: 'offline' })
  })

  it('calls a failure unavailable, not offline, while the device is connected', async () => {
    route({
      [FOOD_FACTS]: () => Promise.reject(new TypeError('Failed to fetch')),
      [UPC_ITEM_DB]: () => Promise.reject(new TypeError('Failed to fetch')),
    })

    await expect(lookupName('4444444444444')).resolves.toEqual({
      name: null,
      outcome: 'unavailable',
    })
  })

  it('serves a repeat scan from memory instead of asking again', async () => {
    const fetchMock = route({
      [FOOD_FACTS]: () =>
        Promise.resolve(json({ status: 1, product: { product_name: 'Marmite' } })),
    })

    await lookupName('5555555555555')
    await lookupName('5555555555555')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  /** Caching a rate limit would keep punishing the user long after it lifted. */
  it('does not cache a rate limit', async () => {
    const fetchMock = route({
      [FOOD_FACTS]: () => Promise.resolve(json({ status: 0 })),
      [UPC_ITEM_DB]: () => Promise.resolve(json({}, 429)),
    })

    await lookupName('6666666666666')
    await lookupName('6666666666666')
    expect(fetchMock.mock.calls.length).toBeGreaterThan(2)
  })

  it('treats a name of only whitespace as no name at all', async () => {
    route({
      [FOOD_FACTS]: () =>
        Promise.resolve(json({ status: 1, product: { brands: '  ', product_name: '' } })),
      [UPC_ITEM_DB]: () => Promise.resolve(json({ items: [] })),
    })

    await expect(lookupName('7777777777777')).resolves.toEqual({ name: null, outcome: 'none' })
  })
})
