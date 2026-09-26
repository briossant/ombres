// QA technique : redémarrage du serveur de PRODUCTION en pleine manche avec 4 téléphones simulés
// (clients WebSocket Node) : la salle est-elle recréée au même code, les téléphones reviennent-ils,
// y a-t-il des remplaçants, la manche reprend-elle ?
//   node tools/polish/tech/restart.mjs --origin=http://localhost:8894 --dist=<dist> --server=<server.mjs>
import { spawn, execSync } from 'node:child_process'
import { launch, newContext } from '../../lib/browser.mjs'
import { sleep, waitFor, presetSettings, collect } from './common.mjs'
import { WsPhone } from './wsphone.mjs'

const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
const ORIGIN = arg('origin', 'http://localhost:8894')
const PORT = new URL(ORIGIN).port
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const browser = await launch()
const ctx = await newContext(browser)
const pc = await ctx.newPage()
const logs = collect(pc, 'pc')
await presetSettings(pc, { lang: 'fr', quality: 'low', narrator: 'text' })
await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 120000, 'titre')
const room = await pc.evaluate(() => window.__ombres.useLobby.getState().roomCode)
const phones = []
for (let i = 0; i < 4; i++) {
  const ph = new WsPhone(ORIGIN, room, { id: `restart-phone-${i}-xyz`, name: `R${i}`, color: i * 2 })
  await ph.connect()
  await sleep(200)
  ph.profile()
  ph.startPiloting(i + 1)
  phones.push(ph)
}
await waitFor(pc, () => window.__ombres.runner.phase === 'lobby', null, 10000, 'salon')
phones[0].action('start')
await sleep(1500)
for (const ph of phones) ph.ready(true)
await waitFor(pc, () => window.__ombres.runner.phase === 'round', null, 20000, 'manche')
await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? 0) > 15, null, 60000, 't>15')
const S = () => pc.evaluate(() => ({ t: window.__ombres.runner.sim.state.sun.t.toFixed(1), link: window.__ombres.useUi.getState().hostLink, room: window.__ombres.useLobby.getState().roomCode, subs: [...(window.__ombres.runner.substitutes?.keys?.() ?? [])], phase: window.__ombres.runner.phase }))
log('avant', JSON.stringify(await S()))
const pid = execSync(`ss -ltnp 'sport = :${PORT}' | grep -o 'pid=[0-9]*' | head -1 | cut -d= -f2`).toString().trim()
const cmd = execSync(`cat /proc/${pid}/cmdline | tr '\\0' ' '`).toString().trim()
const env = Object.fromEntries(execSync(`cat /proc/${pid}/environ | tr '\\0' '\\n'`).toString().split('\n').filter(l => /^(NODE_ENV|PORT|OMBRES_DIST)=/.test(l)).map(l => l.split('=')))
const cwd = execSync(`readlink /proc/${pid}/cwd`).toString().trim()
log('arrêt du serveur', pid, cmd, JSON.stringify(env))
process.kill(Number(pid), 'SIGKILL')
await sleep(3000)
log('serveur coupé 3 s', JSON.stringify(await S()), phones.map(p => p.state).join(','))
await sleep(3000)
const [bin, ...args] = cmd.split(' ')
const child = spawn(bin, args, { cwd, env: { ...process.env, ...env }, detached: true, stdio: 'ignore' })
child.unref()
log('serveur relancé')
const t0 = Date.now()
await waitFor(pc, () => window.__ombres.useUi.getState().hostLink === 'ok', null, 30000, 'lien rétabli')
log(`lien PC rétabli en ${((Date.now() - t0) / 1000).toFixed(1)} s`, JSON.stringify(await S()))
await sleep(6000)
log('6 s après', JSON.stringify(await S()), phones.map(p => `${p.state}/${p.hostOnline ? 'on' : 'off'}/${p.view?.screen}`).join(' '))
for (const ph of phones) ph.close()
console.log('--- console ---\n' + logs.slice(0, 20).join('\n'))
await browser.close()
