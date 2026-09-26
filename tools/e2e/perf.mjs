// Coût CPU du runner par frame (boucle à pas fixe, bots, directeurs, hub, sauvegarde) pendant une
// vraie manche (vitesse normale), et coût de la sauvegarde de session.
//   node tools/e2e/perf.mjs [--bots=5] [--seconds=20]
import { ORIGIN, launch, newContext, collectLogs, sleep, waitFor, errorsOf } from './lib.mjs'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const BOTS = Number(arg('bots') ?? 5)
const SECONDS = Number(arg('seconds') ?? 20)
const browser = await launch()
const ctx = await newContext(browser)
const page = await ctx.newPage()
const logs = collectLogs(page)
await page.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
await page.keyboard.press('KeyX')
await sleep(400)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'lobby', null, 10000, 'salon')
await page.keyboard.press('Space')
await sleep(300)
await page.evaluate(n => {
  const r = window.__ombres.runner
  while (r.roster.bots().length < n) r.addBot(null, 1)
}, BOTS)
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.useUi.getState().screen === 'rules', null, 8000, 'cartes')
await page.keyboard.press('Enter')
await waitFor(page, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.sim.state.sun.t > 1, null, 20000, 'manche')
const res = await page.evaluate(async seconds => {
  const r = window.__ombres.runner
  const orig = r.frame.bind(r)
  const times = []
  r.frame = dt => {
    const t = performance.now()
    orig(dt)
    times.push(performance.now() - t)
  }
  await new Promise(res => setTimeout(res, seconds * 1000))
  r.frame = orig
  times.sort((a, b) => a - b)
  const q = p => times[Math.floor(times.length * p)]
  const t = performance.now()
  for (let i = 0; i < 5; i++) r.save(true)
  const save = (performance.now() - t) / 5
  const size = sessionStorage.getItem('ombres.runner.v1')?.length ?? 0
  return { frames: times.length, fps: times.length / seconds, mean: times.reduce((a, b) => a + b, 0) / times.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: times[times.length - 1], save, size, birds: r.sim.state.birds.length }
}, SECONDS)
console.log(JSON.stringify(res, null, 1))
console.log('erreurs', errorsOf(logs))
await browser.close()
