// Plans de cinéma (écran titre, crédits, chargement) sur la démo des bots : plans bas,
// contre-plongées, travellings qui suivent un oiseau puis révèlent l'arène, silhouettes
// sur le couchant, vue large qui tourne. Rythme calme ; chaque plan a son propre mouvement.
// ART_BIBLE §1.2 (planches), §6.1-6.3 : horizon dans le tiers bas ou haut, jamais au centre,
// FOV 35-45°, beaucoup de vide. Les zones de l'écran occupées par l'UI (logo, menu, panneau
// des crédits) sont décrites par un CineLayout : les sujets sont posés ailleurs.
import * as THREE from 'three'
import { towerRadiusAt } from '../../../../src/sim/maps.ts'
import type { BirdState, SimState } from '../../../../src/sim/types.ts'
import type { GameView } from '../../../../src/host/view.ts'
import { fitPoints, makeRig, type FitResult, type Rig, type ScreenRect } from '../../../../src/host/camera/framing.ts'
import { blendPose, clamp01, DEG, makePose, placeForSubject, smoother, Spring, wrapAngle, yawOfDir, yawPitchQuat, type Pose } from '../../../../src/host/camera/math.ts'
import { FULL_SCREEN, nearestTowerInView, stormDistanceInView, towerCover, towerCoverStats } from '../../../../src/host/camera/towerCover.ts'

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
  /** Cases de l'UI (logo, pied de page) : aucune tour ne doit y entrer (trame derrière le texte). */
  uiRects: ScreenRect[]
}

/**
 * Titre : case du logo et du pitch en haut à gauche (x 0,04-0,57, y 0,05-0,44), pied de page en bas
 * à gauche (QR, « Appuie sur une touche » : x 0,04-0,57, y 0,80-0,96), menu en bas à droite quand il
 * est ouvert (x > 0,72, y 0,58-0,85). Les sujets vivent dans la bande libre y 0,46-0,78 et à droite.
 */
export const TITLE_LAYOUT: CineLayout = {
  trackHigh: { x: 0.75, y: 0.33 },
  trackLow: { x: 0.33, y: 0.64 },
  wideRect: { x0: 0.05, x1: 0.69, y0: 0.5, y1: 0.92 },
  groupRect: { x0: 0.1, x1: 0.7, y0: 0.48, y1: 0.78 },
  sunX: 0.78,
  sunSubject: { x: 0.64, y: 0.43 },
  uiRects: [
    { x0: 0.03, x1: 0.58, y0: 0.03, y1: 0.45 },
    { x0: 0.03, x1: 0.58, y0: 0.79, y1: 0.97 },
  ],
}
/** Crédits : panneau central (x 0,23-0,77) ; la scène vit sur les bords. */
export const CREDITS_LAYOUT: CineLayout = {
  trackHigh: { x: 0.87, y: 0.36 },
  trackLow: { x: 0.13, y: 0.68 },
  wideRect: { x0: 0.02, x1: 0.98, y0: 0.4, y1: 0.97 },
  groupRect: { x0: 0.04, x1: 0.96, y0: 0.45, y1: 0.95 },
  sunX: 0.12,
  sunSubject: { x: 0.87, y: 0.44 },
  uiRects: [],
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

/** Tangage de la vue large qui tourne (titre, crédits). */
const ORBIT_PITCH = 22 * DEG
/** Vue large : oiseaux cadrés autour de l'oiseau central (m). */
const ORBIT_GROUP_RADIUS = 95
/** Deux coupes internes d'un même plan sont séparées d'au moins ce temps (s). */
const RECUT_MIN = 1.2
/** Anticipation des contrôles de composition (s). */
const LOOK_AHEAD = 0.8

const _sp = { x: 0, y: 0 }
const _q = new THREE.Quaternion()
const _d0 = new THREE.Vector3()
const _d1 = new THREE.Vector3()
/** Point d'écran (fractions) d'un point three vu par une pose. */
function projectInPose(pose: Pose, aspect: number, p: THREE.Vector3, out: { x: number; y: number }): void {
  _d0.copy(p).sub(pose.pos).applyQuaternion(_q.copy(pose.quat).invert())
  const d = Math.max(1e-3, -_d0.z)
  const tv = Math.tan((pose.fov * DEG) / 2)
  out.x = (_d0.x / d / (tv * aspect) + 1) / 2
  out.y = (1 - _d0.y / d / tv) / 2
}
/** Tourne la pose (position fixe) du plus petit angle pour que `p` (three) tombe au point d'écran (sx, sy). */
function aimAt(pose: Pose, aspect: number, p: THREE.Vector3, sx: number, sy: number): void {
  const tv = Math.tan((pose.fov * DEG) / 2)
  // direction actuelle du point (repère caméra) et direction voulue pour ce point d'écran
  _d0.copy(p).sub(pose.pos).applyQuaternion(_q.copy(pose.quat).invert()).normalize()
  _d1.set((sx * 2 - 1) * tv * aspect, (1 - sy * 2) * tv, -1).normalize()
  // rotation (repère caméra) qui amène d1 sur d0 : la caméra tourne pour que le point vienne en (sx, sy) ;
  // correction bornée (un sujet passé derrière la caméra ne la fait jamais se retourner)
  if (_d0.z > -0.2) return
  _q.setFromUnitVectors(_d1, _d0)
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)))
  if (ang > AIM_MAX) _q.slerp(_qi, 1 - AIM_MAX / ang)
  pose.quat.multiply(_q)
}
const _qi = new THREE.Quaternion()
/** Correction de visée maximale de la grue (rad). */
const AIM_MAX = 25 * DEG
function copyPoseTo(dst: Pose, src: Pose): void {
  dst.pos.copy(src.pos)
  dst.quat.copy(src.quat)
  dst.fov = src.fov
}

