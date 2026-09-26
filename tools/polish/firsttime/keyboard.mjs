// Critique « premier joueur » : 100 % clavier sur le PC (aucune souris, aucun téléphone),
// puis ce qui arrive à un téléphone quand le PC recule au titre (Échap au salon).
//   PORT=8823 node tools/polish/firsttime/keyboard.mjs [--lang=fr]
import { ORIGIN, launch, pcContext, newPhoneFT, makeShots, sleep, waitFor, state, visibleText, installProbe, drainLog, collectLogs, problems } from './ft.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const LANG = arg('lang', 'fr')
const { shot, log } = makeShots(`${LANG}-keyboard`)
const browser = await launch()
const ctx = await pcContext(browser, LANG === 'fr' ? 'fr-FR' : 'en-US')
const pc = await ctx.newPage()
const logs = collectLogs(pc, 'pc')
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await installProbe(pc)
await sleep(2000)
const focusInfo = () => pc.evaluate(() => {
  const a = document.activeElement
  return a ? `${a.tagName}.${a.className} « ${(a.innerText || a.getAttribute('aria-label') || '').replace(/\s+/g, ' ').slice(0, 60)} »` : 'none'
})
// Espace au titre : ouvre le menu (n'importe quelle touche)
await pc.keyboard.press('Space')
await sleep(800)
await shot(pc, 'title-menu')
log(`focus titre : ${await focusInfo()}`)
// flèches dans le menu
await pc.keyboard.press('ArrowDown')
await sleep(300)
log(`focus ↓ : ${await focusInfo()}`)
await pc.keyboard.press('Enter')
await sleep(1000)
await shot(pc, 'settings-from-title')
log(`réglages : ${await visibleText(pc)}`)
await pc.keyboard.press('Escape')
await sleep(600)
log(`focus après Échap : ${await focusInfo()}`)
await pc.keyboard.press('ArrowUp')
await sleep(200)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 15000, 'salon')
await sleep(1500)
await shot(pc, 'lobby')
log(`focus salon : ${await focusInfo()}`)
// réglages de partie au clavier AVANT de rejoindre : flèches
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowLeft']) {
  await pc.keyboard.press(k)
  await sleep(250)
  log(`focus ${k} : ${await focusInfo()}`)
}
await shot(pc, 'lobby-arrows')
let s = await state(pc)
log(`manches après flèches : ${await pc.evaluate(() => JSON.stringify(window.__ombres.useLobby.getState().match))}`)
// rejoindre au clavier
await pc.keyboard.press('Space')
await sleep(1200)
await shot(pc, 'lobby-joined')
log(`salon rejoint : ${await visibleText(pc)}`)
// les flèches pilotent maintenant l'oiseau : peut-on encore régler la partie ?
await pc.keyboard.press('ArrowRight')
await sleep(300)
log(`focus après → (rejoint) : ${await focusInfo()} ; match ${await pc.evaluate(() => JSON.stringify(window.__ombres.useLobby.getState().match))}`)
// voler un peu (ZQSD/WASD positions physiques)
await pc.keyboard.down('KeyW')
await sleep(1500)
await pc.keyboard.down('Space')
await sleep(1500)
await pc.keyboard.up('Space')
await pc.keyboard.up('KeyW')
await sleep(800)
await shot(pc, 'lobby-flying')
s = await state(pc)
log(`roster : ${JSON.stringify(s.roster.map(r => [r.kind, r.name, r.goals]))}`)
// quitter le salon ? (Échap, Retour arrière, Suppr)
for (const k of ['Backspace', 'Delete']) {
  await pc.keyboard.press(k)
  await sleep(500)
  s = await state(pc)
  log(`après ${k} : écran ${s.screen}, clavier ${s.roster.filter(r => r.kind === 'keyboard').length}`)
}
// un téléphone rejoint, puis Échap sur le PC
const P = await newPhoneFT(browser, 'Pixel 7', 'pixel', LANG === 'fr' ? 'fr-FR' : 'en-US', true)
const u = new URL(s.joinUrl)
await P.page.goto(`${ORIGIN}${u.pathname}${u.search}`, { waitUntil: 'load' })
await waitFor(P.page, () => !!document.querySelector('.profile'), null, 20000, 'profil')
await P.page.locator('.profile__go').click()
await waitFor(P.page, () => !!document.querySelector('.lobby-goals'), null, 10000, 'salon tel')
await sleep(1000)
await pc.keyboard.press('Escape')
await sleep(1500)
s = await state(pc)
log(`après Échap (tel + clavier au salon) : écran ${s.screen}, roster ${s.roster.map(r => r.kind).join(',')}`)
await shot(pc, 'esc-from-lobby')
await shot(P.page, 'phone-after-pc-esc')
log(`téléphone après Échap PC : ${await visibleText(P.page)}`)
// retour au salon
if (s.screen === 'title') {
  await pc.keyboard.press('Enter')
  await sleep(1500)
}
s = await state(pc)
log(`retour : écran ${s.screen}, roster ${s.roster.map(r => `${r.kind}:${r.name}`).join(',')}`)
await shot(pc, 'lobby-back')
await P.ctx.close()
await sleep(4000)
if (!(await state(pc)).roster.some(r => r.kind === 'keyboard')) {
  await pc.keyboard.press('Space')
  await sleep(800)
}
// 1 manche
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await sleep(800)
await shot(pc, 'rules')
log(`cartes : ${await visibleText(pc)}`)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'game', null, 8000, 'manche')
const kbSlot = () => globalThis.__kb ?? -1
globalThis.__kb = (await state(pc)).roster.find(r => r.kind === 'keyboard')?.slot ?? -1
const pilot = new KeyboardPilot(pc, 1, kbSlot, 5)
await pilot.start()
let paused = false
let settingsSeen = false
let n = 0
while ((await state(pc)).phase === 'round') {
  const t = (await state(pc)).sunT ?? 0
  if (t > 25 && !paused) {
    paused = true
    await pilot.stop()
    await pc.keyboard.press('Escape')
    await sleep(900)
    await shot(pc, 'pause')
    log(`pause : ${await visibleText(pc)} ; focus ${await focusInfo()}`)
    await pc.keyboard.press('ArrowDown')
    await sleep(250)
    log(`focus ↓ : ${await focusInfo()}`)
    await pc.keyboard.press('Enter')
    await sleep(900)
    await shot(pc, 'pause-settings')
    // défiler jusqu'aux touches
    await pc.evaluate(() => document.querySelector('.settings')?.scrollTo?.(0, 9999))
    await sleep(400)
    await shot(pc, 'pause-settings-keys')
    log(`réglages (pause) : ${await visibleText(pc)}`)
    settingsSeen = true
    await pc.keyboard.press('Escape')
    await sleep(500)
    await pc.keyboard.press('Escape')
    await sleep(900)
    log(`après 2 Échap : paused=${(await state(pc)).paused}`)
    if ((await state(pc)).paused) {
      await pc.keyboard.press('Enter')
      await sleep(600)
    }
    await pilot.start()
  }
  if (n++ % 25 === 0) await shot(pc, `round-t${Math.round(t)}`)
  for (const l of await drainLog(pc)) log(`   ${l}`)
  await sleep(400)
}
await pilot.stop()
for (const l of await drainLog(pc)) log(`   ${l}`)
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'matchResults', null, 40000, 'podium')
await sleep(4000)
await shot(pc, 'podium')
log(`podium : ${await visibleText(pc)} ; focus ${await focusInfo()}`)
await pc.keyboard.press('Enter')
await sleep(2500)
s = await state(pc)
log(`après Entrée au podium : phase ${s.phase}`)
await shot(pc, 'after-enter-podium')
await pc.keyboard.press('Escape')
await sleep(900)
await shot(pc, 'esc-in-rematch')
log(`Échap : paused=${(await state(pc)).paused} ; ${await visibleText(pc)}`)
const p = problems(logs)
log(p.length ? `PROBLÈMES : ${[...new Set(p)].join(' | ')}` : 'console propre')
await browser.close()
