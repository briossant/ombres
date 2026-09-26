// Non-régression : qualité « auto » sur une machine donnée, premier lancement (aucun banc mémorisé),
// partie à 12 oiseaux à vitesse réelle. Niveau choisi par le banc du titre, niveau et images/s à chaque
// phase du soleil (rAF, sans requête GPU externe pour ne pas priver le moniteur de ses mesures), niveau
// après chaque entracte.
//   PORT=8841 node --import ./tools/polish/verify/watch.mjs tools/polish/verify/auto12.mjs [--rounds=2] [--n=12]
import { launch, newContext } from '../../lib/browser.mjs'
import { KeyboardPilot } from '../../e2e/qa/pilot.mjs'
import { ORIGIN, PROBE, sleep, gpuBusyAvg, frameStats, pageNow, presetSettings, lobbyWith, startMatch, kbSlot, collect, waitFor } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1] ?? d
const ROUNDS = Number(arg('rounds', '2'))
const N = Number(arg('n', '12'))
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'auto')
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: 'auto', narrator: 'voice' })
await pc.goto(`${ORIGIN}/?debug=nosave`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
const lv = () => pc.evaluate(() => window.__ombres.useRenderQuality.getState())
console.log('titre, avant le banc :', JSON.stringify(await lv()))
await waitFor(pc, () => window.__ombres.useRenderQuality.getState().benchLevel !== null, null, 30000, 'banc')
console.log('banc du titre :', JSON.stringify(await lv()), 'gpu_busy', await gpuBusyAvg(6, 80), '%')
await sleep(2000)
const got = await lobbyWith(pc, N, { rounds: ROUNDS, length: 'normal' })
await startMatch(pc)
const slot = await kbSlot(pc)
const pilot = new KeyboardPilot(pc, 1, () => slot, 5 + N)
await pilot.start()
for (let r = 1; r <= ROUNDS; r++) {
  const seen = new Set()
  let t0 = await pageNow(pc)
  let cur = null
  const flush = async () => {
    if (!cur) return
    const fs = await frameStats(pc, t0)
    const q = await lv()
    console.log(`manche ${r} ${cur.padEnd(11)} niveau ${q.level.padEnd(6)} busy ${await gpuBusyAvg(4, 60)}% | fps ${fs?.fps} iv p95 ${fs?.ivP95} p99 ${fs?.ivP99} >20ms ${fs?.over20}%`)
  }
  while (true) {
    const st = await pc.evaluate(() => ({ phase: window.__ombres.runner.phase, sun: window.__ombres.runner.sim?.state.sun.phase, t: window.__ombres.runner.sim?.state.sun.t }))
    if (st.phase !== 'round' || st.sun === 'night' || st.sun === 'over') break
    if (st.t > 0 && st.sun !== cur) {
      await flush()
      cur = st.sun
      seen.add(cur)
      t0 = await pageNow(pc)
    }
    await sleep(250)
  }
  await flush()
  await waitFor(pc, () => ['roundResults', 'matchResults'].includes(window.__ombres.runner.phase), null, 60000, 'résultats')
  await sleep(800)
  console.log(`après la manche ${r} (${got} oiseaux) : niveau ${(await lv()).level}`)
  if (r < ROUNDS) {
    await sleep(3000)
    await pc.keyboard.press('Enter')
    await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 30000, 'manche suivante')
  }
}
await pilot.stop()
console.log(logs.length ? logs.slice(0, 10).join('\n') : 'console propre')
await browser.close()
