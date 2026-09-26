// Rig de cadrage dynamique (GDD §13.1) : manche, salon, cartes des règles.
// Cible au sol + largeur cadrée suivies par des ressorts critiques (position ω 1,8, zoom ω 1,2),
// zone morte de 4 m, lacet fixe (nord en haut), tangage selon l'avancée du soleil.
// Dramatisation de la manche : zoom vers un piqué engagé, tremblement de touche,
// Grande Ombre (front inclus, décalage vers l'est), travelling d'ouverture du compte à rebours.
import { RULES } from '../../sim/rules.ts'
import type { SimState } from '../../sim/types.ts'
import { gameView, type GameView } from '../view.ts'
import { fitPoints, makeRig, type FitResult, type Rig, type ScreenRect } from './framing.ts'
import { clamp, DEG, lerp, smoother, Spring } from './math.ts'

export type FramingKind = 'round' | 'lobby' | 'rules'

/** Rectangles d'écran à respecter (fractions). */
export const ROUND_RECT: ScreenRect = { x0: RULES.camMarginX, x1: 1 - RULES.camMarginX, y0: RULES.camMarginY, y1: 1 - RULES.camMarginY }
/** Salon : centre haut, entre le panneau QR/règles (gauche), les oiseaux (droite) et la partie (bas). */
export const LOBBY_RECT: ScreenRect = { x0: 0.3, x1: 0.69, y0: 0.13, y1: 0.63 }

const FOV = 40
/** Tangage du salon et des règles (vue 3/4, pas de ciel). */
const LOBBY_PITCH = 50 * DEG
const RULES_PITCH = 54 * DEG
/** Largeur minimale cadrée au salon, dans le rectangle libre (m). */
const LOBBY_MIN_RECT_WIDTH = 72
/** Décalage vers l'est pendant la Grande Ombre (fraction de la largeur cadrée). */
const GREAT_SHADOW_EAST = 0.06
/** Enveloppe du zoom de piqué : montée, tenue, retour (s réelles). */
const DIVE_IN = RULES.camDiveZoomSeconds * 0.6
const DIVE_OUT = 0.9
/** Part du chemin vers la paire (chasseur, cible) pendant le zoom de piqué. */
const DIVE_PULL = 0.14
/** Tremblement : durée, et amplitude = camShakeAmp par tranche de SHAKE_PER m cadrés (≈ 11 px en 1080p). */
const SHAKE_SECONDS = 0.42
const SHAKE_PER = 26
/** Travelling d'ouverture (compte à rebours) : recul et tangage supplémentaires au départ. */
const OPEN_BACK = 0.32
const OPEN_PITCH = 10 * DEG

const MAX_PTS = 64
/** Les centres d'ombre sont ramenés dans l'arène (rayon elliptique ≤ 1,04) avant cadrage. */
const SHADOW_RHO_MAX = 1.04
/** Anticipation du cadrage de jeu (s) : les points sont aussi pris à leur position future. */
const LEAD = 0.7
/** Le dézoom répond plus vite que le zoom (ω × 1,6) : un oiseau qui s'échappe reste dans le cadre. */
const ZOOM_OUT_BOOST = 1.6
const ARENA_PTS = 20

export class FramingRig {
  readonly rig: Rig = makeRig()
  private readonly sx = new Spring()
  private readonly sy = new Spring()
  private readonly sw = new Spring() // log(largeur)
  private goalX = 0
  private goalY = 0
  private goalW = 200
  private readonly pts = new Float64Array(MAX_PTS * 3)
  private readonly fit: FitResult = { tx: 0, ty: 0, dist: 0, width: 0 }
  private diveT = -1
  private diveHunter = -1
  private diveTarget = -1
  private diveHold = 0
  private shakeT = -1
  private shakePhase = 0
  /** Décalage de tremblement à appliquer (m, dans le plan de l'écran : droite, haut). */
  readonly shake = { x: 0, y: 0 }
  private drift = 0
  kind: FramingKind = 'round'

