// Coordinateur partagé par tous les bots d'une même simulation :
// - la perception retardée (historique de ce que l'écran montre),
// - la carte de valeur par blocs et la prévision des ombres (calculées une seule fois),
// - l'équité (GDD §8.7, §14.1) : au plus RULES.maxBotsPerTarget bots engagés sur un
//   même oiseau par fenêtre de RULES.botTargetWindow s.
//
// Il ne transmet aucune information d'un bot à l'autre : l'équité ne sert qu'à éviter
// l'acharnement (règle anti-frustration), jamais à mieux jouer ensemble.
//
// Par défaut, chaque SimState reçoit son coordinateur (coordinatorFor) : les bots
// n'ont rien à câbler. Une nouvelle simulation (manche suivante, reprise) en crée un neuf.

import { RULES } from '../sim/rules.ts'
import type { SimEvent, SimState } from '../sim/types.ts'
import { ObservationHistory } from './perception.ts'
import { ValueMap } from './valueMap.ts'
import { ShadeForecast } from './shade.ts'

interface Engagement {
  hunter: number
  target: number
  /** Dernier instant d'engagement (s, state.time). */
  time: number
}

export class BotCoordinator {
  readonly history = new ObservationHistory()
  readonly values: ValueMap
  readonly shade: ShadeForecast
  /**
   * Slots pilotés par un bot et leur niveau (affiché dans le salon : « Jade · Faucon »,
   * pastilles de niveau). Tous les autres oiseaux sont des humains.
   */
  private readonly botSlots = new Map<number, number>()
  private readonly engagements: Engagement[] = []
  private lastTick = -1
  /** Dernière touche subie par slot (s, state.time) : la vrille se voit, tout le monde le sait. */
  private readonly lastHitAt = new Float64Array(12).fill(-Infinity)
  /** Incrémenté quand le désert est remis à zéro (boucle de démo, lobby) : les bots replanifient. */
  resetCount = 0

  constructor(state: SimState) {
    this.values = new ValueMap(state.grid)
    this.shade = new ShadeForecast(state)
    this.shade.update(state, true)
    this.values.rebuild(this.shade.mask)
  }

  /** Mise à jour du tick (idempotente : le premier bot qui pense ce tick la fait). */
  update(state: SimState, events: readonly SimEvent[]): void {
    if (state.tick === this.lastTick) return
    this.lastTick = state.tick
    let reset = false
    for (const e of events) {
      if (e.type === 'territoryReset') reset = true
      else if (e.type === 'diveHit') this.lastHitAt[e.target] = state.time
    }
    this.history.record(state)
    this.shade.update(state)
    if (reset) {
      this.resetCount++
      this.engagements.length = 0
      this.lastHitAt.fill(-Infinity)
      this.shade.invalidate()
      this.shade.update(state, true)
      this.values.rebuild(this.shade.mask)
    } else this.values.step(this.shade.mask)
    // les engagements trop vieux sortent de la fenêtre
    const horizon = state.time - RULES.botTargetWindow
    for (let i = this.engagements.length - 1; i >= 0; i--) if (this.engagements[i]!.time < horizon) this.engagements.splice(i, 1)
  }

  /** Secondes depuis la dernière touche subie par cet oiseau (Infinity s'il n'a jamais été touché). */
  sinceHit(slot: number, now: number): number {
    return now - (this.lastHitAt[slot] ?? -Infinity)
  }

  registerBot(slot: number, level = 1): void {
    this.botSlots.set(slot, level)
  }

  /** Niveau affiché d'un bot, −1 pour un humain. */
  levelOf(slot: number): number {
    return this.botSlots.get(slot) ?? -1
  }

  unregisterBot(slot: number): void {
    this.botSlots.delete(slot)
    for (let i = this.engagements.length - 1; i >= 0; i--) if (this.engagements[i]!.hunter === slot) this.engagements.splice(i, 1)
  }

  isBot(slot: number): boolean {
    return this.botSlots.has(slot)
  }

  /** Ce bot peut-il s'engager (poursuite ou piqué) sur cette cible sans dépasser le quota ? */
  canEngage(hunter: number, target: number, now: number): boolean {
    if (!this.botSlots.has(hunter)) return true
    const horizon = now - RULES.botTargetWindow
    let others = 0
    for (const e of this.engagements) {
      if (e.target !== target || e.time < horizon) continue
      if (e.hunter === hunter) return true
      others++
    }
    return others < RULES.maxBotsPerTarget
  }

  /** Enregistre (ou rafraîchit) l'engagement d'un bot sur une cible. */
  engage(hunter: number, target: number, now: number): void {
    for (const e of this.engagements) {
      if (e.hunter === hunter && e.target === target) {
        e.time = now
        return
      }
    }
    this.engagements.push({ hunter, target, time: now })
  }

  /** Bots engagés sur une cible dans la fenêtre courante (tests, debug). */
  engagedOn(target: number, now: number): number[] {
    const horizon = now - RULES.botTargetWindow
    const out: number[] = []
    for (const e of this.engagements) if (e.target === target && e.time >= horizon && !out.includes(e.hunter)) out.push(e.hunter)
    return out
  }
}

const registry = new WeakMap<SimState, BotCoordinator>()

/** Coordinateur rattaché à un état de simulation (créé à la première demande). */
export function coordinatorFor(state: SimState): BotCoordinator {
  let c = registry.get(state)
  if (!c) {
    c = new BotCoordinator(state)
    registry.set(state, c)
  }
  return c
}
