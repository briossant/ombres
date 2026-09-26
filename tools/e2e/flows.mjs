// Parcours annexes : crédits et retour, manette (Gamepad API émulée) qui rejoint le salon,
// deuxième joueur au clavier (AltGr), pause au clavier (Échap) et depuis le téléphone (appui long),
// arrivée d'un téléphone en pleine manche (spectateur → joue à la manche suivante).
//   node tools/e2e/flows.mjs [--speed=6]
import { ORIGIN, launch, newContext, collectLogs, shotDir, sleep, waitFor, state, errorsOf } from './lib.mjs'
import { join } from 'node:path'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SPEED = Number(arg('speed') ?? 6)
const dir = shotDir('flows')
let n = 0
const snap = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(2, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  return f
}
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}
const screen = page => page.evaluate(() => window.__ombres?.useUi.getState().screen)

// Manette émulée : window.__pad.buttons[i] / axes pilotés par le test.
const PAD_HOOK = () => {
  const pad = {
    index: 0,
    id: 'Émulée (STANDARD GAMEPAD)',
    connected: true,
    mapping: 'standard',
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 17 }, () => ({ pressed: false, touched: false, value: 0 })),
    timestamp: 0,
  }
  window.__pad = pad
  window.__padOn = false
  navigator.getGamepads = () => (window.__padOn ? [pad, null, null, null] : [null, null, null, null])
}

const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PAD_HOOK)
const logs = collectLogs(pc)
await pc.goto(`${ORIGIN}/?debug=fast&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await pc.keyboard.press('KeyX')
await sleep(500)
// crédits : 3e entrée du menu
await pc.keyboard.press('ArrowDown')
await pc.keyboard.press('ArrowDown')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'credits', null, 5000, 'crédits')
check('crédits', true)
await sleep(2500)
await snap(pc, 'credits')
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 5000, 'retour titre')
check('Échap : retour au titre', (await pc.evaluate(() => window.__ombres.runner.phase)) === 'title')
await sleep(1200)
await snap(pc, 'title-menu')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 5000, 'salon')

// manette : A = PLONGER = rejoindre (groupe 1)
await pc.evaluate(() => (window.__padOn = true))
await sleep(200)
await pc.evaluate(() => {
  window.__pad.buttons[0].pressed = true
  window.__pad.buttons[0].value = 1
})
await sleep(150)
await pc.evaluate(() => {
  window.__pad.buttons[0].pressed = false
  window.__pad.buttons[0].value = 0
})
await sleep(300)
let s = await state(pc)
check('la manette rejoint le salon (A = PLONGER)', s.roster.some(r => r.kind === 'keyboard'), s.roster.map(r => r.kind).join(','))
check('A ne lance pas la partie (manette réservée au jeu)', (await screen(pc)) === 'lobby')
// le stick pilote
// (salon petit et simulation accélérée : on lit le cap tôt, avant que le Simoun ne renvoie l'oiseau)
await pc.evaluate(() => (window.__pad.axes[0] = 1))
await sleep(350)
const h = await pc.evaluate(() => {
  const r = window.__ombres.runner
  const p = r.roster.byGroup(1)
  return r.sim.state.bySlot[p.slot].heading
})
await pc.evaluate(() => (window.__pad.axes[0] = 0))
check('le stick de la manette pilote l’oiseau (vers l’est)', Math.abs(Math.atan2(Math.sin(h), Math.cos(h))) < 0.5, `${((h * 180) / Math.PI).toFixed(0)}°`)
// deuxième joueur au clavier : AltGr
await pc.keyboard.press('AltRight')
await sleep(300)
s = await state(pc)
check('2e joueur au clavier (AltGr)', s.roster.filter(r => r.kind === 'keyboard').length === 2)
await sleep(600)
await snap(pc, 'lobby-local')
// lancement au clavier
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 5000, 'cartes')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.sim.state.sun.t > 3, null, 20000, 'manche')

// pause au clavier
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres?.useUi.getState().paused === true, null, 3000, 'pause')
const t1 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
await sleep(1200)
const t2 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
check('pause : simulation gelée', t1 === t2, `${t1} → ${t2}`)
await snap(pc, 'pause')
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres?.useUi.getState().paused === false, null, 3000, 'reprise')
await sleep(500)
check('reprise : simulation repartie', (await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)) > t2)

// téléphone qui arrive en pleine manche
const u = new URL((await state(pc)).joinUrl)
const phCtx = await newContext(browser, { mobile: 'iPhone 15 Pro', landscape: true })
const ph = await phCtx.newPage()
const phLogs = collectLogs(ph)
const cdp = await phCtx.newCDPSession(ph)
await ph.goto(`${ORIGIN}${u.pathname}${u.search}`, { waitUntil: 'load' })
await waitFor(ph, () => document.body.innerText.length > 20 && !!document.querySelector('.screen'), null, 15000, 'téléphone')
await sleep(1200)
await snap(ph, 'phone-spectate')
s = await state(pc)
const late = s.roster.find(r => r.kind === 'phone')
check('arrivé en cours de partie : dans le roster, hors de la manche', !!late && !(await pc.evaluate(sl => !!window.__ombres.runner.sim.state.bySlot[sl], late.slot)))
check('écran « partie en cours » sur le téléphone', (await ph.evaluate(() => document.body.innerText)).length > 0)
// fin de la manche 1 puis manche 2 : le téléphone joue
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 60000, 'résultats')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.roundIndex === 1, null, 10000, 'manche 2')
check('le téléphone entre en piste à la manche suivante', await pc.evaluate(sl => !!window.__ombres.runner.sim.state.bySlot[sl], late.slot))
await waitFor(ph, () => !!document.querySelector('.pause-btn'), null, 8000, 'manette')
await waitFor(pc, () => window.__ombres.runner.sim.state.sun.t > 2, null, 20000, 'soleil')
// pause depuis le téléphone : appui long
const b = await ph.locator('.pause-btn').boundingBox()
const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(5, b.x + b.width / 2, b.y + b.height / 2)] })
await sleep(1200)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await waitFor(pc, () => window.__ombres?.useUi.getState().paused === true, null, 3000, 'pause téléphone')
check('pause depuis le téléphone (appui long)', (await pc.evaluate(() => window.__ombres.useUi.getState().pausedBy)) === late.slot)
await sleep(500)
await snap(pc, 'pause-phone')
await snap(ph, 'phone-paused')
await ph.locator('.overlay .btn--primary').click()
await waitFor(pc, () => window.__ombres?.useUi.getState().paused === false, null, 3000, 'reprise téléphone')
check('reprise depuis le téléphone', true)
// retour au salon depuis la pause (deux temps)
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres?.useUi.getState().paused === true, null, 3000, 'pause')
await sleep(400)
await pc.keyboard.press('ArrowDown')
await pc.keyboard.press('ArrowDown')
await pc.keyboard.press('Enter')
await sleep(200)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 5000, 'salon après abandon')
check('pause → retour au salon (confirmation)', true)
await sleep(1500)
s = await state(pc)
check('salon : joueurs gardés', s.roster.filter(r => r.kind !== 'bot').length === 3, s.roster.map(r => r.kind).join(','))
await snap(pc, 'lobby-back')

const errs = [...errorsOf(logs), ...errorsOf(phLogs)]
check('aucune erreur console', errs.length === 0, errs.slice(0, 4).join(' | '))
await browser.close()
const failed = checks.filter(c => !c.ok).length
console.log(failed ? `${failed} échec(s)` : 'tout est vert')
process.exit(failed ? 1 : 0)
