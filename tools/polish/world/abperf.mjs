// Polish 2 (correcteur world) : A/B de coût GPU ENTRELACÉ dans une même page, scène de manche figée.
// Sur un GPU partagé, les chiffres absolus dérivent ; en alternant les configurations toutes les ~1,5 s
// et en gardant la médiane des p50 (et le min des p10) sur plusieurs tours, les ÉCARTS restent fiables.
//   PORT=8854 node --import ./tools/polish/world/nohmr.mjs tools/polish/world/abperf.mjs \
//     --n=12 --t=104 [--q=high] [--rounds=5] [--win=1400] --cfg='nom=js à évaluer' --cfg='…'
// La 1re configuration (« base ») est l'état au moment du gel ; chaque --cfg part de cet état (le js
// de remise à zéro est --reset='…'). Handles utiles (?debug) : window.__npr = { NPR, presets, scene, gl },
// window.__ombres.worldView, window.__ombres.useRenderQuality.
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, frameStats, pageNow, gpuBusyAvg, collect } from '../tech/common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const N = Number(arg('n', '12'))
const Q = arg('q', 'high')
const T = arg('t', '104')
const ROUNDS = Number(arg('rounds', '5'))
const WIN = Number(arg('win', '1400'))
const RESET = arg('reset', '')
const CFGS = [['base', ''], ...args('cfg').map(c => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)] })]

const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(seed => {
  let s = seed >>> 0 || 1
  Math.random = () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}, 7)
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off', hints: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave,fast&speed=4`, { waitUntil: 'load' })
const got = await lobbyWith(pc, N, { rounds: 1, length: 'normal' })
await startMatch(pc)
await waitFor(
  pc,
  t => {
    const s = window.__ombres.runner.sim?.state
    if (window.__ombres.runner.phase !== 'round') return true
    if (!s || s.sun.t <= 0) return false
    return t.startsWith('pe') ? s.sun.paletteElevDeg <= Number(t.slice(2)) : s.sun.t >= (Number(t) * s.sun.T) / 110
  },
  T,
  400000,
  `cible ${T}`,
)
await pc.evaluate(() => { window.__ombres.runner.timeScale = () => 0 })
await pc.evaluate(() => (window.__probeGpu = true))
await sleep(1500)
const res = Object.fromEntries(CFGS.map(([n]) => [n, { p10: [], p50: [], p90: [] }]))
const busy0 = await gpuBusyAvg(6, 80)
for (let r = 0; r < ROUNDS; r++) {
  for (const [name, js] of CFGS) {
    if (RESET) await pc.evaluate(RESET)
    if (js) await pc.evaluate(js)
    await sleep(350)
    const t0 = await pageNow(pc)
    await sleep(WIN)
    const fs = await frameStats(pc, t0)
    if (fs?.gpuP50) {
      res[name].p10.push(fs.gpuP10)
      res[name].p50.push(fs.gpuP50)
      res[name].p90.push(fs.gpuP90)
    }
  }
}
if (RESET) await pc.evaluate(RESET)
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const info = await pc.evaluate(() => { const s = window.__ombres.runner.sim?.state; return { t: s?.sun.t.toFixed(1), phase: s?.sun.phase, pe: s?.sun.paletteElevDeg.toFixed(1) } })
console.log(`n=${got} q=${Q} cible ${T} ${JSON.stringify(info)} busy ${busy0}% → ${await gpuBusyAvg(6, 80)}% load ${loadavg()[0].toFixed(1)} tours ${ROUNDS}`)
const b = med(res.base.p50)
// tours « calmes » : ceux où la base (mesurée juste avant) est dans son quart le plus bas ; écart apparié
const bp = res.base.p10.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0])
const calm = new Set(bp.slice(0, Math.max(2, Math.ceil(bp.length / 4))).map(x => x[1]))
for (const [name] of CFGS) {
  const x = res[name]
  const pair = x.p10.map((v, i) => v - (res.base.p10[i] ?? NaN)).filter(Number.isFinite)
  const pairCalm = x.p10.map((v, i) => (calm.has(i) ? v - res.base.p10[i] : NaN)).filter(Number.isFinite)
  console.log(`${name.padEnd(20)} p10 min ${Math.min(...x.p10).toFixed(2)}  p50 méd ${med(x.p50).toFixed(2)} (Δ ${(med(x.p50) - b >= 0 ? '+' : '') + (med(x.p50) - b).toFixed(2)})  p90 méd ${med(x.p90).toFixed(2)}  | Δp10 apparié méd ${med(pair).toFixed(2)}, tours calmes ${med(pairCalm).toFixed(2)}`)
}
const errs = logs.filter(l => /error|pageerror/.test(l))
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await browser.close()