/** Couchant : distances caméra → oiseau essayées (m). */
const SUNSET_DISTS: readonly number[] = [40, 30]
let _sunYaw = 0
/** Pose du couchant : face au soleil (posé à l'abscisse sunX), l'oiseau à sunSubject, à `dist` m. */
function sunsetPose(az: number, sunX: number, dist: number, tanH: number, x: number, y: number, z: number, L: CineLayout, aspect: number, out: Pose): void {
  const yaw = yawOfDir(Math.sin(az), Math.cos(az)) + Math.atan((sunX * 2 - 1) * tanH)
  _sunYaw = yaw
  yawPitchQuat(out.quat, yaw, -7 * DEG)
  out.fov = 40
  _v.set(x, z + 1, -y)
  placeForSubject(out.pos, _v, out.quat, out.fov, aspect, L.sunSubject.x, L.sunSubject.y, dist)
  if (out.pos.y < 3.5) out.pos.y = 3.5
}

/** Le rideau du Simoun est-il à moins de STORM_NEAR m dans le champ de cette pose ? */
export function stormNear(sim: SimState, pose: Pose, aspect: number): boolean {
  _v2.set(0, 0, -1).applyQuaternion(pose.quat)
  const hx = _v2.x
  const hy = -_v2.z
  if (Math.hypot(hx, hy) < 0.05) return false
  const halfH = Math.atan(Math.tan((pose.fov * DEG) / 2) * aspect)
  return stormDistanceInView(sim, pose.pos.x, -pose.pos.z, hx, hy, halfH) < STORM_NEAR
}

/** Suivi : oiseaux essayés, angles de visée par rapport au cap (°), du plus beau au moins beau. */
const TRACK_TRY_BIRDS = 6
const TRACK_LOOKS: readonly number[] = [30, 60, 10, 90]

let _trackYaw = 0
/** Pose du suivi pour un point lissé de l'oiseau, un cap, un côté, un angle de visée. */
function trackPose(x: number, y: number, z: number, h: number, side: number, lookDeg: number, hk: number, sx: number, sy: number, aspect: number, out: Pose): void {
  // on regarde dans le sens du vol, tourné de lookDeg : l'oiseau file vers le fond, en diagonale
  const lookH = h + side * lookDeg * DEG
  const yaw = yawOfDir(Math.cos(lookH), Math.sin(lookH))
  _trackYaw = yaw
  yawPitchQuat(out.quat, yaw, (17 - 25 * hk) * DEG)
  out.fov = 38
  _v.set(x, z + 1.2, -y)
  placeForSubject(out.pos, _v, out.quat, out.fov, aspect, sx, sy, 24 + 4 * (1 - hk))
  if (out.pos.y < 3.2) out.pos.y = 3.2
}

