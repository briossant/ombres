// Correcteur world (polish W13) : rafale du compte à rebours des manches 1 et 2 — crayonné tenu à
// t ≈ −2 s, puis coulée de couleur d'ouest en est après « Envol ! » (+0,2 / +0,5 / +1 s réelles).
//   PORT=8832 node --import ./tools/polish/world/nohmr.mjs tools/polish/world/countdown.mjs [--n=4] [--name=countdown]
//     [--reduce]   (réglage « Réduire les flashs » : aucun crayonné attendu)
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch, collect } from '../tech/common.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const NAME = arg('name', 'countdown')
const N = Number(arg('n', '4'))
const REDUCE = process.argv.includes('--reduce')
const dir = join(import.meta.dirname, '../../../shots/polish/fix-world', NAME)
mkdirSync(dir, { recursive: true })

const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await presetSettings(pc, { lang: 'fr', quality: 'high', narrator: 'off', hints: 'off', reduceFlashes: REDUCE })
// vitesse réelle : la coulée dure 0,8 s réelles ; manches courtes pour enchaîner
await pc.goto(`${ORIGIN}/?debug=nosave,fast&speed=1`, { waitUntil: 'load' })
await lobbyWith(pc, N, { rounds: 2, length: 'short' })
await startMatch(pc)
const sunT = () => pc.evaluate(() => window.__ombres.runner.sim?.state.sun.t ?? -99)
const shoot = async label => {
  const rt = await pc.evaluate(() => window.__ombres.runner.sim?.state.sun.t.toFixed(2))
  await pc.screenshot({ path: join(dir, `${label}.jpg`), type: 'jpeg', quality: 88 })
  console.log(`${label} (sun.t ${rt})`)
}
for (const round of [1, 2]) {
  if (round === 2) {
    await waitFor(pc, () => window.__ombres.runner.phase === 'roundResults', null, 400000, 'résultats manche 1')
    await sleep(800)
    await pc.evaluate(() => window.__ombres.runner.continueResults())
    await waitFor(pc, () => window.__ombres.runner.phase === 'round' && (window.__ombres.runner.sim?.state.sun.t ?? 0) < -1, null, 60000, 'compte à rebours manche 2')
  }
  await waitFor(pc, () => { const t = window.__ombres.runner.sim?.state.sun.t; return t !== undefined && t < -1.6 && t > -2.4 }, null, 60000, 't ≈ −2')
  await shoot(`r${round}-t-2`)
  await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? -9) >= 0, null, 20000, 'Envol')
  const t0 = Date.now()
  for (const ms of [200, 500, 1000]) {
    const wait = ms - (Date.now() - t0)
    if (wait > 0) await sleep(wait)
    await shoot(`r${round}-plus${ms}ms-real${Date.now() - t0}`)
  }
}
const errs = logs.filter(l => /error|pageerror/.test(l))
if (errs.length) console.log(errs.slice(0, 10).join('\n'))
await browser.close()
