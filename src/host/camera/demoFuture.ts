// Avenir de la démo du titre (polish vague 2, correcteur title). La démo est une boucle fermée :
// une sim pure et déterministe pilotée par des bots à graine (aucune entrée humaine). Une JUMELLE
// (même configuration, bots neufs aux mêmes graines, même normalisation des entrées) tourne donc
// quelques secondes en avance et donne la trajectoire EXACTE des oiseaux : la cinématique valide
// chaque prise sur sa durée entière avant de couper dessus (cine.ts). Vérifié : identique au tick
// près sur 1 250 ticks, pour les 4 cartes, la jumelle en avance de 150 ticks.
//
// Le runner l'alimente (3 lignes) : prebuild() quand il construit une démo (la démo suivante est
// préparée pendant les temps morts : sa jumelle prend alors son avance par tranches, au repos du
// navigateur), begin() quand la démo passe à l'écran, follow() après chaque tick de la démo. Chaque
// tick de la vraie sim est comparé à celui de la jumelle ; au moindre écart, l'avenir est déclaré
// faux (la caméra retombe sur l'extrapolation).
import type { Bot } from '../../bots/index.ts'
import { InputRouter, type LocalInput } from '../../input/router.ts'
import { RULES } from '../../sim/rules.ts'
import { createSimulation } from '../../sim/simulation.ts'
import type { SimEvent, SimState, Simulation } from '../../sim/types.ts'
import { wrapAngle } from './math.ts'
import type { BirdSet } from './cine.ts'

/** Avance visée de la jumelle (ticks) : la plus longue prise du titre dure 8 s. */
const AHEAD = 8 * RULES.tickHz
/** Avance prise d'emblée quand la jumelle n'a pas été préparée (ticks, ~10 ms) : 0,7 s d'avenir sûr. */
const HEAD_START = 20
/** Ticks de rattrapage par tick de la démo tant que l'avance n'est pas atteinte (l'horizon croît de 2 s par seconde). */
const CATCHUP = 2
/** Préparation au repos : ticks au plus par tranche (~0,5 ms chacun). */
const IDLE_CHUNK = 12
/** Ticks par passage quand le repos n'arrive pas (appel par délai limite). */
const IDLE_TIMEOUT_CHUNK = 4
const RING = AHEAD + 8
const SLOTS = 12
/** Champs par oiseau : x, y, z, cap, vx, vy, vz, ombre cx, cy, piqué, sonné, présent. */
const F = 12

/** Une jumelle : sa sim, ses bots (dans le routeur), l'anneau des états de ses oiseaux par tick. */
class Twin {
  readonly sim: Simulation
  private readonly router: InputRouter
  private evs: SimEvent[] = []
  /** Dernier tick calculé (0 = état initial). */
  head = 0
  readonly ring = new Float32Array(RING * SLOTS * F)

  constructor(main: SimState, bots: readonly Bot[]) {
    this.sim = createSimulation(main.config)
    // l'entrée clavier n'est jamais lue (sources « bot » seulement)
    this.router = new InputRouter(null as unknown as LocalInput)
    this.router.reset()
    for (const b of bots) this.router.set(b.slot, { kind: 'bot', bot: b })
    this.record(0)
  }

  step(): void {
    this.evs = this.sim.step(this.router.collect(this.sim.state, this.evs))
    this.head++
    this.record(this.head)
  }

  private record(tick: number): void {
    const st = this.sim.state
    const r = this.ring
    const o = (tick % RING) * SLOTS * F
    for (let s = 0; s < SLOTS; s++) r[o + s * F + 11] = 0
    for (const b of st.birds) {
      const k = o + b.slot * F
      r[k] = b.x
      r[k + 1] = b.y
      r[k + 2] = b.z
      r[k + 3] = b.heading
      r[k + 4] = b.vx
      r[k + 5] = b.vy
      r[k + 6] = b.vz
      r[k + 7] = b.shadow.cx
      r[k + 8] = b.shadow.cy
      r[k + 9] = b.dive !== 'none' ? 1 : 0
      r[k + 10] = b.stun > 0 ? 1 : 0
      r[k + 11] = 1
    }
  }
}

