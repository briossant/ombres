// Critique « premier joueur » : un groupe qui découvre le jeu, sans explication orale.
// PC (1920×1080) + iPhone 15 Pro + Pixel 7 (d'abord en portrait, comme on scanne un QR) + clavier.
// Vitesse réelle (on juge aussi ce qui va trop vite).
//   PORT=8823 node tools/polish/firsttime/group.mjs [--lang=fr|en] [--rounds=3] [--name=fr-group]
import { ORIGIN, launch, pcContext, newPhoneFT, makeShots, sleep, waitFor, state, center, visibleText, overflowCheck, installProbe, drainLog, frameStats, collectLogs, problems } from './ft.mjs'
import { PhonePilot, KeyboardPilot } from '../../e2e/qa/pilot.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const LANG = arg('lang', 'fr')
const ROUNDS = Number(arg('rounds', '3'))
const NAME = arg('name', `${LANG}-group`)
const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US'
const { shot, log } = makeShots(NAME)

const browser = await launch()
const pcCtx = await pcContext(browser, LOCALE)
const pc = await pcCtx.newPage()
const pcLogs = collectLogs(pc, 'pc')

// ─── Chargement → titre ───
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'commit' })
for (let i = 0; i < 8; i++) {
  await sleep(450)
  await shot(pc, `loading-${i}`)
  const s = await pc.evaluate(() => window.__ombres?.useUi.getState().screen).catch(() => null)
  if (s === 'title') break
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await installProbe(pc)
// sonde de chevauchements HUD + bulles en double
await pc.evaluate(() => {
  const R = (window.__ovl = { pairs: {}, dupHints: [], samples: 0 })
  const rect = el => {
    const r = el.getBoundingClientRect()
    return r.width ? { x: r.x, y: r.y, w: r.width, h: r.height, t: (el.innerText || '').replace(/\s+/g, ' ').trim().slice(0, 50) } : null
  }
  const inter = (a, b) => a && b && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h
  setInterval(() => {
    if (window.__ombres?.runner.phase !== 'round') return
    R.samples++
    const g = sel => [...document.querySelectorAll(sel)].map(rect).filter(Boolean)
    const hints = g('.hint'), tags = g('.tag'), banners = g('.banner'), sand = g('.sandbar'), dial = g('.dial'), sub = g('.subtitle-wrap .recitatif'), cd = g('.countdown, .last-seconds'), toasts = g('.toast')
    const chk = (na, A, nb, B) => {
      for (const a of A) for (const b of B) if (a !== b && inter(a, b)) {
        const k = `${na}×${nb}`
        R.pairs[k] = R.pairs[k] ?? { n: 0, ex: [] }
        R.pairs[k].n++
        if (R.pairs[k].ex.length < 6) R.pairs[k].ex.push(`${a.t} ⟂ ${b.t} @${Math.round(a.x)},${Math.round(a.y)}`)
      }
    }
    chk('hint', hints, 'banner', banners)
    chk('hint', hints, 'sandbar', sand)
    chk('hint', hints, 'dial', dial)
    chk('hint', hints, 'subtitle', sub)
    chk('hint', hints, 'hint', hints)
    chk('tag', tags, 'sandbar', sand)
    chk('tag', tags, 'banner', banners)
    chk('tag', tags, 'dial', dial)
    chk('tag', tags, 'tag', tags)
    chk('hint', hints, 'toast', toasts)
    chk('subtitle', sub, 'banner', banners)
    chk('hint', hints, 'countdown', cd)
    const txts = [...document.querySelectorAll('.hint__text')].map(e => e.innerText)
    const dup = txts.filter((x, i) => txts.indexOf(x) !== i)
    if (dup.length && R.dupHints.length < 20) R.dupHints.push(dup[0])
  }, 150)
})
for (const [i, ms] of [[0, 300], [1, 2500], [2, 5000], [3, 9000], [4, 14000], [5, 20000], [6, 26000], [7, 32000]].map(([i, t], k, a) => [i, t - (k ? a[k - 1][1] : 0)])) {
  await sleep(ms)
  await shot(pc, `title-${i}`)
}
log(`titre : ${await visibleText(pc)}`)
await pc.keyboard.press('KeyX')
await sleep(900)
await shot(pc, 'title-menu')
log(`menu : ${await visibleText(pc)}`)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon + QR')
await sleep(1500)
await shot(pc, 'lobby-empty')
log(`salon vide : ${await visibleText(pc)}`)
if (ROUNDS !== 3) await pc.evaluate(r => window.__ombres.runner.setMatchSetting('rounds', r), ROUNDS)
// URL longue (déploiement) : débordement ?
const realUrl = (await state(pc)).joinUrl
await pc.evaluate(() => {
  const L = window.__ombres.useLobby
  window.__realJoin = L.getState().joinUrl
  L.setState({ joinUrl: 'https://ombres-011e623351e7.deploy.breizhware.com/play?r=' + L.getState().roomCode })
})
await sleep(500)
await shot(pc, 'lobby-longurl', { clip: { x: 0, y: 0, width: 700, height: 1080 } })
log(`URL longue : ${JSON.stringify(await overflowCheck(pc, ['.join__url', '.join', '.join__url b']))}`)
await pc.evaluate(() => window.__ombres.useLobby.setState({ joinUrl: window.__realJoin }))

const u = new URL(realUrl)
const phoneUrl = `${ORIGIN}${u.pathname}${u.search}`
log(`QR ${realUrl}`)

// ─── Téléphone A : iPhone, portrait d'abord ───
const A = await newPhoneFT(browser, 'iPhone 15 Pro', 'iphone', LOCALE, false)
await A.page.goto(phoneUrl, { waitUntil: 'load' })
await sleep(2500)
await shot(A.page, 'A-portrait-first')
log(`A portrait : ${await visibleText(A.page)}`)
await A.page.setViewportSize({ width: 659, height: 393 })
await sleep(1200)
await shot(A.page, 'A-landscape-profile')
log(`A profil : ${await visibleText(A.page)}`)
// le débutant ouvre « plus de couleurs » puis choisit
const more = A.page.locator('text=' + (LANG === 'fr' ? 'Plus de couleurs' : 'More colours'))
if (await more.count()) {
  await more.first().click().catch(() => {})
  await sleep(600)
  await shot(A.page, 'A-profile-more')
}
await A.page.fill('#phone-name', LANG === 'fr' ? 'Brieuc' : 'Sam')
await A.page.locator('.swatch').nth(3).click().catch(() => {})
await sleep(400)
await shot(A.page, 'A-profile-filled')
await A.page.locator('.profile__go').click()
await waitFor(A.page, () => !!document.querySelector('.lobby-goals'), null, 10000, 'salon A')
for (const [k, ms] of [[0, 400], [1, 2500], [2, 5200], [3, 10200]]) {
  await sleep(ms - (k ? [400, 2500, 5200, 10200][k - 1] : 0))
  await shot(A.page, `A-lobby-${k}`)
}
log(`A salon : ${await visibleText(A.page)}`)
await shot(pc, 'lobby-1phone')

// ─── Téléphone B : Pixel 7 ───
const B = await newPhoneFT(browser, 'Pixel 7', 'pixel', LOCALE, false)
await B.page.goto(phoneUrl, { waitUntil: 'load' })
await sleep(2500)
await shot(B.page, 'B-portrait-first')
const bv = devicesVP('Pixel 7')
await B.page.setViewportSize(bv)
await sleep(1000)
await shot(B.page, 'B-landscape-profile')
await B.page.fill('#phone-name', LANG === 'fr' ? 'Lou' : 'Kim')
await B.page.locator('.swatch').nth(5).click().catch(() => {})
await B.page.locator('.profile__go').click()
await waitFor(B.page, () => !!document.querySelector('.lobby-goals'), null, 10000, 'salon B')
await sleep(1500)
await shot(B.page, 'B-lobby')
// clavier
await pc.keyboard.press('Space')
await sleep(1200)
await shot(pc, 'lobby-3players')

let s = await state(pc)
log(`salon : ${s.roster.map(r => `${r.slot}:${r.kind}:${r.name || r.bot?.personality}:${r.color}`).join(' | ')}`)
const roster = () => globalThis.__roster ?? []
const refresh = async () => (globalThis.__roster = (await state(pc)).roster)
await refresh()
const slotOf = name => () => roster().find(r => r.name === name)?.slot ?? -1
const kbSlot = () => roster().find(r => r.kind === 'keyboard')?.slot ?? -1
const nA = LANG === 'fr' ? 'Brieuc' : 'Sam'
const nB = LANG === 'fr' ? 'Lou' : 'Kim'
const pA = new PhonePilot(A, pc, slotOf(nA), 3)
const pB = new PhonePilot(B, pc, slotOf(nB), 5)
const pK = new KeyboardPilot(pc, 1, kbSlot, 9)
await Promise.all([pA.start(), pB.start(), pK.start()])
await sleep(2500)
await shot(A.page, 'A-lobby-thumb')
// joystick vs carte des règles
const ov = await A.page.evaluate(() => {
  const r = s => document.querySelector(s)?.getBoundingClientRect()
  const j = r('.stick'), c = r('.lobby-rules'), g = r('.lobby-goals'), d = r('.act--dive'), f = r('.act--flap')
  const o = (a, b) => (a && b ? Math.max(0, Math.min(a.right, b.right) - Math.max(a.left, b.left)) * Math.max(0, Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top)) : 0)
  const box = x => x && { x: Math.round(x.x), y: Math.round(x.y), w: Math.round(x.width), h: Math.round(x.height) }
  return { stick: box(j), rules: box(c), goals: box(g), dive: box(d), flap: box(f), stickXrules: o(j, c), rulesXdive: o(c, d), rulesXflap: o(c, f), goalsXdive: o(g, d) }
})
log(`A salon géométrie : ${JSON.stringify(ov)}`)
await sleep(8000)
await shot(pc, 'lobby-flying')
await shot(A.page, 'A-lobby-flying')
await shot(B.page, 'B-lobby-flying')
await sleep(6000)
await refresh()
s = await state(pc)
log(`objectifs : ${s.roster.filter(r => r.kind !== 'bot').map(r => `${r.name || 'kb'} ${JSON.stringify(r.goals)}`).join(' ; ')}`)
await shot(pc, 'lobby-before-start')
await shot(A.page, 'A-lobby-late')
await shot(B.page, 'B-lobby-late')
log(`PC salon : ${await visibleText(pc)}`)
log(`B salon : ${await visibleText(B.page)}`)
for (const l of await drainLog(pc)) log(`   ${l}`)

