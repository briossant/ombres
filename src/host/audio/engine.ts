// Moteur audio d'Ombres : un seul AudioContext, bus reliés aux réglages, chaîne master
// (compresseur doux, limiteur, saturation douce), ducking du narrateur, filtre de ralenti,
// panoramique selon la position à l'écran, chargement des fichiers avec progression.
//
// Graphe :
//   musique ─ vol ─ duck ─ creux ─ filtre pause ─┐
//   ambiance ─ vol ─ duck ───────────────────────┼─ monde ─ égaliseur voix ─ filtre ralenti ─┐
//   bruitages ─ vol ─ duck (+ retour réverbe) ───┘                                          ├─ master ─ glue ─ limiteur ─ saturation ─ sortie
//   interface ─ vol ─ duck ─────────────────────────────────────────────────────────────────┤
//   voix ─ vol ─────────────────────────────────────────────────────────────────────────────┘
// Pendant une réplique du narrateur (duck) : musique et ambiance −6 dB (GDD), bruitages −5 dB,
// interface −6 dB, et un creux de −4 dB à 2,5 kHz sur le monde (là où se jouent les consonnes).
// Le moteur accepte un OfflineAudioContext : les pages de dev rendent une manche hors ligne
// avec exactement le même graphe pour la mesurer.
import { RULES } from '../../sim/rules.ts'
import { AUDIO_ASSETS, type AssetId } from './manifest.gen.ts'
import { impulseResponse, softClipCurve } from './procedural.ts'
import { clamp, dbToGain, glide, rampTo } from './util.ts'

export type BusName = 'music' | 'sfx' | 'amb' | 'ui' | 'voice'

export interface Volumes {
  master: number
  music: number
  sfx: number
  voice: number
}

/** Point d'écoute : centre et demi-dimensions (m) de ce que la caméra cadre, repère monde. */
export interface Listener {
  x: number
  y: number
  halfWidth: number
  halfHeight: number
}

/** Courbe du curseur de volume (0..1) → gain : quadratique, proche de la perception. */
export const sliderToGain = (v: number): number => clamp(v, 0, 1) ** 2

/**
 * Niveau de l'ambiance par rapport au volume « effets » (l'ambiance suit ce curseur) : réglé sur
 * une manche de 6 bots (ambiance ≈ −28 LUFS à midi → −25 dans la Grande Ombre, sous la musique).
 */
const AMB_TRIM_DB = -5
/**
 * Niveau des bruitages de jeu par rapport à la table sounds.ts : réglé sur une manche jouée par
 * la vraie simulation et 6 bots (≈ −23 LUFS intégrés, la musique finit au-dessus).
 */
const SFX_TRIM_DB = -4
/**
 * Voix : −2 dB par rapport au curseur. Le ducking des bruitages et l'égaliseur rendent la voix
 * intelligible sans qu'elle saute de 6 à 9 LU au-dessus du fond à chaque réplique.
 */
const VOICE_TRIM_DB = -2
/**
 * Ducking du narrateur au-delà de la règle du GDD (musique et ambiance à RULES.narratorDuckDb) :
 * à 12 oiseaux, ce sont les bruitages qui masquent la parole entre 1 et 4 kHz (68 à 84 % du
 * masque mesuré), et les ponctuations d'interface qui couvrent le nom du vainqueur.
 */
const SFX_DUCK_DB = -5
/** Creux en cloche sur le monde pendant la voix (fréquence, Q, profondeur). */
const VOICE_EQ_HZ = 2500
const VOICE_EQ_Q = 0.8
const VOICE_EQ_DB = -4

