// QA technique : temps GPU de la frame entière (requête TIME_ELAPSED autour du rAF, percentiles :
// le p10 approche le coût hors contention sur un GPU partagé), CPU par frame (rAF chronométré),
// intervalles d'image, draw calls, par preset × nombre d'oiseaux, à chaque phase du soleil.
//   PORT=8824 node tools/polish/tech/perfmatrix.mjs [--q=low,medium,high] [--n=4,6,12] [--speed=2] [--passes]
//   --passes : ?debug=perf (médianes par passe de NprPipeline) au lieu de la requête globale.
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, gpuBusyAvg, frameStats, pageNow, presetSettings, lobbyWith, startMatch, kbSlot, collect } from './common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const QS = arg('q', 'low,medium,high').split(',')
const NS = arg('n', '4,6,12').split(',').map(Number)
const SPEED = Number(arg('speed', '2'))
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const PASSES = process.argv.includes('--passes')

const browser = await launch()
const out = []
for (const q of QS) {
  for (const n of NS) {
    const ctx = await newContext(browser, { w: W, h: H })
    const pc = await ctx.newPage()
    const logs = collect(pc, `${q}/${n}`)
    await pc.addInitScript(PROBE)
    await presetSettings(pc, { lang: 'fr', quality: q, narrator: 'off' })
    const fast = SPEED > 1 ? `,fast&speed=${SPEED}` : ''
    await pc.goto(`${ORIGIN}/?debug=nosave${PASSES ? ',perf' : ''}${fast}`, { waitUntil: 'load' })
    const got = await lobbyWith(pc, n, { length: 'normal' })
    await startMatch(pc)
    if (!PASSES) await pc.evaluate(() => (window.__probeGpu = true))
    const slot = await kbSlot(pc)
    const pilot = new KeyboardPilot(pc, 1, () => slot, 5 + n)
    await pilot.start()
    const seen = new Set()
    while (true) {
      const st = await pc.evaluate(() => ({ phase: window.__ombres.runner.phase, sun: window.__ombres.runner.sim?.state.sun.phase, t: window.__ombres.runner.sim?.state.sun.t }))
      if (st.phase !== 'round' || st.sun === 'night' || st.sun === 'over') break
      if (!seen.has(st.sun) && st.t > 0) {
        seen.add(st.sun)
        const t0 = await pageNow(pc)
        await sleep(st.sun === 'greatShadow' ? 2200 : 2600)
        const busy = await gpuBusyAvg(6, 80)
        const fs = await frameStats(pc, t0)
        const tm = await pc.evaluate(() => ({ t: { ...(window.__timings ?? {}) }, info: { ...(window.__nprInfo ?? {}) }, level: window.__ombres.useRenderQuality.getState().level, cw: document.querySelector('canvas')?.width, ch: document.querySelector('canvas')?.height }))
        const row = { q, n: got, level: tm.level, canvas: `${tm.cw}x${tm.ch}`, sun: st.sun, busy, load: +loadavg()[0].toFixed(1), passes: tm.t, calls: tm.info.calls, frames: fs }
        out.push(row)
        const g = PASSES ? `passes ${tm.t.total} [sh ${tm.t.shadow} gb ${tm.t.gbuffer} ink ${tm.t.ink} smaa ${tm.t.smaa ?? '-'}] calls ${tm.info.calls} tri ${Math.round((tm.info.triangles ?? 0) / 1000)}k` : `GPU frame p10 ${fs?.gpuP10} p50 ${fs?.gpuP50} p90 ${fs?.gpuP90} min ${fs?.gpuMin}`
        console.log(`${q.padEnd(6)} n=${got} ${st.sun.padEnd(11)} busy ${busy}% load ${row.load} ${tm.cw}x${tm.ch} | ${g} | fps ${fs?.fps} iv p95 ${fs?.ivP95} p99 ${fs?.ivP99} >20ms ${fs?.over20}% | rafCPU p50 ${fs?.cpuP50} p95 ${fs?.cpuP95} max ${fs?.cpuMax}`)
      }
      await sleep(150)
    }
    await pilot.stop()
    if (logs.length) console.log(logs.slice(0, 10).join('\n'))
    await ctx.close()
  }
}
console.log('JSON ' + JSON.stringify(out))
await browser.close()
