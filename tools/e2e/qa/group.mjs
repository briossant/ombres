// QA (scénario principal) : un vrai groupe — PC + iPhone 15 Pro + Pixel 7 + un joueur au clavier.
// Titre → salon (QR, profils, objectifs, bots ajoutés/retirés) → cartes → 3 manches pilotées
// (touches CDP, clavier) → entractes → podium → revanche → pause PC / téléphone → retour salon.
//   node tools/e2e/qa/group.mjs [--speed=1] [--every=5000] [--rounds=3]
import { ORIGIN, launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, arg, newPhone, joinPhone, tap, center, rawKeys } from './lib.mjs'
import { PhonePilot, KeyboardPilot } from './pilot.mjs'
import { installProbe, drainLog, frameStats } from './probe.mjs'
import { readFileSync } from 'node:fs'

const SPEED = Number(arg('speed', '1'))
const EVERY = Number(arg('every', '5000'))
const ROUNDS = Number(arg('rounds', '3'))
const NAME = arg('name', SPEED > 1 ? 'group-fast' : 'group')
const { shot, log } = makeShots(NAME)
const gpu = () => {
  try {
    return Number(readFileSync('/sys/class/drm/card1/device/gpu_busy_percent', 'utf8'))
  } catch {
    return -1
  }
}
const browser = await launch()
const pcCtx = await newContext(browser)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc, 'pc')
const q = SPEED > 1 ? `?debug=fast&speed=${SPEED}` : '?debug'
await pc.goto(`${ORIGIN}/${q}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await installProbe(pc)
await sleep(3000)
await pc.keyboard.press('KeyX')
await sleep(600)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon + QR')
await sleep(1200)
await shot(pc, 'lobby-empty')
if (ROUNDS !== 3) await pc.evaluate(r => window.__ombres.runner.setMatchSetting('rounds', r), ROUNDS)
const joinUrl = (await state(pc)).joinUrl
const u = new URL(joinUrl)
const phoneUrl = `${ORIGIN}${u.pathname}${u.search}`
log(`QR ${joinUrl}`)

const A = await newPhone(browser, 'iPhone 15 Pro', 'iphone')
const B = await newPhone(browser, 'Pixel 7', 'pixel')
await A.page.goto(phoneUrl, { waitUntil: 'load' })
await waitFor(A.page, () => !!document.querySelector('.profile'), null, 20000, 'profil A')
await sleep(500)
await shot(A.page, 'A-profile')
await joinPhone(A, phoneUrl, 'Brieuc', 3)
await sleep(800)
await shot(pc, 'lobby-1phone')
await joinPhone(B, phoneUrl, 'Lou', 5)
await sleep(600)
await pc.keyboard.press('Space') // joueur au clavier
await sleep(900)
let s = await state(pc)
log(`salon : ${s.roster.map(r => `${r.slot}:${r.kind}:${r.name || r.bot?.personality}:${r.color}`).join(' | ')}`)
const slotOf = name => () => (globalThis.__roster?.find(r => r.name === name)?.slot ?? -1)
const refreshRoster = async () => (globalThis.__roster = (await state(pc)).roster)
await refreshRoster()
const kbSlot = () => globalThis.__roster?.find(r => r.kind === 'keyboard')?.slot ?? -1
const pA = new PhonePilot(A, pc, slotOf('Brieuc'), 3)
const pB = new PhonePilot(B, pc, slotOf('Lou'), 5)
const pK = new KeyboardPilot(pc, 1, kbSlot, 9)
await Promise.all([pA.start(), pB.start(), pK.start()])
await sleep(4000)
await shot(pc, 'lobby-flying')
await shot(A.page, 'A-lobby')
await shot(B.page, 'B-lobby')
// bots : ajouter puis retirer via l'UI (souris)
const addBtn = pc.locator('.roster__add').first()
if (await addBtn.count()) {
  await pK.stop()
  await addBtn.click()
  await sleep(900)
  await shot(pc, 'lobby-botadded')
  s = await state(pc)
  log(`après ajout : ${s.roster.length} oiseaux`)
  const rm = pc.locator('.slot__remove').last()
  if (await rm.count()) {
    await rm.click()
    await sleep(700)
  }
  s = await state(pc)
  log(`après retrait : ${s.roster.length} oiseaux`)
  await pK.start()
}
await sleep(4000)
await refreshRoster()
s = await state(pc)
log(`objectifs : ${s.roster.filter(r => r.kind !== 'bot').map(r => `${r.name || 'kb'} ${JSON.stringify(r.goals)}`).join(' ; ')}`)
await shot(pc, 'lobby-before-start')
await shot(A.page, 'A-lobby-late')
console.log('raw keys PC:', await rawKeys(pc), 'A:', await rawKeys(A.page))
for (const l of await drainLog(pc)) console.log('   ', l)

// lancement par le meneur
await pA.stop()
await tap(A, '.band__start')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(SPEED > 1 ? 600 : 1500)
await shot(pc, 'rules')
await shot(A.page, 'A-intro')
await shot(B.page, 'B-intro')
await sleep(SPEED > 1 ? 200 : 2500)
if ((await state(pc)).phase === 'rules') {
  await A.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
  await sleep(SPEED > 1 ? 100 : 700)
  await B.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 8000, 'manche 1')
await pA.start()

for (let r = 1; r <= ROUNDS; r++) {
  await refreshRoster()
  log(`— manche ${r} —`)
  await frameStats(pc)
  const gpuSamples = []
  let nextShot = Date.now()
  let phoneShots = 0
  const marks = new Set()
  while (true) {
    s = await state(pc)
    if (s.phase !== 'round') break
    gpuSamples.push(gpu())
    const key = s.phaseSun
    if (!marks.has(key)) {
      marks.add(key)
      await shot(pc, `r${r}-${key}`)
      nextShot = Date.now() + EVERY
      if (['countdown', 'golden', 'greatShadow'].includes(key) && phoneShots < 3) {
        phoneShots++
        await shot(A.page, `A-r${r}-${key}`)
        await shot(B.page, `B-r${r}-${key}`)
      }
    } else if (Date.now() >= nextShot) {
      nextShot = Date.now() + EVERY
      await shot(pc, `r${r}-t${Math.round(s.sunT)}`)
    }
    for (const l of await drainLog(pc)) console.log('   ', l)
    await sleep(250)
  }
  const fs = await frameStats(pc)
  const g = gpuSamples.filter(x => x >= 0)
  log(`images manche ${r} : ${JSON.stringify(fs)} ; gpu_busy moy ${g.length ? (g.reduce((a, b) => a + b, 0) / g.length).toFixed(0) : '?'} %`)
  // montée de nuit → résultats
  for (let i = 0; i < 6; i++) {
    await sleep(700)
    await shot(pc, `r${r}-night-${i}`)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.runner.phase), null, 20000, 'résultats')
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 20000, 'panneau')
  await sleep(1000)
  await shot(pc, `r${r}-results-a`)
  await sleep(SPEED > 1 ? 1200 : 3000)
  await shot(pc, `r${r}-results-b`)
  await shot(A.page, `A-r${r}-results`)
  await shot(B.page, `B-r${r}-results`)
  for (const l of await drainLog(pc)) console.log('   ', l)
  console.log('raw keys PC:', await rawKeys(pc), 'A:', await rawKeys(A.page))
  if ((await state(pc)).phase === 'roundResults') {
    await sleep(SPEED > 1 ? 0 : 3000)
    await shot(pc, `r${r}-results-c`)
    await A.page.locator('.result__ready .btn').click().catch(e => log(`Prêt A : ${e.message}`))
    await sleep(800)
    await shot(pc, `r${r}-results-1ready`)
    await B.page.locator('.result__ready .btn').click().catch(e => log(`Prêt B : ${e.message}`))
    // le clavier : Entrée n'est pas nécessaire (les téléphones suffisent)
    await waitFor(pc, () => ['round', 'matchResults'].includes(window.__ombres?.runner.phase), null, 20000, 'suite')
  }
}

await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 20000, 'fin de partie')
for (let i = 0; i < 5; i++) {
  await sleep(800)
  await shot(pc, `podium-${i}`)
}
await sleep(2500)
await shot(pc, 'podium-panel')
await shot(A.page, 'A-matchEnd')
await shot(B.page, 'B-matchEnd')
for (const l of await drainLog(pc)) console.log('   ', l)
console.log('raw keys PC:', await rawKeys(pc), 'A:', await rawKeys(A.page))
await A.page.locator('.vote-row .btn').first().click()
await sleep(1200)
await shot(pc, 'podium-1vote')
await B.page.locator('.vote-row .btn').first().click()
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres?.runner.roundIndex === 0, null, 20000, 'revanche')
await sleep(1500)
await shot(pc, 'rematch')
await waitFor(pc, () => (window.__ombres?.runner.sim?.state.sun.t ?? -9) > 8, null, 60000, 'revanche t>8')
// pause PC
await pc.keyboard.press('Escape')
await sleep(900)
await shot(pc, 'pause-pc')
await shot(A.page, 'A-pause-pc')
await pc.keyboard.press('Escape')
await sleep(900)
s = await state(pc)
log(`après 2e Échap : paused=${s.paused}`)
if (s.paused) {
  await pc.keyboard.press('Enter')
  await sleep(800)
}
// pause téléphone (appui long)
await pA.stop()
const pb = await center(A.page, '.pause-btn')
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pb.x, y: pb.y, id: 5, radiusX: 6, radiusY: 6, force: 1 }] })
await sleep(1300)
await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await sleep(800)
s = await state(pc)
log(`pause téléphone : paused=${s.paused}`)
await shot(pc, 'pause-phone')
await shot(A.page, 'A-pause-phone')
await shot(B.page, 'B-pause-phone')
const resumeBtn = A.page.locator('.overlay .btn--primary').first()
if (await resumeBtn.count()) await resumeBtn.click()
await sleep(1000)
s = await state(pc)
log(`reprise depuis le téléphone : paused=${s.paused}`)
await pc.keyboard.press('Escape')
await sleep(700)
// retour au salon depuis la pause (confirmation en deux temps)
const quit = pc.locator('.pause__menu button').last()
await quit.click().catch(() => {})
await sleep(400)
await shot(pc, 'pause-quit-confirm')
await quit.click().catch(() => {})
await sleep(1500)
s = await state(pc)
log(`après retour salon : phase=${s.phase}`)
await shot(pc, 'back-lobby')
await shot(A.page, 'A-back-lobby')
for (const l of await drainLog(pc)) console.log('   ', l)
await Promise.all([pB.stop(), pK.stop()])
console.log(`pilotes : A ${JSON.stringify(pA.stats)} B ${JSON.stringify(pB.stats)}`)
for (const [n, L] of [
  ['PC', pcLogs],
  ['A', A.logs],
  ['B', B.logs],
]) {
  const p = problems(L)
  console.log(p.length ? `${n} PROBLÈMES :\n  ${[...new Set(p)].join('\n  ')}` : `${n} console propre`)
}
await browser.close()
