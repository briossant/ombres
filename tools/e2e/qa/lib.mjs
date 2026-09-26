// Aides des scénarios de QA d'intégration (agent qa) : PC + téléphones émulés (touches CDP).
//   PORT=8813 (défaut) ; captures dans shots/qa/<scénario>/.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext, collectLogs as baseCollect } from '../../lib/browser.mjs'

export const PORT = Number(process.env.PORT ?? 8813)
export const ORIGIN = `http://localhost:${PORT}`
export { launch, newContext }
export const sleep = ms => new Promise(r => setTimeout(r, ms))
export const arg = (k, d) => process.argv.find(a => a.startsWith(`--${k}=`))?.split('=').slice(1).join('=') ?? d
export const flag = k => process.argv.includes(`--${k}`)

export function collectLogs(page, tag = '') {
  const logs = baseCollect(page)
  page.on('response', r => {
    if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`)
  })
  logs.tag = tag
  return logs
}

/** Erreurs et avertissements (hors bruit connu de bibliothèque signalé à part). */
export function problems(logs) {
  return logs.filter(l => /^\[(error|warning|pageerror|http \d+)\]/.test(l))
}

export function makeShots(name) {
  const dir = join(import.meta.dirname, '../../../shots/qa', name)
  mkdirSync(dir, { recursive: true })
  let n = 0
  const t0 = Date.now()
  const shot = async (page, label) => {
    const f = join(dir, `${String(++n).padStart(3, '0')}-${label}.jpg`)
    await page.screenshot({ path: f, type: 'jpeg', quality: 80 })
    console.log(`  [${((Date.now() - t0) / 1000).toFixed(1)} s] shot ${f}`)
    return f
  }
  const log = m => console.log(`[${((Date.now() - t0) / 1000).toFixed(1)} s] ${m}`)
  return { dir, shot, log }
}

export async function waitFor(page, fn, arg, timeout = 30000, label = '') {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 })
  } catch {
    throw new Error(`timeout (${timeout} ms) : ${label || fn.toString().slice(0, 120)}`)
  }
}

export function state(page) {
  return page.evaluate(() => {
    const o = window.__ombres
    if (!o) return null
    const r = o.runner
    const ui = o.useUi.getState()
    return {
      phase: r.phase,
      screen: ui.screen,
      paused: ui.paused,
      hostLink: ui.hostLink,
      overlay: ui.overlay,
      roster: o.useRoster.getState().slots.map(s => ({ slot: s.slot, kind: s.kind, name: s.name, color: s.colorIndex, connected: s.connected, substitute: s.substitute, goals: s.goals, bot: s.bot })),
      room: o.useLobby.getState().roomCode,
      joinUrl: o.useLobby.getState().joinUrl,
      round: r.roundIndex,
      simKind: r.simKind,
      sunT: r.sim?.state.sun.t ?? null,
      phaseSun: r.sim?.state.sun.phase ?? null,
      over: r.sim?.state.over ?? null,
      results: r.match?.results.length ?? 0,
      camera: o.cameraCue.mode,
      birds: r.sim ? r.sim.state.birds.length : 0,
    }
  })
}

// ─── Téléphones (touches CDP) ───
const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })
export async function newPhone(browser, device, tag) {
  const ctx = await newContext(browser, { mobile: device, landscape: true })
  const page = await ctx.newPage()
  const logs = collectLogs(page, tag)
  const cdp = await ctx.newCDPSession(page)
  return { ctx, page, logs, cdp, device, tag }
}
export async function center(page, sel) {
  const b = await page.locator(sel).first().boundingBox()
  if (!b) throw new Error(`introuvable : ${sel}`)
  return { x: b.x + b.width / 2, y: b.y + b.height / 2, b }
}
export async function tap(ph, sel, id = 9, ms = 60) {
  const c = await center(ph.page, sel)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(id, c.x, c.y)] })
  await sleep(ms)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}
/** Joystick poussé vers (dx, dy) px + PLONGER éventuel, pendant ms. */
export async function steer(ph, dx, dy, ms, dive = false, flapAt = -1) {
  const zone = await center(ph.page, '.stick-zone')
  const sx = zone.b.x + zone.b.width * 0.45
  const sy = zone.b.y + zone.b.height * 0.55
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(1, sx, sy)] })
  for (let i = 1; i <= 4; i++) {
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(1, sx + (dx * i) / 4, sy + (dy * i) / 4)] })
    await sleep(16)
  }
  const pts = [tp(1, sx + dx, sy + dy)]
  if (dive) {
    const d = await center(ph.page, '.act--dive')
    pts.push(tp(2, d.x, d.y))
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts })
  }
  if (flapAt >= 0) {
    await sleep(flapAt)
    const f = await center(ph.page, '.act--flap')
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [...pts, tp(3, f.x, f.y)] })
    await sleep(60)
    await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: pts })
    await sleep(Math.max(0, ms - flapAt - 60))
  } else await sleep(ms)
  await ph.cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** Rejoint la salle depuis un téléphone : nom, couleur (index de la pastille), valider. */
export async function joinPhone(ph, url, name, swatch) {
  await ph.page.goto(url, { waitUntil: 'load' })
  await waitFor(ph.page, () => !!document.querySelector('.profile'), null, 20000, `profil ${name}`)
  await sleep(300)
  await ph.page.fill('#phone-name', name)
  if (swatch !== null && swatch !== undefined) await ph.page.locator('.swatch').nth(swatch).click()
  await ph.page.locator('.profile__go').click()
  await waitFor(ph.page, () => !!document.querySelector('.lobby-goals'), null, 10000, `salon ${name}`)
}

/** Réglages persistés du PC avant chargement. */
export async function presetSettings(page, patch) {
  await page.addInitScript(p => {
    try {
      const k = 'ombres.settings.v1'
      const s = JSON.parse(localStorage.getItem(k) ?? '{}')
      localStorage.setItem(k, JSON.stringify({ ...s, ...p }))
    } catch {}
  }, patch)
}

/** Texte visible du DOM de l'UI : repère les clés brutes « domaine.cle ». */
export function rawKeys(page) {
  return page.evaluate(() => {
    const txt = document.body.innerText
    const m = txt.match(/\b(host|phone|common|titles|hints|narrator|runner)\.[a-zA-Z][\w.]*/g)
    return m ? [...new Set(m)] : []
  })
}
