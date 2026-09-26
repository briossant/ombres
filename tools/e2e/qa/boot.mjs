// QA : chargement → titre (démo, cinématique) → menu → réglages → crédits, à vitesse réelle.
//   node tools/e2e/qa/boot.mjs [--lang=en] [--q=high]
import { ORIGIN, launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, presetSettings, rawKeys, arg } from './lib.mjs'

const LANG = arg('lang', 'fr')
const { shot, log } = makeShots(`boot-${LANG}`)
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
const logs = collectLogs(page)
await presetSettings(page, { lang: LANG, ...(arg('q') ? { quality: arg('q') } : {}) })
const t0 = Date.now()
await page.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'commit' })
for (let i = 0; i < 6; i++) {
  await sleep(i === 0 ? 700 : 900)
  await shot(page, `loading-${i}`)
  const sc = await page.evaluate(() => window.__ombres?.useUi.getState().screen).catch(() => null)
  if (sc === 'title') break
}
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
log(`titre après ${((Date.now() - t0) / 1000).toFixed(1)} s`)
for (let i = 0; i < 10; i++) {
  await shot(page, `title-${i}`)
  await sleep(3500)
}
console.log('raw keys:', await rawKeys(page))
await page.keyboard.press('KeyX')
await sleep(700)
await shot(page, 'title-menu')
// réglages
await page.keyboard.press('ArrowDown')
await sleep(200)
await page.keyboard.press('Enter')
await sleep(700)
await shot(page, 'settings')
console.log('raw keys:', await rawKeys(page))
await page.keyboard.press('Escape')
await sleep(500)
await page.keyboard.press('ArrowDown')
await sleep(200)
await page.keyboard.press('Enter')
await sleep(1500)
await shot(page, 'credits-a')
await sleep(6000)
await shot(page, 'credits-b')
await page.keyboard.press('Escape')
await sleep(1200)
await shot(page, 'back-title')
console.log(JSON.stringify(await state(page)))
const errs = problems(logs)
console.log(errs.length ? `PROBLÈMES :\n${errs.join('\n')}` : 'console propre')
await browser.close()
