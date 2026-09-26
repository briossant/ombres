// Regarder une vraie partie (vitesse normale) : titre (démo qui boucle), salon, une manche courte
// jouée au clavier contre les bots, nuit, résultats. Captures régulières + journal des temps forts
// (piqués, ralentis, répliques du narrateur, indications).
//   node tools/e2e/watch.mjs [--length=short] [--every=6] [--title=12]
import { ORIGIN, launch, newContext, collectLogs, shotDir, sleep, waitFor, errorsOf } from './lib.mjs'
import { join } from 'node:path'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const LENGTH = arg('length') ?? 'short'
const EVERY = Number(arg('every') ?? 6)
const TITLE = Number(arg('title') ?? 12)
const dir = shotDir('watch')
let n = 0
const snap = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(2, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  return f
}
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.addInitScript(() => {
  try {
    localStorage.setItem('ombres.settings.v1', JSON.stringify({ lang: 'fr' }))
  } catch {}
})
await page.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await page.evaluate(() => {
  const o = window.__ombres
  window.__log = []
  o.simEvents.on(e => {
    if (['diveHit', 'diveMiss', 'crown', 'bigSteal', 'phase', 'night', 'over'].includes(e.type)) window.__log.push({ t: performance.now(), e: e.type, phase: e.phase })
  })
  o.useHud.subscribe((s, p) => {
    if (s.subtitle && s.subtitle !== p.subtitle) window.__log.push({ t: performance.now(), e: 'subtitle', text: s.subtitle.text })
    if (s.hints.length > p.hints.length) window.__log.push({ t: performance.now(), e: 'hint', key: s.hints.at(-1).key })
  })
})
for (let i = 0; i < TITLE / 4; i++) {
  await sleep(4000)
  await snap(page, `title-${i}`)
}
await page.keyboard.press('KeyX')
await sleep(500)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 10000, 'salon')
await page.evaluate(l => window.__ombres.runner.setMatchSetting('length', l), LENGTH)
await page.keyboard.press('Space')
await sleep(3000)
await snap(page, 'lobby')
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(2000)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'game', null, 8000, 'manche')
log('manche')
let last = 0
const keys = ['KeyW', 'KeyD', 'KeyS', 'KeyA']
let k = 0
while ((await page.evaluate(() => window.__ombres.useUi.getState().screen)) === 'game') {
  const key = keys[k++ % 4]
  await page.keyboard.down(key)
  if (k % 2) await page.keyboard.down('Space')
  await sleep(900)
  await page.keyboard.up(key)
  await page.keyboard.up('Space')
  if (Date.now() - last > EVERY * 1000) {
    last = Date.now()
    const t = await page.evaluate(() => window.__ombres.runner.sim.state.sun.t.toFixed(0))
    await snap(page, `round-t${t}`)
  }
}
log('résultats')
await sleep(300)
await snap(page, 'results-0')
await sleep(3500)
await snap(page, 'results-reveal')
await sleep(2500)
await snap(page, 'results-suns')
const events = await page.evaluate(() => window.__log.map(l => `${(l.t / 1000).toFixed(1)} ${l.e} ${l.phase ?? l.text ?? l.key ?? ''}`))
console.log(events.join('\n'))
console.log('erreurs', errorsOf(logs))
await browser.close()
