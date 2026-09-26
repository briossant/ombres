// Partition générative de la manche. Tonalité : la mineur (mélodies en pentatonique, harmonies
// modales : lydien sur le VIe degré pour flotter, phrygien sur la pédale de la pour la tension).
// ~84 BPM ; tout est programmé en doubles croches sur la carte de tempo (temps de soleil).
//
//   Midi         bourdon (tanpura en la) + nappe Am9 ↔ Fmaj7♯11 + cloches de verre éparses
//   Après-midi   + mélodie au tongue drum (motifs variés, questions-réponses), basse tenue
//   Heure dorée  + percussions (tambour sur cadre, tom, shaker, bois), oud en ostinato 3-3-2,
//                complainte au duduk ; cadence VI–VII–i, la nappe s'ouvre
//   Couchant     + séquenceur « cordes » en doubles croches, cordes tenues, harmonie qui se tend
//                (Dm9 → Em11 → Fmaj7♯11 → E7sus4♭9) ; souffle inversé vers la Grande Ombre
//   Grande Ombre « braam » au premier temps, 2/4, pédale de la avec Am ↔ B♭/A, tutti, cœur qui
//                accélère de 1 à 2 Hz, montée de bruit jusqu'à la nuit
//   Nuit         coupure nette (le gong est joué par les bruitages 1,5 s après)
import type { SimEvent } from '../../../sim/types.ts'
import { clamp, dbToGain, lerp, Rng } from '../util.ts'
import type { Instruments } from './instruments.ts'
import type { Section, TempoMap } from './tempo.ts'

interface Chord {
  /** Voicing de la nappe (MIDI). */
  pad: number[]
  /** Fondamentale grave (MIDI, octave 2). */
  root: number
  /** Classes de hauteur des notes de l'accord (pour poser la mélodie). */
  tones: number[]
}

const CH = {
  Am9: { pad: [57, 60, 64, 67, 71], root: 45, tones: [9, 0, 4, 7, 11] },
  Fmaj7s11: { pad: [53, 57, 60, 64, 71], root: 41, tones: [5, 9, 0, 4, 11] },
  Dm9: { pad: [50, 53, 57, 60, 64], root: 38, tones: [2, 5, 9, 0, 4] },
  Em11: { pad: [52, 57, 59, 62, 67], root: 40, tones: [4, 7, 11, 2, 9] },
  Fmaj9: { pad: [53, 57, 60, 64, 67], root: 41, tones: [5, 9, 0, 4, 7] },
  G6: { pad: [55, 59, 62, 64, 69], root: 43, tones: [7, 11, 2, 4, 9] },
  E7sus4b9: { pad: [52, 57, 59, 62, 65], root: 40, tones: [4, 9, 11, 2, 5] },
  Am: { pad: [57, 60, 64, 69], root: 45, tones: [9, 0, 4] },
  BbA: { pad: [58, 62, 65, 69], root: 45, tones: [10, 2, 5, 9] },
} satisfies Record<string, Chord>
type ChordName = keyof typeof CH

/** Progressions par section (une entrée par mesure), deux variantes tirées par manche. */
const PROG: Record<'noon' | 'afternoon' | 'golden', ChordName[][]> = {
  noon: [
    ['Am9', 'Am9', 'Fmaj7s11', 'Fmaj7s11'],
    ['Am9', 'Am9', 'Dm9', 'Dm9'],
  ],
  afternoon: [
    ['Am9', 'Am9', 'Fmaj7s11', 'Fmaj7s11', 'Dm9', 'Dm9', 'Em11', 'Em11'],
    ['Am9', 'Am9', 'Dm9', 'Dm9', 'Fmaj7s11', 'Fmaj7s11', 'Em11', 'Em11'],
  ],
  golden: [
    ['Fmaj9', 'G6', 'Am9', 'Em11'],
    ['Fmaj9', 'G6', 'Am9', 'Am9'],
  ],
}
const SUNSET_CYCLE: ChordName[] = ['Dm9', 'Em11', 'Fmaj7s11']