  reset(kind: FramingKind): void {
    this.kind = kind
    this.diveT = -1
    this.shakeT = -1
    this.shake.x = this.shake.y = 0
    this.drift = 0
  }

  /** Piqué engagé (clac) : zoom vers la paire si les deux sont dans le champ (vérifié par l'appelant). */
  onDiveCommit(hunter: number, target: number): void {
    this.diveT = 0
    this.diveHunter = hunter
    this.diveTarget = target
    this.diveHold = RULES.camDiveZoomSeconds * 0.4
  }

  /** Fin du piqué (touche, raté, annulation) : le zoom retombe. */
  onDiveEnd(hunter: number, hit: boolean): void {
    // après une touche, on reste serré pendant le ralenti ; sinon on relâche aussitôt
    if (hunter === this.diveHunter && this.diveT >= 0) this.diveHold = Math.max(0, Math.min(hit ? 9 : this.diveHold, this.diveT - DIVE_IN + (hit ? 0.35 : 0.1)))
  }

  onHit(): void {
    this.shakeT = 0
    this.shakePhase = Math.random() * 100
  }

  /** Cadre désiré (cible, largeur) pour l'état courant. Renvoie la largeur. */
  private desired(sim: SimState, view: GameView, aspect: number): void {
    const n = this.collect(sim, view)
    const a = sim.arena.a
    const kind = this.kind
    const rect = kind === 'lobby' ? LOBBY_RECT : ROUND_RECT
    const pitch = this.pitchFor(sim)
    const rectW = rect.x1 - rect.x0
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    let minW = kind === 'lobby' ? LOBBY_MIN_RECT_WIDTH / rectW : RULES.camMinWidth
    let maxW = kind === 'lobby' ? (2 * a * 1.15) / rectW : 2 * a * RULES.camMaxWidthFactor
    if (kind === 'rules') minW = maxW = 2 * a * 0.95
    if (maxW < minW) maxW = minW
    fitPoints(this.pts, n, 0, pitch, FOV, aspect, rect, minW / (2 * tanH), 1e5, this.fit)
    if (this.fit.width > maxW && kind === 'round') {
      // les oiseaux débordent le dézoom maximal : on cadre l'arène entière (elle les contient tous)
      this.arenaPoints(sim)
      fitPoints(this.pts, ARENA_PTS, 0, pitch, FOV, aspect, rect, minW / (2 * tanH), 1e5, this.fit)
    }
    let tx = this.fit.tx
    let ty = this.fit.ty
    const w = this.fit.width
    if (kind === 'round' && sim.sun.phase === 'greatShadow') {
      // décalage vers l'est, sans pousser le cadre au-delà du bord est de l'arène
      const maxTx = Math.max(tx, a * 1.06 - w / 2)
      tx = Math.min(tx + GREAT_SHADOW_EAST * w, maxTx)
    }
    if (kind === 'rules') {
      // dérive lente et régulière d'ouest en est, puis retour (jamais hors de l'arène)
      tx = Math.sin(this.drift * 0.045) * a * 0.18
      ty = -sim.arena.b * 0.12
    }
    // zone morte (4 m) sur la cible et la largeur
    const dz = RULES.camDeadzone
    const dx = tx - this.goalX
    const dy = ty - this.goalY
    const d = Math.hypot(dx, dy)
    if (d > dz) {
      const k = 1 - dz / d
      this.goalX += dx * k
      this.goalY += dy * k
    }
    const dw = w - this.goalW
    if (Math.abs(dw) > dz) this.goalW += dw - Math.sign(dw) * dz
  }

  /** L'ellipse de l'arène (dézoom maximal : l'arène entière à l'écran). */
  private arenaPoints(sim: SimState): void {
    const P = this.pts
    for (let i = 0; i < ARENA_PTS; i++) {
      const th = (i / ARENA_PTS) * Math.PI * 2
      P[i * 3] = Math.cos(th) * sim.arena.a
      P[i * 3 + 1] = Math.sin(th) * sim.arena.b
      P[i * 3 + 2] = 0
    }
  }

