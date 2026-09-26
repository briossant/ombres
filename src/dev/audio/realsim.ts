// Manche jouée par la VRAIE simulation et les vrais bots (src/sim, src/bots), pour mesurer le
// mixage sur une densité d'événements réaliste. Même interface que FakeSim (step, timeScale).
import { createSimulation } from '../../sim/simulation.ts'
import { RULES } from '../../sim/rules.ts'
import type { BirdInput, SimEvent, SimMode, SimState } from '../../sim/types.ts'
import { createBot, demoTeam, type Bot } from '../../bots/index.ts'
import type { PlayerVisual } from '../../host/view.ts'

export class RealSim {
  readonly state: SimState
  readonly players: PlayerVisual[]
  private readonly sim: ReturnType<typeof createSimulation>
  private readonly bots: Bot[]
  private last: SimEvent[] = []
  private slowmoLeft = 0
  private lastSlowmo = -99
  timeScale = 1

  constructor(o: { mode?: SimMode; birds?: number; T?: number; seed?: number } = {}) {
    const n = o.birds ?? 6
    const mode = o.mode ?? 'round'
    const seed = o.seed ?? 7
    this.sim = createSimulation({
      mode, seed, mapId: mode === 'lobby' ? 'lobby' : 'parasols', birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
      sunSeconds: mode === 'demo' ? RULES.titleDemoSunSeconds : (o.T ?? RULES.roundSunSeconds), countdown: mode === 'round',
    })
    this.state = this.sim.state
    this.bots = demoTeam(n, seed).map((spec, slot) => createBot({ slot, personality: spec.personality, level: spec.level, seed: seed * 31 + slot }))
    this.players = this.bots.map((_, slot) => ({ slot, colorIndex: slot, name: `Bot ${slot + 1}`, kind: slot === 0 ? 'keyboard' : 'bot', assist: false }))
  }

  step(): SimEvent[] {
    const inputs: (BirdInput | undefined)[] = []
    for (const [slot, bot] of this.bots.entries()) inputs[slot] = bot.think(this.state, this.last)
    const ev = this.sim.step(inputs)
    this.last = ev
    // ralentis comme le runner : touche visible (0,35× pendant 0,35 s), dernière seconde (0,5×)
    const dt = 1 / RULES.tickHz
    this.slowmoLeft = Math.max(0, this.slowmoLeft - dt / Math.max(this.timeScale, 0.1))
    for (const e of ev) {
      if (e.type === 'diveHit' && this.state.time - this.lastSlowmo > RULES.hitSlowmoMinGap && this.state.sun.t < this.state.sun.T - RULES.noSlowmoLastSeconds) {
        this.lastSlowmo = this.state.time
        this.slowmoLeft = RULES.hitSlowmoSeconds
      }
    }
    this.timeScale = this.state.timeScaleHint < 1 ? this.state.timeScaleHint : this.slowmoLeft > 0 ? RULES.hitSlowmoScale : 1
    return ev
  }
}
