// Rendu hors ligne d'une manche complète (OfflineAudioContext) avec le vrai système audio,
// piloté par la simulation factice comme le ferait le runner (ticks dosés par le ralenti,
// 60 images/s). Sert à MESURER : sonie par section, crêtes, clics, tonalité, et à exporter
// un WAV analysé par tools/audio-analyze.py.
import { RULES } from '../../sim/rules.ts'
import type { SimEvent } from '../../sim/types.ts'
import { AudioSystem } from '../../host/audio/index.ts'
import { CRITICAL_ASSETS, LAZY_ASSETS } from '../../host/audio/engine.ts'
import { AUDIO_ASSETS } from '../../host/audio/manifest.gen.ts'
import type { GameView } from '../../host/view.ts'
import { FakeSim } from './fakesim.ts'
import { RealSim } from './realsim.ts'

export type RenderBus = 'music' | 'sfx' | 'amb'

export interface RenderOptions {
  T?: number
  seed?: number
  birds?: number
  /** Bus rendus (les autres sont coupés). Défaut : tous. */
  buses?: RenderBus[]
  /** Couches de la partition à couper (nom → true). */
  muteLayers?: string[]
  sampleRate?: number
  /** Activité de la simulation factice (piqués, etc.). */
  activity?: number
  /** Ne rendre qu'une portion : temps de soleil de départ (s) et durée (s réelles). */
  from?: number
  seconds?: number
  /** Vraie simulation + vrais bots (sinon simulation factice). */
  real?: boolean
}

export interface RenderResult {
  buffer: AudioBuffer
  /** Durées (ms) : chargement, programmation image par image, rendu audio. */
  timings: { preload: number; schedule: number; render: number }
  /** Instant audio (s) du départ (t = 0) et des débuts de phase, pour découper l'analyse. */
  markers: { name: string; at: number }[]
  events: { type: string; at: number }[]
  /** Par son : nombre de lectures et énergie relative (somme de 10^(LUFS/10) × durée). */
  plays: Record<string, { n: number; energy: number }>
  /** Mesures d'ambiance échantillonnées toutes les 0,5 s (temps de soleil, m²/s peints…). */
  trace: { t: number; paint: number; alt: number; speed: number; storm: number; night: boolean; targets: Record<string, number> }[]
}

