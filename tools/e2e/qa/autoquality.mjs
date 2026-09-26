// QA : réglage de qualité « auto » sur 3 manches (écran 60 Hz) : le preset ne doit pas descendre
// à chaque entracte quand l'image tient 60 i/s.
import { ORIGIN, launch, newContext, sleep, waitFor, presetSettings } from './lib.mjs'
const browser = await launch()
const pc = await (await newContext(browser)).newPage()
await presetSettings(pc, { lang: 'fr', quality: 'auto' })
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=6`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(6000) // banc de qualité du titre
const lv = () => pc.evaluate(() => window.__ombres.useRenderQuality.getState().level)
console.log('après le banc :', await lv())
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(500)
await pc.keyboard.press('Space')
await sleep(300)
await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres?.runner.phase), null, 8000, 'lancement')
await pc.keyboard.press('Enter')
for (let r = 1; r <= 3; r++) {
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.runner.phase), null, 120000, 'résultats')
  await sleep(500)
  console.log(`après la manche ${r} :`, await lv(), await pc.evaluate(() => window.__ombres.runner.phase))
  if (r < 3) {
    await pc.keyboard.press('Enter')
    await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 20000, 'manche suivante')
  }
}
await browser.close()
