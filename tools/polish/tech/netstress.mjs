// QA technique réseau : 12 téléphones simulés (clients WebSocket Node, protocole de src/shared),
// 13e téléphone (salon plein, puis en pleine manche), débit par téléphone, téléphone qui clignote
// (coupures courtes et longues en boucle), téléphone muet, onglet PC dupliqué.
//   PORT=8824 node tools/polish/tech/netstress.mjs
import { launch, newContext } from '../../lib/browser.mjs'
import { ORIGIN, PROBE, SHOTS, sleep, waitFor, frameStats, pageNow, presetSettings, collect } from './common.mjs'
import { WsPhone } from './wsphone.mjs'

const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await pc.addInitScript(PROBE)
await presetSettings(pc, { lang: 'fr', quality: 'medium', narrator: 'text' })
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
const room = await pc.evaluate(() => window.__ombres.useLobby.getState().roomCode)
log('salle', room)
const st = () =>
  pc.evaluate(() => {
    const o = window.__ombres
    const r = o.runner
    return {
      phase: r.phase,
      screen: o.useUi.getState().screen,
      hostLink: o.useUi.getState().hostLink,
      roster: r.roster.players.map(p => `${p.kind[0]}${p.slot}${p.kind === 'phone' ? (o.runner.substitutes?.has?.(p.slot) ? '*' : '') : ''}`).join(' '),
      toasts: o.useHud.getState().toasts.map(t => t.key),
    }
  })
const toastLog = []
await pc.exposeFunction('__toastSeen', k => toastLog.push([Date.now(), k]))
await pc.evaluate(() => {
  let prev = new Set()
  window.__ombres.useHud.subscribe(s => {
    const ids = new Set(s.toasts.map(t => t.id ?? t.key + t.at))
    for (const t of s.toasts) {
      const id = t.id ?? t.key + t.at
      if (!prev.has(id)) window.__toastSeen(t.key)
    }
    prev = ids
  })
})

// ── 12 téléphones au salon
const phones = []
for (let i = 0; i < 12; i++) {
  const ph = new WsPhone(ORIGIN, room, { id: `simphone-${i}-abcdef`, name: `Tel${i + 1}`, color: i })
  phones.push(ph)
  const ok = await ph.connect()
  if (!ok) log('échec connexion', i, ph.state)
  await sleep(150)
  ph.profile(`Tel${i + 1}`, i)
  await sleep(100)
}
await sleep(1500)
log('salon 12 :', JSON.stringify(await st()))
await pc.screenshot({ path: `${SHOTS}/net-lobby-12phones.jpg`, type: 'jpeg', quality: 80 })

// ── 13e téléphone au salon (plein de téléphones)
const p13 = new WsPhone(ORIGIN, room, { id: 'simphone-13-abcdef', name: 'Tel13' })
p13.autoReconnect = false
await p13.connect()
await sleep(1500)
log('13e au salon :', p13.state, 'closeCode', p13.closeCode, 'errors', p13.errors, 'view', p13.view?.screen, JSON.stringify(await st()))

// ── lancement par le meneur, cartes, manche
for (const ph of phones) ph.startPiloting(Number(ph.id.split('-')[1]) + 3)
phones[0].action('start')
await waitFor(pc, () => ['rules', 'round'].includes(window.__ombres.runner.phase), null, 10000, 'lancement')
await sleep(1500)
for (const ph of phones) ph.ready(true)
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
log('manche :', JSON.stringify(await st()))
await sleep(6000)

// ── débit par téléphone sur 10 s, et coût CPU du PC
for (const ph of phones) {
  ph.counts = {}
  ph.bytesIn = 0
  ph.msgsIn = 0
}
let t0 = await pageNow(pc)
await sleep(10000)
const rates = phones.map(ph => ({ id: ph.name, msgs: +(ph.msgsIn / 10).toFixed(1), kB: +(ph.bytesIn / 10240).toFixed(2), byType: Object.fromEntries(Object.entries(ph.counts).map(([k, v]) => [k, +(v / 10).toFixed(1)])) }))
log('débit PC→téléphone (par s) :', JSON.stringify(rates.slice(0, 3)), '… total kB/s', rates.reduce((a, r) => a + r.kB, 0).toFixed(1))
log('PC frames 12 téléphones :', JSON.stringify(await frameStats(pc, t0)))
await pc.screenshot({ path: `${SHOTS}/net-round-12phones.jpg`, type: 'jpeg', quality: 80 })

