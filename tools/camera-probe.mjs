// Sonde de la page de mise en scène : positions écran des ancres (fractions) au fil du temps.
//   node tools/camera-probe.mjs "<requête>" [--samples=6] [--every=1000] [--at="ms:js;…"]
import { launch, newContext } from './lib/browser.mjs'
const [query = '', ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const browser = await launch()
const ctx = await newContext(browser, { w: +(opt.w ?? 1280), h: +(opt.h ?? 720) })
const page = await ctx.newPage()
await page.goto(`http://localhost:${opt.port ?? 8812}/dev/camera.html?${query}`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ready === true, null, { timeout: 60000 })
const at = String(opt.at ?? '').split(';').filter(Boolean).map((s) => { const i = s.indexOf(':'); return { ms: +s.slice(0, i), js: s.slice(i + 1), done: false } })
const t0 = Date.now()
for (let k = 0; k < +(opt.samples ?? 6); k++) {
  while (Date.now() - t0 < k * +(opt.every ?? 1000)) {
    for (const a of at) if (!a.done && Date.now() - t0 >= a.ms) { a.done = true; await page.evaluate(a.js) }
    await page.waitForTimeout(20)
  }
  const r = await page.evaluate(() => {
    const c = window.__cam
    const w = innerWidth, h = innerHeight
    const s = c.gameView.sim
    const birds = (window.__hud ?? null)
    const a = []
    // hudAnchors via le module (exposé par la page)
    for (const b of c.anchors()) if (b.active) a.push(`${(b.x / w).toFixed(2)},${(b.y / h).toFixed(2)}`)
    return `t=${s ? s.sun.t.toFixed(1) : '-'} ${c.state.mode}/${c.state.shot} frame=${(c.state.frame.halfWidth * 2).toFixed(0)}m  ${a.join(' ')}`
  })
  console.log(r)
}
await browser.close()
