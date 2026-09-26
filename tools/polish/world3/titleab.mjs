// Polish 3 (correcteur world-3) : A/B entrelacé du coût GPU sur l'ÉCRAN TITRE (la scène du banc de qualité),
// preset forcé, configurations alternées toutes les ~1,5 s pendant --secs secondes de démo.
//   PORT=8872 node --import ./tools/polish/world/nohmr.mjs tools/polish/world3/titleab.mjs [--q=high] [--secs=60] \
//     --cfg='nom=js' --cfg='nom=js' …   (la 1re configuration sert de base)
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, frameStats, pageNow, collect } from '../tech/common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const Q = arg('q', 'high')
const SECS = Number(arg('secs', '60'))
const WIN = Number(arg('win', '1200'))
const CFGS = args('cfg').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)] })
const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(4000)
await pc.evaluate(q => window.__ombres.useRenderQuality.getState().setLevel(q), Q)
await pc.evaluate(() => (window.__probeGpu = true))
for (const [, js] of CFGS) { await pc.evaluate(js); await sleep(600) }
const res = Object.fromEntries(CFGS.map(([n]) => [n, []]))
const pairs = Object.fromEntries(CFGS.map(([n]) => [n, []]))
const t0 = Date.now()
while (Date.now() - t0 < SECS * 1000) {
  const round = {}
  for (const [name, js] of CFGS) {
    await pc.evaluate(js)
    await sleep(250)
    const s = await pageNow(pc)
    await sleep(WIN)
    const fs = await frameStats(pc, s)
    if (fs?.gpuP50) { res[name].push(fs.gpuP50); round[name] = fs.gpuP50 }
  }
  const b = round[CFGS[0][0]]
  for (const [name] of CFGS) if (b && round[name]) pairs[name].push(round[name] - b)
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
console.log(`titre q=${Q} ${SECS} s, charge ${loadavg()[0].toFixed(1)}`)
for (const [name] of CFGS) console.log(`${name.padEnd(16)} p50 des fenêtres : méd ${med(res[name]).toFixed(2)} ms (n ${res[name].length})  Δ apparié méd ${med(pairs[name]).toFixed(2)}`)
const errs = logs.filter(l => /error|pageerror/i.test(l))
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await browser.close()
