// Micro-objectifs du lobby (GDD §15.2) : « Vole », « Plonge », « Pique ».
// Pur et indépendant de l'origine de l'entrée (téléphone, clavier) : le runner le nourrit avec
// les BirdInput du lobby et les événements de simulation, puis recopie `goals(slot)` dans la vue
// du téléphone et sur le slot du lobby de la TV (coche quand les trois sont faits).
import type { BirdInput, SimEvent } from '../sim/types.ts'
import { RULES } from '../sim/rules.ts'
import type { LobbyGoals } from '../shared/messages.ts'

interface Progress {
  flySeconds: number
  diveHeld: number
  goals: LobbyGoals
}

export class LobbyGoalTracker {
  private bySlot = new Map<number, Progress>()

  private get(slot: number): Progress {
    let p = this.bySlot.get(slot)
    if (!p) this.bySlot.set(slot, (p = { flySeconds: 0, diveHeld: 0, goals: { fly: false, dive: false, strike: false } }))
    return p
  }

  /**
   * À appeler à chaque tick du lobby pour chaque joueur humain.
   * @returns true si un objectif vient d'être coché (pour un son, un retour visuel).
   */
  update(slot: number, input: Readonly<BirdInput>, dt: number): boolean {
    const p = this.get(slot)
    let changed = false
    if (!p.goals.fly) {
      if (Math.hypot(input.dirX, input.dirY) >= RULES.stickDeadzone) p.flySeconds += dt
      if (p.flySeconds >= RULES.lobbyGoalFlySeconds) changed = p.goals.fly = true
    }
    if (!p.goals.dive) {
      p.diveHeld = input.dive ? p.diveHeld + dt : 0
      if (p.diveHeld >= RULES.lobbyGoalDiveHoldSeconds) changed = p.goals.dive = true
    }
    return changed
  }

  /** Un piqué réussi (sur le mannequin ou sur quiconque) coche « Pique ». */
  onSimEvent(e: SimEvent): number | null {
    if (e.type !== 'diveHit') return null
    const p = this.get(e.hunter)
    if (p.goals.strike) return null
    p.goals.strike = true
    return e.hunter
  }

  goals(slot: number): LobbyGoals {
    return { ...this.get(slot).goals }
  }

  allDone(slot: number): boolean {
    const g = this.get(slot).goals
    return g.fly && g.dive && g.strike
  }

  reset(slot?: number): void {
    if (slot === undefined) this.bySlot.clear()
    else this.bySlot.delete(slot)
  }
}