/**
 * Note de défaut d'une pose de suivi (0 = propre) : sujet caché, tour proche ou large, Simoun,
 * tour dans une case de l'UI. Les tests bon marché d'abord (la rastérisation ne sert qu'aux poses
 * qui les passent).
 */
function poseBadness(sim: SimState, pose: Pose, aspect: number, layout: CineLayout, subject: THREE.Vector3): number {
  let bad = towerOccludes(sim, pose.pos, subject) ? 3 : 0
  const halfH = Math.atan(Math.tan((pose.fov * DEG) / 2) * aspect)
  _v2.set(0, 0, -1).applyQuaternion(pose.quat)
  const yaw = Math.atan2(-_v2.x, -_v2.z)
  const clutter = towerClutter(sim, pose.pos, yaw, halfH)
  if (clutter > CLUTTER_MAX) bad += clutter
  const cx = pose.pos.x
  const cy = -pose.pos.z
  const hx = _v2.x
  const hy = -_v2.z
  if (bad > 0) return bad
  // le Simoun proche n'est plus un défaut : le plan le masque (hideStorm, décidé à la coupe) ;
  // rastérisations bornées par prise (coût à la coupe) ; au-delà, test angulaire grossier
  if (_rasterBudget <= 0) {
    const d = Math.hypot(hx, hy) > 0.05 ? nearestTowerInView(sim, cx, cy, hx, hy, halfH) : Infinity
    return d < TOWER_NEAR ? 1 + (TOWER_NEAR - d) / TOWER_NEAR : 0.25
  }
  _rasterBudget--
  return shotFault(sim, pose, aspect, layout, true, subject.distanceTo(pose.pos)) ? 0.5 : 0
}
const _v2 = new THREE.Vector3()
/** Rastérisations restantes pour le choix de prise en cours. */
let _rasterBudget = 0
const RASTER_BUDGET = 10

/** Oiseau suivant (ordre des slots, en boucle). */
function nextSlot(sim: SimState, slot: number): number {
  const birds = sim.birds
  if (!birds.length) return -1
  const i = birds.findIndex(b => b.slot === slot)
  return birds[(i + 1) % birds.length]!.slot
}

const MAX_PTS = 48
/** Au-delà, une tour barre trop l'image (part de la largeur) : on change de côté, de lacet ou de sujet. */
const CLUTTER_MAX = 0.12
/** Plan refusé si une tour dans le champ est à moins de ces mètres (tour géante au premier plan). */
const TOWER_NEAR = 45
/** Plan refusé si le rideau du Simoun est à moins de ces mètres dans le champ (voile en gros plan). */
const STORM_NEAR = 120
/** Tour à moins de ces mètres dans l'angle horizontal : toujours un défaut (mur plein cadre, invisible à la projection). */
const TOWER_TOUCH = 12
/** Une tour à moins de 45 m (axe à moins de 45 + 18 m) compte si elle occupe plus de 5 % de la largeur. */
const NEAR_MIN_WIDTH = 0.05
/** Le rideau du Simoun (12 m) ne fait un voile en gros plan que vu d'une caméra plus basse que ceci (m). */
const STORM_CAM_MAX_Z = 40
/** Une tour plus large que CLUTTER_MAX ne compte comme « premier plan » qu'en deçà du sujet (et de 80 m au moins). */
const WIDE_NEAR = 80
/** Part d'une case de l'UI (logo, pied de page) qu'une tour peut couvrir. */
const UI_COVER_MAX = 0.05
/** Un oiseau en piqué engagé ne se suit pas (traînée de 700 px en diagonale à 25 m). */
const DIVE_STATES_EXCLUDED = true
/** Contrôle d'encombrement en cours de plan : période (s). */
const CHECK_PERIOD = 0.1

