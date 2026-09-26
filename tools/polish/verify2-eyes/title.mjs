// Revue DA : chargement → titre, rafale d'images sur toute la boucle de cinématique.
//   PORT=8821 node tools/polish/art/title.mjs [--secs=70] [--every=1500] [--name=title] [--w=1920 --h=1080]
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, problems, arg } from '../../e2e/qa/lib.mjs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const NAME = arg('name', 'title')
const SECS = Number(arg('secs', '70'))
const EVERY = Number(arg('every', '1500'))
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const dir = join(import.meta.dirname, '../../../shots/polish2/verify-eyes', NAME)
mkdirSync(dir, { recursive: true })
const browser = await launch()
const ctx = await newContext(browser, { w: W, h: H })
const page = await ctx.newPage()
const logs = collectLogs(page)
const t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(1)
await page.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'commit' })
let n = 0
const shot = async label => {
  const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  return f
}
for (let i = 0; i < 12; i++) {
  await sleep(i === 0 ? 400 : 500)
  const sc = await page.evaluate(() => window.__ombres?.useUi.getState().screen).catch(() => null)
  await shot(`loading-${stamp()}`)
  if (sc === 'title') break
}
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
console.log(`titre à ${stamp()} s`)
const tStart = Date.now()
while (Date.now() - tStart < SECS * 1000) {
  const info = await page.evaluate(() => {
    const o = window.__ombres
    const st = o.runner.sim?.state
    return { t: st?.sun.t?.toFixed(1), shot: o.cameraCue && (window.__ombres.cameraState?.shot ?? '') }
  }).catch(() => ({}))
  await shot(`title-${stamp()}-t${info.t}`)
  await sleep(EVERY)
}
await page.keyboard.press('KeyX')
await sleep(900)
await shot('menu')
const errs = problems(logs)
console.log(errs.length ? `PROBLÈMES :\n${errs.join('\n')}` : 'console propre')
await browser.close()
