// QA technique : ce que voit un téléphone pendant que le PC se recharge en pleine manche
// (captures du téléphone toutes les 0,7 s jusqu'au retour de la manette).
import { launch, newContext } from '../../lib/browser.mjs'
import { newPhone, joinPhone, tap } from '../../e2e/qa/lib.mjs'
import { ORIGIN, SHOTS, sleep, waitFor, presetSettings } from './common.mjs'
const browser = await launch()
const pc = await (await newContext(browser)).newPage()
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'text' })
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
const url = (await pc.evaluate(() => window.__ombres.useLobby.getState().joinUrl)).replace(/^https?:\/\/[^/]+/, ORIGIN)
const ph = await newPhone(browser, 'iPhone 15 Pro', 'iphone')
await joinPhone(ph, url, 'Lune', 5)
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 10000, 'salon')
await pc.evaluate(() => window.__ombres.runner.startMatch())
await sleep(1500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 8, null, 60000, 't>8')
const t0 = Date.now()
const rl = pc.reload({ waitUntil: 'load' })
const seen = []
for (let i = 0; i < 16; i++) {
  await sleep(700)
  const s = await ph.page.evaluate(() => document.querySelector('.app')?.dataset.screen + (document.querySelector('.overlay--dim') ? '+overlay' : '')).catch(() => '?')
  const f = `${SHOTS}/phonereload-${String(i).padStart(2, '0')}-${s}.jpg`
  if (!seen.includes(s)) {
    await ph.page.screenshot({ path: f, type: 'jpeg', quality: 70 })
    seen.push(s)
  }
  console.log(`${((Date.now() - t0) / 1000).toFixed(1)} s : téléphone ${s}`)
  if (s === 'play' && i > 6) break
}
await rl
await browser.close()
