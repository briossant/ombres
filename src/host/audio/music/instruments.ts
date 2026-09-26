// Instruments de la partition générative, en WebAudio natif (voir synth.ts pour le pourquoi).
// Échantillons CC0 : tongue drum (mélodie), oud (basse), duduk (complainte), tanpura (bourdon),
// battement de cœur ; synthèse : nappe (dents de scie désaccordées L/R), cloches FM,
// séquenceur « cordes » façon Tangerine Dream, cordes tenues en trémolo, sous-basse,
// percussions (membranes, bruit), braam, montée de bruit.
// Chaque couche a son gain (mixage ; solo/muet dans la page de dev) et appartient à un groupe
// (sec, moyen, humide) qui dose l'envoi vers la réverbe du moteur. Sobriété mesurée
// (tools/audio-cpu.mjs) : sur cette machine, chaque nœud actif coûte ~0,2 % d'un cœur.
import type { AudioEngine } from '../engine.ts'
import { AUDIO_ASSETS, type AssetId } from '../manifest.gen.ts'
import { reversed } from '../procedural.ts'
import { dbToGain, noteToMidi, rampTo } from '../util.ts'
import { fmBell, membrane, NativeSampler, noiseHit, pingPong, pluck, sawVoice, whiteNoise } from './synth.ts'

export const LAYERS = [
  'drone', 'pad', 'glass', 'melody', 'bass', 'perc', 'duduk', 'seq', 'strings', 'heart', 'riser', 'braam', 'stab',
] as const
export type LayerName = (typeof LAYERS)[number]

/**
 * Niveau de chaque couche (dB) et groupe de réverbe : le mixage de la partition, réglé sur les
 * sonies mesurées couche par couche (tools/audio-stems.sh) à l'heure dorée et dans la Grande Ombre.
 */
const MIX: Record<LayerName, { db: number; group: Group }> = {
  drone: { db: -9, group: 'mid' },
  pad: { db: -14, group: 'wet' },
  glass: { db: -20, group: 'wet' },
  melody: { db: -14, group: 'wet' },
  bass: { db: -14, group: 'dry' },
  perc: { db: -9, group: 'dry' },
  duduk: { db: -15, group: 'wet' },
  seq: { db: -7, group: 'mid' },
  strings: { db: -11, group: 'wet' },
  heart: { db: -9, group: 'dry' },
  riser: { db: -6, group: 'mid' },
  braam: { db: -12, group: 'mid' },
  stab: { db: -14, group: 'wet' },
}
/** Envoi vers la réverbe de chaque groupe (moins de nœuds qu'un envoi par couche). */
const GROUP_VERB = { dry: 0.15, mid: 0.3, wet: 0.5 } as const
type Group = keyof typeof GROUP_VERB
/** Part de chaque couche envoyée dans l'écho ping-pong pointé (partagé). */
const ECHO_SEND: Partial<Record<LayerName, number>> = { glass: 0.9, melody: 0.4, stab: 0.2 }

/** Fichiers à charger avant la première manche. */
export const SCORE_ASSETS: AssetId[] = [
  'tongue_A3', 'tongue_C4', 'tongue_D4', 'tongue_E4', 'tongue_G4', 'tongue_A4', 'tongue_C5', 'tongue_D5', 'tongue_E5',
  'oud_A2', 'oud_C3', 'oud_G2', 'duduk_C4', 'tanpura_A2', 'heartbeat', 'tick_wood_soft',
]

type ChordLayer = 'pad' | 'strings' | 'braam'

