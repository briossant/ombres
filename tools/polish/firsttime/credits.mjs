// Crédits FR et EN (défilement), textes visibles.
import { ORIGIN, launch, pcContext, makeShots, sleep, waitFor, visibleText } from './ft.mjs'
const { shot, log } = makeShots('credits')
const browser = await launch()
for (const [lang, locale] of [['fr', 'fr-FR'], ['en', 'en-US']]) {
  const pc = await (await pcContext(browser, locale)).newPage()
  await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
  await pc.keyboard.press('KeyX')
  await sleep(500)
  await pc.keyboard.press('ArrowDown')
  await pc.keyboard.press('ArrowDown')
  await pc.keyboard.press('Enter')
  await sleep(1500)
  for (let i = 0; i < 5; i++) {
    await shot(pc, `${lang}-credits-${i}`)
    for (let k = 0; k < 12; k++) await pc.keyboard.press('ArrowDown')
    await sleep(700)
  }
  log(`${lang} crédits : ${(await visibleText(pc)).slice(0, 4000)}`)
  await pc.close()
}
await browser.close()
