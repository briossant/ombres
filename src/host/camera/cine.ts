// Plans de cinéma (écran titre, crédits, chargement) sur la démo des bots : plans bas,
// contre-plongées, travellings qui suivent un oiseau puis révèlent l'arène, silhouettes
// sur le couchant, vue large qui tourne. Rythme calme ; chaque plan a son propre mouvement.
// ART_BIBLE §1.2 (planches), §6.1-6.3 : horizon dans le tiers bas ou haut, jamais au centre,
// FOV 35-45°, beaucoup de vide. Les zones de l'écran occupées par l'UI (logo, menu, panneau
// des crédits) sont décrites par un CineLayout : les sujets sont posés ailleurs.
import * as THREE from 'three'
import { towerRadiusAt } from '../../sim/maps.ts'
import type { BirdState, SimState } from '../../sim/types.ts'
import type { GameView } from '../view.ts'
import { fitPoints, makeRig, type FitResult, type Rig, type ScreenRect } from './framing.ts'
import { blendPose, clamp01, DEG, makePose, placeForSubject, smoother, Spring, wrapAngle, yawOfDir, yawPitchQuat, type Pose } from './math.ts'

export type ShotKind = 'crane' | 'track' | 'group' | 'sunset' | 'orbit' | 'still'

/** Où poser les sujets à l'écran selon l'UI par-dessus (fractions d'écran, origine en haut à gauche). */
export interface CineLayout {
  /** Oiseau haut suivi en contre-plongée (sur le ciel). */
  trackHigh: { x: number; y: number }
  /** Oiseau bas suivi en plongée (sur le sable peint). */
  trackLow: { x: number; y: number }
  /** Arène entière (plans larges). */
  wideRect: ScreenRect
  /** Groupe d'oiseaux (plan bas de groupe). */
  groupRect: ScreenRect
  /** Couchant : abscisse du soleil, point du sujet en silhouette. */
  sunX: number
  sunSubject: { x: number; y: number }
}

/** Titre : logo en haut à gauche (jusqu'à x 0,57, y 0,45), menu en bas à droite (x > 0,72, y 0,58-0,85). */
export const TITLE_LAYOUT: CineLayout = {
  trackHigh: { x: 0.75, y: 0.33 },
  trackLow: { x: 0.33, y: 0.66 },
  wideRect: { x0: 0.05, x1: 0.69, y0: 0.5, y1: 0.95 },
  groupRect: { x0: 0.12, x1: 0.66, y0: 0.54, y1: 0.92 },
  sunX: 0.78,
  sunSubject: { x: 0.64, y: 0.43 },
}
/** Crédits : panneau central (x 0,23-0,77) ; la scène vit sur les bords. */
export const CREDITS_LAYOUT: CineLayout = {
  trackHigh: { x: 0.87, y: 0.36 },
  trackLow: { x: 0.13, y: 0.68 },
  wideRect: { x0: 0.02, x1: 0.98, y0: 0.4, y1: 0.97 },
  groupRect: { x0: 0.04, x1: 0.96, y0: 0.45, y1: 0.95 },
  sunX: 0.12,
  sunSubject: { x: 0.87, y: 0.44 },
}

/** Rig → pose (repère three). */
export function rigPose(r: Rig, out: Pose): Pose {
  yawPitchQuat(out.quat, r.yaw, r.pitch)
  const cp = Math.cos(r.pitch)
  // position = cible − avant × distance
  out.pos.set(r.tx + Math.sin(r.yaw) * cp * r.dist, r.tz + Math.sin(r.pitch) * r.dist, -r.ty + Math.cos(r.yaw) * cp * r.dist)
  out.fov = r.fov
  return out
}

/** PRNG déterministe (mulberry32). */
export function rng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const _v = new THREE.Vector3()

interface Interp {
  x: number
  y: number
  z: number
  heading: number
  vx: number
  vy: number
  vz: number
}

