// Revue DA : une partie complète vue par un directeur artistique (PC + iPhone 15 Pro + Pixel 7 + clavier + bots).
// Salon (vide, URL longue, joueurs, téléphones), cartes, 3 manches à vitesse réelle (captures serrées en
// manche 1, par phase ensuite), nuit → résultats, podium, téléphones à chaque écran.
//   PORT=8821 node tools/polish/art/match.mjs [--every=3000] [--every2=9000] [--rounds=3] [--name=match] [--lang=fr]
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, state, problems, arg, newPhone, joinPhone, tap, presetSettings } from '../../e2e/qa/lib.mjs'
import { PhonePilot, KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

const EVERY = Number(arg('every', '3000'))
const EVERY2 = Number(arg('every2', '9000'))
const ROUNDS = Number(arg('rounds', '3'))
const NAME = arg('name', 'match')
const LANG = arg('lang', 'fr')
const dir = join(import.meta.dirname, '../../../shots/polish/art', NAME)
mkdirSync(dir, { recursive: true })
let n = 0
const t0 = Date.now()
const stamp = () => ((Date.now() - t0) / 1000).toFixed(0)
const shot = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 82 }).catch(e => console.log('shot fail', label, e.message))
  return f
}
const log = m => console.log(`[${stamp()} s] ${m}`)

const browser = await launch()
const pcCtx = await newContext(browser)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc, 'pc')
await presetSettings(pc, { lang: LANG })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(2500)
await pc.keyboard.press('KeyX')
await sleep(600)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon + QR')
await sleep(2500)
await shot(pc, 'lobby-empty')
// URL longue (domaine de déploiement)
const joinUrl = (await state(pc)).joinUrl
await pc.evaluate(() => {
  const L = window.__ombres.useLobby
  const u = new URL(L.getState().joinUrl)
  window.__realJoin = L.getState().joinUrl
  L.setState({ joinUrl: `https://ombres-011e623351e7.deploy.breizhware.com/play${u.search}` })
})
await sleep(600)
await shot(pc, 'lobby-longurl')
await pc.evaluate(() => window.__ombres.useLobby.setState({ joinUrl: window.__realJoin }))
const u = new URL(joinUrl)
const phoneUrl = `${ORIGIN}${u.pathname}${u.search}`
log(`QR ${joinUrl}`)

const A = await newPhone(browser, 'iPhone 15 Pro', 'iphone')
const B = await newPhone(browser, 'Pixel 7', 'pixel')
await A.page.goto(phoneUrl, { waitUntil: 'load' })
await waitFor(A.page, () => !!document.querySelector('.profile'), null, 20000, 'profil A')
await sleep(900)
await shot(A.page, 'A-profile')
await joinPhone(A, phoneUrl, 'Brieuc', 3)
await sleep(1500)
await shot(A.page, 'A-lobby-idle')
await shot(pc, 'lobby-1phone')
await joinPhone(B, phoneUrl, 'Lou', 5)
await sleep(600)
await pc.keyboard.press('Space')
await sleep(1200)
let s = await state(pc)
log(`salon : ${s.roster.map(r => `${r.slot}:${r.kind}:${r.name || r.bot?.personality}:${r.color}`).join(' | ')}`)
globalThis.__roster = s.roster
const slotOf = name => () => (globalThis.__roster?.find(r => r.name === name)?.slot ?? -1)
const kbSlot = () => globalThis.__roster?.find(r => r.kind === 'keyboard')?.slot ?? -1
const pA = new PhonePilot(A, pc, slotOf('Brieuc'), 3)
const pB = new PhonePilot(B, pc, slotOf('Lou'), 5)
const pK = new KeyboardPilot(pc, 1, kbSlot, 9)
await Promise.all([pA.start(), pB.start(), pK.start()])
await sleep(3000)
await shot(pc, 'lobby-flying')
await shot(A.page, 'A-lobby-flying')
await shot(B.page, 'B-lobby-flying')
await sleep(5000)
await shot(pc, 'lobby-flying-b')
await shot(A.page, 'A-lobby-flying-b')
await pA.stop()
await sleep(1500)
await shot(A.page, 'A-lobby-still')
await pA.start()
await sleep(3000)
globalThis.__roster = (await state(pc)).roster
await shot(pc, 'lobby-before-start')