export class AudioEngine {
  readonly ctx: BaseAudioContext
  readonly offline: boolean
  readonly buses: Record<BusName, GainNode>
  /** Ducking (narrateur) de la musique, de l'ambiance, des bruitages et de l'interface. */
  readonly duckMusic: GainNode
  readonly duckAmb: GainNode
  readonly sfxDuck: GainNode
  readonly uiDuck: GainNode
  /** Creux en cloche sur le monde pendant la voix (intelligibilité des consonnes). */
  readonly voiceEq: BiquadFilterNode
  /** Creux bref de la musique sous un accent (couronne, gros vol, esquive). */
  readonly musicDip: GainNode
  /** Filtre de pause (passe-bas) de la musique et gain de pause. */
  readonly musicPause: BiquadFilterNode
  readonly musicPauseGain: GainNode
  /** Tout ce qui est « dans le monde » passe par le filtre de ralenti. */
  readonly world: GainNode
  readonly slowmoFilter: BiquadFilterNode
  readonly masterIn: GainNode
  readonly master: GainNode
  readonly output: AudioNode
  /** Envoi vers la réverbe depuis les bruitages (le lecteur applique le volume effets). */
  readonly sfxReverbSend: GainNode
  /** Envoi vers la réverbe depuis la musique (déjà après le volume musique). */
  readonly musicReverbSend: GainNode
  /** Retour de la réverbe partagée. */
  readonly verbOut: GainNode
  private readonly sfxSendVol: GainNode
  private readonly sfxSendDuck: GainNode
  private readonly musicSendVol: GainNode
  private readonly musicSendDuck: GainNode
  private readonly musicSendPause: GainNode
  readonly assets: AssetStore
  listener: Listener = { x: 0, y: 0, halfWidth: 90, halfHeight: 60 }
  /** Vrai quand le point d'écoute est fourni par la caméra (sinon estimé depuis les oiseaux). */
  listenerFromCamera = false
  private unlockedFlag = false
  private unlockCbs = new Set<() => void>()
  private duckCount = 0
  private taps = new Map<string, AnalyserNode>()

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx
    this.offline = typeof OfflineAudioContext !== 'undefined' && ctx instanceof OfflineAudioContext
    const g = (v = 1) => {
      const n = ctx.createGain()
      n.gain.value = v
      return n
    }
    // ─ master
    this.masterIn = g()
    this.master = g(0.81)
    const glue = ctx.createDynamicsCompressor()
    glue.threshold.value = -16
    glue.knee.value = 10
    glue.ratio.value = 2.2
    glue.attack.value = 0.012
    glue.release.value = 0.28
    const limiter = ctx.createDynamicsCompressor()
    limiter.threshold.value = -4
    limiter.knee.value = 0
    limiter.ratio.value = 20
    limiter.attack.value = 0.002
    limiter.release.value = 0.12
    const clip = ctx.createWaveShaper()
    clip.curve = softClipCurve() as Float32Array<ArrayBuffer>
    clip.oversample = 'none' // n'agit que sur de rares crêtes, derrière le limiteur
    this.masterIn.connect(this.master).connect(glue).connect(limiter).connect(clip).connect(ctx.destination)
    this.output = clip
    // ─ monde (+ égaliseur de voix, ralenti)
    this.world = g()
    this.voiceEq = ctx.createBiquadFilter()
    this.voiceEq.type = 'peaking'
    this.voiceEq.frequency.value = VOICE_EQ_HZ
    this.voiceEq.Q.value = VOICE_EQ_Q
    this.voiceEq.gain.value = 0
    this.slowmoFilter = ctx.createBiquadFilter()
    this.slowmoFilter.type = 'lowpass'
    this.slowmoFilter.frequency.value = 20000
    this.slowmoFilter.Q.value = 0.5
    this.world.connect(this.voiceEq).connect(this.slowmoFilter).connect(this.masterIn)
    // ─ bus
    this.buses = { music: g(), sfx: g(), amb: g(), ui: g(), voice: g() }
    this.duckMusic = g()
    this.duckAmb = g()
    this.sfxDuck = g()
    this.uiDuck = g()
    this.musicDip = g()
    this.musicPause = ctx.createBiquadFilter()
    this.musicPause.type = 'lowpass'
    this.musicPause.frequency.value = 20000
    this.musicPause.Q.value = 0.6
    this.musicPauseGain = g()
    this.buses.music.connect(this.duckMusic).connect(this.musicDip).connect(this.musicPause).connect(this.musicPauseGain).connect(this.world)
    this.buses.amb.connect(this.duckAmb).connect(this.world)
    this.buses.sfx.connect(this.sfxDuck).connect(this.world)
    this.buses.ui.connect(this.uiDuck).connect(this.masterIn)
    this.buses.voice.connect(this.masterIn)
    // ─ réverbe partagée : une seule convolution (la plus chère des briques), entrée mono
    //   (2 convolutions au lieu de 4), 2,8 s ; les bruitages y envoient peu, la musique plus.
    const verbIn = g()
    verbIn.channelCount = 1
    verbIn.channelCountMode = 'explicit'
    const verb = ctx.createConvolver()
    verb.buffer = impulseResponse(ctx, { seconds: 2.8, preDelay: 0.025, brightness: 0.5, seed: 11 })
    verbIn.connect(verb)
    // les envois sont pris avant les bus : leurs gains copient volume, ducking et pause
    this.sfxReverbSend = g()
    this.sfxSendVol = g()
    this.sfxSendDuck = g()
    this.sfxReverbSend.connect(this.sfxSendVol).connect(this.sfxSendDuck).connect(verbIn)
    this.musicReverbSend = g()
    this.musicSendVol = g()
    this.musicSendDuck = g()
    this.musicSendPause = g()
    this.musicReverbSend.connect(this.musicSendVol).connect(this.musicSendDuck).connect(this.musicSendPause).connect(verbIn)
    // retours : dans le monde (ralenti compris), la part musique suit le volume musique
    const verbOut = g(0.9)
    verb.connect(verbOut).connect(this.world)
    this.verbOut = verbOut
    this.assets = new AssetStore(ctx)
    if (this.offline) this.unlockedFlag = true
    else this.installUnlock()
  }

  // ─── Volumes, ducking, pause, ralenti ───────────────────────────────────

  /**
   * Horloge de référence. En temps réel : ctx.currentTime. Pour un rendu hors ligne, la page de
   * dev avance `timeCursor` à la main (tous les sons se programment alors à cet instant).
   */
  timeCursor: number | null = null

  get now(): number {
    return this.timeCursor ?? this.ctx.currentTime
  }

  setVolumes(v: Volumes, seconds = 0.06): void {
    const t = this.now
    rampTo(this.master.gain, sliderToGain(v.master), t, seconds)
    rampTo(this.buses.music.gain, sliderToGain(v.music), t, seconds)
    rampTo(this.musicSendVol.gain, sliderToGain(v.music), t, seconds)
    rampTo(this.buses.sfx.gain, sliderToGain(v.sfx) * dbToGain(SFX_TRIM_DB), t, seconds)
    rampTo(this.sfxSendVol.gain, sliderToGain(v.sfx) * dbToGain(SFX_TRIM_DB), t, seconds)
    rampTo(this.buses.ui.gain, sliderToGain(v.sfx), t, seconds)
    rampTo(this.buses.amb.gain, sliderToGain(v.sfx) * dbToGain(AMB_TRIM_DB), t, seconds)
    rampTo(this.buses.voice.gain, sliderToGain(v.voice) * dbToGain(VOICE_TRIM_DB), t, seconds)
  }

  /**
   * Ducking du narrateur : musique, ambiance et interface à RULES.narratorDuckDb (−6 dB),
   * bruitages à SFX_DUCK_DB, creux de VOICE_EQ_DB à 2,5 kHz sur le monde ; rampe de
   * RULES.narratorDuckAttackMs, relâche de RULES.narratorDuckReleaseMs. Compté (imbrication sûre).
   */
  duck(on: boolean, when = this.now): void {
    this.duckCount = Math.max(0, this.duckCount + (on ? 1 : -1))
    const active = this.duckCount > 0
    const target = active ? dbToGain(RULES.narratorDuckDb) : 1
    const sfx = active ? dbToGain(SFX_DUCK_DB) : 1
    const secs = (active ? RULES.narratorDuckAttackMs : RULES.narratorDuckReleaseMs) / 1000
    rampTo(this.duckMusic.gain, target, when, secs)
    rampTo(this.musicSendDuck.gain, target, when, secs)
    rampTo(this.duckAmb.gain, target, when, secs)
    rampTo(this.uiDuck.gain, target, when, secs)
    rampTo(this.sfxDuck.gain, sfx, when, secs)
    rampTo(this.sfxSendDuck.gain, sfx, when, secs)
    rampTo(this.voiceEq.gain, active ? VOICE_EQ_DB : 0, when, secs)
  }

  /** Voix du narrateur en cours (ducking actif). */
  get ducking(): boolean {
    return this.duckCount > 0
  }

  private dipUntil = -1

  /**
   * Creux bref de la musique sous un accent (couronne, gros vol, esquive) : `db` en 30 ms, tenu
   * `seconds`, retour en 150 ms. Ignoré si un creux est déjà en cours (pas de pompage).
   */
  dipMusic(db: number, seconds: number, when = this.now): void {
    if (when < this.dipUntil) return
    const p = this.musicDip.gain
    const low = dbToGain(db)
    p.cancelScheduledValues(when)
    p.setValueAtTime(1, when)
    p.linearRampToValueAtTime(low, when + 0.03)
    p.setValueAtTime(low, when + 0.03 + seconds)
    p.linearRampToValueAtTime(1, when + 0.18 + seconds)
    this.dipUntil = when + 0.18 + seconds
  }

  /**
   * Silence du gel de la nuit : tout le monde (musique, ambiance, bruitages, réverbe) se tait
   * en 120 ms pendant `seconds`, puis revient en 80 ms. Les compresseurs du master relèvent de
   * ~9 dB ce qui reste du vent et des queues de réverbe : sans cette coupure, le « silence »
   * mesuré était un creux à −37 dBFS.
   */
  silenceWorld(seconds: number, when = this.now): void {
    const p = this.world.gain
    p.cancelScheduledValues(when)
    p.setValueAtTime(1, when)
    p.linearRampToValueAtTime(0, when + 0.12)
    p.setValueAtTime(0, when + seconds)
    p.linearRampToValueAtTime(1, when + seconds + 0.08)
  }

  /** Pause : musique étouffée (passe-bas 400 Hz, −8 dB). */
  setPaused(paused: boolean): void {
    const t = this.now
    rampTo(this.musicPause.frequency, paused ? 400 : 20000, t, paused ? 0.35 : 0.6)
    rampTo(this.musicPauseGain.gain, paused ? dbToGain(-8) : 1, t, 0.35)
    rampTo(this.musicSendPause.gain, paused ? dbToGain(-14) : 1, t, 0.35)
  }

  private lastScale = 1

  /** Ralenti de la simulation : le monde s'étouffe (timeScale 0,35 → coupure vers 2 kHz). */
  setTimeScale(timeScale: number): void {
    const s = clamp(timeScale, 0, 1)
    if (Math.abs(s - this.lastScale) < 0.01) return
    this.lastScale = s
    const cutoff = s >= 0.98 ? 20000 : 1400 * Math.pow(20000 / 1400, s)
    glide(this.slowmoFilter.frequency, cutoff, this.now, 0.08)
  }

  // ─── Spatialisation ─────────────────────────────────────────────────────

  /** Panoramique (−0,8..0,8) et atténuation pour un point du monde, selon le cadre caméra. */
  spatial(x: number, y: number): { pan: number; gain: number } {
    const l = this.listener
    const dx = (x - l.x) / Math.max(l.halfWidth, 1)
    const dy = (y - l.y) / Math.max(l.halfHeight, 1)
    const d = Math.max(Math.abs(dx), Math.abs(dy))
    const gain = d <= 1 ? 1 - 0.12 * d : Math.max(0.3, 0.88 - (d - 1) * 0.5)
    return { pan: clamp(dx, -1, 1) * 0.8, gain }
  }

  // ─── Déverrouillage (politique d'autoplay) ──────────────────────────────

  get unlocked(): boolean {
    return this.unlockedFlag
  }

  onUnlock(cb: () => void): () => void {
    if (this.unlockedFlag) {
      cb()
      return () => {}
    }
    this.unlockCbs.add(cb)
    return () => this.unlockCbs.delete(cb)
  }

  private installUnlock(): void {
    const ctx = this.ctx as AudioContext
    const events = ['pointerdown', 'keydown', 'touchend', 'mousedown'] as const
    const tryUnlock = () => {
      if (ctx.state !== 'running') void ctx.resume().catch(() => {})
      // tampon silencieux : nécessaire à Safari iOS
      const src = ctx.createBufferSource()
      src.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
      src.connect(ctx.destination)
      src.start()
    }
    const onState = () => {
      if (ctx.state === 'running' && !this.unlockedFlag) {
        this.unlockedFlag = true
        for (const e of events) window.removeEventListener(e, tryUnlock, true)
        for (const cb of this.unlockCbs) cb()
        this.unlockCbs.clear()
      }
    }
    ctx.addEventListener('statechange', onState)
    for (const e of events) window.addEventListener(e, tryUnlock, true)
    // Onglet caché puis revenu : Chrome peut suspendre le contexte
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden && this.unlockedFlag && ctx.state !== 'running') void ctx.resume().catch(() => {})
    })
    onState()
  }

  // ─── Mesure (pages de dev) ──────────────────────────────────────────────

  /** Analyseur branché en parallèle d'un bus (ou du master), créé à la demande. */
  tap(name: BusName | 'master'): AnalyserNode {
    let a = this.taps.get(name)
    if (!a) {
      a = this.ctx.createAnalyser()
      a.fftSize = 4096
      a.smoothingTimeConstant = 0
      ;(name === 'master' ? this.output : this.buses[name]).connect(a)
      this.taps.set(name, a)
    }
    return a
  }
}