function interpBird(view: GameView, b: BirdState, out: Interp): Interp {
  const p = view.prevBirds[b.slot] ?? b
  const a = view.alpha
  out.x = p.x + (b.x - p.x) * a
  out.y = p.y + (b.y - p.y) * a
  out.z = p.z + (b.z - p.z) * a
  out.heading = p.heading + wrapAngle(b.heading - p.heading) * a
  out.vx = b.vx
  out.vy = b.vy
  out.vz = b.vz
  return out
}

/** Une tour coupe-t-elle la ligne de visée caméra (three) → point (three) ? */
export function towerOccludes(sim: SimState, cam: THREE.Vector3, p: THREE.Vector3): boolean {
  const dx = p.x - cam.x
  const dz = p.z - cam.z
  const len2 = dx * dx + dz * dz
  if (len2 < 1) return false
  for (const t of sim.towers) {
    const tx = t.x
    const tz = -t.y
    const k = clamp01(((tx - cam.x) * dx + (tz - cam.z) * dz) / len2)
    if (k <= 0.02 || k >= 0.98) continue
    const y = cam.y + (p.y - cam.y) * k
    if (y > t.height) continue
    const cx = cam.x + dx * k - tx
    const cz = cam.z + dz * k - tz
    const r = towerRadiusAt(t.segments, Math.max(0, y)) + 1.5
    if (cx * cx + cz * cz < r * r) return true
  }
  return false
}

const _rmax = new WeakMap<object, { r: number; ox: number; oy: number }>()
/** Rayon maximal d'une tour (disques compris) et décalage de son centre (gnomon incliné), en cache. */
function towerRMax(t: SimState['towers'][number]): { r: number; ox: number; oy: number } {
  let m = _rmax.get(t)
  if (!m) {
    m = { r: 0, ox: 0, oy: 0 }
    for (const g of t.segments) {
      const r = Math.max(g.r0, g.r1)
      if (r > m.r) {
        m.r = r
        m.ox = g.ox1 ?? 0
        m.oy = g.oy1 ?? 0
      }
    }
    _rmax.set(t, m)
  }
  return m
}

/**
 * Encombrement du premier plan : part de la largeur de l'écran masquée par les tours proches
 * de la caméra (three) et dans son champ horizontal (lacet, demi-angle). 0 = rien ;
 * 0,3 = une tour barre près d'un tiers de l'image.
 */
export function towerClutter(sim: SimState, cam: THREE.Vector3, yaw: number, halfFov: number): number {
  let p = 0
  for (const t of sim.towers) {
    const m = towerRMax(t)
    const dx = t.x + m.ox - cam.x
    const dy = -(t.y + m.oy) - cam.z
    const d = Math.max(1, Math.hypot(dx, dy))
    if (d > 160 || t.height < cam.y * 0.4) continue
    // sous un disque (caméra à l'intérieur de son rayon) : il couvre tout
    const half = d < m.r ? Math.PI : Math.atan(Math.min(1, m.r / d) * 1.2)
    // lacet vers la tour (three : 0 = −z)
    const ang = Math.atan2(-dx, -dy)
    const off = Math.abs(wrapAngle(ang - yaw))
    if (off - half > halfFov) continue
    // part visible de la largeur angulaire de la tour
    const lo = Math.max(-halfFov, off - half)
    const hi = Math.min(halfFov, off + half)
    p += Math.max(0, hi - lo) / (2 * halfFov)
  }
  return p
}

/** Oiseau suivant (ordre des slots, en boucle). */
function nextSlot(sim: SimState, slot: number): number {
  const birds = sim.birds
  if (!birds.length) return -1
  const i = birds.findIndex(b => b.slot === slot)
  return birds[(i + 1) % birds.length]!.slot
}

const MAX_PTS = 48
/** Au-delà, une tour barre trop l'image (part de la largeur) : on change de côté, de lacet ou de sujet. */
const CLUTTER_MAX = 0.3

/**
 * Un plan : état propre (sujet lissé, temps), pose calculée à chaque frame.
 */