export class Instruments {
  readonly out: GainNode
  /** Relief du son direct de la partition (midi, après-midi), après `out`, avant le bus. */
  private readonly lift: GainNode
  readonly layers = {} as Record<LayerName, GainNode>
  /** Oscillateur du trémolo des cordes (fréquence automatisée). */
  readonly stringsTremolo: OscillatorNode
  readonly braamFilter: BiquadFilterNode
  readonly riserFilter: BiquadFilterNode
  readonly riserGain: GainNode
  readonly droneGain: GainNode
  private readonly inputs = {} as Record<LayerName, AudioNode>
  /** Passe-bas de la nappe. */
  private readonly padFilters: BiquadFilterNode[]
  private readonly oudIn: BiquadFilterNode
  private readonly tongue: NativeSampler
  private readonly oud: NativeSampler
  private readonly duduk: NativeSampler
  private readonly buffers: Partial<Record<AssetId, AudioBuffer>> = {}
  private readonly reverseTongue: AudioBuffer | null
  private droneSrc: AudioBufferSourceNode | null = null
  private riserSrc: AudioBufferSourceNode | null = null
  /** Relâche de la nappe : longue au calme, courte quand les accords s'enchaînent vite. */
  padRelease = 3.5
  private readonly lastHit = new Map<string, number>()

  constructor(
    readonly engine: AudioEngine,
    /** Durée d'un temps au tempo de base (délais « pointés »). */
    beatSeconds: number,
  ) {
    const ctx = engine.ctx
    for (const id of SCORE_ASSETS) {
      const b = engine.assets.get(id)
      if (b) this.buffers[id] = b
    }
    // Le graphe n'est relié au bus musique que pendant une manche (attach/detach) : hors
    // manche, rien n'y est calculé.
    this.out = ctx.createGain()
    this.lift = ctx.createGain()
    this.out.connect(this.lift)
    const groups = {} as Record<Group, GainNode>
    for (const gname of Object.keys(GROUP_VERB) as Group[]) {
      const g = ctx.createGain()
      g.connect(this.out)
      const send = ctx.createGain()
      send.gain.value = GROUP_VERB[gname]
      g.connect(send).connect(engine.musicReverbSend)
      groups[gname] = g
    }
    // la coupure de la nuit agit sur les groupes : sons directs ET envois de réverbe
    this.groupGains = Object.values(groups)
    // écho ping-pong pointé partagé (cloches, mélodie, ponctuations) : seulement la part d'écho
    const echo = pingPong(ctx, beatSeconds * 0.75, 0.38, 1, false)
    echo.output.connect(groups.wet)
    for (const name of LAYERS) {
      const g = ctx.createGain()
      g.gain.value = dbToGain(MIX[name].db)
      g.connect(groups[MIX[name].group])
      const e = ECHO_SEND[name]
      if (e) {
        const s = ctx.createGain()
        s.gain.value = e
        g.connect(s).connect(echo.input)
      }
      this.layers[name] = g
      this.inputs[name] = g
    }
    const L = this.layers
    const biquad = (type: BiquadFilterType, freq: number, q = 0.7) => {
      const f = ctx.createBiquadFilter()
      f.type = type
      f.frequency.value = freq
      f.Q.value = q
      return f
    }

    // bourdon (tanpura réaccordé en la, en boucle)
    this.droneGain = ctx.createGain()
    this.droneGain.gain.value = 0
    this.droneGain.connect(L.drone)

    // nappe : passe-bas (les deux dents de scie L/R désaccordées donnent déjà la largeur)
    this.padFilters = [biquad('lowpass', 650, 0.6)]
    this.padFilters[0]!.connect(L.pad)
    this.inputs.pad = this.padFilters[0]!

    // échantillonneurs
    const zone = (id: AssetId, note: string) => ({ midi: noteToMidi(note), buf: this.buffers[id] })
    this.tongue = new NativeSampler(
      [zone('tongue_A3', 'A3'), zone('tongue_C4', 'C4'), zone('tongue_D4', 'D4'), zone('tongue_E4', 'E4'), zone('tongue_G4', 'G4'),
        zone('tongue_A4', 'A4'), zone('tongue_C5', 'C5'), zone('tongue_D5', 'D5'), zone('tongue_E5', 'E5')],
      { attack: 0, release: 1.6 },
    )
    this.oud = new NativeSampler([zone('oud_G2', 'G2'), zone('oud_A2', 'A2'), zone('oud_C3', 'C3')], { attack: 0, release: 0.35 })
    this.duduk = new NativeSampler([zone('duduk_C4', 'C4')], { attack: 0.18, release: 1.3 })
    this.reverseTongue = this.buffers.tongue_A3 ? reversed(ctx, this.buffers.tongue_A3) : null
    this.oudIn = biquad('lowpass', 1900)
    this.oudIn.connect(L.bass)

    // séquenceur : léger écho à la croche
    const seqIn = ctx.createGain()
    seqIn.connect(L.seq)
    const seqDelay = ctx.createDelay(2)
    seqDelay.delayTime.value = beatSeconds * 0.5
    const seqFb = ctx.createGain()
    seqFb.gain.value = 0.22
    const seqWet = ctx.createGain()
    seqWet.gain.value = 0.25
    seqIn.connect(seqDelay).connect(seqFb).connect(seqDelay)
    seqDelay.connect(seqWet).connect(L.seq)
    this.inputs.seq = seqIn

    // cordes : passe-bas + trémolo (LFO sur le gain)
    const strFilter = biquad('lowpass', 2600)
    const trem = ctx.createGain()
    trem.gain.value = 0.8
    this.stringsTremolo = ctx.createOscillator()
    this.stringsTremolo.frequency.value = 6.5
    const tremDepth = ctx.createGain()
    tremDepth.gain.value = 0.2
    this.stringsTremolo.connect(tremDepth).connect(trem.gain)
    this.stringsTremolo.start()
    strFilter.connect(trem).connect(L.strings)
    this.inputs.strings = strFilter

    // braam : passe-bas résonant à enveloppe
    this.braamFilter = biquad('lowpass', 200, 2)
    this.braamFilter.connect(L.braam)
    this.inputs.braam = this.braamFilter

    // montée : bruit blanc bouclé (lancé à la Grande Ombre) → passe-bande → gain automatisé
    this.riserFilter = biquad('bandpass', 300, 2.5)
    this.riserGain = ctx.createGain()
    this.riserGain.gain.value = 0
    this.riserFilter.connect(this.riserGain).connect(L.riser)
  }

