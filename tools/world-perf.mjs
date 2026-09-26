// Banc GPU de la page de lookdev du monde : relève window.__timings (médianes glissantes
// par passe, timer queries) pendant --secs secondes et garde, par passe, le MINIMUM des
// médianes observées : c'est l'estimation la moins polluée par les autres charges du GPU
// partagé. Affiche aussi la charge GPU (gpu_busy_percent) pendant la mesure.
//   node tools/world-perf.mjs "kf=16&q=high" "kf=3.5&q=high" [--secs=12] [--port=8801]
import { readFileSync } from 'node:fs'
import { launch, newContext } from './lib/browser.mjs'

const args = process.argv.slice(2)
const opt = Object.fromEntries(args.filter((a) => a.startsWith('--')).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.slice(2), true] : [a.slice(2, i), a.slice(i + 1)] }))
const queries = args.filter((a) => !a.startsWith('--'))
const port = opt.port ?? 8801
const secs = +(opt.secs ?? 12)
const busy = () => { try { return +readFileSync('/sys/class/drm/card1/device/gpu_busy_percent', 'utf8') } catch { return -1 } }

const browser = await launch({ noVsync: !!opt["no-vsync"] })
const ctx = await newContext(browser, { w: 1920, h: 1080 })
for (const q of queries.length ? queries : ['kf=16&q=high']) {
  const page = await ctx.newPage()
  await page.goto(`http://localhost:${port}/dev/world.html?${q}&debug`, { waitUntil: 'load' })
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 }).catch(() => {})
  const best = {}
  const loads = []
  let info = null
  for (let s = 0; s < secs; s++) {
    await page.waitForTimeout(1000)
    loads.push(busy())
    const t = await page.evaluate(() => window.__timings)
    info = await page.evaluate(() => window.__nprInfo)
    if (!t) continue
    for (const [k, v] of Object.entries(t)) best[k] = Math.min(best[k] ?? Infinity, v)
  }
  const fmt = Object.entries(best).map(([k, v]) => `${k} ${v.toFixed(2)}`).join(' · ')
  console.log(`${q.padEnd(28)} ${fmt}  | calls ${info?.calls} tris ${info?.triangles} | gpu busy ${loads.join(',')}`)
  await page.close()
}
await browser.close()
