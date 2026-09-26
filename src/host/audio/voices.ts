// Lecture des sons ponctuels : variations sans répétition immédiate, hauteur et volume
// aléatoires, sonie normalisée (chaque son est réglé en LUFS perçus, pas en crête),
// polyphonie limitée par son (vol de la voix la plus ancienne), temps de garde, panoramique.
import { soundLoudness, type AudioEngine, type BusName, type SoundFile } from './engine.ts'
import { AUDIO_ASSETS, type AssetId } from './manifest.gen.ts'
import { dbToGain, glide, semis } from './util.ts'

/** Définition d'un son jouable. */
export interface SoundDef {
  /** Variations (une tirée au hasard, jamais deux fois de suite la même). */
  files: readonly SoundFile[]
  /** Sonie visée (LUFS momentanés max, bus à 1) : gain = db − sonie mesurée du fichier. */
  db: number
  bus?: Exclude<BusName, 'music' | 'voice'>
  /** Écart aléatoire de hauteur (± demi-tons). 0 pour les sons accordés. */
  pitch?: number
  /** Décalage fixe de hauteur (demi-tons). */
  semitones?: number
  /** Écart aléatoire de volume (± dB). */
  jitterDb?: number
  /** Voix simultanées maximum pour ce son (défaut 4). */
  maxVoices?: number
  /** Écart minimum entre deux déclenchements (s). */
  cooldown?: number
  /** Envoi vers la réverbe d'espace (0..1). */
  reverb?: number
  /** Passe-bas fixe (Hz). */
  lowpass?: number
  /** Passe-haut fixe (Hz). */
  highpass?: number
  /**
   * Calage du fichier : 'onset' saute le silence de tête ; { peakAt } place la crête du fichier
   * à `peakAt` secondes après le déclenchement (ex. le « boum » du piqué sur l'impact).
   */
  align?: 'onset' | { peakAt: number }
  /**
   * Signal de jeu (compte à rebours, phases, dernières secondes, nuit, couronne) : jamais refusé
   * par le plafond global de voix (SoundPlayer.maxTotalVoices). Les sons d'interface non plus.
   */
  essential?: boolean
  /** Tranche du fichier (s). */
  offset?: number
  duration?: number
  /** Fondu de sortie quand `duration` coupe le fichier (s). */
  release?: number
}

export interface PlayOptions {
  /** Instant (horloge audio) ; défaut : maintenant. */
  when?: number
  /** Gain supplémentaire (dB). */
  db?: number
  /** Transposition supplémentaire (demi-tons). */
  semitones?: number
  /** Position dans le monde → panoramique et atténuation hors cadre. */
  x?: number
  y?: number
  /** Panoramique imposé (−1..1). */
  pan?: number
  /** Remplace le fichier tiré au hasard. */
  file?: SoundFile
  /** Fondu d'entrée (s). */
  fadeIn?: number
  /** Surcharge de la tranche. */
  offset?: number
  duration?: number
}

/** Voix en cours : permet de la suivre (panoramique) ou de l'arrêter en douceur. */
export class Voice {
  ended = false
  constructor(
    readonly name: string,
    readonly src: AudioBufferSourceNode,
    readonly gain: GainNode,
    readonly panner: StereoPannerNode,
    readonly startedAt: number,
    /** Fin estimée (horloge audio) : sert au décompte des voix, y compris hors ligne. */
    public endsAt: number,
    private readonly engine: AudioEngine,
  ) {}

  /** Arrêt avec fondu (pas de clic). */
  stop(fade = 0.08, when = this.engine.now): void {
    if (this.ended || when >= this.endsAt) return
    this.endsAt = when + fade + 0.02
    this.gain.gain.cancelScheduledValues(when)
    this.gain.gain.setTargetAtTime(0, when, fade / 4)
    try {
      this.src.stop(when + fade + 0.02)
    } catch {
      // déjà arrêtée
    }
  }

  setPan(pan: number, seconds = 0.06): void {
    glide(this.panner.pan, pan, this.engine.now, seconds, 0.03)
  }

  setRate(rate: number, seconds = 0.06): void {
    glide(this.src.playbackRate, rate, this.engine.now, seconds, 0.01)
  }

  setGain(g: number, seconds = 0.06): void {
    glide(this.gain.gain, g, this.engine.now, seconds)
  }
}

export class SoundPlayer {
  private voices = new Map<string, Voice[]>()
  private lastFile = new Map<string, SoundFile>()
  private lastTime = new Map<string, number>()
  /** Facteur global de vitesse (ralenti : les nouveaux sons sont joués plus graves). */
  rateScale = 1
  /** Garde-fou CPU : voix simultanées au total (hors signaux essentiels et interface). */
  maxTotalVoices = 48
  random: () => number = Math.random
  /** Trace des lectures (page de dev : part de chaque son dans le mixage). */
  onPlay: ((name: string, db: number, seconds: number) => void) | null = null

  constructor(
    readonly engine: AudioEngine,
    readonly defs: Readonly<Record<string, SoundDef>>,
  ) {}

