/**
 * Builds the fake camera feed the end-to-end test scans.
 *
 * Chromium can take a Y4M file as a webcam with
 * --use-file-for-fake-video-capture, which lets the real decoder read a real
 * barcode in a real browser. Y4M is uncompressed, so the file is generated
 * rather than committed, and there is no ffmpeg in the toolchain.
 *
 * Run with `npm run fixtures`. The e2e script does it for you.
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

/** 4:3, matching the viewfinder, so nothing is cropped away by object-cover. */
const WIDTH = 640
const HEIGHT = 480
const FRAMES = 2

/** Heinz Baked Beans. The 13th digit is the checksum, verified below. */
export const BARCODE = '5000157024671'

const L = [
  '0001101',
  '0011001',
  '0010011',
  '0111101',
  '0100011',
  '0110001',
  '0101111',
  '0111011',
  '0110111',
  '0001011',
]
const G = [
  '0100111',
  '0110011',
  '0011011',
  '0100001',
  '0011101',
  '0111001',
  '0000101',
  '0010001',
  '0001001',
  '0010111',
]
const R = [
  '1110010',
  '1100110',
  '1101100',
  '1000010',
  '1011100',
  '1001110',
  '1010000',
  '1000100',
  '1001000',
  '1110100',
]

/** Which of the first six digits use the G table, chosen by the leading digit. */
const PARITY = [
  'LLLLLL',
  'LLGLGG',
  'LLGGLG',
  'LLGGGL',
  'LGLLGG',
  'LGGLLG',
  'LGGGLL',
  'LGLGLG',
  'LGLGGL',
  'LGGLGL',
]

function checkDigit(twelve) {
  const sum = [...twelve].reduce((total, digit, i) => total + Number(digit) * (i % 2 ? 3 : 1), 0)
  return (10 - (sum % 10)) % 10
}

/** The 95 modules of an EAN-13, as a string of 0s (white) and 1s (black). */
export function encodeEan13(code) {
  if (!/^\d{13}$/.test(code)) throw new Error(`Not 13 digits: ${code}`)
  if (checkDigit(code.slice(0, 12)) !== Number(code[12])) {
    throw new Error(`Bad checksum on ${code}`)
  }

  const digits = [...code].map(Number)
  const parity = PARITY[digits[0]]

  let modules = '101'
  for (let i = 0; i < 6; i += 1) {
    modules += (parity[i] === 'L' ? L : G)[digits[i + 1]]
  }
  modules += '01010'
  for (let i = 7; i < 13; i += 1) {
    modules += R[digits[i]]
  }
  return modules + '101'
}

/** A white frame with the barcode centred, as an 8-bit luma plane. */
function drawLuma(modules) {
  const luma = new Uint8Array(WIDTH * HEIGHT).fill(235)

  const moduleWidth = 4
  const barHeight = 170
  const left = Math.round((WIDTH - modules.length * moduleWidth) / 2)
  const top = Math.round((HEIGHT - barHeight) / 2)

  for (let m = 0; m < modules.length; m += 1) {
    if (modules[m] === '0') continue
    for (let x = left + m * moduleWidth; x < left + (m + 1) * moduleWidth; x += 1) {
      for (let y = top; y < top + barHeight; y += 1) {
        luma[y * WIDTH + x] = 16
      }
    }
  }
  return luma
}

const modules = encodeEan13(BARCODE)

// Reticle check: 12% in from each side, so the barcode must sit well inside it.
const barcodeWidth = modules.length * 4
if (barcodeWidth > WIDTH * 0.76) {
  throw new Error('Barcode is wider than the scan reticle, so it would never be read')
}

const luma = drawLuma(modules)
// Greyscale, so both chroma planes are neutral at every pixel.
const chroma = new Uint8Array((WIDTH / 2) * (HEIGHT / 2)).fill(128)

const parts = [Buffer.from(`YUV4MPEG2 W${WIDTH} H${HEIGHT} F25:1 Ip A1:1 C420mpeg2\n`)]
for (let frame = 0; frame < FRAMES; frame += 1) {
  parts.push(Buffer.from('FRAME\n'), Buffer.from(luma), Buffer.from(chroma), Buffer.from(chroma))
}

const dir = fileURLToPath(new URL('../e2e/fixtures/', import.meta.url))
await mkdir(dir, { recursive: true })
await writeFile(`${dir}barcode.y4m`, Buffer.concat(parts))

const bytes = parts.reduce((total, part) => total + part.length, 0)
console.log(
  `e2e/fixtures/barcode.y4m  ${BARCODE}  ${WIDTH}x${HEIGHT}  ${(bytes / 1024).toFixed(0)} kB`,
)