export class CineShot {
  kind: ShotKind = 'still'
  t = 0
  dur = 8
  private subject = -1
  private rand: () => number = rng(1)
  private readonly sx = new Spring()
  private readonly sy = new Spring()
  private readonly sz = new Spring()
  private readonly sh = new Spring()
  private readonly side = new Spring()
  private readonly rx = new Spring()
  private readonly ry = new Spring()
  private readonly rd = new Spring()
  private readonly rig: Rig = makeRig()
  private readonly close = makePose()
  private readonly far = makePose()
  /** Dernière pose calculée (plan de groupe) et dérive de lacet d'évitement des tours. */
  private readonly pose0 = makePose()
  private yawDrift = 0
  private cluttered = 0
  private flips = 0
  /** Coupes franches internes au plan (le réalisateur les compte comme des coupes). */
  recuts = 0
  private readonly fit: FitResult = { tx: 0, ty: 0, dist: 0, width: 0 }
  private readonly pts = new Float64Array(MAX_PTS * 3)
  private sideSign = 1
  private yaw0 = 0
  /** 1 = oiseau haut (contre-plongée sur le ciel), 0 = bas (plongée sur le sable) ; lissé. */
  private readonly highK = new Spring()
  private highT = 1
  private occluded = 0
  private fresh = true
  /**
   * Première image d'un suivi : essais de côté / de sujet avant d'afficher quoi que ce soit (ajout
   * qa) ; −1 = vérifié. Sans cela, le plan d'ouverture du titre montrait ~0,5 s un fût de tour en
   * plein cadre, le temps que le ressort de côté passe de l'autre côté.
   */
  private freshCheck = 0
  private readonly tmp: Interp = { x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0 }
  layout: CineLayout = TITLE_LAYOUT

  start(kind: ShotKind, dur: number, seed: number, layout: CineLayout): void {
    this.kind = kind
    this.dur = dur
    this.t = 0
    this.rand = rng(seed * 7919 + 13)
    this.subject = -1
    this.fresh = true
    this.freshCheck = 0
    this.occluded = 0
    this.yaw0 = 0
    this.yawDrift = 0
    this.cluttered = 0
    this.flips = 0
    this.layout = layout
    this.sideSign = this.rand() < 0.5 ? -1 : 1
  }

  /** Choix du sujet : un oiseau en vol, loin du bord et des tours ; haut ou bas selon le plan. */
  private pickSubject(sim: SimState, wantHigh: number): number {
    let best = -1
    let bestScore = -Infinity
    const a = sim.arena.a
    const b = sim.arena.b
    for (const bird of sim.birds) {
      const rho = Math.hypot(bird.x / a, bird.y / b)
      let s = -rho * 2 + wantHigh * (bird.z / 18) + this.rand() * 0.6
      if (bird.stun > 0 || bird.dive !== 'none') s -= 1
      for (const t of sim.towers) {
        const d = Math.hypot(t.x - bird.x, t.y - bird.y)
        if (d < 30) s -= (30 - d) / 30
      }
      if (s > bestScore) {
        bestScore = s
        best = bird.slot
      }
    }
    return best
  }

  update(dt: number, sim: SimState | null, view: GameView, aspect: number, out: Pose): Pose {
    this.t += dt
    if (!sim || this.kind === 'still') return this.still(out, sim)
    switch (this.kind) {
      case 'track':
        return this.track(dt, sim, view, aspect, out, 0)
      case 'crane':
        return this.crane(dt, sim, view, aspect, out)
      case 'group':
        return this.group(dt, sim, view, aspect, out)
      case 'sunset':
        return this.sunset(dt, sim, view, aspect, out)
      case 'orbit':
        return this.orbit(sim, aspect, out, this.layout.wideRect)
    }
  }

  /** Plan fixe élégant (chargement) : horizon au tiers bas, vers le couchant. */
  private still(out: Pose, sim: SimState | null): Pose {
    const a = sim?.arena.a ?? 165
    const drift = this.t * 0.4
    out.pos.set(a * 0.6 - drift, 9, 40)
    yawPitchQuat(out.quat, 72 * DEG, -6 * DEG)
    out.fov = 40
    return out
  }