  /** Points à cadrer : ombres (poids 1) et oiseaux (poids 0,7, tirés vers leur ombre). */
  private collect(sim: SimState, view: GameView): number {
    const P = this.pts
    let n = 0
    const push = (x: number, y: number, z: number) => {
      if (n >= MAX_PTS) return
      P[n * 3] = x
      P[n * 3 + 1] = y
      P[n * 3 + 2] = z
      n++
    }
    const alpha = view.alpha
    const wb = RULES.camBirdWeight / RULES.camShadowWeight
    for (const b of sim.birds) {
      const p = view.prevBirds[b.slot] ?? b
      const x = p.x + (b.x - p.x) * alpha
      const y = p.y + (b.y - p.y) * alpha
      const z = p.z + (b.z - p.z) * alpha
      let scx = p.shadow.cx + (b.shadow.cx - p.shadow.cx) * alpha
      let scy = p.shadow.cy + (b.shadow.cy - p.shadow.cy) * alpha
      // une ombre hors de l'arène ne peint pas (grisée sur le Simoun) : inutile de cadrer au-delà du bord
      const rho = Math.hypot(scx / sim.arena.a, scy / sim.arena.b)
      if (rho > SHADOW_RHO_MAX) {
        scx *= SHADOW_RHO_MAX / rho
        scy *= SHADOW_RHO_MAX / rho
      }
      push(scx, scy, 0)
      push(scx + (x - scx) * wb, scy + (y - scy) * wb, z * wb)
      // anticipation : où seront l'oiseau et son ombre dans LEAD s (les ressorts ne traînent plus)
      if (this.kind === 'round') {
        const lx = b.vx * LEAD
        const ly = b.vy * LEAD
        push(scx + lx, scy + ly, 0)
        push(scx + (x - scx) * wb + lx, scy + (y - scy) * wb + ly, z * wb)
      }
    }
    if (this.kind === 'round' && sim.sun.phase === 'greatShadow' && sim.night.active) {
      // le front de nuit à la hauteur de chaque oiseau (la « lèvre dorée » entre dans le cadre)
      const nt = sim.night
      const px = -nt.dirY
      const py = nt.dirX
      const s = Math.max(nt.s, -sim.arena.a * 1.05)
      for (const b of sim.birds) {
        const q = b.x * px + b.y * py
        push(nt.dirX * s + px * q, nt.dirY * s + py * q, 0)
      }
    }
    if (n === 0 || this.kind !== 'round') {
      // salon vide, règles : le centre de l'arène et ses tours
      const a = sim.arena.a
      const b = sim.arena.b
      const k = this.kind === 'lobby' ? 0.55 : 0.8
      push(-a * k, 0, 0)
      push(a * k, 0, 0)
      push(0, -b * k, 0)
      push(0, b * k, 0)
      if (this.kind === 'lobby') for (const t of sim.towers) if (!t.outside) push(t.x, t.y, t.height * 0.5)
    }
    return n
  }

  private pitchFor(sim: SimState): number {
    if (this.kind === 'lobby') return LOBBY_PITCH
    if (this.kind === 'rules') return RULES_PITCH
    const u = clamp(sim.sun.u, 0, 1)
    return lerp(RULES.camPitchStartDeg, RULES.camPitchEndDeg, u) * DEG
  }

  /** Saute directement au cadre désiré (coupe). */
  snap(sim: SimState, view: GameView, aspect: number): Rig {
    this.goalW = 0
    this.desired(sim, view, aspect)
    this.goalX = this.fit.tx
    this.goalY = this.fit.ty
    this.goalW = this.fit.width
    this.desired(sim, view, aspect)
    this.sx.snap(this.goalX)
    this.sy.snap(this.goalY)
    this.sw.snap(Math.log(this.goalW))
    return this.build(sim, aspect, 0)
  }