// ─── Chargement des fichiers ───────────────────────────────────────────────

/** Tampon généré par le code (pas de fichier). */
export type ProcId = `proc_${string}`
/** Tout ce que le lecteur de sons sait jouer : un fichier du manifeste ou un tampon généré. */
export type SoundFile = AssetId | ProcId
const PROC_LOUDNESS = new Map<string, number>()
/** Sonie momentanée maximale (LUFS) d'un son, pour le régler en sonie perçue. */
export function soundLoudness(id: SoundFile): number {
  return id.startsWith('proc_') ? (PROC_LOUDNESS.get(id) ?? -18) : AUDIO_ASSETS[id as AssetId].mmax
}

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/')
export const assetUrl = (id: AssetId): string => BASE + AUDIO_ASSETS[id].url

/**
 * Cache des tampons décodés. Téléchargement en flux (progression à l'octet près), décodage,
 * au plus 6 fichiers en parallèle. Un fichier en échec renvoie null (un seul avertissement).
 */
export class AssetStore {
  private buffers = new Map<SoundFile, AudioBuffer>()
  private pending = new Map<AssetId, Promise<AudioBuffer | null>>()
  private active = 0
  private queue: (() => void)[] = []
  private warned = new Set<string>()

  constructor(readonly ctx: BaseAudioContext) {}