/** La mineur pentatonique, de la3 à la5 (registre du tongue drum). */
const PENT = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81]
/** Cloches de verre : aigu de la gamme. */
const GLASS = [81, 84, 86, 88, 91]
/** Notes des couleurs de joueurs (mêmes que PLAYER_NOTES de sfx.ts), en MIDI. */
const PLAYER_NOTE_MIDI = [57, 60, 62, 64, 67, 69, 72, 74, 76, 79, 81, 84]
/** Secondes comptées à la fin de la manche (événements lastSeconds 5..1 de la simulation). */
const LAST_SECONDS = 5
/**
 * Relief de la partition à midi et l'après-midi (dB, son direct) : la nappe, le bourdon et les
 * cloches passaient 5 à 9 LU sous les bruitages ; le relief retombe pendant les deux premières
 * mesures de l'heure dorée, quand percussions, oud et duduk entrent.
 */
const EARLY_LIFT_DB = 4

/** Rythmes de motifs (doubles croches : [début, durée]) et contours (degrés relatifs au centre). */
const RHYTHMS: [number, number][][] = [
  [[0, 4], [4, 2], [6, 2], [8, 8]],
  [[0, 2], [2, 2], [4, 4], [10, 6]],
  [[0, 6], [6, 2], [8, 4], [12, 4]],
  [[2, 2], [4, 2], [6, 6], [12, 4]],
  [[0, 3], [3, 3], [6, 2], [8, 8]],
  [[0, 4], [6, 2], [8, 2], [10, 6]],
]
const CONTOURS: number[][] = [
  [0, -1, -2, -4], [0, 1, 0, -2], [0, 2, 1, -1], [0, -1, 1, 0], [0, 1, 2, 1], [0, -2, -1, -3], [0, 1, -1, -2],
]

interface Motif {
  rhythm: [number, number][]
  contour: number[]
}

export interface StepContext {
  step: number
  /** Temps de soleil et instant audio du pas. */
  simT: number
  time: number
  /** Durée réelle d'une double croche à cet instant (s), ralentis compris. */
  sixteenth: number
}

/** Position dans la partition, calculée une fois par pas. */
interface Pos {
  sec: Section
  bar: number
  barInSec: number
  secBars: number
  /** Pas dans la mesure (0..15 en 4/4, 0..7 en 2/4). */
  s: number
  stepsPerBar: number
  t: number
  six: number
  beat: number
  chordName: ChordName
  chord: Chord
  /** Avancée dans la Grande Ombre (0..1). */
  gs: number
}

export class Score {
  /** Couches non jouées (page de dev, mesures de coût) : glass, melody, bass, perc, duduk, seq, strings, heart, pad. */
  static readonly skip = new Set<string>()
  private readonly rng: Rng
  private readonly variant: { noon: number; afternoon: number; golden: number }
  private readonly motifs: Motif[]
  private phraseCount = 0
  /** Degré central de la mélodie (index dans PENT), qui dérive lentement. */
  private center = 3
  private lastChord: ChordName | null = null
  private started = false
  private countdownDone = false
  private stopped = false
  private swellDone = false
  private braamDone = false
  private holeUntil = -1
  /** Coupure de la nappe : valeur au début de la mesure courante et visée en fin de mesure. */
  private padFrom = 650
  private padTo = 650
  /** Temps (index) où tombent les coups de bois des dernières secondes → n (5..1). */
  private readonly lastTicks = new Map<number, number>()
  private readonly ticked = new Set<number>()
  private liftDb = NaN

