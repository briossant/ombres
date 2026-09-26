// API publique de l'audio d'Ombres (voir docs/agent-notes/audio.md).
//
//   initAudio()                      au démarrage (crée le contexte ; déverrouillé au 1er geste)
//   preloadAudio(onProgress)         écran de chargement : sons essentiels, progression réelle
//   setAudioScreen('title' | …)      à chaque changement d'écran (musique + ambiance)
//   setAudioPaused(bool)             pause (musique étouffée ; stinger à jouer à part)
//   playUi('hover' | …, {…})         sons d'interface
//   playStinger('roundWin', {…})     ponctuations (résultats, victoire, pause…)
//   playNarratorLine({lineId, …})    voix + sous-titre (subtitleEvents dans ../bus.ts)
//   setAudioListener({x, y, …})      cadre caméra (panoramique) ; sinon estimé depuis les oiseaux
//   audioWingbeat(slot, force)       optionnel : battement d'aile synchronisé sur l'animation
//
// Les événements de simulation (simEvents) et les volumes des réglages sont suivis tout seuls ;
// la boucle d'animation interne lit gameView à chaque image.
import type { Lang } from '../../shared/protocol.ts'
import type { SimEvent } from '../../sim/types.ts'
import { simEvents, subtitleEvents } from '../bus.ts'
import { getSettings, useSettings } from '../settings.ts'
import { gameView, type GameView } from '../view.ts'
import { Ambience, type AmbienceScene } from './ambience.ts'
import { AudioEngine, CRITICAL_ASSETS, LAZY_ASSETS, type Listener } from './engine.ts'
import { AUDIO_ASSETS } from './manifest.gen.ts'
import { MusicDirector, type AudioScreen } from './music/director.ts'
import { NarratorPlayer, type NarratorPlayback, type NarratorRequest } from './narrator.ts'
import { SfxSystem, type Stinger, type UiOptions, type UiSound } from './sfx.ts'
import { clamp } from './util.ts'

export type { AudioScreen, NarratorPlayback, NarratorRequest, Stinger, UiOptions, UiSound, Listener }

const SCENE_OF: Record<AudioScreen, AmbienceScene> = {
  loading: 'silent',
  title: 'title',
  lobby: 'lobby',
  intro: 'lobby',
  round: 'round',
  roundResults: 'results',
  gameResults: 'results',
  credits: 'credits',
}

/** Système audio complet, branché sur un contexte (temps réel, ou hors ligne pour les mesures). */
export class AudioSystem {
  readonly engine: AudioEngine
  readonly sfx: SfxSystem
  readonly ambience: Ambience
  readonly music: MusicDirector
  readonly narrator: NarratorPlayer
  private raf = 0
  private lastFrame = 0
  private unsubs: (() => void)[] = []

  constructor(
    ctx: BaseAudioContext,
    readonly getView: () => GameView = () => gameView,
  ) {
    this.engine = new AudioEngine(ctx)
    this.sfx = new SfxSystem(this.engine, getView)
    this.ambience = new Ambience(this.engine, getView, this.sfx)
    // les coups de bois des 5 dernières secondes sont joués par la partition, sur le battement
    this.music = new MusicDirector(this.engine, getView, (n, when) => this.sfx.lastSecond(n, when))
    this.sfx.scoreKeepsTime = () => this.music.roundMusic?.drivesLastSeconds ?? false
    this.narrator = new NarratorPlayer(this.engine)
  }

  /** Abonnements (réglages, simulation) et boucle d'image. Temps réel uniquement. */
  start(): void {
    const apply = () => {
      const s = getSettings()
      this.engine.setVolumes({ master: s.volMaster, music: s.volMusic, sfx: s.volSfx, voice: s.volVoice })
    }
    apply()
    this.unsubs.push(useSettings.subscribe(apply))
    this.unsubs.push(simEvents.on(e => this.onSimEvent(e)))
    const loop = (ts: number) => {
      this.raf = requestAnimationFrame(loop)
      const dt = this.lastFrame ? clamp((ts - this.lastFrame) / 1000, 0, 0.1) : 1 / 60
      this.lastFrame = ts
      this.frame(dt)
    }
    this.raf = requestAnimationFrame(loop)
  }

  onSimEvent(e: SimEvent): void {
    this.sfx.handle(e)
    this.music.onSimEvent(e)
  }

  /** Une image : point d'écoute, ralenti, ambiance, sons continus, musique. */
  frame(dt: number): void {
    const view = this.getView()
    if (!this.engine.listenerFromCamera) autoListener(view, this.engine.listener)
    this.engine.setTimeScale(view.timeScale)
    this.sfx.player.rateScale = view.timeScale < 0.9 ? 0.8 + 0.2 * view.timeScale : 1
    this.sfx.update(dt)
    this.ambience.update(dt)
    this.music.update()
  }

  setScreen(screen: AudioScreen): void {
    this.music.setScreen(screen)
    this.ambience.setScene(SCENE_OF[screen])
    this.sfx.setScreen(screen)
    // le reste des sons se charge en tâche de fond une fois le titre affiché
    if (screen !== 'loading') void this.engine.assets.preload(LAZY_ASSETS)
  }

