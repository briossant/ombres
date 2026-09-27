// Système des FX « encre » (ART_BIBLE §6.8), piloté par l'état de la simulation
// (gameView) et par le bus simEvents. Tout est dessiné en mode immédiat dans
// quatre lots GPU (4 draw calls au total), à partir de pools préalloués.
//
// Continus (par oiseau) : ruban de traînée (coupé au piqué), filets d'air (HAUT),
// bouffées de sable (BAS), lignes de vitesse (piqué), traînée blanche du « clac »,
// plumes hérissées (immunité), étoiles du décrochage, chevron de verrouillage à
// la couleur du chasseur, « ! » de prise d'élan, œil barré (caché), plume (aide
// au vol), jeton-glyphe (mode daltonien), gloire de victoire.
// Ponctuels (événements) : étoile d'impact, plumes, gerbe de sable, étincelles
// « tsk », anneau de couronne, coup de pinceau de gros vol, battement d'air,
// claquement, esquive (arc de souffle, plumes arrachées, étoiles du chasseur) ;
// poussière violette le long du front de nuit.
// Gros plans (titre, piqué) : tailles plafonnées à l'écran (bouffées ≤ 60 px, ruban
// ≤ 6 px, lignes de vitesse ≤ 25 % de la largeur), rétrécissement près de la caméra,
// icônes d'état masquées en démo et au-delà de 200 px d'envergure.
import { Color, Group, Vector3, type Camera, type PerspectiveCamera } from 'three'
import { RULES } from '../../../sim/rules.ts'
import type { BirdState, SimEvent, SimState } from '../../../sim/types.ts'
import { MAX_PLAYERS, PLAYER_COLORS } from '../../../shared/players.ts'
import type { GameView } from '../../view.ts'
import { anchorOffset, birdAnchors, crownLift, iconLift } from '../bird/anchors.ts'
import { glyphIndex } from '../bird/glyphs.ts'
import { TAU, clamp, clamp01, hash01, smoothstep, spring, springTo, type Spring } from '../bird/math.ts'
import { hexToLinear, nprUniforms } from '../bird/npr.ts'
import type { AnchorName } from '../bird/skeleton.ts'
import { RibbonBatch, SpriteBatch, StrokeBatch, type SpriteSpec } from './batches.ts'
import { SHAPE } from './glsl.ts'
import { PathBuffer } from './path.ts'

export type FxQuality = 'low' | 'medium' | 'high' | 'ultra'

/** Plafond de particules par preset (ART_BIBLE §7.4). */
export const FX_CAPS: Record<FxQuality, number> = { low: 300, medium: 800, high: 1500, ultra: 1500 }

// Réglages cosmétiques (les grandeurs de jeu viennent de RULES).
const TRAIL_LEN = 20 // m (ART_BIBLE §6.7)
const TRAIL_WIDTH = 0.35 // m
const TRAIL_ALPHA = 0.85
const TRAIL_SPACING = 0.6 // m entre deux points enregistrés
const TRAIL_RETRACT = 55 // m/s quand la traînée est coupée
const FILAMENT_AGE = 0.34 // s
const PUFF_RATE = 4 // bouffées / s / oiseau BAS
const ICON_GAP = 5 // px entre icônes empilées
const TIPS = ['tipL', 'tipR'] as const
/** Hauteur des FX « au sol » : au-dessus des ondulations du sable (≤ 0,6 m, ART_BIBLE §6.5). */
const GROUND_Y = 0.9
/** Bouffées : diamètre maximal à l'écran (px 1080p) ; rétrécies sous PUFF_NEAR_M de la caméra (§6.8). */
const PUFF_MAX_PX = 60
const PUFF_NEAR_M = 25
/** Ruban de traînée : largeur maximale à l'écran (px 1080p) ; dissous (aminci) sous TRAIL_NEAR_M. */
const TRAIL_MAX_PX = 6
const TRAIL_NEAR_M = 30
/** Lignes de vitesse et traînée du clac : longueur bornée à cette fraction de la largeur d'écran. */
const STREAK_MAX_FRAC = 0.25
/** Un oiseau qui se déplace de plus de TELEPORT_M en une frame repart sans traînée (changement de manche). */
const TELEPORT_M = 20
/** Icônes d'état masquées au-delà de cette envergure à l'écran (gros plans, px 1080p). */
const ICONS_HIDE_PX = 200
/** Gloire de victoire : rayon à l'écran (px 1080p), rayons d'encre à 35 % (ART_BIBLE §6.8). */
const GLORY_RADIUS_PX = 250
const GLORY_ALPHA = 0.35
/** Esquive : arc de souffle autour de l'esquiveur (s). */
const DODGE_ARC_S = 0.4

const enum PK {
  puff,
  feather,
  clod,
  nightPuff,
}

class Particle {
  alive = false
  kind: PK = PK.puff
  t = 0
  life = 1
  x = 0
  y = 0
  z = 0
  vx = 0
  vy = 0
  vz = 0
  size = 1
  rot = 0
  rotV = 0
  seed = 0
  drag = 0
  grav = 0
  /** Demi-taille minimale à l'écran (px 1080p) ; 0 = défaut du type. */
  minPx = 0
}

const enum BK {
  star,
  crownRing,
  brush,
  flapAir,
  clap,
  tsk,
  dodge,
}

class Burst {
  alive = false
  kind: BK = BK.star
  t = 0
  life = 1
  x = 0
  y = 0
  z = 0
  slot = -1
  seed = 0
  r = 5
  /** Autre oiseau concerné (esquive : le chasseur). */
  other = -1
  readonly path = new Float32Array(40 * 4)
  pathN = 0
}

class BirdFx {
  readonly trail = new PathBuffer(64)
  trailAttached = false
  trailCut = 0
  readonly tipL = new PathBuffer(32)
  readonly tipR = new PathBuffer(32)
  readonly streak = new PathBuffer(40)
  streakFade = 0
  readonly shadowHist = new PathBuffer(40)
  shadowTimer = 0
  puffTimer = 0
  puffSide = 1
  readonly chev: Spring = spring(0)
  readonly chevColor = new Float32Array([0, 0, 0])
  readonly bang: Spring = spring(0)
  readonly eye: Spring = spring(0)
  readonly immune: Spring = spring(0)
  readonly speed: Spring = spring(0)
  readonly filament: Spring = spring(0)
  readonly stars: Spring = spring(0)
  /** Icônes d'état (0 = masquées : démo, gros plan). */
  readonly icons: Spring = spring(1)
  /** Chasseur planté après une esquive : étoiles du décroché pendant ce temps (s). */
  dazed = 0
  /** Position (sim) à la frame précédente : détection des téléportations. */
  lastX = 0
  lastY = 0
  lastZ = 0
  seen = -1

  /** Oublie toutes les traînées (téléportation, nouvelle simulation). */
  resetPaths(): void {
    this.trail.clear()
    this.tipL.clear()
    this.tipR.clear()
    this.streak.clear()
    this.shadowHist.clear()
    this.trailAttached = false
    this.streakFade = 0
    this.dazed = 0
  }
}

const _v = new Vector3()
const _a = new Vector3()
const _b = new Vector3()
const _camPos = new Vector3()
const _right = new Vector3()
const _up = new Vector3()
const _fwd = new Vector3()

type Rgb = Float32Array

const rgb = (): Rgb => new Float32Array([0, 0, 0, 1])
const setRgb = (out: Rgb, c: Color, a = 1): Rgb => {
  out[0] = c.r
  out[1] = c.g
  out[2] = c.b
  out[3] = a
  return out
}

