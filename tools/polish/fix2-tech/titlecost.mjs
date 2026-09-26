// Polish vague 2 (tech, ordre 3) : décomposition du coût d'un changement de carte de la démo du titre.
// Mesure dans la page : (a) runner.startDemo() seul (simulation + bots, synchrone), (b) la frame qui suit
// (reconstruction du décor : sol, tours, cailloux, horizon, téléversements GPU), (c) la frame d'après.
//   PORT=8855 node --import ./tools/polish/staging/nohmr.mjs tools/polish/fix2-tech/titlecost.mjs [--n=8] [--q=high]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, sleep, waitFor, presetSettings, gpuBusyAvg } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', '8'))
const Q = arg('q', 'high')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' }, Q)
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await sleep(3000)
console.log('gpu_busy moyen', await gpuBusyAvg())
// chronomètre de startDemo (appelé par la minuterie du runner) : coût synchrone de la bascule
await pc.evaluate(() => {
  const r = window.__ombres.runner
  const proto = Object.getPrototypeOf(r)
  window.__startDemoMs = []
  r.startDemo = function (...a) {
    const t = performance.now()
    const out = proto.startDemo.apply(this, a)
    window.__startDemoMs.push(+(performance.now() - t).toFixed(1))
    return out
  }
})
const rows = []
for (let i = 0; i < N; i++) {
  // comme la boucle naturelle (≈ 45 s) : la démo suivante a eu son temps mort pour se préparer
  await sleep(2500)
  await waitFor(pc, () => !!window.__ombres.runner.nextDemo, null, 30000, 'démo suivante préparée')
  await sleep(1500)
  const r = await pc.evaluate(async () => {
    const o = window.__ombres
    const raf = () => new Promise(res => requestAnimationFrame(res))
    await raf()
    const map0 = o.runner.sim?.state.config.mapId
    const a = performance.now()
    o.runner.onDemoLoop()
    // onDemoLoop programme la bascule (minuterie du runner) : elle a lieu dans la frame suivante
    const f = []
    let prev = performance.now()
    for (let k = 0; k < 4; k++) {
      await raf()
      const t = performance.now()
      f.push(Math.round(t - prev))
      prev = t
    }
    const lt = window.__probe.longTasks.filter(l => l[0] >= a - 5).map(l => Math.round(l[1]))
    return { map: `${map0}→${o.runner.sim?.state.config.mapId}`, frames: f, long: lt, startDemoMs: window.__startDemoMs.at(-1) }
  })
  rows.push(r)
  console.log(JSON.stringify(r))
}
const worst = rows.map(r => Math.max(...r.frames)).sort((a, b) => a - b)
console.log(`RÉSUMÉ q=${Q} n=${N} pire frame : médiane ${worst[Math.floor(worst.length / 2)]} ms, max ${worst.at(-1)} ms ; longues tâches ${rows.flatMap(r => r.long).join(',') || 'aucune'}`)
await browser.close()