const _inv = new THREE.Matrix4()
const _m4 = new THREE.Matrix4()
const _pv = new THREE.Vector3()
const _one3 = new THREE.Vector3(1, 1, 1)
let _tanH = 1
let _tanV = 1
/** Projection d'une pose (repère three) pour towerCover (points en repère sim). */
function setPoseProjector(pose: Pose, aspect: number): void {
  _m4.compose(pose.pos, pose.quat, _one3)
  _inv.copy(_m4).invert()
  _tanV = Math.tan((pose.fov * DEG) / 2)
  _tanH = _tanV * aspect
}
const poseProjector = (x: number, y: number, z: number, out: { x: number; y: number; z: number }) => {
  _pv.set(x, z, -y).applyMatrix4(_inv)
  const d = -_pv.z
  const dd = Math.max(1e-3, d)
  out.x = (_pv.x / dd / _tanH + 1) / 2
  out.y = (1 - _pv.y / dd / _tanV) / 2
  out.z = d
}

/**
 * Défaut de composition d'une pose de cinéma (polish S4), '' si aucun : tour à moins de 45 m dans le
 * champ, tour plus large que 12 % de l'écran, rideau du Simoun à moins de 120 m, tour dans la case
 * du logo ou du pied de page.
 */
export function shotFault(sim: SimState, pose: Pose, aspect: number, layout: CineLayout, stormHidden = false, subjectDist = Infinity): '' | 'near' | 'wide' | 'storm' | 'ui' {
  const cx = pose.pos.x
  const cy = -pose.pos.z
  const cz = pose.pos.y
  _v.set(0, 0, -1).applyQuaternion(pose.quat)
  const hx = _v.x
  const hy = -_v.z
  const halfH = Math.atan(Math.tan((pose.fov * DEG) / 2) * aspect)
  // rideau du Simoun (12 m de haut) : un voile en gros plan seulement vu d'une caméra basse
  if (!stormHidden && cz < STORM_CAM_MAX_Z && Math.hypot(hx, hy) > 0.05 && stormDistanceInView(sim, cx, cy, hx, hy, halfH) < STORM_NEAR) return 'storm'
  // caméra collée à une tour (la projection ne la voit plus : un mur plein cadre)
  if (Math.hypot(hx, hy) > 0.05 && nearestTowerInView(sim, cx, cy, hx, hy, halfH) < TOWER_TOUCH) return 'near'
  setPoseProjector(pose, aspect)
  // tour à moins de 45 m réellement à l'image (pas seulement dans l'angle horizontal : sous le cadre,
  // derrière la caméra ou réduite à un fil, elle ne compte pas)
  towerCover(sim, cx, cy, cz, poseProjector, _tanH, _tanV, 0, FULL_SCREEN, TOWER_NEAR + 18, TOWER_NEAR + 18)
  if (towerCoverStats.maxWidth > NEAR_MIN_WIDTH) return 'near'
  // largeur : les tours du premier plan (jusqu'au sujet, 80 m au moins) ; au-delà, c'est le décor
  const nearDist = Math.max(WIDE_NEAR, subjectDist + 15)
  towerCover(sim, cx, cy, cz, poseProjector, _tanH, _tanV, 0, FULL_SCREEN, nearDist)
  if (towerCoverStats.maxWidth > CLUTTER_MAX) return 'wide'
  // cases de l'UI : une tour de premier plan qui passe derrière le logo ou le pied de page (les tours
  // du fond, petites et en partie cachées par la case opaque, font partie du décor)
  for (const r of layout.uiRects) if (towerCover(sim, cx, cy, cz, poseProjector, _tanH, _tanV, 0, r, Infinity, nearDist) > UI_COVER_MAX) return 'ui'
  return ''
}

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
  /** Pose extrapolée (LOOK_AHEAD s) pour anticiper l'entrée d'une tour. */
  private readonly ahead = makePose()
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
  private checkClock = 0
  /** Suivi : angle de visée par rapport au cap (°). */
  private lookDeg = 30
  /** Couchant : distance à l'oiseau et abscisse du soleil retenues. */
  private sunDist = 40
  private sunX = 0.78
  /** Temps depuis la dernière coupe interne (s). */
  private sinceCut = 0
  /** Plan de vue large : oiseau central du groupe cadré. */
  private orbitSubject = -1
  private lastFault: ReturnType<typeof shotFault> = ''
  /** Dernier défaut de composition relevé (debug, scripts). */
  get fault(): string {
    return this.lastFault
  }

  /** Distance (m) de la caméra de `pose` au sujet du plan (Infinity sans sujet). */
  subjectDistance(sim: SimState, pose: Pose): number {
    const b = sim.bySlot[this.kind === 'orbit' ? this.orbitSubject : this.subject]
    if (!b) return Infinity
    return Math.hypot(b.x - pose.pos.x, b.y + pose.pos.z, b.z - pose.pos.y)
  }

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
    this.checkClock = 0
    this.lastFault = ''
    this.sinceCut = 0
    this.orbitSubject = -1
  }

  /**
   * Défaut de composition, réévalué au plus toutes les CHECK_PERIOD s (toujours si `now`). `ahead` :
   * la pose que le plan aura dans ~0,8 s (sujet extrapolé) — une tour qui va entrer déclenche la
   * nouvelle prise avant d'être à l'image.
   */
  private faultOf(sim: SimState, pose: Pose, aspect: number, dt: number, now: boolean, ahead: Pose | null = null): string {
    this.checkClock -= dt
    if (now || this.checkClock <= 0) {
      this.checkClock = CHECK_PERIOD
      this.lastFault = shotFault(sim, pose, aspect, this.layout, true, this.subjectDistance(sim, pose))
      if (!this.lastFault && ahead) this.lastFault = shotFault(sim, ahead, aspect, this.layout, true, this.subjectDistance(sim, ahead))
    }
    return this.lastFault
  }

  private snapTrack(i: Interp, mode: 0 | 1): void {
    this.sx.snap(i.x)
    this.sy.snap(i.y)
    this.sz.snap(i.z)
    this.sh.snap(i.heading)
    this.side.snap(this.sideSign)
    this.highT = mode === 0 && i.z > 10 ? 1 : 0
    this.highK.snap(this.highT)
    this.fresh = false
  }

  /**
   * Première image d'un suivi (polish S4) : essaie, dans l'ordre, l'oiseau courant puis les
   * suivants (piqués exclus), des deux côtés, sous deux angles (30° puis 60° du cap), et garde la
   * première pose sans défaut (ni tour à moins de 45 m ou trop large, ni Simoun proche, ni tour dans
   * les cases de l'UI, ni oiseau caché) ; à défaut, la moins mauvaise. Coupe franche : rien n'est
   * montré avant ce choix.
   */
  private chooseTrack(sim: SimState, view: GameView, aspect: number, mode: 0 | 1): void {
    this.freshCheck = -1
    _rasterBudget = RASTER_BUDGET
    const n = Math.min(TRACK_TRY_BIRDS, sim.birds.length)
    let bestScore = Infinity
    let bestSubject = this.subject
    let bestSide = this.sideSign
    let bestLook: number = TRACK_LOOKS[0]
    let slot = this.subject
    const L = this.layout
    for (let k = 0; k < n; k++) {
      const b = sim.bySlot[slot]
      if (b && !(DIVE_STATES_EXCLUDED && b.dive !== 'none')) {
        const i = interpBird(view, b, this.tmp)
        const hk = mode === 0 && i.z > 10 ? 1 : 0
        const sx = L.trackLow.x + (L.trackHigh.x - L.trackLow.x) * hk
        const sy = L.trackLow.y + (L.trackHigh.y - L.trackLow.y) * hk
        for (const look of TRACK_LOOKS)
          for (const sd of [this.sideSign, -this.sideSign]) {
            trackPose(i.x, i.y, i.z, i.heading, sd, look, hk, sx, sy, aspect, this.close)
            const score = poseBadness(sim, this.close, aspect, L, _v)
            if (score < bestScore) {
              bestScore = score
              bestSubject = slot
              bestSide = sd
              bestLook = look
            }
            if (score === 0) {
              k = n
              break
            }
          }
        if (bestScore === 0) break
      }
      slot = nextSlot(sim, slot)
    }
    this.subject = bestSubject
    this.sideSign = bestSide
    this.lookDeg = bestLook
    this.fresh = true
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
      if (bird.stun > 0) s -= 1
      // un oiseau en piqué fond sur la caméra : jamais comme sujet de suivi
      if (bird.dive !== 'none') s -= DIVE_STATES_EXCLUDED ? 10 : 1
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
    // première image d'une prise : on choisit sujet, côté et angle avant de montrer quoi que ce soit
    if (this.freshCheck >= 0) this.chooseTrack(sim, view, aspect, mode)
    const b = sim.bySlot[this.subject]
    if (!b) return this.orbit(sim, aspect, out, this.layout.wideRect)
    const i = interpBird(view, b, this.tmp)
    if (this.fresh) this.snapTrack(i, mode)
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
    // pose dans LOOK_AHEAD s (même cap), pour couper avant qu'une tour n'entre
    trackPose(x + i.vx * LOOK_AHEAD, y + i.vy * LOOK_AHEAD, z, h, side, this.lookDeg, hk, sx, sy, aspect, this.ahead)
    trackPose(x, y, z, h, side, this.lookDeg, hk, sx, sy, aspect, out)
    const yaw = _trackYaw
    const blocked = towerOccludes(sim, out.pos, _v) || towerClutter(sim, out.pos, yaw, Math.atan(Math.tan(19 * DEG) * aspect)) > CLUTTER_MAX || this.faultOf(sim, out, aspect, dt, false, this.ahead) !== ''
    // l'oiseau suivi engage un piqué : il fondrait sur la caméra, nouvelle prise sur un autre oiseau
    if (DIVE_STATES_EXCLUDED && b.dive !== 'none' && mode === 0) {
      this.subject = -1
      this.recuts++
      this.occluded = 0
      this.flips = 0
      return this.track(0, sim, view, aspect, out, mode)
    }
    // une tour masque l'oiseau ou barre l'image (ou le Simoun, ou la case du logo) : nouvelle prise
    // en coupe franche — l'autre côté, puis un autre oiseau (vérifiés avant la première image) ; un
    // lent passage de l'autre côté laissait la tour plein cadre pendant deux secondes (polish S4)
    this.sinceCut += dt
    if (blocked) {
      this.occluded += dt
      if (this.occluded > 0.1 && (this.sinceCut > RECUT_MIN || mode === 1)) {
        this.occluded = 0
        this.sinceCut = 0
        this.recuts++
        this.sideSign = -this.sideSign
        this.freshCheck = 0
        this.fresh = true
        return this.track(0, sim, view, aspect, out, mode)
      }
      if (this.occluded > 0.2) {
        // coupes trop rapprochées : passage de l'autre côté en douceur, comme avant
        this.flips++
        this.sideSign = -this.sideSign
        this.occluded = -1.2
      }
    } else if (this.occluded > 0) this.occluded = 0
    else this.occluded = Math.min(0, this.occluded + dt)
    return out
  }

  /**
   * Part serré sur un oiseau (sur le ciel s'il vole haut), puis s'élève et recule pour révéler
   * l'arène entière. Le sujet reste dans le cadre pendant toute la grue : la visée interpolée est
   * corrigée pour que l'oiseau glisse de sa place du plan serré à sa place dans le plan large (bornée
   * à la zone libre de l'UI) — plus de plan sans sujet à mi-grue.
   */
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
    blendPose(out, this.close, this.far, k, 0)
    const b = sim.bySlot[this.subject]
    if (!b || k <= 0) return out
    const i = interpBird(view, b, this.tmp)
    _v.set(i.x, i.z + 1.2, -i.y)
    // où l'oiseau tombe dans le plan large (ramené dans la bande libre), où il est dans le plan serré
    const L = this.layout
    projectInPose(this.far, aspect, _v, _sp)
    const fx = Math.min(0.66, Math.max(0.1, _sp.x))
    const fy = Math.min(0.76, Math.max(0.5, _sp.y))
    const hk = this.highK.x
    const cx = L.trackLow.x + (L.trackHigh.x - L.trackLow.x) * hk
    const cy = L.trackLow.y + (L.trackHigh.y - L.trackLow.y) * hk
    aimAt(out, aspect, _v, cx + (fx - cx) * k, cy + (fy - cy) * k)
    return out
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
          pen += towerClutter(sim, this.far.pos, y2, halfH) + (shotFault(sim, this.far, aspect, this.layout, true) ? 1 : 0)
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
    if (!pickYaw && (towerClutter(sim, this.pose0.pos, yaw, halfH) > CLUTTER_MAX || this.faultOf(sim, this.pose0, aspect, dt, false) !== '')) {
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
      if (this.cluttered > 0.35) {
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
    copyPoseTo(this.pose0, out)
    return out
  }

  /** Face au couchant, caméra basse à l'est d'un oiseau : silhouettes devant le soleil bas. */
  private sunset(dt: number, sim: SimState, view: GameView, aspect: number, out: Pose): Pose {
    const L = this.layout
    const az = sim.sun.azimuth
    const tanH = Math.tan(20 * DEG) * aspect
    const halfH = Math.atan(tanH)
    if (this.subject < 0 || !sim.bySlot[this.subject]) {
      // l'oiseau (plutôt haut), la distance et la place du soleil dont le contrechamp est le plus
      // dégagé : première prise sans défaut, sinon la moins mauvaise (polish S4)
      _rasterBudget = RASTER_BUDGET
      let best = -1
      let bestScore = Infinity
      for (const b of sim.birds) {
        if (b.dive !== 'none') continue
        const i = interpBird(view, b, this.tmp)
        for (const dist of SUNSET_DISTS)
          for (const sunX of [L.sunX, L.sunX + (L.sunX > 0.5 ? -0.1 : 0.1)]) {
            sunsetPose(az, sunX, dist, tanH, i.x, i.y, i.z, L, aspect, this.far)
            _v.set(i.x, i.z + 1, -i.y)
            const score = poseBadness(sim, this.far, aspect, L, _v) * 10 - i.z / 18 + (b.stun > 0 ? 1 : 0) + this.rand() * 0.2
            if (score < bestScore) {
              bestScore = score
              best = b.slot
              this.sunDist = dist
              this.sunX = sunX
            }
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
    sunsetPose(az, this.sunX, this.sunDist, tanH, x + i.vx * LOOK_AHEAD, y + i.vy * LOOK_AHEAD, z, L, aspect, this.ahead)
    sunsetPose(az, this.sunX, this.sunDist, tanH, x, y, z, L, aspect, out)
    const yaw = _sunYaw
    // une tour vient barrer l'image (ou la case du logo) : nouvelle prise sur un autre oiseau
    this.sinceCut += dt
    if (dt > 0 && (towerClutter(sim, out.pos, yaw, halfH) > CLUTTER_MAX || this.faultOf(sim, out, aspect, dt, false, this.ahead) !== '')) {
      this.cluttered += dt
      if (this.cluttered > 0.12 && this.sinceCut > RECUT_MIN) {
        this.cluttered = 0
        this.sinceCut = 0
        this.subject = -1
        this.recuts++
        return this.sunset(0, sim, view, aspect, out)
      }
    } else this.cluttered = Math.max(0, this.cluttered - dt)
    return out
  }

  /**
   * Vue large qui tourne lentement (tangage 22°) autour de l'action : les oiseaux, leurs ombres et,
   * pendant la Grande Ombre, la lèvre du front (polish S4 : plus l'arène entière « en pizza » aux
   * oiseaux de 10 px). Lacet de départ choisi sans tour au premier plan ni dans les cases de l'UI.
   */
  private orbit(sim: SimState, aspect: number, out: Pose, rect: ScreenRect): Pose {
    const pitch = ORBIT_PITCH
    const n = this.actionPoints(sim)
    if (this.fresh) {
      const base = (this.rand() - 0.5) * 60 * DEG
      let best = Infinity
      for (let k = 0; k < 8; k++) {
        const cand = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 40 * DEG
        let pen = Math.abs(wrapAngle(cand)) * 0.1
        for (const dt2 of [0, this.dur]) {
          this.fitAction(n, aspect, cand + dt2 * 1.1 * DEG * this.sideSign, pitch, rect)
          rigPose(this.rig, this.far)
          pen += shotFault(sim, this.far, aspect, this.layout, true) ? 1 : 0
        }
        if (pen < best) {
          best = pen
          this.yaw0 = cand
        }
      }
      this.fresh = false
    }
    const yaw = this.yaw0 + this.t * 1.1 * DEG * this.sideSign
    this.fitAction(n, aspect, yaw, pitch, rect)
    return rigPose(this.rig, out)
  }

  /** Points de l'action pour la vue large : un groupe d'oiseaux et leurs ombres, le front de nuit. */
  private actionPoints(sim: SimState): number {
    const P = this.pts
    let n = 0
    if (this.orbitSubject < 0 || !sim.bySlot[this.orbitSubject]) {
      // l'oiseau qui a le plus de voisins proches
      let best = -1
      for (const b of sim.birds) {
        let c = 0
        for (const o of sim.birds) if (Math.hypot(o.x - b.x, o.y - b.y) < ORBIT_GROUP_RADIUS) c++
        const score = c + this.rand() * 0.5
        if (score > best) {
          best = score
          this.orbitSubject = b.slot
        }
      }
    }
    const s0 = sim.bySlot[this.orbitSubject]
    for (const b of sim.birds) {
      if (n + 3 > MAX_PTS) break
      if (s0 && Math.hypot(b.x - s0.x, b.y - s0.y) > ORBIT_GROUP_RADIUS) continue
      P.set([b.x, b.y, b.z], n * 3)
      n++
      P.set([b.shadow.cx, b.shadow.cy, 0], n * 3)
      n++
    }
    const nt = sim.night
    if (nt.active && sim.birds.length) {
      let west = Infinity
      for (const b of sim.birds) west = Math.min(west, b.x * nt.dirX + b.y * nt.dirY)
      const s = Math.max(nt.s, -sim.arena.a, west - 40)
      if (n < MAX_PTS) {
        P.set([nt.dirX * s, nt.dirY * s, 0], n * 3)
        n++
      }
    }
    // jamais plus serré qu'un tiers de l'arène
    const a = sim.arena.a * 0.34
    if (n + 2 <= MAX_PTS && n > 0) {
      let cx = 0
      let cy = 0
      for (let i = 0; i < n; i++) (cx += P[i * 3]!), (cy += P[i * 3 + 1]!)
      cx /= n
      cy /= n
      P.set([cx - a, cy, 0], n * 3)
      n++
      P.set([cx + a, cy, 0], n * 3)
      n++
    }
    return n
  }

  private fitAction(n: number, aspect: number, yaw: number, pitch: number, rect: ScreenRect): void {
    fitPoints(this.pts, n, yaw, pitch, 40, aspect, rect, 60, 4000, this.fit)
    const r = this.rig
    r.tx = this.fit.tx
    r.ty = this.fit.ty
    r.tz = 0
    r.yaw = yaw
    r.pitch = pitch
    r.dist = this.fit.dist
    r.fov = 40
  }
}

/** Séquenceur : enchaîne des plans (coupes franches au titre ; fondus lents aux crédits). */
export interface SequenceEntry {
  kind: ShotKind
  /** Titre : début en fraction du soleil de la démo (u) ; crédits : durée (s). */
  at: number
}

/**
 * Titre (démo de 40 s, nuit à 40 s, rebouclage à 44 s) : la vue large tourne moins de 5 s en pleine
 * heure dorée, et la boucle finit sur le couchant (le plus beau plan), en deux prises (deux oiseaux).
 */
export const TITLE_SEQUENCE: SequenceEntry[] = [
  { kind: 'crane', at: 0 },
  { kind: 'track', at: 0.16 },
  { kind: 'group', at: 0.32 },
  { kind: 'track', at: 0.46 },
  { kind: 'orbit', at: 0.6 },
  { kind: 'sunset', at: 0.72 },
  { kind: 'sunset', at: 0.9 },
]

export const CREDITS_SEQUENCE: SequenceEntry[] = [
  { kind: 'orbit', at: 14 },
  { kind: 'sunset', at: 13 },
  { kind: 'group', at: 12 },
  { kind: 'track', at: 12 },
  { kind: 'crane', at: 13 },
]
