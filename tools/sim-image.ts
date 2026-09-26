// Mini raster RGB + encodeur PNG (zlib de Node), pour les vues de dessus de la
// simulation (tools/sim-render.ts). Aucune dépendance.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

export type RGB = [number, number, number]

export function hex(h: string): RGB {
  const v = parseInt(h.replace('#', ''), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function mix(a: RGB, b: RGB, t: number): RGB {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
}

export class Image {
  readonly data: Uint8Array
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.data = new Uint8Array(w * h * 3)
  }
  set(x: number, y: number, c: RGB, alpha = 1): void {
    x = Math.round(x)
    y = Math.round(y)
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return
    const o = (y * this.w + x) * 3
    if (alpha >= 1) {
      this.data[o] = c[0]
      this.data[o + 1] = c[1]
      this.data[o + 2] = c[2]
    } else {
      this.data[o] = this.data[o]! + (c[0] - this.data[o]!) * alpha
      this.data[o + 1] = this.data[o + 1]! + (c[1] - this.data[o + 1]!) * alpha
      this.data[o + 2] = this.data[o + 2]! + (c[2] - this.data[o + 2]!) * alpha
    }
  }
  get(x: number, y: number): RGB {
    const o = (y * this.w + x) * 3
    return [this.data[o]!, this.data[o + 1]!, this.data[o + 2]!]
  }
  fill(c: RGB): void {
    for (let i = 0; i < this.w * this.h; i++) {
      this.data[i * 3] = c[0]
      this.data[i * 3 + 1] = c[1]
      this.data[i * 3 + 2] = c[2]
    }
  }
  line(x0: number, y0: number, x1: number, y1: number, c: RGB, width = 1, alpha = 1, dash = 0): void {
    const len = Math.hypot(x1 - x0, y1 - y0)
    const n = Math.max(1, Math.ceil(len * 2))
    for (let i = 0; i <= n; i++) {
      if (dash > 0 && Math.floor((i / n) * len / dash) % 2 === 1) continue
      const x = x0 + ((x1 - x0) * i) / n
      const y = y0 + ((y1 - y0) * i) / n
      if (width <= 1) this.set(x, y, c, alpha)
      else this.disc(x, y, width / 2, c, alpha)
    }
  }
  disc(cx: number, cy: number, r: number, c: RGB, alpha = 1): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++)
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) if ((x - cx) ** 2 + (y - cy) ** 2 <= r * r) this.set(x, y, c, alpha)
  }
  circle(cx: number, cy: number, r: number, c: RGB, width = 1, alpha = 1): void {
    const n = Math.max(16, Math.ceil(r * 6))
    for (let i = 0; i < n; i++) {
      const a0 = (i / n) * Math.PI * 2
      const a1 = ((i + 1) / n) * Math.PI * 2
      this.line(cx + r * Math.cos(a0), cy + r * Math.sin(a0), cx + r * Math.cos(a1), cy + r * Math.sin(a1), c, width, alpha)
    }
  }
  /** Texte en police bitmap 5×7 (majuscules, chiffres, ponctuation simple). */
  text(x: number, y: number, s: string, c: RGB, scale = 2): void {
    let cx = x
    for (const ch of s.toUpperCase()) {
      const g = FONT[ch] ?? FONT['?']!
      for (let row = 0; row < 7; row++)
        for (let col = 0; col < 5; col++)
          if ((g[row]! >> (4 - col)) & 1) for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) this.set(cx + col * scale + dx, y + row * scale + dy, c)
      cx += 6 * scale
    }
  }
  savePng(path: string): void {
    const raw = Buffer.alloc((this.w * 3 + 1) * this.h)
    for (let y = 0; y < this.h; y++) {
      raw[y * (this.w * 3 + 1)] = 0
      Buffer.from(this.data.buffer, this.data.byteOffset + y * this.w * 3, this.w * 3).copy(raw, y * (this.w * 3 + 1) + 1)
    }
    const chunk = (type: string, body: Buffer) => {
      const len = Buffer.alloc(4)
      len.writeUInt32BE(body.length)
      const tb = Buffer.concat([Buffer.from(type, 'ascii'), body])
      const crc = Buffer.alloc(4)
      crc.writeUInt32BE(crc32(tb) >>> 0)
      return Buffer.concat([len, tb, crc])
    }
    const ihdr = Buffer.alloc(13)
    ihdr.writeUInt32BE(this.w, 0)
    ihdr.writeUInt32BE(this.h, 4)
    ihdr[8] = 8
    ihdr[9] = 2
    ihdr[10] = 0
    ihdr[11] = 0
    ihdr[12] = 0
    const png = Buffer.concat([
      Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
      chunk('IHDR', ihdr),
      chunk('IDAT', deflateSync(raw, { level: 6 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
    writeFileSync(path, png)
  }
}

const CRC_TABLE = (() => {
  const t = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c
  }
  return t
})()
function crc32(b: Buffer): number {
  let c = -1
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]!) & 255]! ^ (c >>> 8)
  return c ^ -1
}

// Police 5×7 minimale
const FONT: Record<string, number[]> = {
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31], '3': [31, 2, 4, 2, 1, 17, 14],
  '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14], '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8],
  '8': [14, 17, 17, 14, 17, 17, 14], '9': [14, 17, 17, 15, 1, 2, 12], ' ': [0, 0, 0, 0, 0, 0, 0], '.': [0, 0, 0, 0, 0, 12, 12],
  ',': [0, 0, 0, 0, 12, 4, 8], ':': [0, 12, 12, 0, 12, 12, 0], '-': [0, 0, 0, 31, 0, 0, 0], '%': [24, 25, 2, 4, 8, 19, 3],
  '/': [1, 1, 2, 4, 8, 16, 16], '=': [0, 0, 31, 0, 31, 0, 0], '?': [14, 17, 1, 2, 4, 0, 4], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14], D: [28, 18, 17, 17, 17, 18, 28],
  E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16], G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17],
  I: [14, 4, 4, 4, 4, 4, 14], J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14], P: [30, 17, 17, 30, 16, 16, 16],
  Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17], S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4],
  U: [17, 17, 17, 17, 17, 17, 14], V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
}
