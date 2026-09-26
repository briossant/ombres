// Vérification G11 (correcteur game) : onglet du PC en arrière-plan en pleine manche.
// Chromium sans tête garde document.visibilityState = 'visible' quand un autre onglet passe devant
// (seul le rAF ralentit) : on bascule donc l'onglet ET on émule l'API de visibilité (hidden +
// événement visibilitychange), comme le ferait un vrai navigateur.
// Attendu : pause posée, vue du téléphone en pause sans « Reprendre » ; au retour, reprise
// automatique avec le compte « 3, 2, 1 », téléphone revenu sur la manette.
//   PORT=8836 node tools/polish/fix-game/bgtab.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings } from '../tech/common.mjs'
import { WsPhone } from '../tech/wsphone.mjs'

const SHOTS = join(import.meta.dirname, '../../../shots/polish/fix-game')
mkdirSync(SHOTS, { recursive: true })
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'text' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
const room = await pc.evaluate(() => window.__ombres.useLobby.getState().roomCode)
const ph = new WsPhone(ORIGIN, room, { id: 'fixgame-bgtab-01', name: 'Fond', color: 2 })
await ph.connect()
await sleep(500)
ph.profile()
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 20000, 'salon')
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
ph.startPiloting(5)
await sleep(500)
ph.action('start')
await sleep(1500)
ph.ready(true)
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 12, null, 120000, 't>12')
const S = () =>
  pc.evaluate(() => ({
    vis: document.visibilityState,
    t: +window.__ombres.runner.sim.state.sun.t.toFixed(2),
    paused: window.__ombres.runner.paused,
    countdown: window.__ombres.useHud.getState().countdown,
  }))
const setHidden = hidden =>
  pc.evaluate(h => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)

const other = await ctx.newPage()
await other.goto('about:blank')
await other.bringToFront()
await setHidden(true)
await sleep(600)
const a = await S()
log('onglet masqué :', JSON.stringify(a), '| téléphone :', ph.view?.screen, 'pause', JSON.stringify(ph.view?.paused))
// un téléphone tente de reprendre pendant que l'écran est masqué : refusé
ph.action('resume')
await sleep(6000)
const b = await S()
log('6 s plus tard (le téléphone a tenté « Reprendre ») :', JSON.stringify(b), '| téléphone :', ph.view?.screen, 'pause', JSON.stringify(ph.view?.paused))
await pc.bringToFront()
await setHidden(false)
const seen = []
for (let i = 0; i < 16; i++) {
  const s = await S()
  const tag = `${s.paused ? 'pause' : 'jeu'}:${s.countdown ?? '-'}`
  if (seen[seen.length - 1] !== tag) seen.push(tag)
  if (i === 2) await pc.screenshot({ path: join(SHOTS, 'g11-return-countdown.jpg'), type: 'jpeg', quality: 80 })
  await sleep(250)
}
const c = await S()
log('retour :', seen.join(' → '), '|', JSON.stringify(c), '| téléphone :', ph.view?.screen, 'pause', JSON.stringify(ph.view?.paused))
ph.close()
await browser.close()