await pA.stop()
await tap(A, '.band__start')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(1500)
await shot(pc, 'rules-a')
await shot(A.page, 'A-rules')
await shot(B.page, 'B-rules')
await sleep(3000)
await shot(pc, 'rules-b')
if ((await state(pc)).phase === 'rules') {
  await A.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
  await sleep(700)
  await B.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 12000, 'manche 1')
await pA.start()

for (let r = 1; r <= ROUNDS; r++) {
  globalThis.__roster = (await state(pc)).roster
  log(`— manche ${r} —`)
  const every = r === 1 ? EVERY : EVERY2
  let nextShot = Date.now()
  let nextPhone = Date.now() + 4000
  let targets = 0
  const marks = new Set()
  while (true) {
    s = await state(pc)
    if (s.phase !== 'round') break
    const key = s.phaseSun
    if (!marks.has(key)) {
      marks.add(key)
      await shot(pc, `r${r}-${key}-t${Math.round(s.sunT)}`)
      await shot(A.page, `A-r${r}-${key}`)
      if (r === 1) await shot(B.page, `B-r${r}-${key}`)
      nextShot = Date.now() + every
    } else if (Date.now() >= nextShot) {
      nextShot = Date.now() + every
      await shot(pc, `r${r}-${key}-t${Math.round(s.sunT)}`)
    }
    if (r === 1 && Date.now() >= nextPhone) {
      nextPhone = Date.now() + 15000
      await shot(A.page, `A-r${r}-t${Math.round(s.sunT)}`)
    }
    if (targets < 3) {
      const tgt = await A.page.evaluate(() => !!document.querySelector('.act--dive.is-target')).catch(() => false)
      if (tgt) {
        targets++
        await shot(A.page, `A-r${r}-TARGET`)
      }
    }
    await sleep(200)
  }
  for (let i = 0; i < 8; i++) {
    await sleep(600)
    await shot(pc, `r${r}-night-${i}`)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 20000, 'panneau')
  await sleep(1200)
  await shot(pc, `r${r}-results-a`)
  await sleep(3000)
  await shot(pc, `r${r}-results-b`)
  await shot(A.page, `A-r${r}-results`)
  if (r === 1) await shot(B.page, `B-r${r}-results`)
  if ((await state(pc)).phase === 'roundResults') {
    await sleep(3000)
    await shot(pc, `r${r}-results-c`)
    await A.page.locator('.result__ready .btn').click().catch(e => log(`Prêt A : ${e.message}`))
    await sleep(500)
    await B.page.locator('.result__ready .btn').click().catch(e => log(`Prêt B : ${e.message}`))
    await waitFor(pc, () => ['round', 'matchResults'].includes(window.__ombres?.runner.phase), null, 30000, 'suite')
    await sleep(400)
    await shot(pc, `r${r + 1}-countdown-a`)
  }
}
await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 20000, 'fin de partie')
for (let i = 0; i < 6; i++) {
  await sleep(900)
  await shot(pc, `podium-${i}`)
}
await sleep(3000)
await shot(pc, 'podium-panel')
await shot(A.page, 'A-matchEnd')
await shot(B.page, 'B-matchEnd')
await sleep(4000)
await shot(pc, 'podium-late')
log(JSON.stringify((await state(pc)).roster.map(r => [r.slot, r.kind, r.name || r.bot?.personality, r.color])))
const res = await pc.evaluate(() => window.__ombres.useMatchResults?.getState?.())
console.log(JSON.stringify(res)?.slice(0, 1500))
const errs = problems(pcLogs)
console.log(errs.length ? `PROBLÈMES :\n${errs.join('\n')}` : 'console propre')
await pA.stop()
await pB.stop()
await pK.stop()
await browser.close()
