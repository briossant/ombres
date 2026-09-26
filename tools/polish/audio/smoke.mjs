// Essai de l'enregistreur : titre pendant N secondes.
import { launch, newContext } from '../../lib/browser.mjs'
import { installRecorder } from './rec.mjs'
const PORT = process.env.PORT ?? 8825
const OUT = process.argv[2]
const SECS = Number(process.argv[3] ?? 15)
const browser = await launch()
const page = await (await newContext(browser)).newPage()
page.on('console', m => { if (/error|warn/i.test(m.type())) console.log('[console]', m.type(), m.text().slice(0, 200)) })
await page.goto(`http://localhost:${PORT}/?debug=nosave`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000 })
const rec = await installRecorder(page, OUT, { name: 'smoke' })
console.log('info', rec.info)
await page.mouse.click(10, 10)
await new Promise(r => setTimeout(r, SECS * 1000))
console.log(await rec.stop())
await browser.close()
