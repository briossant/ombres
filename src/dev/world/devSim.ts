// Pilote de simulation de la page de lookdev : la VRAIE sim (createSimulation) avec
// des entrées scriptées (politiques de référence du banc d'essai de la sim), avance
// rapide jusqu'à l'instant demandé, puis gel ou lecture en direct. Remplit gameView
// comme le fera le runner (état courant, états précédents, alpha).
import { simEvents } from '../../host/bus.ts'
import { gameView, type PlayerVisual } from '../../host/view.ts'
import { makePolicy, type Policy, type PolicyName } from '../../sim/harness.ts'
import { RULES } from '../../sim/rules.ts'
import { createSimulation } from '../../sim/simulation.ts'
import type { BirdState, MapId, Simulation } from '../../sim/types.ts'

export interface DevSimOptions {
  mapId: MapId
  birds: number
  seed: number
  /** Instant de soleil (s) auquel se placer. */
  t: number
  sunSeconds: number
}

const MIX: PolicyName[] = ['mixed', 'hunter', 'high', 'mixed', 'low', 'adapt', 'hunter', 'mixed', 'high', 'adapt', 'mixed', 'low']

function cloneBird(b: BirdState): BirdState {
  return { ...b, shadow: { ...b.shadow } }
}

export class DevSim {
  readonly sim: Simulation
  private readonly policies: Policy[] = []
  private acc = 0
  frozen = false
  private readonly dt = 1 / RULES.tickHz

  constructor(o: DevSimOptions) {
    this.sim = createSimulation({
      mode: 'round',
      seed: o.seed,
      mapId: o.mapId,
      birds: Array.from({ length: o.birds }, (_, slot) => ({ slot, assist: false })),
      sunSeconds: o.sunSeconds,
      countdown: false,
    })
    for (let slot = 0; slot < o.birds; slot++) this.policies.push(makePolicy(MIX[slot % MIX.length]!, slot, o.seed * 31 + slot))
    const players: PlayerVisual[] = []
    for (let slot = 0; slot < o.birds; slot++) players[slot] = { slot, colorIndex: slot, name: `J${slot + 1}`, kind: 'bot', assist: false }
    gameView.players = players
    gameView.sim = this.sim.state
    // avance rapide (sans événements : le rendu démarre « calme »)
    const target = Math.max(0, o.t)
    while (this.sim.state.sun.t < target - 1e-6 && !this.sim.state.over) this.tick(false)
    gameView.prevBirds = []
    for (const b of this.sim.state.birds) gameView.prevBirds[b.slot] = cloneBird(b)
    gameView.alpha = 1
  }

  private readonly inputs: ReturnType<Policy>[] = []

  tick(emit = true): void {
    const st = this.sim.state
    for (let i = 0; i < this.policies.length; i++) this.inputs[i] = this.policies[i]!(st, i)
    const events = this.sim.step(this.inputs)
    if (emit) for (const e of events) simEvents.emit(e)
  }

  /** Avance en temps réel (ralentis de la sim respectés). */
  update(dtReal: number): void {
    gameView.realTime += dtReal
    if (this.frozen || this.sim.state.over) {
      gameView.alpha = 1
      return
    }
    this.acc += dtReal * (this.sim.state.timeScaleHint || 1)
    let guard = 0
    while (this.acc >= this.dt && guard++ < 8) {
      for (const b of this.sim.state.birds) gameView.prevBirds[b.slot] = cloneBird(b)
      this.tick(true)
      this.acc -= this.dt
    }
    gameView.alpha = Math.min(1, this.acc / this.dt)
  }
}
