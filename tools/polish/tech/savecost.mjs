// QA technique : coût de la sauvegarde de session (runner.save, toutes les 2,5 s + à chaque écran)
// en pleine manche à 12 oiseaux : durée, taille écrite dans sessionStorage.
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, sleep, waitFor, presetSettings, lobbyWith, startMatch } from './common.mjs'
const browser = await launch()
const pc = await (await newContext(browser)).newPage()
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'off' })
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await lobbyWith(pc, 12, { rounds: 1 })
await startMatch(pc)
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 60, null, 200000, 't>60')
const r = await pc.evaluate(() => {
  const t = []
  for (let i = 0; i < 12; i++) {
    const s = performance.now()
    window.__ombres.runner.save(true)
    t.push(performance.now() - s)
  }
  t.sort((a, b) => a - b)
  const raw = sessionStorage.getItem('ombres.runner.v1') ?? ''
  return { medianMs: +t[6].toFixed(2), maxMs: +t[11].toFixed(2), kB: Math.round(raw.length / 1024) }
})
console.log('save() à 12 oiseaux, t>60 s :', JSON.stringify(r))
await browser.close()
