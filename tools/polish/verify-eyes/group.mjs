// Regard final (verify-eyes) : une vraie partie PC + iPhone 15 Pro + Pixel 7 + bots, à vitesse 1.
// Chargement → titre (séquence) → réglages → crédits → salon → cartes → 3 manches (captures à
// instants fixes + rafales de touches / esquives) → résultats → podium (rafale) → revanche → pause.
//   PORT=8843 node --import ./tools/polish/staging/nohmr.mjs tools/polish/verify-eyes/group.mjs [--rounds=3] [--lang=fr]
import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, state, problems, arg, newPhone, joinPhone, tap, rawKeys } from '../../e2e/qa/lib.mjs'
import { PhonePilot, KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { installProbe, drainLog, frameStats } from '../../e2e/qa/probe.mjs'

const ROUNDS = Number(arg('rounds', '3'))
const LANG = arg('lang', 'fr')
const NAME = arg('name', `group-${LANG}`)
const dir = join(import.meta.dirname, '../../../shots/polish/verify-eyes', NAME)
mkdirSync(dir, { recursive: true })
const logFile = join(dir, '_log.txt')
writeFileSync(logFile, '')
const t0 = Date.now()
const log = m => {
  const l = `[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`
  console.log(l)
  appendFileSync(logFile, l + '\n')
}
let n = 0
const shot = async (page, label) => {
  const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
  try {
    await page.screenshot({ path: f, type: 'jpeg', quality: 82 })
  } catch (e) {
    log(`shot FAILED ${label}: ${e.message}`)
  }
  return f
}

const browser = await launch()
const pcCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, locale: LANG === 'fr' ? 'fr-FR' : 'en-US' })
const pc = await pcCtx.newPage()
await pc.addInitScript(lang => {
  try {
    const k = 'ombres.settings.v1'
    const s = JSON.parse(localStorage.getItem(k) ?? '{}')
    localStorage.setItem(k, JSON.stringify({ ...s, lang }))
  } catch {}
}, LANG)
const pcLogs = collectLogs(pc, 'pc')
// Chargement : premières images (H13, G12)
const nav = pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'commit' })
await nav
for (const ms of [250, 700, 1400, 2500, 4000]) {
  await sleep(ms - (ms === 250 ? 0 : 0))
  await shot(pc, `load-${ms}`)
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
log(`titre après ${((Date.now() - t0) / 1000).toFixed(1)} s ; qualité ${await pc.evaluate(() => JSON.stringify(window.__ombres.useRenderQuality?.getState?.() ?? null))}`)
await installProbe(pc)
// Séquence du titre (S4, H10, H12, H15) : 36 s, une image toutes les 1,5 s
for (let i = 0; i < 24; i++) {
  await shot(pc, `title-${String(i).padStart(2, '0')}`)
  await sleep(1500)
}
// menu → réglages → crédits
await pc.keyboard.press('KeyX')
await sleep(700)
await shot(pc, 'title-menu')
await pc.evaluate(() => window.__ombres.useUi.setState({ overlay: 'settings' }))
await sleep(900)
await shot(pc, 'settings')
// onglets des réglages
const tabs = pc.locator('.settings [role=tab], .settings__tab, .tabs button')
const nt = await tabs.count().catch(() => 0)
for (let i = 1; i < Math.min(nt, 5); i++) {
  await tabs.nth(i).click().catch(() => {})
  await sleep(500)
  await shot(pc, `settings-tab${i}`)
}
await pc.keyboard.press('Escape')
await sleep(700)
await pc.locator('.title__menu button').nth(2).click().catch(e => log(`crédits: ${e.message}`))
await sleep(1500)
await shot(pc, 'credits-a')
await sleep(5000)
await shot(pc, 'credits-b')
await pc.mouse.wheel(0, 1500)
await sleep(1200)
await shot(pc, 'credits-c')
await pc.keyboard.press('Escape')
await sleep(1200)
await shot(pc, 'title-back')
await pc.keyboard.press('Enter').catch(() => {})
await sleep(400)
if ((await state(pc)).screen === 'title') {
  await pc.keyboard.press('KeyX')
  await sleep(500)
  await pc.keyboard.press('Enter')
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon + QR')
await sleep(1500)
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
await sleep(800)
await shot(A.page, 'A-profile')
await joinPhone(A, phoneUrl, 'Brieuc', 3)
await sleep(1000)
await shot(pc, 'lobby-1phone')
await shot(A.page, 'A-lobby-idle')
await joinPhone(B, phoneUrl, 'Lou', 5)
await sleep(1000)
let s = await state(pc)
log(`salon : ${s.roster.map(r => `${r.slot}:${r.kind}:${r.name || r.bot?.personality}:${r.color}`).join(' | ')}`)
const slotOf = name => () => globalThis.__roster?.find(r => r.name === name)?.slot ?? -1
const refreshRoster = async () => (globalThis.__roster = (await state(pc)).roster)
await refreshRoster()
await shot(pc, 'lobby-2phones-idle')
const pA = new PhonePilot(A, pc, slotOf('Brieuc'), 3)
const pB = new PhonePilot(B, pc, slotOf('Lou'), 5)
await pA.start()
await sleep(2500)
await shot(A.page, 'A-lobby-piloting')
await pB.start()
await sleep(4000)
await shot(pc, 'lobby-flying-a')
await sleep(6000)
await shot(pc, 'lobby-flying-b')
await shot(B.page, 'B-lobby')
await sleep(8000)
await refreshRoster()
s = await state(pc)
log(`objectifs : ${s.roster.filter(r => r.kind !== 'bot').map(r => `${r.name || 'kb'} ${JSON.stringify(r.goals)}`).join(' ; ')}`)
await shot(pc, 'lobby-before-start')
await shot(A.page, 'A-lobby-late')
log(`raw keys PC: ${JSON.stringify(await rawKeys(pc))} A: ${JSON.stringify(await rawKeys(A.page))}`)
for (const l of await drainLog(pc)) log(`   ${l}`)

// lancement par le meneur
await pA.stop()
await pB.stop()
await tap(A, '.band__start')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
for (let i = 0; i < 4; i++) {
  await sleep(1400)
  await shot(pc, `rules-${i}`)
  if (i === 0) {
    await shot(A.page, 'A-intro')
    await shot(B.page, 'B-intro')
  }
}
if ((await state(pc)).phase === 'rules') {
  await A.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
  await sleep(700)
  await B.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 15000, 'manche 1')

// sondes d'événements (touches, esquives, flashs)
await pc.evaluate(() => {
  const E = (window.__veEvents = [])
  window.__ombres.simEvents.on(e => {
    if (e.type === 'diveHit' || (e.type === 'diveMiss' && e.dodged) || e.type === 'crown') E.push({ ...e, at: window.__ombres.runner.sim?.state.sun.t })
  })
})

const TIMES = [-2.0, 0.2, 0.5, 1.0, 5, 12, 20, 30, 42, 55.6, 62, 70, 78, 86.5, 92, 98.6, 101, 104, 106.5, 108.3, 109.6]
for (let r = 1; r <= ROUNDS; r++) {
  await refreshRoster()
  log(`— manche ${r} — oiseaux ${(await state(pc)).birds}`)
  await frameStats(pc)
  await pA.start()
  await pB.start()
  let ti = 0
  let bursts = 0
  let phoneShots = 0
  while (true) {
    s = await state(pc)
    if (s.phase !== 'round' || s.sunT === null) break
    if (s.over) break
    while (ti < TIMES.length && s.sunT >= TIMES[ti]) {
      if (s.sunT - TIMES[ti] < 1.2) {
        await shot(pc, `r${r}-t${TIMES[ti].toFixed(1)}-${s.phaseSun}`)
        if ([-2.0, 55.6, 86.5, 101].includes(TIMES[ti]) && phoneShots < 4) {
          phoneShots++
          await shot(A.page, `A-r${r}-t${TIMES[ti]}`)
          await shot(B.page, `B-r${r}-t${TIMES[ti]}`)
        }
      }
      ti++
    }
    const ev = await pc.evaluate(() => window.__veEvents.splice(0))
    for (const e of ev) {
      log(`   ev ${e.type} t=${e.at?.toFixed(1)} ${e.type === 'diveHit' ? `hunter=${e.hunter} target=${e.target} stolen=${e.stolenCells} crown=${e.crown}` : e.type === 'diveMiss' ? `dodged hunter=${e.hunter} target=${e.target}` : `slot=${e.slot}`}`)
    }
    const hit = ev.find(e => e.type === 'diveHit' || e.type === 'diveMiss')
    if (hit && bursts < 3 && s.sunT < 96) {
      bursts++
      for (let k = 0; k < 4; k++) {
        await shot(pc, `r${r}-burst${bursts}-${hit.type}-${k}`)
        await sleep(220)
      }
    }
    for (const l of await drainLog(pc)) log(`   ${l}`)
    await sleep(60)
  }
  const fs = await frameStats(pc)
  log(`images manche ${r} : ${JSON.stringify(fs)}`)
  for (let i = 0; i < 4; i++) {
    await shot(pc, `r${r}-night-${i}`)
    await sleep(900)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.runner.phase), null, 20000, 'résultats')
  if ((await state(pc)).phase === 'matchResults') break
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'roundResults', null, 20000, 'panneau')
  for (const ms of [300, 1500, 3000, 5000]) {
    await sleep(ms === 300 ? 300 : 1400)
    await shot(pc, `r${r}-results-${ms}`)
  }
  await shot(A.page, `A-r${r}-results`)
  await shot(B.page, `B-r${r}-results`)
  for (const l of await drainLog(pc)) log(`   ${l}`)
  log(`raw keys PC: ${JSON.stringify(await rawKeys(pc))}`)
  await pA.stop()
  await pB.stop()
  if ((await state(pc)).phase === 'roundResults') {
    await sleep(2000)
    await shot(pc, `r${r}-results-late`)
    await A.page.locator('.result__ready .btn').click().catch(e => log(`Prêt A : ${e.message}`))
    await sleep(800)
    await B.page.locator('.result__ready .btn').click().catch(e => log(`Prêt B : ${e.message}`))
    // transition résultats → compte à rebours (H12 : panneau sorti en < 200 ms)
    await waitFor(pc, () => ['round', 'matchResults'].includes(window.__ombres?.runner.phase), null, 20000, 'suite')
    await sleep(120)
    await shot(pc, `r${r}-to-next`)
  }
}

