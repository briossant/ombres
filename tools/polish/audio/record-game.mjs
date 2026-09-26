// Enregistre le mix réel d'une partie complète, à vitesse réelle (agent polish audio).
//   PORT=8825 node tools/polish/audio/record-game.mjs --name=A --kb=2 --phones=0 --birds=12 --rounds=3
// Options : --title=40 (s sur l'écran titre), --lobby=12 (s de salon après les arrivées),
//           --podium=45, --credits=25, --pause=30 (pause PC à t=30 s de la manche 1, 0 = non),
//           --lang=fr, --narrator=voice, --out=<dossier> (défaut : scratchpad/rec/<name>)
// Sortie : <out>/<name>.wav (8 canaux, voir rec.mjs) + <name>.events.json + captures jpg.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { ORIGIN, launch, newContext, sleep, waitFor, state, arg, newPhone, joinPhone, presetSettings } from '../../e2e/qa/lib.mjs'
import { KeyboardPilot, PhonePilot } from '../../e2e/qa/pilot.mjs'
import { installRecorder } from './rec.mjs'

const NAME = arg('name', 'A')
const KB = Number(arg('kb', '2'))
const PHONES = Number(arg('phones', '0'))
const BIRDS = Number(arg('birds', '12'))
const ROUNDS = Number(arg('rounds', '3'))
const T_TITLE = Number(arg('title', '40'))
const T_LOBBY = Number(arg('lobby', '12'))
const T_PODIUM = Number(arg('podium', '45'))
const T_CREDITS = Number(arg('credits', '25'))
const PAUSE_AT = Number(arg('pause', '0'))
const OUT = arg('out', join(process.env.SCRATCH ?? '/tmp', 'rec', NAME))
mkdirSync(OUT, { recursive: true })
const t0 = Date.now()
const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)
let nShot = 0
const shot = async (page, label) => {
  const f = join(OUT, `${String(++nShot).padStart(3, '0')}-${label}.jpg`)
  await page.screenshot({ path: f, type: 'jpeg', quality: 70 }).catch(() => {})
}

