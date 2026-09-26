// Pilote de simulation de la page de lookdev des oiseaux (dev uniquement).
//
// La VRAIE simulation (createSimulation) tourne avec des entrées scriptées (les
// politiques de référence du banc de la sim) et remplit gameView comme le fera
// le runner (état courant, états précédents, alpha). Pour juger chaque état de
// l'oiseau isolément, certains oiseaux peuvent être des « marionnettes » : l'état
// AFFICHÉ (copie) est imposé (piqué, décrochage, immunité…), et l'oiseau de la
// sim est replacé sous la marionnette pour que son ombre peigne au bon endroit.
import { simEvents } from '../../host/bus.ts'
import { gameView, type PlayerVisual } from '../../host/view.ts'
import { makePolicy, type Policy, type PolicyName } from '../../sim/harness.ts'
import { DEG, RULES } from '../../sim/rules.ts'
import { createSimulation } from '../../sim/simulation.ts'
import type { BirdInput, BirdState, MapId, SimEvent, SimState, Simulation } from '../../sim/types.ts'

export interface PuppetSpec {
  slot: number
  state: string
  x: number
  y: number
  z: number
  heading: number
  /** Période de répétition des états instantanés (s). */
  period: number
  /** Cible visée (état « dive ») : elle affiche le « ! ». */
  target?: number
}

export interface DriverOptions {
  mapId: MapId
  birds: number
  seed: number
  sunSeconds: number
  puppets: PuppetSpec[]
  policies?: PolicyName[]
}

const MIX: PolicyName[] = ['mixed', 'hunter', 'high', 'mixed', 'low', 'adapt', 'hunter', 'mixed', 'high', 'adapt', 'mixed', 'low']

const cloneBird = (b: BirdState): BirdState => ({ ...b, shadow: { ...b.shadow } })

export class DevDriver {
  readonly sim: Simulation
  private readonly policies: (Policy | null)[] = []
  private readonly puppets = new Map<number, PuppetSpec>()
  private readonly inputs: (BirdInput | undefined)[] = []
  /** État affiché (copie de la sim, marionnettes imposées). */
  readonly display: SimState
  private readonly displayBirds: BirdState[] = []
  private readonly displayBySlot: (BirdState | undefined)[] = new Array(12)
  private acc = 0
  private readonly dt = 1 / RULES.tickHz
  private puppetTime = 0
  paused = false

  constructor(o: DriverOptions) {
    this.sim = createSimulation({
      mode: 'round',
      seed: o.seed,
      mapId: o.mapId,
      birds: Array.from({ length: o.birds }, (_, slot) => ({ slot, assist: slot === 2 })),
      sunSeconds: o.sunSeconds,
      countdown: false,
    })
    for (const p of o.puppets) this.puppets.set(p.slot, p)
    for (let slot = 0; slot < o.birds; slot++) {
      this.policies.push(this.puppets.has(slot) ? null : makePolicy((o.policies ?? MIX)[slot % (o.policies ?? MIX).length]!, slot, o.seed * 31 + slot))
    }
    const players: PlayerVisual[] = []
    for (let slot = 0; slot < o.birds; slot++) players[slot] = { slot, colorIndex: slot, name: `J${slot + 1}`, kind: 'bot', assist: slot === 2 }
    gameView.players = players
    this.display = { ...this.sim.state, birds: this.displayBirds, bySlot: this.displayBySlot } as SimState
    this.refreshDisplay([])
    gameView.sim = this.display
    for (const b of this.displayBirds) gameView.prevBirds[b.slot] = cloneBird(b)
    gameView.alpha = 1
  }