  private readonly groupGains: GainNode[]
  private attached = false
  private detachTimer: ReturnType<typeof setTimeout> | null = null

  /** Relie la partition au bus musique (début de manche). */
  attach(): void {
    if (this.detachTimer) clearTimeout(this.detachTimer)
    this.detachTimer = null
    if (this.attached) return
    this.lift.connect(this.engine.buses.music)
    this.attached = true
  }

  /** Détache après les queues de réverbe et d'écho (fin de manche) : plus aucun calcul. */
  detachAfter(seconds: number): void {
    if (!this.attached || this.engine.offline) return
    if (this.detachTimer) clearTimeout(this.detachTimer)
    this.detachTimer = setTimeout(() => {
      this.lift.disconnect()
      this.attached = false
      this.detachTimer = null
    }, seconds * 1000)
  }

  /** Démarre le bruit de la montée (Grande Ombre). */
  startRiser(when: number): void {
    if (this.riserSrc) return
    const src = this.engine.ctx.createBufferSource()
    src.buffer = whiteNoise(this.engine.ctx)
    src.loop = true
    src.connect(this.riserFilter)
    src.start(when)
    this.riserSrc = src
  }

  private stopSources(when: number): void {
    for (const s of [this.droneSrc, this.riserSrc]) {
      try {
        s?.stop(when)
      } catch {
        // pas démarrée
      }
    }
    this.droneSrc = null
    this.riserSrc = null
  }

  /**
   * Coupure du passe-bas de la nappe à un instant (les deux étages suivent). Par petits pas
   * plutôt qu'en rampe continue : un biquad automatisé recalcule ses coefficients à chaque
   * échantillon, un biquad à valeurs fixes une fois par bloc.
   */
  padCutoffAt(freq: number, when: number): void {
    for (const f of this.padFilters) f.frequency.setValueAtTime(freq, when)
  }

