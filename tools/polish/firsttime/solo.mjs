// Critique « premier joueur » : SEUL avec UN téléphone contre les bots, sans toucher au PC
// après « Jouer » (tout se fait depuis la manette) ; partie accélérée pour le flux.
//   PORT=8823 node tools/polish/firsttime/solo.mjs [--lang=fr] [--speed=3]
import { ORIGIN, launch, pcContext, newPhoneFT, makeShots, sleep, waitFor, state, visibleText, installProbe, drainLog, collectLogs, problems } from './ft.mjs'
import { PhonePilot } from '../../e2e/qa/pilot.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const LANG = arg('lang', 'fr')
const SPEED = Number(arg('speed', '3'))
const LOCALE = LANG === 'fr' ? 'fr-FR' : 'en-US'
const { shot, log } = makeShots(`${LANG}-solo`)
const browser = await launch()
const pc = await (await pcContext(browser, LOCALE)).newPage()
const pcLogs = collectLogs(pc, 'pc')
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=${SPEED}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await installProbe(pc)
await pc.keyboard.press('Enter')
await sleep(500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon')
const s0 = await state(pc)
const u = new URL(s0.joinUrl)
const P = await newPhoneFT(browser, 'iPhone 15 Pro', 'iphone', LOCALE, true)
await P.page.goto(`${ORIGIN}${u.pathname}${u.search}`, { waitUntil: 'load' })
await waitFor(P.page, () => !!document.querySelector('.profile'), null, 20000, 'profil')
await P.page.locator('.profile__go').click()
await waitFor(P.page, () => !!document.querySelector('.lobby-goals'), null, 10000, 'salon tel')
await sleep(1500)
await shot(pc, 'lobby-solo')
await shot(P.page, 'phone-lobby')
let s = await state(pc)
log(`roster solo : ${s.roster.map(r => `${r.kind}:${r.name || r.bot?.personality}/${r.bot?.level ?? ''}`).join(' | ')}`)
const me = s.roster.find(r => r.kind === 'phone')
const pilot = new PhonePilot(P, pc, () => me.slot, 13)
await pilot.start()
await sleep(8000)
s = await state(pc)
log(`objectifs : ${JSON.stringify(s.roster.find(r => r.kind === 'phone').goals)}`)
await shot(P.page, 'phone-lobby-late')
await pilot.stop()
// lancer depuis le téléphone
await P.page.locator('.band__start').click()
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(500)
await P.page.locator('.intro__foot .btn').click().catch(() => {})
const tOk = Date.now()
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 10000, 'manche')
log(`Compris → manche : ${((Date.now() - tOk) / 1000).toFixed(1)} s`)
await pilot.start()
for (let r = 1; r <= 3; r++) {
  while ((await state(pc)).phase === 'round') {
    for (const l of await drainLog(pc)) log(`   ${l}`)
    await sleep(500)
  }
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres?.useUi.getState().screen), null, 30000, 'résultats')
  await sleep(1500)
  await shot(pc, `r${r}-results`)
  await shot(P.page, `r${r}-phone-results`)
  log(`r${r} tel : ${await visibleText(P.page)}`)
  log(`r${r} PC : ${await visibleText(pc)}`)
  if ((await state(pc)).phase === 'roundResults') {
    await P.page.locator('.result__ready .btn').click().catch(e => log(`Prêt : ${e.message}`))
    const t0 = Date.now()
    await waitFor(pc, () => ['round', 'rules', 'matchResults'].includes(window.__ombres?.runner.phase), null, 30000, 'suite')
    log(`Prêt → suite : ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  } else break
}
await pilot.stop()
for (const l of await drainLog(pc)) log(`   ${l}`)
await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 30000, 'podium')
await sleep(3000)
await shot(pc, 'podium')
await shot(P.page, 'phone-podium')
log(`podium tel : ${await visibleText(P.page)}`)
// revanche depuis le téléphone, puis « Salon » à la partie suivante
await P.page.locator('.vote-row .btn').first().click()
const tv = Date.now()
await waitFor(pc, () => ['round', 'rules'].includes(window.__ombres?.runner.phase), null, 30000, 'revanche')
log(`vote revanche → partie : ${((Date.now() - tv) / 1000).toFixed(1)} s`)
await sleep(1500)
await shot(pc, 'rematch')
await shot(P.page, 'phone-rematch')
// pause depuis le téléphone (appui court puis long)
const pb = await P.page.locator('.pause-btn').boundingBox()
if (pb) {
  await P.page.mouse.click(pb.x + pb.width / 2, pb.y + pb.height / 2)
  await sleep(700)
  await shot(P.page, 'phone-pause-short')
  log(`après appui court sur pause : paused=${(await state(pc)).paused} ; tel ${await visibleText(P.page)}`)
}
const p = problems(pcLogs).concat(problems(P.logs))
log(p.length ? `PROBLÈMES : ${[...new Set(p)].join(' | ')}` : 'console propre')
await browser.close()
