// Ambiance : vent procédural (bruits filtrés : souffle grave des oiseaux bas, vent aigu des
// oiseaux hauts, corps du vent qui suit la vitesse) + couches enregistrées (vent de base,
// vent d'altitude, vent chantant du couchant, hurlement de la Grande Ombre, nuit), grondement
// du Simoun à la position des oiseaux pris dedans, grondement du front de nuit qui balaie
// l'écran d'ouest en est, et « grain de sable » proportionnel aux m²/s peints par tous :
// on entend l'accélération du couchant.
// Une couche silencieuse depuis 2 s est arrêtée (aucun coût), relancée dès qu'on en a besoin.
import { RULES } from '../../sim/rules.ts'
import type { SimState } from '../../sim/types.ts'
import type { GameView } from '../view.ts'
import type { AudioEngine } from './engine.ts'
import { AUDIO_ASSETS, type AssetId } from './manifest.gen.ts'
import { fmBell } from './music/synth.ts'
import { noiseBuffer, sandGrainBuffer } from './procedural.ts'
import type { SfxSystem } from './sfx.ts'
import { clamp, dbToGain, glide, lerp, Rng, smoothstep, stepTo } from './util.ts'

/** Écran courant, vu de l'ambiance. */
export type AmbienceScene = 'silent' | 'title' | 'lobby' | 'round' | 'results' | 'credits'

/** Mesures de la scène (calculées à chaque image depuis la simulation). */
export interface AmbienceInputs {
  /** Altitude moyenne normalisée des oiseaux (0 = bas, 1 = haut). */
  alt: number
  /** Vitesse moyenne normalisée (0..1). */
  speed: number
  /** Part des oiseaux hauts (pâles) et bas (forts). */
  highFrac: number
  lowFrac: number
  /** m²/s balayés par les ombres qui peignent (tous les oiseaux). */
  paintRate: number
  /** Oiseaux dans le Simoun et leur position moyenne. */
  stormCount: number
  stormX: number
  stormY: number
  /** Avancée de la manche (t / T) et de la Grande Ombre (0..1). */
  u: number
  greatShadow: number
  night: boolean
  /** Abscisse (monde) du front de nuit, NaN si inactif. */
  frontX: number
}

/**
 * Source bouclée qui ne tourne que lorsqu'on l'entend. Le niveau visé est en LUFS intégrés
 * (bus à 1) : gain = cible − sonie de référence de la source.
 */
class LoopLayer {
  private src: AudioBufferSourceNode | null = null
  private silentFor = 0
  /** Gain d'entrée de la couche (la source s'y branche). */
  readonly gain: GainNode

  /**
   * @param tail dernier nœud de la chaîne de la couche : relié à `out` seulement quand la couche
   *   joue (un nœud relié à la sortie est calculé à chaque bloc, même silencieux).
   */
  constructor(
    private readonly engine: AudioEngine,
    private readonly buffer: () => AudioBuffer | undefined,
    private readonly tail: AudioNode | null,
    private readonly out: AudioNode,
    /** Sonie de la source à gain 1 (LUFS intégrés). */
    private readonly refLufs: number,
    private readonly rng: Rng,
  ) {
    this.gain = engine.ctx.createGain()
    this.gain.gain.value = 0
    if (tail) this.gain.connect(tail)
  }

  get running(): AudioBufferSourceNode | null {
    return this.src
  }

  /** `lufs` ≤ −60 : silence. `tau` : constante de temps de la rampe (s). */
  set(lufs: number, when: number, dt: number, tau = 0.25): void {
    const on = lufs > -60
    if (on) {
      this.silentFor = 0
      if (!this.src) {
        const buf = this.buffer()
        if (!buf) return
        const src = this.engine.ctx.createBufferSource()
        src.buffer = buf
        src.loop = true
        src.connect(this.gain)
        ;(this.tail ?? this.gain).connect(this.out)
        // départ à un endroit au hasard : deux parties ne commencent pas pareil
        src.start(when, this.rng.range(0, buf.duration * 0.9))
        this.src = src
        this.gain.gain.cancelScheduledValues(when)
        this.gain.gain.setValueAtTime(0, when)
      }
      glide(this.gain.gain, dbToGain(lufs - this.refLufs), when, tau * 2, 0.03)
    } else if (this.src) {
      glide(this.gain.gain, 0, when, tau * 2)
      this.silentFor += dt
      if (this.silentFor > 2 + tau * 4) {
        this.src.stop(when)
        this.src.disconnect()
        this.src = null
        ;(this.tail ?? this.gain).disconnect()
      }
    }
  }
}

