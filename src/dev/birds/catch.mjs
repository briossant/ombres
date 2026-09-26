// Capture « à l'événement » sur la page de lookdev des oiseaux (vraie simulation) :
// attend un SimEvent d'un type donné, recadre la caméra sur l'oiseau concerné,
// patiente `delay` ms puis capture. Sert à juger les FX ponctuels en conditions réelles.
//   node src/dev/birds/catch.mjs <sortie.jpg> <type> [--delay=120] [--query="view=flock&..."] [--timeout=40000] [--crop=WxH]
import { launch, newContext, collectLogs } from '../../../tools/lib/browser.mjs'

const [out, type, ...rest] = process.argv.slice(2)
const opt = Object.fromEntries(rest.map(a => { const i = a.indexOf('='); return [a.slice(2, i), a.slice(i + 1)] }))
const delay = +(opt.delay ?? 120)
const query = opt.query ?? 'view=flock&t=30&width=70&policies=hunter,low,hunter,mixed,low,hunter'
const browser = await launch()
const ctx = await newContext(browser, {})
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.goto(`http://localhost:${opt.port ?? 8802}/dev/birds.html?${query}`)
await page.waitForFunction(() => window.__ready === true, null, { timeout: 30000 })
const found = await page.evaluate(
  ({ type, timeout, slow }) =>
    new Promise(resolve => {
      const d = window.__dev
      const off = d.simEvents.on(e => {
        if (e.type !== type) return
        off()
        // Ralenti cosmétique (FX et animation) pour figer un effet bref dans la capture.
        if (slow < 1) {
          d.gameView.timeScale = slow
          d.driver.paused = true
        }
        const slot = e.target >= 0 ? e.target : e.hunter >= 0 ? e.hunter : e.slot
        if (slot !== undefined && slot >= 0) {
          d.follow = slot
          d.snap = true
        }
        resolve(e)
      })
      setTimeout(() => resolve(null), timeout)
    }),
  { type, timeout: +(opt.timeout ?? 40000), slow: +(opt.slow ?? 1) },
)
if (!found) {
  console.log('aucun événement', type)
  await browser.close()
  process.exit(1)
}
await page.waitForTimeout(delay)
await page.screenshot({ path: out, type: 'jpeg', quality: 88 })
console.log(JSON.stringify(found))
const errs = logs.filter(l => /pageerror|error/i.test(l) && !/404/.test(l))
if (errs.length) console.log(errs.slice(-5).join('\n'))
await browser.close()
