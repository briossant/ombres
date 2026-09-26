// QA : coût GPU par passe (timer queries, ?debug=perf) d'une manche à 12 oiseaux, par phase et par
// preset. 1 joueur au clavier + 11 bots, simulation × 2 ; relevés de window.__timings.
import { readFileSync } from 'node:fs'
import { ORIGIN, launch, newContext, sleep, waitFor, arg, presetSettings } from './lib.mjs'
import { KeyboardPilot } from './pilot.mjs'
const Q = arg('q', 'high')
const gpu = () => {
  try {
    return Number(readFileSync('/sys/class/drm/card1/device/gpu_busy_percent', 'utf8'))
  } catch {
    return -1
  }
}
const browser = await launch()
const pc = await (await newContext(browser)).newPage()
await presetSettings(pc, { lang: 'fr', quality: Q })
await pc.goto(`${ORIGIN}/?debug=perf,fast,nosave&speed=2`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(500)
await pc.keyboard.press('Space')
await sleep(300)
await pc.evaluate(() => {
  const r = window.__ombres.runner
  r.setMatchSetting('rounds', 1)
  r.setMatchSetting('length', 'normal')
  while (r.roster.size < 12) if (!r.addBot(null, 1)) break
})
await pc.keyboard.press('Enter')
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres?.runner.phase), null, 8000, 'lancement')
await pc.keyboard.press('Enter')
const kb = await pc.evaluate(() => window.__ombres.runner.roster.players.find(p => p.kind === 'keyboard').slot)
const pilot = new KeyboardPilot(pc, 1, () => kb, 3)
await pilot.start()
const seen = new Set()
while (true) {
  const st = await pc.evaluate(() => ({ phase: window.__ombres.runner.phase, sun: window.__ombres.runner.sim?.state.sun.phase, t: window.__ombres.runner.sim?.state.sun.t, T: window.__ombres.runner.sim?.state.sun.T }))
  if (st.phase !== 'round' || st.sun === 'night') break
  const key = st.sun
  if (!seen.has(key) && st.t > 0) {
    seen.add(key)
    await sleep(key === 'noon' ? 2500 : 3500)
    const g = []
    for (let i = 0; i < 8; i++) {
      g.push(gpu())
      await sleep(120)
    }
    const tm = await pc.evaluate(() => ({ ...(window.__timings ?? {}) }))
    const r = Object.fromEntries(Object.entries(tm).map(([k, v]) => [k, +Number(v).toFixed(2)]))
    console.log(`${Q} ${key.padEnd(12)} gpu_busy ${Math.round(g.reduce((a, b) => a + b, 0) / g.length)} % ; ${JSON.stringify(r)}`)
  }
  await sleep(200)
}
await pilot.stop()
await browser.close()