const LOOPS = {
  base: 'amb_wind_base_loop',
  high: 'amb_wind_high_loop',
  eerie: 'amb_wind_eerie_loop',
  howl: 'amb_wind_howl_loop',
  storm: 'amb_wind_dark_loop',
  crickets: 'amb_night_crickets_loop',
  sand: 'sand_paint_loop',
} as const satisfies Record<string, AssetId>

/**
 * Carillon du salon : lames accordées en sol majeur pentatonique (sol, la, si, ré, mi), comme la
 * boucle du salon. Le carillon enregistré (amb_chimes_loop) sonnait en fa −24 cents : un quart de
 * ton faux sous la musique.
 */
const LOBBY_CHIMES = [79, 81, 83, 86, 88, 91]
/** Niveau du carillon (dB appliqués aux cloches FM, bus ambiance). */
const CHIME_DB = -17
/** Gel de la nuit : toutes les couches se taisent, puis le vent revient et les grillons montent. */
const NIGHT_FREEZE_S = 1.3
type LoopName = keyof typeof LOOPS

/**
 * Sonie de référence des couches générées (LUFS intégrés à gain 1, filtres au repos), mesurée
 * dans la page de dev (tools/audio-render.mjs) ; sert à les régler en sonie comme les fichiers.
 */
const PROC_REF = { body: -19.4, whistle: -29.5, souffle: -14, grains: -21.5, front: -15.8 }

const OFF = -90

export class Ambience {
  private scene: AmbienceScene = 'silent'
  private loops = {} as Record<LoopName, LoopLayer>
  private body!: { layer: LoopLayer; filter: BiquadFilterNode }
  private whistle!: { layer: LoopLayer; filters: BiquadFilterNode[] }
  private souffle!: LoopLayer
  private grains!: LoopLayer
  private front!: { layer: LoopLayer; pan: StereoPannerNode }
  private stormPan!: StereoPannerNode
  private smoothPaint = 0
  private started = false
  private rng = new Rng(4242)
  private nextGust = 8
  private nextCry = 12
  private nextChime = 3
  /** Sorties du carillon : gauche, centre, droite (pas un panoramique par note). */
  private chimeOuts: AudioNode[] = []
  private clock = 0
  private lastApply = -1
  private applyDt = 0
  /** Temps écoulé depuis la nuit (s), pour faire retomber le hurlement. */
  private nightAge = 0
  inputs: AmbienceInputs = emptyInputs()
  /** Dernières sonies visées par couche enregistrée (page de dev, diagnostics). */
  lastTargets: Record<string, number> = {}
  private lastTick = -1
  private stalledFor = 0

  constructor(
    readonly engine: AudioEngine,
    private readonly getView: () => GameView,
    private readonly sfx: SfxSystem,
  ) {}

  setScene(scene: AmbienceScene): void {
    this.scene = scene
    this.ensureStarted()
  }