  /** Joue un son défini ; renvoie la voix (ou null si limité, en garde ou pas encore chargé). */
  play(name: string, o: PlayOptions = {}): Voice | null {
    const def = this.defs[name]
    if (!def) {
      console.warn(`[audio] son inconnu : ${name}`)
      return null
    }
    const e = this.engine
    const when = Math.max(o.when ?? e.now, e.now)
    if (def.cooldown) {
      const last = this.lastTime.get(name) ?? -1e9
      if (when - last < def.cooldown) return null
    }
    const file = o.file ?? this.pickFile(name, def)
    const buffer = e.assets.get(file)
    if (!buffer) {
      if (!file.startsWith('proc_')) void e.assets.load(file as AssetId) // paresseux : il sera là la prochaine fois
      return null
    }
    // voix terminées (ou qui le seront à `when`) : retirées du décompte
    let total = 0
    for (const l of this.voices.values()) {
      for (let i = l.length - 1; i >= 0; i--) if (l[i]!.endsAt <= when) l.splice(i, 1)
      total += l.length
    }
    if (total >= this.maxTotalVoices && !def.essential && def.bus !== 'ui') return null
    // polyphonie par son : on libère la plus ancienne
    const list = this.voices.get(name) ?? []
    const max = def.maxVoices ?? 4
    while (list.length >= max) list.shift()?.stop(0.05, when)
    this.lastTime.set(name, when)

    const ctx = e.ctx
    const src = ctx.createBufferSource()
    src.buffer = buffer
    const st = (def.semitones ?? 0) + (o.semitones ?? 0) + (def.pitch ? (this.random() * 2 - 1) * def.pitch : 0)
    src.playbackRate.value = semis(st) * this.rateScale
    const jitter = def.jitterDb ? (this.random() * 2 - 1) * def.jitterDb : 0
    let level = dbToGain(def.db - soundLoudness(file) + (o.db ?? 0) + jitter)
    let pan = o.pan ?? 0
    if (o.x !== undefined && o.y !== undefined) {
      const s = e.spatial(o.x, o.y)
      pan = o.pan ?? s.pan
      level *= s.gain
    }
    const gain = ctx.createGain()
    let offset = o.offset ?? def.offset ?? 0
    if (def.align && !file.startsWith('proc_')) {
      const meta = AUDIO_ASSETS[file as AssetId]
      offset = def.align === 'onset' ? Math.max(0, meta.onset - 0.005) : Math.max(0, meta.peakTime - def.align.peakAt)
    }
    const duration = o.duration ?? def.duration
    if (o.fadeIn) {
      gain.gain.setValueAtTime(0, when)
      gain.gain.linearRampToValueAtTime(level, when + o.fadeIn)
    } else gain.gain.setValueAtTime(level, when)
    let node: AudioNode = src
    if (def.lowpass || def.highpass) {
      const f = ctx.createBiquadFilter()
      f.type = def.lowpass ? 'lowpass' : 'highpass'
      f.frequency.value = def.lowpass ?? def.highpass ?? 1000
      node.connect(f)
      node = f
    }
    node.connect(gain)
    const panner = ctx.createStereoPanner()
    panner.pan.value = pan
    gain.connect(panner).connect(e.buses[def.bus ?? 'sfx'])
    if (def.reverb) {
      const send = ctx.createGain()
      send.gain.value = def.reverb
      panner.connect(send).connect(e.sfxReverbSend)
    }
    const rate = src.playbackRate.value
    let endsAt: number
    if (duration !== undefined) {
      const rel = def.release ?? 0.03
      endsAt = when + duration / rate
      gain.gain.setValueAtTime(level, Math.max(when, endsAt - rel))
      gain.gain.linearRampToValueAtTime(0, endsAt)
      src.start(when, offset, duration + 0.01)
    } else {
      endsAt = when + (buffer.duration - offset) / rate
      src.start(when, Math.min(offset, buffer.duration - 0.01))
    }
    this.onPlay?.(name, 20 * Math.log10(level + 1e-9) + soundLoudness(file), endsAt - when)
    const v = new Voice(name, src, gain, panner, when, endsAt, e)
    list.push(v)
    this.voices.set(name, list)
    src.onended = () => {
      v.ended = true
      const l = this.voices.get(name)
      if (l) {
        const i = l.indexOf(v)
        if (i >= 0) l.splice(i, 1)
      }
      src.disconnect()
      gain.disconnect()
      panner.disconnect()
    }
    return v
  }

  /** Arrête toutes les voix d'un son (ou toutes). */
  stopAll(name?: string, fade = 0.1): void {
    for (const [n, list] of this.voices) if (!name || n === name) for (const v of list) v.stop(fade)
  }

  activeVoices(name: string): number {
    const now = this.engine.now
    return this.voices.get(name)?.filter(v => v.endsAt > now).length ?? 0
  }

  private pickFile(name: string, def: SoundDef): SoundFile {
    const files = def.files
    if (files.length === 1) return files[0]!
    const last = this.lastFile.get(name)
    let f = files[Math.floor(this.random() * files.length)]!
    if (f === last) f = files[(files.indexOf(f) + 1 + Math.floor(this.random() * (files.length - 1))) % files.length]!
    this.lastFile.set(name, f)
    return f
  }
}
