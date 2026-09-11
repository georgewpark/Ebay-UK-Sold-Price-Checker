/**
 * Turn a barcode into a product name using free, key-less databases.
 * Both are best effort: a miss just means we search the number instead.
 */

/** No lookup is worth holding the caption on screen longer than this. */
const REQUEST_TIMEOUT = 4000

/** How long Open Food Facts gets on its own before we run both together. */
const HEAD_START = 800

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

export async function lookupName(code: string, signal?: AbortSignal): Promise<string | null> {
  const foodFacts = tryOpenFoodFacts(code, signal)

  // Most eBay items are not groceries. Waiting for a full Open Food Facts miss
  // before starting the second lookup makes the common case pay both round
  // trips end to end, so give it a head start and then run them together.
  const headStart = new AbortController()
  signal?.addEventListener('abort', () => headStart.abort(), { once: true })
  const early = await Promise.race([
    foodFacts.then((name) => ({ name })),
    delay(HEAD_START, headStart.signal).then(() => null),
  ])
  headStart.abort()
  if (early?.name) return early.name

  const upcItemDb = tryUpcItemDb(code, signal)
  return (await foodFacts) ?? (await upcItemDb)
}

async function tryOpenFoodFacts(code: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands`,
      { signal: bounded(signal, REQUEST_TIMEOUT) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as {
      status?: number
      product?: { product_name?: string; brands?: string }
    }
    if (data.status !== 1 || !data.product) return null
    const name = [data.product.brands, data.product.product_name].filter(Boolean).join(' ').trim()
    return name || null
  } catch {
    return null
  }
}

async function tryUpcItemDb(code: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.upcitemdb.com/prod/trial/lookup?upc=${encodeURIComponent(code)}`,
      { signal: bounded(signal, REQUEST_TIMEOUT) },
    )
    if (!res.ok) return null
    const data = (await res.json()) as { items?: Array<{ brand?: string; title?: string }> }
    const item = data.items?.[0]
    if (!item) return null
    const name = [item.brand, item.title].filter(Boolean).join(' ').trim()
    return name || null
  } catch {
    return null
  }
}