// ── 13e téléphone en pleine manche
const p13b = new WsPhone(ORIGIN, room, { id: 'simphone-14-abcdef', name: 'Tel14' })
p13b.autoReconnect = false
await p13b.connect()
await sleep(1500)
log('13e en manche :', p13b.state, 'closeCode', p13b.closeCode, 'errors', p13b.errors, 'view', p13b.view?.screen, 'toasts', JSON.stringify((await st()).toasts))

// ── téléphone qui clignote : coupures courtes (0,7 s) toutes les 1,5 s pendant 12 s
toastLog.length = 0
const flap = phones[1]
let tEnd = Date.now() + 12000
while (Date.now() < tEnd) {
  flap.drop()
  await sleep(1500)
}
await sleep(2500)
log('clignotement court : toasts', JSON.stringify(toastLog.map(t => t[1])), JSON.stringify(await st()))

// ── coupures longues (4 s hors ligne, 3 s en ligne) × 3
toastLog.length = 0
flap.autoReconnect = false
for (let k = 0; k < 3; k++) {
  flap.drop()
  await sleep(4000)
  await flap.connect()
  await sleep(3000)
}
flap.autoReconnect = true
log('coupures longues : toasts', JSON.stringify(toastLog.map(t => t[1])), JSON.stringify(await st()))

// ── téléphone muet (socket ouvert, plus rien) 6 s
toastLog.length = 0
phones[2].silent = true
await sleep(6000)
const midSilent = await st()
phones[2].silent = false
await sleep(2500)
log('muet : pendant', midSilent.roster, 'toasts', JSON.stringify(toastLog.map(t => t[1])), 'après', JSON.stringify(await st()))

// ── onglet PC dupliqué (sessionStorage copié, comme « Dupliquer l'onglet »)
const ss = await pc.evaluate(() => JSON.stringify(Object.fromEntries(Object.entries(sessionStorage))))
const pc2 = await ctx.newPage()
const logs2 = collect(pc2, 'pc2')
await pc2.addInitScript(s => {
  if (!sessionStorage.length) for (const [k, v] of Object.entries(JSON.parse(s))) sessionStorage.setItem(k, v)
}, ss)
await pc2.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await sleep(15000)
const s1 = await st()
const s2 = await pc2.evaluate(() => ({ phase: window.__ombres?.runner.phase, screen: window.__ombres?.useUi.getState().screen, hostLink: window.__ombres?.useUi.getState().hostLink, room: window.__ombres?.useLobby.getState().roomCode }))
log('onglet dupliqué : onglet 1', JSON.stringify(s1), '| onglet 2', JSON.stringify(s2))
await pc.screenshot({ path: `${SHOTS}/net-dup-tab1.jpg`, type: 'jpeg', quality: 80 })
await pc2.screenshot({ path: `${SHOTS}/net-dup-tab2.jpg`, type: 'jpeg', quality: 80 })
log('téléphones après duplication :', phones.map(p => `${p.name}:${p.state}/${p.hostOnline ? 'on' : 'off'}/${p.view?.screen}`).join(' '))
// l'onglet 1 est-il toujours en train de simuler ?
const simT1 = await pc.evaluate(() => window.__ombres.runner.sim?.state.time)
await sleep(2000)
const simT1b = await pc.evaluate(() => window.__ombres.runner.sim?.state.time)
log('onglet 1 : sim avance encore ?', simT1, '→', simT1b)
// ferme l'onglet 2 : l'onglet 1 reprend-il la main ?
await pc2.close()
await sleep(8000)
log('après fermeture de l’onglet 2 :', JSON.stringify(await st()), phones.slice(0, 3).map(p => `${p.name}:${p.state}/${p.hostOnline ? 'on' : 'off'}`).join(' '))
await pc.screenshot({ path: `${SHOTS}/net-dup-after-close.jpg`, type: 'jpeg', quality: 80 })

for (const ph of [...phones, p13, p13b]) ph.close()
console.log('--- console PC ---\n' + [...logs, ...logs2].slice(0, 40).join('\n'))
await browser.close()