  get(id: SoundFile): AudioBuffer | undefined {
    return this.buffers.get(id)
  }

  has(id: SoundFile): boolean {
    return this.buffers.has(id)
  }

  /** Enregistre un tampon produit par le code (`proc_*`) avec sa sonie momentanée max (LUFS). */
  put(id: ProcId, buf: AudioBuffer, mmax: number): void {
    this.buffers.set(id, buf)
    PROC_LOUDNESS.set(id, mmax)
  }

  load(id: AssetId, onBytes?: (loaded: number) => void): Promise<AudioBuffer | null> {
    const have = this.buffers.get(id)
    if (have) return Promise.resolve(have)
    let p = this.pending.get(id)
    if (!p) {
      p = this.slot(() => this.fetchDecode(id, onBytes))
      this.pending.set(id, p)
    }
    return p
  }

  /**
   * Précharge une liste ; `onProgress(0..1)` suit les octets téléchargés (85 %) puis décodés (15 %).
   */
  async preload(ids: readonly AssetId[], onProgress?: (p: number) => void): Promise<void> {
    const todo = ids.filter(id => !this.buffers.has(id))
    const total = todo.reduce((s, id) => s + AUDIO_ASSETS[id].bytes, 0) || 1
    const got = new Map<AssetId, number>()
    let decodedBytes = 0
    const report = () => {
      let dl = 0
      for (const v of got.values()) dl += v
      onProgress?.(Math.min(1, (0.85 * dl + 0.15 * decodedBytes) / total))
    }
    report()
    await Promise.all(
      todo.map(id =>
        this.load(id, b => {
          got.set(id, b)
          report()
        }).then(() => {
          got.set(id, AUDIO_ASSETS[id].bytes)
          decodedBytes += AUDIO_ASSETS[id].bytes
          report()
        }),
      ),
    )
    onProgress?.(1)
  }