  constructor(
    private readonly ins: Instruments,
    readonly map: TempoMap,
    seed: number,
    /** Coup de bois d'une des dernières secondes, joué sur le battement de cœur le plus proche. */
    private readonly onLastSecond?: (n: number, when: number) => void,
  ) {
    // le battement de cœur le plus proche de chaque seconde T − n : bois et cœur ne font qu'un
    for (let n = LAST_SECONDS; n >= 1; n--) this.lastTicks.set(Math.round(map.beatAt(map.T - n)), n)
    this.rng = new Rng(seed ^ 0x5eed)
    this.variant = { noon: this.rng.int(0, 1), afternoon: this.rng.int(0, 1), golden: this.rng.int(0, 1) }
    this.motifs = Array.from({ length: 3 }, () => ({ rhythm: this.rng.pick(RHYTHMS), contour: this.rng.pick(CONTOURS) }))
  }

  chordAt(bar: number): ChordName {
    const info = this.map.info(bar)
    const i = bar - info.sectionStart
    switch (info.section) {
      case 'noon':
      case 'afternoon':
      case 'golden':
        return pick(PROG[info.section][this.variant[info.section]]!, i)
      case 'sunset':
        return i === info.sectionBars - 1 ? 'E7sus4b9' : pick(SUNSET_CYCLE, i)
      case 'greatShadow':
        return i === info.sectionBars - 1 || i % 2 === 0 ? 'Am' : 'BbA'
    }
  }

  // ─── Compte à rebours : le bourdon et une quinte à vide montent vers le départ ───

  countdown(startAudio: number, goAudio: number): void {
    if (this.countdownDone) return
    this.countdownDone = true
    const ins = this.ins
    const dur = Math.max(0.5, goAudio - startAudio)
    this.setLift(EARLY_LIFT_DB, startAudio, 0)
    ins.startDrone(startAudio, dur)
    ins.chord('pad', [45, 52, 57], dur + 0.4, startAudio, 0.42)
    // la nappe s'ouvre pendant le compte à rebours (pas de 100 ms)
    for (let k = 0; k <= 20; k++) ins.padCutoffAt(320 * Math.pow(650 / 320, k / 20), startAudio + (dur * k) / 20)
    this.padFrom = this.padTo = 650
  }

  // ─── Un pas de double croche ────────────────────────────────────────────

  step(c: StepContext): void {
    if (this.stopped) return
    const m = this.map
    const beat = c.step / 4
    if (beat >= m.beatGS + m.gsBeats) return
    const bar = m.barOfBeat(beat)
    const info = m.info(bar)
    const chordName = this.chordAt(bar)
    const p: Pos = {
      sec: info.section,
      bar,
      barInSec: bar - info.sectionStart,
      secBars: info.sectionBars,
      s: c.step - m.beatOfBar(bar) * 4,
      stepsPerBar: info.beatsPerBar * 4,
      t: c.time,
      six: c.sixteenth,
      beat,
      chordName,
      chord: CH[chordName],
      gs: info.section === 'greatShadow' ? clamp((beat - m.beatGS) / m.gsBeats, 0, 1) : 0,
    }
    if (!this.started) {
      this.started = true
      this.ins.startDrone(p.t, 3)
    }
    if (p.s === 0) this.downbeat(p)
    if (p.sec === 'greatShadow' && p.s % 4 === 0) this.lastSecondTick(beat, p.t)
    // coupure de la nappe, interpolée à chaque double croche (pas inaudibles, voir padCutoffAt)
    this.ins.padCutoffAt(this.padFrom * Math.pow(this.padTo / this.padFrom, p.s / p.stepsPerBar), p.t)
    this.reverseSwell(p)
    const sk = Score.skip
    if (!sk.has('glass')) this.glass(p)
    if (!sk.has('melody')) this.melody(p)
    if (!sk.has('bass')) this.bass(p)
    if (!sk.has('perc')) this.percussion(p)
    if (!sk.has('duduk')) this.duduk(p)
    if (!sk.has('seq')) this.sequencer(p)
    if (!sk.has('strings')) this.strings(p)
    if (!sk.has('heart')) this.heart(p)
  }

  /** Relief du son direct (dB), rampe de `seconds` ; rien si déjà à cette valeur. */
  private setLift(db: number, when: number, seconds: number): void {
    if (db === this.liftDb) return
    this.liftDb = db
    this.ins.setLift(db, when, seconds)
  }

