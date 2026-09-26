// QA technique : onglet du PC en arrière-plan puis retour. (1) pendant la manche : la simulation, les
// téléphones, la musique ; (2) pendant la montée de nuit, réglage de qualité « auto » : la surveillance
// de qualité voit-elle l'intervalle géant du retour et rétrograde-t-elle le preset à l'entracte ?
//   PORT=8824 node tools/polish/tech/bgtab.mjs
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from './common.mjs'
import { WsPhone } from './wsphone.mjs'

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
// réglage auto, banc déjà mémorisé = high (comme après un premier lancement sur une machine correcte)
await presetSettings(pc, { lang: 'fr', quality: 'auto', narrator: 'text' }, 'high')
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
const room = await pc.evaluate(() => window.__ombres.useLobby.getState().roomCode)
const ph = new WsPhone(ORIGIN, room, { id: 'bgtab-phone-0001', name: 'Fond', color: 2 })
await ph.connect()
await sleep(500)
ph.profile()
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 20000, 'salon')
await pc.evaluate(() => {
  window.__ombres.runner.setMatchSetting('rounds', 2)
  window.__ombres.runner.setMatchSetting('length', 'short')
})
ph.startPiloting(5)
await sleep(500)
ph.action('start')
await sleep(1500)
ph.ready(true)
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 20, null, 120000, 't>20')
const S = () => pc.evaluate(() => ({ vis: document.visibilityState, t: +window.__ombres.runner.sim.state.sun.t.toFixed(2), level: window.__ombres.useRenderQuality.getState().level, phase: window.__ombres.runner.phase, paused: window.__ombres.runner.paused }))

// (1) masquer l'onglet en pleine manche 8 s
const other = await ctx.newPage()
await other.goto('about:blank')
await other.bringToFront()
await sleep(300)
const hidden = await S()
const st0 = ph.counts.st ?? 0
await sleep(8000)
const hidden2 = await S()
log('masqué :', JSON.stringify(hidden), '→ 8 s plus tard', JSON.stringify(hidden2), '| statuts reçus par le téléphone pendant ce temps :', (ph.counts.st ?? 0) - st0, '| vue', ph.view?.screen, 'pause', JSON.stringify(ph.view?.paused))
await pc.bringToFront()
await sleep(1500)
log('retour :', JSON.stringify(await S()), 'frames max', JSON.stringify(await pc.evaluate(() => Math.max(...window.__probe.frames.slice(-200).map(f => f[1])))))

// (2) masquer pendant la montée de nuit (--nohide : témoin sans masquage)
await pc.evaluate(() => {
  const loop = () => {
    if (window.__ombres.runner.phase === 'roundResults') {
      const f = window.__probe.frames.slice(-120).map(x => x[1])
      window.__atCheck = { avg: +(f.reduce((a, b) => a + b, 0) / f.length).toFixed(1), max: +Math.max(...f).toFixed(0), sorted20: +f.sort((a, b) => a - b)[Math.floor(f.length * 0.2)].toFixed(1) }
      return
    }
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})
await waitFor(pc, () => window.__ombres.runner.sim?.state.sun.phase === 'night', null, 200000, 'nuit')
const lv0 = await S()
if (!process.argv.includes('--nohide')) {
  await other.bringToFront()
  await sleep(6000)
  await pc.bringToFront()
}
await waitFor(pc, () => window.__ombres.runner.phase === 'roundResults', null, 30000, 'résultats')
await sleep(500)
log('qualité auto : avant la nuit', lv0.level, '→ après retour + entracte', (await S()).level, '| intervalles d’image (ms) sur les 120 dernières images au moment du contrôle', JSON.stringify(await pc.evaluate(() => window.__atCheck)))
ph.close()
console.log('--- console ---\n' + logs.slice(0, 20).join('\n'))
await browser.close()
