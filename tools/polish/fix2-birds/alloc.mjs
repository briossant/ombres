// Correcteur birds (polish vague 2) : allocations par frame des oiseaux et des FX.
// Manche réelle à 12 oiseaux (1 clavier + 11 bots), échantillonnage CDP des allocations
// (HeapProfiler.startSampling) pendant N secondes à une phase donnée. Sortie : Mo/s et
// ko/frame, au total et pour src/host/render/bird/** + src/host/render/fx/**, sites détaillés.
//   PORT=8853 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-birds/alloc.mjs \
//        [--q=high] [--at=golden] [--seconds=10] [--label=avant]
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, kbSlot, frameStats, pageNow } from '../tech/common.mjs'
import { appendFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const Q = arg('q', 'high')
const AT = arg('at', 'golden')
const SECONDS = Number(arg('seconds', '10'))
const LABEL = arg('label', 'run')
const OUT = join(import.meta.dirname, '../../../shots/polish2/birds')
mkdirSync(OUT, { recursive: true })

const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'voice' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await lobbyWith(pc, 12, { rounds: 1 })
await pc.mouse.click(5, 5)
await startMatch(pc)
const slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 3)
await pilot.start()
await waitFor(pc, at => window.__ombres.runner.sim?.state.sun.phase === at, AT, 200000, AT)
await sleep(1500)
const cdp = await ctx.newCDPSession(pc)
await cdp.send('HeapProfiler.enable')
await cdp.send('HeapProfiler.collectGarbage')
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 2048, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
const t0 = await pageNow(pc)
await sleep(SECONDS * 1000)
const { profile: hp } = await cdp.send('HeapProfiler.stopSampling')
const t1 = await pageNow(pc)
const fs = await frameStats(pc, t0)
await pilot.stop()
const dur = (t1 - t0) / 1000
const frames = fs?.n ?? 1

const sites = new Map()
const mine = new Map()
const walk = n => {
  const cf = n.callFrame
  const file = cf.url.replace(/\?.*/, '')
  const here = `${cf.functionName || '(anon)'} ${file.split('/').slice(-2).join('/')}:${cf.lineNumber + 1}`
  if (n.selfSize) {
    sites.set(here, (sites.get(here) ?? 0) + n.selfSize)
    if (/src\/host\/render\/(bird|fx)\//.test(file)) mine.set(here, (mine.get(here) ?? 0) + n.selfSize)
  }
  for (const c of n.children) walk(c)
}
walk(hp.head)
const sum = m => [...m.values()].reduce((a, b) => a + b, 0)
const all = sum(sites)
const own = sum(mine)
const lines = []
const p = s => {
  lines.push(s)
  console.log(s)
}
p(`\n## ${LABEL} — ${Q} ${AT}, 12 oiseaux, ${dur.toFixed(1)} s, ${frames} frames (${fs?.fps} i/s)`)
p(`total échantillonné : ${(all / 1048576 / dur).toFixed(2)} Mo/s (${(all / 1024 / frames).toFixed(1)} ko/frame)`)
p(`bird/** + fx/**     : ${(own / 1048576 / dur).toFixed(3)} Mo/s (${(own / 1024 / frames).toFixed(2)} ko/frame)`)
p('sites bird/fx :')
for (const [k, b] of [...mine].sort((a, b) => b[1] - a[1]).slice(0, 14)) p(`  ${(b / 1024 / dur).toFixed(1).padStart(8)} ko/s  ${k}`)
p('premiers sites (tous) :')
for (const [k, b] of [...sites].sort((a, b) => b[1] - a[1]).slice(0, 12)) p(`  ${(b / 1024 / dur).toFixed(1).padStart(8)} ko/s  ${k}`)
appendFileSync(join(OUT, 'alloc.md'), lines.join('\n') + '\n')
await browser.close()