  private ensureStarted(): void {
    if (this.started) return
    this.started = true
    const e = this.engine
    const ctx = e.ctx
    const out = e.buses.amb
    for (const [name, id] of Object.entries(LOOPS) as [LoopName, AssetId][]) {
      let tail: AudioNode | null = null
      if (name === 'storm') tail = this.stormPan = ctx.createStereoPanner()
      void e.assets.load(id)
      this.loops[name] = new LoopLayer(e, () => e.assets.get(id), tail, out, AUDIO_ASSETS[id].lufs, this.rng)
    }
    const noise = (color: 'pink' | 'brown', seed: number) => {
      let b: AudioBuffer | undefined
      return () => (b ??= noiseBuffer(ctx, 6, color, seed))
    }
    const bq = (type: BiquadFilterType, f: number, q: number) => {
      const n = ctx.createBiquadFilter()
      n.type = type
      n.frequency.value = f
      n.Q.value = q
      return n
    }
    // corps du vent : bruit rose, passe-bande large qui respire
    {
      const filter = bq('bandpass', 500, 0.7)
      this.body = { layer: new LoopLayer(e, noise('pink', 1), filter, out, PROC_REF.body, this.rng), filter }
    }
    // vent aigu (oiseaux hauts) : deux sifflements résonants, un par oreille
    {
      const merger = ctx.createChannelMerger(2)
      const split = ctx.createChannelSplitter(2)
      const filters = [0, 1].map(ch => {
        const f = bq('bandpass', ch ? 1250 : 980, 11)
        split.connect(f, ch)
        f.connect(merger, 0, ch)
        return f
      })
      const layer = new LoopLayer(e, noise('pink', 2), merger, out, PROC_REF.whistle, this.rng)
      layer.gain.disconnect()
      layer.gain.connect(split)
      this.whistle = { layer, filters }
    }
    // souffle grave (oiseaux bas, au ras du sable) : bruit brun, passe-bas
    this.souffle = new LoopLayer(e, noise('brown', 3), bq('lowpass', 260, 0.9), out, PROC_REF.souffle, this.rng)
    // grains de sable (peinture)
    {
      let b: AudioBuffer | undefined
      this.grains = new LoopLayer(e, () => (b ??= sandGrainBuffer(ctx, 4, 700, 17)), bq('highpass', 1400, 0.7), out, PROC_REF.grains, this.rng)
    }
    // carillon du salon : trois sorties fixes (gauche, centre, droite)
    {
      const g = ctx.createGain()
      g.gain.value = dbToGain(CHIME_DB)
      g.connect(out)
      this.chimeOuts = [-0.6, 0, 0.6].map(pan => {
        const p = ctx.createStereoPanner()
        p.pan.value = pan
        p.connect(g)
        return p
      })
    }
    // front de nuit : grondement très grave, panoramique suivant le front
    {
      const f = bq('lowpass', 140, 0.7)
      const pan = ctx.createStereoPanner()
      f.connect(pan)
      const layer = new LoopLayer(e, noise('brown', 4), pan, out, PROC_REF.front, this.rng)
      layer.gain.disconnect()
      layer.gain.connect(f)
      this.front = { layer, pan }
    }
  }

  /** Mesures depuis la simulation. */
  static measure(sim: SimState | null): AmbienceInputs {
    const m = emptyInputs()
    if (!sim) return m
    const n = sim.birds.length
    let alt = 0, speed = 0, high = 0, low = 0, paint = 0, sx = 0, sy = 0
    const sun = sim.sun
    const cellArea = sim.grid.cellW * sim.grid.cellH
    for (const b of sim.birds) {
      alt += clamp((b.z - RULES.altLow) / (RULES.altHigh - RULES.altLow), 0, 1)
      speed += clamp(b.speed / RULES.speedHigh, 0, 1.6)
      if (b.strong) low++
      else high++
      if (b.inStorm) {
        m.stormCount++
        sx += b.x
        sy += b.y
      }
      // m²/s réellement peints : cellules gagnées ou renforcées ce tick (vraie simulation) ;
      // à défaut, surface balayée par l'ellipse d'ombre (largeur perpendiculaire × vitesse)
      if (b.paintedCells !== undefined) paint += b.paintedCells * cellArea * RULES.tickHz
      else if (b.shadow.paints && b.speed > 0.5) {
        const ux = b.vx / b.speed, uy = b.vy / b.speed
        const c = -uy * sun.shadowDirX + ux * sun.shadowDirY
        const half = Math.sqrt((b.shadow.rAlong * c) ** 2 + b.shadow.r ** 2 * (1 - c * c))
        paint += 2 * half * b.speed
      }
    }
    if (n) {
      m.alt = alt / n
      m.speed = speed / n
      m.highFrac = high / n
      m.lowFrac = low / n
    }
    m.paintRate = paint
    if (m.stormCount) {
      m.stormX = sx / m.stormCount
      m.stormY = sy / m.stormCount
    }
    m.u = sun.u
    const T = sun.T
    const tGS = (RULES.greatShadowAt / RULES.roundSunSeconds) * T
    m.greatShadow = sim.config.mode === 'round' && sun.t >= tGS ? clamp((sun.t - tGS) / (T - tGS), 0, 1) : 0
    m.night = sun.phase === 'night' || sun.phase === 'over'
    // le front est perpendiculaire à dir ; son abscisse au centre de l'écran ≈ s / dirX
    if (sim.night.active && Math.abs(sim.night.dirX) > 0.2) m.frontX = sim.night.s / sim.night.dirX
    return m
  }