  /** Avance d'un tick (les événements sont émis sur le bus si `emit`). */
  tick(emit: boolean): void {
    for (const b of this.displayBirds) gameView.prevBirds[b.slot] = cloneBird(b)
    const st = this.sim.state
    // Marionnettes : l'oiseau de la sim est replacé sous l'état affiché.
    for (const [slot, p] of this.puppets) {
      const b = st.bySlot[slot]
      if (!b) continue
      b.x = p.x
      b.y = p.y
      b.z = this.puppetZ(p)
      b.heading = p.heading
      b.turnRate = 0
      b.speed = b.z <= RULES.strongMaxAlt ? RULES.speedLow : RULES.speedHigh
      this.inputs[slot] = { dirX: Math.cos(p.heading), dirY: Math.sin(p.heading), dive: b.z <= RULES.strongMaxAlt, divePresses: 0, flapPresses: 0 }
    }
    for (let i = 0; i < this.policies.length; i++) {
      const pol = this.policies[i]
      if (pol) this.inputs[i] = pol(st, i)
    }
    const events = this.sim.step(this.inputs)
    this.puppetTime += this.dt
    const extra: SimEvent[] = []
    this.refreshDisplay(extra)
    if (emit) {
      for (const e of events) if (!this.isPuppetEvent(e)) simEvents.emit(e)
      for (const e of extra) simEvents.emit(e)
    }
  }

  /** Temps réel → ticks (ralentis de la sim respectés). */
  update(dtReal: number): void {
    gameView.realTime += dtReal
    if (this.paused || this.sim.state.over) {
      gameView.alpha = 1
      return
    }
    this.acc += dtReal * (this.sim.state.timeScaleHint || 1)
    let guard = 0
    while (this.acc >= this.dt && guard++ < 8) {
      this.tick(true)
      this.acc -= this.dt
    }
    gameView.alpha = Math.min(1, this.acc / this.dt)
  }

  private isPuppetEvent(e: SimEvent): boolean {
    const slots: number[] = []
    if ('slot' in e) slots.push(e.slot)
    if ('hunter' in e) slots.push(e.hunter, e.target)
    if ('a' in e && 'b' in e) slots.push(e.a, e.b)
    return slots.some(s => this.puppets.has(s))
  }

  private puppetZ(p: PuppetSpec): number {
    switch (p.state) {
      case 'low':
      case 'stun':
      case 'miss':
      case 'locked':
        return RULES.altLow
      case 'glide':
      case 'high':
      case 'perch':
        return p.z
      default:
        return p.z
    }
  }

  private refreshDisplay(ev: SimEvent[]): void {
    const st = this.sim.state
    const D = this.display as { -readonly [K in keyof SimState]: SimState[K] }
    Object.assign(D, st)
    D.birds = this.displayBirds
    D.bySlot = this.displayBySlot
    this.displayBirds.length = 0
    this.displayBySlot.fill(undefined)
    for (const b of st.birds) {
      const d = cloneBird(b)
      const p = this.puppets.get(b.slot)
      if (p) this.applyPuppet(d, p, ev)
      this.displayBirds.push(d)
      this.displayBySlot[d.slot] = d
    }
    // Couronne : imposée par une marionnette « crown » ; absente si tout est marionnette.
    if (this.puppets.size === st.birds.length) D.crownSlot = -1
    for (const p of this.puppets.values()) if (p.state === 'crown') D.crownSlot = p.slot
  }

