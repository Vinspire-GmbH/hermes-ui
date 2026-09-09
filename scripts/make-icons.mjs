/*
 * Draw the app icons.
 *
 * No image tooling is assumed to be on the machine — no ImageMagick, no
 * rsvg-convert, no sharp — so the PNGs are written byte by byte: raw RGBA
 * scanlines, deflated with zlib, wrapped in the three chunks a PNG needs.
 * That is about forty lines and has no dependencies, which beats adding a
 * native module to the build for three static files.
 *
 *   node scripts/make-icons.mjs
 */
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'
import { crc32 } from 'node:zlib'

const VOID = [5, 7, 13]
const CYAN = [34, 211, 238]
const MAGENTA = [232, 121, 249]

function draw(size, { maskable = false } = {}) {
  const px = Buffer.alloc(size * size * 4)
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= size || y >= size) return
    const i = (y * size + x) * 4
    // Straight alpha compositing over whatever is already there.
    const src = a / 255
    px[i] = px[i] * (1 - src) + r * src
    px[i + 1] = px[i + 1] * (1 - src) + g * src
    px[i + 2] = px[i + 2] * (1 - src) + b * src
    px[i + 3] = Math.max(px[i + 3], a)
  }

  const inset = maskable ? Math.round(size * 0.12) : 0
  const r = Math.round(size * (maskable ? 0.5 : 0.22))
  const cx = size / 2, cy = size / 2

  // Ground: rounded square (a full circle when maskable, so the safe zone
  // survives whatever mask the launcher applies).
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y, size, r, inset)) continue
      // A faint diagonal gradient, so it does not read as flat black.
      const t = (x + y) / (2 * size)
      set(x, y, [
        VOID[0] + t * 14,
        VOID[1] + t * 22,
        VOID[2] + t * 38,
      ])
    }
  }

  // Grid, the same motif as the app background.
  const step = Math.max(4, Math.round(size / 16))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!inside(x, y, size, r, inset)) continue
      if (x % step === 0 || y % step === 0) set(x, y, [30, 44, 68], 90)
    }
  }

  // The glyph: an angular H, drawn as three bars, with a magenta offset that
  // suggests a chromatic split without needing a blur.
  const barW = Math.round(size * 0.075)
  const h = Math.round(size * 0.42)
  const gap = Math.round(size * 0.13)
  const top = Math.round(cy - h / 2)
  const shift = Math.max(1, Math.round(size * 0.012))

  const bars = (colour, dx, alpha) => {
    rect(cx - gap - barW + dx, top, barW, h, colour, alpha)
    rect(cx + gap + dx, top, barW, h, colour, alpha)
    rect(cx - gap - barW + dx, Math.round(cy - barW / 2), 2 * gap + 2 * barW, barW, colour, alpha)
  }
  function rect(x0, y0, w, hh, colour, alpha) {
    for (let y = Math.round(y0); y < y0 + hh; y++) {
      for (let x = Math.round(x0); x < x0 + w; x++) {
        if (!inside(x, y, size, r, inset)) continue
        set(x, y, colour, alpha)
      }
    }
  }
  bars(MAGENTA, shift, 150)
  bars(CYAN, 0, 255)

  return encode(size, px)
}

function inside(x, y, size, r, inset) {
  const a = inset, b = size - inset - 1
  if (x < a || y < a || x > b || y > b) return false
  const corners = [[a + r, a + r], [b - r, a + r], [a + r, b - r], [b - r, b - r]]
  for (const [ccx, ccy] of corners) {
    const outX = (ccx === a + r && x < ccx) || (ccx === b - r && x > ccx)
    const outY = (ccy === a + r && y < ccy) || (ccy === b - r && y > ccy)
    if (outX && outY) return (x - ccx) ** 2 + (y - ccy) ** 2 <= r * r
  }
  return true
}

function encode(size, rgba) {
  // One filter byte (0 = none) in front of every scanline.
  const raw = Buffer.alloc(size * (size * 4 + 1))
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0)
  ihdr.writeUInt32BE(size, 4)
  ihdr[8] = 8    // bit depth
  ihdr[9] = 6    // colour type: RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length, 0)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body) >>> 0, 0)
  return Buffer.concat([length, body, crc])
}

writeFileSync('public/icon-192.png', draw(192))
writeFileSync('public/icon-512.png', draw(512))
writeFileSync('public/icon-maskable-512.png', draw(512, { maskable: true }))
writeFileSync('public/favicon.png', draw(64))
console.log('icons written')
