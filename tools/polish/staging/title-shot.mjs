// Capture rapide de l'écran titre (mise en page de l'UI) : node --import ./tools/polish/staging/nohmr.mjs tools/polish/staging/title-shot.mjs <sortie.jpg> [attente ms]
import { launch, newContext } from '../../lib/browser.mjs'
const out = process.argv[2]
const wait = Number(process.argv[3] ?? 6000)
const browser = await launch()
const page = await (await newContext(browser)).newPage()
await page.goto(`http://localhost:${process.env.PORT ?? 8831}/?debug=nosave`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000 })
await page.waitForTimeout(wait)
await page.screenshot({ path: out, type: 'jpeg', quality: 85 })
const boxes = await page.evaluate(() => [...document.querySelectorAll('.title *')].filter(e => e.children.length === 0 || e.tagName === 'svg' || e.tagName === 'IMG').map(e => { const r = e.getBoundingClientRect(); return r.width > 30 && r.height > 8 ? `${e.className?.baseVal ?? e.className} ${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : null }).filter(Boolean).slice(0, 40))
console.log(boxes.join('\n'))
await browser.close()
