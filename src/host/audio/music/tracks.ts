// Pistes des écrans hors manche.
// - Longues pistes : lues en streaming (<audio> → MediaElementSource), jamais décodées en
//   entier (une piste de 4 min pèserait ~90 Mo en PCM). Bouclage par fondu enchaîné entre deux
//   éléments, 4 s avant la fin : pas de trou au rebouclage.
// - Boucle courte (lobby) : tampon décodé, bouclage à l'échantillon près.
import { assetUrl, type AudioEngine } from '../engine.ts'
import { AUDIO_ASSETS, type AssetId } from '../manifest.gen.ts'
import { dbToGain, rampTo } from '../util.ts'

export interface Track {
  readonly id: AssetId
  /** Démarre avec un fondu d'entrée ; `startAt` (s) : départ dans le fichier (défaut : START_AT). */
  start(fadeIn: number, delay?: number, startAt?: number): void
  /** Relance la lecture si le navigateur l'avait refusée (avant le premier geste). */
  resume(): void
  /** Fondu de sortie puis libération. */
  stop(fadeOut: number): void
  /** Gain de la piste (dB, rampe). */
  setDb(db: number, seconds?: number): void
}

/** Sonie visée des pistes (LUFS intégrés, bus musique à 1) : fichiers normalisés à −18. */
const TRACK_DB = -2
/**
 * Correction par piste (dB). Titre : +2 dB, et départ à 13 s (voir START_AT) : la piste ouvre
 * sur 13 s à −33/−38 LUFS, on n'entendait presque rien au premier clic.
 */
const TRACK_TRIM: Partial<Record<AssetId, number>> = { title_zhelanov_ambient_1: 2 }
/** Début de lecture (s) : on saute les introductions presque muettes. */
const START_AT: Partial<Record<AssetId, number>> = { podium_cynicmusic_lifewave2k: 4.6, title_zhelanov_ambient_1: 13 }
/**
 * Résultats de manche : départs successifs sur des débuts de section du morceau (mesurés : nouveauté
 * spectrale et attaques, sections toutes les ~23 s), pour ne pas réentendre cinq fois la même intro.
 */
export const RESULTS_STARTS = [0, 43.95, 90.4, 21.85, 67.3] as const

const trackDb = (id: AssetId, db = 0): number => dbToGain(TRACK_DB + (TRACK_TRIM[id] ?? 0) + db)

/**
 * Lecteur de flux réutilisable : <audio> + sa source WebAudio + son gain (branchés une fois pour
 * toutes). Fuite corrigée (polish tech, vague 2) : Chrome garde en vie une MediaElementAudioSourceNode
 * — et son élément — tant que le contexte audio existe, même débranchée ; en créer deux par piste
 * jouée les accumulait (+14 éléments et nœuds par cycle de 3 parties, salon, titre, crédits). Les
 * lecteurs libérés retournent dans une réserve par contexte et resservent à la piste suivante.
 */
interface StreamVoice {
  el: HTMLAudioElement
  g: GainNode
}
const voicePool = new WeakMap<AudioEngine, StreamVoice[]>()

function takeVoice(engine: AudioEngine): StreamVoice {
  const free = voicePool.get(engine)
  const v = free?.pop()
  if (v) return v
  const ctx = engine.ctx as AudioContext
  const el = new Audio()
  el.crossOrigin = 'anonymous'
  const g = ctx.createGain()
  ctx.createMediaElementSource(el).connect(g)
  return { el, g }
}

function releaseVoice(engine: AudioEngine, v: StreamVoice): void {
  v.el.pause()
  v.el.removeAttribute('src')
  v.el.load()
  v.g.disconnect()
  let free = voicePool.get(engine)
  if (!free) voicePool.set(engine, (free = []))
  free.push(v)
}

class StreamTrack implements Track {
  private readonly out: GainNode
  private readonly voices: StreamVoice[] = []
  private readonly els: HTMLAudioElement[] = []
  private readonly gains: GainNode[] = []
  private active = 0
  private timer: ReturnType<typeof setInterval> | null = null
  private stopped = false
  private readonly xfade = 4

