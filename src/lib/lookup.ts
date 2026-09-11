/**
 * Turn a barcode into a product name using free, key-less databases.
 * Both are best effort: a miss just means we search the number instead.
 */

/** No lookup is worth holding the caption on screen longer than this. */
const REQUEST_TIMEOUT = 4000

/** How long Open Food Facts gets on its own before we run both together. */
const HEAD_START = 800

/** Names never change, so a repeat scan of the same item should cost nothing. */
const CACHE_LIMIT = 200

export type LookupOutcome =
  /** We have a name. */
  | 'found'
  /** Both databases answered, neither knew the product. */
  | 'none'
  /** The device is offline, so we did not ask. */
  | 'offline'
  /** UPCitemdb's free tier turned us away. Trying later may well work. */
  | 'limited'
  /** A request failed or timed out. */
  | 'unavailable'

export interface LookupResult {
  name: string | null
  outcome: LookupOutcome
}

interface SourceResult {
  name: string | null
  /** The source answered, but only to say we had asked too often. */
  limited: boolean
  /** The source could not be reached at all. */
  failed: boolean
}

const MISS: SourceResult = { name: null, limited: false, failed: false }

const cache = new Map<string, LookupResult>()

function remember(code: string, result: LookupResult): void {
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(code, result)
}

/** Exposed for tests. Nothing in the app needs to forget a name. */
export function clearLookupCache(): void {
  cache.clear()
}

/** Abort when the caller aborts, or when we have simply waited long enough. */
function bounded(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = AbortSignal.timeout(ms)
  if (!signal) return timeout
  // AbortSignal.any is recent. Without it we keep the timeout, which is the
  // half that stops a hung request holding the interface.
  return typeof AbortSignal.any === 'function' ? AbortSignal.any([signal, timeout]) : timeout
}

function delay(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve()
    const timer = setTimeout(resolve, ms)
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer)
        resolve()
      },
      { once: true },
    )
  })
}

export async function lookupName(code: string, signal?: AbortSignal): Promise<LookupResult> {
  const known = cache.get(code)
  if (known) return known

  // We ask even when the device says it is offline. The service worker caches
  // both APIs, so a product scanned before still resolves in a shop with no
  // signal, and a fetch with nowhere to go fails in milliseconds anyway.
  const foodFacts = tryOpenFoodFacts(code, signal)

  // Most eBay items are not groceries. Waiting for a full Open Food Facts miss
  // before starting the second lookup makes the common case pay both round
  // trips end to end, so give it a head start and then run them together.
  const headStart = new AbortController()
  signal?.addEventListener('abort', () => headStart.abort(), { once: true })
  const early = await Promise.race([
    foodFacts,
    delay(HEAD_START, headStart.signal).then(() => null),
  ])
  headStart.abort()
  if (early?.name) return settle(code, { name: early.name, outcome: 'found' }, signal)

  const upcItemDb = tryUpcItemDb(code, signal)
  const first = await foodFacts
  if (first.name) return settle(code, { name: first.name, outcome: 'found' }, signal)

  const second = await upcItemDb
  if (second.name) return settle(code, { name: second.name, outcome: 'found' }, signal)

  const limited = first.limited || second.limited
  const failed = first.failed || second.failed

  // navigator.onLine is only trustworthy when it says false. Reach for it last,
  // to explain a failure we already have, rather than to predict one.
  const outcome: LookupOutcome = limited
    ? 'limited'
    : !failed
      ? 'none'
      : navigator.onLine === false
        ? 'offline'
        : 'unavailable'

  return settle(code, { name: null, outcome }, signal)
}

/**
 * Cache only settled facts. A rate limit or a dropped connection says nothing
 * about the product, and an aborted lookup did not finish asking.
 */
function settle(code: string, result: LookupResult, signal: AbortSignal | undefined): LookupResult {
  if (!signal?.aborted && (result.outcome === 'found' || result.outcome === 'none')) {
    remember(code, result)
  }
  return result
}

async function tryOpenFoodFacts(code: string, signal?: AbortSignal): Promise<SourceResult> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands`,
      { signal: bounded(signal, REQUEST_TIMEOUT) },
    )
    if (res.status === 429) return { name: null, limited: true, failed: false }
    if (!res.ok) return { name: null, limited: false, failed: res.status >= 500 }
    const data = (await res.json()) as {
      status?: number
      product?: { product_name?: string; brands?: string }
    }
    if (data.status !== 1 || !data.product) return MISS
    const name = [data.product.brands, data.product.product_name].filter(Boolean).join(' ').trim()
    return { name: name || null, limited: false, failed: false }
  } catch {
    return { name: null, limited: false, failed: true }
  }
}

async function tryUpcItemDb(code: string, signal?: AbortSignal): Promise<SourceResult> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      { signal: bounded(signal, REQUEST_TIMEOUT) },
    )
    if (res.status === 429) return { name: null, limited: true, failed: false }
    if (!res.ok) return { name: null, limited: false, failed: res.status >= 500 }
    const data = (await res.json()) as { items?: Array<{ brand?: string; title?: string }> }
    const item = data.items?.[0]
    if (!item) return MISS
    const name = [item.brand, item.title].filter(Boolean).join(' ').trim()
    return { name: name || null, limited: false, failed: false }
  } catch {
    return { name: null, limited: false, failed: true }
  }
}