  private paused = false

  /**
   * Pause : musique étouffée. La ponctuation (harpe descendante / montante) est jouée par
   * l'appelant avec playStinger('pause' | 'resume') : une seule fois.
   */
  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    this.engine.setPaused(paused)
  }

  dispose(): void {
    cancelAnimationFrame(this.raf)
    for (const u of this.unsubs) u()
    this.sfx.dispose()
  }
}

/**
 * Point d'écoute estimé comme la caméra le ferait (GDD §13.1) : boîte englobante des oiseaux
 * et de leurs ombres, marges de 12 %, largeur entre 110 m et la largeur de l'arène.
 */
function autoListener(view: GameView, out: Listener): void {
  const sim = view.sim
  if (!sim || !sim.birds.length) return
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity
  for (const b of sim.birds) {
    for (const [x, y] of [[b.x, b.y], [b.shadow.cx, b.shadow.cy]] as const) {
      x0 = Math.min(x0, x)
      x1 = Math.max(x1, x)
      y0 = Math.min(y0, y)
      y1 = Math.max(y1, y)
    }
  }
  const halfW = clamp(((x1 - x0) / 2) * 1.3, 55, sim.arena.a * 1.1)
  const k = 0.12
  out.x += ((x0 + x1) / 2 - out.x) * k
  out.y += ((y0 + y1) / 2 - out.y) * k
  out.halfWidth += (halfW - out.halfWidth) * k
  out.halfHeight = out.halfWidth * (9 / 16) * 1.25
}

// ─── Instance du jeu ───────────────────────────────────────────────────────

let system: AudioSystem | null = null

/** Crée le système audio du jeu (idempotent). Le son démarre au premier geste de l'utilisateur. */
export function initAudio(): AudioSystem {
  if (!system) {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    // « balanced » : tampons plus longs que « interactive » (≈ 20-40 ms au lieu de ≈ 10 ms), donc
    // moins de réveils du thread audio et plus de marge contre les craquements quand la machine
    // est chargée ; la latence reste imperceptible pour un jeu joué à distance de la TV.
    const hint = (new URLSearchParams(location.search).get('audioLatency') as AudioContextLatencyCategory | null) ?? 'balanced'
    // 44,1 kHz : la fréquence de tous nos fichiers (décodage sans rééchantillonnage) et ~8 % de
    // calcul et de mémoire en moins qu'à 48 kHz ; le navigateur convertit à la sortie si besoin.
    system = new AudioSystem(new Ctx({ latencyHint: hint, sampleRate: 44100 }))
    system.start()
    // ?debug : outils de mesure (tools/polish/audio/rec.mjs) branchés sur CE système audio
    if (new URLSearchParams(location.search).has('debug')) {
      ;(window as unknown as { __ombresAudio?: unknown }).__ombresAudio = { system, subtitleEvents }
    }
  }
  return system
}

export function getAudio(): AudioSystem | null {
  return system
}

/** Écran de chargement : sons essentiels + manifeste des voix. `onProgress` reçoit 0..1. */
export async function preloadAudio(onProgress?: (p: number) => void): Promise<void> {
  const s = initAudio()
  await Promise.all([s.engine.assets.preload(CRITICAL_ASSETS, onProgress), s.narrator.loadManifest()])
}

/** Octets à précharger (pour pondérer la barre de chargement globale). */
export function criticalAudioBytes(): number {
  return CRITICAL_ASSETS.reduce((n, id) => n + AUDIO_ASSETS[id].bytes, 0)
}

export function setAudioScreen(screen: AudioScreen): void {
  initAudio().setScreen(screen)
}

export function setAudioPaused(paused: boolean): void {
  initAudio().setPaused(paused)
}

export function playUi(name: UiSound, opts?: UiOptions): void {
  system?.sfx.playUi(name, opts)
}

export function playStinger(name: Stinger, opts?: UiOptions): void {
  system?.sfx.stinger(name, opts)
}

/** Joue une réplique (voix si disponible et autorisée) et publie son sous-titre. */
export function playNarratorLine(req: NarratorRequest): NarratorPlayback {
  return initAudio().narrator.play(req)
}

/** Précharge les voix d'une partie (couleurs présentes, langue active). */
export function preloadNarrator(lang: Lang, colorIndices: readonly number[]): Promise<void> {
  return initAudio().narrator.preload(lang, colorIndices)
}

/** Cadre de la caméra (monde) pour le panoramique ; null = estimation automatique. */
export function setAudioListener(l: Listener | null): void {
  const s = initAudio()
  s.engine.listenerFromCamera = l !== null
  if (l) Object.assign(s.engine.listener, l)
}

/** Battement d'aile vers le bas signalé par l'animation (force 0..1). */
export function audioWingbeat(slot: number, strength: number): void {
  system?.sfx.wingbeat(slot, strength)
}

export function isAudioUnlocked(): boolean {
  return system?.engine.unlocked ?? false
}

export function onAudioUnlock(cb: () => void): () => void {
  return initAudio().engine.onUnlock(cb)
}