export async function renderRound(o: RenderOptions = {}): Promise<RenderResult> {
  const T = o.T ?? RULES.roundSunSeconds
  const sr = o.sampleRate ?? 44100
  const from = o.from ?? -RULES.countdownSeconds
  // manche complète : jusqu'à la nuit (les ralentis l'étirent de quelques secondes), puis le gong
  const seconds = o.seconds ?? T - from + 16
  const t0 = performance.now()
  const ctx = new OfflineAudioContext(2, Math.ceil(seconds * sr), sr)
  const view: GameView = { sim: null, prevBirds: [], alpha: 0, realTime: 0, timeScale: 1, players: [], colorblind: false }
  const sys = new AudioSystem(ctx, () => view)
  const e = sys.engine
  e.setVolumes({ master: 0.9, music: 0.7, sfx: 0.8, voice: 0.9 }, 0.001)
  const buses = new Set<RenderBus>(o.buses ?? ['music', 'sfx', 'amb'])
  for (const b of ['music', 'sfx', 'amb'] as const) if (!buses.has(b)) e.buses[b].disconnect()
  if (!buses.has('sfx')) {
    e.buses.ui.disconnect()
    e.sfxReverbSend.disconnect() // la réverbe partagée ne doit pas ramener les bruitages
  }
  if (!buses.has('music')) e.musicReverbSend.disconnect()
  const ids = [...CRITICAL_ASSETS, ...LAZY_ASSETS].filter(id => AUDIO_ASSETS[id].kind !== 'music')
  await e.assets.preload(ids)
  const fake: { state: FakeSim['state']; players: FakeSim['players']; timeScale: number; step(): SimEvent[] } = o.real
    ? new RealSim({ mode: 'round', T, seed: o.seed ?? 7, birds: o.birds ?? 6 })
    : new FakeSim({ mode: 'round', T, seed: o.seed ?? 7, birds: o.birds ?? 6, activity: o.activity ?? 1 })
  while (fake.state.sun.t < from) fake.step()
  const t1 = performance.now()
  view.sim = fake.state
  view.players = fake.players
  e.timeCursor = 0
  sys.setScreen('round')
  const round = await sys.music.loadRound()
  for (const l of o.muteLayers ?? []) round.setLayerDb(l as never, -Infinity)
  await new Promise(r => setTimeout(r, 0)) // boucles d'ambiance : départ (promesses)
  const plays: RenderResult['plays'] = {}
  const trace: RenderResult['trace'] = []
  sys.sfx.player.onPlay = (name, db, secs) => {
    const p = (plays[name] ??= { n: 0, energy: 0 })
    p.n++
    p.energy += Math.pow(10, db / 10) * Math.min(secs, 3)
  }
  const markers: RenderResult['markers'] = []
  const events: RenderResult['events'] = []
  const fps = 60
  const totalFrames = Math.floor(seconds * fps)
  let acc = 0
  let frame = 0
  let lastPhase = fake.state.sun.phase
  let scheduleMs = 0
  // Programme les images jusqu'à l'instant audio `until` (comme la boucle temps réel).
  const runFrames = (until: number) => {
    const c0 = performance.now()
    for (; frame < totalFrames && frame / fps < until; frame++) {
      const now = frame / fps
      e.timeCursor = now
      // ticks dosés par le facteur de temps (comme le runner)
      acc += (1 / fps) * fake.timeScale * RULES.tickHz
      while (acc >= 1) {
        acc -= 1
        const evs: SimEvent[] = fake.step()
        for (const ev of evs) {
          events.push({ type: ev.type === 'phase' ? `phase:${ev.phase}` : ev.type, at: now })
          sys.onSimEvent(ev)
        }
        if (fake.state.sun.phase !== lastPhase) {
          lastPhase = fake.state.sun.phase
          markers.push({ name: lastPhase, at: now })
        }
      }
      view.alpha = acc
      view.timeScale = fake.timeScale
      sys.frame(1 / fps)
      if (frame % 30 === 0) {
        const m = sys.ambience.inputs
        trace.push({ t: fake.state.sun.t, paint: Math.round(m.paintRate), alt: m.alt, speed: m.speed, storm: m.stormCount, night: m.night, targets: { ...sys.ambience.lastTargets } })
      }
    }
    scheduleMs += performance.now() - c0
  }
  // Programmation progressive (suspend/resume toutes les 250 ms) : comme en temps réel, les
  // nœuds ne sont créés qu'un peu avant d'être joués. Tout programmer d'avance ferait exister
  // des milliers de nœuds à la fois et fausserait les mesures de coût.
  const chunk = 0.25
  const t1b = performance.now()
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
  const t2 = performance.now()
  const buffer = await ctx.startRendering()
  e.timeCursor = null
  const t3 = performance.now()
  void t1b
  return { buffer, markers, events, plays, trace, timings: { preload: Math.round(t1 - t0), schedule: Math.round(scheduleMs), render: Math.round(t3 - t2 - scheduleMs) } }
}

/** Encode un AudioBuffer en WAV 16 bits (export pour l'analyse Python). */
export function toWav(buf: AudioBuffer): Blob {
  const ch = buf.numberOfChannels
  const n = buf.length
  const data = new DataView(new ArrayBuffer(44 + n * ch * 2))
  const w = (o: number, s: string) => [...s].forEach((c, i) => data.setUint8(o + i, c.charCodeAt(0)))
  w(0, 'RIFF')
  data.setUint32(4, 36 + n * ch * 2, true)
  w(8, 'WAVE')
  w(12, 'fmt ')
  data.setUint32(16, 16, true)
  data.setUint16(20, 1, true)
  data.setUint16(22, ch, true)
  data.setUint32(24, buf.sampleRate, true)
  data.setUint32(28, buf.sampleRate * ch * 2, true)
  data.setUint16(32, ch * 2, true)
  data.setUint16(34, 16, true)
  w(36, 'data')
  data.setUint32(40, n * ch * 2, true)
  const chans = Array.from({ length: ch }, (_, c) => buf.getChannelData(c))
  let o = 44
  for (let i = 0; i < n; i++)
    for (let c = 0; c < ch; c++) {
      const v = Math.max(-1, Math.min(1, chans[c]![i]!))
      data.setInt16(o, v < 0 ? v * 0x8000 : v * 0x7fff, true)
      o += 2
    }
  return new Blob([data.buffer], { type: 'audio/wav' })
}