  private slot<T>(job: () => Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const run = () => {
        this.active++
        job()
          .then(resolve, reject)
          .finally(() => {
            this.active--
            this.queue.shift()?.()
          })
      }
      if (this.active < 6) run()
      else this.queue.push(run)
    })
  }

  private async fetchDecode(id: AssetId, onBytes?: (loaded: number) => void): Promise<AudioBuffer | null> {
    const url = assetUrl(id)
    try {
      const res = await fetch(url)
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      let data: ArrayBuffer
      if (res.body && onBytes) {
        const reader = res.body.getReader()
        const chunks: Uint8Array[] = []
        let n = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          chunks.push(value)
          n += value.byteLength
          onBytes(n)
        }
        const all = new Uint8Array(n)
        let o = 0
        for (const c of chunks) {
          all.set(c, o)
          o += c.byteLength
        }
        data = all.buffer
      } else data = await res.arrayBuffer()
      const buf = await this.ctx.decodeAudioData(data)
      this.buffers.set(id, buf)
      return buf
    } catch (err) {
      if (!this.warned.has(id)) {
        this.warned.add(id)
        console.warn(`[audio] échec du chargement de ${url}`, err)
      }
      this.pending.delete(id)
      return null
    }
  }
}

/** Fichiers à charger avant l'écran titre (interface, compte à rebours, sons de manche essentiels). */
export const CRITICAL_ASSETS: AssetId[] = (Object.keys(AUDIO_ASSETS) as AssetId[]).filter(
  id => AUDIO_ASSETS[id].group === 'critical',
)
/** Le reste (hors pistes en streaming), chargé en tâche de fond après le titre. */
export const LAZY_ASSETS: AssetId[] = (Object.keys(AUDIO_ASSETS) as AssetId[]).filter(id => AUDIO_ASSETS[id].group === 'lazy')
