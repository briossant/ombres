// QA technique : profil CPU (CDP Profiler) et échantillonnage des allocations (HeapProfiler) pendant
// une manche réelle à 12 oiseaux (1 clavier + 11 bots) : fonctions les plus coûteuses (temps propre),
// sites d'allocation, cadence du GC.
//   PORT=8824 node tools/polish/tech/profile.mjs [--q=high] [--at=golden] [--seconds=10] [--origin=…]
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN as DEV, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, kbSlot, frameStats, pageNow } from './common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const ORIGIN = arg('origin', DEV)
const Q = arg('q', 'high')
const AT = arg('at', 'golden')
const SECONDS = Number(arg('seconds', '10'))
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
const cdp = await ctx.newCDPSession(pc)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
await cdp.send('HeapProfiler.enable')
const heap0 = await cdp.send('Runtime.getHeapUsage')
await cdp.send('HeapProfiler.startSampling', { samplingInterval: 4096, includeObjectsCollectedByMajorGC: true, includeObjectsCollectedByMinorGC: true })
await cdp.send('Profiler.start')
const t0 = await pageNow(pc)
const gcs = []
await sleep(SECONDS * 1000)
const { profile } = await cdp.send('Profiler.stop')
const { profile: hp } = await cdp.send('HeapProfiler.stopSampling')
const fs = await frameStats(pc, t0)
await pilot.stop()
console.log(`load ${loadavg()[0].toFixed(1)} | ${Q} ${AT} 12 oiseaux | frames ${JSON.stringify(fs)}`)

// temps propre par fonction
const self = new Map()
const byId = new Map(profile.nodes.map(n => [n.id, n]))
const dt = new Map()
for (let i = 0; i < profile.samples.length; i++) dt.set(profile.samples[i], (dt.get(profile.samples[i]) ?? 0) + (profile.timeDeltas[i] ?? 0))
let total = 0
for (const [id, us] of dt) {
  const n = byId.get(id)
  const cf = n.callFrame
  const key = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/').replace(/\?.*/, '')}:${cf.lineNumber + 1}`
  self.set(key, (self.get(key) ?? 0) + us)
  total += us
}
const dur = (profile.endTime - profile.startTime) / 1e6
console.log(`\nCPU : ${dur.toFixed(1)} s profilées ; top temps propre (ms/s) :`)
for (const [k, us] of [...self].sort((a, b) => b[1] - a[1]).slice(0, 28)) console.log(`  ${(us / 1000 / dur).toFixed(2).padStart(7)}  ${k}`)

// allocations : sites par octets alloués (échantillonnés)
const sites = new Map()
const walk = (n, stack) => {
  const cf = n.callFrame
  const here = `${cf.functionName || '(anon)'} ${cf.url.split('/').slice(-2).join('/').replace(/\?.*/, '')}:${cf.lineNumber + 1}`
  const self = n.selfSize
  if (self) sites.set(here, (sites.get(here) ?? 0) + self)
  for (const c of n.children) walk(c, stack)
}
walk(hp.head, [])
let atotal = 0
for (const v of sites.values()) atotal += v
console.log(`\nAllocations échantillonnées (toutes, GC compris) sur la fenêtre : ${(atotal / 1048576).toFixed(1)} Mo`)
for (const [k, b] of [...sites].sort((a, b) => b[1] - a[1]).slice(0, 18)) console.log(`  ${(b / 1024).toFixed(0).padStart(7)} ko  ${k}`)
const heap1 = await cdp.send('Runtime.getHeapUsage')
console.log(`tas : ${(heap0.usedSize / 1048576).toFixed(1)} → ${(heap1.usedSize / 1048576).toFixed(1)} Mo`)
await browser.close()