  /**
   * Travelling qui suit un oiseau. Oiseau haut : contre-plongée, il se découpe sur le ciel
   * (horizon au tiers bas). Oiseau bas : plongée, sa traînée peinte court sur le sable
   * (horizon au tiers haut). La visée évite les tours (changement de côté en douceur).
   * `mode` : 0 = selon l'altitude au départ, 1 = plongée imposée (départ de la grue).
   */
  private track(dt: number, sim: SimState, view: GameView, aspect: number, out: Pose, mode: 0 | 1): Pose {
    if (this.subject < 0 || !sim.bySlot[this.subject]) {
      this.subject = this.pickSubject(sim, mode === 1 ? 0 : 1)
      this.fresh = true
      this.freshCheck = 0
    }
    const b = sim.bySlot[this.subject]
    if (!b) return this.orbit(sim, aspect, out, this.layout.wideRect)
    const i = interpBird(view, b, this.tmp)
    if (this.fresh) {
      this.sx.snap(i.x)
      this.sy.snap(i.y)
      this.sz.snap(i.z)
      this.sh.snap(i.heading)
      this.side.snap(this.sideSign)
      this.highT = mode === 0 && i.z > 10 ? 1 : 0
      this.highK.snap(this.highT)
      this.fresh = false
    }
    // avance de 2v/ω : un ressort critique qui suit une rampe traîne de 2v/ω, on l'annule
    const x = this.sx.step(i.x + i.vx * 0.5, 4, dt)
    const y = this.sy.step(i.y + i.vy * 0.5, 4, dt)
    const z = this.sz.step(i.z + i.vz * (2 / 3), 3, dt)
    const h = this.sh.stepAngle(i.heading, 0.8, dt)
    const side = this.side.step(this.sideSign, 1.4, dt)
    // l'oiseau change d'étage : le plan passe du ciel au sable (ou l'inverse) en douceur
    if (mode === 0) {
      if (this.highT > 0.5 && i.z < 8) this.highT = 0
      else if (this.highT < 0.5 && i.z > 13) this.highT = 1
    }
    const hk = this.highK.step(this.highT, 1.3, dt)
    const L = this.layout
    const sx = L.trackLow.x + (L.trackHigh.x - L.trackLow.x) * hk
    const sy = L.trackLow.y + (L.trackHigh.y - L.trackLow.y) * hk
    // on regarde dans le sens du vol, tourné de 30° : l'oiseau file vers le fond, en diagonale
    const lookH = h + side * 30 * DEG
    const yaw = yawOfDir(Math.cos(lookH), Math.sin(lookH))
    yawPitchQuat(out.quat, yaw, (17 - 25 * hk) * DEG)
    out.fov = 38
    _v.set(x, z + 1.2, -y)
    placeForSubject(out.pos, _v, out.quat, out.fov, aspect, sx, sy, 24 + 4 * (1 - hk))
    if (out.pos.y < 3.2) out.pos.y = 3.2
    const blocked = towerOccludes(sim, out.pos, _v) || towerClutter(sim, out.pos, yaw, Math.atan(Math.tan(19 * DEG) * aspect)) > CLUTTER_MAX
    if (this.freshCheck >= 0) {
      // première image : l'autre côté, puis un autre oiseau, avant de montrer un mur (coupe franche)
      const attempt = this.freshCheck
      if (blocked && attempt < 2 * Math.min(4, sim.birds.length)) {
        this.freshCheck = attempt + 1
        this.sideSign = -this.sideSign
        if (attempt % 2 === 1) this.subject = nextSlot(sim, this.subject)
        this.fresh = true
        return this.track(0, sim, view, aspect, out, mode)
      }
      this.freshCheck = -1
    }
    // une tour masque l'oiseau ou barre le premier plan : on passe de l'autre côté (le ressort fait le mouvement)
    if (blocked) {
      this.occluded += dt
      if (this.occluded > 0.2) {
        this.flips++
        if (this.flips >= 3 && mode === 0) {
          // les deux côtés sont encombrés : nouvelle prise sur un autre oiseau
          this.flips = 0
          this.occluded = 0
          this.subject = -1
          this.recuts++
          return this.track(0, sim, view, aspect, out, mode)
        }
        this.sideSign = -this.sideSign
        this.occluded = -1.2
      }
    } else if (this.occluded > 0) this.occluded = 0
    else this.occluded = Math.min(0, this.occluded + dt)
    return out
  }