  constructor(
    private readonly engine: AudioEngine,
    readonly id: AssetId,
  ) {
    const ctx = engine.ctx as AudioContext
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(engine.buses.music)
    for (let i = 0; i < 2; i++) {
      const v = takeVoice(engine)
      const { el, g } = v
      el.preload = i === 0 ? 'auto' : 'none'
      el.src = assetUrl(id)
      g.gain.cancelScheduledValues(0)
      g.gain.value = i === 0 ? 1 : 0
      g.connect(this.out)
      this.voices.push(v)
      this.els.push(el)
      this.gains.push(g)
    }
  }

  start(fadeIn: number, delay = 0, startAt?: number): void {
    const e = this.engine
    const t = e.now + delay
    const target = trackDb(this.id)
    this.out.gain.cancelScheduledValues(e.now)
    this.out.gain.setValueAtTime(0, e.now)
    this.out.gain.setValueAtTime(0, t)
    this.out.gain.linearRampToValueAtTime(target, t + Math.max(0.05, fadeIn))
    const go = () => {
      if (this.stopped) return
      const el = this.els[0]!
      el.currentTime = startAt ?? START_AT[this.id] ?? 0
      void el.play().catch(() => {
        // lecture refusée (pas encore de geste) : resume() la relancera au déverrouillage
      })
    }
    if (delay > 0) setTimeout(go, delay * 1000)
    else go()
    // surveillance du rebouclage
    this.timer = setInterval(() => this.watch(), 250)
  }

  resume(): void {
    if (this.stopped) return
    const el = this.els[this.active]!
    if (!el.paused) return
    // la lecture démarre enfin : nouveau fondu d'entrée, pas d'arrivée brutale
    const t = this.engine.now
    this.out.gain.cancelScheduledValues(t)
    this.out.gain.setValueAtTime(0, t)
    this.out.gain.linearRampToValueAtTime(trackDb(this.id), t + 2.5)
    void el.play().catch(() => {})
  }

  private watch(): void {
    const el = this.els[this.active]!
    const dur = el.duration || AUDIO_ASSETS[this.id].duration
    if (!Number.isFinite(dur) || el.paused) return
    if (dur - el.currentTime < this.xfade + 0.3) {
      // fondu enchaîné vers l'autre élément, reparti du début
      const next = 1 - this.active
      const n = this.els[next]!
      n.currentTime = 0
      void n.play().catch(() => {})
      const t = this.engine.now
      const gOld = this.gains[this.active]!.gain, gNew = this.gains[next]!.gain
      gOld.cancelScheduledValues(t)
      gOld.setValueAtTime(gOld.value, t)
      gOld.linearRampToValueAtTime(0, t + this.xfade)
      gNew.cancelScheduledValues(t)
      gNew.setValueAtTime(0, t)
      gNew.linearRampToValueAtTime(1, t + this.xfade)
      const old = el
      // piste arrêtée entre-temps : l'élément est peut-être déjà reparti dans une autre piste
      setTimeout(() => !this.stopped && old.pause(), (this.xfade + 0.5) * 1000)
      this.active = next
    }
  }

  stop(fadeOut: number): void {
    if (this.stopped) return
    this.stopped = true
    const t = this.engine.now
    const g = this.out.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + Math.max(0.05, fadeOut))
    if (this.timer) clearInterval(this.timer)
    setTimeout(() => {
      // lecteurs rendus à la réserve (voir StreamVoice) : ni nouvel <audio> ni nouvelle source ensuite
      for (const v of this.voices) releaseVoice(this.engine, v)
      this.out.disconnect()
    }, (fadeOut + 0.3) * 1000)
  }

  setDb(db: number, seconds = 1): void {
    rampTo(this.out.gain, trackDb(this.id, db), this.engine.now, seconds)
  }
}

/**
 * Variation d'une boucle courte : un passage sur deux est « B » (un peu plus sourd et plus bas),
 * transitions lentes. La boucle du salon (24,5 s) devient un cycle de 49 s qui respire.
 */
