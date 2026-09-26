// Correcteur birds (polish vague 2) : oiseau caché au soleil bas, à la taille du jeu à 12.
// Page de lookdev (planche des états, ?view=states) vue de loin (envergure ≈ 60-70 px), au
// couchant : OKLCH des bandes (sonde birdAnchors.screen) et du dos (ancre chest) de chaque
// oiseau, pour comparer l'oiseau caché (slot 10) aux autres.
//   PORT=8853 node tools/polish/fix2-birds/hidden.mjs [--elev=5] [--dist=300] [--name=hidden-e5]
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const PORT = process.env.PORT ?? 8853
const ELEV = arg('elev', '5')
const DIST = arg('dist', '300')
const NAME = arg('name', `hidden-e${ELEV}`)
const dir = join(import.meta.dirname, '../../../shots/polish2/birds', NAME)
mkdirSync(dir, { recursive: true })
const palette = JSON.parse(readFileSync(join(import.meta.dirname, '../../../src/shared/palette.json'), 'utf8'))
const STATES = ['glide', 'low', 'climb', 'descend', 'bank', 'dive', 'threat', 'flap', 'stun', 'immune', 'hidden', 'locked']

const s2l = c => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
function oklab(r, g, b) {
  r = s2l(r)
  g = s2l(g)
  b = s2l(b)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}
function sample(raw, W, x, y) {
  let L = 0
  let A = 0
  let B = 0
  for (let j = -1; j <= 1; j++)
    for (let i = -1; i <= 1; i++) {
      const o = ((Math.round(y) + j) * W + Math.round(x) + i) * 3
      const [l, a, b] = oklab(raw[o], raw[o + 1], raw[o + 2])
      L += l / 9
      A += a / 9
      B += b / 9
    }
  return { L, C: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 }
}

const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/dev/birds.html?view=states&elev=${ELEV}&dist=${DIST}&labels=0&freeze=1`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__dev, null, { timeout: 120000 })
await page.evaluate(async () => {
  const e = performance.getEntriesByType('resource').filter(r => r.name.includes('/src/host/render/bird/anchors.ts'))
  const u = e.length ? new URL(e[e.length - 1].name) : null
  window.__A = (await import(u ? u.pathname + u.search : '/src/host/render/bird/anchors.ts')).birdAnchors
  window.__A.screen = new Float32Array(72)
})
await new Promise(r => setTimeout(r, 4000))
const P = await page.evaluate(() => Array.from(window.__A.screen))
const file = join(dir, 'states.png')
await page.screenshot({ path: file, type: 'png' })
await browser.close()
const raw = execFileSync('magick', [file, '-depth', '8', 'rgb:-'], { maxBuffer: 64 << 20 })
const px = (i, k) => [((P[i * 6 + k * 2] + 1) / 2) * 1920, ((1 - P[i * 6 + k * 2 + 1]) / 2) * 1080]
const out = [`# États au couchant (paletteElev ${ELEV}), vue de loin (dist ${DIST})`]
const tiles = []
for (let i = 0; i < 12; i++) {
  const pl = palette.players[i]
  const bands = [0, 1].map(k => sample(raw, 1920, ...px(i, k)))
  const [cx, cy] = px(i, 2)
  const back = sample(raw, 1920, cx, cy)
  out.push(`${STATES[i].padEnd(8)} ${pl.fr.padEnd(8)} bandes ${bands.map(b => `L ${b.L.toFixed(2)} C ${b.C.toFixed(3)} h ${b.h.toFixed(0)}`).join(' | ')}  ; dos L ${back.L.toFixed(2)} C ${back.C.toFixed(3)}`)
  const t = join(dir, `.t${i}.png`)
  execFileSync('magick', [file, '-crop', `100x100+${Math.round(cx - 50)}+${Math.round(cy - 50)}`, '+repage', '-filter', 'point', '-resize', '300%', '-gravity', 'south', '-background', '#2b1d23', '-splice', '0x22', '-fill', '#f7f0e3', '-pointsize', '16', '-annotate', '+0+2', `${STATES[i]} ${pl.fr}`, t])
  tiles.push(t)
}
execFileSync('magick', ['(', ...tiles.slice(0, 6), '+append', ')', '(', ...tiles.slice(6), '+append', ')', '-append', '-quality', '90', join(dir, 'crops.jpg')])
writeFileSync(join(dir, 'bands.txt'), out.join('\n') + '\n')
console.log(out.join('\n'))
