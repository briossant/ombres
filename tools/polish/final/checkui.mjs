// Passe finale : contrôle à l'image des petits correctifs d'UI (réglages : flèches dans l'ordre de
// W A S D ; salon : anneau du mannequin sous les étiquettes des joueurs). Sorties : shots/polish3/final/checkui/.
//   PORT=8873 node --import ./tools/polish/staging/nohmr.mjs tools/polish/final/checkui.mjs [--lang=fr]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, problems, arg, presetSettings } from '../../e2e/qa/lib.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'

const LANG = arg('lang', 'fr')
const dir = join(import.meta.dirname, '../../../shots/polish3/final/checkui')
mkdirSync(dir, { recursive: true })
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: LANG })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(1500)
await pc.evaluate(() => window.__ombres.useUi.setState({ overlay: 'settings' }))
await sleep(900)
await pc.screenshot({ path: join(dir, `settings-${LANG}.jpg`), type: 'jpeg', quality: 85 })
await pc.keyboard.press('Escape')
await sleep(600)
await pc.keyboard.press('Enter')
await sleep(500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await sleep(800)
await pc.keyboard.press('Space')
await sleep(1200)
const kb = await pc.evaluate(() => window.__ombres.useRoster.getState().slots.find(s => s.kind === 'keyboard')?.slot ?? -1)
const pilot = new KeyboardPilot(pc, 1, () => kb, 3)
await pilot.start()
for (let i = 0; i < 8; i++) {
  await sleep(1500)
  await pc.screenshot({ path: join(dir, `lobby-${i}.jpg`), type: 'jpeg', quality: 80 })
}
await pilot.stop()
const p = problems(logs)
console.log(p.length ? `PROBLÈMES : ${p.slice(0, 10).join(' | ')}` : 'console propre')
await browser.close()
