// Transition fin de partie : résultats de la dernière manche → caméra du podium → panneau.
// Partie d'une manche, accélérée. Captures pendant la transition.
//   node tools/e2e/podium.mjs [--speed=8] [--bots=5]
import { ORIGIN, launch, newContext, collectLogs, shotDir, sleep, waitFor, errorsOf } from './lib.mjs'
import { join } from 'node:path'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SPEED = Number(arg('speed') ?? 8)
const BOTS = Number(arg('bots') ?? 5)
const dir = shotDir('podium')
let n = 0
const snap = async (page, label) => page.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${label}.jpg`), type: 'jpeg', quality: 82 })
const browser = await launch()
const page = await (await newContext(browser)).newPage()
const logs = collectLogs(page)
await page.goto(`${ORIGIN}/?debug=fast&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await page.evaluate(n => {
  const r = window.__ombres.runner
  r.enterLobby()
  r.joinLocal(1)
  while (r.roster.bots().length < n) r.addBot(null, 1)
  r.setMatchSetting('rounds', 1)
  r.startMatch()
}, BOTS)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 60000, 'résultats')
await sleep(3900)
await snap(page, 'last-results')
await page.keyboard.press('Enter')
for (const ms of [150, 600, 1200, 2000, 3000, 4500]) {
  await sleep(ms - (n > 1 ? 0 : 0))
  await snap(page, `transition-${ms}`)
}
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 10000, 'podium')
await sleep(2500)
await snap(page, 'podium')
console.log('erreurs', errorsOf(logs))
await browser.close()
