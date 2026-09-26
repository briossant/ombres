// (b) Deux téléphones émulés (iPhone 15 Pro + Pixel 7, touches CDP) + un joueur au clavier :
// rejoindre par l'URL du QR, nom et couleur, objectifs du salon, lancement depuis le téléphone
// du meneur, cartes (« Compris »), manches, entractes (« Prêt »), fin de partie, revanche votée.
//   node tools/e2e/phones.mjs [--speed=6] [--rounds=3]
import { devices } from 'playwright-core'
import { ORIGIN, launch, newContext, collectLogs, shotDir, sleep, waitFor, state, errorsOf } from './lib.mjs'
import { join } from 'node:path'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const SPEED = Number(arg('speed') ?? 6)
const ROUNDS = Number(arg('rounds') ?? 3)
const dir = shotDir('phones')
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

const browser = await launch()
// ─── PC ───
const pcCtx = await newContext(browser)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc)
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await pc.keyboard.press('KeyX')
await sleep(500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon + QR')
if (ROUNDS !== 3) await pc.evaluate(r => window.__ombres.runner.setMatchSetting('rounds', r), ROUNDS)
const joinUrl = (await state(pc)).joinUrl
const url = new URL(joinUrl)
const phoneUrl = `${ORIGIN}${url.pathname}${url.search}`
log(`QR : ${joinUrl} → ${phoneUrl}`)
check('URL du QR : /play?r=CODE', /\/play\?r=[A-Z]{4}$/.test(joinUrl), joinUrl)

// ─── Téléphones ───
const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })
async function newPhone(device) {
  const ctx = await newContext(browser, { mobile: device, landscape: true })
  const page = await ctx.newPage()
  const logs = collectLogs(page)
  const cdp = await ctx.newCDPSession(page)
  return { page, logs, cdp, device }
}
async function center(page, sel) {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`introuvable : ${sel}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
async function tap(ph, sel, id = 9, ms = 60) {
  const c = await center(ph.page, sel)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(id, c.x, c.y)] })
  await sleep(ms)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
/** Joystick poussé vers (dx, dy) (px écran) + PLONGER éventuel, pendant ms. */
async function steer(ph, dx, dy, ms, dive = false) {
  const zone = await center(ph.page, '.stick-zone')
  const sx = zone.b.x + zone.b.width * 0.45
  const sy = zone.b.y + zone.b.height * 0.55
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx, sy)] })
  for (let i = 1; i <= 4; i++) {
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, sx + (dx * i) / 4, sy + (dy * i) / 4)] })
    await sleep(16)
  }
  if (dive) {
    const d = await center(ph.page, '.act--dive')
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx + dx, sy + dy), tp(2, d.x, d.y)] })
  }
  await sleep(ms)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const A = await newPhone('iPhone 15 Pro')
const B = await newPhone('Pixel 7')
for (const [ph, name, swatch] of [
  [A, 'Brieuc', 3],
  [B, 'Lou', 5],
]) {
  await ph.page.goto(phoneUrl, { waitUntil: 'load' })
  await waitFor(ph.page, () => !!document.querySelector('.profile'), null, 15000, `profil ${name}`)
  await sleep(300)
  await ph.page.fill('#phone-name', name)
  await ph.page.locator('.swatch').nth(swatch).click()
  await ph.page.locator('.profile__go').click()
  await waitFor(ph.page, () => !!document.querySelector('.lobby-goals'), null, 8000, `salon ${name}`)
}
await sleep(600)
await snap(A.page, 'phoneA-lobby')
let s = await state(pc)
const phones = s.roster.filter(r => r.kind === 'phone')
check('deux téléphones au salon, noms et couleurs reçus', phones.length === 2 && phones.some(p => p.name === 'Brieuc' && p.color === 3) && phones.some(p => p.name === 'Lou' && p.color === 5), JSON.stringify(phones.map(p => [p.name, p.color])))
// joueur au clavier
await pc.keyboard.press('Space')
await sleep(400)
// objectifs du salon : Vole + Plonge sur A, Vole sur B
await steer(A, 60, -40, 2400, true)
await steer(B, -50, 30, 2400)
await sleep(500)
s = await state(pc)
const ga = s.roster.find(r => r.name === 'Brieuc')?.goals
check('objectifs Vole + Plonge cochés (téléphone A)', !!ga?.fly && !!ga?.dive, JSON.stringify(ga))
check('bots par défaut pour 3 humains (1 Faucon)', s.roster.filter(r => r.kind === 'bot').length === 1, s.roster.map(r => r.kind).join(','))
await snap(pc, 'pc-lobby')
await snap(B.page, 'phoneB-lobby')

// lancement par le meneur (téléphone A)
await A.page.locator('.band__start').click()
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
check('lancement depuis le téléphone du meneur', true)
await waitFor(A.page, () => !!document.querySelector('.intro__cards'), null, 5000, 'cartes téléphone')
await sleep(700)
await snap(pc, 'pc-rules')
await snap(A.page, 'phoneA-intro')
await A.page.locator('.intro__foot .btn').click()
await sleep(300)
await B.page.locator('.intro__foot .btn').click()
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 6000, 'manche après OK')
check('cartes passées quand tous les téléphones ont tapé OK', true)

for (let r = 1; r <= ROUNDS; r++) {
  log(`manche ${r}`)
  await waitFor(A.page, () => !!document.querySelector('.act--dive'), null, 8000, 'manette')
  let k = 0
  let shotMid = false
  while ((await state(pc)).phase === 'round' && !(await state(pc)).over) {
    const dirs = [
      [60, 0],
      [0, -60],
      [-60, 0],
      [0, 60],
    ]
    const [dx, dy] = dirs[k % 4]
    await Promise.all([steer(A, dx, dy, 700, k % 2 === 0), steer(B, -dy, dx, 700, k % 3 === 0)])
    k++
    const st = await state(pc)
    if (!shotMid && st.phaseSun === 'golden') {
      shotMid = true
      await snap(pc, `pc-r${r}-golden`)
      await snap(A.page, `phoneA-r${r}-play`)
      await snap(B.page, `phoneB-r${r}-play`)
    }
    if (st.screen === 'roundResults') break
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 20000, 'résultats')
  await waitFor(A.page, () => !!document.querySelector('.result__ready .btn') || !!document.querySelector('.vote-row'), null, 8000, 'entracte téléphone')
  await sleep(1800)
  await snap(pc, `pc-r${r}-results`)
  await snap(A.page, `phoneA-r${r}-roundEnd`)
  if ((await state(pc)).screen === 'roundResults') {
    await A.page.locator('.result__ready .btn').click()
    await sleep(300)
    await B.page.locator('.result__ready .btn').click()
    if (r < ROUNDS) {
      await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 8000, 'manche suivante après Prêt')
      check(`entracte ${r} passé par « Prêt » des deux téléphones`, true)
    }
  }
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 20000, 'fin de partie')
await waitFor(A.page, () => !!document.querySelector('.vote-row'), null, 8000, 'fin de partie téléphone')
await sleep(1500)
await snap(pc, 'pc-match-results')
await snap(A.page, 'phoneA-matchEnd')
await snap(B.page, 'phoneB-matchEnd')
await A.page.locator('.vote-row .btn').first().click()
await sleep(300)
await B.page.locator('.vote-row .btn').first().click()
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres?.runner.roundIndex === 0, null, 8000, 'revanche')
check('revanche votée par la majorité des téléphones', true)
await sleep(1200)
s = await state(pc)
check('revanche : mêmes joueurs et couleurs', s.roster.length === 4 && s.roster.some(p => p.name === 'Brieuc' && p.color === 3), s.roster.map(p => `${p.kind}:${p.color}`).join(' '))
await snap(pc, 'pc-rematch')
await snap(A.page, 'phoneA-rematch')

const errs = [...errorsOf(pcLogs), ...errorsOf(A.logs), ...errorsOf(B.logs)]
check('aucune erreur console (PC + téléphones)', errs.length === 0, errs.slice(0, 5).join(' | '))
await browser.close()
const failed = checks.filter(c => !c.ok).length
console.log(failed ? `${failed} échec(s)` : 'tout est vert')
process.exit(failed ? 1 : 0)
