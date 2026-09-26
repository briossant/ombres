// QA technique : coût de l'interface DOM par-dessus le canvas (HUD, étiquettes, bulles) — A/B alterné
// (UI visible / masquée, 3 s chacun, 4 cycles) en manche à 12 oiseaux, pour isoler la charge de
// composition du navigateur de la contention GPU externe.
//   PORT=8824 node tools/polish/tech/uicost.mjs [--q=high] [--at=golden]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, frameStats, pageNow, gpuBusyAvg } from './common.mjs'
const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const Q = arg('q', 'high')
const AT = arg('at', 'golden')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'text' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await lobbyWith(pc, 12, { rounds: 1, length: 'long' })
await startMatch(pc)
await pc.evaluate(() => (window.__probeGpu = true))
await waitFor(pc, at => window.__ombres.runner.sim?.state.sun.phase === at, AT, 200000, AT)
const res = { on: [], off: [] }
for (let c = 0; c < 4; c++) {
  for (const mode of ['on', 'off']) {
    await pc.evaluate(m => (document.querySelector('.ui-root').style.visibility = m === 'off' ? 'hidden' : ''), mode)
    await sleep(400)
    const t0 = await pageNow(pc)
    const busyP = gpuBusyAvg(25, 100)
    await sleep(2600)
    const fs = await frameStats(pc, t0)
    res[mode].push({ fps: fs.fps, over20: fs.over20, gpu: fs.gpuP50, cpu: fs.cpuP50, busy: await busyP })
  }
}
await pc.evaluate(() => (document.querySelector('.ui-root').style.visibility = ''))
for (const m of ['on', 'off']) console.log(`UI ${m.padEnd(3)} ${res[m].map(r => `fps ${r.fps} >20ms ${r.over20}% gpuWebGL ${r.gpu} cpu ${r.cpu} busy ${r.busy}%`).join(' | ')}`)
await browser.close()
