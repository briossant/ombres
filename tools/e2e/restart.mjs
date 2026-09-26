// Redémarrage du SERVEUR en pleine manche (redeploy) : le PC gèle la manche et affiche la
// reconnexion, la salle est recréée au même code, le téléphone revient, aucun remplaçant n'est
// posé, la manche reprend. Le test lance lui-même le serveur de PRODUCTION (le client Vite de dev
// rechargerait la page au retour du serveur) sur PORT, à partir d'un build :
//   npx vite build --outDir <dist> && node tools/e2e/restart.mjs --dist=<dist>
// (le port doit être libre : arrêter le serveur de dev avant.)
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { ORIGIN, PORT, launch, newContext, collectLogs, shotDir, sleep, waitFor, state, errorsOf } from './lib.mjs'

const arg = k => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=')[1]
const DIST = arg('dist')
if (!DIST) {
  console.error('usage : node tools/e2e/restart.mjs --dist=<dossier du build>')
  process.exit(2)
}
const ROOT = join(import.meta.dirname, '../..')
let server = null
async function startServer() {
  server = spawn('npx', ['tsx', 'server/index.ts'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), OMBRES_DIST: DIST }, stdio: 'ignore' })
  for (let i = 0; i < 100; i++) {
    try {
      const r = await fetch(`${ORIGIN}/`)
      if (r.ok) return
    } catch {}
    await sleep(100)
  }
  throw new Error('serveur injoignable')
}
async function stopServer() {
  if (!server) return
  const s = server
  server = null
  s.kill('SIGTERM')
  await new Promise(r => s.once('exit', r))
}

const dir = shotDir('restart')
let n = 0
const snap = async (page, label) => page.screenshot({ path: join(dir, `${String(++n).padStart(2, '0')}-${label}.jpg`), type: 'jpeg', quality: 82 })
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? '  ✓' : '  ✗'} ${name}${detail ? ` — ${detail}` : ''}`)
}

await startServer()
const browser = await launch()
try {
  const pc = await (await newContext(browser)).newPage()
  const pcLogs = collectLogs(pc)
  await pc.goto(`${ORIGIN}/?debug=fast&speed=2`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', null, 90000, 'titre')
  await pc.evaluate(() => window.__ombres.runner.enterLobby())
  await waitFor(pc, () => !!window.__ombres?.useLobby.getState().joinUrl, null, 15000, 'QR')
  const u = new URL((await state(pc)).joinUrl)
  const ph = await (await newContext(browser, { mobile: 'Pixel 7', landscape: true })).newPage()
  const phLogs = collectLogs(ph)
  await ph.goto(`${ORIGIN}${u.pathname}${u.search}`, { waitUntil: 'load' })
  await waitFor(ph, () => !!document.querySelector('.profile'), null, 15000, 'profil')
  await ph.fill('#phone-name', 'Rémi')
  await ph.locator('.profile__go').click()
  await waitFor(ph, () => !!document.querySelector('.band__start'), null, 8000, 'salon')
  await ph.locator('.band__start').click()
  await waitFor(ph, () => !!document.querySelector('.intro__foot .btn'), null, 8000, 'cartes')
  await ph.locator('.intro__foot .btn').click()
  await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.sim.state.sun.t > 5, null, 30000, 'manche')
  const room = (await state(pc)).room
  const slot = (await state(pc)).roster.find(r => r.name === 'Rémi').slot

  await stopServer()
  await waitFor(pc, () => window.__ombres.useUi.getState().hostLink !== 'ok', null, 20000, 'reconnexion affichée')
  const t1 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
  await sleep(4500)
  const t2 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
  check('serveur coupé : surcouche de reconnexion, manche gelée', t1 === t2, `${t1.toFixed(2)} → ${t2.toFixed(2)}`)
  check('aucun remplaçant pendant la coupure du serveur', await pc.evaluate(s => window.__ombres.runner.router.get(s).kind === 'phone', slot))
  await snap(pc, 'pc-server-down')
  await snap(ph, 'phone-server-down')
  await startServer()
  await waitFor(pc, () => window.__ombres.useUi.getState().hostLink === 'ok', null, 30000, 'PC reconnecté')
  check('salle recréée au même code', (await state(pc)).room === room, room)
  await waitFor(pc, s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.connected === true, slot, 30000, 'téléphone revenu')
  check('le téléphone revient', true)
  await sleep(4000)
  const t3 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
  check('la manche reprend', t3 > t2 + 0.5, `${t2.toFixed(2)} → ${t3.toFixed(2)}`)
  check('le téléphone pilote toujours (pas de remplaçant)', await pc.evaluate(s => window.__ombres.runner.router.get(s).kind === 'phone', slot))
  await snap(pc, 'pc-back')
  await snap(ph, 'phone-back')
  const errs = [...errorsOf(pcLogs), ...errorsOf(phLogs)].filter(l => !/WebSocket connection to|ERR_CONNECTION_REFUSED|Failed to load resource/.test(l))
  check('aucune erreur console (hors refus de connexion pendant la coupure)', errs.length === 0, errs.slice(0, 4).join(' | '))
} finally {
  await browser.close()
  await stopServer()
}
const failed = checks.filter(c => !c.ok).length
console.log(failed ? `${failed} échec(s)` : 'tout est vert')
process.exit(failed ? 1 : 0)
