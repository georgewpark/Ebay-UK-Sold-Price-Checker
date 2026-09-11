/**
 * Turn a barcode into a product name using free, key-less databases.
 * Both are best effort: a miss just means we search the number instead.
 */
export async function lookupName(code: string, signal?: AbortSignal): Promise<string | null> {
  return (await tryOpenFoodFacts(code, signal)) ?? (await tryUpcItemDb(code, signal))
}

async function tryOpenFoodFacts(code: string, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(
      `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,brands`,
      { signal },
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
      { signal },
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