  /** Coups de bois des dernières secondes, sur le battement de cœur. */
  private lastSecondTick(beat: number, when: number): void {
    const n = this.lastTicks.get(beat)
    if (n === undefined || this.ticked.has(n)) return
    this.ticked.add(n)
    this.onLastSecond?.(n, when)
  }

  /** Premier temps : harmonie, ouverture des filtres, impact et montée de la Grande Ombre. */
  private downbeat(p: Pos): void {
    const ins = this.ins
    const m = this.map
    const barDur = p.stepsPerBar * p.six
    // relief de midi et de l'après-midi, qui retombe sur les deux premières mesures de l'heure dorée
    if (p.sec === 'noon' || p.sec === 'afternoon') this.setLift(EARLY_LIFT_DB, p.t, 0.05)
    else if (p.sec === 'golden' && p.barInSec === 0) this.setLift(0, p.t, 2 * barDur)
    else this.setLift(0, p.t, 0.5)
    if (p.chordName !== this.lastChord || p.sec === 'greatShadow') {
      // tenue jusqu'au prochain changement d'accord
      let bars = 1
      while (bars < 4 && this.chordAt(p.bar + bars) === p.chordName && m.info(p.bar + bars).section === p.sec) bars++
      const vel = { noon: 0.42, afternoon: 0.48, golden: 0.52, sunset: 0.55, greatShadow: 0.6 }[p.sec]
      // Grande Ombre : la nappe se réduit à trois notes graves (les cordes tiennent l'aigu)
      const notes = p.sec === 'greatShadow' ? p.chord.pad.slice(0, 3) : p.chord.pad
      if (!Score.skip.has('pad')) ins.chord('pad', notes, bars * barDur * 0.98, p.t, vel)
      this.lastChord = p.chordName
      // basse tenue à l'après-midi (sous-basse douce), relayée ensuite par l'oud
      if (p.sec === 'afternoon') ins.subNote(p.chord.root, bars * barDur * 0.9, p.t, 0.45)
    }
    // la nappe s'ouvre : 650 Hz à midi → 3 kHz au couchant → 5 kHz à la nuit
    this.padFrom = this.padTo
    this.padTo = p.sec === 'greatShadow' ? lerp(3000, 5200, clamp(p.gs + 1 / p.secBars, 0, 1)) : 650 * Math.pow(3000 / 650, Math.pow(clamp((p.bar + 1) / m.barsToGS, 0, 1), 2))
    if (p.sec === 'greatShadow') {
      if (p.barInSec === 0 && !this.braamDone) this.greatShadowHit(p.t)
      ins.startRiser(p.t) // (idempotent : aussi après une reprise en pleine Grande Ombre)
      this.riser(p, barDur)
    }
    // accords rapprochés au couchant et dans la Grande Ombre : relâches courtes (moins de voix)
    this.ins.padRelease = p.sec === 'greatShadow' ? 1.2 : p.sec === 'sunset' ? 2.2 : 3.5
  }

  // ─── Couches ────────────────────────────────────────────────────────────

  private glass(p: Pos): void {
    if (p.s % 2 !== 0 || p.s === 0) return
    const r = this.rng
    const prob = p.sec === 'noon' ? 0.09 : p.sec === 'afternoon' ? 0.06 : p.sec === 'golden' ? 0.025 : 0
    if (prob && r.chance(prob)) this.ins.glassNote(r.pick(GLASS), p.t, r.range(0.2, 0.36))
  }