export class DemoFuture {
  /** Jumelles construites, par état de la vraie démo (la démo en cours et la suivante, préparée). */
  private readonly twins = new WeakMap<SimState, Twin>()
  private main: SimState | null = null
  private twin: Twin | null = null
  /** Tick courant de la vraie démo. */
  private base = 0
  /** La jumelle suit la vraie démo (aucun écart constaté). */
  valid = false
  /** Dernière démo construite pas encore à l'écran (la suivante) : le titre prépare sa première prise. */
  upcoming: SimState | null = null

  /**
   * Démo construite (pas encore à l'écran) : sa jumelle, avec ses propres bots (mêmes graines) ; elle
   * prend son avance par tranches quand le navigateur est au repos.
   */
  prebuild(main: SimState, bots: readonly Bot[]): void {
    const tw = new Twin(main, bots)
    this.twins.set(main, tw)
    this.upcoming = main
    if (typeof requestIdleCallback !== 'function') return
    const chunk = (d: IdleDeadline) => {
      if (this.twins.get(main) !== tw) return
      // appel par délai limite (navigateur jamais au repos) : timeRemaining() vaut 0, on avance quand
      // même de quelques ticks (~2 ms), sinon begin() rattrapait HEAD_START d'un coup à la bascule
      // (verify2-eyes, signalé par tech : 16 à 36 ms sur machine saturée).
      let n = d.didTimeout ? IDLE_TIMEOUT_CHUNK : IDLE_CHUNK
      while (n-- > 0 && tw.head < AHEAD && (this.main !== main || tw.head - this.base < AHEAD) && (d.didTimeout || d.timeRemaining() > 1)) tw.step()
      if (tw.head < AHEAD && this.main !== main) requestIdleCallback(chunk, { timeout: 2000 })
    }
    requestIdleCallback(chunk, { timeout: 2000 })
  }

  /** Avance d'emblée la jumelle préparée pour `main` (bancs headless : pas de repos du navigateur). */
  warm(main: SimState, ticks = AHEAD): void {
    const tw = this.twins.get(main)
    while (tw && tw.head < ticks) tw.step()
  }

  /** La démo passe à l'écran (tick 0) : sa jumelle (préparée, sinon construite maintenant avec `bots`). */
  begin(main: SimState, bots?: readonly Bot[]): void {
    let tw = this.twins.get(main)
    if (!tw) {
      if (!bots) return this.end()
      tw = new Twin(main, bots)
      this.twins.set(main, tw)
    }
    this.main = main
    this.twin = tw
    if (this.upcoming === main) this.upcoming = null
    this.base = 0
    this.valid = true
    while (tw.head < HEAD_START) tw.step()
  }

  /** Fin de la démo (salon, manche) : plus d'avenir. */
  end(): void {
    this.main = null
    this.twin = null
    this.valid = false
  }

  /** Après chaque tick de la vraie démo : vérifie l'accord, puis avance la jumelle. */
  follow(main: SimState): void {
    const tw = this.twin
    if (main !== this.main || !tw) return
    this.base++
    if (!this.valid) return
    if (tw.head < this.base) tw.step()
    const o = (this.base % RING) * SLOTS * F
    const r = tw.ring
    for (const b of main.birds) {
      const k = o + b.slot * F
      if (r[k + 11] !== 1 || Math.abs(r[k]! - b.x) > 0.01 || Math.abs(r[k + 1]! - b.y) > 0.01 || Math.abs(r[k + 2]! - b.z) > 0.01) {
        this.valid = false
        return
      }
    }
    let n = tw.head - this.base < AHEAD ? 1 + CATCHUP : 1
    while (n-- > 0 && tw.head - this.base < AHEAD) tw.step()
  }

  /** Avenir exact disponible (s) depuis l'image présente (`alpha` : interpolation du rendu). 0 si aucun. */
  horizon(sim: SimState, alpha: number): number {
    if (!this.valid || sim !== this.main || !this.twin) return 0
    return Math.max(0, (this.twin.head - (this.base - 1 + alpha)) / RULES.tickHz)
  }

