// Regard final vague 2 : position de l'anneau de couronne (fx « crownRing ») en gros plan au titre.
// Émet un événement « crown » pour chaque oiseau de la démo, puis capture 0,12 s et 0,3 s après :
// en gros plan (envergure > 230 px), l'anneau doit se contracter sur la capuche du cavalier, pas
// flotter ~3 m au-dessus (ancien repli). Sorties : shots/polish2/verify-eyes/crownring/.
//   PORT=8863 node --import ./tools/polish/staging/nohmr.mjs tools/polish/verify2-eyes/crownring.mjs [--n=8]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, problems, arg } from '../../e2e/qa/lib.mjs'

const N = Number(arg('n', '8'))
const dir = join(import.meta.dirname, '../../../shots/polish2/verify-eyes', arg('name', 'crownring'))
mkdirSync(dir, { recursive: true })
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(3000)
for (let i = 0; i < N; i++) {
  await page.evaluate(() => {
    const o = window.__ombres
    for (const b of o.runner.sim?.state.birds ?? []) o.simEvents.emit({ type: 'crown', slot: b.slot, prev: -1 })
  })
  for (const ms of [120, 300]) {
    await sleep(ms === 120 ? 120 : 180)
    await page.screenshot({ path: join(dir, `${String(i).padStart(2, '0')}-${ms}.jpg`), type: 'jpeg', quality: 85 })
  }
  await sleep(2600)
}
const p = problems(logs)
console.log(dir, p.length ? JSON.stringify(p.slice(0, 5)) : 'console propre')
await browser.close()