  private melody(p: Pos): void {
    const ins = this.ins
    const r = this.rng
    if (p.sec === 'noon') return
    if (p.sec === 'afternoon' || p.sec === 'golden') {
      // une phrase toutes les deux mesures (après-midi) ou à chaque mesure (heure dorée)
      const every = p.sec === 'afternoon' ? 2 : 1
      if (p.s !== 0 || p.barInSec % every !== 0) return
      if (p.sec === 'afternoon' && p.barInSec === 0) return // la mélodie entre après deux mesures de nappe seule
      if (!r.chance(p.sec === 'afternoon' ? 0.85 : 0.9)) return
      const motif = this.nextMotif()
      const lift = p.sec === 'golden' ? 2 : 0
      motif.rhythm.forEach(([start, dur], k) => {
        const last = k === motif.rhythm.length - 1
        let deg = k === 0 ? this.nearestChordDegree(this.center, p.chord) : this.center + (motif.contour[k] ?? 0)
        // la dernière note se pose sur une note de l'accord
        if (last) deg = this.nearestChordDegree(deg, p.chord)
        const midi = PENT[clamp(deg + lift, 0, PENT.length - 1)]!
        const at = p.t + start * p.six + r.range(-0.005, 0.008)
        ins.tongueNote(midi, Math.max(0.6, dur * p.six * 3), at, r.range(0.5, 0.75) * (k === 0 ? 1 : 0.85))
      })
      // heure dorée : parfois une réponse en doubles croches, un cran plus haut
      if (p.sec === 'golden' && r.chance(0.35)) {
        const base = this.nearestChordDegree(this.center + 3, p.chord)
        ;[0, 1, 0, -1].forEach((d, k) => ins.tongueNote(PENT[clamp(base + d, 0, PENT.length - 1)]!, 0.8, p.t + (12 + k) * p.six, r.range(0.32, 0.46)))
      }
      this.center = clamp(this.center + r.int(-1, 1), 2, 6)
      return
    }
    // couchant (croches) et Grande Ombre (doubles croches) : arpèges sur l'accord, registre qui monte
    const every = p.sec === 'sunset' ? 2 : 1
    if (p.s % every !== 0) return
    const tones = chordTonesIn(p.chord, p.sec === 'greatShadow' ? 69 : 64, 88)
    if (!tones.length) return
    const pattern = [0, 2, 1, 3, 2, 4, 3, 1]
    const idx = pattern[(p.s / every) % pattern.length]! % tones.length
    const lift = p.sec === 'greatShadow' && p.gs > 0.55 ? 12 : 0
    const accent = p.s % 4 === 0 ? 1 : 0.72
    const vel = (p.sec === 'sunset' ? 0.4 : lerp(0.42, 0.66, p.gs)) * accent
    // notes étouffées vite : l'écho ping-pong prolonge, sans empiler des voix
    ins.tongueNote(Math.min(93, tones[idx]! + lift), p.sec === 'sunset' ? 0.9 : 0.3, p.t, vel, 'melody', p.sec === 'sunset' ? 0.9 : 0.35)
  }

  private bass(p: Pos): void {
    const ins = this.ins
    if (p.sec === 'golden' || p.sec === 'sunset') {
      if (p.sec === 'golden' && p.barInSec === 0) return // l'oud entre à la 2e mesure de l'heure dorée
      // ostinato 3-3-2 : fondamentale, quinte, octave
      const pat: Record<number, [number, number]> = { 0: [0, 0.8], 3: [7, 0.5], 6: [12, 0.45], 8: [0, 0.7], 11: [7, 0.5], 14: [10, 0.4] }
      const hit = pat[p.s]
      if (!hit) return
      const root = oudRoot(p.chord.root)
      // la septième seulement si elle est dans l'accord, sinon l'octave
      const iv = hit[0] === 10 && !p.chord.tones.includes((root + 10) % 12) ? 12 : hit[0]
      const beat = 4 * p.six
      ins.oudNote(root + iv, beat * 0.9, p.t, hit[1] * (p.sec === 'sunset' ? 1.05 : 0.95))
      if (p.s === 0 || p.s === 8) ins.subNote(p.chord.root, beat * 1.6, p.t, p.sec === 'sunset' ? 0.7 : 0.55)
      return
    }
    if (p.sec === 'greatShadow' && p.s % 2 === 0) {
      // croches motrices sur la pédale de la, octaves alternées
      const up = (p.s / 2) % 2 === 1
      ins.subNote(up ? 45 : 33, 2 * p.six * 0.9, p.t, up ? 0.55 : 0.85)
    }
  }

