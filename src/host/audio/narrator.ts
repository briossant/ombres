// Lecture du narrateur (le CHOIX des répliques est fait par src/director) : voix pré-générée
// public/audio/narrator/<lang>/<lineId>[.<colorIndex>].mp3 (manifest.json), ducking de la
// musique et de l'ambiance, et sous-titre publié sur subtitleEvents — même si la voix manque
// ou si le réglage narrateur vaut 'text'. Rien du tout si 'off'.
import { indexNarratorManifest, narratorClipId, narratorTextParts, subtitleSeconds, type NarratorClipIndex, type NarratorManifest } from '../../director/index.ts'
import { getLang, hasKey } from '../../shared/i18n.ts'
import type { Lang } from '../../shared/protocol.ts'
import { subtitleEvents } from '../bus.ts'
import { getSettings } from '../settings.ts'
import type { AudioEngine } from './engine.ts'

export interface NarratorRequest {
  /** Id de réplique (catalogue src/director/lines.ts), ex. 'leaderChange2'. */
  lineId: string
  /** Couleur nommée (index PLAYER_COLORS), absente pour une réplique neutre. */
  colorIndex?: number
  /** Langue (défaut : langue courante). */
  lang?: Lang
  /** Clé i18n du texte (défaut : `narrator.<lineId>`). */
  key?: string
}

export interface NarratorPlayback {
  /** Sous-titre affiché (false si narrateur désactivé). */
  shown: boolean
  /** Voix jouée. */
  voiced: boolean
  /** Durée d'affichage (s). */
  duration: number
  /** Résolue à la fin de l'affichage (ou à l'interruption). */
  done: Promise<void>
}

const BASE = (import.meta.env?.BASE_URL ?? '/').replace(/\/?$/, '/') + 'audio/narrator/'

export class NarratorPlayer {
  private index: NarratorClipIndex | null = null
  private manifestText = new Map<string, string>()
  private manifestLoad: Promise<void> | null = null
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private current: { id: number; src: AudioBufferSourceNode | null; gain: GainNode | null; timer: ReturnType<typeof setTimeout> | null; resolve: () => void } | null = null
  private nextId = 1

  constructor(readonly engine: AudioEngine) {}

  /** Charge le manifeste des voix (une fois ; absent = sous-titres seuls). */
  loadManifest(): Promise<void> {
    if (!this.manifestLoad) {
      this.manifestLoad = fetch(BASE + 'manifest.json')
        .then(r => (r.ok ? (r.json() as Promise<NarratorManifest>) : null))
        .then(m => {
          if (!m) return
          this.index = indexNarratorManifest(m)
          for (const l of m.lines) if (l.text) this.manifestText.set(`${l.lang}/${l.id}`, l.text)
        })
        .catch(() => {
          // pas de voix : les sous-titres suffisent
        })
    }
    return this.manifestLoad
  }

  /**
   * Précharge les clips d'une partie : répliques neutres + celles des couleurs présentes,
   * dans la langue active (≈ 100 clips courts, décodés à l'avance).
   */
  async preload(lang: Lang, colorIndices: readonly number[]): Promise<void> {
    await this.loadManifest()
    if (!this.index || getSettings().narrator !== 'voice') return
    await Promise.all(this.index.preload(lang, colorIndices).map(f => this.buffer(f)))
  }

  play(req: NarratorRequest): NarratorPlayback {
    const mode = getSettings().narrator
    if (mode === 'off') return { shown: false, voiced: false, duration: 0, done: Promise.resolve() }
    const lang = req.lang ?? getLang()
    const key = req.key ?? `narrator.${req.lineId}`
    let parts = narratorTextParts({ key, colorIndex: req.colorIndex }, lang)
    // clé absente du catalogue : texte du manifeste (sinon l'identifiant, visible en dev)
    if (!hasKey(key)) {
      const txt = this.manifestText.get(`${lang}/${narratorClipId(req.lineId, req.colorIndex)}`)
      if (txt) parts = [{ text: txt }]
    }
    const text = parts.map(p => p.text).join('')
    const file = this.index?.file(lang, req.lineId, req.colorIndex)
    const clipDur = this.index?.duration(lang, req.lineId, req.colorIndex)
    const wantVoice = mode === 'voice' && file !== undefined
    const duration = subtitleSeconds({ key, colorIndex: req.colorIndex, duration: clipDur ?? 0 }, wantVoice && clipDur !== undefined, lang)
    this.interrupt()
    const id = this.nextId++
    let resolve!: () => void
    const done = new Promise<void>(r => (resolve = r))
    const cur = (this.current = { id, src: null as AudioBufferSourceNode | null, gain: null as GainNode | null, timer: null as ReturnType<typeof setTimeout> | null, resolve })
    subtitleEvents.emit({
      type: 'show',
      id,
      lineId: req.lineId,
      text,
      parts,
      ...(req.colorIndex !== undefined ? { colorIndex: req.colorIndex } : {}),
      lang,
      durationMs: Math.round(duration * 1000),
      voiced: wantVoice,
    })
    cur.timer = setTimeout(() => this.finish(id), duration * 1000)
    if (wantVoice) {
      void this.buffer(file!).then(buf => {
        if (!buf || this.current?.id !== id) return
        const e = this.engine
        const src = e.ctx.createBufferSource()
        src.buffer = buf
        const g = e.ctx.createGain()
        src.connect(g).connect(e.buses.voice)
        const t = e.now + 0.01
        e.duck(true, t)
        src.start(t)
        src.onended = () => {
          if (cur.src === src) {
            cur.src = null
            e.duck(false)
          }
          g.disconnect()
        }
        cur.src = src
        cur.gain = g
      })
    }
    return { shown: true, voiced: wantVoice, duration, done }
  }

  /** Coupe la réplique en cours (fondu de 60 ms) et retire son sous-titre. */
  interrupt(): void {
    const cur = this.current
    if (!cur) return
    this.stopVoice(cur)
    this.finish(cur.id)
  }

  private stopVoice(cur: NonNullable<NarratorPlayer['current']>): void {
    if (!cur.src || !cur.gain) return
    const t = this.engine.now
    cur.gain.gain.setTargetAtTime(0, t, 0.02)
    try {
      cur.src.stop(t + 0.08)
    } catch {
      // déjà finie
    }
    cur.src = null
    this.engine.duck(false)
  }

  private finish(id: number): void {
    const cur = this.current
    if (!cur || cur.id !== id) return
    if (cur.timer) clearTimeout(cur.timer)
    this.current = null
    subtitleEvents.emit({ type: 'hide', id })
    cur.resolve()
  }

  private buffer(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file)
    if (!p) {
      p = fetch(BASE + file)
        .then(r => (r.ok ? r.arrayBuffer() : Promise.reject(new Error(`HTTP ${r.status}`))))
        .then(data => this.engine.ctx.decodeAudioData(data))
        .catch(err => {
          console.warn(`[audio] voix introuvable : ${file}`, err)
          return null
        })
      this.buffers.set(file, p)
    }
    return p
  }
}
