// Aides des tests de bout en bout (Playwright via tools/lib/browser.mjs).
//   PORT=8811 (défaut) ; captures dans shots/runner/<scénario>/.
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { launch, newContext, collectLogs as baseCollect, gpuRenderer } from '../lib/browser.mjs'

export const PORT = Number(process.env.PORT ?? 8811)
export const ORIGIN = `http://localhost:${PORT}`

export { launch, newContext, gpuRenderer }

/** Console + erreurs de page + réponses HTTP en échec (URL comprise). */
export function collectLogs(page) {
  const logs = baseCollect(page)
  page.on('response', r => {
    if (r.status() >= 400) logs.push(`[http ${r.status()}] ${r.url()}`)
  })
  return logs
}

/** Dossier de captures d'un scénario. */
export function shotDir(name) {
  const dir = join(import.meta.dirname, '../../shots/runner', name)
  mkdirSync(dir, { recursive: true })
  return dir
}

let step = 0
/** Capture numérotée (jpeg). */
export async function shot(page, dir, label) {
  step++
  const file = join(dir, `${String(step).padStart(2, '0')}-${label}.jpg`)
  await page.screenshot({ path: file, type: 'jpeg', quality: 82 })
  console.log(`  📷 ${file}`)
  return file
}

export const sleep = ms => new Promise(r => setTimeout(r, ms))

/** Attend une condition évaluée dans la page. */
export async function waitFor(page, fn, arg, timeout = 30000, label = '') {
  try {
    await page.waitForFunction(fn, arg, { timeout, polling: 100 })
  } catch (e) {
    throw new Error(`timeout (${timeout} ms) : ${label || fn.toString().slice(0, 120)}`)
  }
}

/** État résumé du runner (page du PC ouverte avec ?debug). */
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
      roster: o.useRoster.getState().slots.map(s => ({ slot: s.slot, kind: s.kind, name: s.name, color: s.colorIndex, connected: s.connected, substitute: s.substitute, goals: s.goals })),
      room: o.useLobby.getState().roomCode,
      joinUrl: o.useLobby.getState().joinUrl,
      round: r.roundIndex,
      simKind: r.simKind,
      sunT: r.sim?.state.sun.t ?? null,
      phaseSun: r.sim?.state.sun.phase ?? null,
      over: r.sim?.state.over ?? null,
      results: r.match?.results.length ?? 0,
      camera: o.cameraCue.mode,
    }
  })
}

/** Tient une touche pendant `ms` (événements CDP : isTrusted = true). */
export async function hold(page, code, ms) {
  await page.keyboard.down(code)
  await sleep(ms)
  await page.keyboard.up(code)
}

/** Vérifie qu'aucune erreur n'est apparue dans la console ; renvoie la liste. */
export function errorsOf(logs) {
  return logs.filter(l => /^\[(error|pageerror|http \d+)\]/.test(l) && !/favicon/.test(l))
}
