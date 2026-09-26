// Passe finale (copie de verify2-eyes/twelve.mjs) : 12 oiseaux (2 joueurs clavier + 10 bots), une manche à vitesse réelle.
// Lisibilité des oiseaux à distance, étiquettes, bulles, palette du couchant, daltonien à mi-manche.
//   PORT=8821 node tools/polish/art/twelve.mjs [--every=4000] [--name=twelve] [--q=high]
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, state, problems, arg, presetSettings } from '../../e2e/qa/lib.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const EVERY = Number(arg('every', '4000'))
const NAME = arg('name', 'twelve')
const dir = join(import.meta.dirname, '../../../shots/polish3/final', NAME)
mkdirSync(dir, { recursive: true })
let n = 0
const shot = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
}
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: 'fr', quality: arg('q', 'high') })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(1500)
await pc.keyboard.press('Enter')
await sleep(500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await sleep(800)
await pc.keyboard.press('Space')
await sleep(600)
await pc.keyboard.press('AltRight')
await sleep(600)
for (let i = 0; i < 14; i++) {
  if ((await state(pc)).roster.length >= 12) break
  await pc.locator('.roster__add').first().click()
  await sleep(250)
}
await sleep(2500)
await shot(pc, 'lobby-12')
const s0 = await state(pc)
const kb = s0.roster.filter(r => r.kind === 'keyboard').map(r => r.slot)
const p1 = new KeyboardPilot(pc, 1, () => kb[0], 5)
const p2 = new KeyboardPilot(pc, 2, () => kb[1], 8)
await Promise.all([p1.start(), p2.start()])
await sleep(4000)
await shot(pc, 'lobby-12-flying')
await p1.stop()
await p2.stop()
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(1500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 8000, 'manche')
await Promise.all([p1.start(), p2.start()])
let next = Date.now()
let cbDone = false
while (true) {
  const s = await state(pc)
  if (s.phase !== 'round') break
  if (!cbDone && s.sunT > 60) {
    cbDone = true
    await pc.evaluate(() => window.__ombres.useSettings.getState().set('colorblind', true))
    await sleep(1500)
    await shot(pc, `cb-on-t${Math.round(s.sunT)}`)
    await sleep(3000)
    await shot(pc, `cb-on-b`)
    await pc.evaluate(() => window.__ombres.useSettings.getState().set('colorblind', false))
  }
  if (Date.now() >= next) {
    next = Date.now() + EVERY
    await shot(pc, `${s.phaseSun}-t${Math.round(s.sunT)}`)
  }
  await sleep(200)
}
for (let i = 0; i < 6; i++) {
  await sleep(800)
  await shot(pc, `night-${i}`)
}
await sleep(3000)
await shot(pc, 'results')
await p1.stop()
await p2.stop()
const errs = problems(logs)
console.log(errs.length ? `PROBLÈMES :\n${errs.join('\n')}` : 'console propre')
await browser.close()
