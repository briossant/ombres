// Bande-son de la manche filmée, rendue hors ligne par le VRAI système audio du jeu (partition générative,
// bruitages, ambiance), piloté par la manche exacte de la bande-annonce (round.ts) et le dosage du temps du
// runner : la musique, les bruitages et le gong tombent aux mêmes instants que dans la vidéo tournée.
// Empaqueté par esbuild (tools/trailer/audio-render.mjs), hors Vite. Même méthode que src/dev/audio/offline.ts.
import { AudioSystem } from '../../src/host/audio/index.ts'
import { CRITICAL_ASSETS, LAZY_ASSETS } from '../../src/host/audio/engine.ts'
import { AUDIO_ASSETS } from '../../src/host/audio/manifest.gen.ts'
import { measureLoudness } from '../../src/host/audio/loudness.ts'
import type { GameView } from '../../src/host/view.ts'
import type { SimEvent } from '../../src/sim/types.ts'
import { toWav } from '../../src/dev/audio/offline.ts'
import { makeTrailerRound, RunnerClock } from './round.ts'

type Bus = 'music' | 'sfx' | 'amb'

export interface TrailerAudioOptions {
  seed: number
  buses: Bus[]
  /** Secondes rendues après la nuit (gong, grillons). */
  after?: number
  /** Sans ralenti de touche (tempo régulier). */
  noSlowmo?: boolean
}

export async function renderTrailerAudio(o: TrailerAudioOptions) {
  const sr = 48000
  const r = makeTrailerRound(o.seed)
  const clock = new RunnerClock(r, !o.noSlowmo)
  // durée : on simule d'abord la manche pour connaître l'instant réel de la nuit
  const probe = new RunnerClock(makeTrailerRound(o.seed), !o.noSlowmo)
  let nightReal = -1
  for (let f = 0; f < 60 * 200 && nightReal < 0; f++) probe.frame(1 / 60, (e, t) => e.type === 'night' && (nightReal = t))
  const seconds = nightReal + (o.after ?? 12)
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)
  const view: GameView = { sim: null, prevBirds: [], alpha: 0, realTime: 0, timeScale: 1, players: r.players, colorblind: false }
  const sys = new AudioSystem(ctx, () => view)
  const e = sys.engine
  e.setVolumes({ master: 0.9, music: 0.7, sfx: 0.8, voice: 0.9 }, 0.001)
  const buses = new Set(o.buses)
  for (const b of ['music', 'sfx', 'amb'] as const) if (!buses.has(b)) e.buses[b].disconnect()
  if (!buses.has('sfx')) {
    e.buses.ui.disconnect()
    e.sfxReverbSend.disconnect()
  }
  if (!buses.has('music')) e.musicReverbSend.disconnect()
  const ids = [...CRITICAL_ASSETS, ...LAZY_ASSETS].filter((id) => AUDIO_ASSETS[id].kind !== 'music')
  await e.assets.preload(ids)
  view.sim = r.sim.state
  e.timeCursor = 0
  sys.setScreen('round')
  await sys.music.loadRound()
  await new Promise((res) => setTimeout(res, 0))
  const events: { type: string; at: number; t: number; hunter?: number; target?: number }[] = []
  const timeline: [number, number][] = [] // [instant réel, soleil] toutes les 0,1 s
  const fps = 60
  const total = Math.floor(seconds * fps)
  let frame = 0
  const onEvent = (ev: SimEvent, at: number) => {
    events.push({ type: ev.type === 'phase' ? `phase:${ev.phase}` : ev.type, at, t: r.sim.state.sun.t, ...('hunter' in ev ? { hunter: ev.hunter, target: ev.target } : {}) })
    sys.onSimEvent(ev)
  }
  const runFrames = (until: number) => {
    for (; frame < total && frame / fps < until; frame++) {
      e.timeCursor = frame / fps
      const scale = clock.frame(1 / fps, onEvent)
      view.alpha = clock.alpha
      view.timeScale = scale
      view.realTime = clock.realTime
      sys.frame(1 / fps)
      if (frame % 6 === 0) timeline.push([+clock.realTime.toFixed(4), +r.sim.state.sun.t.toFixed(4)])
    }
  }
  const chunk = 0.25
  runFrames(chunk + 0.2)
  const plan = (t: number) => {
    if (t >= seconds) return
    void ctx.suspend(t).then(() => {
      runFrames(t + chunk + 0.2)
      plan(t + chunk)
      void ctx.resume()
    })
  }
  plan(chunk)
  const buffer = await ctx.startRendering()
  e.timeCursor = null
  return { buffer, events, timeline, nightReal, seconds }
}

/** Un son ponctuel du jeu (interface, ponctuation, bruitage nommé de sounds.ts) à l'instant `at`. */
export type Cue =
  | { at: number; ui: string; colorIndex?: number; value?: number }
  | { at: number; stinger: string; colorIndex?: number }
  | { at: number; sound: string; db?: number; semitones?: number }

/** Rend une liste de sons ponctuels du jeu (même moteur, mêmes réglages de gain que dans le jeu). */
export async function renderCues(cues: Cue[], seconds: number, screen: 'lobby' | 'round' | 'gameResults' = 'lobby') {
  const sr = 48000
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)
  const view: GameView = { sim: null, prevBirds: [], alpha: 0, realTime: 0, timeScale: 1, players: [], colorblind: false }
  const sys = new AudioSystem(ctx, () => view)
  const e = sys.engine
  e.setVolumes({ master: 0.9, music: 0.7, sfx: 0.8, voice: 0.9 }, 0.001)
  e.buses.music.disconnect()
  e.musicReverbSend.disconnect()
  e.buses.amb.disconnect()
  const ids = [...CRITICAL_ASSETS, ...LAZY_ASSETS].filter((id) => AUDIO_ASSETS[id].kind !== 'music')
  await e.assets.preload(ids)
  e.timeCursor = 0
  sys.setScreen(screen)
  const sfx = sys.sfx as unknown as {
    playUi(n: string, o: object): void
    stinger(n: string, o: object): void
    play(n: string, o?: object): unknown
  }
  for (const c of [...cues].sort((a, b) => a.at - b.at)) {
    e.timeCursor = c.at
    if ('ui' in c) sfx.playUi(c.ui, { colorIndex: c.colorIndex, value: c.value })
    else if ('stinger' in c) sfx.stinger(c.stinger, { colorIndex: c.colorIndex })
    else sfx.play(c.sound, { db: c.db, semitones: c.semitones })
  }
  const buffer = await ctx.startRendering()
  e.timeCursor = null
  return { buffer }
}

;(window as unknown as Record<string, unknown>).__trailerAudio = { renderTrailerAudio, renderCues, toWav, measureLoudness }
;(window as unknown as Record<string, unknown>).__ready = true
