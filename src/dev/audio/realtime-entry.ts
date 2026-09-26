// Point d'entrée autonome pour les mesures en TEMPS RÉEL (tools/audio-cpu.mjs) : le vrai
// système audio sur un AudioContext, piloté par la simulation factice comme par le runner.
// Empaqueté par esbuild, servi hors Vite (pas de rechargement HMR pendant une mesure).
import { RULES } from '../../sim/rules.ts'
import { simEvents } from '../../host/bus.ts'
import { initAudio, preloadAudio, setAudioScreen, type AudioScreen } from '../../host/audio/index.ts'
import { gameView } from '../../host/view.ts'
import { FakeSim } from './fakesim.ts'
import { Score } from '../../host/audio/music/score.ts'

// Recensement des nœuds reliés (mesure indépendante de la machine : ce qui est relié est calculé).
const linked = new Map<AudioNode, number>()
{
  const proto = AudioNode.prototype as unknown as { connect: (...a: unknown[]) => unknown; disconnect: (...a: unknown[]) => unknown }
  const c = proto.connect, d = proto.disconnect
  proto.connect = function (this: AudioNode, ...a: unknown[]) {
    linked.set(this, (linked.get(this) ?? 0) + 1)
    return c.apply(this, a)
  }
  proto.disconnect = function (this: AudioNode, ...a: unknown[]) {
    if (a.length === 0) linked.delete(this)
    return d.apply(this, a)
  }
}
function census(): string {
  const byType = new Map<string, number>()
  for (const n of linked.keys()) byType.set(n.constructor.name, (byType.get(n.constructor.name) ?? 0) + 1)
  return `nœuds reliés ${linked.size} (` + [...byType].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k, v]) => `${k.replace('Node', '')} ${v}`).join(', ') + ')'
}
const sys = initAudio()
let fake: FakeSim | null = null
let acc = 0
let last = performance.now()
function loop(now: number): void {
  requestAnimationFrame(loop)
  const dt = Math.min(0.1, (now - last) / 1000)
  last = now
  if (!fake) return
  acc += dt * fake.timeScale * RULES.tickHz
  while (acc >= 1) {
    acc -= 1
    for (const e of fake.step()) simEvents.emit(e)
  }
  gameView.alpha = acc
  gameView.timeScale = fake.timeScale
}
requestAnimationFrame(loop)

/** Expériences de coût (automatisations répétées) pour tools/audio-cpu.mjs --experiment=… */
function experiment(name: string): void {
  const ctx = sys.engine.ctx
  const params: AudioParam[] = []
  for (let i = 0; i < 20; i++) {
    const o = ctx.createOscillator()
    const g = ctx.createGain()
    g.gain.value = 0.0001
    const f = ctx.createBiquadFilter()
    o.connect(f).connect(g).connect(sys.engine.masterIn)
    o.start()
    params.push(name.includes('filter') ? f.frequency : g.gain)
  }
  let k = 0
  setInterval(() => {
    k++
    const t = ctx.currentTime
    for (const p of params) {
      const v = name.includes('filter') ? 500 + 300 * Math.sin(k * 0.1) : 0.0001 * (1 + 0.5 * Math.sin(k * 0.1))
      if (name.startsWith('set')) p.setValueAtTime(v, t + 0.02)
      else if (name.startsWith('glide')) {
        p.cancelScheduledValues(t)
        p.setValueAtTime(p.value, t)
        p.linearRampToValueAtTime(v, t + 0.1)
      } else if (name.startsWith('target')) p.setTargetAtTime(v, t, 0.05)
    }
  }, 50)
}

const api = {
  experiment,
  /** Écran + simulation factice (manche : départ au temps de soleil `t`). */
  go(screen: AudioScreen, t = -RULES.countdownSeconds): void {
    setAudioScreen(screen)
    const mode = screen === 'round' ? 'round' : screen === 'title' ? 'demo' : screen === 'lobby' || screen === 'intro' ? 'lobby' : null
    if (!mode) {
      // résultats, crédits : plus de simulation qui avance (comme le jeu, qui fige la manche)
      fake = null
      return
    }
    fake = new FakeSim({ mode, seed: 7, birds: 6 })
    while (mode === 'round' && fake.state.sun.t < t) fake.step()
    gameView.sim = fake.state
    gameView.players = fake.players
  },
  sys,
  /** Désactive une partie (mesure du coût de chaque sous-système). */
  disable(part: string): void {
    if (part.startsWith('layer:')) Score.skip.add(part.slice(6))
    if (part === 'track') (sys.music as unknown as { setScreen: (s: string) => void }).setScreen = () => {}
    if (part === 'frame') sys.frame = () => {}
    if (part === 'sim') fake = null
    if (part === 'sfx') sys.sfx.update = () => {}
    if (part === 'amb') sys.ambience.update = () => {}
    if (part === 'music') sys.music.update = () => {}
    if (part === 'events') sys.onSimEvent = () => {}
  },
  stats(): string {
    const p = sys.sfx.player as unknown as { voices: Map<string, { endsAt: number }[]> }
    const now = sys.engine.now
    let v = 0
    for (const l of p.voices.values()) v += l.filter(x => x.endsAt > now).length
    return `voix ${v} · ${census()}`
  },
}
;(window as unknown as Record<string, unknown>).__rt = api
void preloadAudio().then(() => ((window as unknown as Record<string, unknown>).__ready = true))
