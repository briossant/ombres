// Préparation du décor de la carte suivante pendant les temps morts (polish tech, vague 2).
// La démo de l'écran titre change de carte toutes les ~45 s : les géométries des tours y étaient
// construites d'un bloc sur l'image de la bascule (longue tâche de 20 à 30 ms, avec le sol et la
// recompilation des cailloux : à-coup de 62 à 77 ms). Le runner appelle `prepareTowers(towers)` dès
// que la carte suivante est connue ; la construction avance tour par tour dans requestIdleCallback
// (tranches de SLICE_MS au plus) et <Towers> prend le résultat avec `takeTowers(towers)` — même
// tableau `towers` (celui de la simulation préparée), sinon construction normale.
import type { TowerDef } from '../../../sim/types.ts'
import { buildTowerGeometriesSteps, type TowerGeometries } from './towerGeometry.ts'

/** Durée maximale d'une tranche de préparation (ms) : reste sous le budget d'une image. */
const SLICE_MS = 4
/** Au-delà, la tranche est donnée même sans temps mort (onglet très chargé). */
const IDLE_TIMEOUT_MS = 1500

interface Job {
  towers: readonly TowerDef[]
  steps: Generator<void, TowerGeometries, void>
  done: TowerGeometries | null
  handle: number | null
}

let job: Job | null = null

type IdleDeadline = { timeRemaining(): number; didTimeout: boolean }
const requestIdle: (cb: (d: IdleDeadline) => void, timeout: number) => number =
  typeof requestIdleCallback === 'function'
    ? (cb, timeout) => requestIdleCallback(cb, { timeout })
    : cb => setTimeout(() => cb({ timeRemaining: () => SLICE_MS, didTimeout: true }), 16) as unknown as number
const cancelIdle: (h: number) => void = typeof cancelIdleCallback === 'function' ? h => cancelIdleCallback(h) : h => clearTimeout(h)

function dispose(g: TowerGeometries | null): void {
  g?.body.dispose()
  g?.decor.dispose()
}

function drop(): void {
  if (!job) return
  if (job.handle !== null) cancelIdle(job.handle)
  dispose(job.done)
  job = null
}

function run(j: Job, deadline: IdleDeadline): void {
  j.handle = null
  if (job !== j) return
  const t0 = performance.now()
  // au moins une étape par passage ; ensuite tant qu'il reste du temps mort et de la tranche
  do {
    const r = j.steps.next()
    if (r.done) {
      j.done = r.value
      return
    }
  } while (performance.now() - t0 < SLICE_MS && (deadline.didTimeout || deadline.timeRemaining() > 1))
  j.handle = requestIdle(d => run(j, d), IDLE_TIMEOUT_MS)
}

/** Prépare en tâche de fond les géométries de ces tours (remplace une préparation en cours). */
export function prepareTowers(towers: readonly TowerDef[]): void {
  if (job?.towers === towers) return
  drop()
  const j: Job = { towers, steps: buildTowerGeometriesSteps(towers), done: null, handle: null }
  job = j
  j.handle = requestIdle(d => run(j, d), IDLE_TIMEOUT_MS)
}

/**
 * Géométries préparées pour CE tableau de tours (l'appelant en devient propriétaire et les
 * libère), ou null. Une préparation inachevée est terminée sur place : le travail déjà fait sert.
 */
export function takeTowers(towers: readonly TowerDef[]): TowerGeometries | null {
  const j = job
  if (!j || j.towers !== towers) return null
  job = null
  if (j.handle !== null) cancelIdle(j.handle)
  if (j.done) return j.done
  let r = j.steps.next()
  while (!r.done) r = j.steps.next()
  return r.value
}
