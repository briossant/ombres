// QA technique : chronologie du chargement du PC (étapes de bootGame, octets, fps pendant la chauffe),
// premier lancement puis rechargement au salon / en manche.
//   PORT=8824 node tools/polish/tech/loadtrace.mjs [--at=title|lobby|round] [--origin=http://localhost:8894] [--q=auto]
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN as DEV, PROBE, sleep, waitFor, presetSettings, collect, gpuBusyAvg } from './common.mjs'
import { loadavg } from 'node:os'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const ORIGIN = arg('origin', DEV)
const AT = arg('at', 'lobby')
const Q = arg('q', 'medium')
const DBG = arg('debug', 'debug')
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await pc.addInitScript(() => {
  const T = (window.__loadTrace = [])
  const t0 = performance.now()
  const iv = setInterval(() => {
    const o = window.__ombres
    const ui = o?.useUi?.getState?.()
    const key = ui ? `${ui.screen}:${ui.loading.labelKey}:${Math.round(ui.loading.progress * 100)}` : 'noui'
    if (!T.length || T[T.length - 1][1] !== key) T.push([Math.round(performance.now() - t0), key, o?.runner?.renderedFrames ?? 0])
  }, 50)
  window.__stopTrace = () => clearInterval(iv)
})
if (Q !== 'none') await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'voice' })
let bytes = 0
let reqs = 0
pc.on('response', async r => {
  reqs++
  const len = Number((await r.allHeaders())['content-length'] ?? 0)
  bytes += len
})
const cdp = await ctx.newCDPSession(pc)
await cdp.send('Network.enable')
let wire = 0
cdp.on('Network.loadingFinished', e => (wire += e.encodedDataLength))
const q = DBG ? `?${DBG}` : ''
console.log(`load ${loadavg()[0].toFixed(1)} gpu ${await gpuBusyAvg(4, 80)}%`)
const t0 = Date.now()
await pc.goto(`${ORIGIN}/${q}`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres ? window.__ombres.runner.phase !== 'boot' : document.querySelector('.title, [class*=title]') !== null, null, 120000, 'fin du chargement')
const trace = await pc.evaluate(() => window.__loadTrace)
console.log(`1er chargement ${(Date.now() - t0) / 1000} s, ${reqs} requêtes, ${(wire / 1048576).toFixed(2)} Mo sur le fil`)
console.log(trace.map(([t, k, f]) => `${(t / 1000).toFixed(2)}s ${k} f${f}`).join('\n'))
if (AT !== 'title' && DBG) {
  await pc.evaluate(() => window.__ombres.runner.enterLobby())
  await sleep(500)
  await pc.keyboard.press('Space')
  await sleep(1500)
  if (AT === 'round') {
    await pc.keyboard.press('Enter')
    await sleep(1000)
    await pc.keyboard.press('Enter')
    await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
    await sleep(8000)
  }
  wire = 0
  const t1 = Date.now()
  await pc.reload({ waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres.runner.phase !== 'boot', null, 120000, 'fin du rechargement')
  const tr2 = await pc.evaluate(() => window.__loadTrace)
  console.log(`rechargement (${AT}) ${(Date.now() - t1) / 1000} s, ${(wire / 1048576).toFixed(2)} Mo sur le fil`)
  console.log(tr2.map(([t, k, f]) => `${(t / 1000).toFixed(2)}s ${k} f${f}`).join('\n'))
}
console.log(logs.slice(0, 20).join('\n'))
await browser.close()