  private percussion(p: Pos): void {
    const ins = this.ins
    const r = this.rng
    const s = p.s
    if (p.sec === 'golden' || p.sec === 'sunset') {
      const sunset = p.sec === 'sunset'
      const lastBar = sunset && p.barInSec === p.secBars - 1
      const kicks: Record<number, number> = sunset ? { 0: 0.9, 8: 0.6, 10: 0.7 } : { 0: 0.85, 10: 0.6 }
      if (kicks[s] && !(lastBar && s > 8)) ins.kick(55, p.t, kicks[s])
      const toms: Record<number, number> = sunset ? { 6: 0.5, 13: 0.35, 14: 0.5 } : { 6: 0.45, 14: 0.4 }
      if (toms[s] && !lastBar) ins.tom(165, p.t, toms[s])
      // roulement de toms sur le dernier temps avant la Grande Ombre
      if (lastBar && s >= 12) ins.tom(150 + (s - 12) * 18, p.t, 0.35 + (s - 12) * 0.15)
      if (!sunset && p.barInSec === 0 && s < 8) return // le shaker entre à mi-mesure
      ins.shaker(p.t, [0.16, 0.07, 0.3, 0.08][s % 4]! * (sunset ? 1.35 : 1) * r.range(0.85, 1.1))
      if (s === 4 || s === 12) ins.playBuffer('tick_wood_soft', 'perc', p.t, { db: -6, rate: 1.12 })
      return
    }
    if (p.sec === 'greatShadow') {
      if (s === 0) ins.kick(52, p.t, 0.95)
      if (s === 4) ins.kick(52, p.t, 0.6 + 0.3 * p.gs)
      if (s === 2 || s === 6) ins.tom(170, p.t, 0.35 + 0.3 * p.gs)
      // dernières mesures : roulement de toms en doubles croches
      else if (p.gs > 0.78) ins.tom(140 + s * 12, p.t, 0.25 + 0.5 * p.gs)
      ins.shaker(p.t, [0.3, 0.12, 0.4, 0.14][s % 4]! * (0.8 + 0.6 * p.gs))
    }
  }

  private duduk(p: Pos): void {
    if (p.s % 4 !== 0) return
    const ins = this.ins
    const beat = 4 * p.six
    if (p.sec === 'golden') {
      if (p.barInSec < 1) return // le duduk entre à la 2e mesure
      // complainte sur 4 mesures, deux versions alternées : [mesure, pas, note, temps]
      const phrase = Math.floor((p.barInSec - 1) / 4) % 2
      const b = (p.barInSec - 1) % 4
      const plan: [number, number, number, number][] =
        phrase === 0
          ? [[0, 0, 64, 5.5], [1, 8, 62, 2], [2, 0, 60, 3], [2, 12, 57, 5]]
          : [[0, 0, 67, 5.5], [1, 8, 64, 2], [2, 0, 62, 3], [2, 12, 64, 5]]
      for (const [pb, ps, midi, beats] of plan) if (pb === b && ps === p.s) ins.dudukNote(midi, beats * beat, p.t, 0.6)
      return
    }
    if (p.sec === 'sunset' && p.s === 0) {
      // une longue note par mesure ; la dernière (fa sur E7sus4♭9) tire vers la Grande Ombre
      const notes = [69, 67, 64, 65]
      const i = p.barInSec === p.secBars - 1 ? 3 : Math.min(p.barInSec, 2)
      ins.dudukNote(notes[i]!, 3.6 * beat, p.t, 0.62)
    }
  }