  // ─── Notes ───────────────────────────────────────────────────────────────

  /** Accord tenu (nappe, cordes, braam). */
  chord(layer: ChordLayer, midis: number[], dur: number, when: number, vel: number): void {
    const out = this.inputs[layer]
    const o =
      layer === 'pad'
        ? { voices: 2 as const, spread: 9, attack: 2.2, decay: 1.5, sustain: 0.8, release: this.padRelease }
        : layer === 'strings'
          ? { voices: 2 as const, spread: 12, attack: 1.2, decay: 0.5, sustain: 0.85, release: this.padRelease * 0.6 }
          : { voices: 3 as const, spread: 8, attack: 0.03, decay: 1.2, sustain: 0.6, release: 2.5 }
    for (const m of midis) sawVoice(out, m, when, dur, vel * 0.5, o)
  }

  glassNote(midi: number, when: number, vel: number): void {
    fmBell(this.inputs.glass, midi, when, vel * 0.5, { ratio: 3.01, index: 2.2, decay: 2.8, indexDecay: 0.7 })
  }

  /** Tongue drum : mélodie (avec écho) ou ponctuation (plus de réverbe). `release` : étouffement (s). */
  tongueNote(midi: number | number[], dur: number, when: number, vel: number, layer: 'melody' | 'stab' = 'melody', release?: number): void {
    for (const m of Array.isArray(midi) ? midi : [midi]) this.tongue.play(this.inputs[layer], m, when, dur, vel, release)
  }

  oudNote(midi: number, dur: number, when: number, vel: number): void {
    this.oud.play(this.oudIn, midi, when, dur, vel)
  }

  dudukNote(midi: number, dur: number, when: number, vel: number): void {
    this.duduk.play(this.inputs.duduk, midi, when, dur, vel)
  }

  /** Note du séquenceur « cordes » ; `cutoff` = ouverture du filtre (Hz) à cet instant. */
  seqNote(midi: number, dur: number, when: number, vel: number, cutoff: number): void {
    pluck(this.inputs.seq, midi, when, dur, vel * 0.6, {
      type: 'sawtooth', cutoff, envOctaves: 2.6, filterDecay: 0.14, q: 3,
      attack: 0.003, decay: 0.16, sustain: 0.25, release: 0.08,
    })
  }

  subNote(midi: number, dur: number, when: number, vel: number): void {
    pluck(this.inputs.bass, midi, when, dur, vel * 0.8, {
      type: 'triangle', cutoff: 160, envOctaves: 1.2, filterDecay: 0.3, q: 0.5,
      attack: 0.02, decay: 0.4, sustain: 0.7, release: 0.5,
    })
  }

  kick(freq: number, when: number, vel: number): void {
    membrane(this.inputs.perc, freq, this.mono('kick', when), vel, { pitchDecay: 0.05, octaves: 3.2, decay: 0.42 })
  }

  heartThump(when: number, vel: number): void {
    membrane(this.inputs.heart, 48, when, vel, { pitchDecay: 0.04, octaves: 1.5, decay: 0.25 })
  }

  tom(freq: number, when: number, vel: number): void {
    membrane(this.inputs.perc, freq, this.mono('tom', when), vel * 0.8, { pitchDecay: 0.02, octaves: 1.6, decay: 0.2, type: 'triangle' })
  }

  shaker(when: number, vel: number): void {
    noiseHit(this.inputs.perc, when, vel * 0.5, { decay: 0.045, type: 'highpass', freq: 6200 })
  }

  /** Deux coups au même instant sur une membrane s'additionnent mal : on les décale d'1 ms. */
  private mono(key: string, when: number): number {
    const t = Math.max(when, (this.lastHit.get(key) ?? -1) + 0.001)
    this.lastHit.set(key, t)
    return t
  }

