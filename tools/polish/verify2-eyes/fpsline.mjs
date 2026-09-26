// Regard final vague 2 : ligne de temps d'une manche (i/s, images > 20 ms, GPU de la frame, gpu_busy)
// par fenêtres de 3 s, pour situer dans la manche les chutes de cadence vues par perfmatrix.
//   PORT=8863 node --import ./tools/polish/world/nohmr.mjs tools/polish/verify2-eyes/fpsline.mjs [--q=high] [--n=12] [--hud=1]
//   --hud=0 masque la couche HTML du jeu (isole le coût de composition du DOM).
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, gpuBusyAvg, frameStats, pageNow, presetSettings, lobbyWith, startMatch, kbSlot, collect } from '../tech/common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const Q = arg('q', 'high')
const N = Number(arg('n', '12'))
const HUD = arg('hud', '1') === '1'
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, `${Q}/${N}`)
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
const got = await lobbyWith(pc, N, { length: 'normal' })
await startMatch(pc)
await pc.evaluate(() => (window.__probeGpu = true))
if (!HUD) await pc.addStyleTag({ content: 'body > *:not(canvas):not(:has(canvas)) { display: none !important } .hud, [class*=hud], [class*=banner], [class*=bubble], [class*=toast] { display: none !important }' })
const slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 5 + N)
await pilot.start()
console.log(`q=${Q} n=${got} hud=${HUD}`)
while (true) {
  const t0 = await pageNow(pc)
  await sleep(2400)
  const busy = await gpuBusyAvg(5, 100)
  const st = await pc.evaluate(() => {
    const r = window.__ombres.runner
    const vis = [...document.querySelectorAll('body *')].filter(e => {
      const cs = getComputedStyle(e)
      return (cs.backdropFilter && cs.backdropFilter !== 'none') || (cs.filter && cs.filter !== 'none' && e.getBoundingClientRect().width > 200)
    }).map(e => `${e.className?.toString?.().split(' ')[0] || e.tagName}:${Math.round(e.getBoundingClientRect().width)}`)
    return { phase: r.phase, sun: r.sim?.state.sun.phase, t: r.sim?.state.sun.t, level: window.__ombres.useRenderQuality.getState().level, filt: vis.slice(0, 6) }
  })
  if (st.phase !== 'round' || st.sun === 'night' || st.sun === 'over') break
  const fs = await frameStats(pc, t0)
  console.log(`t=${st.t?.toFixed(0).padStart(4)} ${String(st.sun).padEnd(11)} ${st.level} busy ${String(busy).padStart(3)}% load ${loadavg()[0].toFixed(1)} | fps ${fs?.fps} >20ms ${fs?.over20}% | GPU p50 ${fs?.gpuP50} p90 ${fs?.gpuP90} | rafCPU p50 ${fs?.cpuP50} p95 ${fs?.cpuP95} | filtres ${st.filt.join(',')}`)
}
await pilot.stop()
if (logs.length) console.log(logs.slice(0, 10).join('\n'))
await browser.close()