const browser = await launch()
const pc = await (await newContext(browser)).newPage()
pc.on('console', m => {
  if (/error|warn/i.test(m.type())) console.log('[pc console]', m.type(), m.text().slice(0, 240))
})
await presetSettings(pc, { lang: arg('lang', 'fr'), quality: arg('q', 'low'), narrator: arg('narrator', 'voice') })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => !!window.__ombres, null, 120000, 'debug')
const rec = await installRecorder(pc, OUT, { name: NAME })
log(`enregistreur : ${JSON.stringify(rec.info)}`)
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await rec.mark('title')
log('titre')
await sleep(3000)
await shot(pc, 'title')
// un geste (comme un vrai joueur) puis navigation dans le menu : sons d'interface
await pc.mouse.move(400, 300)
await pc.mouse.click(400, 300)
await sleep(Math.max(0, T_TITLE * 1000 - 9000))
await pc.keyboard.press('Enter')
await sleep(900)
await shot(pc, 'title-menu')
for (const k of ['ArrowDown', 'ArrowDown', 'ArrowUp', 'ArrowUp']) {
  await pc.keyboard.press(k)
  await sleep(450)
}
await sleep(1500)
await rec.mark('toLobby')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'lobby' && !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'salon')
log('salon')
await sleep(4000)
// arrivées : téléphones, clavier, bots
const phones = []
if (PHONES > 0) {
  const joinUrl = (await state(pc)).joinUrl
  const u = new URL(joinUrl)
  const url = `${ORIGIN}${u.pathname}${u.search}`
  const devs = ['iPhone 15 Pro', 'Pixel 7', 'iPhone 15 Pro', 'Pixel 7']
  for (let i = 0; i < PHONES; i++) {
    const ph = await newPhone(browser, devs[i], `P${i + 1}`)
    await joinPhone(ph, url, ['Brieuc', 'Anna', 'Leo', 'Mia'][i], i + 3)
    phones.push(ph)
    await rec.mark(`phoneJoin${i + 1}`)
    await sleep(2500)
  }
}
if (KB >= 1) {
  await rec.mark('kb1')
  await pc.keyboard.press('Space')
  await sleep(1500)
}
if (KB >= 2) {
  await rec.mark('kb2')
  await pc.keyboard.press('AltRight')
  await sleep(1500)
}
for (let i = 0; i < 12; i++) {
  const n = (await state(pc)).roster.length
  if (n >= BIRDS) break
  await pc.locator('.roster__add').first().click()
  await sleep(600)
}
// trop d'oiseaux (bots par défaut) : on retire
for (let i = 0; i < 12; i++) {
  const st = await state(pc)
  if (st.roster.length <= BIRDS) break
  const bot = st.roster.filter(r => r.kind === 'bot').pop()
  if (!bot) break
  await pc.evaluate(s => window.__ombres.runner.removeBot?.(s), bot.slot)
  await sleep(500)
}
if (ROUNDS !== 3) await pc.evaluate(r => window.__ombres.runner.setMatchSetting('rounds', r), ROUNDS)
let s = await state(pc)
log(`salon : ${s.roster.length} oiseaux : ${s.roster.map(r => `${r.kind}:${r.color}`).join(' ')}`)
await shot(pc, 'lobby')
await sleep(T_LOBBY * 1000)
// pilotes
const kbSlots = s.roster.filter(r => r.kind === 'keyboard').map(r => r.slot)
const pilots = []
kbSlots.forEach((slot, i) => pilots.push(new KeyboardPilot(pc, i + 1, () => slot, 5 + 3 * i)))
const phSlots = s.roster.filter(r => r.kind === 'phone').map(r => r.slot)
phones.forEach((ph, i) => pilots.push(new PhonePilot(ph, pc, () => phSlots[i], 7 + i)))
await rec.mark('launch')
if (phones.length) await phones[0].page.locator('.lobby__start, .btn--launch, button:has-text("Lancer")').first().click().catch(() => {})
if ((await state(pc)).phase === 'lobby') await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'game'].includes(window.__ombres?.useUi.getState().screen), null, 10000, 'cartes')
log('cartes')
await sleep(1500)
await shot(pc, 'rules')
await sleep(4500)
if ((await state(pc)).phase === 'rules') {
  for (const ph of phones) await ph.page.locator('.rules__ok, button:has-text("Compris"), button:has-text("OK")').first().click().catch(() => {})
  await sleep(500)
  if ((await state(pc)).phase === 'rules') await pc.keyboard.press('Enter')
}
await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 15000, 'manche 1')
await Promise.all(pilots.map(p => p.start()))
let r = -1
let paused = false
let lastShot = 0
for (;;) {
  s = await state(pc)
  if (s.phase === 'matchResults') break
  if (s.phase === 'round' && s.round !== r) {
    r = s.round
    log(`manche ${r + 1}`)
    await rec.mark(`round${r + 1}`)
  }
  if (PAUSE_AT > 0 && !paused && s.phase === 'round' && s.round === 0 && (s.sunT ?? 0) > PAUSE_AT) {
    paused = true
    await rec.mark('pauseOn')
    await pc.keyboard.press('Escape')
    await sleep(6000)
    await shot(pc, 'pause')
    await rec.mark('pauseOff')
    await pc.keyboard.press('Escape')
    await sleep(500)
    if ((await state(pc)).paused) await pc.keyboard.press('Enter')
  }
  if (Date.now() - lastShot > 15000) {
    lastShot = Date.now()
    await shot(pc, `r${r + 1}-${s.phase}-${Math.round(s.sunT ?? 0)}`)
  }
  if (s.phase === 'roundResults') {
    // les téléphones tapent Prêt après 8 s (comme un groupe), le clavier attend
    await sleep(8000)
    await shot(pc, `r${r + 1}-results`)
    for (const ph of phones) await ph.page.locator('.result__ready .btn').click().catch(() => {})
    await waitFor(pc, () => window.__ombres?.runner.phase !== 'roundResults', null, 30000, 'suite')
    continue
  }
  await sleep(400)
}
await Promise.all(pilots.map(p => p.stop()))
await rec.mark('podium')
log('podium')
for (let i = 0; i < 4; i++) {
  await sleep(4000)
  await shot(pc, `podium-${i}`)
}
await sleep(Math.max(0, T_PODIUM * 1000 - 16000))
await rec.mark('quitToLobby')
await pc.evaluate(() => window.__ombres.runner.quitToLobby())
await sleep(6000)
await rec.mark('toTitle')
await pc.keyboard.press('Escape')
await sleep(5000)
await rec.mark('credits')
await pc.evaluate(() => window.__ombres.runner.enterCredits())
await sleep(T_CREDITS * 1000)
await shot(pc, 'credits')
const res = await rec.stop()
log(`fin : ${JSON.stringify(res)}`)
await browser.close()