  /** Lance le bourdon (tanpura en boucle) avec un fondu d'entrée. */
  startDrone(when: number, fade = 4): void {
    const buf = this.buffers.tanpura_A2
    if (!buf || this.droneSrc) return
    const src = this.engine.ctx.createBufferSource()
    src.buffer = buf
    src.loop = true
    src.connect(this.droneGain)
    src.start(when)
    this.droneSrc = src
    this.droneGain.gain.cancelScheduledValues(when)
    this.droneGain.gain.setValueAtTime(0, when)
    this.droneGain.gain.linearRampToValueAtTime(1, when + fade)
  }

  /** Joue un tampon (cœur, bois) dans une couche, calé sur son attaque (silence de tête sauté). */
  playBuffer(id: AssetId, layer: LayerName, when: number, opts: { db?: number; rate?: number } = {}): void {
    const buf = this.buffers[id]
    if (!buf) return
    const ctx = this.engine.ctx
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = opts.rate ?? 1
    const g = ctx.createGain()
    g.gain.value = dbToGain(opts.db ?? 0)
    src.connect(g).connect(this.inputs[layer])
    src.start(when, Math.max(0, AUDIO_ASSETS[id].onset - 0.004))
    src.onended = () => {
      src.disconnect()
      g.disconnect()
    }
  }

  /** Tongue drum à l'envers (souffle aspiré), qui culmine à `peakAt`. */
  reverseSwell(peakAt: number, midi: number, db = 0): void {
    const buf = this.reverseTongue
    if (!buf) return
    const ctx = this.engine.ctx
    const rate = Math.pow(2, (midi - noteToMidi('A3')) / 12)
    const dur = buf.duration / rate
    const lead = Math.min(dur, 2.2)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.playbackRate.value = rate
    const g = ctx.createGain()
    g.gain.value = dbToGain(db)
    src.connect(g).connect(this.layers.melody)
    const start = Math.max(this.engine.now, peakAt - lead)
    src.start(start, (dur - (peakAt - start)) * rate)
    src.stop(peakAt + 0.01)
    src.onended = () => {
      src.disconnect()
      g.disconnect()
    }
  }

  /** Relief du son direct (dB) à l'instant `when`, en rampe de `seconds` (0 : immédiat). */
  setLift(db: number, when: number, seconds: number): void {
    const p = this.lift.gain
    p.cancelScheduledValues(when)
    if (seconds <= 0) p.setValueAtTime(dbToGain(db), when)
    else {
      p.setValueAtTime(p.value, when)
      p.linearRampToValueAtTime(dbToGain(db), when + seconds)
    }
  }

  /** Réglage fin d'une couche (dB ajoutés au mixage ; −Infinity = muette). */
  setTrim(name: LayerName, db: number, when = this.engine.now): void {
    const g = db === -Infinity ? 0 : dbToGain(MIX[name].db + db)
    rampTo(this.layers[name].gain, g, when, 0.08)
  }

  /** Nouvelle manche : sortie rouverte, bourdon arrêté (il repartira au compte à rebours). */
  reset(when: number): void {
    for (const p of [this.out.gain, ...this.groupGains.map(n => n.gain)]) {
      p.cancelScheduledValues(when)
      p.setValueAtTime(1, when)
    }
    this.stopSources(when)
    this.padRelease = 3.5
    this.droneGain.gain.cancelScheduledValues(when)
    this.droneGain.gain.setValueAtTime(0, when)
    this.riserGain.gain.cancelScheduledValues(when)
    this.riserGain.gain.setValueAtTime(0, when)
  }

  /** Coupe nette (nuit) : fondu de 25 ms de toute la partition. */
  cut(when: number): void {
    for (const p of [...this.groupGains.map(n => n.gain), this.riserGain.gain, this.droneGain.gain]) {
      p.cancelScheduledValues(when)
      p.setTargetAtTime(0, when, 0.008)
    }
    this.stopSources(when + 0.1)
  }

  dispose(): void {
    this.stopSources(this.engine.now)
    try {
      this.stringsTremolo.stop()
    } catch {
      // déjà arrêté
    }
    this.out.disconnect()
    this.lift.disconnect()
  }
}