  /** Impose un état affiché à une marionnette (et produit ses événements). */
  private applyPuppet(b: BirdState, p: PuppetSpec, ev: SimEvent[]): void {
    const t = this.puppetTime
    const cyc = t % p.period
    const prev = (t - this.dt + p.period) % p.period
    const wrapped = cyc < prev
    const at = (s: number) => cyc >= s && prev < s
    b.x = p.x
    b.y = p.y
    b.heading = p.heading
    b.z = this.puppetZ(p)
    b.vx = Math.cos(p.heading) * b.speed
    b.vy = Math.sin(p.heading) * b.speed
    b.vz = 0
    b.turnRate = 0
    b.dive = 'none'
    b.diveTarget = -1
    b.stun = 0
    b.stunKind = 'none'
    b.immune = 0
    b.flap = 0
    b.flapCooldown = 0
    b.hidden = false
    b.lockedBy = -1
    b.lockTarget = -1
    switch (p.state) {
      case 'climb':
        b.vz = RULES.climbRate
        break
      case 'descend':
        b.vz = -RULES.descendRate * 0.8
        break
      case 'bank':
      case 'bankL':
        b.turnRate = RULES.turnLowDegPerS * DEG
        break
      case 'bankR':
        b.turnRate = -RULES.turnLowDegPerS * DEG
        break
      case 'dive':
        b.dive = cyc < RULES.diveWindup ? 'windup' : cyc < 0.9 ? 'guided' : cyc < 1.55 ? 'committed' : 'none'
        b.vz = b.dive === 'guided' || b.dive === 'committed' ? -12 : 0
        b.speed = b.dive === 'none' ? RULES.speedHigh : RULES.diveHSpeed
        b.vy = Math.sin(p.heading) * b.speed
        b.vx = Math.cos(p.heading) * b.speed
        b.diveTarget = b.dive === 'none' ? -1 : p.target ?? -1
        if (at(0.9)) ev.push({ type: 'diveCommit', hunter: b.slot, target: p.target ?? -1 })
        break
      case 'guided':
        b.dive = 'guided'
        b.vz = -12
        b.speed = RULES.diveHSpeed
        break
      case 'windup':
        b.dive = cyc < 0.6 ? 'windup' : 'none'
        break
      case 'stun':
        b.stun = Math.max(0, RULES.stunHit - cyc)
        b.stunKind = b.stun > 0 ? 'hit' : 'none'
        b.immune = b.stun > 0 ? 0 : Math.max(0, RULES.stunHit + RULES.immunityAfterStun - cyc)
        if (wrapped) ev.push({ type: 'diveHit', hunter: -1, target: b.slot, x: b.x, y: b.y, z: b.z + 1, stolenCells: 0, crown: false })
        break
      case 'miss':
        b.stun = Math.max(0, RULES.missStun - cyc)
        b.stunKind = b.stun > 0 ? 'miss' : 'none'
        if (wrapped) ev.push({ type: 'diveMiss', hunter: b.slot, target: -1, dodged: true, x: b.x, y: b.y })
        break
      case 'flap':
        b.flap = Math.max(0, RULES.flapDuration - cyc)
        b.flapCooldown = Math.max(0, Math.min(RULES.flapCooldown, p.period - 0.3) - cyc)
        if (wrapped) ev.push({ type: 'flap', slot: b.slot })
        break
      case 'immune':
        b.immune = 2
        break
      case 'hidden':
        b.hidden = true
        break
      case 'locked':
        b.lockedBy = (b.slot + 3) % 12
        break
      case 'tsk':
        if (at(0.1)) ev.push({ type: 'paleOnStrong', slot: b.slot, x: b.shadow.cx + b.shadow.r * 0.7, y: b.shadow.cy })
        break
      case 'steal':
        if (at(0.1)) ev.push({ type: 'bigSteal', slot: b.slot, frac: 0.04, victim: -1 })
        break
    }
    // Empreinte recalculée pour la position imposée.
    const s = this.sim.state.sun
    const a = Math.min(1, Math.max(0, (b.z - RULES.altLow) / (RULES.altHigh - RULES.altLow)))
    const r = RULES.shadowRadiusLow + (RULES.shadowRadiusHigh - RULES.shadowRadiusLow) * a
    b.shadow.cx = b.x + b.z * s.cotE * s.shadowDirX
    b.shadow.cy = b.y + b.z * s.cotE * s.shadowDirY
    b.shadow.r = r
    b.shadow.rAlong = r * s.stretch
    b.strong = b.z <= RULES.strongMaxAlt
    b.shadow.strong = b.strong
    b.shadow.paints = b.stun <= 0 && !b.hidden
  }
}
