// Perception retardée : ce que l'écran montrait il y a « temps de réaction » secondes.
//
// L'historique enregistre, une fois par tick et pour tous les bots d'une même
// simulation, uniquement ce qu'un joueur voit à l'écran : position, altitude (taille
// et densité de l'ombre), cap et inclinaison (taux de virage), vitesse (qui découle de
// l'altitude), pose de piqué, décrochage (vrille), immunité (plumes hérissées), cachette
// (oiseau assombri), couronne, coup d'aile prêt (bouts d'ailes blancs), aide au vol
// (icône plume), chevron au-dessus de lui. Rien d'autre : ni entrées, ni intentions.

import type { DivePhase, SimState } from '../sim/types.ts'
import { RULES } from '../sim/rules.ts'

/** Profondeur de l'historique (ticks) : couvre la réaction la plus lente (550 ms) avec marge. */
export const HISTORY_TICKS = 32
const SLOTS = 12
const F = 11
/** Écart (ticks) entre les deux positions dont on déduit le mouvement perçu. */
const MOTION_TICKS = 3

// index des champs
const PRESENT = 0
const X = 1
const Y = 2
const Z = 3
const HEADING = 4
const SPEED = 5
const TURN = 6
const DIVE = 7
const DIVE_TARGET = 8
const FLAGS = 9
const LOCKED_BY = 10

const STUNNED = 1
const IMMUNE = 2
const HIDDEN = 4
const IN_NIGHT = 8
const CROWN = 16
const FLAP_READY = 32
const ASSIST = 64
const STRONG = 128

const DIVE_CODES: readonly DivePhase[] = ['none', 'windup', 'guided', 'committed']

/** Un oiseau tel qu'il était vu (objet réutilisé par l'appelant). */
export interface Seen {
  present: boolean
  slot: number
  x: number
  y: number
  z: number
  heading: number
  speed: number
  turnRate: number
  /** Mouvement perçu (différence de deux positions vues), m/s. */
  vx: number
  vy: number
  dive: DivePhase
  diveTarget: number
  stunned: boolean
  immune: boolean
  /** Caché sous une tour. */
  hidden: boolean
  inNight: boolean
  crown: boolean
  flapReady: boolean
  assist: boolean
  strong: boolean
  /** Chasseur dont le chevron est affiché au-dessus de lui, −1 sinon. */
  lockedBy: number
}

export function makeSeen(): Seen {
  return {
    present: false,
    slot: -1,
    x: 0,
    y: 0,
    z: 0,
    heading: 0,
    speed: 0,
    turnRate: 0,
    vx: 0,
    vy: 0,
    dive: 'none',
    diveTarget: -1,
    stunned: false,
    immune: false,
    hidden: false,
    inNight: false,
    crown: false,
    flapReady: false,
    assist: false,
    strong: false,
    lockedBy: -1,
  }
}

/** Vrai si l'oiseau vu peut être ciblé (verrouillage, piqué). */
export function isTargetableSeen(s: Seen): boolean {
  return s.present && !s.stunned && !s.immune && !s.hidden && !s.inNight && s.dive === 'none'
}

export class ObservationHistory {
  private readonly buf = new Float32Array(HISTORY_TICKS * SLOTS * F)
  private readonly ticks = new Int32Array(HISTORY_TICKS).fill(-1)
  private head = -1
  private count = 0

  /** Enregistre l'état visible de tous les oiseaux (une fois par tick). */
  record(state: SimState): void {
    this.head = (this.head + 1) % HISTORY_TICKS
    this.ticks[this.head] = state.tick
    if (this.count < HISTORY_TICKS) this.count++
    const base = this.head * SLOTS * F
    this.buf.fill(0, base, base + SLOTS * F)
    for (const b of state.birds) {
      const o = base + b.slot * F
      const buf = this.buf
      buf[o + PRESENT] = 1
      buf[o + X] = b.x
      buf[o + Y] = b.y
      buf[o + Z] = b.z
      buf[o + HEADING] = b.heading
      buf[o + SPEED] = b.speed
      buf[o + TURN] = b.turnRate
      buf[o + DIVE] = DIVE_CODES.indexOf(b.dive)
      buf[o + DIVE_TARGET] = b.diveTarget
      buf[o + LOCKED_BY] = b.lockedBy
      let f = 0
      if (b.stun > 0) f |= STUNNED
      if (b.immune > 0) f |= IMMUNE
      if (b.hidden) f |= HIDDEN
      if (b.inNight) f |= IN_NIGHT
      if (b.crown) f |= CROWN
      if (b.flapCooldown <= 0) f |= FLAP_READY
      if (b.assist) f |= ASSIST
      if (b.strong) f |= STRONG
      buf[o + FLAGS] = f
    }
  }

  /** Vide l'historique (reprise, remise à zéro de la démo). */
  clear(): void {
    this.ticks.fill(-1)
    this.head = -1
    this.count = 0
  }

  /**
   * L'oiseau `slot` tel qu'il était vu il y a `delayTicks` ticks (au plus loin :
   * l'enregistrement le plus ancien). Retourne faux s'il n'était pas là.
   */
  see(slot: number, delayTicks: number, out: Seen): boolean {
    out.present = false
    out.slot = slot
    if (this.count === 0 || slot < 0 || slot >= SLOTS) return false
    const d = Math.max(0, Math.min(this.count - 1, delayTicks | 0))
    const idx = (this.head - d + HISTORY_TICKS) % HISTORY_TICKS
    const o = (idx * SLOTS + slot) * F
    const buf = this.buf
    if (buf[o + PRESENT] !== 1) return false
    out.present = true
    out.x = buf[o + X]!
    out.y = buf[o + Y]!
    out.z = buf[o + Z]!
    out.heading = buf[o + HEADING]!
    out.speed = buf[o + SPEED]!
    out.turnRate = buf[o + TURN]!
    // mouvement perçu : ce que l'œil déduit de deux positions successives
    const d2 = Math.min(this.count - 1, d + MOTION_TICKS)
    const o2 = ((((this.head - d2 + HISTORY_TICKS) % HISTORY_TICKS) * SLOTS + slot) * F) | 0
    if (d2 > d && buf[o2 + PRESENT] === 1) {
      const k = RULES.tickHz / (d2 - d)
      out.vx = (out.x - buf[o2 + X]!) * k
      out.vy = (out.y - buf[o2 + Y]!) * k
    } else {
      out.vx = Math.cos(out.heading) * out.speed
      out.vy = Math.sin(out.heading) * out.speed
    }
    out.dive = DIVE_CODES[buf[o + DIVE]!] ?? 'none'
    out.diveTarget = buf[o + DIVE_TARGET]!
    out.lockedBy = buf[o + LOCKED_BY]!
    const f = buf[o + FLAGS]!
    out.stunned = (f & STUNNED) !== 0
    out.immune = (f & IMMUNE) !== 0
    out.hidden = (f & HIDDEN) !== 0
    out.inNight = (f & IN_NIGHT) !== 0
    out.crown = (f & CROWN) !== 0
    out.flapReady = (f & FLAP_READY) !== 0
    out.assist = (f & ASSIST) !== 0
    out.strong = (f & STRONG) !== 0
    return true
  }
}