  private sequencer(p: Pos): void {
    if (p.sec !== 'sunset' && p.sec !== 'greatShadow') return
    let notes: number[]
    if (p.sec === 'greatShadow') notes = p.chordName === 'BbA' ? [46, 53, 58, 62, 58, 53, 58, 65] : [45, 52, 57, 60, 57, 52, 57, 64]
    else {
      const c = p.chord.pad
      notes = [c[0]! - 12, c[1]!, c[2]!, c[1]!, c[3]!, c[2]!, c[1]!, c[2]!]
    }
    const accent = p.s % 4 === 0 ? 0.9 : p.s % 2 === 0 ? 0.6 : 0.45
    const vel = accent * (p.sec === 'greatShadow' ? lerp(0.75, 1, p.gs) : 0.7)
    // le filtre s'ouvre au fil du couchant puis de la Grande Ombre
    const open = p.sec === 'sunset' ? (p.barInSec + p.s / p.stepsPerBar) / p.secBars : p.gs
    const cutoff = p.sec === 'sunset' ? lerp(450, 1100, open) : lerp(1100, 2600, open)
    this.ins.seqNote(notes[p.s % notes.length]!, p.six * 0.8, p.t, vel, cutoff)
  }

  private strings(p: Pos): void {
    if (p.s !== 0) return
    const ins = this.ins
    const beat = 4 * p.six
    if (p.sec === 'sunset' && p.barInSec >= 1) {
      // quinte aiguë tenue ; la dernière mesure frotte (mi–fa) avant la Grande Ombre
      const last = p.barInSec === p.secBars - 1
      ins.chord('strings', last ? [76, 77] : [76, 81], 3.9 * beat, p.t, 0.2 + 0.05 * p.barInSec)
      return
    }
    if (p.sec === 'greatShadow') {
      ins.chord('strings', p.chordName === 'BbA' ? [70, 74, 77] : [69, 72, 76], 1.9 * beat, p.t, lerp(0.45, 0.8, p.gs))
      ins.stringsTremolo.frequency.setValueAtTime(lerp(6, 11, p.gs), p.t)
    }
  }

  private heart(p: Pos): void {
    if (p.sec !== 'greatShadow' || p.s % 4 !== 0) return
    // un battement par temps : 1 Hz au début de la Grande Ombre, 2 Hz à la fin
    this.ins.playBuffer('heartbeat', 'heart', p.t, { db: lerp(-3, 1, p.gs) })
    this.ins.heartThump(p.t + 0.012, lerp(0.5, 0.8, p.gs))
  }

  /** Souffle inversé : culmine sur le premier temps de la Grande Ombre (≈ 97 → 98 s). */
  private reverseSwell(p: Pos): void {
    if (this.swellDone || p.sec !== 'sunset' || p.bar !== this.map.barsToGS - 1 || p.s !== 8) return
    this.swellDone = true
    const downbeat = p.t + 8 * p.six
    this.ins.reverseSwell(downbeat, 57, -2)
    this.ins.reverseSwell(downbeat, 64, -6)
  }

  private greatShadowHit(t: number): void {
    this.braamDone = true
    const ins = this.ins
    ins.startRiser(t)
    ins.chord('braam', [33, 40, 45, 48], 2.6, t, 0.95)
    const f = ins.braamFilter.frequency
    f.cancelScheduledValues(t)
    f.setValueAtTime(140, t)
    f.exponentialRampToValueAtTime(1900, t + 0.22)
    f.exponentialRampToValueAtTime(320, t + 2.8)
    ins.kick(41, t, 1)
    ins.tongueNote([57, 64, 69], 3, t, 0.75, 'stab')
  }

  private riser(p: Pos, barDur: number): void {
    const ins = this.ins
    const m = this.map
    const next = clamp((m.beatOfBar(p.bar + 1) - m.beatGS) / m.gsBeats, 0, 1)
    const g = ins.riserGain.gain
    g.setValueAtTime(dbToGain(lerp(-30, 0, p.gs)), p.t)
    g.linearRampToValueAtTime(dbToGain(lerp(-30, 0, next)), p.t + barDur)
    // filtre par pas (voir padCutoffAt) : 8 pas par mesure
    for (let k = 0; k < 8; k++) ins.riserFilter.frequency.setValueAtTime(300 * Math.pow(20, lerp(p.gs, next, k / 8)), p.t + (barDur * k) / 8)
  }

