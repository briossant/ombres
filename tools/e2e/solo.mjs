// (a) Solo au clavier contre les bots : titre → salon → lancement → cartes → manches complètes
// → résultats → … → fin de partie → revanche. Partie accélérée (?debug=fast) : manches courtes,
// simulation × SPEED, entractes raccourcis. Captures à chaque étape dans shots/runner/solo/.
//   node tools/e2e/solo.mjs [--speed=6] [--rounds=3] [--lang=en]
import { ORIGIN, launch, newContext, collectLogs, shotDir, shot, sleep, waitFor, state, errorsOf } from './lib.mjs'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SPEED = Number(arg('speed') ?? 6)
const ROUNDS = Number(arg('rounds') ?? 3)
const LANG = arg('lang') ?? 'fr'
const dir = shotDir('solo')
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.addInitScript(lang => {
  try {
    const k = 'ombres.settings.v1'
    const s = JSON.parse(localStorage.getItem(k) ?? '{}')
    localStorage.setItem(k, JSON.stringify({ ...s, lang }))
  } catch {}
}, LANG)
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)
await page.goto(`${ORIGIN}/?debug=fast,nosave&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
log('titre')
await sleep(1500)
await shot(page, dir, 'title')
await page.keyboard.press('KeyX') // « appuie sur une touche »
await sleep(600)
await page.keyboard.press('Enter') // Jouer
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 10000, 'salon')
log('salon')
await sleep(800)
await page.keyboard.press('Space') // rejoindre au clavier (groupe 1)
await sleep(300)
// petit vol : objectifs Vole et Plonge
await page.keyboard.down('KeyD')
await sleep(2400)
await page.keyboard.up('KeyD')
await page.keyboard.down('Space')
await sleep(1300)
await page.keyboard.up('Space')
await sleep(800)
await shot(page, dir, 'lobby-joined')
if (ROUNDS !== 3) {
  await page.evaluate(n => window.__ombres.runner.setMatchSetting('rounds', n), ROUNDS)
}
let s = await state(page)
log(`salon : ${s.roster.map(r => `${r.kind}:${r.color}`).join(' ')} ; objectifs ${JSON.stringify(s.roster[0]?.goals)}`)
await page.keyboard.press('Enter') // lancer
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'rules', null, 10000, 'cartes des règles')
await sleep(900)
await shot(page, dir, 'rules')
log('cartes')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'game', null, 20000, 'manche 1')

/** Joue une manche : tient des directions et PLONGER au hasard, captures aux moments clés. */
async function playRound(n) {
  log(`manche ${n}`)
  await sleep(250)
  await shot(page, dir, `r${n}-countdown`)
  const dirs = ['KeyW', 'KeyD', 'KeyS', 'KeyA']
  let k = 0
  let shotAt = { golden: false, sunset: false, great: false }
  while (true) {
    const st = await state(page)
    if (st.phase !== 'round') break
    if (st.phaseSun === 'golden' && !shotAt.golden) {
      shotAt.golden = true
      await shot(page, dir, `r${n}-golden`)
    }
    if (st.phaseSun === 'sunset' && !shotAt.sunset) {
      shotAt.sunset = true
      await shot(page, dir, `r${n}-sunset`)
    }
    if (st.phaseSun === 'greatShadow' && !shotAt.great) {
      shotAt.great = true
      await shot(page, dir, `r${n}-greatshadow`)
    }
    const key = dirs[k++ % dirs.length]
    await page.keyboard.down(key)
    if (k % 3 === 0) await page.keyboard.down('Space')
    await sleep(350 + (k % 4) * 120)
    await page.keyboard.up(key)
    await page.keyboard.up('Space')
    if (k % 7 === 0) await page.keyboard.press('ShiftLeft')
  }
  log(`fin de manche ${n} → ${(await state(page)).phase}`)
}

for (let n = 1; n <= ROUNDS; n++) {
  await playRound(n)
  await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'roundResults' || window.__ombres?.useUi.getState().screen === 'matchResults', null, 20000, 'résultats de manche')
  await sleep(400)
  await shot(page, dir, `r${n}-results-count`)
  await sleep(3200)
  await shot(page, dir, `r${n}-results`)
  s = await state(page)
  log(`résultats : ${s.results} manche(s) finie(s)`)
  if (n < ROUNDS) {
    await page.keyboard.press('Enter')
    await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'game', null, 20000, `manche ${n + 1}`)
  } else {
    await page.keyboard.press('Enter')
  }
}
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 20000, 'fin de partie')
log('fin de partie')
await sleep(600)
await shot(page, dir, 'match-results')
await sleep(3000)
await shot(page, dir, 'match-results-late')
await page.keyboard.press('Enter') // revanche
await waitFor(page, () => window.__ombres?.runner.phase === 'round' && window.__ombres?.runner.roundIndex === 0, null, 20000, 'revanche')
await sleep(800)
await shot(page, dir, 'rematch')
s = await state(page)
log(`revanche : phase ${s.phase}, manche ${s.round + 1}, joueurs ${s.roster.length}`)
const errs = errorsOf(logs)
console.log(errs.length ? `ERREURS :\n${errs.join('\n')}` : 'aucune erreur console')
console.log(logs.filter(l => /warn/.test(l)).slice(-10).join('\n'))
await browser.close()
process.exit(errs.length ? 1 : 0)