  /** Avenir connu (s) d'une démo pas encore à l'écran (depuis son tick 0). */
  upcomingHorizon(main: SimState): number {
    const tw = main === this.main ? null : this.twins.get(main)
    return tw ? tw.head / RULES.tickHz : 0
  }

  /**
   * Oiseaux d'une démo pas encore à l'écran, `time` s après son début (tick 0) : la première prise
   * du rebouclage se choisit avant la coupe. false sans jumelle ou au-delà de son avance.
   */
  birdsAtStart(main: SimState, time: number, out: BirdSet): boolean {
    const tw = main === this.main ? null : this.twins.get(main)
    if (!tw || time * RULES.tickHz > tw.head) return false
    this.fill(tw, main, Math.max(0, time * RULES.tickHz), 0, out)
    return true
  }

  /**
   * Oiseaux dans `ahead` s de l'image présente (interpolés entre deux ticks de la jumelle ; au-delà de
   * l'horizon, extrapolés depuis son dernier tick). false si aucun avenir n'est disponible.
   */
  birdsAt(sim: SimState, alpha: number, ahead: number, out: BirdSet): boolean {
    const h = this.horizon(sim, alpha)
    const tw = this.twin
    if (h <= 0 || !tw) return false
    this.fill(tw, sim, Math.min(tw.head, this.base - 1 + alpha + Math.min(ahead, h) * RULES.tickHz), Math.max(0, ahead - h), out)
    return true
  }

  /** Oiseaux de la jumelle au tick (fractionnaire) `tf`, extrapolés de `extra` s. */
  private fill(tw: Twin, sim: SimState, tf: number, extra: number, out: BirdSet): void {
    const i0 = Math.max(0, Math.floor(tf))
    const i1 = Math.min(tw.head, i0 + 1)
    const f = tf - i0
    const r = tw.ring
    const o0 = (i0 % RING) * SLOTS * F
    const o1 = (i1 % RING) * SLOTS * F
    const A = sim.arena.a
    const B = sim.arena.b
    out.n = 0
    for (let s = 0; s < SLOTS; s++) {
      const k0 = o0 + s * F
      const k1 = o1 + s * F
      if (r[k0 + 11] !== 1 || out.n >= out.a.length) continue
      const g = r[k1 + 11] === 1 ? f : 0
      const b = out.a[out.n++]!
      b.slot = s
      b.vx = r[k0 + 4]! + (r[k1 + 4]! - r[k0 + 4]!) * g
      b.vy = r[k0 + 5]! + (r[k1 + 5]! - r[k0 + 5]!) * g
      b.vz = r[k0 + 6]! + (r[k1 + 6]! - r[k0 + 6]!) * g
      let x = r[k0]! + (r[k1]! - r[k0]!) * g + b.vx * extra
      let y = r[k0 + 1]! + (r[k1 + 1]! - r[k0 + 1]!) * g + b.vy * extra
      if (extra > 0) {
        const rho = Math.hypot(x / A, y / B)
        if (rho > 0.96) {
          x *= 0.96 / rho
          y *= 0.96 / rho
        }
      }
      b.x = x
      b.y = y
      b.z = Math.min(40, Math.max(1, r[k0 + 2]! + (r[k1 + 2]! - r[k0 + 2]!) * g + b.vz * extra))
      b.heading = r[k0 + 3]! + wrapAngle(r[k1 + 3]! - r[k0 + 3]!) * g
      b.scx = r[k0 + 7]! + (r[k1 + 7]! - r[k0 + 7]!) * g + b.vx * extra
      b.scy = r[k0 + 8]! + (r[k1 + 8]! - r[k0 + 8]!) * g + b.vy * extra
      b.dive = r[k0 + 9] === 1
      b.stun = r[k0 + 10] === 1
    }
  }
}

/** Avenir de la démo en cours (un seul écran titre). */
export const demoFuture = new DemoFuture()
