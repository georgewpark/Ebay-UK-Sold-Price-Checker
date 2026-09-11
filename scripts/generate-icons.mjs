/**
 * Renders the PNG icons from the two SVG sources in public/.
 *
 * Safari ignores an SVG apple-touch-icon and falls back to a screenshot of the
 * page, so the installed iOS icon was never the icon. Android accepts SVG, but
 * enough launchers and share sheets still want a raster that shipping both is
 * cheaper than finding out which ones do not.
 *
 * Run with `npm run icons` after changing either SVG. The output is committed,
 * so a normal build and a normal install never need sharp.
 */
import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'

const publicDir = fileURLToPath(new URL('../public/', import.meta.url))

const square = await readFile(`${publicDir}icon.svg`, 'utf8')
const maskable = await readFile(`${publicDir}icon-maskable.svg`, 'utf8')

/**
 * iOS applies its own rounded-rect mask, so the source corner radius would be
 * clipped twice and leave pale wedges. Square it off for that one file.
 */
const appleSource = square.replace(' rx="14"', '')

const jobs = [
  { name: 'apple-touch-icon.png', svg: appleSource, size: 180 },
  { name: 'icon-192.png', svg: square, size: 192 },
  { name: 'icon-512.png', svg: square, size: 512 },
  { name: 'icon-maskable-192.png', svg: maskable, size: 192 },
  { name: 'icon-maskable-512.png', svg: maskable, size: 512 },
]

for (const { name, svg, size } of jobs) {
  const png = await sharp(Buffer.from(svg), { density: 384 })
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await writeFile(`${publicDir}${name}`, png)
  console.log(`${name.padEnd(26)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} kB`)
}
