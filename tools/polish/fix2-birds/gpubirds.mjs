// Correcteur birds (polish vague 2) : coût GPU des oiseaux (corps + coque + âme dans la height map)
// sur la page de lookdev en vue de jeu, 12 oiseaux : passes G-buffer + ombres (timer queries de
// NprPipeline, ?debug=1), oiseaux affichés puis masqués en alternance.
//   PORT=8853 node tools/polish/fix2-birds/gpubirds.mjs [--t=95] [--n=12] [--seconds=64] [--cycle=8] [--label=…]
import { launch, newContext } from '../../lib/browser.mjs'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const PORT = process.env.PORT ?? 8853
const T = arg('t', '95')
const N = arg('n', '12')
const SECONDS = Number(arg('seconds', '64'))
const LABEL = arg('label', 'run')
const busy = () => {
  try {
    return Number(readFileSync('/sys/class/drm/card1/device/gpu_busy_percent', 'utf8'))
  } catch {
    return -1
  }
}
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
await page.goto(`http://localhost:${PORT}/dev/birds.html?view=game&n=${N}&t=${T}&labels=0&debug=1`, { waitUntil: 'load' })
await page.waitForFunction(() => !!window.__dev, null, { timeout: 120000 })
await page.evaluate(async () => {
  const e = performance.getEntriesByType('resource').filter(r => r.name.includes('/src/host/render/bird/anchors.ts'))
  const u = e.length ? new URL(e[e.length - 1].name) : null
  const A = (await import(u ? u.pathname + u.search : '/src/host/render/bird/anchors.ts')).birdAnchors
  A.screen = new Float32Array(12 * 6)
  window.__A = A
})
await page.waitForFunction(() => !!window.__A.probeRoot, null, { timeout: 30000 })
await new Promise(r => setTimeout(r, 2500))
// Toute la frame est déjà sous une requête TIME_ELAPSED (surveillance de qualité) : pas de mesure
// draw par draw possible. On alterne donc oiseaux affichés / masqués (cycles de CYCLE s, premières
// secondes de chaque phase ignorées : médianes glissantes) et on compare la passe G-buffer + ombres.
const CYCLE = Number(arg('cycle', '8'))
const on = [], off = [], load = []
for (let c = 0; c < SECONDS / CYCLE / 2; c++) {
  for (const vis of [true, false]) {
    await page.evaluate(v => (window.__A.probeRoot.visible = v), vis)
    await new Promise(r => setTimeout(r, CYCLE * 500))
    for (let i = 0; i < CYCLE; i++) {
      await new Promise(r => setTimeout(r, 250))
      const m = await page.evaluate(() => window.__timings)
      ;(vis ? on : off).push((m.gbuffer ?? 0) + (m.shadow ?? 0))
      load.push(busy())
    }
  }
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]
const line = `${LABEL} t=${T} n=${N} (GPU occupé ${q(load, 0.5)} %) : G-buffer + ombres, oiseaux affichés p50 ${q(on, 0.5).toFixed(2)} / p10 ${q(on, 0.1).toFixed(2)} ms ; masqués p50 ${q(off, 0.5).toFixed(2)} / p10 ${q(off, 0.1).toFixed(2)} ms ; coût des oiseaux ≈ ${(q(on, 0.5) - q(off, 0.5)).toFixed(2)} ms (p10 : ${(q(on, 0.1) - q(off, 0.1)).toFixed(2)})`
console.log(line)
appendFileSync(join(import.meta.dirname, '../../../shots/polish2/birds/gpu.txt'), line + '\n')
await browser.close()
