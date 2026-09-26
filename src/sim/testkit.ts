// Outils de test de la simulation (duels de piqué contrôlés, entrées scriptées).
// Utilisés par les tests vitest et tools/sim-dive.ts ; purs.

import { RULES, DEG } from './rules.ts'
import type { BirdInput, SimEvent, Simulation } from './types.ts'
import { createSimulation } from './simulation.ts'
import { mulberry32 } from './rng.ts'

export function neutralInput(): BirdInput {
  return { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
}

export interface DiveTrialOptions {
  /** Réaction de la cible au clac (s), undefined = aucune. */
  flapAfterCommit?: number
  /** Coup d'aile de la cible à un instant absolu depuis le lancement du piqué (s). */
  flapAtDiveTime?: number
  /** Crochet permanent de la cible (virage max), et contre-virage x s après le clac. */
  jink?: boolean
  reverseAfterCommit?: number
  /** Grâce de latence de la cible (s). */
  latencyGrace?: number
}

export interface DiveTrialResult {
  hit: boolean
  cancelled: boolean
  /** Durée du clac au contact (s), si touche. */
  commitToContact: number
  /** Durée totale du piqué (prise d'élan comprise) jusqu'à la résolution (s). */
  duration: number
  committed: boolean
  events: SimEvent[]
}

/**
 * Duel contrôlé (GDD §17-E) : chasseur à 18 m, cible à 4 m en vol droit, à une
 * distance de 8 à 26 m dans le cône ±70°. Le chasseur pique dès que la cible est
 * verrouillée ; la cible réagit (ou non) au clac par un coup d'aile perpendiculaire
 * à l'approche.
 */
export function diveTrial(seed: number, opts: DiveTrialOptions = {}): DiveTrialResult {
  const rnd = mulberry32(seed)
  const D = 8 + rnd() * (RULES.diveLockRange - 8)
  const bearing = (rnd() * 2 - 1) * RULES.diveLockConeDeg * DEG * 0.999
  const targetHeading = rnd() * 2 * Math.PI
  const side = rnd() < 0.5 ? -1 : 1
  const sim: Simulation = createSimulation({
    mode: 'round',
    seed,
    mapId: 'lobby',
    arenaOverride: { a: 400, b: 400 },
    birds: [
      { slot: 0, assist: false },
      { slot: 1, assist: false },
    ],
    sunSeconds: RULES.roundSunSeconds,
    countdown: false,
  })
  const st = sim.state
  const A = st.bySlot[0]!
  const B = st.bySlot[1]!
  A.x = 150
  A.y = -150
  A.z = RULES.altHigh
  A.heading = 0
  A.speed = RULES.speedHigh
  A.turnRate = 0
  B.x = A.x + D * Math.cos(bearing)
  B.y = A.y + D * Math.sin(bearing)
  B.z = RULES.altLow
  B.heading = targetHeading
  B.speed = RULES.speedLow
  B.turnRate = 0
  if (opts.latencyGrace) sim.setLatencyGrace(1, opts.latencyGrace)
  const ia = neutralInput()
  const ib = neutralInput()
  ia.dirX = 1
  ib.dirX = Math.cos(targetHeading)
  ib.dirY = Math.sin(targetHeading)
  ib.dive = true
  const all: SimEvent[] = []
  let launched = -1
  let commitAt = -1
  let flapDone = false
  const jinkDir = rnd() < 0.5 ? -1 : 1
  const dt = 1 / RULES.tickHz
  for (let tick = 0; tick < 200; tick++) {
    const now = tick * dt
    // chasseur : pique dès que la cible est verrouillée
    if (launched < 0 && A.lockTarget === 1) {
      ia.divePresses++
      ia.dive = true
    }
    // cible
    if (opts.jink && launched >= 0 && now - launched > RULES.diveWindup) {
      let dir = jinkDir
      if (opts.reverseAfterCommit !== undefined && commitAt >= 0 && now - commitAt > opts.reverseAfterCommit) dir = -jinkDir
      const h = B.heading + dir * 1.2
      ib.dirX = Math.cos(h)
      ib.dirY = Math.sin(h)
    }
    const wantFlap =
      !flapDone &&
      ((opts.flapAfterCommit !== undefined && commitAt >= 0 && now - commitAt >= opts.flapAfterCommit - 1e-9) ||
        (opts.flapAtDiveTime !== undefined && launched >= 0 && now - launched >= opts.flapAtDiveTime - 1e-9))
    if (wantFlap) {
      flapDone = true
      const ax = B.x - A.x
      const ay = B.y - A.y
      const L = Math.hypot(ax, ay) || 1
      ib.dirX = (side * -ay) / L
      ib.dirY = (side * ax) / L
      ib.flapPresses++
    }
    const ev = sim.step([ia, ib])
    if (wantFlap && !opts.jink) {
      ib.dirX = Math.cos(targetHeading)
      ib.dirY = Math.sin(targetHeading)
    }
    for (const e of ev) {
      all.push(e)
      if (e.type === 'diveWindup') launched = st.time - dt
      if (e.type === 'diveCommit') commitAt = st.time
      if (e.type === 'diveHit' || e.type === 'diveMiss' || e.type === 'diveCancel') {
        return {
          hit: e.type === 'diveHit',
          cancelled: e.type === 'diveCancel',
          commitToContact: commitAt >= 0 ? st.time - commitAt : 0,
          duration: st.time - launched,
          committed: commitAt >= 0,
          events: all,
        }
      }
    }
  }
  return { hit: false, cancelled: true, commitToContact: 0, duration: 0, committed: commitAt >= 0, events: all }
}

// ─── Mises en place contrôlées ─────────────────────────────────────────────

/**
 * Simulation de test : manche sans compte à rebours, carte du lobby (un parasol en
 * (−30, 10)) dans une arène imposée, soleil de midi. Les oiseaux sont replacés par le test.
 */
export function controlledSim(birds: number, opts: { a?: number; b?: number; seed?: number; sunSeconds?: number; assist?: boolean[] } = {}): Simulation {
  return createSimulation({
    mode: 'round',
    seed: opts.seed ?? 7,
    mapId: 'lobby',
    arenaOverride: { a: opts.a ?? 400, b: opts.b ?? 300 },
    birds: Array.from({ length: birds }, (_, i) => ({ slot: i, assist: opts.assist?.[i] ?? false })),
    sunSeconds: opts.sunSeconds ?? RULES.roundSunSeconds,
    countdown: false,
  })
}

/** Place un oiseau (position, altitude, cap, vitesse de croisière correspondante). */
export function placeBird(sim: Simulation, slot: number, x: number, y: number, z: number, heading = 0): void {
  const b = sim.state.bySlot[slot]!
  b.x = x
  b.y = y
  b.z = z
  b.heading = heading
  b.turnRate = 0
  b.speed = z <= RULES.strongMaxAlt ? RULES.speedLow : RULES.speedHigh
  b.vz = 0
}

/** Entrée qui garde le cap et l'altitude (PLONGER maintenu si bas). */
export function holdInput(sim: Simulation, slot: number): BirdInput {
  const b = sim.state.bySlot[slot]!
  return { dirX: Math.cos(b.heading), dirY: Math.sin(b.heading), dive: b.z <= RULES.strongMaxAlt, divePresses: 0, flapPresses: 0 }
}

/** Impose propriétaire et niveau des cellules d'un disque (comptes tenus à jour). */
export function setCells(sim: Simulation, x: number, y: number, radius: number, owner: number, level: number): number {
  const g = sim.state.grid
  let n = 0
  for (let j = 0; j < g.rows; j++) {
    const cy = g.y0 + (j + 0.5) * g.cellH
    if (Math.abs(cy - y) > radius) continue
    for (let i = 0; i < g.cols; i++) {
      const cx = g.x0 + (i + 0.5) * g.cellW
      if ((cx - x) ** 2 + (cy - y) ** 2 > radius * radius) continue
      const k = j * g.cols + i
      if (!g.inArena[k]) continue
      g.counts[g.owner[k]!]!--
      g.owner[k] = owner
      g.level[k] = owner === 0 ? 0 : level
      g.counts[owner]!++
      n++
    }
  }
  return n
}

/** Propriétaire et niveau de la cellule au point (x, y). */
export function cellAtPoint(sim: Simulation, x: number, y: number): { owner: number; level: number; frozen: number } {
  const g = sim.state.grid
  const i = Math.floor((x - g.x0) / g.cellW)
  const j = Math.floor((y - g.y0) / g.cellH)
  const k = j * g.cols + i
  return { owner: g.owner[k]!, level: g.level[k]!, frozen: g.frozen[k]! }
}

/** Empreinte de hachage de l'état (déterminisme, snapshots). */
export function stateHash(sim: Simulation): string {
  const st = sim.state
  let h = 0x811c9dc5
  const mixIn = (v: number) => {
    h ^= v | 0
    h = Math.imul(h, 0x01000193)
  }
  const g = st.grid
  for (let k = 0; k < g.owner.length; k++) mixIn(g.owner[k]! * 3 + g.level[k]!)
  for (const b of st.birds) for (const v of [b.x, b.y, b.z, b.heading, b.speed, b.stun, b.immune, b.flapCooldown]) mixIn(Math.round(v * 1e6))
  mixIn(st.tick)
  mixIn(st.crownSlot)
  return (h >>> 0).toString(16)
}
