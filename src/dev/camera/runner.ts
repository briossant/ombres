// Mini-runner de la page de dev de la caméra : la VRAIE simulation et les VRAIS bots,
// les ralentis de touche comme le runner (GDD §13.2), gameView tenu à jour, et la
// chorégraphie des modes (manche → nuit → résultats → podium) via cameraCue.
import { createBot, createLobbyDummy, demoTeam, type Bot } from '../../bots/index.ts'
import { simEvents } from '../../host/bus.ts'
import { cameraBeats, cameraCue, cueCamera, type CameraMode } from '../../host/camera/cue.ts'
import { gameView, type PlayerVisual } from '../../host/view.ts'
import { ranking } from '../../sim/query.ts'
import { RULES } from '../../sim/rules.ts'
import { createSimulation } from '../../sim/simulation.ts'
import type { BirdInput, BirdState, MapId, SimEvent, Simulation } from '../../sim/types.ts'
import type { BotPersonality } from '../../bots/index.ts'

const PERSONALITIES: BotPersonality[] = ['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'fool', 'watchmaker']

export interface DevRunnerOptions {
  n: number
  mapId: MapId
  seed: number
  /** Enchaîne automatiquement nuit → résultats (→ podium si chain). */
  auto: boolean
  chain: boolean
}

function cloneBird(b: BirdState): BirdState {
  return { ...b, shadow: { ...b.shadow } }
}

export class DevRunner {
  sim: Simulation | null = null
  bots: (Bot | null)[] = []
  private inputs: (BirdInput | undefined)[] = []
  private lastEvents: SimEvent[] = []
  private acc = 0
  speed = 1
  paused = false
  private slowUntil = -1
  private lastSlow = -99
  private realTime = 0
  private resultsAt = -1
  private readonly o: DevRunnerOptions
  /** Appelé quand la manche passe aux résultats (page : UI). */
  onModeChange: (mode: CameraMode) => void = () => {}

  constructor(o: DevRunnerOptions) {
    this.o = o
    simEvents.on((e) => this.onEvent(e))
    cameraBeats.on((b) => {
      if (b.type === 'mapReady' && this.o.chain) this.resultsAt = this.realTime + 6
    })
  }

  private players(n: number): void {
    const players: PlayerVisual[] = []
    for (let slot = 0; slot < n; slot++) players[slot] = { slot, colorIndex: slot, name: `J${slot + 1}`, kind: 'bot', assist: false }
    gameView.players = players
  }

  /** Crée la sim d'un mode (et pose le repère caméra correspondant). */
  start(mode: CameraMode, t = 0): void {
    const { n, seed } = this.o
    this.bots = []
    this.lastEvents = []
    this.acc = 0
    if (mode === 'loading') {
      this.sim = null
      gameView.sim = null
      cueCamera(mode)
      return
    }
    if (mode === 'title' || mode === 'credits') {
      const team = demoTeam(6, seed)
      this.sim = createSimulation({
        mode: 'demo',
        seed,
        mapId: this.o.mapId,
        birds: team.map((_, slot) => ({ slot, assist: false })),
        sunSeconds: RULES.titleDemoSunSeconds,
        countdown: false,
      })
      this.bots = team.map((s, slot) => createBot({ slot, personality: s.personality, level: s.level, seed: seed * 31 + slot }))
      this.players(team.length)
    } else if (mode === 'lobby' || mode === 'rules') {
      const count = Math.max(1, Math.min(8, n))
      this.sim = createSimulation({
        mode: 'lobby',
        seed,
        mapId: 'lobby',
        birds: Array.from({ length: count }, (_, slot) => ({ slot, assist: false })),
        sunSeconds: RULES.roundSunSeconds,
        countdown: false,
      })
      this.bots = Array.from({ length: count }, (_, slot) =>
        slot === count - 1 && count > 1 ? createLobbyDummy(slot) : createBot({ slot, personality: PERSONALITIES[slot % 7]!, level: 1, seed: seed * 17 + slot }),
      )
      this.players(count)
    } else {
      this.sim = createSimulation({
        mode: 'round',
        seed,
        mapId: this.o.mapId,
        birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
        sunSeconds: RULES.roundSunSeconds,
        countdown: t <= 0,
      })
      this.bots = Array.from({ length: n }, (_, slot) => createBot({ slot, personality: PERSONALITIES[slot % 7]!, level: (slot % 3) as 0 | 1 | 2, seed: seed * 13 + slot }))
      this.players(n)
    }
    // avance rapide sans événements
    const sim = this.sim!
    let guard = 0
    // t ≤ 0 : on garde le compte à rebours (la manche démarre à −3 s)
    if (t > 0) while (sim.state.sun.t < t - 1e-6 && guard++ < 200000) this.tick(false)
    gameView.sim = sim.state
    gameView.prevBirds = []
    for (const b of sim.state.birds) gameView.prevBirds[b.slot] = cloneBird(b)
    gameView.alpha = 1
    if (mode === 'podium') {
      const r = ranking(sim.state)
      cueCamera('podium', { podium: r.slice(0, 3), winnerSlot: r[0] ?? -1 })
    } else cueCamera(mode === 'roundResults' ? 'round' : mode)
    this.onModeChange(cameraCue.mode)
  }

  tick(emit = true): void {
    const sim = this.sim
    if (!sim) return
    const st = sim.state
    for (let i = 0; i < this.bots.length; i++) {
      const bot = this.bots[i]
      this.inputs[i] = bot ? bot.think(st, this.lastEvents) : undefined
    }
    this.lastEvents = sim.step(this.inputs)
    if (emit) for (const e of this.lastEvents) simEvents.emit(e)
  }

  private onEvent(e: SimEvent): void {
    const st = this.sim?.state
    if (!st) return
    if (e.type === 'diveHit' && st.sun.t < st.sun.T - RULES.noSlowmoLastSeconds && this.realTime - this.lastSlow >= RULES.hitSlowmoMinGap) {
      this.lastSlow = this.realTime
      this.slowUntil = this.realTime + RULES.hitSlowmoSeconds
    }
    if (e.type === 'night' && this.o.auto && cameraCue.mode === 'round') {
      const r = ranking(st)
      cueCamera('roundResults', { winnerSlot: r[0] ?? -1 })
      this.onModeChange('roundResults')
    }
  }

  /** Facteur de temps : ralenti de touche (0,35 pendant 0,35 s, retour en 0,2 s) et dernière seconde. */
  private timeScale(): number {
    let s = 1
    const dt = this.realTime - this.slowUntil
    if (this.realTime < this.slowUntil) s = RULES.hitSlowmoScale
    else if (dt < RULES.hitSlowmoRampSeconds) s = RULES.hitSlowmoScale + (1 - RULES.hitSlowmoScale) * (dt / RULES.hitSlowmoRampSeconds)
    const hint = this.sim?.state.timeScaleHint ?? 1
    return Math.min(s, hint || 1)
  }

  update(dtReal: number): void {
    this.realTime += dtReal
    gameView.realTime = this.realTime
    if (this.resultsAt > 0 && this.realTime >= this.resultsAt && this.sim) {
      this.resultsAt = -1
      const r = ranking(this.sim.state)
      cueCamera('podium', { podium: r.slice(0, 3), winnerSlot: r[0] ?? -1 })
      this.onModeChange('podium')
    }
    const sim = this.sim
    if (!sim) return
    const ts = this.timeScale()
    gameView.timeScale = ts
    if (this.paused) {
      gameView.alpha = 1
      return
    }
    this.acc += dtReal * ts * this.speed
    const dt = 1 / RULES.tickHz
    let guard = 0
    while (this.acc >= dt && guard++ < 40) {
      for (const b of sim.state.birds) gameView.prevBirds[b.slot] = cloneBird(b)
      this.tick(true)
      this.acc -= dt
    }
    if (guard >= 40) this.acc = 0
    // la sim de la manche reste la vue du runner (le podium la remplace après, à −3)
    if (cameraCue.mode !== 'podium') gameView.sim = sim.state
    gameView.alpha = Math.min(1, this.acc / dt)
  }

  /** Avance rapide jusqu'à l'instant de soleil t (sans événements). */
  jump(t: number): void {
    const sim = this.sim
    if (!sim) return
    let guard = 0
    while (sim.state.sun.t < t && guard++ < 200000) this.tick(false)
    for (const b of sim.state.birds) gameView.prevBirds[b.slot] = cloneBird(b)
  }

  /** Événement synthétique pour tester la caméra : piqué engagé puis touché entre deux oiseaux proches. */
  fireDive(): void {
    const st = this.sim?.state
    if (!st || st.birds.length < 2) return
    let best: [BirdState, BirdState] | null = null
    let bd = Infinity
    for (const a of st.birds)
      for (const b of st.birds) {
        if (a === b) continue
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (d < bd) {
          bd = d
          best = [a, b]
        }
      }
    if (!best) return
    const [h, g] = best
    simEvents.emit({ type: 'diveCommit', hunter: h.slot, target: g.slot })
    setTimeout(() => simEvents.emit({ type: 'diveHit', hunter: h.slot, target: g.slot, x: g.x, y: g.y, z: g.z, stolenCells: 0, crown: false }), 450)
  }
}
