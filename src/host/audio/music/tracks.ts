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
  /** Démarre avec un fondu d'entrée. */
  start(fadeIn: number, delay?: number): void
  /** Relance la lecture si le navigateur l'avait refusée (avant le premier geste). */
  resume(): void
  /** Fondu de sortie puis libération. */
  stop(fadeOut: number): void
  /** Gain de la piste (dB, rampe). */
  setDb(db: number, seconds?: number): void
}

/** Sonie visée des pistes (LUFS intégrés, bus musique à 1) : fichiers normalisés à −18. */
const TRACK_DB = -2
/** Début de lecture (s) : on saute les introductions presque muettes. */
const START_AT: Partial<Record<AssetId, number>> = { podium_cynicmusic_lifewave2k: 4.6 }

class StreamTrack implements Track {
  private readonly out: GainNode
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
      const el = new Audio()
      el.crossOrigin = 'anonymous'
      el.preload = i === 0 ? 'auto' : 'none'
      el.src = assetUrl(id)
      const g = ctx.createGain()
      g.gain.value = i === 0 ? 1 : 0
      ctx.createMediaElementSource(el).connect(g).connect(this.out)
      this.els.push(el)
      this.gains.push(g)
    }
  }

  start(fadeIn: number, delay = 0): void {
    const e = this.engine
    const t = e.now + delay
    const target = dbToGain(TRACK_DB)
    this.out.gain.cancelScheduledValues(e.now)
    this.out.gain.setValueAtTime(0, e.now)
    this.out.gain.setValueAtTime(0, t)
    this.out.gain.linearRampToValueAtTime(target, t + Math.max(0.05, fadeIn))
    const go = () => {
      if (this.stopped) return
      const el = this.els[0]!
      el.currentTime = START_AT[this.id] ?? 0
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
    this.out.gain.linearRampToValueAtTime(dbToGain(TRACK_DB), t + 2.5)
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
      setTimeout(() => old.pause(), (this.xfade + 0.5) * 1000)
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
      for (const el of this.els) {
        el.pause()
        el.removeAttribute('src')
        el.load()
      }
      this.out.disconnect()
    }, (fadeOut + 0.3) * 1000)
  }

  setDb(db: number, seconds = 1): void {
    rampTo(this.out.gain, dbToGain(TRACK_DB + db), this.engine.now, seconds)
  }
}

class BufferTrack implements Track {
  private readonly out: GainNode
  private src: AudioBufferSourceNode | null = null
  private stopped = false

  constructor(
    private readonly engine: AudioEngine,
    readonly id: AssetId,
  ) {
    this.out = engine.ctx.createGain()
    this.out.gain.value = 0
    this.out.connect(engine.buses.music)
  }

  start(fadeIn: number, delay = 0): void {
    const e = this.engine
    void e.assets.load(this.id).then(buf => {
      if (!buf || this.stopped) return
      const t = Math.max(e.now, e.now + delay)
      const src = e.ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      src.connect(this.out)
      src.start(t)
      this.src = src
      this.out.gain.setValueAtTime(0, t)
      this.out.gain.linearRampToValueAtTime(dbToGain(TRACK_DB), t + Math.max(0.05, fadeIn))
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
    setTimeout(() => this.out.disconnect(), (fadeOut + 0.5) * 1000)
  }

  setDb(db: number, seconds = 1): void {
    rampTo(this.out.gain, dbToGain(TRACK_DB + db), this.engine.now, seconds)
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
