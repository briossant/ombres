// Correcteur antialiasing : A/B de coût GPU ENTRELACÉ (même page, manche figée), configurations en js.
// Mesure : requête TIME_ELAPSED sur toute l'image (sonde de tools/polish/tech/common.mjs), p50 par fenêtre,
// écart apparié à la base (1re configuration). Dans la page : `__legacyInk` (source de l'encre d'avant),
// `__ink(src)` (remplace le shader d'encre ; null = shader courant du code), `__cur()` (source du code),
// `__smaa(p)` (preset SMAA 0-3), `__q(level)` (preset), `__presets` (objets mutables), `__patch(q, champs)`
// (preset modifié et pipeline re-monté ; ne fait rien si déjà appliqué : alternance sans recompilation),
// `__before(q)` / `__after(q)` (état d'avant le correcteur AA : presets et encre binaire / état du code).
//   PORT=8891 node --import ./tools/polish/world/nohmr.mjs tools/polish/aa/abink.mjs --n=12 --t=104 --q=high \
//     [--w=1920 --h=1080] [--rounds=6] [--win=1500] --cfg='ancienne=__ink(__legacyInk)' --cfg='nouvelle=__ink(null)'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { launch } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, frameStats, pageNow, gpuBusyAvg, collect } from '../tech/common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const args = k => process.argv.filter(a => a.startsWith(`--${k}=`)).map(a => a.split('=').slice(1).join('='))
const N = Number(arg('n', '12'))
const Q = arg('q', 'high')
const T = arg('t', '104')
const ROUNDS = Number(arg('rounds', '6'))
const WIN = Number(arg('win', '1500'))
const W = Number(arg('w', '1920'))
const H = Number(arg('h', '1080'))
const CFGS = args('cfg').map(c => { const i = c.indexOf('='); return { name: c.slice(0, i), js: c.slice(i + 1) } })
const LEGACY = readFileSync(join(import.meta.dirname, 'legacy-ink.glsl'), 'utf8')
// Presets d'avant le correcteur AA (quality.ts du 2026-09-26), pour `__before(q)` : seuls les champs changés
const BEFORE = {
  low: { targetHeight: 720, gbufferScale: 1, supersample: 1, smaa: null },
  medium: { targetHeight: 900, gbufferScale: 1, supersample: 1, smaa: 0 },
  high: { targetHeight: 1080, gbufferScale: 1, supersample: 1, smaa: 0 },
}

const browser = await launch()
const ctx = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
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
await pc.evaluate(b => (window.__BEFORE = b), BEFORE)
await pc.evaluate(legacy => {
  window.__legacyInk = legacy
  window.__presets = window.__npr.presets
  window.__ink = src => {
    const ink = window.__npr.ink()
    if (!ink) return
    if (ink.__orig === undefined) ink.__orig = ink.fragmentShader
    const want = src ?? ink.__orig
    if (ink.fragmentShader !== want) ink.setFragmentShader(want)
  }
  // source du shader d'encre du code (pour des variantes : __ink(__cur().replace(a, b)))
  window.__cur = () => {
    const ink = window.__npr.ink()
    if (ink.__orig === undefined) ink.__orig = ink.fragmentShader
    return ink.__orig
  }
  window.__smaa = p => {
    const s = window.__npr.smaa()
    if (s && p >= 0) s.applyPreset(p)
  }
  window.__q = q => window.__ombres.useRenderQuality.getState().setLevel(q)
  // preset modifié puis pipeline re-monté (détour par un autre niveau le temps de deux images)
  window.__patch = (q, p) => {
    const st = window.__ombres.useRenderQuality.getState()
    const key = JSON.stringify(p)
    if (window.__patched?.[q] === key && st.level === q) return
    window.__patched = { ...(window.__patched ?? {}), [q]: key }
    window.__presets[q] = { ...(window.__presetsOrig ??= Object.fromEntries(Object.entries(window.__presets).map(([k, v]) => [k, { ...v }])))[q], ...p }
    st.setLevel(q === 'low' ? 'medium' : 'low')
    requestAnimationFrame(() => requestAnimationFrame(() => window.__ombres.useRenderQuality.getState().setLevel(q)))
  }
  // état d'avant le correcteur AA (presets + encre binaire) / état du code
  window.__before = q => {
    window.__patch(q, window.__BEFORE[q])
    setTimeout(() => window.__ink(window.__legacyInk), 400)
  }
  window.__after = q => window.__patch(q, {})
}, LEGACY)
// chauffe : chaque configuration compilée une fois
for (const c of CFGS) {
  await pc.evaluate(c.js)
  await sleep(1500)
}
await pc.evaluate(() => (window.__probeGpu = true))
await sleep(800)
const res = Object.fromEntries(CFGS.map(c => [c.name, { p50: [], p90: [] }]))
const busy0 = await gpuBusyAvg(6, 80)
for (let r = 0; r < ROUNDS; r++) {
  for (const c of CFGS) {
    await pc.evaluate(c.js)
    await sleep(/__patch|__before|__after/.test(c.js) ? 1100 : 500)
    const t0 = await pageNow(pc)
    await sleep(WIN)
    const fs = await frameStats(pc, t0)
    if (fs?.gpuP50) {
      res[c.name].p50.push(fs.gpuP50)
      res[c.name].p90.push(fs.gpuP90)
    }
  }
}
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const cv = await pc.evaluate(() => { const c = document.querySelector('canvas'); return `${c.width}x${c.height}` })
console.log(`n=${got} q=${Q} ${W}x${H} (canevas ${cv}) cible ${T} busy ${busy0}% → ${await gpuBusyAvg(6, 80)}% charge ${loadavg()[0].toFixed(1)} tours ${ROUNDS}`)
const base = res[CFGS[0].name]
for (const c of CFGS) {
  const x = res[c.name]
  const pair = x.p50.map((v, i) => v - (base.p50[i] ?? NaN)).filter(Number.isFinite)
  const sg = v => (v >= 0 ? '+' : '') + v.toFixed(2)
  console.log(`${c.name.padEnd(18)} p50 méd ${med(x.p50).toFixed(2)}  p90 méd ${med(x.p90).toFixed(2)}  | Δp50 apparié méd ${sg(med(pair))} [${pair.map(v => v.toFixed(2)).join(' ')}]`)
}
const errs = logs.filter(l => /error|pageerror/i.test(l))
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await browser.close()
