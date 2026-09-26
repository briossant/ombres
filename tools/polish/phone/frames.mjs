// Cadence d'images (rAF) pendant les N premières ms d'un scénario de la page de dev du téléphone.
//   PORT=8835 node tools/polish/phone/frames.mjs <scénario> [--ms=2000] [--dev="iPhone 15 Pro"]
import { devices } from 'playwright-core'
import { launch } from '../../lib/browser.mjs'
const PORT = Number(process.env.PORT ?? 8835)
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const { defaultBrowserType: _i, ...d } = devices[arg('dev', 'iPhone 15 Pro')]
const b = await launch()
const ctx = await b.newContext({ ...d, viewport: { width: d.viewport.height, height: d.viewport.width } })
const p = await ctx.newPage()
await p.addInitScript(ms => {
  const f = []
  const t0 = performance.now()
  const tick = t => {
    f.push(t)
    if (t - t0 < ms) requestAnimationFrame(tick)
    else window.__frames = f
  }
  requestAnimationFrame(tick)
}, Number(arg('ms', '2000')))
await p.goto(`http://localhost:${PORT}/dev/phone.html?s=${process.argv[2]}&lang=fr&color=3`, { waitUntil: 'load' })
await p.waitForFunction(() => window.__frames, null, { timeout: 20000 })
const f = await p.evaluate(() => window.__frames)
const dt = f.slice(1).map((t, i) => t - f[i]).sort((a, b) => a - b)
const q = k => dt[Math.min(dt.length - 1, Math.floor(dt.length * k))].toFixed(1)
console.log(process.argv[2], `images ${f.length}`, `dt médian ${q(0.5)} ms`, `p95 ${q(0.95)} ms`, `max ${dt.at(-1).toFixed(1)} ms`)
await b.close()
