// Bots « de service » : composition par défaut selon le nombre d'humains (GDD §14.3),
// remplaçant d'un joueur déconnecté, mannequin du lobby (§15.2), équipe de l'écran
// titre (§15.1).

import { RULES, DEG } from '../sim/rules.ts'
import type { BirdInput, SimEvent, SimState } from '../sim/types.ts'
import { angDiff } from '../sim/math.ts'
import { ellipticRadius } from '../sim/arena.ts'
import type { Bot, BotIntent, BotLevel, BotPersonality } from './types.ts'
import { BotBrain } from './brain.ts'
import { coordinatorFor } from './coordinator.ts'
import { Rng } from './random.ts'

export interface BotSpec {
  personality: BotPersonality
  level: BotLevel
}

/**
 * Bots ajoutés par défaut selon le nombre d'humains (GDD §14.3) : un humain seul reçoit
 * 3 Voyageurs (Faucon, Laboureur, Nomade) ; deux humains, 2 (Pie, Guetteur) ; trois,
 * 1 (Faucon) ; à partir de quatre, aucun. `level` remplace le niveau Voyageur (réglage
 * de partie « Bots »).
 */
export function defaultBots(humans: number, level: BotLevel = 1): BotSpec[] {
  const list: BotPersonality[] = humans <= 1 ? ['falcon', 'ploughman', 'nomad'] : humans === 2 ? ['magpie', 'lookout'] : humans === 3 ? ['falcon'] : []
  // l'Horloger n'apparaît jamais par défaut ; aucun ajustement de niveau n'est nécessaire
  return list.map((personality) => ({ personality, level }))
}

/** Remplaçant d'un joueur déconnecté : un Laboureur Voyageur (GDD §14.3). */
export const SUBSTITUTE_SPEC: Readonly<BotSpec> = Object.freeze({ personality: 'ploughman', level: 1 })

/**
 * Crée le remplaçant d'un joueur déconnecté. Il reprend le slot (donc la couleur et le
 * territoire) là où en est la manche, et rend la main dès que le runner recommence à
 * lire le téléphone (il suffit de ne plus appeler son `think`).
 */
export function createSubstituteBot(slot: number, seed: number): Bot {
  return new BotBrain({ slot, seed, substitute: true, ...SUBSTITUTE_SPEC })
}

/**
 * Équipe de l'écran titre (GDD §15.1) : variée et spectaculaire. Des chasseurs pour les
 * piqués, un balayeur pour les grandes traînées du couchant, une pillarde, un embusqué
 * et le Fou pour le chaos. `seed` fait varier l'ordre et un niveau à chaque boucle.
 */
export function demoTeam(count = 6, seed = 0): BotSpec[] {
  const base: BotSpec[] = [
    { personality: 'falcon', level: 2 },
    { personality: 'nomad', level: 2 },
    { personality: 'magpie', level: 1 },
    { personality: 'fool', level: 1 },
    { personality: 'lookout', level: 1 },
    { personality: 'ploughman', level: 2 },
    { personality: 'watchmaker', level: 2 },
    { personality: 'falcon', level: 1 },
    { personality: 'nomad', level: 1 },
    { personality: 'magpie', level: 2 },
    { personality: 'fool', level: 0 },
    { personality: 'ploughman', level: 1 },
  ]
  const rng = new Rng(seed)
  const out = base.slice(0, Math.max(1, Math.min(12, count)))
  // mélange déterministe (les places tournent d'une boucle à l'autre)
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(i + 1)
    const tmp = out[i]!
    out[i] = out[j]!
    out[j] = tmp
  }
  return out
}

// ─── Mannequin du lobby ────────────────────────────────────────────────────

/**
 * Mannequin du lobby (GDD §15.2) : tourne lentement au ras du sable, en grand cercle
 * loin du parasol, pour que chacun puisse s'entraîner à le piquer. Il ne pique jamais,
 * ne bat jamais des ailes, ne se cache pas.
 */
export class LobbyDummy implements Bot {
  readonly personality: BotPersonality = 'ploughman'
  readonly level: BotLevel = 0
  readonly substitute = false
  readonly intent: BotIntent = { kind: 'dummy', target: -1, x: NaN, y: NaN, low: true, blunder: null }
  private readonly input: BirdInput = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
  private attached: SimState | null = null
  private cx = 0
  private cy = 0
  private radius = 22
  private held = false

  constructor(readonly slot: number) {}

  think(state: SimState, events: readonly SimEvent[]): BirdInput {
    if (state !== this.attached) this.attach(state)
    coordinatorFor(state).update(state, events)
    const me = state.bySlot[this.slot]
    const input = this.input
    if (!me || state.sun.phase === 'countdown' || state.over) {
      input.dive = false
      this.held = false
      return input
    }
    // poursuite d'un point qui tourne sur le cercle (sens antihoraire)
    const phi = Math.atan2(me.y - this.cy, me.x - this.cx) + 0.55
    const tx = this.cx + this.radius * Math.cos(phi)
    const ty = this.cy + this.radius * Math.sin(phi)
    let h = Math.atan2(ty - me.y, tx - me.x)
    if (Math.abs(angDiff(h, me.heading)) > 150 * DEG) h = me.heading + 90 * DEG
    input.dirX = Math.cos(h)
    input.dirY = Math.sin(h)
    // PLONGER maintenu : au ras du sable (appui compté une fois)
    if (!this.held) input.divePresses++
    this.held = true
    input.dive = true
    this.intent.x = this.cx
    this.intent.y = this.cy
    return input
  }

  reset(): void {
    this.attached = null
  }

  /** Centre du cercle : le plus grand cercle qui reste loin des fûts et de la tempête. */
  private attach(state: SimState): void {
    this.attached = state
    this.held = false
    coordinatorFor(state).registerBot(this.slot, 0)
    const { a, b } = state.arena
    let best = -Infinity
    for (let r = Math.min(26, b * 0.45); r >= 12; r -= 2) {
      for (let i = 0; i <= 8; i++) {
        for (let j = 0; j <= 6; j++) {
          const cx = -a * 0.5 + (a * i) / 8
          const cy = -b * 0.4 + (b * 0.8 * j) / 6
          // tout le cercle reste dans l'arène, loin du Simoun
          let ok = true
          for (let q = 0; q < 16 && ok; q++) {
            const x = cx + r * Math.cos((q * Math.PI) / 8)
            const y = cy + r * Math.sin((q * Math.PI) / 8)
            if (ellipticRadius(x, y, a, b) > 0.8) ok = false
          }
          if (!ok) continue
          let clear = Infinity
          for (const t of state.towers) if (!t.outside) clear = Math.min(clear, Math.abs(Math.hypot(t.x - cx, t.y - cy) - r) - t.trunkRadius - RULES.towerCollisionMargin)
          const score = Math.min(clear, 30) + r * 0.5 - Math.hypot(cx, cy) * 0.1
          if (clear > 6 && score > best) {
            best = score
            this.cx = cx
            this.cy = cy
            this.radius = r
          }
        }
      }
      if (best > -Infinity) break
    }
  }
}

/** Crée le mannequin du lobby pour ce slot. */
export function createLobbyDummy(slot: number): Bot {
  return new LobbyDummy(slot)
}
