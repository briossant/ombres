// QA : solo avec UN téléphone contre les bots + robustesse. Le téléphone rejoint pendant le titre
// (ouvre le salon), lance, joue ; coupure réseau du téléphone → remplaçant → retour ; PC
// rafraîchi en manche, aux résultats, au podium et au salon ; téléphone rafraîchi ; vote « Salon ».
//   node tools/e2e/qa/resilience.mjs [--speed=4]
import { ORIGIN, launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, arg, newPhone, joinPhone, tap, rawKeys } from './lib.mjs'
import { PhonePilot } from './pilot.mjs'
import { installProbe, drainLog } from './probe.mjs'

const SPEED = Number(arg('speed', '4'))
const { shot, log } = makeShots(arg('name', 'resilience'))
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? '  OK ' : '  KO '} ${name}${detail ? ` — ${detail}` : ''}`)
}
const browser = await launch()
const pcCtx = await newContext(browser)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc, 'pc')
const URL_PC = `${ORIGIN}/?debug=fast&speed=${SPEED}`
await pc.goto(URL_PC, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title' && !!window.__ombres?.useLobby.getState().joinUrl, null, 120000, 'titre + salle')
await installProbe(pc)
let s = await state(pc)
const room = s.room
const u = new URL(s.joinUrl)
const phoneUrl = `${ORIGIN}${u.pathname}${u.search}`
const A = await newPhone(browser, 'iPhone 15 Pro', 'iphone')
await joinPhone(A, phoneUrl, 'Solène', 8)
await waitFor(pc, () => window.__ombres?.runner.phase === 'lobby', null, 8000, 'salon ouvert par le téléphone')
check('un téléphone qui rejoint au titre ouvre le salon', true)
await sleep(1500)
s = await state(pc)
log(`salon : ${s.roster.map(r => `${r.kind}:${r.name || r.bot?.personality}:${r.color}`).join(' | ')}`)
check('solo : 3 bots par défaut (Faucon, Laboureur, Nomade)', s.roster.filter(r => r.kind === 'bot').map(r => r.bot.personality).join(',') === 'falcon,ploughman,nomad', s.roster.map(r => r.bot?.personality ?? r.kind).join(','))
await shot(pc, 'lobby')
// rafraîchissement du PC au salon
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.runner.phase === 'lobby' && window.__ombres?.useUi.getState().screen === 'lobby', null, 60000, 'salon repris')
await installProbe(pc)
await sleep(2500)
s = await state(pc)
check('PC rafraîchi au salon : même salle, même joueur', s.room === room && s.roster.some(r => r.name === 'Solène' && r.connected), `${s.room} ${JSON.stringify(s.roster.map(r => [r.name, r.connected]))}`)
await shot(pc, 'lobby-after-reload')
await shot(A.page, 'A-lobby-after-reload')
const slot = () => globalThis.__slot ?? -1
globalThis.__slot = s.roster.find(r => r.name === 'Solène')?.slot
const pilot = new PhonePilot(A, pc, slot, 21)
await tap(A, '.band__start')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(800)
// rafraîchissement pendant les cartes
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => ['lobby', 'rules', 'round'].includes(window.__ombres?.runner.phase) && !['loading', 'title'].includes(window.__ombres?.useUi.getState().screen), null, 60000, 'reprise après cartes')
await installProbe(pc)
s = await state(pc)
log(`rafraîchi pendant les cartes → ${s.phase}`)
check('PC rafraîchi pendant les cartes : cartes reprises', s.phase === 'rules' || s.phase === 'round', s.phase)
await shot(pc, 'rules-after-reload')
if (s.phase === 'lobby') {
  await sleep(1500)
  await tap(A, '.band__start')
  await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres?.runner.phase), null, 8000, 'relance')
}
if ((await state(pc)).phase === 'rules') {
  await waitFor(A.page, () => !!document.querySelector('.intro__foot .btn'), null, 8000, 'Compris')
  await A.page.locator('.intro__foot .btn').click()
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 10000, 'manche 1')
await pilot.start()
await waitFor(pc, () => (window.__ombres?.runner.sim?.state.sun.t ?? -9) > 15, null, 60000, 't > 15')
// coupure du téléphone
await A.ctx.setOffline(true)
const t0 = Date.now()
await waitFor(pc, () => window.__ombres?.useRoster.getState().slots.some(x => x.substitute), null, 15000, 'remplaçant')
const subAfter = (Date.now() - t0) / 1000
log(`remplaçant après ${subAfter.toFixed(1)} s réelles`)
check('remplaçant ≈ 3 s après la coupure (GDD §14.3)', subAfter < 4.5, `${subAfter.toFixed(1)} s`)
await sleep(600)
await shot(pc, 'substitute')
await shot(A.page, 'A-offline')
await sleep(2500)
await A.ctx.setOffline(false)
const t1 = Date.now()
await waitFor(pc, () => !window.__ombres?.useRoster.getState().slots.some(x => x.substitute), null, 20000, 'retour de la main')
log(`main rendue ${((Date.now() - t1) / 1000).toFixed(1)} s après le retour du réseau`)
check('remplaçant puis retour de la main', true)
await sleep(700)
await shot(pc, 'back-in-hand')
await shot(A.page, 'A-back')
// rafraîchissement du PC en pleine manche
await waitFor(pc, () => (window.__ombres?.runner.sim?.state.sun.t ?? -9) > 45, null, 60000, 't > 45')
const before = await pc.evaluate(() => ({ t: window.__ombres.runner.sim.state.sun.t, counts: [...window.__ombres.runner.sim.state.grid.counts] }))
await pilot.stop()
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres?.useUi.getState().screen === 'game', null, 60000, 'manche reprise')
await installProbe(pc)
const after = await pc.evaluate(() => ({ t: window.__ombres.runner.sim.state.sun.t, counts: [...window.__ombres.runner.sim.state.grid.counts] }))
check('PC rafraîchi en manche : soleil repris', Math.abs(after.t - before.t) < 3, `${before.t.toFixed(1)} → ${after.t.toFixed(1)}`)
for (let i = 0; i < 4; i++) {
  await shot(pc, `round-after-reload-${i}`)
  await sleep(700)
}
await shot(A.page, 'A-after-pc-reload')
s = await state(pc)
check('même salle après rafraîchissement', s.room === room, s.room)
await pilot.start()
// téléphone rafraîchi
await A.page.reload({ waitUntil: 'load' })
await waitFor(A.page, () => !!document.querySelector('.act--dive'), null, 20000, 'manette après rafraîchissement du téléphone')
check('téléphone rafraîchi : revient sur la manette', true)
await shot(A.page, 'A-after-phone-reload')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 90000, 'résultats 1')
await pilot.stop()
await sleep(1500)
await shot(pc, 'results1')
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 60000, 'résultats repris')
await installProbe(pc)
await sleep(1200)
await shot(pc, 'results1-after-reload')
check('PC rafraîchi aux résultats : panneau repris', true)
console.log('raw keys:', await rawKeys(pc), await rawKeys(A.page))
await A.page.locator('.result__ready .btn').click()
await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 20000, 'manche 2')
await pilot.start()
// pause depuis le téléphone puis reprise depuis le PC
await waitFor(pc, () => (window.__ombres?.runner.sim?.state.sun.t ?? -9) > 20, null, 60000, 'm2 t>20')
await pilot.stop()
const pb = await A.page.locator('.pause-btn').first().boundingBox()
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x + pb.width / 2, y: pb.y + pb.height / 2, id: 5, radiusX: 6, radiusY: 6, force: 1 }] })
await sleep(1300)
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await sleep(700)
s = await state(pc)
check('pause par appui long du téléphone', s.paused)
await shot(pc, 'pause-by-phone')
await shot(A.page, 'A-pause')
await pc.keyboard.press('Enter') // Reprendre (focus par défaut)
await sleep(800)
s = await state(pc)
check('reprise depuis le PC', !s.paused)
await pilot.start()
// fin de partie : finir les manches
for (let k = 0; k < 3; k++) {
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.runner.phase), null, 120000, 'fin de manche')
  if ((await state(pc)).phase === 'matchResults') break
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 20000, 'panneau')
  await sleep(1000)
  await A.page.locator('.result__ready .btn').click().catch(() => {})
  await waitFor(pc, () => ['round', 'matchResults'].includes(window.__ombres?.runner.phase), null, 20000, 'suite')
  if ((await state(pc)).phase === 'matchResults') break
}
await pilot.stop()
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 30000, 'podium')
await sleep(2000)
await shot(pc, 'podium')
await shot(A.page, 'A-matchEnd')
await pc.reload({ waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 60000, 'podium repris')
await sleep(3000)
await shot(pc, 'podium-after-reload')
check('PC rafraîchi au podium : repris', true)
// vote « Salon »
await waitFor(A.page, () => document.querySelectorAll('.vote-row .btn').length >= 2, null, 10000, 'boutons de vote')
await A.page.locator('.vote-row .btn').nth(1).click()
await waitFor(pc, () => window.__ombres?.runner.phase === 'lobby', null, 10000, 'retour salon par vote')
check('vote « Salon » : retour au salon', true)
await sleep(1500)
await shot(pc, 'lobby-end')
await shot(A.page, 'A-lobby-end')
for (const l of await drainLog(pc).catch(() => [])) console.log('   ', l)
for (const [n, L] of [
  ['PC', pcLogs],
  ['A', A.logs],
]) {
  const p = problems(L).filter(l => !/ERR_INTERNET_DISCONNECTED|net::ERR/.test(l))
  console.log(p.length ? `${n} PROBLÈMES :\n  ${[...new Set(p)].join('\n  ')}` : `${n} console propre`)
}
const failed = checks.filter(c => !c.ok)
console.log(failed.length ? `${failed.length} échec(s)` : 'tout est vert')
await browser.close()
