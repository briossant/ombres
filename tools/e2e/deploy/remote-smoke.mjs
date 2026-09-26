// Test de fumée sur le jeu DÉPLOYÉ : PC (desktop) + iPhone émulé qui rejoint par l'URL du QR code,
// à travers le vrai proxy HTTPS/WSS. Usage : node tools/e2e/deploy/remote-smoke.mjs <url>
import { launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, newPhone, joinPhone } from '../qa/lib.mjs'

const base = (process.argv[2] ?? '').replace(/\/$/, '')
if (!base) throw new Error('usage: remote-smoke.mjs <url>')
const { shot, log } = makeShots('deploy')
const browser = await launch()
const host = await (await newContext(browser)).newPage()
const hostLogs = collectLogs(host, 'pc')
const t0 = Date.now()
await host.goto(`${base}/?debug`, { waitUntil: 'load' })
await waitFor(host, () => window.__ombres?.useUi.getState().screen === 'title', null, 60000, 'écran titre')
log(`titre en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
await sleep(2500)
await shot(host, 'pc-titre')
await waitFor(host, () => !!window.__ombres.useLobby.getState().joinUrl, null, 20000, 'URL de join')
const s = await state(host)
log(`salle ${s.room} → ${s.joinUrl}`)
if (!s.joinUrl.startsWith('https://')) log(`KO : le QR ne pointe pas en https (${s.joinUrl})`)

const ph = await newPhone(browser, 'iPhone 15 Pro', 'iphone')
await joinPhone(ph, s.joinUrl, 'Distant', 2)
await sleep(1500)
await shot(ph.page, 'tel-salon')
await waitFor(host, () => window.__ombres.useUi.getState().screen === 'lobby', null, 20000, 'salon sur le PC')
await sleep(2500)
await shot(host, 'pc-salon')
const after = await state(host)
log(`roster : ${after.roster.map(r => `${r.name}/${r.kind}/${r.connected ? 'co' : 'déco'}`).join(', ')}`)
const errs = [...problems(hostLogs), ...problems(ph.logs)]
log(errs.length ? `PROBLÈMES : ${errs.join(' | ')}` : 'console propre (PC + téléphone)')
await browser.close()
