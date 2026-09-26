// Carte de tempo de la manche, exprimée en temps de SOLEIL (temps de simulation) : la musique
// suit la simulation, ralentis compris.
//
// - Du départ (t = 0) à la Grande Ombre : ~84 BPM, 4/4. Le tempo exact est choisi pour qu'un
//   nombre entier de mesures sépare le départ du début de la Grande Ombre : le « Envol » et
//   le coucher du disque sur la Falaise tombent tous deux sur un premier temps.
// - Grande Ombre : mesures à 2/4, le tempo accélère linéairement de 1 Hz (60 BPM, le battement
//   de cœur) à ~2 Hz ; le nombre de temps est entier et pair, donc la nuit tombe sur un premier
//   temps. La dernière seconde, jouée à 0,5× par la simulation, ralentit d'autant la musique.
import { RULES } from '../../../sim/rules.ts'

export type Section = 'noon' | 'afternoon' | 'golden' | 'sunset' | 'greatShadow'

export interface BarInfo {
  bar: number
  section: Section
  /** Première mesure de la section et nombre de mesures de la section. */
  sectionStart: number
  sectionBars: number
  /** Temps par mesure (4 avant la Grande Ombre, 2 pendant). */
  beatsPerBar: number
}

export const BASE_BPM = 84

export class TempoMap {
  readonly T: number
  /** Début de la Grande Ombre (s de soleil). */
  readonly tGS: number
  /** Temps par seconde avant la Grande Ombre. */
  readonly bps0: number
  readonly barsToGS: number
  /** Nombre de temps de la Grande Ombre, cadence initiale et finale (Hz). */
  readonly gsBeats: number
  readonly r0 = 1
  readonly r1: number
  private readonly k: number
  readonly beatGS: number
  /** Premières mesures des sections. */
  readonly starts: Record<Section, number>
  readonly totalBars: number

  constructor(T: number) {
    const scale = T / RULES.roundSunSeconds
    this.T = T
    this.tGS = RULES.greatShadowAt * scale
    this.barsToGS = Math.max(4, Math.round((this.tGS * BASE_BPM) / 60 / 4))
    this.bps0 = (this.barsToGS * 4) / this.tGS
    this.beatGS = this.barsToGS * 4
    const D = T - this.tGS
    this.gsBeats = Math.max(4, 2 * Math.round((1.5 * D) / 2))
    this.r1 = (2 * this.gsBeats) / D - this.r0
    this.k = (this.r1 - this.r0) / D
    const bar = (t: number) => Math.round((t * this.bps0) / 4)
    const a = Math.max(1, bar(RULES.phaseAfternoonAt * scale))
    const g = Math.max(a + 2, bar(RULES.phaseGoldenAt * scale))
    const s = Math.min(this.barsToGS - 2, Math.max(g + 2, bar(RULES.phaseSunsetAt * scale)))
    this.starts = { noon: 0, afternoon: a, golden: g, sunset: s, greatShadow: this.barsToGS }
    this.totalBars = this.barsToGS + this.gsBeats / 2
  }

  /** Position en temps (beats) pour un instant de soleil. Négatif pendant le compte à rebours. */
  beatAt(t: number): number {
    if (t < this.tGS) return t * this.bps0
    const D = this.T - this.tGS
    const tau = t - this.tGS
    if (tau <= D) return this.beatGS + this.r0 * tau + 0.5 * this.k * tau * tau
    return this.beatGS + this.gsBeats + this.r1 * (tau - D)
  }

  /** Instant de soleil d'un temps (inverse de beatAt). */
  timeAtBeat(b: number): number {
    if (b < this.beatGS) return b / this.bps0
    const x = b - this.beatGS
    if (x <= this.gsBeats) return this.tGS + (-this.r0 + Math.sqrt(this.r0 * this.r0 + 2 * this.k * x)) / this.k
    return this.T + (x - this.gsBeats) / this.r1
  }

  /** Temps par seconde (de soleil) à l'instant t. */
  rateAt(t: number): number {
    if (t < this.tGS) return this.bps0
    return Math.min(this.r1, this.r0 + this.k * (t - this.tGS))
  }

  /** Mesure d'un temps, et temps de début d'une mesure. */
  barOfBeat(b: number): number {
    return b < this.beatGS ? Math.floor(b / 4) : this.barsToGS + Math.floor((b - this.beatGS) / 2)
  }

  beatOfBar(bar: number): number {
    return bar <= this.barsToGS ? bar * 4 : this.beatGS + (bar - this.barsToGS) * 2
  }

  info(bar: number): BarInfo {
    const order: Section[] = ['noon', 'afternoon', 'golden', 'sunset', 'greatShadow']
    let sec: Section = 'noon'
    for (const s of order) if (bar >= this.starts[s]) sec = s
    const i = order.indexOf(sec)
    const next = i < order.length - 1 ? this.starts[order[i + 1]!] : this.totalBars
    return {
      bar,
      section: sec,
      sectionStart: this.starts[sec],
      sectionBars: next - this.starts[sec],
      beatsPerBar: bar >= this.barsToGS ? 2 : 4,
    }
  }
}