  /** Appelé à chaque image (dt en s réelles). Les niveaux sont appliqués à 20 Hz au plus. */
  update(dt: number): void {
    if (!this.started) return
    const sim = this.getView().sim
    const mode = sim?.config.mode
    const inputs = (this.inputs = Ambience.measure(sim))
    // simulation figée (pause) : plus de sable qui coule ni de vent de vitesse
    this.stalledFor = sim && sim.tick === this.lastTick ? this.stalledFor + dt : 0
    this.lastTick = sim?.tick ?? -1
    if (this.stalledFor > 0.25) {
      inputs.paintRate = 0
      inputs.speed = 0
    }
    // lissage de la peinture (≈ 300 ms)
    this.smoothPaint += (Math.min(inputs.paintRate, 6000) - this.smoothPaint) * (1 - Math.exp(-dt / 0.3))
    this.nightAge = inputs.night ? this.nightAge + dt : 0
    this.clock += dt
    this.applyDt += dt
    this.randomEvents(dt, mode)
    if (this.clock - this.lastApply < 0.05) return
    this.lastApply = this.clock
    this.apply(inputs, mode, this.applyDt)
    this.applyDt = 0
  }

  private apply(m: AmbienceInputs, mode: string | undefined, dt: number): void {
    const e = this.engine
    const when = e.now
    const s = this.scene
    const world = s === 'round' || s === 'lobby' || s === 'title'
    const inRound = s === 'round' && mode === 'round'
    const target: Record<LoopName, number> = { base: OFF, high: OFF, eerie: OFF, howl: OFF, storm: OFF, crickets: OFF, sand: OFF }
    // gel de la nuit : un vrai silence (le gong arrive à 1,5 s), puis le vent revient doucement
    const frozen = m.night && this.nightAge < NIGHT_FREEZE_S
    // vent de base
    // nuit : le vent tombe presque à rien pendant le gel, puis revient doucement
    const nightDip = m.night ? lerp(-14, -7, clamp((this.nightAge - 1.5) / 4, 0, 1)) : 0
    target.base = s === 'title' ? -31 : s === 'lobby' ? -28 : s === 'round' ? -28 + nightDip : s === 'results' ? -35 : OFF
    // vent d'altitude : oiseaux hauts et rapides
    if (world && m.speed > 0 && !m.night) target.high = lerp(-44, -29, clamp(m.alt * 0.7 + m.speed * 0.4, 0, 1)) + (s === 'title' ? -6 : 0)
    if (inRound) {
      // vent chantant : absent à midi, s'installe à l'heure dorée
      target.eerie = m.night ? -36 : lerp(-48, -27, smoothstep(0.3, 0.72, m.u))
      // hurlement : monte pendant la Grande Ombre, retombe après la nuit
      // nuit : le vent tombe d'un coup (le « silence » du gel), puis les grillons montent
      if (m.greatShadow > 0 || m.night) target.howl = m.night ? lerp(-40, -48, clamp(this.nightAge / 5, 0, 1)) : lerp(-40, -24, m.greatShadow)
      if (m.night) target.crickets = lerp(-55, -31, clamp((this.nightAge - 1.5) / 3, 0, 1))
    } else if (s === 'title') {
      target.eerie = -38
      target.crickets = -40
    }
    if (s === 'results') target.crickets = -30
    // Simoun : grondement à la position des oiseaux dans la tempête
    if (world && m.stormCount > 0 && !m.night) {
      target.storm = -26 + 3 * Math.log2(Math.min(4, m.stormCount))
      glide(this.stormPan.pan, e.spatial(m.stormX, m.stormY).pan, when, 0.1, 0.05)
    }
    // sable : la peinture de tous, en sonie log. Mesuré sur une manche de 6 bots (médianes) :
    // midi 1 900 m²/s, heure dorée 1 500, couchant 2 600, Grande Ombre 3 150.
    const paint = world && !m.night ? clamp(Math.log10(Math.max(this.smoothPaint, 1) / 400) / Math.log10(5000 / 400), 0, 1) : 0
    if (paint > 0.02) target.sand = lerp(-44, -25, paint)
    if (frozen) for (const k of Object.keys(target) as LoopName[]) target[k] = OFF
    for (const k of Object.keys(this.loops) as LoopName[]) this.loops[k].set(target[k], when, dt, frozen ? 0.04 : 0.25)
    this.lastTargets = target
    const sand = this.loops.sand.running
    if (sand) glide(sand.playbackRate, 0.9 + 0.3 * paint, when, 0.3, 0.02)

    // ─ vent procédural
    const titleDb = s === 'title' ? -6 : 0
    this.body.layer.set(world && !(m.night && this.nightAge < 1.5) ? lerp(-40, -31, clamp(m.speed, 0, 1)) + titleDb + (m.night ? -12 : 0) : OFF, when, dt, m.night ? 0.04 : 0.3)
    // le corps « respire » : centre du passe-bande sur deux sinus lents incommensurables
    stepTo(this.body.filter.frequency, 420 + 260 * Math.sin(this.clock * 0.23) * Math.sin(this.clock * 0.071 + 1.3), when, 0.015)
    this.whistle.layer.set(world && !m.night ? lerp(-52, -33, clamp(m.highFrac * (0.4 + 0.6 * m.speed), 0, 1)) + titleDb : OFF, when, dt, 0.3)
    this.whistle.filters.forEach((f, i) => {
      stepTo(f.frequency, 900 + 380 * Math.sin(this.clock * (0.13 + i * 0.05) + i * 2.1) + 250 * m.alt, when, 0.006)
    })
    this.souffle.set(world && !m.night ? lerp(-50, -30, clamp(m.lowFrac * (0.3 + 0.7 * m.speed), 0, 1)) : OFF, when, dt, 0.3)
    this.grains.set(paint > 0.02 ? lerp(-50, -30, paint) : OFF, when, dt)
    const grains = this.grains.running
    if (grains) glide(grains.playbackRate, 0.8 + 0.5 * paint, when, 0.3, 0.02)
    // front de nuit
    if (inRound && m.greatShadow > 0 && !m.night && Number.isFinite(m.frontX)) {
      this.front.layer.set(lerp(-40, -24, m.greatShadow), when, dt, 0.3)
      glide(this.front.pan.pan, e.spatial(m.frontX, e.listener.y).pan, when, 0.2, 0.03)
    } else this.front.layer.set(OFF, when, dt, m.night ? 0.02 : 0.5)
  }

