// Correcteur birds (polish vague 2) : temps GPU par passe (timer queries, médianes glissantes de
// NprPipeline) sur la page de lookdev en vue de jeu, 12 oiseaux, à un instant de soleil donné.
// Relevé toutes les 0,5 s pendant N secondes ; on garde médiane et p10 de chaque passe (le p10
// approche le coût hors contention quand le GPU est partagé).
//   PORT=8853 node tools/polish/fix2-birds/gpu.mjs [--t=95] [--n=12] [--seconds=12] [--label=…]
import { launch, newContext } from '../../lib/browser.mjs'
import { appendFileSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const PORT = process.env.PORT ?? 8853
const T = arg('t', '95')
const N = arg('n', '12')
const SECONDS = Number(arg('seconds', '12'))
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
await page.goto(`http://localhost:${PORT}/dev/birds.html?view=game&n=${N}&t=${T}&debug=1&labels=0`, { waitUntil: 'load' })
await page.waitForFunction(() => window.__timings?.gbuffer > 0, null, { timeout: 120000 })
await new Promise(r => setTimeout(r, 3000))
const S = {}
const load = []
for (let i = 0; i < SECONDS * 2; i++) {
  const m = await page.evaluate(() => window.__timings)
  for (const [k, v] of Object.entries(m)) (S[k] ??= []).push(v)
  load.push(busy())
  await new Promise(r => setTimeout(r, 500))
}
const q = (a, p) => [...a].sort((x, y) => x - y)[Math.floor((a.length - 1) * p)]
const line = [`${LABEL} t=${T} n=${N} (GPU occupé ${q(load, 0.5)} %)`]
for (const k of ['shadow', 'gbuffer', 'ink', 'smaa', 'total']) if (S[k]) line.push(`${k} p50 ${q(S[k], 0.5).toFixed(2)} / p10 ${q(S[k], 0.1).toFixed(2)} ms`)
console.log(line.join(' | '))
appendFileSync(join(import.meta.dirname, '../../../shots/polish2/birds/gpu.txt'), line.join(' | ') + '\n')
await browser.close()
