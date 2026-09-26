// QA : build de PRODUCTION servi par dist-server/server.mjs (PORT=8814). Poids servi et temps de
// chargement (page nue, sans ?debug), puis scénario court PC + téléphone émulé, avec redémarrage
// du serveur en pleine manche (processus relancé par ce script).
//   pnpm build && node tools/e2e/qa/prod.mjs   (port : PROD_PORT, 8814 par défaut)
import { spawn } from 'node:child_process'
import { join } from 'node:path'
import { launch, newContext, collectLogs, makeShots, sleep, waitFor, state, problems, newPhone, joinPhone, tap, rawKeys } from './lib.mjs'
import { PhonePilot } from './pilot.mjs'

const PORT = Number(process.env.PROD_PORT ?? 8814)
const ORIGIN = `http://localhost:${PORT}`
const ROOT = join(import.meta.dirname, '../../..')
const { shot, log } = makeShots('prod')
const checks = []
const check = (name, ok, detail = '') => {
  checks.push({ name, ok })
  console.log(`${ok ? '  OK ' : '  KO '} ${name}${detail ? ` — ${detail}` : ''}`)
}
let server = null
async function startServer() {
  server = spawn('node', ['dist-server/server.mjs'], { cwd: ROOT, env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT) }, stdio: ['ignore', 'pipe', 'pipe'] })
  server.stdout.on('data', d => process.stdout.write(`[server] ${d}`))
  server.stderr.on('data', d => process.stdout.write(`[server!] ${d}`))
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(`${ORIGIN}/healthz`)).ok) return
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
const weight = page =>
  page.evaluate(() => {
    const e = performance.getEntriesByType('resource')
    const nav = performance.getEntriesByType('navigation')[0]
    const by = {}
    let total = nav?.transferSize ?? 0
    for (const r of e) {
      const k = r.name.match(/\/(audio\/\w+|assets|fonts|ui|textures)\//)?.[1] ?? 'autre'
      by[k] = (by[k] ?? 0) + r.transferSize
      total += r.transferSize
    }
    return { total, n: e.length, by }
  })
const mb = n => `${(n / 1048576).toFixed(2)} Mo`

await startServer()
const browser = await launch()
try {
  // 1) chargement nu (ce que voit un joueur)
  {
    const ctx = await newContext(browser)
    const page = await ctx.newPage()
    const logs = collectLogs(page)
    const t0 = Date.now()
    await page.goto(`${ORIGIN}/`, { waitUntil: 'load' })
    await page.waitForFunction(() => !!document.querySelector('.title'), null, { timeout: 120000, polling: 50 })
    const tTitle = (Date.now() - t0) / 1000
    await sleep(2500)
    await shot(page, 'title-plain')
    const w = await weight(page)
    log(`titre en ${tTitle.toFixed(1)} s ; ${w.n} ressources, ${mb(w.total)} transférés : ${Object.entries(w.by).map(([k, v]) => `${k} ${mb(v)}`).join(', ')}`)
    check('chargement < 10 s (local)', tTitle < 10, `${tTitle.toFixed(1)} s`)
    check('rien de debug sans ?debug', !(await page.evaluate(() => 'ombres' in window || '__ombres' in window)))
    const p = problems(logs)
    check('console propre (PC, page nue)', p.length === 0, p.join(' | '))
    await ctx.close()
  }
  // 2) scénario court
  const pcCtx = await newContext(browser)
  const pc = await pcCtx.newPage()
  const pcLogs = collectLogs(pc, 'pc')
  await pc.goto(`${ORIGIN}/?debug=fast&speed=3`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title' && !!window.__ombres?.useLobby.getState().joinUrl, null, 120000, 'titre + salle')
  await pc.evaluate(() => window.__ombres.runner.setMatchSetting('rounds', 1))
  const u = new URL((await state(pc)).joinUrl)
  const A = await newPhone(browser, 'Pixel 7', 'pixel')
  const t0 = Date.now()
  await joinPhone(A, `${ORIGIN}${u.pathname}${u.search}`, 'Maëlle', null)
  log(`téléphone : profil + salon en ${((Date.now() - t0) / 1000).toFixed(1)} s ; ${JSON.stringify(await weight(A.page).then(w => ({ total: mb(w.total), n: w.n })))}`)
  await waitFor(pc, () => window.__ombres?.runner.phase === 'lobby', null, 8000, 'salon')
  await sleep(1200)
  let s = await state(pc)
  log(`salon : ${s.roster.map(r => `${r.kind}:${r.name || r.bot?.personality}:${r.color}`).join(' | ')}`)
  check('le premier humain reçoit Corail (0)', s.roster.find(r => r.kind === 'phone')?.color === 0)
  await shot(pc, 'lobby')
  await shot(A.page, 'A-lobby')
  globalThis.__slot = s.roster.find(r => r.kind === 'phone').slot
  const pilot = new PhonePilot(A, pc, () => globalThis.__slot, 4)
  await tap(A, '.band__start')
  await waitFor(A.page, () => !!document.querySelector('.intro__foot .btn'), null, 8000, 'cartes')
  await A.page.locator('.intro__foot .btn').click()
  await waitFor(pc, () => window.__ombres?.runner.phase === 'round' && window.__ombres.runner.sim.state.sun.t > 8, null, 30000, 'manche')
  await pilot.start()
  await sleep(1500)
  await shot(pc, 'round')
  await shot(A.page, 'A-round')
  // redémarrage du serveur
  const room = (await state(pc)).room
  await pilot.stop()
  await stopServer()
  await waitFor(pc, () => window.__ombres.useUi.getState().hostLink !== 'ok', null, 20000, 'reconnexion affichée')
  const t1 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
  await sleep(3000)
  const t2 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
  check('serveur coupé : manche gelée + surcouche', t1 === t2, `${t1.toFixed(2)} → ${t2.toFixed(2)}`)
  await shot(pc, 'server-down')
  await shot(A.page, 'A-server-down')
  await startServer()
  await waitFor(pc, () => window.__ombres.useUi.getState().hostLink === 'ok', null, 30000, 'PC reconnecté')
  await waitFor(pc, s => window.__ombres.useRoster.getState().slots.find(x => x.slot === s)?.connected === true, globalThis.__slot, 60000, 'téléphone revenu')
  check('salle recréée au même code, téléphone revenu', (await state(pc)).room === room, room)
  await pilot.start()
  await sleep(3000)
  const t3 = await pc.evaluate(() => window.__ombres.runner.sim.state.sun.t)
  check('la manche reprend', t3 > t2 + 0.5, `${t2.toFixed(2)} → ${t3.toFixed(2)}`)
  check('aucun remplaçant', await pc.evaluate(s => window.__ombres.runner.router.get(s).kind === 'phone', globalThis.__slot))
  await shot(pc, 'server-back')
  await shot(A.page, 'A-server-back')
  await waitFor(pc, () => window.__ombres?.runner.phase === 'matchResults' && window.__ombres.useUi.getState().screen === 'matchResults', null, 120000, 'podium (1 manche)')
  await pilot.stop()
  await sleep(2500)
  await shot(pc, 'podium')
  await shot(A.page, 'A-matchEnd')
  console.log('raw keys:', await rawKeys(pc), await rawKeys(A.page))
  await A.page.locator('.vote-row .btn').first().click()
  await waitFor(pc, () => window.__ombres?.runner.phase === 'round', null, 20000, 'revanche')
  check('revanche', true)
  await sleep(1500)
  await shot(pc, 'rematch')
  const errs = [...problems(pcLogs), ...problems(A.logs)].filter(l => !/WebSocket connection to|ERR_CONNECTION_REFUSED|Failed to load resource/.test(l))
  check('console propre (hors refus de connexion pendant la coupure)', errs.length === 0, [...new Set(errs)].join(' | '))
} finally {
  await browser.close()
  await stopServer()
}
const failed = checks.filter(c => !c.ok).length
console.log(failed ? `${failed} échec(s)` : 'tout est vert')
