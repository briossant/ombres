// (c) Téléphone coupé en pleine manche → bot remplaçant → reconnexion → le joueur reprend la main.
// (d) Rafraîchissement du PC en pleine manche → même salle, même manche, même désert, reprise « 3, 2, 1 ».
// (e) Aucune erreur console.
//   node tools/e2e/resilience.mjs [--speed=2]
import { ORIGIN, launch, newContext, collectLogs, shotDir, sleep, waitFor, state, errorsOf } from './lib.mjs'
import { join } from 'node:path'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SPEED = Number(arg('speed') ?? 2)
const dir = shotDir('resilience')
let n = 0
const snap = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(2, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  return f
}
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

// Permet de couper le WebSocket du téléphone et d'empêcher sa reconnexion (réseau coupé).
const WS_HOOK = () => {
  window.__sockets = []
  window.__blockWs = false
  const Native = window.WebSocket
  window.WebSocket = class extends Native {
    constructor(url, protocols) {
      super(window.__blockWs ? String(url).replace(/:\d+\//, ':9/') : url, protocols)
      window.__sockets.push(this)
    }
  }
}

const browser = await launch()
const pcCtx = await newContext(browser)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc)
await pc.goto(`${ORIGIN}/?debug=fast&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await pc.keyboard.press('KeyX')
await sleep(400)
await pc.keyboard.press('Enter')
await waitFor(pc, () => !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'QR')
const u = new URL((await state(pc)).joinUrl)

const phCtx = await newContext(browser, { mobile: 'Pixel 7', landscape: true })
const ph = await phCtx.newPage()
await ph.addInitScript(WS_HOOK)
const phLogs = collectLogs(ph)
const cdp = await phCtx.newCDPSession(ph)
await ph.goto(`${ORIGIN}${u.pathname}${u.search}`, { waitUntil: 'load' })
await waitFor(ph, () => !!document.querySelector('.profile'), null, 15000, 'profil')
await ph.fill('#phone-name', 'Nadia')
await ph.locator('.profile__go').click()
await waitFor(ph, () => !!document.querySelector('.band__start'), null, 8000, 'salon')
await ph.locator('.band__start').click()
await waitFor(ph, () => !!document.querySelector('.intro__foot .btn'), null, 8000, 'cartes')
await ph.locator('.intro__foot .btn').click()
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.sim.state.sun.t > 4, null, 30000, 'manche en cours')
const slot = (await state(pc)).roster.find(r => r.name === 'Nadia').slot
log(`manche en cours, Nadia au slot ${slot}`)

// ─── (c) coupure du téléphone ───
await ph.evaluate(() => {
  window.__blockWs = true
  window.__sockets.at(-1).close()
})
const cutAt = Date.now()
await waitFor(pc, s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.substitute === true, slot, 12000, 'remplaçant')
const delay = (Date.now() - cutAt) / 1000
check('bot remplaçant après la coupure (≈ 3 s)', delay >= 2.5 && delay < 6, `${delay.toFixed(1)} s`)
check('le remplaçant pilote l’oiseau', await pc.evaluate(s => window.__ombres.runner.router.get(s).kind === 'bot', slot))
await sleep(400)
await snap(pc, 'pc-substitute')
await snap(ph, 'phone-away')
await ph.evaluate(() => (window.__blockWs = false))
await waitFor(pc, s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.substitute === false, slot, 15000, 'retour du téléphone')
check('le téléphone reprend la main à la reconnexion', await pc.evaluate(s => window.__ombres.runner.router.get(s).kind === 'phone', slot))
// le joystick pilote de nouveau : cap vers l'est
const zone = await ph.locator('.stick-zone').boundingBox()
const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })
const sx = zone.x + zone.width * 0.45
const sy = zone.y + zone.height * 0.55
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx, sy)] })
for (let i = 1; i <= 4; i++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, sx + i * 16, sy)] })
  await sleep(16)
}
await sleep(1500)
const heading = await pc.evaluate(s => window.__ombres.runner.sim.state.bySlot[s].heading, slot)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
check('entrées du téléphone relues (cap vers l’est)', Math.abs(Math.atan2(Math.sin(heading), Math.cos(heading))) < 0.9, `cap ${(heading * 180 / Math.PI).toFixed(0)}°`)
await snap(pc, 'pc-back')

// ─── (d) rafraîchissement du PC ───
await waitFor(pc, () => window.__ombres.runner.sim.state.sun.t > 12, null, 30000, 'milieu de manche')
const before = await pc.evaluate(() => {
  const r = window.__ombres.runner
  const st = r.sim.state
  return { room: window.__ombres.useLobby.getState().roomCode, t: st.sun.t, round: r.roundIndex, counts: Array.from(st.grid.counts), players: window.__ombres.useRoster.getState().slots.map(s => `${s.kind}:${s.colorIndex}`).join(' ') }
})
await snap(pc, 'pc-before-refresh')
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 90000, 'reprise')
await sleep(300)
await snap(pc, 'pc-after-refresh-countdown')
const after = await pc.evaluate(() => {
  const r = window.__ombres.runner
  const st = r.sim.state
  return { room: window.__ombres.useLobby.getState().roomCode, t: st.sun.t, round: r.roundIndex, counts: Array.from(st.grid.counts), players: window.__ombres.useRoster.getState().slots.map(s => `${s.kind}:${s.colorIndex}`).join(' '), countdown: window.__ombres.useHud.getState().countdown }
})
check('même salle après rafraîchissement', after.room === before.room, `${before.room} → ${after.room}`)
check('même manche, même joueurs', after.round === before.round && after.players === before.players, after.players)
// sauvegarde à beforeunload (+ toutes les 2,5 s) : on reprend là où le PC s'est arrêté
check('soleil repris au même instant', Math.abs(after.t - before.t) < 1.5 * SPEED, `${before.t.toFixed(2)} → ${after.t.toFixed(2)}`)
const lost = before.counts.reduce((a, c, i) => a + Math.abs(c - after.counts[i]), 0) / Math.max(1, before.counts.reduce((a, b) => a + b, 0))
check('désert repris (territoire quasi identique)', lost < 0.25, `écart ${(lost * 100).toFixed(1)} %`)
check('reprise en « 3, 2, 1 »', after.countdown !== null && after.countdown > 0, `countdown=${after.countdown}`)
await waitFor(pc, s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.connected === true, slot, 20000, 'téléphone reconnecté au PC rafraîchi')
check('le téléphone retrouve le PC rafraîchi', true)
await sleep(3500)
check('la manche reprend', await pc.evaluate(t => window.__ombres.runner.sim.state.sun.t > t + 0.2, after.t))
check('le téléphone pilote (pas de remplaçant)', await pc.evaluate(s => window.__ombres.runner.router.get(s).kind === 'phone', slot))
await snap(pc, 'pc-resumed')
await snap(ph, 'phone-resumed')

// ─── rafraîchissement pendant les résultats de manche, puis au salon ───
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 120000, 'résultats')
await sleep(1500)
const res0 = await pc.evaluate(() => ({ n: window.__ombres.runner.match.results.length, rows: JSON.stringify(window.__ombres.useRoundResults.getState().rows) }))
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 90000, 'résultats repris')
const res1 = await pc.evaluate(() => ({ n: window.__ombres.runner.match.results.length, rows: JSON.stringify(window.__ombres.useRoundResults.getState().rows) }))
check('rafraîchi pendant les résultats : même écran, mêmes résultats', res0.n === res1.n && res0.rows === res1.rows, `${res0.n} manche(s)`)
await sleep(1500)
await snap(pc, 'pc-results-after-refresh')
await waitFor(ph, () => !!document.querySelector('.result__ready .btn'), null, 10000, 'entracte téléphone')
check('le téléphone est en entracte (Prêt)', true)
await ph.locator('.result__ready .btn').click()
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.roundIndex === 1, null, 20000, 'manche 2')
check('« Prêt » du téléphone → manche 2', true)
await pc.keyboard.press('Escape')
await waitFor(pc, () => window.__ombres?.useUi.getState().paused === true, null, 3000, 'pause')
await pc.evaluate(() => window.__ombres.runner.quitToLobby())
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 5000, 'salon')
await sleep(1000)
const lob0 = (await state(pc)).roster.map(r => `${r.kind}:${r.color}:${r.name}`).join(' ')
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 90000, 'salon repris')
await waitFor(pc, s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.connected === true, slot, 20000, 'téléphone au salon')
const lob1 = (await state(pc)).roster.map(r => `${r.kind}:${r.color}:${r.name}`).join(' ')
check('rafraîchi au salon : mêmes joueurs, téléphone reconnecté', lob0 === lob1, lob1)
await sleep(1200)
await snap(pc, 'pc-lobby-after-refresh')
await snap(ph, 'phone-lobby-after-refresh')

const errs = [...errorsOf(pcLogs), ...errorsOf(phLogs)].filter(l => !/WebSocket connection to/.test(l))
check('aucune erreur console', errs.length === 0, errs.slice(0, 4).join(' | '))
await browser.close()
const failed = checks.filter(c => !c.ok).length
console.log(failed ? `${failed} échec(s)` : 'tout est vert')
process.exit(failed ? 1 : 0)
