// Manche complète sur le jeu DÉPLOYÉ (accélérée par ?debug=fast) : PC + iPhone émulé qui rejoint par le QR,
// à travers le vrai proxy HTTPS/WSS, jusqu'aux résultats. Usage : node tools/e2e/deploy/remote-round.mjs <url>
import { launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, newPhone, joinPhone } from '../qa/lib.mjs'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) throw new Error('usage: remote-round.mjs <url>')
const { shot, log } = makeShots('deploy-round')
const browser = await launch()
const pc = await (await newContext(browser)).newPage()
const pcLogs = collectLogs(pc, 'pc')
await pc.goto(`${base}/?debug=fast,nosave&speed=6`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 60000, 'titre')
await waitFor(pc, () => !!window.__ombres.useLobby.getState().joinUrl, null, 20000, 'URL de join')
const s0 = await state(pc)
const ph = await newPhone(browser, 'iPhone 15 Pro', 'iphone')
await joinPhone(ph, s0.joinUrl, 'Distant', 1)
await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'lobby', null, 20000, 'salon')
await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
await sleep(1500)
await pc.keyboard.press('Enter')
await waitFor(pc, () => window.__ombres.useUi.getState().screen === 'game', null, 40000, 'manche')
log('manche lancée')
let shots = 0
for (;;) {
  const st = await state(pc)
  if (st.results >= 1 || st.phase !== 'round') break
  if (st.phaseSun && ['golden', 'greatShadow'].includes(st.phaseSun) && shots < 2 && st.phaseSun !== (shots === 1 ? 'golden' : '')) {
    await shot(pc, `pc-${st.phaseSun}`)
    await shot(ph.page, `tel-${st.phaseSun}`)
    shots++
  }
  await sleep(700)
}
await sleep(4000)
await shot(pc, 'pc-resultats')
await shot(ph.page, 'tel-resultats')
const st = await state(pc)
log(`fin : écran ${st.screen}, résultats ${st.results}, roster ${st.roster.map(r => `${r.name || r.kind}`).join(', ')}`)
const errs = [...problems(pcLogs), ...problems(ph.logs)]
log(errs.length ? `PROBLÈMES : ${errs.join(' | ')}` : 'console propre (PC + téléphone)')
await browser.close()
