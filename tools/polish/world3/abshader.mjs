// Polish 3 (correcteur world-3) : A/B de coût GPU ENTRELACÉ avec des VARIANTES DE SHADER, dans une même
// page, scène de manche figée (même principe que tools/polish/world/abperf.mjs). Chaque configuration
// peut remplacer des bouts du source d'un matériau (compilé une fois, puis gardé en cache par three :
// l'alternance ne recompile plus) et/ou évaluer du js. Mesure : requête TIME_ELAPSED sur toute l'image.
//   PORT=8872 node --import ./tools/polish/world/nohmr.mjs tools/polish/world3/abshader.mjs \
//     --n=12 --t=104 [--q=high] [--rounds=6] [--win=1500] --cfgs=chemin.json [--basejs='js de remise à zéro']
// chemin.json : [{ "name": "sansBande", "mat": "world.ground", "patch": [["de", "vers"], …], "js": "…" }, …]
// La base (état au gel, shader d'origine) est ajoutée en tête.
import { readFileSync } from 'node:fs'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, lobbyWith, startMatch, frameStats, pageNow, gpuBusyAvg, collect } from '../tech/common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const N = Number(arg('n', '12'))
const Q = arg('q', 'high')
const T = arg('t', '104')
const ROUNDS = Number(arg('rounds', '6'))
const WIN = Number(arg('win', '1500'))
const BASEJS = arg('basejs', '')
const CFGS = [{ name: 'base' }, ...JSON.parse(readFileSync(arg('cfgs'), 'utf8'))]

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
if (process.argv.includes('--list')) {
  const tree = await pc.evaluate(() => {
    const out = []
    const walk = (o, d) => {
      let tris = 0, n = 0
      o.traverse(c => { if (c.isMesh && c.visible) { n++; const g = c.geometry; tris += ((g.index ? g.index.count : g.attributes.position?.count ?? 0) / 3) * (c.isInstancedMesh ? c.count : 1) } })
      const mats = [...new Set((Array.isArray(o.material) ? o.material : o.material ? [o.material] : []).map(m => m.name || m.type))]
      out.push(`${'  '.repeat(d)}${o.type} "${o.name}" vis=${o.visible} meshes=${n} tris=${Math.round(tris / 1000)}k ${mats.join(',')}`)
      if (d < 2) for (const c of o.children) walk(c, d + 1)
    }
    walk(window.__npr.scene, 0)
    return out.join('\n')
  })
  console.log(tree)
}
// applique une configuration : shaders d'origine partout, puis les remplacements demandés
const apply = async cfg =>
  pc.evaluate(cfg => {
    const mats = new Map()
    window.__npr.scene.traverse(o => {
      const ms = Array.isArray(o.material) ? o.material : o.material ? [o.material] : []
      for (const m of ms) if (m.isShaderMaterial) mats.set(m.uuid, m)
    })
    const miss = []
    for (const m of mats.values()) {
      if (m.userData.__origFS === undefined) m.userData.__origFS = m.fragmentShader
      let fs = m.userData.__origFS
      if (cfg.mat && m.name === cfg.mat)
        for (const [a, b] of cfg.patch ?? []) {
          if (!fs.includes(a)) miss.push(a.slice(0, 60))
          fs = fs.split(a).join(b)
        }
      if (fs !== m.fragmentShader) {
        m.fragmentShader = fs
        m.needsUpdate = true
      }
    }
    if (cfg.basejs) (0, eval)(cfg.basejs)
    if (cfg.js) (0, eval)(cfg.js)
    return miss
  }, { ...cfg, basejs: BASEJS })
// chauffe : chaque variante compilée une fois
for (const cfg of CFGS) {
  const miss = await apply(cfg)
  if (miss.length) console.log(`!! ${cfg.name} : motif introuvable`, miss)
  await sleep(900)
}
await pc.evaluate(() => (window.__probeGpu = true))
await sleep(800)
const res = Object.fromEntries(CFGS.map(c => [c.name, { p10: [], p50: [], p90: [] }]))
const busy0 = await gpuBusyAvg(6, 80)
for (let r = 0; r < ROUNDS; r++) {
  for (const cfg of CFGS) {
    await apply(cfg)
    await sleep(400)
    const t0 = await pageNow(pc)
    await sleep(WIN)
    const fs = await frameStats(pc, t0)
    if (fs?.gpuP50) {
      res[cfg.name].p10.push(fs.gpuP10)
      res[cfg.name].p50.push(fs.gpuP50)
      res[cfg.name].p90.push(fs.gpuP90)
    }
  }
}
await apply({ name: 'base' })
const med = a => { const s = [...a].sort((x, y) => x - y); return s.length ? s[Math.floor(s.length / 2)] : NaN }
const info = await pc.evaluate(() => { const s = window.__ombres.runner.sim?.state; return { t: s?.sun.t.toFixed(1), phase: s?.sun.phase, pe: s?.sun.paletteElevDeg.toFixed(1) } })
console.log(`n=${got} q=${Q} cible ${T} ${JSON.stringify(info)} busy ${busy0}% → ${await gpuBusyAvg(6, 80)}% load ${loadavg()[0].toFixed(1)} tours ${ROUNDS}`)
const b50 = med(res.base.p50)
const b90 = med(res.base.p90)
for (const { name } of CFGS) {
  const x = res[name]
  const pair = x.p50.map((v, i) => v - (res.base.p50[i] ?? NaN)).filter(Number.isFinite)
  const sg = v => (v >= 0 ? '+' : '') + v.toFixed(2)
  console.log(`${name.padEnd(22)} p10 min ${Math.min(...x.p10).toFixed(2)}  p50 méd ${med(x.p50).toFixed(2)} (${sg(med(x.p50) - b50)})  p90 méd ${med(x.p90).toFixed(2)} (${sg(med(x.p90) - b90)})  | Δp50 apparié méd ${sg(med(pair))} [${pair.map(v => v.toFixed(2)).join(' ')}]`)
}
const errs = logs.filter(l => /error|pageerror/i.test(l))
if (errs.length) console.log(errs.slice(0, 5).join('\n'))
await browser.close()
