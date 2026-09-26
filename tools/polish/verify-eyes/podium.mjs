// Regard final : podium rapide (partie accélérée d'une manche) à N oiseaux, captures du plan pur
// et du panneau. Sorties dans shots/polish/verify-eyes/podium-<n>/.
//   PORT=8843 node --import ./tools/polish/staging/nohmr.mjs tools/polish/verify-eyes/podium.mjs [--n=4] [--w=1920 --h=1080]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, sleep, waitFor, arg, collectLogs, problems } from '../../e2e/qa/lib.mjs'

const N = Number(arg('n', '4'))
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const dir = join(import.meta.dirname, '../../../shots/polish/verify-eyes', `podium-${N}-${W}`)
mkdirSync(dir, { recursive: true })
const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.goto(`${ORIGIN}/?debug=fast,nosave&speed=10`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await page.evaluate(n => {
  const r = window.__ombres.runner
  r.enterLobby()
  r.joinLocal(1)
  while (r.roster.bots().length < n - 1) r.addBot(null, 1)
  r.setMatchSetting('rounds', 1)
  r.startMatch()
}, N)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 90000, 'résultats')
await sleep(2500)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 30000, 'podium')
for (const ms of [900, 2000, 5000, 8000]) {
  await sleep(ms === 900 ? 900 : { 2000: 1100, 5000: 3000, 8000: 3000 }[ms])
  await page.screenshot({ path: join(dir, `podium-${ms}.jpg`), type: 'jpeg', quality: 85 })
}
console.log(dir, JSON.stringify(problems(logs).slice(0, 5)))
await browser.close()
