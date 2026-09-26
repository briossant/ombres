// Traduction de l'état et des événements de la simulation en retours pour les téléphones :
// - CueRouter : SimEvent → PhoneCue par slot (vibrations + retours visuels, GDD §12.3) ;
// - statusFromSim : SimState → PhoneStatus (bandeau, PIQUER, recharge du COUP D'AILE…).
// Pur (aucun réseau) : phoneHub s'en sert, les tests aussi.
import type { SimEvent, SimState } from '../sim/types.ts'
import { RULES } from '../sim/rules.ts'
import type { PhoneCue, PhoneStatus } from '../shared/messages.ts'

/** Destinataire d'un retour : un slot, ou tous les oiseaux pilotés par téléphone. */
export type CueTarget = number | 'all'
export type CueSink = (target: CueTarget, cue: PhoneCue, n?: number) => void

/** Rang (1 = premier) d'un slot d'après les cellules possédées ; ex æquo = même rang. */
export function rankOf(state: SimState, slot: number): number {
  const counts = state.grid.counts
  const mine = counts[slot + 1] ?? 0
  let rank = 1
  for (const b of state.birds) if (b.slot !== slot && (counts[b.slot + 1] ?? 0) > mine) rank++
  return rank
}

/** Slots en tête (plusieurs en cas d'égalité exacte). */
export function leadersOf(state: SimState): number[] {
  const counts = state.grid.counts
  let best = -1
  let leaders: number[] = []
  for (const b of state.birds) {
    const c = counts[b.slot + 1] ?? 0
    if (c > best) {
      best = c
      leaders = [b.slot]
    } else if (c === best) leaders.push(b.slot)
  }
  return best > 0 ? leaders : []
}

export class CueRouter {
  /** Dernier « tic » de verrouillage par cible (temps de simulation, s). */
  private lastLockTick = new Map<number, number>()

  reset(): void {
    this.lastLockTick.clear()
  }

  route(events: readonly SimEvent[], state: SimState, sink: CueSink): void {
    for (const e of events) this.routeOne(e, state, sink)
  }

  private routeOne(e: SimEvent, state: SimState, sink: CueSink): void {
    switch (e.type) {
      case 'countdown':
        if (e.n > 0) sink('all', 'countdown', e.n)
        else sink('all', 'go')
        break
      case 'phase':
        if (e.phase === 'greatShadow') sink('all', 'greatShadow')
        break
      case 'lastSeconds':
        sink('all', 'tick', e.n)
        break
      case 'altitude':
        sink(e.slot, 'altitude')
        break
      case 'lock': {
        const last = this.lastLockTick.get(e.target)
        if (last === undefined || state.time - last >= RULES.lockTickMinGapSeconds) {
          this.lastLockTick.set(e.target, state.time)
          sink(e.target, 'locked')
        }
        break
      }
      case 'diveWindup':
        sink(e.target, 'windup')
        break
      case 'diveCommit':
        sink(e.target, 'clac')
        break
      case 'diveHit':
        sink(e.hunter, 'hit')
        sink(e.target, 'stunned')
        break
      case 'diveMiss':
        sink(e.hunter, 'planted')
        if (e.dodged) sink(e.target, 'dodge')
        break
      case 'flap':
        sink(e.slot, 'flap')
        break
      case 'flapReady':
        sink(e.slot, 'flapReady')
        break
      case 'crown':
        if (e.slot >= 0) sink(e.slot, 'crown')
        break
      case 'bump':
        sink(e.a, 'bump')
        sink(e.b, 'bump')
        break
      case 'towerBump':
        sink(e.slot, 'bump')
        break
      case 'storm':
        if (e.inside) sink(e.slot, 'bump')
        break
      case 'over':
        if (state.config.mode === 'round') for (const slot of leadersOf(state)) sink(slot, 'roundWin')
        break
      default:
        break
    }
  }
}

const q = (v: number, step: number) => Math.round(v / step) * step

/**
 * État vivant d'un oiseau pour son téléphone.
 * @param colorOf index de couleur (PLAYER_COLORS) d'un slot, pour PIQUER à la couleur de la cible.
 */
export function statusFromSim(state: SimState, slot: number, colorOf: (slot: number) => number): PhoneStatus | null {
  const bird = state.bySlot[slot]
  if (!bird) return null
  const cells = state.grid.counts[slot + 1] ?? 0
  const arena = state.grid.arenaCells || 1
  const sun = state.sun
  return {
    k: 'st',
    rank: rankOf(state, slot),
    of: state.birds.length,
    share: q(cells / arena, 0.001),
    crown: state.crownSlot === slot,
    sun: q(sun.u, 0.005),
    countdown: sun.phase === 'countdown' ? Math.max(1, Math.ceil(-sun.t)) : 0,
    low: bird.strong,
    // PIQUER seulement quand l'appui lancerait vraiment un piqué (docs/agent-notes/sim.md) :
    // lockTarget est gardé pendant le piqué en cours, et la recharge doit être finie.
    target: bird.lockTarget >= 0 && bird.dive === 'none' && bird.diveCooldown <= 0 ? colorOf(bird.lockTarget) : -1,
    hunter: bird.lockedBy >= 0 ? colorOf(bird.lockedBy) : -1,
    diving: bird.dive !== 'none',
    hidden: bird.hidden,
    night: bird.inNight,
    stun: q(bird.stun, 0.1),
    immune: bird.immune > 0,
    flapCd: q(bird.flapCooldown, 0.1),
  }
}

/**
 * Deux statuts diffèrent-ils sur un champ qui doit partir tout de suite ?
 * (Le reste — part, soleil, recharges — peut attendre le prochain envoi groupé.)
 */
export function statusUrgent(a: PhoneStatus | null, b: PhoneStatus): boolean {
  if (!a) return true
  return (
    a.target !== b.target ||
    a.hunter !== b.hunter ||
    a.diving !== b.diving ||
    a.hidden !== b.hidden ||
    a.night !== b.night ||
    a.crown !== b.crown ||
    a.immune !== b.immune ||
    a.low !== b.low ||
    a.countdown !== b.countdown ||
    a.rank !== b.rank ||
    (a.stun > 0) !== (b.stun > 0) ||
    (a.flapCd > 0) !== (b.flapCd > 0) ||
    // Une recharge qui repart (nouveau coup d'aile) doit corriger la prédiction locale.
    b.flapCd > a.flapCd + 0.15
  )
}

export function statusEqual(a: PhoneStatus | null, b: PhoneStatus): boolean {
  if (!a) return false
  for (const key of Object.keys(b) as (keyof PhoneStatus)[]) if (a[key] !== b[key]) return false
  return true
}
