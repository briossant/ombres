// Polish vague 2 (tech, ordre 3) : à-coup de l'écran titre au changement de carte de la démo.
// Force N changements de carte (runner.onDemoLoop, comme la boucle naturelle de la démo) et mesure,
// autour de chacun : longues tâches, pire intervalle d'image, temps CPU de la frame, et (--profile)
// les fonctions les plus coûteuses (profil CPU CDP, temps propre) pendant la fenêtre de bascule.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/titlehitch.mjs [--n=6] [--q=high] [--profile]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', '6'))
const Q = arg('q', 'high')
const PROFILE = process.argv.includes('--profile')

const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const errors = []
pc.on('pageerror', e => errors.push(e.message))
pc.on('console', m => (m.type() === 'error' || m.type() === 'warning') && errors.push(m.text().slice(0, 200)))
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' }, Q)
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(4000)
const cdp = PROFILE ? await ctx.newCDPSession(pc) : null
if (cdp) {
  await cdp.send('Profiler.enable')
  await cdp.send('Profiler.setSamplingInterval', { interval: 200 })
}
const rows = []
const selfTotals = new Map()
for (let i = 0; i < N; i++) {
  // un temps calme entre deux bascules (la préparation en tâche de fond a le temps de se faire)
  await sleep(3500)
  if (cdp) await cdp.send('Profiler.start')
  const r = await pc.evaluate(async () => {
    const o = window.__ombres
    const t0 = performance.now()
    const map0 = o.runner.sim?.state.config.mapId
    o.runner.onDemoLoop()
    // la bascule se fait au prochain passage des minuteries du runner (frame suivante)
    await new Promise(res => {
      const w = () => (o.runner.sim?.state.config.mapId !== map0 || performance.now() - t0 > 3000 ? res() : requestAnimationFrame(w))
      requestAnimationFrame(w)
    })
    const tSwitch = performance.now()
    await new Promise(res => setTimeout(res, 1200))
    const f = window.__probe.frames.filter(x => x[0] >= t0 - 20)
    const lt = window.__probe.longTasks.filter(l => l[0] >= t0 - 20)
    return {
      map: `${map0}→${o.runner.sim?.state.config.mapId}`,
      switchMs: Math.round(tSwitch - t0),
      worstIv: Math.round(Math.max(...f.map(x => x[1]))),
      worstCpu: +Math.max(...f.map(x => x[2])).toFixed(1),
      over20: f.filter(x => x[1] > 20).length,
      long: lt.map(l => Math.round(l[1])),
    }
  })
  if (cdp) {
    const { profile } = await cdp.send('Profiler.stop')
    const byId = new Map(profile.nodes.map(n => [n.id, n]))
    const dt = profile.timeDeltas
    const self = new Map()
    profile.samples.forEach((id, k) => {
      const n = byId.get(id)
      const fn = n.callFrame
      const key = `${fn.functionName || '(anon)'} ${fn.url.split('/').pop()?.split('?')[0]}:${fn.lineNumber + 1}`
      self.set(key, (self.get(key) ?? 0) + (dt[k] ?? 0) / 1000)
    })
    for (const [k, v] of self) selfTotals.set(k, (selfTotals.get(k) ?? 0) + v)
  }
  rows.push(r)
  console.log(JSON.stringify(r))
}
if (cdp) {
  const top = [...selfTotals].filter(([k]) => !k.startsWith('(idle)') && !k.startsWith('(program)')).sort((a, b) => b[1] - a[1]).slice(0, 30)
  console.log('--- temps propre cumulé (ms) sur les fenêtres de bascule ---')
  for (const [k, v] of top) console.log(v.toFixed(1).padStart(8), k)
}
const worst = rows.map(r => r.worstIv).sort((a, b) => a - b)
console.log(`RÉSUMÉ q=${Q} n=${N} pire intervalle médian ${worst[Math.floor(worst.length / 2)]} ms, max ${worst.at(-1)} ms ; longues tâches ${rows.flatMap(r => r.long).join(',') || 'aucune'}`)
console.log('erreurs console :', errors.length ? errors.join(' | ') : 'aucune')
await browser.close()
