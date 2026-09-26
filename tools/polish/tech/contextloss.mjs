// QA technique : perte puis restauration du contexte WebGL (WEBGL_lose_context) en pleine manche,
// au titre, et perte SANS restauration (pilote graphique réinitialisé) : l'image revient-elle,
// le territoire est-il intact, la simulation continue-t-elle, la console reste-t-elle propre ?
//   PORT=8824 node tools/polish/tech/contextloss.mjs
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, SHOTS, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from './common.mjs'

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: 'medium', narrator: 'text' })
await pc.goto(`${ORIGIN}/?debug=nosave,fast&speed=2`, { waitUntil: 'load' })
await lobbyWith(pc, 6, { rounds: 1 })
await startMatch(pc)
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 30, null, 120000, 'manche')
const px = async label => {
  await pc.screenshot({ path: `${SHOTS}/ctxloss-${label}.jpg`, type: 'jpeg', quality: 72 })
  return pc.evaluate(() => {
    // moyenne de luminance du canvas (drawImage d'un canvas WebGL : preserveDrawingBuffer=false → peut être noir)
    const s = window.__ombres.runner.sim?.state
    return { t: s?.sun.t?.toFixed(1), lost: window.__probe.glCtx?.isContextLost(), phase: window.__ombres.runner.phase, frames: window.__ombres.runner.renderedFrames }
  })
}
log('avant', JSON.stringify(await px('0-before')))
await pc.evaluate(() => {
  window.__loseExt = window.__probe.glCtx.getExtension('WEBGL_lose_context')
  window.__loseExt.loseContext()
})
await sleep(2000)
log('perdu', JSON.stringify(await px('1-lost')))
await pc.evaluate(() => window.__loseExt.restoreContext())
await sleep(3000)
log('restauré', JSON.stringify(await px('2-restored')))
await sleep(3000)
log('restauré+3s', JSON.stringify(await px('3-restored-later')))
// perte définitive (pas de restauration) : que voit-on ?
await pc.evaluate(() => window.__probe.glCtx.getExtension('WEBGL_lose_context').loseContext())
await sleep(4000)
log('perte définitive', JSON.stringify(await px('4-lost-forever')))
console.log('--- console ---\n' + logs.slice(0, 25).join('\n'))
await browser.close()