// ─── Lancement par le meneur (téléphone A) ───
await pA.stop()
await center(A.page, '.band__start').then(async c => {
  await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: c.x, y: c.y, id: 9, radiusX: 6, radiusY: 6, force: 1 }] })
  await sleep(60)
  await A.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
})
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
const tRules = Date.now()
await sleep(700)
await shot(pc, 'rules-0')
await shot(A.page, 'A-intro')
await shot(B.page, 'B-intro')
log(`cartes PC : ${await visibleText(pc)}`)
log(`cartes A : ${await visibleText(A.page)}`)
await sleep(3000)
await shot(pc, 'rules-1')
await A.page.locator('.intro__foot .btn').click({ timeout: 3000 }).catch(() => {})
await sleep(1000)
await shot(pc, 'rules-2-1ok')
await shot(A.page, 'A-intro-ok')
// B ne touche rien : on laisse l'échéance décider
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 20000, 'manche 1')
log(`cartes → manche en ${((Date.now() - tRules) / 1000).toFixed(1)} s (B n'a pas appuyé)`)
await pA.start()

for (let r = 1; r <= ROUNDS; r++) {
  await refresh()
  log(`— manche ${r} —`)
  await frameStats(pc)
  let nextShot = Date.now()
  const marks = new Set()
  let lockShots = 0
  while (true) {
    s = await state(pc)
    if (s.phase !== 'round') break
    const key = s.phaseSun
    if (!marks.has(key)) {
      marks.add(key)
      await shot(pc, `r${r}-${key}`)
      if (r === 1 || key === 'greatShadow') {
        await shot(A.page, `A-r${r}-${key}`)
        await shot(B.page, `B-r${r}-${key}`)
      }
      nextShot = Date.now() + 4000
    } else if (Date.now() >= nextShot) {
      nextShot = Date.now() + (r === 1 ? 4000 : 8000)
      await shot(pc, `r${r}-t${Math.round(s.sunT)}`)
    }
    // PIQUER sur le téléphone : capture + géométrie
    if (lockShots < 3) {
      const tgt = await A.page.evaluate(() => {
        const e = document.querySelector('.act--dive.is-target')
        if (!e) return null
        const b = e.getBoundingClientRect()
        const st = document.querySelector('.act--dive .act__star')?.getBoundingClientRect()
        return { x: b.x, y: b.y, r: b.right, b: b.bottom, vw: innerWidth, vh: innerHeight, star: st && { x: st.x, y: st.y, r: st.right, b: st.bottom } }
      }).catch(() => null)
      if (tgt) {
        lockShots++
        log(`A PIQUER : ${JSON.stringify(tgt)}`)
        await shot(A.page, `A-r${r}-target-${lockShots}`)
      }
    }
    for (const l of await drainLog(pc)) log(`   ${l}`)
    await sleep(200)
  }
  const fs = await frameStats(pc)
  log(`images manche ${r} : ${JSON.stringify(fs)}`)
  for (let i = 0; i < 5; i++) {
    await sleep(900)
    await shot(pc, `r${r}-night-${i}`)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 25000, 'panneau')
  const tRes = Date.now()
  for (const [k, ms] of [[0, 600], [1, 2500], [2, 5000], [3, 8000]]) {
    await sleep(ms - (k ? [600, 2500, 5000, 8000][k - 1] : 0))
    await shot(pc, `r${r}-results-${k}`)
  }
  log(`résultats PC : ${await visibleText(pc)}`)
  await shot(A.page, `A-r${r}-results`)
  await shot(B.page, `B-r${r}-results`)
  log(`résultats A : ${await visibleText(A.page)}`)
  for (const l of await drainLog(pc)) log(`   ${l}`)
  if ((await state(pc)).phase === 'roundResults') {
    if (r === 1) {
      // personne n'appuie : combien de temps reste l'écran ?
      await waitFor(pc, () => ['round', 'matchResults', 'rules'].includes(window.__ombres?.runner.phase), null, 60000, 'suite auto')
      log(`résultats manche ${r} → suite automatique en ${((Date.now() - tRes) / 1000).toFixed(1)} s`)
    } else {
      await A.page.locator('.result__ready .btn').click().catch(e => log(`Prêt A : ${e.message}`))
      await sleep(800)
      await shot(pc, `r${r}-results-1ready`)
      await B.page.locator('.result__ready .btn').click().catch(e => log(`Prêt B : ${e.message}`))
      await waitFor(pc, () => ['round', 'matchResults', 'rules'].includes(window.__ombres?.runner.phase), null, 30000, 'suite')
    }
    const ph = (await state(pc)).phase
    if (ph === 'rules') {
      await sleep(600)
      await shot(pc, `r${r + 1}-cards`)
      await shot(A.page, `A-r${r + 1}-cards`)
      await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 20000, 'manche suivante')
    }
  }
}