export class FxSystem {
  readonly root = new Group()
  readonly sprites: SpriteBatch
  readonly icons: SpriteBatch
  readonly strokes: StrokeBatch
  readonly ribbons: RibbonBatch
  private readonly particles: Particle[]
  private readonly bursts: Burst[] = Array.from({ length: 64 }, () => new Burst())
  private readonly birds: BirdFx[] = Array.from({ length: MAX_PLAYERS }, () => new BirdFx())
  private readonly queue: SimEvent[] = []
  private time = 0
  private realTime = 0
  private frame = 0
  private glorySlot = -1
  private readonly glory: Spring = spring(0)
  private nightTimer = 0
  private rngState = 1
  // Couleurs (linéaires) de la frame.
  private readonly cInk = rgb()
  private readonly cPaper = rgb()
  private readonly cPuff = rgb()
  private readonly cNight = rgb()
  private readonly cBone = rgb()
  private readonly cCream = rgb()
  private readonly cGold = rgb()
  private readonly cTmp = rgb()
  private readonly cTmp2 = rgb()
  private readonly player: Rgb[] = PLAYER_COLORS.map(p => new Float32Array([...hexToLinear(p.hex), 1]))
  private readonly spec: SpriteSpec = {
    x: 0,
    y: 0,
    z: 0,
    size: 1,
    minPx: 1,
    shape: 0,
    fill: new Float32Array(4),
    line: new Float32Array(4),
  }
  private pxPerM1 = 1000
  private px1080 = 1
  /** Largeur de l'écran en px 1080p (bornes des traits longs). */
  private screenW1080 = 1920
  /** Simulation de la frame précédente : au changement (manche, titre, podium), tout repart de zéro. */
  private lastSim: SimState | null = null
  /** Point de traînée en cours (x, y, z, tangente x, y, z, abscisse u) : voir drawTrail. */
  private readonly tp = new Float64Array(7)

  constructor(public quality: FxQuality = 'high') {
    const cap = FX_CAPS[quality]
    this.particles = Array.from({ length: cap }, () => new Particle())
    this.cCream.set(hexToLinear('#FFFCF0'))
    this.ribbons = new RibbonBatch(2400, { depthTest: true, renderOrder: 10 })
    this.strokes = new StrokeBatch(cap, { depthTest: true, renderOrder: 11 })
    this.sprites = new SpriteBatch(cap + 64, { depthTest: true, renderOrder: 12 })
    this.icons = new SpriteBatch(160, { depthTest: false, renderOrder: 20 })
    this.root.name = 'fx'
    this.root.add(this.ribbons.mesh, this.strokes.mesh, this.sprites.mesh, this.icons.mesh)
  }

  /** Événement de simulation (appelé par le bus simEvents). */
  push(e: SimEvent): void {
    if (this.queue.length < 256) this.queue.push(e)
  }

  /** Gloire de victoire derrière un oiseau (−1 = aucune). */
  setGlory(slot: number): void {
    this.glorySlot = slot
  }

  /** Nombre d'éléments dessinés à la dernière frame (debug, tests). */
  stats(): { sprites: number; icons: number; strokes: number; particles: number } {
    return { sprites: this.sprites.count, icons: this.icons.count, strokes: this.strokes.count, particles: this.particles.filter(p => p.alive).length }
  }

  private rand(): number {
    this.rngState = (this.rngState * 16807) % 2147483647
    return this.rngState / 2147483647
  }

  // ─── Positions ──────────────────────────────────────────────────────────

  /** Ancre d'un oiseau (three), ou sa position de simulation interpolée à défaut. */
  private anchor(view: GameView, slot: number, name: AnchorName, out: Vector3): Vector3 {
    if (birdAnchors.frame[slot] === birdAnchors.counter && birdAnchors.counter > 0) {
      const o = anchorOffset(slot, name)
      const d = birdAnchors.data
      return out.set(d[o]!, d[o + 1]!, d[o + 2]!)
    }
    const cur = view.sim?.bySlot[slot]
    if (!cur) return out.set(0, -1000, 0)
    const p = view.prevBirds[slot] ?? cur
    const a = view.alpha
    out.set(p.x + (cur.x - p.x) * a, p.z + (cur.z - p.z) * a, -(p.y + (cur.y - p.y) * a))
    if (name === 'riderTop') out.y += 1.5
    return out
  }

  private scaleOf(slot: number): number {
    return birdAnchors.frame[slot] === birdAnchors.counter ? birdAnchors.scale[slot]! : 1
  }

  private colorOf(view: GameView, slot: number): Rgb {
    const ci = view.players[slot]?.colorIndex ?? slot
    return this.player[ci] ?? this.cInk
  }

  // ─── Pools ──────────────────────────────────────────────────────────────

  private spawn(kind: PK, x: number, y: number, z: number, life: number, size: number): Particle | null {
    for (const p of this.particles) {
      if (p.alive) continue
      p.alive = true
      p.kind = kind
      p.t = 0
      p.life = life
      p.x = x
      p.y = y
      p.z = z
      p.vx = p.vy = p.vz = 0
      p.size = size
      p.rot = this.rand() * TAU
      p.rotV = 0
      p.seed = this.rand()
      p.drag = 0
      p.grav = 0
      p.minPx = 0
      return p
    }
    return null
  }

  private burst(kind: BK, x: number, y: number, z: number, life: number, slot = -1): Burst | null {
    for (const b of this.bursts) {
      if (b.alive) continue
      b.alive = true
      b.kind = kind
      b.t = 0
      b.life = life
      b.x = x
      b.y = y
      b.z = z
      b.slot = slot
      b.seed = this.rand()
      b.pathN = 0
      b.other = -1
      return b
    }
    return null
  }

