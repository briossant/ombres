// Polish vague 2 (tech) : longues tâches des premières secondes de l'écran titre (première impression).
// Profil CPU CDP des 3,5 s qui suivent l'arrivée du titre ; temps inclusif par fonction.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/titlestart.mjs [--q=high]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, presetSettings } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const Q = arg('q', 'high')
/** --all : toute la fenêtre de 3,5 s (sinon : seulement pendant les longues tâches) */
const ALL = process.argv.includes('--all')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' }, Q)
const cdp = await ctx.newCDPSession(pc)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 250 })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await pc.waitForFunction(() => window.__ombres?.useUi.getState().screen === 'title', null, { timeout: 120000, polling: 16 })
await cdp.send('Profiler.start')
const t0 = await pc.evaluate(() => performance.now())
await sleep(3500)
const { profile } = await cdp.send('Profiler.stop')
const lt = await pc.evaluate(t0 => window.__probe.longTasks.filter(l => l[0] >= t0 - 200).map(l => [+((l[0] - t0) / 1000).toFixed(2), Math.round(l[1])]), t0)
console.log('longues tâches [s après le titre, ms] :', JSON.stringify(lt))
// temps inclusif pendant les longues tâches seulement (horloge du profil : µs depuis profile.startTime)
const byId = new Map(profile.nodes.map(n => [n.id, n]))
const parent = new Map()
for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
const keyOf = n => `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()?.split('?')[0]}:${n.callFrame.lineNumber + 1}`
const incl = new Map()
let t = profile.startTime
const pageStart = profile.startTime // Profiler.start ≈ t0 (arrivée du titre)
profile.samples.forEach((id, k) => {
  t += profile.timeDeltas[k] ?? 0
  const d = (profile.timeDeltas[k + 1] ?? 0) / 1000
  const n = byId.get(id)
  if (/^\((idle|program|root)\)/.test(keyOf(n))) return
  const ms = (t - pageStart) / 1000
  if (!ALL && !lt.some(([s, dur]) => ms >= s * 1000 - 5 && ms <= s * 1000 + dur + 5)) return
  const seen = new Set()
  let cur = id
  while (cur !== undefined) {
    const key = keyOf(byId.get(cur))
    if (!seen.has(key)) {
      seen.add(key)
      incl.set(key, (incl.get(key) ?? 0) + d)
    }
    cur = parent.get(cur)
  }
})
console.log(
  [...incl]
    .filter(([k]) => !/react-dom|chunk-|scheduler|react\.js|@react-three_fiber/.test(k))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 45)
    .map(([k, v]) => `${v.toFixed(1).padStart(7)} ms  ${k}`)
    .join('\n'),
)
await browser.close()
