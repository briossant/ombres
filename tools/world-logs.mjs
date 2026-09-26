// Charge une page et affiche TOUS les messages de console (erreurs de compilation
// de shaders comprises), dédupliqués. Usage : node tools/world-logs.mjs <url> [--wait=3000]
import { launch, newContext } from './lib/browser.mjs'

const [url, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), true] : [a.slice(2, i), a.slice(i + 1)] }))
const browser = await launch()
const ctx = await newContext(browser, { w: +(opt.w ?? 1280), h: +(opt.h ?? 720) })
const page = await ctx.newPage()
const seen = new Map()
page.on('console', (m) => { const k = `[${m.type()}] ${m.text()}`; seen.set(k, (seen.get(k) ?? 0) + 1) })
page.on('pageerror', (e) => { const k = `[pageerror] ${e.message}\n${e.stack ?? ''}`; seen.set(k, (seen.get(k) ?? 0) + 1) })
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(+(opt.wait ?? 3000))
for (const [k, n] of seen) console.log(n > 1 ? `(${n}×) ${k}` : k)
await browser.close()
