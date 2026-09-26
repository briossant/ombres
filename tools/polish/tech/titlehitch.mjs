// QA technique : à-coups de l'écran titre (première impression) — images > 20 ms sur 60 s de titre,
// corrélées aux changements de carte de la démo et aux plans de caméra.
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings } from './common.mjs'
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => {
  window.__ev = []
  const o = window.__ombres
  let map = o.runner.sim?.state.config.mapId
  let shot = null
  const loop = () => {
    const m = o.runner.sim?.state.config.mapId
    if (m !== map) window.__ev.push([performance.now(), 'carte ' + m]), (map = m)
    const s = o.cameraCue?.mode + ':' + (window.__ombres.cameraCue?.shot ?? '')
    if (s !== shot) window.__ev.push([performance.now(), 'caméra ' + s]), (shot = s)
    requestAnimationFrame(loop)
  }
  requestAnimationFrame(loop)
})
const t0 = await pc.evaluate(() => performance.now())
await sleep(60000)
const r = await pc.evaluate(t0 => {
  const f = window.__probe.frames.filter(x => x[0] >= t0)
  const bad = f.filter(x => x[1] > 20).map(x => [Math.round((x[0] - t0) / 100) / 10, Math.round(x[1]), +x[2].toFixed(1)])
  return { n: f.length, bad: bad.length, pct: +((100 * bad.length) / f.length).toFixed(1), worst: bad.sort((a, b) => b[1] - a[1]).slice(0, 12), ev: window.__ev.filter(e => e[0] >= t0).map(e => [Math.round((e[0] - t0) / 100) / 10, e[1]]), long: window.__probe.longTasks.filter(l => l[0] >= t0).map(l => [Math.round((l[0] - t0) / 100) / 10, Math.round(l[1])]) }
}, t0)
console.log(JSON.stringify(r))
await browser.close()
