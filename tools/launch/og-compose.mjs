// Compose l'image d'aperçu de lien (Open Graph / carte X) : une vraie image du jeu
// (tools/launch/og-capture.mjs) + le logotype OMBRES + l'accroche, en cases de BD.
//   node tools/launch/og-compose.mjs <capture.jpg> [out=public/og.jpg] [--quality=82]
// Sortie 1200 × 630, JPEG < 300 Ko (vérifié ici).
import { readFileSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { launch } from '../lib/browser.mjs'
import { logoSvg } from './logo-svg.mjs'

const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
const opt = Object.fromEntries(process.argv.slice(2).filter(a => a.startsWith('--')).map(a => a.slice(2).split('=')))
const [bg, out = 'public/og.jpg'] = args
if (!bg) {
  console.error('usage: node tools/launch/og-compose.mjs <capture.jpg> [out.jpg]')
  process.exit(2)
}
const root = resolve(import.meta.dirname, '../..')
// polices en data: URI (une page setContent ne peut pas lire file://)
const font = f => `data:font/woff2;base64,${readFileSync(join(root, 'public/fonts', f)).toString('base64')}`
const bgData = `data:image/jpeg;base64,${readFileSync(resolve(bg)).toString('base64')}`

const html = `<!doctype html><html><head><meta charset="utf-8"><style>
@font-face{font-family:'Julius Sans One';src:url(${font('julius-sans-one-400-latin.woff2')}) format('woff2')}
@font-face{font-family:'Patrick Hand SC';src:url(${font('patrick-hand-sc-400-latin.woff2')}) format('woff2')}
*{box-sizing:border-box;margin:0}
html,body{width:1200px;height:630px;overflow:hidden;background:#f7f0e3}
.bg{position:absolute;inset:0;background:url(${bgData}) center/cover}
/* léger voile papier à gauche : le logo et l'accroche se lisent sans masquer la scène */
.veil{position:absolute;inset:0;background:linear-gradient(90deg,rgb(247 240 227/.34),rgb(247 240 227/0) 52%)}
.logo{position:absolute;left:30px;top:26px;width:600px}
.logo svg{display:block;width:100%;height:auto}
.rec{position:absolute;left:52px;top:246px;background:#f7f0e3;border:2px solid #2b1d23;border-radius:3px;
  box-shadow:5px 5px 0 rgb(161 142 161/.6);padding:10px 20px 8px;font:36px/1.12 'Patrick Hand SC';color:#2b1d23}
.rec b{font-weight:400;display:block}
.rec small{display:block;font-size:26px;opacity:.8;margin-top:2px}
.tag{position:absolute;left:52px;bottom:38px;display:flex;gap:14px}
.chip{background:#2b1d23;color:#f7f0e3;border:2px solid #2b1d23;border-radius:3px;
  box-shadow:4px 4px 0 rgb(43 29 35/.28);padding:9px 16px 7px;font:27px/1 'Patrick Hand SC'}
.chip--sun{background:#fff2c3;color:#2b1d23}
</style></head><body>
<div class="bg"></div><div class="veil"></div>
<div class="logo">${logoSvg({ elevDeg: 13, az: 1.05, id: 'og', sunY: 42 })}</div>
<div class="rec"><b>Your shadow paints the desert.</b><small>At nightfall, the biggest territory wins.</small></div>
<div class="tag"><span class="chip">1–12 players · phones are the controllers</span><span class="chip chip--sun">Free, in the browser</span></div>
</body></html>`

const browser = await launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })
await page.setContent(html, { waitUntil: 'load' })
await page.evaluate(() => document.fonts.ready)
await page.waitForTimeout(200)
const q = Number(opt.quality ?? 84)
await page.screenshot({ path: out, type: 'jpeg', quality: q })
await browser.close()
const kb = statSync(out).size / 1024
console.log(JSON.stringify({ out, kb: +kb.toFixed(1), ok: kb < 300 }))
