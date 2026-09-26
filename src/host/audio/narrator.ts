// Lecture du narrateur (le CHOIX des répliques est fait par src/director) : voix pré-générée
// public/audio/narrator/<lang>/<lineId>[.<colorIndex>].mp3 (manifest.json), ducking du monde
// (AudioEngine.duck) et sous-titre publié sur subtitleEvents — même si la voix manque ou si le
// réglage narrateur vaut 'text'. Rien du tout si 'off'. Le sous-titre est retiré (« hide ») à la
// fin de l'affichage prévu, ou à la fin réelle de la voix si elle sonne encore.
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

/**
 * Une voix à qui il reste moins que ceci n'est pas coupée par la réplique suivante : celle-ci
 * attend sa fin (l'horloge audio peut prendre du retard sur la machine quand le thread audio est
 * chargé, et le directeur, qui compte en temps réel, croit alors la réplique précédente finie).
 */
const LET_FINISH_S = 0.8
/** Silence entre la fin d'une voix et la réplique qui l'attendait (s). */
const LET_FINISH_GAP_S = 0.12
/** Attente maximale (s réelles) : si l'horloge audio est figée, on finit par couper. */
const LET_FINISH_MAX_WAIT_S = 2

interface Prepared {
  req: NarratorRequest
  lang: Lang
  parts: ReturnType<typeof narratorTextParts>
  text: string
  file: string | undefined
  wantVoice: boolean
  duration: number
}

interface Playing {
  id: number
  src: AudioBufferSourceNode | null
  gain: GainNode | null
  /** Fin prévue de la voix (horloge audio), NaN tant qu'elle n'a pas démarré. */
  endsAt: number
  timer: ReturnType<typeof setTimeout> | null
  /** Durée d'affichage écoulée : le sous-titre part dès que la voix se tait. */
  timeUp: boolean
  resolve: () => void
}

export class NarratorPlayer {
  private index: NarratorClipIndex | null = null
  private manifestText = new Map<string, string>()
  private manifestLoad: Promise<void> | null = null
  private buffers = new Map<string, Promise<AudioBuffer | null>>()
  private current: Playing | null = null
  /** Réplique qui attend la fin de la voix en cours. */
  private waiting: { timer: ReturnType<typeof setTimeout>; resolve: () => void } | null = null
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

  /**
   * Joue une réplique. Une voix en cours est coupée (fondu de 60 ms), sauf s'il lui reste moins
   * de LET_FINISH_S : la nouvelle réplique attend alors sa fin.
   */
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
    const prep: Prepared = { req, lang, parts, text, file, wantVoice, duration }
    let resolve!: () => void
    const done = new Promise<void>(r => (resolve = r))
    // une seule réplique en attente : la plus récente l'emporte
    if (this.waiting) {
      clearTimeout(this.waiting.timer)
      this.waiting.resolve()
      this.waiting = null
    }
    const left = this.voiceLeft()
    if (left > 0 && left < LET_FINISH_S) {
      // l'attente est comptée en temps réel, la voix en temps audio (qui peut prendre du retard) :
      // on revérifie à l'échéance, sans jamais attendre plus de LET_FINISH_MAX_WAIT_S
      const giveUpAt = performance.now() + LET_FINISH_MAX_WAIT_S * 1000
      const tryStart = (): void => {
        const l = this.voiceLeft()
        if (l > 0.02 && performance.now() < giveUpAt) {
          this.waiting = { timer: setTimeout(tryStart, (l + LET_FINISH_GAP_S) * 1000), resolve }
          return
        }
        this.waiting = null
        this.start(prep, resolve)
      }
      this.waiting = { timer: setTimeout(tryStart, (left + LET_FINISH_GAP_S) * 1000), resolve }
    } else this.start(prep, resolve)
    return { shown: true, voiced: wantVoice, duration, done }
  }

  /** Temps de voix restant (s, horloge audio) de la réplique en cours ; 0 si aucune voix ne sonne. */
  private voiceLeft(): number {
    const cur = this.current
    if (!cur?.src || !Number.isFinite(cur.endsAt)) return 0
    return Math.max(0, cur.endsAt - this.engine.now)
  }

  private start(prep: Prepared, resolve: () => void): void {
    const { req, wantVoice, duration } = prep
    this.interrupt()
    const id = this.nextId++
    const cur: Playing = (this.current = { id, src: null, gain: null, endsAt: NaN, timer: null, timeUp: false, resolve })
    subtitleEvents.emit({
      type: 'show',
      id,
      lineId: req.lineId,
      text: prep.text,
      parts: prep.parts,
      ...(req.colorIndex !== undefined ? { colorIndex: req.colorIndex } : {}),
      lang: prep.lang,
      durationMs: Math.round(duration * 1000),
      voiced: wantVoice,
    })
    // fin de l'affichage : tout de suite si la voix s'est tue, sinon à la fin réelle de la voix
    cur.timer = setTimeout(() => {
      cur.timer = null
      if (cur.src) cur.timeUp = true
      else this.finish(id)
    }, duration * 1000)
    if (!wantVoice) return
    void this.buffer(prep.file!).then(buf => {
      if (!buf || this.current?.id !== id) return
      const e = this.engine
      const src = e.ctx.createBufferSource()
      src.buffer = buf
      const g = e.ctx.createGain()
      src.connect(g).connect(e.buses.voice)
      const t = e.now + 0.01
      e.duck(true, t)
      src.start(t)
      cur.endsAt = t + buf.duration
      src.onended = () => {
        if (cur.src === src) {
          cur.src = null
          e.duck(false)
          if (cur.timeUp) this.finish(id)
        }
        g.disconnect()
      }
      cur.src = src
      cur.gain = g
    })
  }

  /** Coupe la réplique en cours (fondu de 60 ms) et retire son sous-titre. */
  interrupt(): void {
    const cur = this.current
    if (!cur) return
    this.stopVoice(cur)
    this.finish(cur.id)
  }

  private stopVoice(cur: Playing): void {
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