  // ─── Ponctuations sur les événements ────────────────────────────────────

  /**
   * @param nextStepTime instant audio de la prochaine double croche (quantification)
   * @param six durée d'une double croche (s)
   */
  event(e: SimEvent, now: number, nextStepTime: number, six: number, colorOf: (slot: number) => number | undefined): void {
    if (this.stopped) return
    const ins = this.ins
    switch (e.type) {
      case 'crown': {
        // nouveau meneur : trois notes sur SA note, calées sur la croche suivante
        if (e.slot < 0) break
        const color = colorOf(e.slot)
        if (color === undefined) break
        const note = PLAYER_NOTE_MIDI[color % 12]!
        const at = nextStepTime + (Math.round((nextStepTime - now) / six) % 2 ? six : 0)
        ;[0, 7, 12].forEach((iv, i) => ins.tongueNote(note + iv, 1.5, at + i * 2 * six, 0.62, 'stab'))
        break
      }
      case 'bigSteal': {
        // « trou » d'un temps dans la nappe : l'impact se lit mieux
        if (this.holeUntil > now) break
        const g = ins.layers.pad.gain
        const base = g.value
        const at = nextStepTime
        g.cancelScheduledValues(at)
        g.setValueAtTime(base, at)
        g.linearRampToValueAtTime(base * dbToGain(-12), at + 0.03)
        g.setValueAtTime(base * dbToGain(-12), at + 4 * six)
        g.linearRampToValueAtTime(base, at + 4 * six + 0.25)
        this.holeUntil = at + 4 * six + 0.3
        break
      }
      case 'diveHit': {
        // impact + accord : trois notes de l'accord courant, tout de suite
        const tones = chordTonesIn(CH[this.lastChord ?? 'Am9'], 57, 72).slice(0, 3)
        if (tones.length) ins.tongueNote(tones, 1.4, now + 0.01, e.crown ? 0.8 : 0.6, 'stab')
        break
      }
      default:
        break
    }
  }

  /** Nuit : coupure nette. */
  cut(when: number): void {
    if (this.stopped) return
    this.stopped = true
    this.ins.cut(when)
  }

  // ─── Outils mélodiques ──────────────────────────────────────────────────

  /** A, A', B, A'' … : un thème qu'on reconnaît, jamais tout à fait identique. */
  private nextMotif(): Motif {
    const n = this.phraseCount++
    const base = this.motifs[n % 4 === 2 ? 1 : n % 8 === 7 ? 2 : 0]!
    if (n % 2 === 1) {
      const last = base.contour.length - 1
      return { rhythm: base.rhythm, contour: base.contour.map((d, i) => (i === last ? d + this.rng.pick([-1, 1, 2]) : d)) }
    }
    return base
  }

  private nearestChordDegree(deg: number, chord: Chord): number {
    let best = clamp(deg, 0, PENT.length - 1)
    let bestDist = 99
    for (let d = 0; d < PENT.length; d++) {
      if (!chord.tones.includes(PENT[d]! % 12)) continue
      const dist = Math.abs(d - deg)
      if (dist < bestDist) {
        bestDist = dist
        best = d
      }
    }
    return best
  }
}

function pick<T>(arr: readonly T[], i: number): T {
  return arr[((i % arr.length) + arr.length) % arr.length]!
}

/** Notes de l'accord dans une tessiture donnée, triées. */
function chordTonesIn(chord: Chord, lo: number, hi: number): number[] {
  const out: number[] = []
  for (let m = lo; m <= hi; m++) if (chord.tones.includes(m % 12)) out.push(m)
  return out
}

/** Fondamentale jouable par l'oud (mi2 → ré3). */
function oudRoot(root: number): number {
  let r = root
  while (r < 40) r += 12
  while (r > 50) r -= 12
  return r
}
