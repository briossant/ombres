// Musique de manche : relie la partition générative à la simulation. Chargé à la demande
// (import dynamique), avec ses échantillons, pendant le lobby.
import { RULES } from '../../../sim/rules.ts'
import type { SimEvent, SimState } from '../../../sim/types.ts'
import type { GameView } from '../../view.ts'
import type { AudioEngine } from '../engine.ts'
import { MusicClock } from './clock.ts'
import { Instruments, LAYERS, SCORE_ASSETS, type LayerName } from './instruments.ts'
import { Score } from './score.ts'
import { TempoMap } from './tempo.ts'

/** Anticipation de la programmation (s réelles). */
const LOOKAHEAD = 0.14

export { LAYERS, SCORE_ASSETS, type LayerName }

export class RoundMusic {
  readonly clock = new MusicClock()
  private ins: Instruments | null = null
  private score: Score | null = null
  private map: TempoMap | null = null
  private sim: SimState | null = null
  private lastT = -Infinity
  private nextStep = NaN
  private cutDone = false
  private trims = new Map<LayerName, number>()

  constructor(readonly engine: AudioEngine) {}

  /** Charge les échantillons et construit les instruments (une fois). */
  async prepare(): Promise<void> {
    if (this.ins) return
    await this.engine.assets.preload(SCORE_ASSETS)
    if (this.ins) return
    this.ins = new Instruments(this.engine, 60 / 84)
    for (const [name, db] of this.trims) this.ins.setTrim(name, db)
  }

  get ready(): boolean {
    return this.ins !== null
  }

  get tempo(): TempoMap | null {
    return this.map
  }

  /** À chaque image : suit la simulation, programme les doubles croches à venir. */
  update(view: GameView): void {
    const ins = this.ins
    const sim = view.sim
    if (!ins || !sim || sim.config.mode !== 'round') return
    const sun = sim.sun
    // nouvelle manche : autre objet d'état, ou temps qui recule
    if (sim !== this.sim || sun.t < this.lastT - 1 || !this.map || this.map.T !== sun.T) this.startRound(sim)
    this.lastT = sun.t
    const e = this.engine
    const now = e.now
    // temps de soleil « affiché » (interpolé entre deux ticks, comme le rendu)
    const simNow = sun.t - (1 - view.alpha) / RULES.tickHz
    this.clock.sync(simNow, view.timeScale, now)
    const map = this.map!
    const score = this.score!
    if (sun.phase === 'night' || sun.phase === 'over') {
      this.cut(now)
      return
    }
    if (simNow < 0) score.countdown(this.clock.toAudio(Math.max(simNow, -RULES.countdownSeconds)), this.clock.toAudio(0))
    const rate = this.clock.rate
    if (rate <= 0) return
    const horizon = this.clock.simT + LOOKAHEAD * rate
    // premier appel, ou saut en avant (reprise, page de dev) : on repart du pas courant sans rattrapage
    if (Number.isNaN(this.nextStep) || map.timeAtBeat(this.nextStep / 4) < this.clock.simT - 0.5)
      this.nextStep = Math.max(0, Math.ceil(map.beatAt(Math.max(this.clock.simT, 0)) * 4 - 1e-6))
    for (let guard = 0; guard < 64; guard++) {
      const tS = map.timeAtBeat(this.nextStep / 4)
      if (tS > horizon) break
      if (tS >= map.T) break
      const time = Math.max(this.clock.toAudio(tS), now + 0.003)
      score.step({ step: this.nextStep, simT: tS, time, sixteenth: 1 / (4 * map.rateAt(tS) * Math.max(rate, 0.05)) })
      this.nextStep++
    }
    // coupure programmée exactement à la nuit
    if (!this.cutDone && map.T <= horizon) this.cut(this.clock.toAudio(map.T))
  }

  /** Événements de simulation : ponctuations calées sur la grille. */
  onEvent(e: SimEvent, view: GameView): void {
    const score = this.score
    const map = this.map
    if (!score || !map || view.sim?.config.mode !== 'round') return
    if (e.type === 'night' || e.type === 'over') {
      this.cut(this.engine.now)
      return
    }
    const now = this.engine.now
    const rate = Math.max(this.clock.rate, 0.05)
    const tNext = map.timeAtBeat(this.nextStep / 4)
    const six = 1 / (4 * map.rateAt(tNext) * rate)
    score.event(e, now, Math.max(this.clock.toAudio(tNext), now + 0.01), six, slot => view.players[slot]?.colorIndex)
  }

  /** Arrête la manche en cours (changement d'écran). */
  stop(fade = 0.8): void {
    if (!this.score || this.cutDone) return
    this.cutDone = true
    const t = this.engine.now
    const g = this.ins!.out.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + fade)
    this.score.cut(t + fade)
    // (la réverbe garde sa queue naturelle : seul le son direct est fondu)
    this.ins!.detachAfter(fade + 6)
  }

  /** Mixage par couche (page de dev) : dB ajoutés au mixage par défaut, −Infinity = muet. */
  setLayerDb(name: LayerName, db: number): void {
    this.trims.set(name, db)
    this.ins?.setTrim(name, db)
  }

  private startRound(sim: SimState): void {
    this.sim = sim
    this.map = new TempoMap(sim.sun.T)
    this.score = new Score(this.ins!, this.map, sim.config.seed)
    this.nextStep = NaN
    this.cutDone = false
    this.clock.reset()
    this.ins!.reset(this.engine.now)
    this.ins!.attach()
  }

  private cut(when: number): void {
    if (this.cutDone) return
    this.cutDone = true
    this.score?.cut(when)
    // queues de réverbe et d'écho, puis plus aucun calcul jusqu'à la prochaine manche
    this.ins?.detachAfter(Math.max(0, when - this.engine.now) + 6)
  }
}