  private puffs(x: number, y: number, z: number, n: number, spread: number, up: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * TAU
      const s = spread * (0.4 + 0.6 * this.rand())
      const p = this.spawn(PK.puff, x + Math.cos(a) * s * 0.3, y, z + Math.sin(a) * s * 0.3, 0.7 + 0.3 * this.rand(), 0.7 + 0.5 * this.rand())
      if (!p) return
      p.vx = Math.cos(a) * s
      p.vz = Math.sin(a) * s
      p.vy = up * (0.5 + this.rand())
      p.drag = 2.5
      p.rotV = (this.rand() - 0.5) * 1.5
    }
  }

  /** Plumes blanches cernées qui tournoient en tombant ; `up` : vitesse verticale ajoutée (m/s). */
  private feathers(x: number, y: number, z: number, n: number, speed: number, minPx = 0, up = 2): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * TAU
      const e = (this.rand() - 0.3) * 1.2
      const s = speed * (0.5 + 0.5 * this.rand())
      const p = this.spawn(PK.feather, x, y, z, 1.0 + 0.4 * this.rand(), 0.42 + 0.2 * this.rand())
      if (!p) return
      p.minPx = minPx
      p.vx = Math.cos(a) * Math.cos(e) * s
      p.vz = Math.sin(a) * Math.cos(e) * s
      p.vy = Math.sin(e) * s + up
      p.drag = 2.2
      p.grav = 3
      p.rotV = (this.rand() - 0.5) * 8
    }
  }

  private clods(x: number, y: number, z: number, n: number): void {
    for (let i = 0; i < n; i++) {
      const a = this.rand() * TAU
      const s = 4 + 5 * this.rand()
      const p = this.spawn(PK.clod, x, y, z, 0.55 + 0.25 * this.rand(), 0.16 + 0.1 * this.rand())
      if (!p) return
      p.vx = Math.cos(a) * s * 0.6
      p.vz = Math.sin(a) * s * 0.6
      p.vy = 5 + 4 * this.rand()
      p.grav = 18
      p.drag = 0.6
    }
  }

  // ─── Événements ─────────────────────────────────────────────────────────

  private handle(view: GameView, e: SimEvent): void {
    const S = view.sim
    switch (e.type) {
      case 'diveHit': {
        const x = e.x
        const y = e.z
        const z = -e.y
        this.burst(BK.star, x, y, z, 0.26)
        this.feathers(x, y, z, this.quality === 'low' ? 5 : 8, 7)
        this.puffs(x, y * 0.5, z, 3, 3, 0.5)
        break
      }
      case 'diveMiss': {
        // Gerbe de sable : l'attaquant plante dans le sable.
        this.puffs(e.x, GROUND_Y, -e.y, this.quality === 'low' ? 6 : 10, 6, 1.2)
        this.clods(e.x, GROUND_Y, -e.y, this.quality === 'low' ? 5 : 9)
        if (e.dodged) {
          // Esquive (polish B7) : arc de souffle autour de l'esquiveur, plumes arrachées au
          // chasseur, étoiles du décroché au-dessus du chasseur planté. Lisible à 50 px d'envergure.
          const d = this.burst(BK.dodge, e.x, GROUND_Y, -e.y, DODGE_ARC_S, e.target)
          if (d) d.other = e.hunter
          const c = S?.bySlot[e.hunter] ? this.anchor(view, e.hunter, 'chest', _a) : _a.set(e.x, 2, -e.y)
          this.feathers(c.x, c.y + 1, c.z, 4 + Math.floor(this.rand() * 3), 9, 6, 6)
          const f = this.birds[e.hunter]
          if (f) f.dazed = RULES.missStun
        }
        break
      }
      case 'diveCommit':
        if (e.hunter >= 0) this.burst(BK.clap, 0, 0, 0, 0.2, e.hunter)
        break
      case 'flap':
        this.burst(BK.flapAir, 0, 0, 0, 0.32, e.slot)
        break
      case 'bump':
        this.feathers(e.x, e.z, -e.y, 3, 4)
        this.puffs(e.x, e.z, -e.y, 2, 2, 0.3)
        break
      case 'towerBump': {
        const b = S?.bySlot[e.slot]
        if (b) {
          this.feathers(b.x, b.z, -b.y, 2, 3)
          this.puffs(b.x, b.z, -b.y, 2, 2, 0.3)
        }
        break
      }
      case 'paleOnStrong':
        this.burst(BK.tsk, e.x, GROUND_Y, -e.y, 0.2, e.slot)
        break
      case 'crown':
        if (e.slot >= 0) this.burst(BK.crownRing, 0, 0, 0, 0.5, e.slot)
        break
      case 'bigSteal': {
        const f = this.birds[e.slot]
        const S2 = S?.bySlot[e.slot]
        if (!f || !S2) break
        const b = this.burst(BK.brush, 0, 0, 0, 0.62, e.slot)
        if (b) {
          b.pathN = f.shadowHist.copyRecent(b.path, 26)
          b.r = S2.shadow.r
        }
        break
      }
      default:
        break
    }
  }

  // ─── Mise à jour ────────────────────────────────────────────────────────

  update(view: GameView, camera: Camera, dtReal: number, viewportH: number): void {
    this.frame++
    const dt = clamp(dtReal, 0, 0.1) * view.timeScale
    this.time += dt
    this.realTime += clamp(dtReal, 0, 0.1)
    const U = nprUniforms
    setRgb(this.cInk, U.uInk.value)
    setRgb(this.cPaper, U.uPaper.value)
    setRgb(this.cBone, U.uBirdLit.value)
    const gf = U.uGroundFlat.value
    const ss = U.uSandShade.value
    this.cPuff[0] = (gf.r + ss.r) * 0.5
    this.cPuff[1] = (gf.g + ss.g) * 0.5
    this.cPuff[2] = (gf.b + ss.b) * 0.5
    this.cPuff[3] = 1
    const cs = U.uCastShadow.value
    this.cNight[0] = cs.r * 0.8 + 0.06
    this.cNight[1] = cs.g * 0.75 + 0.03
    this.cNight[2] = cs.b * 0.9 + 0.1
    this.cNight[3] = 1
    setRgb(this.cGold, U.uCrownGold.value)

    const cam = camera as PerspectiveCamera
    const fovY = ((cam.fov ?? 40) * Math.PI) / 180
    this.pxPerM1 = viewportH / (2 * Math.tan(fovY / 2))
    this.px1080 = viewportH / 1080
    this.screenW1080 = 1080 * (cam.isPerspectiveCamera ? cam.aspect : 16 / 9)
    camera.getWorldPosition(_camPos)
    _right.setFromMatrixColumn(camera.matrixWorld, 0).normalize()
    _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    _fwd.setFromMatrixColumn(camera.matrixWorld, 2).negate().normalize()

    // Nouvelle simulation (salon → manche, manche → manche, titre, podium) : les oiseaux
    // sont téléportés, on oublie traînées, particules et effets en cours (polish B2 :
    // lignes droites qui traversaient l'arène au compte à rebours).
    if (view.sim !== this.lastSim) {
      this.lastSim = view.sim
      for (const f of this.birds) {
        f.resetPaths()
        f.seen = -1
      }
      for (const p of this.particles) p.alive = false
      for (const b of this.bursts) b.alive = false
    }

    for (const e of this.queue) this.handle(view, e)
    this.queue.length = 0

    this.sprites.begin()
    this.icons.begin()
    this.strokes.begin()
    this.ribbons.begin()

    const S = view.sim
    if (S) {
      for (const b of S.birds) this.updateBird(view, S, b, dt)
      this.nightDust(S, dt)
    }
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const f = this.birds[i]!
      if (f.seen !== this.frame && f.seen >= 0) {
        f.resetPaths()
        f.seen = -1
      }
    }
    this.updateParticles(dt)
    this.updateBursts(view, dt)
    this.drawGlory(view, dt)

    this.sprites.end()
    this.icons.end()
    this.strokes.end()
    this.ribbons.end()
  }

  /** Pixels (1080p) par mètre à une position monde. */
  private pxPerM(p: Vector3): number {
    return this.pxPerM1 / Math.max(1, p.distanceTo(_camPos)) / this.px1080
  }

  private updateBird(view: GameView, S: SimState, b: BirdState, dt: number): void {
    const f = this.birds[b.slot]!
    // Saut de plus de TELEPORT_M depuis la frame précédente : pas de segment fantôme.
    const jx = b.x - f.lastX
    const jy = b.y - f.lastY
    const jz = b.z - f.lastZ
    if (f.seen >= 0 && jx * jx + jy * jy + jz * jz > TELEPORT_M * TELEPORT_M) f.resetPaths()
    f.lastX = b.x
    f.lastY = b.y
    f.lastZ = b.z
    f.seen = this.frame
    const slot = b.slot
    const scale = this.scaleOf(slot)
    const col = this.colorOf(view, slot)
    const diving = b.dive === 'guided' || b.dive === 'committed'
    const stunned = b.stun > 0
    const t = this.time

    // ─── Ruban de traînée ───────────────────────────────────────────────
    const tail = this.anchor(view, slot, 'tail', _v)
    const attached = !diving && !stunned
    if (attached) {
      if (!f.trailAttached) {
        f.trail.clear()
        f.trailAttached = true
        f.trailCut = 0
      }
      const n = f.trail.count
      if (n === 0) f.trail.push(tail.x, tail.y, tail.z, t)
      else {
        const o = f.trail.at(0)
        const d = f.trail.data
        const dx = tail.x - d[o]!
        const dy = tail.y - d[o + 1]!
        const dz = tail.z - d[o + 2]!
        if (dx * dx + dy * dy + dz * dz >= TRAIL_SPACING * TRAIL_SPACING) f.trail.push(tail.x, tail.y, tail.z, t)
      }
    } else if (f.trailAttached) {
      f.trailAttached = false
      f.trailCut = 0
    }
    if (!f.trailAttached) f.trailCut += dt * TRAIL_RETRACT
    this.drawTrail(f, tail, col)

    // ─── Filets d'air (HAUT) ────────────────────────────────────────────
    const high = smoothstep(RULES.strongMaxAlt + 1, RULES.altHigh - 1.5, b.z)
    springTo(f.filament, !diving && !stunned ? high : 0, 6, 1, dt)
    if (f.filament.x > 0.02) {
      const tl = this.anchor(view, slot, 'tipL', _a)
      f.tipL.push(tl.x, tl.y, tl.z, t)
      const tr = this.anchor(view, slot, 'tipR', _a)
      f.tipR.push(tr.x, tr.y, tr.z, t)
      this.drawFilament(f.tipL, t, f.filament.x)
      this.drawFilament(f.tipR, t, f.filament.x)
    } else {
      f.tipL.clear()
      f.tipR.clear()
    }

    // ─── Bouffées de sable (BAS) ────────────────────────────────────────
    const low = 1 - smoothstep(RULES.altLow + 1.5, RULES.altLow + 4, b.z)
    if (low > 0.1 && !diving) {
      const rate = PUFF_RATE * (this.quality === 'low' ? 0.5 : 1) * low
      f.puffTimer -= dt * rate
      if (f.puffTimer <= 0) {
        f.puffTimer += 0.7 + 0.6 * this.rand()
        f.puffSide = -f.puffSide
        const tip = this.anchor(view, slot, f.puffSide > 0 ? 'tipL' : 'tipR', _a)
        const ch = this.anchor(view, slot, 'chest', _b)
        const k = 0.35 + 0.4 * this.rand()
        const px = ch.x + (tip.x - ch.x) * k
        const pz = ch.z + (tip.z - ch.z) * k
        const p = this.spawn(PK.puff, px, GROUND_Y, pz, 0.8, 0.75 + 0.35 * this.rand())
        if (p) {
          const hx = Math.cos(b.heading)
          const hy = Math.sin(b.heading)
          p.vx = -hx * 3 + (this.rand() - 0.5) * 1.5
          p.vz = hy * 3 + (this.rand() - 0.5) * 1.5
          p.vy = 0.9
          p.drag = 1.6
          p.rotV = (this.rand() - 0.5)
        }
      }
    }

    // ─── Historique des centres d'ombre (coups de pinceau) ──────────────
    f.shadowTimer -= dt
    if (f.shadowTimer <= 0) {
      f.shadowTimer += 0.1
      f.shadowHist.push(b.shadow.cx, GROUND_Y, -b.shadow.cy, t)
    }

    // ─── Piqué : lignes de vitesse, traînée blanche du clac ─────────────
    springTo(f.speed, diving ? 1 : 0, diving ? 14 : 8, 1, dt)
    const chest = this.anchor(view, slot, 'chest', _b)
    if (f.speed.x > 0.03) this.drawSpeedLines(b, chest, f.speed.x, scale, this.pxPerM(chest))
    if (b.dive === 'committed') {
      f.streakFade = 1
      f.streak.push(chest.x, chest.y, chest.z, t)
    } else if (f.streakFade > 0) {
      f.streakFade = Math.max(0, f.streakFade - dt / 0.3)
      if (f.streakFade === 0) f.streak.clear()
    }
    if (f.streak.count > 1 && f.streakFade > 0) this.drawStreak(f, f.streakFade, this.pxPerM(chest))

    // ─── Immunité : plumes hérissées (traits radiaux, clignotement 4 Hz) ─
    springTo(f.immune, b.immune > 0 && !stunned ? 1 : 0, 12, 1, dt)
    if (f.immune.x > 0.03 && (this.realTime * 4 + slot * 0.37) % 1 < 0.62) this.drawBristles(chest, f.immune.x, scale, b.heading)

    // ─── Décrochage : étoiles d'encre autour de la tête ─────────────────
    // (touché, ou chasseur planté après une esquive de sa cible)
    f.dazed = Math.max(0, f.dazed - dt)
    const dazed = f.dazed > 0 && stunned
    springTo(f.stars, stunned && (b.stunKind === 'hit' || dazed) ? 1 : 0, dazed ? 18 : 10, 1, dt)
    if (f.stars.x > 0.03) {
      // Ronde de 3 croix d'encre AU-DESSUS de l'oiseau à l'écran (ellipse aplatie, comme en
      // BD), écartées d'au moins 13 px : lisibles à 50 px d'envergure, jamais en paquet sur le dos.
      // Chasseur planté après une esquive : ancrées sur la poitrine (la tête roule sous le corps),
      // plus hautes, plus grosses, avec un halo papier et sans test de profondeur.
      const c = this.anchor(view, slot, dazed ? 'chest' : 'head', _a)
      const ppm = this.pxPerM(c)
      const R = Math.max(1.3 * scale * ppm, dazed ? 17 : 13)
      const lift = Math.max((dazed ? 1.8 : 1.0) * scale * ppm, dazed ? 24 : 12)
      for (let k = 0; k < 3; k++) {
        const a = this.realTime * 5.5 + (k * TAU) / 3
        const s = this.spec
        s.x = c.x
        s.y = c.y
        s.z = c.z
        s.size = 0.34 * f.stars.x * scale
        s.offX = Math.cos(a) * R
        s.offY = lift + Math.sin(a) * R * 0.38
        s.rot = a
        s.shape = SHAPE.cross4
        s.lineW = 0
        s.p0 = s.p1 = s.p2 = 0
        s.dissolve = 0
        this.setFill(this.cInk, 0)
        if (dazed) {
          // halo papier, puis l'étoile d'encre par-dessus
          s.minPx = 7 * f.stars.x
          this.setLine(this.cPaper, 0.95)
          s.inkBoost = 2.4
          this.icons.push(s)
          s.minPx = 7 * f.stars.x
          this.setLine(this.cInk, 1)
          s.inkBoost = 0.9
          this.icons.push(s)
        } else {
          s.minPx = 3.8 * f.stars.x
          this.setLine(this.cInk, 1)
          s.inkBoost = 0.6
          this.sprites.push(s)
        }
      }
    }

    // ─── Icônes au-dessus de l'oiseau (empilées à l'écran) ──────────────
    // Masquées en démo (écran titre) et en gros plan : l'oiseau se lit de lui-même.
    const span = birdAnchors.frame[slot] === birdAnchors.counter ? birdAnchors.spanPx[slot]! : 0
    springTo(f.icons, S.config.mode !== 'demo' && span < ICONS_HIDE_PX ? 1 : 0, 14, 1, dt)
    const iconK = clamp01(f.icons.x)
    const showIcons = iconK > 0.02
    const top = this.anchor(view, slot, 'riderTop', _a)
    const C = birdAnchors.crown
    const crowned = S.crownSlot === slot && C.slot === slot && C.frame === birdAnchors.counter
    // Pile d'icônes vers le haut de l'écran, au-dessus de la couronne s'il y en a une.
    const lift = iconLift(_fwd.y, false) * scale
    const ix = crowned ? C.tx : top.x + _up.x * lift
    const iy = crowned ? C.ty : top.y + _up.y * lift
    const iz = crowned ? C.tz : top.z + _up.z * lift
    _b.set(ix, iy, iz)
    const ppm = this.pxPerM(_b)
    let stack = crowned ? ICON_GAP : 0
    const player = view.players[slot]
    // Jeton-glyphe du mode daltonien (permanent, 18 px).
    if (view.colorblind && showIcons) {
      const ci = player?.colorIndex ?? slot
      const r = Math.max(9, 0.9 * ppm) * iconK
      this.icon(ix, iy, iz, 0, stack + r, r / ppm, 9, SHAPE.dot, col, 1, this.cInk, 1, 1.2, 0)
      this.icon(ix, iy, iz, 0, stack + r, (r * 0.74) / ppm, 9 * 0.74, SHAPE.glyphToken, this.cPaper, 1, this.cInk, 1, 0, glyphIndex(ci))
      stack += 2 * r + ICON_GAP
    }
    // Chevron de verrouillage à la couleur du chasseur (un seul par cible).
    const locked = b.lockedBy >= 0 && !b.hidden
    if (locked) {
      const hc = this.colorOf(view, b.lockedBy)
      f.chevColor[0] = hc[0]!
      f.chevColor[1] = hc[1]!
      f.chevColor[2] = hc[2]!
    }
    springTo(f.chev, locked ? 1 : 0, 16, locked ? 0.45 : 1, dt)
    if (f.chev.x > 0.02 && showIcons) {
      const k = Math.max(0, f.chev.x) * iconK
      const r = Math.max(11, 1.2 * ppm) * k
      const bob = 2.5 * Math.sin(this.realTime * TAU * 1.6)
      this.cTmp[0] = f.chevColor[0]!
      this.cTmp[1] = f.chevColor[1]!
      this.cTmp[2] = f.chevColor[2]!
      this.cTmp[3] = 1
      this.icon(ix, iy, iz, 0, stack + r + bob, r / ppm, 11 * k, SHAPE.chevron, this.cTmp, 1, this.cInk, 1, 1.6, 0)
      stack += 2 * r + ICON_GAP
    }
    // « ! » : un piqué se prépare contre cet oiseau.
    let threat = false
    for (const o of S.birds) if (o.diveTarget === slot && (o.dive === 'windup' || o.dive === 'guided' || o.dive === 'committed')) threat = true
    springTo(f.bang, threat ? 1 : 0, 20, threat ? 0.4 : 1, dt)
    if (f.bang.x > 0.02 && showIcons) {
      const k = Math.max(0, f.bang.x) * iconK
      const r = Math.max(13, 1.4 * ppm) * k
      const shake = threat ? Math.sin(this.realTime * 47) * 0.12 : 0
      this.icon(ix, iy, iz, 0, stack + r, r / ppm, 13 * k, SHAPE.bang, this.cPaper, 1, this.cInk, 1, 1.6, 0, shake, 0.4)
      stack += 2 * r + ICON_GAP
    }
    // Œil barré : oiseau caché.
    springTo(f.eye, b.hidden ? 1 : 0, 12, 0.7, dt)
    if (f.eye.x > 0.02 && showIcons) {
      const k = Math.max(0, f.eye.x) * iconK
      const r = Math.max(10, 1.0 * ppm) * k
      this.icon(ix, iy, iz, 0, stack + r, r / ppm, 10 * k, SHAPE.eyeSlash, this.cPaper, 0.9, this.cInk, 0.85, 1.3, 0)
      stack += 2 * r + ICON_GAP
    }
    // Plume : aide au vol (à droite de l'oiseau).
    if ((player?.assist || b.assist) && showIcons) {
      const r = Math.max(8, 0.8 * ppm) * iconK
      this.icon(top.x + _up.x * lift, top.y + 0.5 * scale, top.z + _up.z * lift, 3.2 * ppm * scale + r, r * 0.3, r / ppm, 8 * iconK, SHAPE.featherIcon, this.cPaper, 1, this.cInk, 1, 1.2, 0)
    }
  }

  private setLine(c: ArrayLike<number>, a: number): void {
    const l = this.spec.line as Float32Array
    l[0] = c[0]!
    l[1] = c[1]!
    l[2] = c[2]!
    l[3] = a
  }

  private setFill(c: ArrayLike<number>, a: number): void {
    const l = this.spec.fill as Float32Array
    l[0] = c[0]!
    l[1] = c[1]!
    l[2] = c[2]!
    l[3] = a
  }

  /** Icône écran (sans test de profondeur) ancrée à une position monde, décalée en px. */
  private icon(
    x: number,
    y: number,
    z: number,
    offX: number,
    offY: number,
    sizeM: number,
    minPx: number,
    shape: number,
    fill: ArrayLike<number>,
    fillA: number,
    line: ArrayLike<number>,
    lineA: number,
    lineW: number,
    p0: number,
    rot = 0,
    inkBoost = 0,
  ): void {
    const s = this.spec
    s.x = x
    s.y = y
    s.z = z
    s.offX = offX
    s.offY = offY
    s.size = sizeM
    s.minPx = minPx
    s.rot = rot
    s.shape = shape
    this.setFill(fill, fillA)
    this.setLine(line, lineA)
    s.lineW = lineW
    s.inkBoost = inkBoost
    s.p0 = p0
    s.p1 = 0
    s.p2 = 0
    s.dissolve = 0
    this.icons.push(s)
  }

  // ─── Dessins continus ───────────────────────────────────────────────────

  private drawTrail(f: BirdFx, head: Vector3, col: Rgb): void {
    const P = f.trail
    if (P.count < 1) return
    const R = this.ribbons
    const d = P.data
    const maxLen = TRAIL_LEN - f.trailCut
    if (maxLen <= 0.3) {
      if (!f.trailAttached) P.clear()
      return
    }
    // Tête : l'ancre de la queue si le ruban est attaché, sinon le dernier point
    // enregistré (ruban coupé qui se rétracte par sa fin).
    const first = f.trailAttached ? 0 : 1
    if (P.count <= first) return
    R.beginStrip()
    let px = f.trailAttached ? head.x : d[P.at(0)]!
    let py = f.trailAttached ? head.y : d[P.at(0) + 1]!
    let pz = f.trailAttached ? head.z : d[P.at(0) + 2]!
    let len = 0
    let used = 0
    const o0 = P.at(first)
    // Chaque point passe par le tableau `tp` (x, y, z, tangente, u) : aucun flottant en argument,
    // donc aucune boîte allouée par point (polish vague 2, critique tech §17).
    const T = this.tp
    T[0] = px
    T[1] = py
    T[2] = pz
    T[3] = px - d[o0]!
    T[4] = py - d[o0 + 1]!
    T[5] = pz - d[o0 + 2]!
    T[6] = 0
    this.trailPoint(col)
    for (let k = first; k < P.count; k++) {
      const o = P.at(k)
      const nx = d[o]!
      const ny = d[o + 1]!
      const nz = d[o + 2]!
      const dx = nx - px
      const dy = ny - py
      const dz = nz - pz
      const seg = Math.sqrt(dx * dx + dy * dy + dz * dz)
      if (seg < 1e-4) continue
      T[3] = -dx
      T[4] = -dy
      T[5] = -dz
      if (len + seg >= maxLen) {
        const r = (maxLen - len) / seg
        T[0] = px + dx * r
        T[1] = py + dy * r
        T[2] = pz + dz * r
        T[6] = 1
        this.trailPoint(col)
        used = k + 1
        len = maxLen
        break
      }
      len += seg
      T[0] = nx
      T[1] = ny
      T[2] = nz
      T[6] = len / TRAIL_LEN
      this.trailPoint(col)
      px = nx
      py = ny
      pz = nz
      used = k + 1
    }
    R.endStrip()
    // On ne garde que ce qui sert (+ marge).
    if (f.trailAttached && used + 2 < P.count) P.truncate(used + 2)
  }

  /**
   * Point du ruban (saisi dans `tp`) : 0,35 m de large mais jamais plus de 6 px à l'écran,
   * effilement fort sur les 30 % finaux, aminci jusqu'à disparaître près de la caméra (gros plans).
   */
  private trailPoint(col: Rgb): void {
    const T = this.tp
    const x = T[0]!
    const y = T[1]!
    const z = T[2]!
    const uu = clamp01(T[6]!)
    const e = uu <= 0.7 ? 0 : uu >= 1 ? 1 : (uu - 0.7) / 0.3
    const taper = (1 - 0.15 * uu) * (1 - e * e * (3 - 2 * e)) ** 0.8
    const cx = x - _camPos.x
    const cy = y - _camPos.y
    const cz = z - _camPos.z
    const dist = Math.sqrt(cx * cx + cy * cy + cz * cz)
    const n = clamp01((dist - TRAIL_NEAR_M * 0.4) / (TRAIL_NEAR_M * 0.6))
    const near = n * n * (3 - 2 * n)
    // px (1080p) par mètre à ce point, comme les shaders (profondeur de vue, pas distance).
    const depth = cx * _fwd.x + cy * _fwd.y + cz * _fwd.z
    const ppm = this.pxPerM1 / Math.max(1, depth) / this.px1080
    const V = this.ribbons.v
    V[0] = x
    V[1] = y
    V[2] = z
    V[3] = T[3]!
    V[4] = T[4]!
    V[5] = T[5]!
    V[6] = Math.min(TRAIL_WIDTH, TRAIL_MAX_PX / ppm) * taper * near
    V[7] = (2.4 * taper + 0.4) * near
    V[8] = 1
    V[9] = TRAIL_ALPHA
    this.ribbons.commit(col)
  }

  private drawFilament(P: PathBuffer, t: number, k: number): void {
    const R = this.ribbons
    const d = P.data
    let n = 0
    for (let i = 0; i < P.count; i++) {
      if (t - d[P.at(i) + 3]! > FILAMENT_AGE) break
      n++
    }
    P.truncate(n + 1)
    if (n < 2) return
    R.beginStrip()
    for (let i = 0; i < n; i++) {
      const o = P.at(i)
      const o2 = P.at(Math.min(n - 1, i + 1))
      const o0 = P.at(Math.max(0, i - 1))
      const age = (t - d[o + 3]!) / FILAMENT_AGE
      const a = 0.8 * k * (1 - age) ** 0.6
      {
        const V = R.v
        V[0] = d[o]!
        V[1] = d[o + 1]!
        V[2] = d[o + 2]!
        V[3] = d[o0]! - d[o2]!
        V[4] = d[o0 + 1]! - d[o2 + 1]!
        V[5] = d[o0 + 2]! - d[o2 + 2]!
        V[6] = 0
        V[7] = 1.5 * (1 - 0.4 * age)
        V[8] = 0
        V[9] = a
        R.commit(this.cCream)
      }
    }
    R.endStrip()
  }

  /** Traînée blanche du clac : bornée à 25 % de la largeur d'écran (ppm : px/m à la tête). */
  private drawStreak(f: BirdFx, fade: number, ppm: number): void {
    const P = f.streak
    const d = P.data
    const R = this.ribbons
    const maxL = (STREAK_MAX_FRAC * this.screenW1080) / Math.max(ppm, 1e-3)
    // Nombre de points qui tiennent dans la longueur maximale.
    let n = 1
    let len = 0
    for (; n < Math.min(P.count, 24); n++) {
      const a = P.at(n - 1)
      const b = P.at(n)
      const sx = d[b]! - d[a]!
      const sy = d[b + 1]! - d[a + 1]!
      const sz = d[b + 2]! - d[a + 2]!
      len += Math.sqrt(sx * sx + sy * sy + sz * sz)
      if (len > maxL) break
    }
    if (n < 2) return
    R.beginStrip()
    for (let i = 0; i < n; i++) {
      const o = P.at(i)
      const o2 = P.at(Math.min(n - 1, i + 1))
      const o0 = P.at(Math.max(0, i - 1))
      const u = i / Math.max(1, n - 1)
      {
        const V = R.v
        V[0] = d[o]!
        V[1] = d[o + 1]!
        V[2] = d[o + 2]!
        V[3] = d[o0]! - d[o2]!
        V[4] = d[o0 + 1]! - d[o2 + 1]!
        V[5] = d[o0 + 2]! - d[o2 + 2]!
        V[6] = 0.5 * (1 - u) * fade
        V[7] = 3 * (1 - u) * fade
        V[8] = 1
        V[9] = 0.95
        R.commit(this.cCream)
      }
    }
    R.endStrip()
  }

  private drawSpeedLines(b: BirdState, c: Vector3, k: number, scale: number, ppm: number): void {
    // Longueur bornée à 25 % de la largeur d'écran (gros plans du titre et des piqués).
    const maxL = (STREAK_MAX_FRAC * this.screenW1080) / Math.max(ppm, 1e-3)
    // Direction de vol (three) et base perpendiculaire.
    let vx = b.vx
    let vy = b.vz
    let vz = -b.vy
    const l = Math.sqrt(vx * vx + vy * vy + vz * vz) || 1
    vx /= l
    vy /= l
    vz /= l
    // a ⟂ v, dans le plan de l'écran autant que possible.
    let ax = vy * _fwd.z - vz * _fwd.y
    let ay = vz * _fwd.x - vx * _fwd.z
    let az = vx * _fwd.y - vy * _fwd.x
    const al = Math.sqrt(ax * ax + ay * ay + az * az) || 1
    ax /= al
    ay /= al
    az /= al
    const bx = vy * az - vz * ay
    const by = vz * ax - vx * az
    const bz = vx * ay - vy * ax
    const boil = Math.floor(this.realTime * 10) // tremblé à 10 images/s
    const n = 6
    for (let i = 0; i < n; i++) {
      const h1 = hash01(b.slot * 131 + i * 17 + boil * 7)
      const h2 = hash01(b.slot * 71 + i * 29 + boil * 13)
      const th = (i / n) * TAU + h1 * 0.6
      const dx = ax * Math.cos(th) + bx * Math.sin(th)
      const dy = ay * Math.cos(th) + by * Math.sin(th)
      const dz = az * Math.cos(th) + bz * Math.sin(th)
      const r = (1.8 + 1.4 * h2) * scale
      const L = Math.min((8 + 7 * h1) * k, maxL)
      const s0 = Math.min(3.2 * scale, maxL * 0.3)
      {
        const V = this.strokes.v
        V[0] = c.x - vx * (s0 + L) + dx * r * 1.5
        V[1] = c.y - vy * (s0 + L) + dy * r * 1.5
        V[2] = c.z - vz * (s0 + L) + dz * r * 1.5
        V[3] = c.x - vx * s0 + dx * r * 0.75
        V[4] = c.y - vy * s0 + dy * r * 0.75
        V[5] = c.z - vz * s0 + dz * r * 0.75
        V[6] = 0.6
        V[7] = 1.3
        V[8] = 0.6 * k
        this.strokes.commit(this.cInk)
      }
    }
  }

  /**
   * Plumes hérissées (immunité) : 8 traits d'encre radiaux autour de l'oiseau, sur
   * une ellipse horizontale calée sur son envergure (lisible vu de dessus), épais
   * à la racine, effilés à la pointe.
   */
  private drawBristles(c: Vector3, k: number, scale: number, heading: number): void {
    const fx = Math.cos(heading)
    const fz = -Math.sin(heading)
    const sx = -fz
    const sz = fx
    for (let i = 0; i < 8; i++) {
      const a = ((i + 0.5) / 8) * TAU
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const rx = 6.4 * scale
      const rf = 3.4 * scale
      // Point de l'ellipse et normale extérieure.
      const px = sx * ca * rx + fx * sa * rf
      const pz = sz * ca * rx + fz * sa * rf
      let nx = sx * (ca / rx) + fx * (sa / rf)
      let nz = sz * (ca / rx) + fz * (sa / rf)
      const nl = Math.sqrt(nx * nx + nz * nz) || 1
      nx /= nl
      nz /= nl
      const L = 2.1 * scale * k
      {
        const V = this.strokes.v
        V[0] = c.x + px
        V[1] = c.y
        V[2] = c.z + pz
        V[3] = c.x + px + nx * L
        V[4] = c.y + 0.3 * L
        V[5] = c.z + pz + nz * L
        V[6] = 3.2
        V[7] = 1.0
        V[8] = 0.9 * k
        this.strokes.commit(this.cInk)
      }
    }
  }

  /**
   * Gloire de victoire (ART_BIBLE §6.8) : 24 rayons d'encre à 35 % dans un disque
   * d'environ 250 px derrière le vainqueur (les rayons traversaient tout l'écran).
   */
  private drawGlory(view: GameView, dt: number): void {
    springTo(this.glory, this.glorySlot >= 0 ? 1 : 0, 4, 1, dt)
    if (this.glory.x < 0.02 || this.glorySlot < 0 || !view.sim?.bySlot[this.glorySlot]) return
    const c = this.anchor(view, this.glorySlot, 'chest', _a)
    // Derrière l'oiseau (le long de la visée) : l'oiseau les masque.
    c.addScaledVector(_fwd, 4)
    const k = this.glory.x
    const rot = (this.realTime * 6 * Math.PI) / 180
    const R = GLORY_RADIUS_PX / Math.max(this.pxPerM(c), 1e-3)
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU + rot
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      // Rayons alternés longs/courts, comme une gloire de case de BD.
      const r0 = R * 0.34
      const r1 = r0 + (i % 2 ? 0.42 : 0.56 + 0.1 * hash01(i * 7)) * R * k
      {
        const V = this.strokes.v
        V[0] = c.x + (_right.x * ca + _up.x * sa) * r0
        V[1] = c.y + (_right.y * ca + _up.y * sa) * r0
        V[2] = c.z + (_right.z * ca + _up.z * sa) * r0
        V[3] = c.x + (_right.x * ca + _up.x * sa) * r1
        V[4] = c.y + (_right.y * ca + _up.y * sa) * r1
        V[5] = c.z + (_right.z * ca + _up.z * sa) * r1
        V[6] = 1.3
        V[7] = 1.0
        V[8] = GLORY_ALPHA * k
        this.strokes.commit(this.cInk)
      }
    }
  }

  private nightDust(S: SimState, dt: number): void {
    const N = S.night
    if (!N.active) return
    this.nightTimer -= dt * (this.quality === 'low' ? 10 : 22)
    const perpX = -N.dirY
    const perpY = N.dirX
    const span = Math.max(S.arena.a, S.arena.b)
    while (this.nightTimer <= 0) {
      this.nightTimer += 1
      const u = (this.rand() * 2 - 1) * span
      // Profil dentelé du front.
      const f = (u + N.jagSpan) / (2 * N.jagSpan)
      const j = N.jag.length > 1 ? N.jag[Math.max(0, Math.min(N.jag.length - 1, Math.round(f * (N.jag.length - 1))))]! : 0
      const sx = N.dirX * (N.s + j) + perpX * u
      const sy = N.dirY * (N.s + j) + perpY * u
      if ((sx / S.arena.a) ** 2 + (sy / S.arena.b) ** 2 > 1.1) continue
      const p = this.spawn(PK.nightPuff, sx, GROUND_Y, -sy, 1.1 + 0.4 * this.rand(), 0.9 + 0.8 * this.rand())
      if (!p) break
      p.vx = N.dirX * 4 + (this.rand() - 0.5)
      p.vz = -N.dirY * 4 + (this.rand() - 0.5)
      p.vy = 1.2
      p.drag = 1.2
    }
  }

  // ─── Particules ─────────────────────────────────────────────────────────

  private updateParticles(dt: number): void {
    const s = this.spec
    for (const p of this.particles) {
      if (!p.alive) continue
      p.t += dt
      const u = p.t / p.life
      if (u >= 1) {
        p.alive = false
        continue
      }
      const dr = Math.exp(-p.drag * dt)
      p.vx *= dr
      p.vz *= dr
      p.vy = p.vy * dr - p.grav * dt
      p.x += p.vx * dt
      p.y += p.vy * dt
      p.z += p.vz * dt
      p.rot += p.rotV * dt
      s.offX = s.offY = 0
      s.p0 = 0
      s.p1 = 0
      s.p2 = p.seed
      s.inkBoost = 0
      s.x = p.x
      s.y = p.y
      s.z = p.z
      s.rot = p.rot
      switch (p.kind) {
        case PK.puff:
        case PK.nightPuff: {
          // Enfle vite, puis rétrécit et se dissout en trame. Au plus 60 px à l'écran,
          // rétrécie (jusqu'à disparaître) près de la caméra : pas de « biscuits » en gros plan.
          const grow = 1 - (1 - Math.min(1, u / 0.35)) ** 2
          const shrink = 1 - smoothstep(0.7, 1, u) * 0.6
          // (distance et px/m calculés sur place : pas de flottants en argument, pas de boîtes)
          const cx = p.x - _camPos.x
          const cy = p.y - _camPos.y
          const cz = p.z - _camPos.z
          const ppm = this.pxPerM1 / Math.max(1, cx * _fwd.x + cy * _fwd.y + cz * _fwd.z) / this.px1080
          const near = smoothstep(PUFF_NEAR_M * 0.35, PUFF_NEAR_M, Math.sqrt(cx * cx + cy * cy + cz * cz))
          s.size = Math.min(p.size * (0.45 + 0.75 * grow) * shrink, (0.5 * PUFF_MAX_PX) / ppm / 0.92) * near
          s.minPx = 2 * near
          s.shape = SHAPE.puff
          s.p1 = 4 + Math.floor(p.seed * 3)
          this.setFill(p.kind === PK.puff ? this.cPuff : this.cNight, 1)
          this.setLine(this.cInk, p.kind === PK.puff ? 0.4 : 0.25)
          s.lineW = 1
          s.dissolve = smoothstep(0.55, 1, u)
          break
        }
        case PK.feather: {
          // Plume qui tournoie en tombant (balancement).
          p.x += Math.sin(p.t * 5 + p.seed * 9) * 1.2 * dt
          p.z += Math.cos(p.t * 4 + p.seed * 7) * 1.2 * dt
          if (p.y < GROUND_Y) {
            p.y = GROUND_Y
            p.vy = 0
          }
          s.size = p.size * (1 - smoothstep(0.75, 1, u))
          s.minPx = (p.minPx || 4) * (1 - smoothstep(0.75, 1, u))
          s.shape = SHAPE.feather
          this.setFill(this.cBone, 1)
          this.setLine(this.cInk, 1)
          s.lineW = 1
          s.dissolve = 0
          break
        }
        case PK.clod: {
          if (p.y < GROUND_Y) {
            p.y = GROUND_Y
            p.vy = 0
            p.vx *= 0.5
            p.vz *= 0.5
          }
          s.size = p.size
          s.minPx = 1.6
          s.shape = SHAPE.clod
          s.rot = Math.atan2(p.vy, Math.sqrt(p.vx * p.vx + p.vz * p.vz))
          this.setFill(this.cInk, 0)
          this.setLine(this.cInk, 0.85 * (1 - smoothstep(0.7, 1, u)))
          s.lineW = 0
          s.inkBoost = 0.5
          s.dissolve = 0
          break
        }
      }
      this.sprites.push(s)
    }
  }

  // ─── Effets ponctuels ───────────────────────────────────────────────────

  private updateBursts(view: GameView, dt: number): void {
    for (const b of this.bursts) {
      if (!b.alive) continue
      b.t += dt
      const u = b.t / b.life
      if (u >= 1) {
        b.alive = false
        continue
      }
      switch (b.kind) {
        case BK.star:
          this.drawStar(b, u)
          break
        case BK.crownRing:
          this.drawCrownRing(view, b, u)
          break
        case BK.brush:
          this.drawBrush(b, u)
          break
        case BK.flapAir:
          this.drawFlapAir(view, b, u)
          break
        case BK.clap:
          this.drawClap(view, b, u)
          break
        case BK.tsk:
          this.drawTsk(b, u)
          break
        case BK.dodge:
          this.drawDodge(view, b, u)
          break
      }
    }
  }

  /** Étoile d'impact : 12 rayons d'encre de 2 px, centre vide, qui rétrécissent (0,25 s). */
  private drawStar(b: Burst, u: number): void {
    const n = 12
    const e = 1 - (1 - u) ** 2
    for (let i = 0; i < n; i++) {
      const h = hash01(Math.floor(b.seed * 1e6) + i * 13)
      const a = (i / n) * TAU + (h - 0.5) * 0.35
      const len = (1.5 + 2.5 * hash01(Math.floor(b.seed * 1e6) + i * 31)) * (1 - u)
      const r0 = 1.4 + 3.2 * e
      const r1 = r0 + len
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      {
        const V = this.strokes.v
        V[0] = b.x + (_right.x * ca + _up.x * sa) * r0
        V[1] = b.y + (_right.y * ca + _up.y * sa) * r0
        V[2] = b.z + (_right.z * ca + _up.z * sa) * r0
        V[3] = b.x + (_right.x * ca + _up.x * sa) * r1
        V[4] = b.y + (_right.y * ca + _up.y * sa) * r1
        V[5] = b.z + (_right.z * ca + _up.z * sa) * r1
        V[6] = 2.4
        V[7] = 1.4
        V[8] = 1
        this.strokes.commit(this.cInk)
      }
    }
  }

  /** Anneau d'encre qui se contracte sur la couronne + 6 rayons, puis vire à l'or (0,5 s). */
  private drawCrownRing(view: GameView, b: Burst, u: number): void {
    if (!view.sim?.bySlot[b.slot]) return
    // Centré sur la couronne affichée (sinon à sa place théorique).
    const C = birdAnchors.crown
    let cx: number
    let cy: number
    let cz: number
    if (C.slot === b.slot && C.frame === birdAnchors.counter) {
      cx = C.cx
      cy = C.cy
      cz = C.cz
    } else {
      const top = this.anchor(view, b.slot, 'riderTop', _a)
      // En gros plan, la couronne se pose sur la capuche (controller.updateCrown, envergure
      // 170-230 px) : l'anneau ne flotte plus 3 m au-dessus du cavalier pendant que l'ancienne
      // couronne s'efface (verify2-eyes : anneau d'encre seul dans le ciel au titre).
      const span = birdAnchors.frame[b.slot] === birdAnchors.counter ? birdAnchors.spanPx[b.slot]! : 0
      const lift = (crownLift(_fwd.y) + 0.6) * (1 - smoothstep(170, 230, span))
      cx = top.x + _up.x * lift
      cy = top.y + _up.y * lift
      cz = top.z + _up.z * lift
    }
    _b.set(cx, cy, cz)
    // Tailles en px (1080p) : l'anneau se contracte de 60 à 14 px de rayon, quelle que soit la distance.
    const scale = 1 / Math.max(this.pxPerM(_b), 1e-3)
    const e = 1 - (1 - u) ** 3
    const r = (60 - 46 * e) * scale
    const gold = smoothstep(0.45, 0.75, u)
    this.cTmp2[0] = this.cInk[0]! + (this.cGold[0]! - this.cInk[0]!) * gold
    this.cTmp2[1] = this.cInk[1]! + (this.cGold[1]! - this.cInk[1]!) * gold
    this.cTmp2[2] = this.cInk[2]! + (this.cGold[2]! - this.cInk[2]!) * gold
    this.cTmp2[3] = 1
    const s = this.spec
    s.x = cx
    s.y = cy
    s.z = cz
    s.offX = s.offY = 0
    s.size = r / 0.85
    s.minPx = 0
    s.rot = 0
    s.shape = SHAPE.ring
    this.setFill(this.cTmp2, 0)
    this.setLine(this.cTmp2, 1 - smoothstep(0.8, 1, u))
    s.lineW = 0
    s.inkBoost = 1.3
    s.p0 = s.p1 = s.p2 = 0
    s.dissolve = 0
    this.icons.push(s)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + Math.PI / 6
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const r0 = (20 + 40 * e) * scale
      const r1 = r0 + 16 * scale * (1 - u)
      {
        const V = this.strokes.v
        V[0] = cx + (_right.x * ca + _up.x * sa) * r0
        V[1] = cy + (_right.y * ca + _up.y * sa) * r0
        V[2] = cz + (_right.z * ca + _up.z * sa) * r0
        V[3] = cx + (_right.x * ca + _up.x * sa) * r1
        V[4] = cy + (_right.y * ca + _up.y * sa) * r1
        V[5] = cz + (_right.z * ca + _up.z * sa) * r1
        V[6] = 2
        V[7] = 1.5
        V[8] = 1 - smoothstep(0.7, 1, u)
        this.strokes.commit(this.cTmp2)
      }
    }
  }

  /** Coup de pinceau de gros vol : 3-4 traits d'encre courbes le long de la trajectoire de l'ombre (0,6 s). */
  private drawBrush(b: Burst, u: number): void {
    const n = b.pathN
    if (n < 2) return
    const P = b.path
    const head = smoothstep(0, 0.22, u)
    const tailF = smoothstep(0.3, 1, u)
    const strokes = 3 + (b.seed > 0.5 ? 1 : 0)
    const R = this.ribbons
    for (let k = 0; k < strokes; k++) {
      const off = (k - (strokes - 1) / 2) * 0.42 * b.r
      const wob = hash01(Math.floor(b.seed * 1e5) + k) * TAU
      R.beginStrip()
      const i0 = Math.floor(tailF * (n - 1))
      const i1 = Math.max(i0 + 1, Math.ceil(head * (n - 1)))
      for (let i = i0; i <= Math.min(i1, n - 1); i++) {
        const o = i * 4
        const oN = Math.min(n - 1, i + 1) * 4
        const oP = Math.max(0, i - 1) * 4
        let tx = P[oN]! - P[oP]!
        let tz = P[oN + 2]! - P[oP + 2]!
        const tl = Math.sqrt(tx * tx + tz * tz) || 1
        tx /= tl
        tz /= tl
        const w = off + Math.sin(i * 0.7 + wob) * 0.25 * b.r * 0.3
        const x = P[o]! - tz * w
        const z = P[o + 2]! + tx * w
        const v = (i - i0) / Math.max(1, i1 - i0)
        const taper = Math.sin(Math.PI * clamp(v, 0.05, 0.95))
        {
          const V = R.v
          V[0] = x
          V[1] = GROUND_Y
          V[2] = z
          V[3] = tx
          V[4] = 0
          V[5] = tz
          V[6] = 0
          V[7] = 2.6 * taper + 0.3
          V[8] = 0
          V[9] = 0.7
          R.commit(this.cInk)
        }
      }
      R.endStrip()
    }
  }

  /** Battement d'air du COUP D'AILE : traits de mouvement sous les ailes (0,3 s). */
  private drawFlapAir(view: GameView, b: Burst, u: number): void {
    if (!view.sim?.bySlot[b.slot]) return
    const c = this.anchor(view, b.slot, 'chest', _b)
    const bird = view.sim.bySlot[b.slot]!
    const hx = Math.cos(bird.heading)
    const hz = -Math.sin(bird.heading)
    const scale = this.scaleOf(b.slot)
    // Traits de souffle derrière le bord de fuite, qui reculent et s'effilent.
    for (const name of TIPS) {
      const tip = this.anchor(view, b.slot, name, _a)
      for (let k = 0; k < 3; k++) {
        const f = 0.4 + k * 0.22
        const back = (1.6 + 4 * u) * scale
        const x = c.x + (tip.x - c.x) * f - hx * back
        const y = c.y + (tip.y - c.y) * f - 0.3 * scale
        const z = c.z + (tip.z - c.z) * f - hz * back
        const L = (2.2 + k * 0.7) * scale * (1 - u * 0.5)
        {
          const V = this.strokes.v
          V[0] = x
          V[1] = y
          V[2] = z
          V[3] = x - hx * L
          V[4] = y - 0.2 * scale
          V[5] = z - hz * L
          V[6] = 2.2
          V[7] = 0.6
          V[8] = 0.7 * (1 - u * u)
          this.strokes.commit(this.cInk)
        }
      }
    }
  }

  /** « Clac » : petits traits de claquement autour du chasseur (0,2 s). */
  private drawClap(view: GameView, b: Burst, u: number): void {
    if (!view.sim?.bySlot[b.slot]) return
    const c = this.anchor(view, b.slot, 'chest', _b)
    const scale = this.scaleOf(b.slot)
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + 0.3
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const r0 = (3 + 3 * u) * scale
      const r1 = r0 + 1.6 * scale * (1 - u)
      {
        const V = this.strokes.v
        V[0] = c.x + (_right.x * ca + _up.x * sa) * r0
        V[1] = c.y + (_right.y * ca + _up.y * sa) * r0
        V[2] = c.z + (_right.z * ca + _up.z * sa) * r0
        V[3] = c.x + (_right.x * ca + _up.x * sa) * r1
        V[4] = c.y + (_right.y * ca + _up.y * sa) * r1
        V[5] = c.z + (_right.z * ca + _up.z * sa) * r1
        V[6] = 2.2
        V[7] = 1.2
        V[8] = 0.9
        this.strokes.commit(this.cInk)
      }
    }
  }

  /** « tsk » : 3 à 5 tirets d'encre qui jaillissent au sol (0,2 s). */
  private drawTsk(b: Burst, u: number): void {
    const n = 3 + Math.floor(b.seed * 3)
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + b.seed * 5 + hash01(i + Math.floor(b.seed * 1e4)) * 0.8
      const ca = Math.cos(a)
      const sa = Math.sin(a)
      const r0 = 0.6 + 3.2 * u
      const r1 = r0 + 1.3 * (1 - u * 0.5)
      {
        const V = this.strokes.v
        V[0] = b.x + ca * r0
        V[1] = b.y
        V[2] = b.z + sa * r0
        V[3] = b.x + ca * r1
        V[4] = b.y
        V[5] = b.z + sa * r1
        V[6] = 2
        V[7] = 2
        V[8] = 1 - smoothstep(0.7, 1, u)
        this.strokes.commit(this.cInk)
      }
    }
  }

  /**
   * Esquive (polish B7) : double arc de souffle autour de l'esquiveur, ouvert vers le
   * point où le chasseur a planté, qui s'élargit et s'amincit en 0,4 s. Rayon calé sur
   * l'envergure affichée, entre 26 px (lisible à 50 px d'envergure) et 90 px (gros plans),
   * trait de 5,5 → 3 px ; testé en profondeur (l'oiseau passe devant en gros plan).
   */
  private drawDodge(view: GameView, b: Burst, u: number): void {
    if (!view.sim?.bySlot[b.slot]) return
    const c = this.anchor(view, b.slot, 'chest', _a)
    const ppm = this.pxPerM(c)
    // Direction écran vers le point du raté (repère caméra).
    const dx = b.x - c.x
    const dy = b.y - c.y
    const dz = b.z - c.z
    const sx = dx * _right.x + dy * _right.y + dz * _right.z
    const sy = dx * _up.x + dy * _up.y + dz * _up.z
    const ang = sx * sx + sy * sy > 1e-6 ? Math.atan2(sy, sx) : Math.PI / 2
    const e = 1 - (1 - u) ** 2
    const half = (RULES.wingspan * this.scaleOf(b.slot) * ppm) / 2
    const r = clamp(half * 1.1, 26, 90) * (0.8 + 0.45 * e)
    const s = this.spec
    s.x = c.x
    s.y = c.y
    s.z = c.z
    s.offX = s.offY = 0
    s.size = 0
    s.minPx = r
    s.rot = ang
    s.shape = SHAPE.arc
    this.setFill(this.cInk, 0)
    this.setLine(this.cInk, 1)
    s.lineW = 0
    s.inkBoost = 0.4
    s.p0 = 1.25 - 0.35 * e
    s.p1 = (5.5 - 2.5 * e) / 2 / r
    s.p2 = b.seed
    s.dissolve = smoothstep(0.6, 1, u)
    this.sprites.push(s)
  }

  /**
   * Libère les ressources GPU (three.js les recrée si le système resservait :
   * robuste au double montage des effets React). La racine reste attachée.
   */
  dispose(): void {
    this.sprites.dispose()
    this.icons.dispose()
    this.strokes.dispose()
    this.ribbons.dispose()
  }
}
