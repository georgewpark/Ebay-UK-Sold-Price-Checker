import { expect, test } from '@playwright/test'
import type { BrowserContext, Page } from '@playwright/test'

/** The barcode drawn into e2e/fixtures/barcode.y4m. */
const BARCODE = '5000157024671'
const NAME = 'Heinz Baked Beans'

/** Scoped: once the scan is recorded, the number also appears in the history row. */
const scannedCode = (page: Page) =>
  page.getByRole('region', { name: 'Search eBay UK' }).getByText(BARCODE)

/**
 * Answer both lookup databases from the test, so the suite does not depend on
 * two public APIs being up, fast, or willing to serve a CI runner. Nothing here
 * should reach the network, eBay included.
 *
 * Routed on the context rather than the page: the service worker is blocked for
 * most of this suite (see the config), but eBay opens in a second tab and that
 * tab needs intercepting too.
 */
async function stubTheInternet(context: BrowserContext): Promise<URL[]> {
  const ebayRequests: URL[] = []

  await context.route('**/world.openfoodfacts.org/**', (route) =>
    route.fulfill({
      json: { status: 1, product: { brands: 'Heinz', product_name: 'Baked Beans' } },
    }),
  )
  await context.route('**/api.upcitemdb.com/**', (route) => route.fulfill({ json: { items: [] } }))

  // eBay bounces a signed-out request to signin.ebay.co.uk, so assert on what
  // the app asked for rather than on where the browser ended up.
  await context.route('**/*.ebay.co.uk/**', (route) => {
    ebayRequests.push(new URL(route.request().url()))
    return route.fulfill({ contentType: 'text/html', body: '<title>eBay stub</title>' })
  })

  return ebayRequests
}

test.describe('scanning', () => {
  test('reads a barcode from the camera and offers the eBay search', async ({ page, context }) => {
    await stubTheInternet(context)
    await page.goto('/')

    await page.getByRole('button', { name: 'Start scanning' }).click()

    // The decoder runs in a worker against the fake camera feed. Give it room:
    // the WASM path has to download and instantiate before the first decode.
    await expect(scannedCode(page)).toBeVisible({ timeout: 30_000 })

    // The looked-up name replaces the raw number in the search field.
    await expect(page.getByLabel('Search eBay UK for')).toHaveValue(NAME)

    await expect(
      // Anchored: "Remove Heinz Baked Beans from recent scans" matches otherwise.
      page
        .getByRole('region', { name: 'Recent scans' })
        .getByRole('button', { name: new RegExp(`^${NAME}`) }),
    ).toBeVisible()
  })

  test('stops the camera when the scan finishes', async ({ page, context }) => {
    await stubTheInternet(context)
    await page.goto('/')
    await page.getByRole('button', { name: 'Start scanning' }).click()
    await expect(scannedCode(page)).toBeVisible({ timeout: 30_000 })

    // Back to idle, and the camera track released rather than left running.
    await expect(page.getByRole('button', { name: 'Start scanning' })).toBeVisible()
    const live = await page.evaluate(() => {
      const video = document.querySelector('video')
      const stream = video?.srcObject as MediaStream | null
      return stream?.getTracks().filter((track) => track.readyState === 'live').length ?? 0
    })
    expect(live).toBe(0)
  })
})

test.describe('searching', () => {
  test('opens eBay completed listings in a new tab', async ({ page, context }) => {
    const ebayRequests = await stubTheInternet(context)
    await page.goto('/')
    await page.getByLabel('Search eBay UK for').fill('vintage teapot')

    await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('button', { name: /See sold prices/ }).click(),
    ])

    await expect.poll(() => ebayRequests.length).toBeGreaterThan(0)
    const url = ebayRequests[0]
    expect(url.hostname).toBe('www.ebay.co.uk')
    expect(url.pathname).toBe('/sch/i.html')
    expect(url.searchParams.get('_nkw')).toBe('vintage teapot')
    expect(url.searchParams.get('LH_Sold')).toBe('1')
    expect(url.searchParams.get('LH_Complete')).toBe('1')
  })

  test('submitting the field searches sold prices', async ({ page, context }) => {
    const ebayRequests = await stubTheInternet(context)
    await page.goto('/')

    await page.getByLabel('Search eBay UK for').fill('vintage teapot')
    await Promise.all([
      context.waitForEvent('page'),
      page.getByLabel('Search eBay UK for').press('Enter'),
    ])

    await expect.poll(() => ebayRequests.length).toBeGreaterThan(0)
    expect(ebayRequests[0].searchParams.get('LH_Sold')).toBe('1')
  })

  /**
   * The app exists to hand you an eBay page, so losing the connection takes the
   * whole point away. It has to say so, and it must not open a tab that cannot
   * load.
   */
  test('says searching needs a connection when the device goes offline', async ({
    page,
    context,
  }) => {
    await stubTheInternet(context)
    await page.goto('/')
    await page.getByLabel('Search eBay UK for').fill('vintage teapot')

    // Exact: the same sentence opens the sr-only announcement as well, and only
    // the visible banner is a bare "You are offline." on its own.
    const banner = page.getByText('You are offline.', { exact: true })

    await context.setOffline(true)
    await expect(banner).toBeVisible()

    const sold = page.getByRole('button', { name: /See sold prices/ })
    await expect(sold).toHaveAttribute('aria-disabled', 'true')
    // force, because Playwright treats aria-disabled as not actionable. That is
    // the point: a real user can still click it, and nothing must happen.
    await sold.click({ force: true })
    expect(context.pages()).toHaveLength(1)

    await context.setOffline(false)
    await expect(banner).toBeHidden()
  })
})

test.describe('installability', () => {
  // The only test that wants a service worker. Everywhere else it is blocked,
  // because it intercepts the lookup calls before page.route ever sees them.
  test.use({ serviceWorkers: 'allow' })

  test('registers a service worker and precaches the shell', async ({ page }) => {
    await page.goto('/')

    const active = await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready
      return Boolean(registration.active)
    })
    expect(active).toBe(true)

    const cached = await page.evaluate(async () => {
      const names = await caches.keys()
      const entries = await Promise.all(names.map(async (name) => (await caches.open(name)).keys()))
      return entries.flat().map((request) => new URL(request.url).pathname)
    })

    expect(cached.some((path) => path.endsWith('.css'))).toBe(true)
    expect(cached.some((path) => path.endsWith('.woff2'))).toBe(true)
    // The 1 MB decoder is deliberately left out of the precache: only Safari
    // and Firefox ever fetch it.
    expect(cached.some((path) => path.endsWith('.wasm'))).toBe(false)
  })
})
