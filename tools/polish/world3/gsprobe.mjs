// Polish 3 (correcteur world-3) : coût GPU d'une manche EN DIRECT, fenêtre par fenêtre (0,5 s), de la fin
// du couchant à la nuit, avec la pose de la caméra (tangage, distance) et une capture JPEG par seconde :
// pour comprendre pourquoi la Grande Ombre à 12 oiseaux coûte parfois 3 ms de plus d'une partie à l'autre.
//   PORT=8872 node --import ./tools/polish/world/nohmr.mjs tools/polish/world3/gsprobe.mjs [--n=12] [--from=92] [--to=110] [--q=high] [--name=gsprobe]
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, frameStats, pageNow, presetSettings, lobbyWith, startMatch, kbSlot, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const N = Number(arg('n', '12'))
const FROM = Number(arg('from', '92'))
const TO = Number(arg('to', '110'))
const Q = arg('q', 'high')
const dir = join(import.meta.dirname, '../../../shots/polish3/world', arg('name', 'gsprobe'))
mkdirSync(dir, { recursive: true })
const browser = await launch()
const ctx = await newContext(browser, { w: 1920, h: 1080 })
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: Q, narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await lobbyWith(pc, N, { length: 'normal' })
await startMatch(pc)
await pc.evaluate(() => (window.__probeGpu = true))
const slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 5 + N)
await pilot.start()
// repère la caméra (pose lue à chaque fenêtre)
await pc.evaluate(() => {
  const O3 = Object.getPrototypeOf(Object.getPrototypeOf(window.__npr.scene))
  const orig = O3.updateMatrixWorld
  O3.updateMatrixWorld = function (f) {
    if (this.isPerspectiveCamera) window.__cam = this
    return orig.call(this, f)
  }
})
const T110 = () => pc.evaluate(() => { const s = window.__ombres.runner.sim?.state; return s && window.__ombres.runner.phase === 'round' ? (s.sun.t * 110) / s.sun.T : -1 })
while ((await T110()) < FROM) await sleep(200)
let lastShot = -1
while (true) {
  const t0 = await pageNow(pc)
  await sleep(500)
  const fs = await frameStats(pc, t0)
  const st = await pc.evaluate(() => {
    const s = window.__ombres.runner.sim?.state
    const c = window.__cam
    const d = c ? c.getWorldDirection(c.position.clone()) : null
    return { t: s ? (s.sun.t * 110) / s.sun.T : -1, phase: s?.sun.phase, pitch: d ? (Math.asin(-d.y) * 180) / Math.PI : null, y: c?.position.y, calls: window.__nprInfo?.calls }
  })
  if (st.t < 0 || st.t > TO || st.phase === 'over') break
  let shot = ''
  if (Math.floor(st.t) !== lastShot) {
    lastShot = Math.floor(st.t)
    shot = `${String(lastShot).padStart(3, '0')}.jpg`
    await pc.screenshot({ path: join(dir, shot), type: 'jpeg', quality: 70 })
  }
  console.log(`t ${st.t.toFixed(1)} ${String(st.phase).padEnd(11)} tangage ${st.pitch?.toFixed(1)}° haut ${st.y?.toFixed(0)} m appels ${st.calls} | GPU p50 ${fs?.gpuP50} p90 ${fs?.gpuP90} | fps ${fs?.fps} ${shot}`)
}
await pilot.stop()
if (logs.length) console.log(logs.slice(0, 10).join('\n'))
await browser.close()