await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 30000, 'fin de partie')
for (let i = 0; i < 6; i++) {
  await sleep(1500)
  await shot(pc, `podium-${i}`)
}
log(`podium PC : ${await visibleText(pc)}`)
await shot(A.page, 'A-matchEnd')
await shot(B.page, 'B-matchEnd')
log(`podium A : ${await visibleText(A.page)}`)
log(`podium B : ${await visibleText(B.page)}`)
for (const l of await drainLog(pc)) log(`   ${l}`)
const ovl = await pc.evaluate(() => window.__ovl)
log(`chevauchements HUD : ${JSON.stringify(ovl, null, 1)}`)
await A.page.locator('.vote-row .btn').first().click()
await sleep(1500)
await shot(pc, 'podium-1vote')
await shot(A.page, 'A-voted')
await B.page.locator('.vote-row .btn').first().click()
await waitFor(pc, () => ['round', 'rules'].includes(window.__ombres?.runner.phase), null, 30000, 'revanche')
await sleep(1500)
await shot(pc, 'rematch')
await shot(A.page, 'A-rematch')
log(`revanche : phase ${(await state(pc)).phase}`)
await Promise.all([pA.stop(), pB.stop(), pK.stop()])
console.log(`pilotes : A ${JSON.stringify(pA.stats)} B ${JSON.stringify(pB.stats)}`)
for (const [n, L] of [['PC', pcLogs], ['A', A.logs], ['B', B.logs]]) {
  const p = problems(L)
  log(p.length ? `${n} PROBLÈMES :\n  ${[...new Set(p)].slice(0, 20).join('\n  ')}` : `${n} console propre`)
}
await browser.close()

function devicesVP(name) {
  return name === 'Pixel 7' ? { width: 839, height: 412 } : { width: 659, height: 393 }
}