const LOOP_B = { lowpassHz: 1900, db: -2.5, fade: 3 }

class BufferTrack implements Track {
  private readonly out: GainNode
  /** Variation A/B (passage sur deux) : passe-bas et gain automatisés aux coutures de la boucle. */
  private readonly varFilter: BiquadFilterNode
  private readonly varGain: GainNode
  private src: AudioBufferSourceNode | null = null
  private stopped = false
  private varTimer: ReturnType<typeof setInterval> | null = null
  private varNext = 0

  constructor(
    private readonly engine: AudioEngine,
    readonly id: AssetId,
  ) {
    const ctx = engine.ctx
    this.out = ctx.createGain()
    this.out.gain.value = 0
    this.varFilter = ctx.createBiquadFilter()
    this.varFilter.type = 'lowpass'
    this.varFilter.frequency.value = 20000
    this.varFilter.Q.value = 0.5
    this.varGain = ctx.createGain()
    this.varFilter.connect(this.varGain).connect(this.out)
    this.out.connect(engine.buses.music)
  }

  start(fadeIn: number, delay = 0, startAt = 0): void {
    const e = this.engine
    void e.assets.load(this.id).then(buf => {
      if (!buf || this.stopped) return
      const t = Math.max(e.now, e.now + delay)
      const src = e.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(this.varFilter)
      const offset = startAt % buf.duration
      src.start(t, offset)
      this.src = src
      this.out.gain.setValueAtTime(0, t)
      this.out.gain.linearRampToValueAtTime(trackDb(this.id), t + Math.max(0.05, fadeIn))
      // coutures de la boucle : A, B, A, B… (programmées un passage à l'avance)
      if (buf.duration < 60) {
        const firstSeam = t + (buf.duration - offset)
        this.varNext = 0
        const plan = () => {
          while (!this.stopped && firstSeam + this.varNext * buf.duration < e.now + buf.duration * 1.5) {
            const seam = firstSeam + this.varNext * buf.duration
            const b = this.varNext % 2 === 0 // premier passage complet : B
            const f = this.varFilter.frequency, g = this.varGain.gain
            const t0 = Math.max(e.now, seam - LOOP_B.fade / 2)
            f.setValueAtTime(b ? 20000 : LOOP_B.lowpassHz, t0)
            f.exponentialRampToValueAtTime(b ? LOOP_B.lowpassHz : 20000, t0 + LOOP_B.fade)
            g.setValueAtTime(b ? 1 : dbToGain(LOOP_B.db), t0)
            g.linearRampToValueAtTime(b ? dbToGain(LOOP_B.db) : 1, t0 + LOOP_B.fade)
            this.varNext++
          }
        }
        plan()
        if (!e.offline) this.varTimer = setInterval(plan, 5000)
      }
    })
  }

  stop(fadeOut: number): void {
    if (this.stopped) return
    this.stopped = true
    const t = this.engine.now
    const g = this.out.gain
    g.cancelScheduledValues(t)
    g.setValueAtTime(g.value, t)
    g.linearRampToValueAtTime(0, t + Math.max(0.05, fadeOut))
    try {
      this.src?.stop(t + fadeOut + 0.05)
    } catch {
      // pas encore démarrée
    }
    if (this.varTimer) clearInterval(this.varTimer)
    setTimeout(() => this.out.disconnect(), (fadeOut + 0.5) * 1000)
  }

  setDb(db: number, seconds = 1): void {
    rampTo(this.out.gain, trackDb(this.id, db), this.engine.now, seconds)
  }

  resume(): void {
    // tampon WebAudio : il démarre avec le contexte, rien à relancer
  }
}

/** Piste adaptée au fichier : tampon pour les boucles courtes, streaming pour le reste. */
export function createTrack(engine: AudioEngine, id: AssetId): Track | null {
  const a = AUDIO_ASSETS[id]
  if (a.group === 'stream') {
    if (engine.offline || typeof Audio === 'undefined') return null
    return new StreamTrack(engine, id)
  }
  return new BufferTrack(engine, id)
}
