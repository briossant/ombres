// QA technique : le plafond de résolution des presets (720p / 900p / 1080p) tient-il sur toute la
// partie ? Taille du canvas au titre, en manche, au podium, puis dans la manche de la revanche.
//   PORT=8824 node tools/polish/tech/dprcap.mjs [--q=low] [--w=1920] [--h=1080]
import { launch } from '../../lib/browser.mjs'
import { ORIGIN, SHOTS, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, frameStats, pageNow } from './common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const Q = arg('q', 'low')
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=4`, { waitUntil: 'load' })
const size = async label => {
  const r = await pc.evaluate(() => ({ canvas: `${document.querySelector('canvas').width}x${document.querySelector('canvas').height}`, level: window.__ombres.useRenderQuality.getState().level, phase: window.__ombres.runner.phase, screen: window.__ombres.useUi.getState().screen }))
  let g = ''
  if (label === 'manche' || label === 'revanche') {
    await pc.evaluate(() => (window.__probeGpu = true))
    const t0 = await pageNow(pc)
    await sleep(3000)
    const fs = await frameStats(pc, t0)
    await pc.evaluate(() => (window.__probeGpu = false))
    g = ` GPU p50 ${fs.gpuP50} ms p90 ${fs.gpuP90} fps ${fs.fps}`
  }
  console.log(`${label.padEnd(16)} ${JSON.stringify(r)}${g}`)
}
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(2000)
await size('titre')
await lobbyWith(pc, 4, { rounds: 1 })
await size('salon')
await startMatch(pc)
await sleep(3000)
await size('manche')
await waitFor(pc, () => window.__ombres.runner.phase === 'matchResults', null, 120000, 'fin')
await sleep(500)
await size('podium (arrivée)')
await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'matchResults', null, 30000, 'panneau')
await size('podium')
await pc.screenshot({ path: `${SHOTS}/dprcap-${Q}-${W}x${H}-podium.jpg`, type: 'jpeg', quality: 70 })
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'revanche')
await sleep(3000)
await size('revanche')
await browser.close()
