// Vérification G6 (correcteur game) : « plus jamais d'écran blanc ».
// (1) navigateur sans WebGL (--disable-3d-apis) : écran explicatif, AUCUNE connexion WebSocket
//     (aucune salle créée) ; (2) exception forcée derrière ?debug (window.__ombresCrash) en
//     pleine manche, dans l'UI puis dans le monde 3D : case « Recharger » visible, puis reprise
//     de la partie après rechargement (même manche, « 3, 2, 1 »).
//   PORT=8836 node tools/polish/fix-game/fallbacks.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext } from '../../lib/browser.mjs'

const PORT = Number(process.env.PORT ?? 8836)
const ORIGIN = `http://localhost:${PORT}`
const SHOTS = join(import.meta.dirname, '../../../shots/polish/fix-game')
mkdirSync(SHOTS, { recursive: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))
const log = (...a) => console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a)
const waitFor = async (page, fn, timeout, label) => {
  try {
    await page.waitForFunction(fn, null, { timeout, polling: 100 })
  } catch {
    throw new Error(`timeout ${timeout} ms : ${label}`)
  }
}

// ─── (1) sans WebGL ───
if (!process.argv.includes('--crash-only'))
{
  const browser = await launch({ extraArgs: ['--disable-3d-apis', '--disable-webgl'] })
  const ctx = await newContext(browser)
  const pc = await ctx.newPage()
  const errors = []
  pc.on('pageerror', e => errors.push(e.message))
  let sockets = 0
  pc.on('websocket', () => sockets++)
  await pc.goto(`${ORIGIN}/`, { waitUntil: 'load' })
  await sleep(6000)
  await pc.screenshot({ path: join(SHOTS, 'g6-nowebgl.jpg'), type: 'jpeg', quality: 80 })
  const text = await pc.evaluate(() => document.body.innerText)
  log('sans WebGL — texte visible :', JSON.stringify(text.slice(0, 200)))
  log('sans WebGL — connexions WebSocket (salle) :', sockets, '| erreurs :', errors.length ? errors.join(' / ') : 'aucune')
  await browser.close()
}

// ─── (2) exception forcée en pleine manche ───
{
  const browser = await launch()
  const ctx = await newContext(browser)
  const pc = await ctx.newPage()
  await pc.addInitScript(() => {
    try {
      localStorage.setItem('ombres.settings.v1', JSON.stringify({ lang: 'fr', quality: 'low', narrator: 'text' }))
    } catch {}
  })
  await pc.goto(`${ORIGIN}/?debug`, { waitUntil: 'load' })
  await waitFor(pc, () => window.__ombres?.useUi.getState().screen === 'title', 120000, 'titre')
  await pc.evaluate(() => window.__ombres.runner.enterLobby())
  await sleep(600)
  await pc.keyboard.press('Space')
  await sleep(800)
  await pc.evaluate(() => window.__ombres.runner.startMatch())
  await sleep(800)
  await pc.keyboard.press('Enter')
  await waitFor(pc, () => window.__ombres.runner.phase === 'round' && (window.__ombres.runner.sim?.state.sun.t ?? -9) > 4, 60000, 'manche')
  for (const target of ['ui', 'world']) {
    const before = await pc.evaluate(() => ({ round: window.__ombres.runner.roundIndex, t: +window.__ombres.runner.sim.state.sun.t.toFixed(1) }))
    await pc.evaluate(tg => window.__ombresCrash(tg), target)
    await sleep(1200)
    await pc.screenshot({ path: join(SHOTS, `g6-crash-${target}.jpg`), type: 'jpeg', quality: 80 })
    const btn = await pc.locator('button', { hasText: 'Recharger' }).count()
    log(`exception ${target} : bouton « Recharger » visible = ${btn > 0}, manche ${before.round + 1} à t = ${before.t} s`)
    await pc.locator('button', { hasText: 'Recharger' }).first().click()
    await waitFor(pc, () => window.__ombres && window.__ombres.runner.phase !== 'boot', 120000, 'rechargement')
    await sleep(700)
    const after = await pc.evaluate(() => ({ phase: window.__ombres.runner.phase, round: window.__ombres.runner.roundIndex, t: +(window.__ombres.runner.sim?.state.sun.t ?? -1).toFixed(1), hud: window.__ombres.useHud.getState().countdown }))
    await pc.screenshot({ path: join(SHOTS, `g6-crash-${target}-reloaded.jpg`), type: 'jpeg', quality: 80 })
    log(`après « Recharger » : ${JSON.stringify(after)} (compte à rebours de reprise : ${after.hud})`)
    await waitFor(pc, () => (window.__ombres.runner.sim?.state.sun.t ?? -9) > 0 && window.__ombres.runner.realTime > window.__ombres.runner.holdUntil, 30000, 'reprise')
    await sleep(1500)
  }
  await browser.close()
}
