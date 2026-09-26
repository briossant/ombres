// QA : podium dense (1 joueur au clavier + 11 bots, 1 manche accélérée) ; captures de l'arrivée.
import { ORIGIN, launch, newContext, collectLogs, makeShots, sleep, waitFor, problems, arg, presetSettings } from './lib.mjs'
const N = Number(arg('n', '12'))
const { shot, log } = makeShots(`podium${N}`)
const browser = await launch()
const pc = await (await newContext(browser)).newPage()
const logs = collectLogs(pc)
await presetSettings(pc, { lang: arg('lang', 'fr') })
await pc.goto(`${ORIGIN}/?debug=fast,nosave&speed=8`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
await pc.evaluate(() => window.__ombres.runner.enterLobby())
await sleep(500)
await pc.keyboard.press('Space')
await sleep(400)
await pc.evaluate(n => {
  const r = window.__ombres.runner
  r.setMatchSetting('rounds', 1)
  while (r.roster.size < n) if (!r.addBot(null, 1)) break
  const extra = r.roster.bots().slice(n - 1)
  for (const b of extra) if (r.roster.size > n) r.removeBot(b.slot)
}, N)
await sleep(600)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'rules' || window.__ombres?.runner.phase === 'round', null, 8000, 'lancement')
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults', null, 180000, 'podium')
for (let i = 0; i < 4; i++) {
  await sleep(900)
  await shot(pc, `podium-${i}`)
}
await sleep(2500)
await shot(pc, 'podium-late')
log(`oiseaux : ${await pc.evaluate(() => window.__ombres.useMatchResults.getState().rows.length)}`)
const p = problems(logs)
console.log(p.length ? `PROBLÈMES :\n  ${[...new Set(p)].join('\n  ')}` : 'console propre')
await browser.close()
