// Lancement public : images du jeu pour l'aperçu de lien (og.jpg) et la page mobile.
// Vraie partie (clavier + bots, ?debug=fast), HUD masqué, une image par seconde de l'heure
// dorée à la Grande Ombre, dans shots/landing/og-raw/ (nom = phase + élévation du soleil).
//   PORT=8901 node --import ./tools/polish/staging/nohmr.mjs tools/launch/og-capture.mjs [--w=1200 --h=630 --speed=2]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, collectLogs, sleep, waitFor, state } from '../e2e/lib.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const W = Number(arg('w', 1200))
const H = Number(arg('h', 630))
const SPEED = Number(arg('speed', 2))
const LANG = arg('lang', 'en')
const dir = join(import.meta.dirname, '../../shots/landing/og-raw')
mkdirSync(dir, { recursive: true })

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1, locale: 'en-US' })
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.addInitScript(lang => {
  try {
    const k = 'ombres.settings.v1'
    const s = JSON.parse(localStorage.getItem(k) ?? '{}')
    localStorage.setItem(k, JSON.stringify({ ...s, lang, quality: 'high' }))
  } catch {}
}, LANG)
await page.goto(`${ORIGIN}/?debug=fast,nosave&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(1200)
await page.keyboard.press('KeyX')
await sleep(600)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await sleep(600)
await page.keyboard.press('Space')
await sleep(600)
await page.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'game', null, 30000, 'manche')
// HUD, étiquettes et bannières masqués : l'image du monde seule.
await page.addStyleTag({ content: '.ui-root{visibility:hidden!important}' })

const dirs = ['KeyW', 'KeyD', 'KeyS', 'KeyA']
let k = 0
let last = 0
while (true) {
  const st = await state(page)
  if (st.phase !== 'round') break
  const elev = await page.evaluate(() => ((window.__ombres.gameView.sim?.sun.elevation ?? 0) * 180) / Math.PI)
  const ph = st.phaseSun
  if (['golden', 'sunset', 'greatShadow'].includes(ph) && Date.now() - last > 900 / SPEED * 2) {
    last = Date.now()
    const f = join(dir, `${ph}-${elev.toFixed(1).padStart(4, '0')}.jpg`)
    await page.screenshot({ path: f, type: 'jpeg', quality: 92 })
  }
  // vol au hasard, piqués de temps en temps (comme tools/e2e/solo.mjs)
  const key = dirs[k++ % dirs.length]
  await page.keyboard.down(key)
  if (k % 3 === 0) await page.keyboard.down('Space')
  await sleep(250)
  await page.keyboard.up(key)
  await page.keyboard.up('Space')
}
const bad = logs.filter(l => /pageerror|\[error\]/.test(l))
console.log(JSON.stringify({ dir, errors: bad.slice(-5) }, null, 1))
await browser.close()
