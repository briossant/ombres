// La manche filmée par la bande-annonce, rejouée hors du jeu (Node : seeds.ts ; navigateur : audio-entry.ts).
// Même configuration que le runner une fois la graine de partie imposée (session.mjs --seed) : partie d'une
// manche, oiseaux de cast.json, bots des joueurs « téléphone » (graine hashSeed(graine de manche, sel + slot))
// et des bots du salon (hashSeed(graine de manche, slot)), même routeur d'entrées. `RunnerClock` reproduit le
// dosage du temps du runner (ralentis de touche et d'esquive, dernière seconde) : il donne l'instant réel de
// chaque tick, donc l'instant de chaque événement dans la vidéo tournée à vitesse normale.
import { createBot, type Bot, type BotPersonality, type BotLevel } from '../../src/bots/index.ts'
import { InputRouter, type LocalInput } from '../../src/input/router.ts'
import { createMatch, roundConfig } from '../../src/sim/match.ts'
import { createSimulation } from '../../src/sim/simulation.ts'
import { RULES } from '../../src/sim/rules.ts'
import type { SimEvent, Simulation } from '../../src/sim/types.ts'
import type { PlayerVisual } from '../../src/host/view.ts'
import cast from './cast.json' with { type: 'json' }

export { cast }

/** Copie exacte de hashSeed (src/host/runner/runner.ts). */
export function hashSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

export const HUMAN_SLOTS: readonly number[] = cast.humans.map((h) => h.slot)

export interface TrailerRound {
  sim: Simulation
  router: InputRouter
  bots: Bot[]
  players: PlayerVisual[]
}

export function makeTrailerRound(matchSeed: number): TrailerRound {
  const slots = [...cast.humans.map((h) => h.slot), ...cast.bots.map((_, i) => cast.humans.length + i)]
  const birds = slots.map((slot) => ({ slot, assist: false }))
  const match = createMatch({ seed: matchSeed, rounds: 1, length: cast.length as 'normal', lastDouble: true, birds })
  const sim = createSimulation(roundConfig(match, 0, birds))
  const simSeed = sim.state.config.seed
  const router = new InputRouter(null as unknown as LocalInput)
  router.reset()
  const bots: Bot[] = []
  const players: PlayerVisual[] = []
  for (const h of cast.humans) {
    bots.push(createBot({ slot: h.slot, personality: h.brain.personality as BotPersonality, level: h.brain.level as BotLevel, seed: hashSeed(simSeed, cast.brainSeedSalt + h.slot) }))
    players[h.slot] = { slot: h.slot, colorIndex: h.color, name: h.name, kind: 'phone', assist: false }
  }
  cast.bots.forEach((b, i) => {
    const slot = cast.humans.length + i
    bots.push(createBot({ slot, personality: b.personality as BotPersonality, level: b.level as BotLevel, seed: hashSeed(simSeed, slot) }))
    // couleur attribuée par le salon : première libre après celles des téléphones (vérifié par session.mjs)
    players[slot] = { slot, colorIndex: firstFreeColors(i), name: '', kind: 'bot', assist: false }
  })
  for (const b of bots) router.set(b.slot, { kind: 'bot', bot: b })
  return { sim, router, bots, players }
}

function firstFreeColors(i: number): number {
  const taken = new Set(cast.humans.map((h) => h.color))
  const free = Array.from({ length: 12 }, (_, c) => c).filter((c) => !taken.has(c))
  return free[i] ?? i
}

/** Dosage du temps du runner (Runner.timeScale / maybeSlowmo), image par image. */
export class RunnerClock {
  realTime = 0
  private slowmoAt = -1
  private slowmoScale = 1
  private slowmoHold = 0
  private lastSlowmoSimTime = -Infinity
  private acc = 0
  private evs: SimEvent[] = []
  /** `slowmo: false` : pas de ralenti de touche ni d'esquive (tempo de la partition régulier), dernière seconde gardée. */
  constructor(
    private readonly r: TrailerRound,
    private readonly slowmo = true,
  ) {}

  timeScale(): number {
    let s = 1
    if (this.slowmoAt >= 0) {
      const e = this.realTime - this.slowmoAt
      const k = this.slowmoScale
      if (e < this.slowmoHold) s = k
      else if (e < this.slowmoHold + RULES.hitSlowmoRampSeconds) s = k + ((1 - k) * (e - this.slowmoHold)) / RULES.hitSlowmoRampSeconds
      else this.slowmoAt = -1
    }
    return Math.min(s, this.r.sim.state.timeScaleHint)
  }

  private maybeSlowmo(scale: number, hold: number): void {
    if (!this.slowmo) return
    const st = this.r.sim.state
    if (st.sun.t > st.sun.T - RULES.noSlowmoLastSeconds) return
    if (st.time - this.lastSlowmoSimTime < RULES.hitSlowmoMinGap) return
    this.lastSlowmoSimTime = st.time
    this.slowmoAt = this.realTime
    this.slowmoScale = scale
    this.slowmoHold = hold
  }

  /** Une image de `dt` s réelles ; `onEvent` reçoit chaque événement (avec l'instant réel). Renvoie le facteur appliqué. */
  frame(dt: number, onEvent?: (e: SimEvent, realTime: number) => void): number {
    this.realTime += dt
    const scale = this.timeScale()
    const TICK = 1 / RULES.tickHz
    this.acc += dt * scale
    let n = 0
    while (this.acc >= TICK && n < 8) {
      const st = this.r.sim.state
      this.evs = this.r.sim.step(this.r.router.collect(st, this.evs))
      for (const e of this.evs) {
        if (e.type === 'diveHit') this.maybeSlowmo(RULES.hitSlowmoScale, RULES.hitSlowmoSeconds)
        else if (e.type === 'diveMiss' && e.dodged && (HUMAN_SLOTS.includes(e.target) || HUMAN_SLOTS.includes(e.hunter))) this.maybeSlowmo(RULES.dodgeSlowmoScale, RULES.dodgeSlowmoSeconds)
        onEvent?.(e, this.realTime)
      }
      this.acc -= TICK
      n++
    }
    return scale
  }

  get alpha(): number {
    return Math.min(1, Math.max(0, this.acc * RULES.tickHz))
  }
}