  update(dt: number, sim: SimState, view: GameView, aspect: number): Rig {
    this.drift += dt
    // compte à rebours : les oiseaux bouclent sur place (ils se resserrent puis reviennent) ;
    // le cadre reste celui de l'anneau de départ, seul le travelling d'ouverture bouge
    if (!(this.kind === 'round' && sim.sun.t < 0)) this.desired(sim, view, aspect)
    this.sx.step(this.goalX, RULES.camPosOmega, dt)
    this.sy.step(this.goalY, RULES.camPosOmega, dt)
    // dézoomer plus vite que zoomer : on ne perd jamais un oiseau au bord du cadre
    const lw = Math.log(this.goalW)
    this.sw.step(lw, lw > this.sw.x ? RULES.camZoomOmega * ZOOM_OUT_BOOST : RULES.camZoomOmega, dt)
    return this.build(sim, aspect, dt)
  }

  private build(sim: SimState, aspect: number, dt: number): Rig {
    const r = this.rig
    let tx = this.sx.x
    let ty = this.sy.x
    let w = Math.exp(this.sw.x)
    let pitch = this.pitchFor(sim)
    if (this.kind === 'round') {
      // travelling d'ouverture pendant « 3, 2, 1 » : léger recul + plongée, qui se referment à l'Envol
      if (sim.sun.t < 0) {
        const k = smoother(-sim.sun.t / RULES.countdownSeconds)
        w *= 1 + OPEN_BACK * k
        pitch += OPEN_PITCH * k
        ty -= w * 0.04 * k
      }
      // zoom de piqué (+8 %) vers la paire
      if (this.diveT >= 0) {
        this.diveT += dt
        const t = this.diveT
        const inK = smoother(t / DIVE_IN)
        const outK = t > DIVE_IN + this.diveHold ? smoother((t - DIVE_IN - this.diveHold) / DIVE_OUT) : 0
        const e = inK * (1 - outK)
        if (outK >= 1) this.diveT = -1
        const h = sim.bySlot[this.diveHunter]
        const g = sim.bySlot[this.diveTarget]
        if (h && g && e > 0) {
          const mx = (h.x + g.x) / 2
          const my = (h.y + g.y) / 2
          tx += (mx - tx) * DIVE_PULL * e
          ty += (my - ty) * DIVE_PULL * e
          w *= 1 - RULES.camDiveZoom * e
        }
      }
      // tremblement de touche (désactivable : réglage « tremblement »)
      this.shake.x = this.shake.y = 0
      if (this.shakeT >= 0) {
        this.shakeT += dt
        const k = 1 - this.shakeT / SHAKE_SECONDS
        if (k <= 0) this.shakeT = -1
        else {
          const amp = RULES.camShakeAmp * (w / SHAKE_PER) * k * k
          const t = this.shakeT * 1 + this.shakePhase
          this.shake.x = amp * (Math.sin(t * 61.3) * 0.65 + Math.sin(t * 37.9 + 1.3) * 0.35)
          this.shake.y = amp * (Math.sin(t * 53.7 + 2.1) * 0.6 + Math.sin(t * 29.1 + 0.4) * 0.4)
        }
      }
    } else if (this.kind === 'rules') {
      w *= 1 + 0.04 * Math.sin(this.drift * 0.07)
    }
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    r.tx = tx
    r.ty = ty
    r.tz = 0
    r.yaw = 0
    r.pitch = pitch
    r.dist = w / (2 * tanH)
    r.fov = FOV
    return r
  }

  /** Largeur cadrée courante (m). */
  get width(): number {
    return Math.exp(this.sw.x)
  }
}

/** Point interpolé d'un oiseau (repère sim) — commodité pour les autres plans. */
export function birdAt(slot: number, out: { x: number; y: number; z: number }, view: GameView = gameView): boolean {
  const s = view.sim
  const b = s?.bySlot[slot]
  if (!b) return false
  const p = view.prevBirds[slot] ?? b
  const a = view.alpha
  out.x = p.x + (b.x - p.x) * a
  out.y = p.y + (b.y - p.y) * a
  out.z = p.z + (b.z - p.z) * a
  return true
}
