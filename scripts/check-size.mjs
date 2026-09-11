/**
 * A bundle budget, so the day a dependency doubles the download is the day CI
 * says so rather than the day someone notices the app feels slow.
 *
 * Compressed sizes, because that is what goes over the wire. The WASM decoder
 * is measured separately: it is large by nature, only Safari and Firefox fetch
 * it, and holding it to the same bar as the app code would be meaningless.
 */
import { gzipSync } from 'node:zlib'
import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

const assets = fileURLToPath(new URL('../dist/assets/', import.meta.url))

/** Roughly 15% headroom over today's numbers. Raise deliberately, not casually. */
const BUDGETS = [
  { label: 'app javascript', match: /^index-.*\.js$/, limit: 90 },
  { label: 'stylesheet', match: /^index-.*\.css$/, limit: 8 },
  { label: 'decoder worker', match: /^decoder\.worker-.*\.js$/, limit: 4 },
  { label: 'wasm ponyfill', match: /^ponyfill-.*\.js$/, limit: 20 },
  { label: 'decoder binary', match: /\.wasm$/, limit: 520 },
]

const files = await readdir(assets)
let failed = false

for (const { label, match, limit } of BUDGETS) {
  const name = files.find((file) => match.test(file))
  if (!name) {
    console.error(`✗ ${label}: no file matched ${String(match)}`)
    failed = true
    continue
  }

  const kb = gzipSync(await readFile(assets + name)).length / 1024
  const ok = kb <= limit
  failed ||= !ok
  console.log(
    `${ok ? '✓' : '✗'} ${label.padEnd(16)} ${kb.toFixed(1).padStart(6)} kB gzip  (budget ${limit} kB)  ${name}`,
  )
}

if (failed) {
  console.error('\nBundle budget exceeded. Trim it, or raise the budget on purpose.')
  process.exit(1)
}