await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 30000, 'fin de partie')
await pA.stop().catch(() => {})
await pB.stop().catch(() => {})
// Podium : rafale (S5, B3, H6 : 2,5 s de plan pur, dérive)
for (const ms of [500, 1500, 2300, 3200, 4500, 6500, 9500, 12500]) {
  await sleep(ms === 500 ? 500 : [1000, 800, 900, 1300, 2000, 3000, 3000][[1500, 2300, 3200, 4500, 6500, 9500, 12500].indexOf(ms)])
  await shot(pc, `podium-${ms}`)
}
await shot(A.page, 'A-matchEnd')
await shot(B.page, 'B-matchEnd')
for (const l of await drainLog(pc)) log(`   ${l}`)
log(`raw keys PC: ${JSON.stringify(await rawKeys(pc))} A: ${JSON.stringify(await rawKeys(A.page))}`)
const podiumText = await pc.evaluate(() => document.body.innerText.split('\n').map(x => x.trim()).filter(Boolean).join(' | '))
log(`podium texte : ${podiumText}`)
await A.page.locator('.vote-row .btn').first().click().catch(e => log(`vote A ${e.message}`))
await sleep(1200)
await B.page.locator('.vote-row .btn').first().click().catch(e => log(`vote B ${e.message}`))
await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres?.runner.roundIndex === 0, null, 30000, 'revanche').catch(e => log(e.message))
await sleep(1500)
await shot(pc, 'rematch-countdown')
await pA.start()
await waitFor(pc, () => (window.__ombres?.runner.sim?.state.sun.t ?? -9) > 12, null, 60000, 'revanche t>12').catch(e => log(e.message))
await shot(pc, 'rematch-t12')
await pc.keyboard.press('Escape')
await sleep(900)
await shot(pc, 'pause-pc')
await shot(A.page, 'A-pause-pc')
await pc.keyboard.press('Escape')
await sleep(1500)
await shot(pc, 'resume')
await pA.stop()
log(`problèmes PC : ${JSON.stringify(problems(pcLogs).slice(0, 20))}`)
log(`problèmes A : ${JSON.stringify(problems(A.logs).slice(0, 10))} B : ${JSON.stringify(problems(B.logs).slice(0, 10))}`)
await browser.close()
log('fin')
