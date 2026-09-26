// Polish vague 2 (tech, ordre 3) : profil CPU de la SEULE frame de bascule de carte de la démo du titre.
// Profiler CDP démarré juste avant runner.onDemoLoop(), arrêté deux frames plus tard ; temps inclusif
// (fonction + appelées) et temps propre, cumulés sur N bascules.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/titleprofile.mjs [--n=6] [--q=high]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', '6'))
const Q = arg('q', 'high')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' }, Q)
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(3000)
const cdp = await ctx.newCDPSession(pc)
await cdp.send('Profiler.enable')
await cdp.send('Profiler.setSamplingInterval', { interval: 100 })
const incl = new Map()
const self = new Map()
let total = 0
for (let i = 0; i < N; i++) {
  await sleep(3000)
  await cdp.send('Profiler.start')
  await pc.evaluate(async () => {
    const raf = () => new Promise(res => requestAnimationFrame(res))
    await raf()
    window.__ombres.runner.onDemoLoop()
    await raf()
    await raf()
  })
  const { profile } = await cdp.send('Profiler.stop')
  const byId = new Map(profile.nodes.map(n => [n.id, n]))
  const parent = new Map()
  for (const n of profile.nodes) for (const c of n.children ?? []) parent.set(c, n.id)
  const keyOf = n => {
    const fn = n.callFrame
    return `${fn.functionName || '(anon)'} ${fn.url.split('/').pop()?.split('?')[0]}:${fn.lineNumber + 1}`
  }
  profile.samples.forEach((id, k) => {
    const d = (profile.timeDeltas[k + 1] ?? 0) / 1000
    const n = byId.get(id)
    const kk = keyOf(n)
    if (kk.startsWith('(idle)') || kk.startsWith('(program)')) return
    total += d
    self.set(kk, (self.get(kk) ?? 0) + d)
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
}
const pr = (m, n) =>
  [...m]
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k, v]) => `${(v / N).toFixed(1).padStart(7)} ms  ${k}`)
    .join('\n')
console.log(`occupé par bascule (hors idle) : ${(total / N).toFixed(1)} ms`)
console.log('--- inclusif, par bascule ---\n' + pr(incl, 60))
console.log('--- propre, par bascule ---\n' + pr(self, 25))
await browser.close()