  /** Part serré sur un oiseau (sur le ciel s'il vole haut), puis s'élève et recule pour révéler l'arène entière. */
  private crane(dt: number, sim: SimState, view: GameView, aspect: number, out: Pose): Pose {
    this.track(dt, sim, view, aspect, this.close, 0)
    if (this.yaw0 === 0) {
      // lacet du plan large : celui du départ, ramené vers le nord (l'arène se lit mieux de biais)
      const f = _v.set(0, 0, -1).applyQuaternion(this.close.quat)
      this.yaw0 = yawOfDir(f.x, -f.z) * 0.5 || 1e-3
    }
    const yaw = this.yaw0 + this.t * 0.8 * DEG * this.sideSign
    this.wideFit(sim, aspect, yaw, 24 * DEG, this.layout.wideRect)
    rigPose(this.rig, this.far)
    const k = smoother((this.t - 1.2) / Math.max(1, this.dur - 1.8))
    return blendPose(out, this.close, this.far, k, 0)
  }

  /** L'arène entière (ellipse) dans un rectangle d'écran, pour un lacet et un tangage donnés. */
  private wideFit(sim: SimState, aspect: number, yaw: number, pitch: number, rect: ScreenRect): Rig {
    const P = this.pts
    const n = 20
    const a = sim.arena.a * 1.04
    const b = sim.arena.b * 1.04
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2
      P[i * 3] = Math.cos(th) * a
      P[i * 3 + 1] = Math.sin(th) * b
      P[i * 3 + 2] = 0
    }
    fitPoints(P, n, yaw, pitch, 40, aspect, rect, 60, 4000, this.fit)
    const r = this.rig
    r.tx = this.fit.tx
    r.ty = this.fit.ty
    r.tz = 0
    r.yaw = yaw
    r.pitch = pitch
    r.dist = this.fit.dist
    r.fov = 40
    return r
  }

  /** Plan bas de groupe : un oiseau et ses voisins proches, leurs ombres et le sable peint, horizon au tiers haut. */
  private group(dt: number, sim: SimState, view: GameView, aspect: number, out: Pose): Pose {
    const pickYaw = this.subject < 0 || !sim.bySlot[this.subject]
    if (pickYaw) this.subject = this.pickSubject(sim, 0)
    const s = sim.bySlot[this.subject]
    if (!s) return this.orbit(sim, aspect, out, this.layout.wideRect)
    const P = this.pts
    let n = 0
    const si = interpBird(view, s, this.tmp)
    const cx = si.x
    const cy = si.y
    const svx = si.vx
    const svy = si.vy
    for (const b of sim.birds) {
      const i = interpBird(view, b, this.tmp)
      if (Math.hypot(i.x - cx, i.y - cy) > 70 || n + 2 > MAX_PTS) continue
      const p = view.prevBirds[b.slot] ?? b
      const scx = p.shadow.cx + (b.shadow.cx - p.shadow.cx) * view.alpha
      const scy = p.shadow.cy + (b.shadow.cy - p.shadow.cy) * view.alpha
      P[n * 3] = i.x
      P[n * 3 + 1] = i.y
      P[n * 3 + 2] = i.z
      n++
      P[n * 3] = scx
      P[n * 3 + 1] = scy
      P[n * 3 + 2] = 0
      n++
    }
    const pitch = 16 * DEG
    if (pickYaw) {
      // lacet choisi pour qu'aucune tour ne barre le premier plan (sur toute la rotation du plan)
      const base = (this.rand() - 0.5) * 70 * DEG
      const halfH = Math.atan(Math.tan(20 * DEG) * aspect)
      let best = Infinity
      for (let k = 0; k < 12; k++) {
        const cand = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 30 * DEG
        let pen = Math.abs(wrapAngle(cand)) * 0.15 // préférence : regarder vers le nord
        for (const dt2 of [0, this.dur * 0.5, this.dur]) {
          const y2 = cand + dt2 * 1.5 * DEG * this.sideSign
          fitPoints(P, n, y2, pitch, 40, aspect, this.layout.groupRect, 70, 600, this.fit)
          this.rig.tx = this.fit.tx
          this.rig.ty = this.fit.ty
          this.rig.tz = 0
          this.rig.yaw = y2
          this.rig.pitch = pitch
          this.rig.dist = this.fit.dist
          rigPose(this.rig, this.far)
          pen += towerClutter(sim, this.far.pos, y2, halfH)
        }
        if (pen < best) {
          best = pen
          this.yaw0 = cand
        }
      }
    }
    let yaw = this.yaw0 + this.t * 1.5 * DEG * this.sideSign
    // en cours de plan, une tour s'approche du premier plan : le lacet s'en écarte doucement
    const halfH = Math.atan(Math.tan(20 * DEG) * aspect)
    if (!pickYaw && towerClutter(sim, this.pose0.pos, yaw, halfH) > CLUTTER_MAX) {
      const probe = (dy: number) => {
        fitPoints(P, n, yaw + dy, pitch, 40, aspect, this.layout.groupRect, 70, 600, this.fit)
        this.rig.tx = this.fit.tx
        this.rig.ty = this.fit.ty
        this.rig.yaw = yaw + dy
        this.rig.pitch = pitch
        this.rig.dist = this.fit.dist
        rigPose(this.rig, this.far)
        return towerClutter(sim, this.far.pos, yaw + dy, halfH)
      }
      this.yawDrift += (probe(0.3) < probe(-0.3) ? 1 : -1) * 14 * DEG * dt
      this.cluttered += dt
      if (this.cluttered > 0.7) {
        // la tour s'impose malgré tout : nouveau groupe (coupe franche)
        this.cluttered = 0
        this.subject = -1
        this.fresh = true
        this.yawDrift = 0
        this.recuts++
        return this.group(0, sim, view, aspect, out)
      }
    } else this.cluttered = Math.max(0, this.cluttered - dt)
    yaw += this.yawDrift
    fitPoints(P, n, yaw, pitch, 40, aspect, this.layout.groupRect, 70, 600, this.fit)
    if (this.fresh) {
      this.rx.snap(this.fit.tx)
      this.ry.snap(this.fit.ty)
      this.rd.snap(Math.log(this.fit.dist))
      this.fresh = false
    }
    const r = this.rig
    // le groupe se déplace avec son oiseau-sujet : même avance que le suivi
    r.tx = this.rx.step(this.fit.tx + svx * (2 / 1.2), 1.2, dt)
    r.ty = this.ry.step(this.fit.ty + svy * (2 / 1.2), 1.2, dt)
    r.tz = 0
    r.yaw = yaw
    r.pitch = pitch
    r.dist = Math.exp(this.rd.step(Math.log(this.fit.dist), 0.8, dt))
    r.fov = 40
    rigPose(r, out)
    this.pose0.pos.copy(out.pos)
    return out
  }

  /** Face au couchant, caméra basse à l'est d'un oiseau : silhouettes devant le soleil bas. */
  private sunset(dt: number, sim: SimState, view: GameView, aspect: number, out: Pose): Pose {
    const L = this.layout
    const az = sim.sun.azimuth
    const tanH = Math.tan(20 * DEG) * aspect
    const halfH = Math.atan(tanH)
    // lacet : le soleil tombe à l'abscisse voulue
    const yaw = yawOfDir(Math.sin(az), Math.cos(az)) + Math.atan((L.sunX * 2 - 1) * tanH)
    yawPitchQuat(out.quat, yaw, -7 * DEG)
    out.fov = 40
    if (this.subject < 0 || !sim.bySlot[this.subject]) {
      // l'oiseau (plutôt haut) dont le contrechamp est le plus dégagé
      let best = -1
      let bestScore = Infinity
      for (const b of sim.birds) {
        const i = interpBird(view, b, this.tmp)
        _v.set(i.x, i.z + 1, -i.y)
        placeForSubject(this.far.pos, _v, out.quat, 40, aspect, L.sunSubject.x, L.sunSubject.y, 40)
        const score = towerClutter(sim, this.far.pos, yaw, halfH) * 10 - i.z / 18 + (b.stun > 0 ? 1 : 0) + this.rand() * 0.2
        if (score < bestScore) {
          bestScore = score
          best = b.slot
        }
      }
      this.subject = best
      this.fresh = true
    }
    const b = sim.bySlot[this.subject]
    if (!b) return this.orbit(sim, aspect, out, this.layout.wideRect)
    const i = interpBird(view, b, this.tmp)
    if (this.fresh) {
      this.sx.snap(i.x)
      this.sy.snap(i.y)
      this.sz.snap(i.z)
      this.fresh = false
    }
    // suivi très amorti : la caméra glisse, l'oiseau vit dans le cadre
    const x = this.sx.step(i.x + i.vx * (2 / 1.4), 1.4, dt)
    const y = this.sy.step(i.y + i.vy * (2 / 1.4), 1.4, dt)
    const z = this.sz.step(i.z + i.vz * (2 / 1.5), 1.5, dt)
    _v.set(x, z + 1, -y)
    placeForSubject(out.pos, _v, out.quat, out.fov, aspect, L.sunSubject.x, L.sunSubject.y, 40)
    if (out.pos.y < 3.5) out.pos.y = 3.5
    // une tour vient barrer l'image : nouvelle prise sur un autre oiseau
    if (dt > 0 && towerClutter(sim, out.pos, yaw, halfH) > CLUTTER_MAX) {
      this.cluttered += dt
      if (this.cluttered > 0.6) {
        this.cluttered = 0
        this.subject = -1
        this.recuts++
        return this.sunset(0, sim, view, aspect, out)
      }
    } else this.cluttered = Math.max(0, this.cluttered - dt)
    return out
  }

  /** Vue haute et large qui tourne lentement : toute l'arène peinte, horizon au tiers haut. */
  private orbit(sim: SimState, aspect: number, out: Pose, rect: ScreenRect): Pose {
    if (this.fresh) {
      this.yaw0 = (this.rand() - 0.5) * 60 * DEG
      this.fresh = false
    }
    const yaw = this.yaw0 + this.t * 1.1 * DEG * this.sideSign
    return rigPose(this.wideFit(sim, aspect, yaw, 26 * DEG, rect), out)
  }
}

/** Séquenceur : enchaîne des plans (coupes franches au titre ; fondus lents aux crédits). */
export interface SequenceEntry {
  kind: ShotKind
  /** Titre : début en fraction du soleil de la démo (u) ; crédits : durée (s). */
  at: number
}

export const TITLE_SEQUENCE: SequenceEntry[] = [
  { kind: 'crane', at: 0 },
  { kind: 'track', at: 0.17 },
  { kind: 'group', at: 0.34 },
  { kind: 'track', at: 0.5 },
  { kind: 'sunset', at: 0.66 },
  { kind: 'orbit', at: 0.86 },
]

export const CREDITS_SEQUENCE: SequenceEntry[] = [
  { kind: 'orbit', at: 14 },
  { kind: 'sunset', at: 13 },
  { kind: 'group', at: 12 },
  { kind: 'track', at: 12 },
  { kind: 'crane', at: 13 },
]
