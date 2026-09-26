// Fabrique d'états de simulation factices pour les tests du directeur (narrateur, indications)
// et la page de dev. Aucune dépendance à la vraie simulation : seuls les champs lus par
// src/director sont réalistes.
import { RULES } from '../sim/rules.ts'
import type { BirdRoundStats, BirdState, RoundPhase, SimState } from '../sim/types.ts'

export function fakeBird(slot: number, over: Partial<BirdState> = {}): BirdState {
  return {
    slot,
    x: slot * 20,
    y: 0,
    z: RULES.altHigh,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    turnRate: 0,
    speed: RULES.speedHigh,
    targetLow: false,
    strong: false,
    shadow: { cx: slot * 20, cy: 0, r: RULES.shadowRadiusHigh, rAlong: RULES.shadowRadiusHigh, strong: false, paints: true },
    dive: 'none',
    diveTarget: -1,
    diveTime: 0,
    lockTarget: -1,
    lockedBy: -1,
    stun: 0,
    stunKind: 'none',
    immune: 0,
    flap: 0,
    flapCooldown: 0,
    diveCooldown: 0,
    hidden: false,
    inNight: false,
    inStorm: false,
    crown: false,
    assist: false,
    towerSlide: 0,
    ...over,
  }
}

function emptyStats(): BirdRoundStats {
  return {
    hits: 0,
    gotHit: 0,
    dodges: 0,
    misses: 0,
    divesStarted: 0,
    stolenCells: 0,
    trailStolenCells: 0,
    maxGain3s: 0,
    timeLow: 0,
    timeHigh: 0,
    hiddenTime: 0,
    stormTime: 0,
    cellsAt60: 0,
    frozenOwnAtNight: 0,
    gainGreatShadow: 0,
    rankAt80: 0,
    rankAt90: 0,
    rankAt98: 0,
    rankAtNight: 0,
  }
}

export interface FakeSimOptions {
  birds: number
  /** Durée du soleil T (s). */
  T?: number
  /** Taille de la grille (cellules). Par défaut 64 × 44, arène = toutes les cellules. */
  cols?: number
  rows?: number
  seed?: number
}

/** Phase de manche correspondant à un temps de soleil (instants GDD §19.2 × T/110). */
export function phaseAt(t: number, T: number): RoundPhase {
  const k = T / RULES.roundSunSeconds
  if (t < 0) return 'countdown'
  if (t < RULES.phaseAfternoonAt * k) return 'noon'
  if (t < RULES.phaseGoldenAt * k) return 'afternoon'
  if (t < RULES.phaseSunsetAt * k) return 'golden'
  if (t < RULES.greatShadowAt * k) return 'sunset'
  if (t < T) return 'greatShadow'
  if (t < T + RULES.nightHoldSeconds) return 'night'
  return 'over'
}

/**
 * État de manche factice et mutable. `setSunT` fait avancer le temps (state.time = t + compte à
 * rebours), `setCells` fixe le territoire d'un oiseau, `bird(slot)` donne l'oiseau à modifier.
 */
export class FakeSim {
  readonly state: SimState

  constructor(opts: FakeSimOptions) {
    const T = opts.T ?? RULES.roundSunSeconds
    const cols = opts.cols ?? 64
    const rows = opts.rows ?? 44
    const n = cols * rows
    const birds = Array.from({ length: opts.birds }, (_, i) => fakeBird(i))
    const bySlot: (BirdState | undefined)[] = new Array(12).fill(undefined)
    for (const b of birds) bySlot[b.slot] = b
    this.state = {
      config: { mode: 'round', seed: opts.seed ?? 1, mapId: 'parasols', birds: birds.map(b => ({ slot: b.slot, assist: false })), sunSeconds: T, countdown: true },
      tick: 0,
      time: 0,
      sun: {
        t: -RULES.countdownSeconds,
        u: 0,
        T,
        elevation: 0,
        azimuth: 0,
        shadowDirX: 1,
        shadowDirY: 0,
        cotE: 0,
        stretch: 1,
        paletteElevDeg: 88,
        phase: 'countdown',
      },
      arena: { a: 165, b: 114, stormFrom: RULES.stormSoftFrom },
      towers: [],
      birds,
      bySlot,
      grid: {
        cols,
        rows,
        x0: -165,
        y0: -114,
        cellW: 330 / cols,
        cellH: 228 / rows,
        owner: new Uint8Array(n),
        level: new Uint8Array(n),
        prevOwner: new Uint8Array(n),
        changedAt: new Float32Array(n),
        frozen: new Uint8Array(n),
        inArena: new Uint8Array(n).fill(1),
        arenaCells: n,
        counts: new Int32Array(13),
        version: 0,
      },
      night: { active: false, dirX: 1, dirY: 0, s: -1e9, jag: new Float32Array(8), jagSpan: 200 },
      crownSlot: -1,
      timeScaleHint: 1,
      stats: birds.map(() => emptyStats()),
      over: false,
    }
  }

  bird(slot: number): BirdState {
    const b = this.state.bySlot[slot]
    if (!b) throw new Error(`pas d'oiseau au slot ${slot}`)
    return b
  }

  /** Avance au temps de soleil t (s) ; le compte à rebours dure RULES.countdownSeconds. */
  setSunT(t: number): void {
    const s = this.state
    s.sun.t = t
    s.sun.u = Math.min(1, Math.max(0, t / s.sun.T))
    s.sun.phase = phaseAt(t, s.sun.T)
    s.time = t + RULES.countdownSeconds
    s.tick = Math.round(s.time * RULES.tickHz)
    s.over = s.sun.phase === 'over'
  }

  /** Territoire d'un oiseau, en cellules (les compteurs seuls ; la grille n'est pas peinte). */
  setCells(slot: number, cells: number): void {
    const c = this.state.grid.counts
    c[slot + 1] = cells
    let used = 0
    for (let i = 1; i < c.length; i++) used += c[i]
    c[0] = Math.max(0, this.state.grid.arenaCells - used)
  }

  /** Territoire en fraction de l'arène. */
  setShare(slot: number, share: number): void {
    this.setCells(slot, Math.round(share * this.state.grid.arenaCells))
  }

  /** Peint réellement un rectangle de cellules (pour les tests qui lisent la grille). */
  paint(slot: number, x0: number, y0: number, x1: number, y1: number, level: number): void {
    const g = this.state.grid
    for (let row = 0; row < g.rows; row++) {
      for (let col = 0; col < g.cols; col++) {
        const x = g.x0 + (col + 0.5) * g.cellW
        const y = g.y0 + (row + 0.5) * g.cellH
        if (x >= x0 && x <= x1 && y >= y0 && y <= y1) {
          const i = row * g.cols + col
          g.owner[i] = slot + 1
          g.level[i] = level
        }
      }
    }
    g.version++
  }
}