  /** Quelques lames du carillon, secouées par le vent (une à trois, en arpège lent). */
  private chime(): void {
    const e = this.engine
    const r = this.rng
    const n = r.chance(0.5) ? 1 : r.chance(0.6) ? 2 : 3
    let t = e.now + 0.02
    for (let i = 0; i < n; i++) {
      fmBell(r.pick(this.chimeOuts), r.pick(LOBBY_CHIMES), t, r.range(0.18, 0.32), { ratio: 3.01, index: 1.6, decay: 3.2, indexDecay: 0.5 })
      t += r.range(0.12, 0.45)
    }
  }

  /** Rafales au hasard, cris lointains sur l'écran titre, carillon du salon. */
  private randomEvents(dt: number, mode: string | undefined): void {
    const s = this.scene
    if (s !== 'round' && s !== 'lobby' && s !== 'title') return
    if (s === 'lobby') {
      this.nextChime -= dt
      if (this.nextChime <= 0) {
        this.nextChime = this.rng.range(3, 8)
        this.chime()
      }
    }
    this.nextGust -= dt
    if (this.nextGust <= 0) {
      this.nextGust = this.rng.range(12, 25)
      if (!this.inputs.night) this.sfx.play('amb_gust', { pan: this.rng.range(-0.8, 0.8), db: s === 'title' ? -5 : 0 })
    }
    if (s === 'title' || mode === 'demo') {
      this.nextCry -= dt
      if (this.nextCry <= 0) {
        this.nextCry = this.rng.range(20, 40)
        this.sfx.play('title_cry', { pan: this.rng.range(-0.7, 0.7) })
      }
    }
  }
}

function emptyInputs(): AmbienceInputs {
  return {
    alt: 0.5, speed: 0, highFrac: 0, lowFrac: 0, paintRate: 0,
    stormCount: 0, stormX: 0, stormY: 0, u: 0, greatShadow: 0, night: false, frontX: NaN,
  }
}
