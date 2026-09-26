// Plans de cinéma (écran titre, crédits, chargement) sur la démo des bots : plans bas,
// contre-plongées, travellings qui suivent un oiseau puis révèlent l'arène, silhouettes
// sur le couchant, vue large qui tourne. Rythme calme ; chaque plan a son propre mouvement.
// ART_BIBLE §1.2 (planches), §6.1-6.3 : horizon dans le tiers bas ou haut, jamais au centre,
// FOV 35-45°, beaucoup de vide. Les zones de l'écran occupées par l'UI (logo, menu, panneau
// des crédits) sont décrites par un CineLayout : les sujets sont posés ailleurs.
//
// Polish vague 2 (titre, « 100 % d'images composées ») : chaque plan est une PRISE (Setup) choisie
// parmi des candidates et VALIDÉE AVANT la coupe sur la trajectoire prédite des oiseaux (2,4 s, ou
// toute la grue) par un juge strict (frameFault : tour au premier plan ou trop large, tour derrière
// le logo, oiseau sous le logo ou le menu, sujet caché, coupé, trop petit ou absent, oiseau qui fond
// sur l'objectif, Simoun en gros plan). Si aucune candidate du plan voulu n'est propre, un plan de
// REPLI (contre-jour, puis « sky » : poursuite libre d'un oiseau sur le ciel, lacet choisi autour de
// lui) prend la place. Pendant le plan, l'image est rejugée 10 fois par seconde, et 0,8 s plus tôt
// sur la trajectoire prédite : nouvelle prise validée en coupe franche avant que le défaut n'arrive.
import * as THREE from 'three'
import { towerRadiusAt } from '../../sim/maps.ts'
import { RULES } from '../../sim/rules.ts'
import type { SimState } from '../../sim/types.ts'
import type { GameView } from '../view.ts'
import { fitPoints, makeRig, type FitResult, type Rig, type ScreenRect } from './framing.ts'
import { blendPose, clamp01, DEG, guardPosition, makePose, placeForSubject, smoother, Spring, wrapAngle, yawOfDir, yawPitchQuat, type Pose } from './math.ts'
import { demoFuture } from './demoFuture.ts'
import { nearestTowerInView, stormDistanceInView } from './towerCover.ts'

/** `sky` : plan de repli du titre (poursuite libre sur le ciel, de préférence en contre-jour). */
export type ShotKind = 'crane' | 'track' | 'group' | 'sunset' | 'orbit' | 'sky' | 'still'

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
  /** Couchant : abscisses du soleil essayées (la première est la préférée), point du sujet en silhouette. */
  sunX: number
  sunXs: readonly number[]
  sunSubject: { x: number; y: number }
  /** Repli « sky » : point du sujet. */
  skySubject: { x: number; y: number }
  /** Cases de l'UI (logo, pitch, pied de page, bouton, menu) pour un rapport d'aspect donné. */
  uiRects: (aspect: number) => readonly ScreenRect[]
}

/**
 * Cases de l'UI du titre (fractions d'écran) pour un rapport d'aspect : l'UI est dessinée en px de
 * conception (hauteur 1080, largeur ≥ 1600, src/host/ui/scale.ts) ; mesures prises sur title.css et
 * les captures (logo x 75-1092 y 50-377, pitch y 404-474, pied 862-1036, bouton centré à 150 px du
 * bas, menu 440 px à droite, 170 px du bas) ; marge de 10 px. Le menu n'est ouvert qu'après une
 * touche, mais il peut s'ouvrir à tout instant : sa case reste réservée.
 */
const _uiCache = { aspect: -1, rects: [] as ScreenRect[] }
export function titleUiRects(aspect: number): readonly ScreenRect[] {
  if (Math.abs(_uiCache.aspect - aspect) < 1e-4) return _uiCache.rects
  const Wd = aspect >= 1600 / 1080 ? 1080 * aspect : 1600
  const Hd = Wd / aspect
  const sx = 0.04 * Wd
  const m = 10
  const r = (x0: number, x1: number, y0: number, y1: number): ScreenRect => ({ x0: (x0 - m) / Wd, x1: (x1 + m) / Wd, y0: (y0 - m) / Hd, y1: (y1 + m) / Hd })
  _uiCache.aspect = aspect
  _uiCache.rects = [
    r(sx - 6, sx + 1020, 44, 384), // logo
    r(sx + 36, sx + 940, 398, 482), // pitch
    r(sx - 2, sx + 596, Hd - 222, Hd - 38), // pied de page (QR, code, plein écran)
    r(Wd / 2 - 195, Wd / 2 + 195, Hd - 218, Hd - 144), // « Appuie sur une touche »
    r(Wd - sx - 446, Wd - sx + 8, Hd - 440, Hd - 162), // menu
  ]
  return _uiCache.rects
}

/**
 * Titre : case du logo et du pitch en haut à gauche, pied de page en bas à gauche, bouton au centre
 * en bas, menu en bas à droite quand il est ouvert. Les sujets vivent dans la bande libre et à droite.
 */
export const TITLE_LAYOUT: CineLayout = {
  trackHigh: { x: 0.78, y: 0.39 },
  trackLow: { x: 0.34, y: 0.62 },
  wideRect: { x0: 0.06, x1: 0.7, y0: 0.5, y1: 0.76 },
  groupRect: { x0: 0.1, x1: 0.7, y0: 0.5, y1: 0.76 },
  sunX: 0.78,
  sunXs: [0.78, 0.68, 0.88],
  sunSubject: { x: 0.66, y: 0.5 },
  skySubject: { x: 0.72, y: 0.46 },
  uiRects: titleUiRects,
}
/** Crédits : panneau central (x 0,23-0,77) ; la scène vit sur les bords. */
export const CREDITS_LAYOUT: CineLayout = {
  trackHigh: { x: 0.87, y: 0.36 },
  trackLow: { x: 0.13, y: 0.68 },
  wideRect: { x0: 0.02, x1: 0.98, y0: 0.4, y1: 0.97 },
  groupRect: { x0: 0.04, x1: 0.96, y0: 0.45, y1: 0.95 },
  sunX: 0.12,
  sunXs: [0.12, 0.2],
  sunSubject: { x: 0.87, y: 0.44 },
  skySubject: { x: 0.86, y: 0.42 },
  uiRects: () => [],
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
const _v2 = new THREE.Vector3()

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

// ───────────────────────── Oiseaux : position présente et prédite ─────────────────────────

/** Un oiseau à un instant (présent interpolé, ou prédit à τ s : cap et vitesse constants). Repère sim. */
export interface BirdAt {
  slot: number
  x: number
  y: number
  z: number
  heading: number
  vx: number
  vy: number
  vz: number
  /** Centre de son ombre au sol. */
  scx: number
  scy: number
  dive: boolean
  stun: boolean
}
/** Ensemble d'oiseaux à un instant. */
export class BirdSet {
  readonly a: BirdAt[] = Array.from({ length: 12 }, () => ({ slot: -1, x: 0, y: 0, z: 0, heading: 0, vx: 0, vy: 0, vz: 0, scx: 0, scy: 0, dive: false, stun: false }))
  n = 0
  get(slot: number): BirdAt | null {
    for (let i = 0; i < this.n; i++) if (this.a[i]!.slot === slot) return this.a[i]!
    return null
  }
}

/**
 * Oiseaux dans τ s (τ = 0 : image présente, interpolée) : extrapolation linéaire, bornée à l'arène
 * (les bots virent au bord) et à l'altitude de vol. Au-delà de ~2,5 s, c'est une hypothèse ; la
 * surveillance en cours de plan (0,8 s d'avance) rattrape les virages.
 */
export function predictBirds(sim: SimState, view: GameView, tau: number, out: BirdSet): BirdSet {
  const A = sim.arena.a
  const B = sim.arena.b
  const al = view.alpha
  out.n = 0
  for (const b of sim.birds) {
    if (out.n >= out.a.length) break
    const p = view.prevBirds[b.slot] ?? b
    const o = out.a[out.n++]!
    o.slot = b.slot
    let x = p.x + (b.x - p.x) * al + b.vx * tau
    let y = p.y + (b.y - p.y) * al + b.vy * tau
    // (extrapolation seulement : l'image présente garde la vraie position, même au bord)
    const rho = tau > 0 ? Math.hypot(x / A, y / B) : 0
    if (rho > 0.96) {
      x *= 0.96 / rho
      y *= 0.96 / rho
    }
    o.x = x
    o.y = y
    o.z = Math.min(40, Math.max(1, p.z + (b.z - p.z) * al + b.vz * tau))
    o.heading = p.heading + wrapAngle(b.heading - p.heading) * al
    o.vx = b.vx
    o.vy = b.vy
    o.vz = b.vz
    o.scx = p.shadow.cx + (b.shadow.cx - p.shadow.cx) * al + b.vx * tau
    o.scy = p.shadow.cy + (b.shadow.cy - p.shadow.cy) * al + b.vy * tau
    o.dive = b.dive !== 'none'
    o.stun = b.stun > 0
  }
  return out
}

// ───────────────────────── Juge de composition ─────────────────────────

/**
 * Défaut d'une image de cinéma ('' = composée) :
 * - `storm` : rideau du Simoun à moins de 120 m dans le champ, caméra basse, non masqué ;
 * - `near` : caméra collée à une tour, ou tour à moins de 63 m de plus de 5 % de la largeur ;
 * - `wide` : une tour de plus de 12 % de la largeur au premier plan, de plus de 18 % au-delà ;
 * - `clutter` : un grand fût coupé par le haut du cadre au milieu de l'image, ou le sujet collé à une
 *   tour (devant ou derrière son fût : il ne se découpe plus) ;
 * - `ui` : une tour derrière une case de l'UI (logo, pitch, pied de page, bouton, menu) ;
 * - `bird-ui` : le sujet touche une case de l'UI, ou un autre oiseau net y est en partie caché ;
 * - `close` : un oiseau qui fond sur l'objectif (plus de 45 % de la largeur) ;
 * - `nosubject` / `hidden` / `small` : sujet absent ou coupé par le cadre, caché par une tour, trop
 *   petit pour être net (moins de 4 % de la largeur ; plans larges : aucun oiseau net d'au moins 3 %).
 */
export type Fault = '' | 'storm' | 'near' | 'wide' | 'clutter' | 'ui' | 'bird-ui' | 'close' | 'nosubject' | 'hidden' | 'small'

/** Plan refusé si le rideau du Simoun est à moins de ces mètres dans le champ (voile en gros plan). */
const STORM_NEAR = 120
/** Le rideau du Simoun (12 m) ne fait un voile en gros plan que vu d'une caméra plus basse que ceci (m). */
const STORM_CAM_MAX_Z = 40
/** Tour à moins de ces mètres dans l'angle horizontal : toujours un défaut (mur plein cadre, invisible à la projection). */
const TOWER_TOUCH = 12
/** Tour « proche » (m) : défaut dès qu'elle occupe plus de NEAR_MIN_WIDTH de la largeur. */
const TOWER_NEAR = 63
const NEAR_MIN_WIDTH = 0.07
/** Tour proche de plus de 7 % : défaut si son milieu est à moins de ceci du centre de l'image (x). */
const NEAR_MID = 0.17
/**
 * Largeur maximale d'une tour (part de la largeur de l'écran) : 12 % au premier plan (jusqu'au sujet
 * + 15 m, 80 m au moins), 18 % au-delà (décor : un disque de Parasol de 36 m fait déjà 14 % à 200 m).
 */
const WIDE_MAX = 0.12
const WIDE_FAR_MAX = 0.18
/** Couverture admise d'une case de l'UI par les tours du premier plan / par toutes les tours. */
const UI_COVER_FRONT = 0.03
const UI_COVER_ANY = 0.05
const UI_COVER_LOW = 0.25
/** Fût central : plus large que ceci, coupé par le haut, milieu à moins de COLUMN_MID du centre. */
const COLUMN_WIDTH = 0.055
const COLUMN_MID = 0.22
/** Sujet collé à une tour : tour plus large que ceci à moins de STICK_MARGIN de son cœur (part de la largeur). */
const STICK_WIDTH = 0.025
const STICK_MARGIN = 0.03
/** Premier plan : tours à moins de max(80 m, sujet + 15 m). */
const FRONT_MIN = 80
/** Oiseaux : taille nette minimale (part de la largeur), sujet et plans larges ; oiseau qui fond sur l'objectif. */
const SUBJECT_MIN = 0.04
const WIDE_SUBJECT_MIN = 0.03
const CLOSE_MAX = 0.45
const SUBJECT_CLOSE_MAX = 0.55
/**
 * Sujet : son cœur (tête, corps, cavalier) jamais sous une case de l'UI, et au plus 10 % de sa boîte
 * (un bout d'aile). Autre oiseau net (plus de 6 % de la largeur) : défaut si son cœur est en partie
 * caché (plus de 10 %, pas entièrement : un oiseau tout entier derrière le logo ne se voit pas).
 */
const SUBJECT_UI_MAX = 0.1
const OTHER_UI_MIN = 0.1
const OTHER_UI_SPAN = 0.06
/** Balayage du cœur des oiseaux au choix des prises (s de vol, de part et d'autre de l'instant). */
const SWEEP = 0.07
/** Échelle cosmétique des oiseaux (<Birds renderScale="auto">, controller.ts) : 60 px d'envergure en 1080p. */
const AUTO_SPAN_PX = 60

const _inv = new THREE.Matrix4()
const _m4 = new THREE.Matrix4()
const _pv = new THREE.Vector3()
const _one3 = new THREE.Vector3(1, 1, 1)
let _tanH = 1
let _tanV = 1
/** Projection d'une pose (repère three) (points en repère sim). */
function setPoseProjector(pose: Pose, aspect: number): void {
  _m4.compose(pose.pos, pose.quat, _one3)
  _inv.copy(_m4).invert()
  _tanV = Math.tan((pose.fov * DEG) / 2)
  _tanH = _tanV * aspect
}
function project(x: number, y: number, z: number, out: { x: number; y: number; z: number }): void {
  _pv.set(x, z, -y).applyMatrix4(_inv)
  const d = -_pv.z
  const dd = Math.max(1e-3, d)
  out.x = (_pv.x / dd / _tanH + 1) / 2
  out.y = (1 - _pv.y / dd / _tanV) / 2
  out.z = d
}

const SEG_MAX = 512
const _seg = new Float32Array(SEG_MAX * 4)
const _segTower = new Int16Array(SEG_MAX)
const TOWERS_MAX = 64
const _twWidth = new Float32Array(TOWERS_MAX)
const _twDist = new Float32Array(TOWERS_MAX)
const _twMid = new Float32Array(TOWERS_MAX)
const _twX0 = new Float32Array(TOWERS_MAX)
const _twX1 = new Float32Array(TOWERS_MAX)
const _twTop = new Float32Array(TOWERS_MAX)
const _twBot = new Float32Array(TOWERS_MAX)
const _pa = { x: 0, y: 0, z: 0 }
const _pb = { x: 0, y: 0, z: 0 }
/** sin de l'angle sous lequel on voit une section horizontale (1 = vue de dessus). */
function sinDepression(cx: number, cy: number, cz: number, x: number, y: number, z: number): number {
  const dh = Math.hypot(x - cx, y - cy)
  const dz = Math.abs(cz - z)
  return Math.max(0.08, dz / Math.max(1e-3, Math.hypot(dh, dz)))
}
/**
 * Boîtes d'écran des segments de tours (troncs de cône et disques : enveloppe des ellipses des deux
 * sections) pour la pose installée par setPoseProjector ; largeur écran et distance de chaque tour.
 */
function projectTowers(sim: SimState, cx: number, cy: number, cz: number): number {
  let n = 0
  const towers = sim.towers
  for (let ti = 0; ti < towers.length && ti < TOWERS_MAX; ti++) {
    const t = towers[ti]!
    let tMin = Infinity
    let tMax = -Infinity
    let tTop = Infinity
    let tBot = -Infinity
    for (const g of t.segments) {
      const x0 = t.x + (g.ox0 ?? 0)
      const y0 = t.y + (g.oy0 ?? 0)
      const x1 = t.x + (g.ox1 ?? 0)
      const y1 = t.y + (g.oy1 ?? 0)
      project(x0, y0, g.z0, _pa)
      project(x1, y1, g.z1, _pb)
      if (_pa.z < 2 || _pb.z < 2) continue
      const ax0 = g.r0 / _pa.z / (2 * _tanH)
      const ax1 = g.r1 / _pb.z / (2 * _tanH)
      const ay0 = (g.r0 * sinDepression(cx, cy, cz, x0, y0, g.z0)) / _pa.z / (2 * _tanV)
      const ay1 = (g.r1 * sinDepression(cx, cy, cz, x1, y1, g.z1)) / _pb.z / (2 * _tanV)
      const bx0 = Math.min(_pa.x - ax0, _pb.x - ax1)
      const bx1 = Math.max(_pa.x + ax0, _pb.x + ax1)
      const by0 = Math.min(_pa.y - ay0, _pb.y - ay1)
      const by1 = Math.max(_pa.y + ay0, _pb.y + ay1)
      if (bx1 < 0 || bx0 > 1 || by1 < 0 || by0 > 1) continue
      tMin = Math.min(tMin, Math.max(0, bx0))
      tMax = Math.max(tMax, Math.min(1, bx1))
      tTop = Math.min(tTop, by0)
      tBot = Math.max(tBot, by1)
      if (n < SEG_MAX) {
        _seg[n * 4] = bx0
        _seg[n * 4 + 1] = bx1
        _seg[n * 4 + 2] = by0
        _seg[n * 4 + 3] = by1
        _segTower[n] = ti
        n++
      }
    }
    _twWidth[ti] = tMax > tMin ? tMax - tMin : 0
    _twMid[ti] = (tMin + tMax) / 2
    _twX0[ti] = tMin
    _twX1[ti] = tMax
    _twTop[ti] = tTop
    _twBot[ti] = tBot
    _twDist[ti] = Math.hypot(t.x - cx, t.y - cy)
  }
  return n
}
const overlap = (a0: number, a1: number, b0: number, b1: number) => Math.max(0, Math.min(a1, b1) - Math.max(a0, b0))

/**
 * Marge de sécurité (0 = juge de l'image rendue ; 1 = choix des prises) : les prises sont choisies
 * avec des seuils un peu plus stricts, pour que les petits écarts entre la simulation (pas de 0,1 s)
 * et le rendu (60 i/s) ne fassent jamais franchir un seuil à l'image.
 */
let _margin = 0
const _uiM: ScreenRect[] = Array.from({ length: 8 }, () => ({ x0: 0, x1: 0, y0: 0, y1: 0 }))

/** Détail du dernier jugement (debug, scripts). */
export const faultInfo = { towerWidth: 0, subjectSpan: 0, subjectUi: 0, birdSpan: 0, birdUi: 0, birdSlot: -1, nearKind: '' }

/**
 * Juge une image (voir Fault). `birds` : oiseaux au même instant ; `subject` : slot du sujet, ou −1
 * pour un plan large (il faut alors au moins un oiseau net, entier et dégagé).
 */
export function frameFault(sim: SimState, birds: BirdSet, pose: Pose, aspect: number, layout: CineLayout, stormHidden: boolean, subject: number): Fault {
  const cx = pose.pos.x
  const cy = -pose.pos.z
  const cz = pose.pos.y
  _v.set(0, 0, -1).applyQuaternion(pose.quat)
  const hx = _v.x
  const hy = -_v.z
  const flat = Math.hypot(hx, hy) > 0.05
  const halfH = Math.atan(Math.tan((pose.fov * DEG) / 2) * aspect)
  if (!stormHidden && cz < STORM_CAM_MAX_Z && flat && stormDistanceInView(sim, cx, cy, hx, hy, halfH) < STORM_NEAR) return 'storm'
  if (flat && nearestTowerInView(sim, cx, cy, hx, hy, halfH) < TOWER_TOUCH + 3 * _margin) {
    faultInfo.nearKind = 'touch'
    return 'near'
  }
  setPoseProjector(pose, aspect)
  // sujet : distance (premier plan des tours)
  const sb = subject >= 0 ? birds.get(subject) : null
  const subjDist = sb ? Math.hypot(sb.x - cx, sb.y - cy) : 0
  const front = Math.max(FRONT_MIN, subjDist + 15)
  const nseg = projectTowers(sim, cx, cy, cz)
  let maxW = 0
  for (let ti = 0; ti < sim.towers.length && ti < TOWERS_MAX; ti++) {
    const w = _twWidth[ti]!
    const d = _twDist[ti]!
    if (w > maxW) maxW = w
    // tour proche : au plus 12 % de la largeur, et jamais un fût de plus de 7 % au milieu de l'image
    const k = 1 - 0.07 * _margin
    if (d < TOWER_NEAR + 6 * _margin && w > NEAR_MIN_WIDTH * k && (w > WIDE_MAX * k || Math.abs(_twMid[ti]! - 0.5) < NEAR_MID + 0.03 * _margin)) {
      faultInfo.towerWidth = w
      faultInfo.nearKind = w > WIDE_MAX * k ? 'big' : 'mid'
      return 'near'
    }
    if (w > (d < front ? WIDE_MAX : WIDE_FAR_MAX) * k) {
      faultInfo.towerWidth = w
      return 'wide'
    }
    // grand fût sombre au milieu de l'image, coupé par le haut du cadre (« mur » au centre)
    if (w > COLUMN_WIDTH * k && _twTop[ti]! < 0.01 + 0.02 * _margin && Math.abs(_twMid[ti]! - 0.5) < COLUMN_MID + 0.03 * _margin) {
      faultInfo.towerWidth = w
      return 'clutter'
    }
  }
  faultInfo.towerWidth = maxW
  const ui0 = layout.uiRects(aspect)
  let ui = ui0
  if (_margin > 0) {
    // cases de l'UI élargies de 1,2 % de chaque côté
    const m = 0.012 * _margin
    ui = _uiM.slice(0, ui0.length)
    ui0.forEach((r, i) => {
      const o = _uiM[i]!
      o.x0 = r.x0 - m
      o.x1 = r.x1 + m
      o.y0 = r.y0 - m
      o.y1 = r.y1 + m
    })
  }
  for (let ri = 0; ri < ui.length; ri++) {
    const r = ui[ri]!
    // (aire de la case réelle : la marge élargit la case, jamais le seuil)
    const r0 = ui0[ri]!
    const area = (r0.x1 - r0.x0) * (r0.y1 - r0.y0)
    let fr = 0
    let any = 0
    for (let s = 0; s < nseg; s++) {
      const a = overlap(_seg[s * 4]!, _seg[s * 4 + 1]!, r.x0, r.x1) * overlap(_seg[s * 4 + 2]!, _seg[s * 4 + 3]!, r.y0, r.y1) * 0.8
      if (a <= 0) continue
      any += a
      if (_twDist[_segTower[s]!]! < front) fr += a
    }
    // logo et pitch (en haut) : aucune tour derrière ; cases du bas (pied, bouton, menu), opaques et
    // posées sur le sable : seulement une tour qui les couvre largement
    if (r.y0 < 0.5 ? fr > UI_COVER_FRONT * area || any > UI_COVER_ANY * area : any > UI_COVER_LOW * area) return 'ui'
  }
  // oiseaux : boîte entière (envergure × 0,44 envergure) et « cœur » (tête, corps, cavalier : 40 % × 20 %)
  const vpx = 1080 * aspect
  let sharp = false
  let subjectSeen = false
  faultInfo.subjectSpan = 0
  faultInfo.subjectUi = 0
  for (let i = 0; i < birds.n; i++) {
    const b = birds.a[i]!
    project(b.x, b.y, b.z + 0.6, _pa)
    const isSubj = b.slot === subject
    if (_pa.z < 1.5) continue
    const dist = Math.hypot(b.x - cx, b.y - cy, b.z - cz)
    const raw = RULES.wingspan / (2 * _tanH * Math.max(1, dist))
    const s = raw * Math.min(RULES.birdRenderScaleMax, Math.max(1, AUTO_SPAN_PX / Math.max(1e-3, raw * vpx)))
    const hw = s / 2
    const hh = 0.22 * s * aspect
    const area = 4 * hw * hh
    const on = (overlap(_pa.x - hw, _pa.x + hw, 0, 1) * overlap(_pa.y - hh, _pa.y + hh, 0, 1)) / area
    if (on <= 0) continue
    let uiPart = 0
    let core = 0
    const cw = 0.2 * s
    const ch = 0.1 * s * aspect
    // cœur : au choix des prises, balayé sur ± SWEEP s de vol (un oiseau qui passe le bord d'une case
    // entre deux instants simulés est vu à cheval)
    let kx0 = _pa.x - cw
    let kx1 = _pa.x + cw
    let ky0 = _pa.y - ch
    let ky1 = _pa.y + ch
    if (_margin > 0) {
      for (const sg of [-1, 1]) {
        project(b.x + b.vx * SWEEP * sg, b.y + b.vy * SWEEP * sg, b.z + 0.6 + b.vz * SWEEP * sg, _pb)
        if (_pb.z < 1.5) continue
        kx0 = Math.min(kx0, _pb.x - cw)
        kx1 = Math.max(kx1, _pb.x + cw)
        ky0 = Math.min(ky0, _pb.y - ch)
        ky1 = Math.max(ky1, _pb.y + ch)
      }
    }
    const karea = (kx1 - kx0) * (ky1 - ky0)
    for (const r of ui) {
      uiPart += (overlap(_pa.x - hw, _pa.x + hw, r.x0, r.x1) * overlap(_pa.y - hh, _pa.y + hh, r.y0, r.y1)) / area
      core += (overlap(kx0, kx1, r.x0, r.x1) * overlap(ky0, ky1, r.y0, r.y1)) / karea
    }
    if (s > (isSubj ? SUBJECT_CLOSE_MAX : CLOSE_MAX) - 0.05 * _margin) return 'close'
    if (isSubj) {
      subjectSeen = true
      faultInfo.subjectSpan = s
      faultInfo.subjectUi = uiPart
      if (on < 0.85 + 0.05 * _margin || _pa.x < 0.02 || _pa.x > 0.98 || _pa.y < 0.04 || _pa.y > 0.96) return 'nosubject'
      if (core > 0 || uiPart > SUBJECT_UI_MAX - 0.04 * _margin) {
        faultInfo.birdSpan = s
        faultInfo.birdUi = uiPart
        faultInfo.birdSlot = b.slot
        return 'bird-ui'
      }
      _v2.set(b.x, b.z + 0.6, -b.y)
      if (towerOccludes(sim, pose.pos, _v2)) return 'hidden'
      if (s < SUBJECT_MIN) return 'small'
      // le sujet collé à une tour (devant ou derrière son fût) : il ne se découpe plus
      const kx0 = _pa.x - cw - STICK_MARGIN - 0.01 * _margin
      const kx1 = _pa.x + cw + STICK_MARGIN + 0.01 * _margin
      for (let ti = 0; ti < sim.towers.length && ti < TOWERS_MAX; ti++)
        if (_twWidth[ti]! > STICK_WIDTH && _twX1[ti]! > kx0 && _twX0[ti]! < kx1 && _twBot[ti]! > _pa.y - ch && _twTop[ti]! < _pa.y + ch) {
          faultInfo.towerWidth = _twWidth[ti]!
          return 'clutter'
        }
      sharp = true
    } else {
      if (s > OTHER_UI_SPAN * (1 - 0.15 * _margin) && core > OTHER_UI_MIN * (1 - 0.5 * _margin) && core < 0.97 + 0.02 * _margin) {
        faultInfo.birdSpan = s
        faultInfo.birdUi = core
        faultInfo.birdSlot = b.slot
        return 'bird-ui'
      }
      if (!sharp && s >= WIDE_SUBJECT_MIN && on > 0.97 && uiPart < 0.02) {
        _v2.set(b.x, b.z + 0.6, -b.y)
        if (!towerOccludes(sim, pose.pos, _v2)) sharp = subject < 0
      }
    }
  }
  if (subject >= 0 && !subjectSeen) return 'nosubject'
  if (!sharp) return subject >= 0 ? 'small' : 'nosubject'
  return ''
}

/** Le rideau du Simoun est-il à moins de STORM_NEAR m dans le champ de cette pose (caméra basse) ? */
export function stormNear(sim: SimState, pose: Pose, aspect: number): boolean {
  _v2.set(0, 0, -1).applyQuaternion(pose.quat)
  const hx = _v2.x
  const hy = -_v2.z
  if (Math.hypot(hx, hy) < 0.05 || pose.pos.y >= STORM_CAM_MAX_Z) return false
  const halfH = Math.atan(Math.tan((pose.fov * DEG) / 2) * aspect)
  return stormDistanceInView(sim, pose.pos.x, -pose.pos.z, hx, hy, halfH) < STORM_NEAR
}

// ───────────────────────── Poses des plans ─────────────────────────

/** Tangage de la vue large qui tourne (titre, crédits). */
const ORBIT_PITCHES: readonly number[] = [24 * DEG, 32 * DEG, 40 * DEG]
/** Vue large : oiseaux cadrés autour de l'oiseau central (m). */
const ORBIT_GROUP_RADIUS = 95
/** Grue : tangage du plan large d'arrivée. */
const CRANE_PITCH = 26 * DEG
/** Rotations lentes (°/s). */
const GROUP_SPIN = 1.5
const ORBIT_SPIN = 1.1
const CRANE_SPIN = 0.8
const GROUP_PITCH = 16 * DEG

/** Deux coupes internes d'un même plan : au moins ce temps (s). */
const RECUT_SOON = 0.3
/** Surveillance : période (s) ; resimulation de la prise rendue (s). */
const CHECK_PERIOD = 0.1
const RECHECK = 0.5
/**
 * Jugements par recherche de prise : recherche immédiate (début de boucle, filet de sécurité), puis
 * recherche préparée d'avance (PRE_LEAD s avant la coupe, SLICE jugements et SLICE_MS ms par frame). Un jugement
 * (pose + juge) coûte ~30-60 µs.
 */
const WANT_BUDGET = 300
const FALLBACK_BUDGET = 160
const SYNC_BUDGET = 700
const WANT_BUDGET_BIG = 1600
const FALLBACK_BUDGET_BIG = 700
const SLICE = 64
/** Tranche d'une recherche préparée : au plus ce temps par frame (ms ; machine lente : la fin se fait à la coupe). */
const SLICE_MS = 1.6
const PRE_LEAD = 2.4 // = TITLE_PREPARE

/** Suivi : angles de visée par rapport au cap (°), du plus beau au moins beau. */
const TRACK_LOOKS: readonly number[] = [30, 60, 10, 90]
/** Couchant : distances caméra → oiseau essayées (m). */
const SUNSET_DISTS: readonly number[] = [40, 30, 52]
/** Repli « sky » : distances (m), tangage (vers le haut), écarts de lacet au soleil essayés (°). */
const SKY_DISTS: readonly number[] = [34, 46, 26]
/**
 * Contre-plongée légère (l'oiseau sur l'horizon), contre-plongée franche (sur le ciel), puis plongée
 * franche (l'oiseau et son ombre sur le sable peint, vus d'en haut ; en dernier : de près, les aplats
 * saturés du soir font « tapis »), plan zénithal enfin (au milieu des tours, au départ de la boucle,
 * c'est souvent le seul sans fût dans l'image).
 */
const SKY_PITCHES: readonly number[] = [-6 * DEG, -20 * DEG, 40 * DEG, 62 * DEG]
const SKY_OFFSETS: readonly number[] = [0, 30, -30, 60, -60, 90, -90, 120, -120, 150, -150, 180]

/** Une prise : de quoi recalculer la pose du plan à tout instant (présent ou prédit). */
interface Setup {
  kind: ShotKind
  slot: number
  side: number
  /** track : angle de visée par rapport au cap (°) ; 1 = oiseau haut (contre-plongée), 0 = bas. */
  look: number
  hk: number
  /** sunset / sky : distance à l'oiseau (m). */
  dist: number
  /** sunset : abscisse du soleil ; sky : lacet de visée (sim, rad). */
  sunX: number
  az: number
  /** group / orbit / grue : lacet de départ et tangage. */
  yaw: number
  pitch: number
}
/** Journal des choix de prise (banc, debug) : null en jeu. */
export const cineDebug: { log: ((m: string) => void) | null; faults: Record<string, number> } = { log: null, faults: {} }
const makeSetup = (): Setup => ({ kind: 'track', slot: -1, side: 1, look: 30, hk: 1, dist: 40, sunX: 0.78, az: 0, yaw: 0, pitch: 0 })
const copySetup = (d: Setup, s: Setup): Setup => Object.assign(d, s)

/** Pose du suivi pour un point de l'oiseau, un cap, un côté, un angle de visée. */
function trackPose(x: number, y: number, z: number, h: number, side: number, lookDeg: number, hk: number, L: CineLayout, aspect: number, out: Pose): void {
  // on regarde dans le sens du vol, tourné de lookDeg : l'oiseau file vers le fond, en diagonale
  const lookH = h + side * lookDeg * DEG
  const yaw = yawOfDir(Math.cos(lookH), Math.sin(lookH))
  yawPitchQuat(out.quat, yaw, (17 - 25 * hk) * DEG)
  out.fov = 38
  const sx = L.trackLow.x + (L.trackHigh.x - L.trackLow.x) * hk
  const sy = L.trackLow.y + (L.trackHigh.y - L.trackLow.y) * hk
  _v.set(x, z + 1.2, -y)
  placeForSubject(out.pos, _v, out.quat, out.fov, aspect, sx, sy, 26 + 2 * (1 - hk))
  if (out.pos.y < 3.2) out.pos.y = 3.2
}

/** Pose du couchant : face au soleil (posé à l'abscisse sunX), l'oiseau à sunSubject, à `dist` m. */
function sunsetPose(az: number, sunX: number, dist: number, x: number, y: number, z: number, L: CineLayout, aspect: number, out: Pose): void {
  const tanH = Math.tan(20 * DEG) * aspect
  const yaw = yawOfDir(Math.sin(az), Math.cos(az)) + Math.atan((sunX * 2 - 1) * tanH)
  yawPitchQuat(out.quat, yaw, -7 * DEG)
  out.fov = 40
  _v.set(x, z + 1, -y)
  placeForSubject(out.pos, _v, out.quat, out.fov, aspect, L.sunSubject.x, L.sunSubject.y, dist)
  if (out.pos.y < 3.5) out.pos.y = 3.5
}

/** Repli « sky » : caméra basse qui regarde l'oiseau dans la direction `az` (sim), légèrement vers le haut. */
function skyPose(az: number, pitch: number, dist: number, x: number, y: number, z: number, L: CineLayout, aspect: number, out: Pose): void {
  yawPitchQuat(out.quat, yawOfDir(Math.cos(az), Math.sin(az)), pitch)
  out.fov = 40
  _v.set(x, z + 1, -y)
  placeForSubject(out.pos, _v, out.quat, out.fov, aspect, L.skySubject.x, L.skySubject.y, dist)
  if (out.pos.y < 3) out.pos.y = 3
}

const MAX_PTS = 48
const _pts = new Float64Array(MAX_PTS * 3)
const _fit: FitResult = { tx: 0, ty: 0, dist: 0, width: 0 }
const _rig: Rig = makeRig()
/** Points du plan de groupe : l'oiseau-sujet, ses voisins à moins de 70 m, leurs ombres. */
function groupPoints(birds: BirdSet, slot: number): number {
  const s = birds.get(slot)
  if (!s) return 0
  let n = 0
  for (let i = 0; i < birds.n; i++) {
    const b = birds.a[i]!
    if (Math.hypot(b.x - s.x, b.y - s.y) > 70 || n + 2 > MAX_PTS) continue
    _pts[n * 3] = b.x
    _pts[n * 3 + 1] = b.y
    _pts[n * 3 + 2] = b.z
    n++
    _pts[n * 3] = b.scx
    _pts[n * 3 + 1] = b.scy
    _pts[n * 3 + 2] = 0
    n++
  }
  return n
}
/** Points de la vue large : un groupe d'oiseaux autour de `slot` et leurs ombres, le front de nuit, au moins un tiers de l'arène. */
function orbitPoints(sim: SimState, birds: BirdSet, slot: number): number {
  const s0 = birds.get(slot)
  let n = 0
  for (let i = 0; i < birds.n; i++) {
    const b = birds.a[i]!
    if (n + 3 > MAX_PTS) break
    if (s0 && Math.hypot(b.x - s0.x, b.y - s0.y) > ORBIT_GROUP_RADIUS) continue
    _pts[n * 3] = b.x
    _pts[n * 3 + 1] = b.y
    _pts[n * 3 + 2] = b.z
    n++
    _pts[n * 3] = b.scx
    _pts[n * 3 + 1] = b.scy
    _pts[n * 3 + 2] = 0
    n++
  }
  const nt = sim.night
  if (nt.active && birds.n) {
    let west = Infinity
    for (let i = 0; i < birds.n; i++) west = Math.min(west, birds.a[i]!.x * nt.dirX + birds.a[i]!.y * nt.dirY)
    const s = Math.max(nt.s, -sim.arena.a, west - 40)
    if (n < MAX_PTS) {
      _pts.set([nt.dirX * s, nt.dirY * s, 0], n * 3)
      n++
    }
  }
  // jamais plus serré qu'un tiers de l'arène
  const a = sim.arena.a * 0.34
  if (n + 2 <= MAX_PTS && n > 0) {
    let cx = 0
    let cy = 0
    for (let i = 0; i < n; i++) (cx += _pts[i * 3]!), (cy += _pts[i * 3 + 1]!)
    cx /= n
    cy /= n
    _pts.set([cx - a, cy, 0], n * 3)
    n++
    _pts.set([cx + a, cy, 0], n * 3)
    n++
  }
  return n
}
function fitPose(n: number, yaw: number, pitch: number, rect: ScreenRect, minD: number, maxD: number, aspect: number, out: Pose): void {
  fitPoints(_pts, n, yaw, pitch, 40, aspect, rect, minD, maxD, _fit)
  _rig.tx = _fit.tx
  _rig.ty = _fit.ty
  _rig.tz = 0
  _rig.yaw = yaw
  _rig.pitch = pitch
  _rig.dist = _fit.dist
  _rig.fov = 40
  rigPose(_rig, out)
}

const _sp = { x: 0, y: 0 }
function copyPoseTo(dst: Pose, src: Pose): void {
  dst.pos.copy(src.pos)
  dst.quat.copy(src.quat)
  dst.fov = src.fov
}
function poseFinite(p: Pose): boolean {
  return Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.quat.x + p.quat.y + p.quat.z + p.quat.w + p.fov)
}
const _q = new THREE.Quaternion()
const _qi = new THREE.Quaternion()
const _d0 = new THREE.Vector3()
const _d1 = new THREE.Vector3()
/** Correction de visée maximale de la grue et du cadreur (rad). */
const AIM_MAX = 25 * DEG
/** Cadreur : part de la dérive du sujet gardée à l'image. */
const HOLD_KEEP = 0.35
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
  _d0.copy(p).sub(pose.pos).applyQuaternion(_q.copy(pose.quat).invert()).normalize()
  _d1.set((sx * 2 - 1) * tv * aspect, (1 - sy * 2) * tv, -1).normalize()
  // correction bornée (un sujet passé derrière la caméra ne la fait jamais se retourner)
  if (_d0.z > -0.2) return
  _q.setFromUnitVectors(_d1, _d0)
  const ang = 2 * Math.acos(Math.min(1, Math.abs(_q.w)))
  if (ang > AIM_MAX) _q.slerp(_qi, 1 - AIM_MAX / ang)
  pose.quat.multiply(_q)
}

// ───────────────────────── Le plan ─────────────────────────

const _now = new BirdSet()
const _vp = makePose()

/**
 * Oiseaux dans τ s de l'image présente : trajectoire exacte de la jumelle de la démo (demoFuture)
 * quand elle couvre l'instant, sinon extrapolation (crédits d'une autre sim, jumelle désaccordée).
 */
export function birdsAhead(sim: SimState, view: GameView, tau: number, out: BirdSet): BirdSet {
  if (tau > 0 && demoFuture.birdsAt(sim, view.alpha, tau, out)) return out
  return predictBirds(sim, view, tau, out)
}

/**
 * Pas de simulation d'une prise (s) : tri des candidates (0,2), vérification fine de celles qui
 * comptent, de la retenue à la coupe et de la prise rendue en continu (0,05 : un oiseau qui passe le
 * bord du logo, une tour qui entre par le côté, sont vus).
 */
const SIM_STEP = 0.2
const VERIFY_STEP = 0.05
const FINE_STEP = VERIFY_STEP
/** Vérification fine : ressorts intégrés au pas du rendu entre deux instants jugés (plus fidèle, plus cher). */
const SUBSTEPS = false
/** Une prise plus courte que ceci n'est gardée qu'à défaut de mieux (s). */
const MIN_TAKE = 3
const MIN_TAKE_BEAUTY = 2
/** Une prise préparée qui, vérifiée à la coupe, tient moins que ceci (s) est recherchée à nouveau. */
const ADOPT_MIN = 0.6
/** On coupe cette avance (s) avant le premier défaut prévu d'une prise. */
const CUT_MARGIN = 0.25
/** Défaut prévu à moins de ceci (s) de la fin du plan : on passe au plan suivant (director). */
const EARLY_END = 1.2

/** État de lissage d'un plan (ressorts) : sauvegardé pendant la simulation des candidates. */
interface Smooth {
  s: Float64Array
  highT: number
  fresh: boolean
}

/**
 * Un plan : une prise validée (Setup), l'état de lissage, la pose calculée à chaque frame, la
 * surveillance et les nouvelles prises (coupes franches internes). Chaque candidate est SIMULÉE
 * sur la durée du plan (ressorts, cadreur et visée compris) avec la trajectoire exacte des oiseaux
 * quand elle est connue ; la retenue est propre jusqu'à `cleanUntil` (fin du plan de préférence) :
 * on coupe juste avant sur une autre prise validée.
 */
export class CineShot {
  /** Plan voulu par la séquence. */
  kind: ShotKind = 'still'
  t = 0
  dur = 8
  private rand: () => number = rng(1)
  private readonly setup: Setup = makeSetup()
  private readonly cand: Setup = makeSetup()
  private readonly best: Setup = makeSetup()
  private planned = false
  private readonly springs = Array.from({ length: 9 }, () => new Spring())
  private readonly sx = this.springs[0]!
  private readonly sy = this.springs[1]!
  private readonly sz = this.springs[2]!
  private readonly sh = this.springs[3]!
  private readonly side = this.springs[4]!
  private readonly rx = this.springs[5]!
  private readonly ry = this.springs[6]!
  private readonly rd = this.springs[7]!
  /** 1 = oiseau haut (contre-plongée sur le ciel), 0 = bas (plongée sur le sable) ; lissé. */
  private readonly highK = this.springs[8]!
  private highT = 1
  private fresh = true
  private readonly saved: Smooth = { s: new Float64Array(18), highT: 1, fresh: true }
  private readonly close = makePose()
  private readonly far = makePose()
  /** Dernière pose finie rendue. */
  private readonly lastGood = makePose()
  /** Coupes franches internes au plan (le réalisateur les compte comme des coupes). */
  recuts = 0
  /** Prises de repli (aucune candidate du plan voulu n'était propre assez longtemps). */
  fallbacks = 0
  /** Le Simoun passe à moins de 120 m dans une image de la prise : masqué pour toute la prise. */
  hideStorm = false
  layout: CineLayout = TITLE_LAYOUT
  private checkClock = 0
  private sinceCut = 0
  private faultTime = 0
  private lastFault: Fault = ''
  private judged = 0
  /** Prochaine resimulation de la prise en cours (s). */
  private recheck = 0
  /** Temps de plan jusqu'auquel la prise est propre, et jusqu'auquel elle a été simulée. */
  private cleanUntil = 0
  private checkedUntil = 0
  /** Défaut de l'image courante (surveillance ; debug, scripts). */
  get fault(): string {
    return this.lastFault
  }
  /** Début (temps de plan) de la prise recherchée d'avance, −∞ sans recherche. */
  get jobFrom(): number {
    return this.job?.from ?? -Infinity
  }
  /** Le plan suivant de la séquence est préparé (director, à chaque frame). */
  nextReady = false
  /** Début du plan suivant dans SON horloge (0 = coupe prévue ; négatif si ce plan lui passe la main plus tôt). */
  get handOverAt(): number {
    return this.planned && this.cleanUntil < this.dur - 1e-3 && this.dur - this.cleanUntil < EARLY_END ? this.cleanUntil - CUT_MARGIN - this.dur : 0
  }
  /**
   * La prise en cours arrive à son premier défaut prévu moins de EARLY_END s avant la fin du plan :
   * plutôt qu'une prise de quelques dixièmes, le réalisateur passe tout de suite au plan suivant
   * (s'il est préparé, pour cet instant : handOverAt).
   */
  get endsEarly(): boolean {
    return this.planned && this.cleanUntil < this.dur - 1e-3 && this.dur - this.cleanUntil < EARLY_END && this.t >= this.cleanUntil - CUT_MARGIN
  }
  /** Plan effectivement tourné (repli compris). */
  get actualKind(): ShotKind {
    return this.planned ? this.setup.kind : this.kind
  }
  /** Sujet de la prise (−1 pour un plan large). */
  get subjectSlot(): number {
    return this.judgeSubject(this.setup, this.t)
  }

  start(kind: ShotKind, dur: number, seed: number, layout: CineLayout): void {
    this.kind = kind
    this.dur = dur
    this.t = 0
    this.rand = rng(seed * 7919 + 13)
    this.layout = layout
    this.planned = false
    this.fresh = true
    this.checkClock = 0
    this.sinceCut = 0
    this.faultTime = 0
    this.lastFault = ''
    this.hideStorm = false
    this.cleanUntil = this.checkedUntil = 0
    this.job = null
    this.preSim = null
    this.setup.kind = kind
    this.setup.slot = -1
    this.setup.side = this.rand() < 0.5 ? -1 : 1
  }

  /** Juge l'image `pose` avec les oiseaux présents (director : cameraState.shotFault). */
  judge(sim: SimState, view: GameView, pose: Pose, aspect: number, stormHidden: boolean): Fault {
    predictBirds(sim, view, 0, _now)
    return frameFault(sim, _now, pose, aspect, this.layout, stormHidden, this.subjectSlot)
  }

  update(dt: number, sim: SimState | null, view: GameView, aspect: number, out: Pose): Pose {
    this.t += dt
    if (!sim || this.kind === 'still') return this.still(out, sim)
    // première image d'une prise : on choisit (et valide) avant de montrer quoi que ce soit
    if (!this.planned || !sim.bySlot[this.setup.slot]) this.plan(sim, view, aspect)
    predictBirds(sim, view, 0, _now)
    this.pose(dt, sim, _now, this.setup, this.t, aspect, out)
    this.sinceCut += dt
    // prise suivante du même plan (premier défaut prévu avant la fin) : recherche préparée d'avance
    const cutAt = this.cleanUntil - CUT_MARGIN
    if (this.cleanUntil < this.dur - 1e-3 && !(this.nextReady && this.dur - this.cleanUntil < EARLY_END) && this.t >= cutAt - PRE_LEAD && this.t < cutAt) {
      if (!this.job || this.job.sim !== sim || Math.abs(this.job.from - cutAt) > 1e-3) this.startJob(sim, Math.max(this.t, cutAt), this.kind, true)
      this.runJob(sim, view, aspect, SLICE, SLICE_MS)
    }
    if (!poseFinite(out)) {
      // garde-fou (jamais observé au banc) : une pose non finie ne s'affiche pas ; nouvelle prise
      copyPoseTo(out, this.lastGood)
      this.planned = false
      return out
    }
    copyPoseTo(this.lastGood, out)
    if (this.watch(dt, sim, view, aspect, out)) {
      this.recuts++
      this.sinceCut = 0
      this.faultTime = 0
      this.plan(sim, view, aspect)
      this.pose(0, sim, _now, this.setup, this.t, aspect, out)
      this.checkClock = 0
      this.watch(0, sim, view, aspect, out)
    }
    return out
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

  /** Sujet jugé : −1 pour les plans larges (groupe, vue large, grue une fois montée). */
  private judgeSubject(s: Setup, t: number): number {
    if (s.kind === 'group' || s.kind === 'orbit') return -1
    if (s.kind === 'crane') return this.craneK(t) > 0.2 ? -1 : s.slot
    return s.slot
  }
  private craneK(t: number): number {
    return smoother((t - 1.2) / Math.max(1, this.dur - 1.8))
  }

  // ── pose (lissée) : la même fonction sert au rendu et à la simulation des candidates ──

  private pose(dt: number, sim: SimState, birds: BirdSet, s: Setup, t: number, aspect: number, out: Pose): boolean {
    const ok = this.poseRaw(dt, sim, birds, s, t, aspect, out)
    // mêmes garde-fous que le réalisateur (jamais sous le sol ni dans une tour ; plus haut hors de
    // l'arène) : la simulation des prises juge exactement l'image qui sera rendue
    guardPosition(out.pos, sim.towers, sim.arena)
    return ok
  }
  private poseRaw(dt: number, sim: SimState, birds: BirdSet, s: Setup, t: number, aspect: number, out: Pose): boolean {
    const b = birds.get(s.slot)
    if (!b) {
      this.still(out, sim)
      return false
    }
    const L = this.layout
    switch (s.kind) {
      case 'track':
        this.trackSmooth(dt, b, s, aspect, out)
        return true
      case 'crane':
        this.trackSmooth(dt, b, s, aspect, this.close)
        fitPose(orbitPoints(sim, birds, s.slot), s.yaw + t * CRANE_SPIN * DEG * s.side, CRANE_PITCH, L.wideRect, 60, 4000, aspect, this.far)
        this.craneBlend(b, s, t, aspect, this.close, this.far, out)
        return true
      case 'sunset':
      case 'sky': {
        if (this.fresh) {
          this.sx.snap(b.x)
          this.sy.snap(b.y)
          this.sz.snap(b.z)
          this.fresh = false
        }
        // suivi très amorti : la caméra glisse, l'oiseau vit dans le cadre (avance 2v/ω)
        const x = this.sx.step(b.x + b.vx * (2 / 1.4), 1.4, dt)
        const y = this.sy.step(b.y + b.vy * (2 / 1.4), 1.4, dt)
        const z = this.sz.step(b.z + b.vz * (2 / 1.5), 1.5, dt)
        if (s.kind === 'sunset') {
          sunsetPose(sim.sun.azimuth, s.sunX, s.dist, x, y, z, L, aspect, out)
          this.hold(out, b, 1, L.sunSubject.x, L.sunSubject.y, aspect)
        } else {
          skyPose(s.az, s.pitch, s.dist, x, y, z, L, aspect, out)
          this.hold(out, b, 1, L.skySubject.x, L.skySubject.y, aspect)
        }
        return true
      }
      case 'group': {
        const n = groupPoints(birds, s.slot)
        const yaw = s.yaw + t * GROUP_SPIN * DEG * s.side
        fitPoints(_pts, n, yaw, GROUP_PITCH, 40, aspect, L.groupRect, 70, 600, _fit)
        if (this.fresh) {
          this.rx.snap(_fit.tx)
          this.ry.snap(_fit.ty)
          this.rd.snap(Math.log(_fit.dist))
          this.fresh = false
        }
        // le groupe se déplace avec son oiseau-sujet : même avance que le suivi
        _rig.tx = this.rx.step(_fit.tx + b.vx * (2 / 1.2), 1.2, dt)
        _rig.ty = this.ry.step(_fit.ty + b.vy * (2 / 1.2), 1.2, dt)
        _rig.tz = 0
        _rig.yaw = yaw
        _rig.pitch = GROUP_PITCH
        _rig.dist = Math.exp(this.rd.step(Math.log(_fit.dist), 0.8, dt))
        _rig.fov = 40
        rigPose(_rig, out)
        return true
      }
      case 'orbit':
        fitPose(orbitPoints(sim, birds, s.slot), s.yaw + t * ORBIT_SPIN * DEG * s.side, s.pitch, L.wideRect, 60, 4000, aspect, out)
        this.fresh = false
        return true
      default:
        this.still(out, sim)
        return false
    }
  }

  /** Travelling qui suit un oiseau (avance 2v/ω : un ressort critique qui suit une rampe traîne de 2v/ω). */
  private trackSmooth(dt: number, b: BirdAt, s: Setup, aspect: number, out: Pose): void {
    if (this.fresh) {
      this.sx.snap(b.x)
      this.sy.snap(b.y)
      this.sz.snap(b.z)
      this.sh.snap(b.heading)
      this.side.snap(s.side)
      this.highT = s.hk
      this.highK.snap(s.hk)
      this.fresh = false
    }
    const x = this.sx.step(b.x + b.vx * 0.5, 4, dt)
    const y = this.sy.step(b.y + b.vy * 0.5, 4, dt)
    const z = this.sz.step(b.z + b.vz * (2 / 3), 3, dt)
    const h = this.sh.stepAngle(b.heading, 0.8, dt)
    const side = this.side.step(s.side, 1.4, dt)
    // l'oiseau change d'étage : le plan passe du ciel au sable (ou l'inverse) en douceur
    if (this.highT > 0.5 && b.z < 8) this.highT = 0
    else if (this.highT < 0.5 && b.z > 13) this.highT = 1
    const hk = this.highK.step(this.highT, 1.3, dt)
    const L = this.layout
    trackPose(x, y, z, h, side, s.look, hk, L, aspect, out)
    this.hold(out, b, 1.2, L.trackLow.x + (L.trackHigh.x - L.trackLow.x) * hk, L.trackLow.y + (L.trackHigh.y - L.trackLow.y) * hk, aspect)
  }

  /**
   * Cadreur : le sujet dérive de sa place (virage, retard des ressorts) ; la visée en rattrape
   * 1 − HOLD_KEEP (rotation seule, bornée) — il garde un peu de vie sans passer sous le logo ni le menu.
   */
  private hold(out: Pose, b: BirdAt, lift: number, sx: number, sy: number, aspect: number): void {
    _v2.set(b.x, b.z + lift, -b.y)
    projectInPose(out, aspect, _v2, _sp)
    aimAt(out, aspect, _v2, sx + (_sp.x - sx) * HOLD_KEEP, sy + (_sp.y - sy) * HOLD_KEEP)
  }

  /** Grue : du plan serré au plan large ; le sujet glisse de sa place serrée à sa place large (bande libre). */
  private craneBlend(b: BirdAt, s: Setup, t: number, aspect: number, close: Pose, far: Pose, out: Pose): void {
    const k = this.craneK(t)
    blendPose(out, close, far, k, 0)
    if (k <= 0) return
    const L = this.layout
    _v2.set(b.x, b.z + 1.2, -b.y)
    projectInPose(far, aspect, _v2, _sp)
    const fx = Math.min(0.66, Math.max(0.12, _sp.x))
    const fy = Math.min(0.72, Math.max(0.52, _sp.y))
    const cx = L.trackLow.x + (L.trackHigh.x - L.trackLow.x) * s.hk
    const cy = L.trackLow.y + (L.trackHigh.y - L.trackLow.y) * s.hk
    aimAt(out, aspect, _v2, cx + (fx - cx) * k, cy + (fy - cy) * k)
  }

  // ── simulation et choix de la prise ──

  private saveSmooth(): void {
    const o = this.saved
    this.springs.forEach((sp, i) => {
      o.s[i * 2] = sp.x
      o.s[i * 2 + 1] = sp.v
    })
    o.highT = this.highT
    o.fresh = this.fresh
  }
  private restoreSmooth(): void {
    const o = this.saved
    this.springs.forEach((sp, i) => {
      sp.x = o.s[i * 2]!
      sp.v = o.s[i * 2 + 1]!
    })
    this.highT = o.highT
    this.fresh = o.fresh
  }

  /**
   * Simule la prise `s` à partir du temps de plan courant (fraîche : ressorts recalés, ou dans l'état
   * de lissage présent) jusqu'à `until`, au pas `step` ; rend le temps de plan du premier défaut
   * (`until` si aucun). `storm` : note si le Simoun passe près (this.stormSeen).
   */
  private simulate(sim: SimState, view: GameView, s: Setup, aspect: number, fresh: boolean, until: number, step: number, from = this.t, stormHidden = true): number {
    this.saveSmooth()
    if (fresh) this.fresh = true
    _margin = 1
    let clean = until
    let prevT = this.t
    this.stormSeen = false
    this.simFault = ''
    for (let tt = from; tt <= until + 1e-6; tt += step) {
      this.judged++
      let dt = tt === from && fresh ? 0 : tt - prevT
      if (SUBSTEPS && step <= FINE_STEP && dt > 0) {
        // vérification fine : ressorts intégrés comme au rendu (pas de 1/60 s) entre deux instants jugés
        const n = Math.max(1, Math.round(dt * 60))
        for (let k = 1; k < n; k++) {
          const ti = prevT + (dt * k) / n
          this.pose(dt / n, sim, this.predicted(sim, view, ti), s, ti, aspect, _vp)
        }
        dt /= n
      }
      const birds = this.predicted(sim, view, tt)
      const ok = this.pose(dt, sim, birds, s, tt, aspect, _vp)
      prevT = tt
      if (!ok) {
        clean = tt
        break
      }
      const f = frameFault(sim, birds, _vp, aspect, this.layout, stormHidden, this.judgeSubject(s, tt))
      if (f) {
        if (cineDebug.log && step === SIM_STEP) {
          const k = `${s.kind}${s.kind === 'sky' ? Math.round(s.pitch / DEG) : ''}:${f}${f === 'near' ? faultInfo.nearKind : ''}${tt - from < 0.5 ? '@0' : tt - from < 2 ? '@<2' : '@2+'}`
          cineDebug.faults[k] = (cineDebug.faults[k] ?? 0) + 1
        }
        clean = tt
        this.simFault = f
        break
      }
      if (!this.stormSeen && stormNear(sim, _vp, aspect)) this.stormSeen = true
    }
    this.restoreSmooth()
    _margin = 0
    return clean
  }
  private stormSeen = false
  /** Défaut qui a arrêté la dernière simulation (debug). */
  private simFault: Fault = ''

  /**
   * Oiseaux au temps de plan `tt` (cache par recherche : toutes les candidates partagent les mêmes
   * instants ; clé à la milliseconde). L'avenir exact ne change pas d'une frame à l'autre ; une entrée
   * extrapolée est recalculée dès que l'avenir exact la couvre.
   */
  private readonly predMap = new Map<number, { set: BirdSet; exact: boolean }>()
  private readonly predPool: { set: BirdSet; exact: boolean }[] = []
  private predUsed = 0
  private predicted(sim: SimState, view: GameView, tt: number): BirdSet {
    if (this.predUsed === 0 && this.predMap.size) this.predMap.clear()
    const key = Math.round(tt * 1000)
    const tau = Math.max(0, key / 1000 - this.t)
    const exact = this.preSim === sim ? key / 1000 <= demoFuture.upcomingHorizon(sim) : tau <= demoFuture.horizon(sim, view.alpha)
    let e = this.predMap.get(key)
    if (e && (e.exact || !exact)) return e.set
    if (!e) {
      if (this.predUsed >= this.predPool.length) this.predPool.push({ set: new BirdSet(), exact: false })
      e = this.predPool[this.predUsed++]!
      this.predMap.set(key, e)
    }
    e.exact = exact
    // démo pas encore à l'écran (première prise du rebouclage) : son avenir depuis son tick 0
    if (this.preSim === sim && demoFuture.birdsAtStart(sim, Math.max(0, key / 1000), e.set)) return e.set
    return birdsAhead(sim, view, tau, e.set)
  }
  /** Plan préparé pour la démo suivante, pas encore à l'écran (son temps de plan 0 = le tick 0 de cette démo). */
  preSim: SimState | null = null

  /** Oiseaux candidats au rôle de sujet, du plus beau au moins beau (piqués et sonnés à la fin). */
  private subjects(sim: SimState, wantHigh: number): number[] {
    const a = sim.arena.a
    const b = sim.arena.b
    const scored = sim.birds.map((bird) => {
      const rho = Math.hypot(bird.x / a, bird.y / b)
      let s = -rho * 2 + wantHigh * (bird.z / 18) + this.rand() * 0.6
      if (bird.stun > 0) s -= 1
      if (bird.dive !== 'none') s -= 10
      for (const t of sim.towers) {
        const d = Math.hypot(t.x - bird.x, t.y - bird.y)
        if (d < 30) s -= (30 - d) / 30
      }
      return { slot: bird.slot, s }
    })
    scored.sort((p, q) => q.s - p.s)
    return scored.map((p) => p.slot)
  }

  /**
   * Meilleures candidates de la recherche en cours : `best` (la plus longue propre) et `acc` (parmi
   * celles qui tiennent MIN_TAKE s ou jusqu'à la fin du plan, la plus belle : rang le plus bas, puis
   * la plus longue).
   */
  private bestClean = -1
  private readonly acc: Setup = makeSetup()
  private accClean = -1
  private accRank = Infinity
  /**
   * Rang de beauté d'une prise (0 = le plan voulu) : contre-jour et suivis d'abord ; plongée franche
   * ensuite (en fin de journée, après tout le reste : de près, les aplats saturés font « tapis ») ;
   * plan zénithal en dernier recours.
   */
  private rankOf(sim: SimState, s: Setup, want: ShotKind): number {
    if (s.kind === want) return 0
    if (s.kind === 'sunset') return 1
    if (s.kind === 'sky') {
      if (s.pitch < -10 * DEG) return 2
      if (s.pitch < 0) return 1
      if (s.pitch > 50 * DEG) return 5
      return sim.sun.t / sim.sun.T > 0.6 ? 4.5 : 3
    }
    if (s.kind === 'track') return 1.5
    return 2
  }

  /**
   * Recherche de prise en cours (incrémentale) : prise qui commencera au temps de plan `from`, plan
   * voulu puis replis, chacun avec son budget de jugements ; `done` quand une belle candidate est
   * propre jusqu'à la fin du plan ou que tout est essayé. Lancée d'avance (PRE_LEAD s avant la coupe)
   * et menée par tranches à chaque frame : le choix est prêt à la coupe, sans à-coup.
   */
  private job: { from: number; want: ShotKind; kinds: ShotKind[]; ki: number; it: Generator<void> | null; kindEnd: number; big: boolean; done: boolean; sim: SimState } | null = null

  /** Essaie la candidate `this.cand` (prise qui commence à `from`) ; true = on peut s'arrêter (belle et propre jusqu'au bout). */
  private tryCand(sim: SimState, view: GameView, aspect: number, from: number, want: ShotKind): boolean {
    const end = Math.max(from, this.dur)
    const rank = this.rankOf(sim, this.cand, want)
    // une belle prise (contre-jour, suivi, groupe) vaut d'être gardée dès 2 s ; les autres dès 3 s
    const enough = Math.min(end, from + (rank <= 2 ? MIN_TAKE_BEAUTY : MIN_TAKE))
    // tri grossier (pas de 0,2 s), puis vérification fine (0,1 s) de toute candidate qui compterait
    let clean = this.simulate(sim, view, this.cand, aspect, true, end, SIM_STEP, from)
    const counts = (c: number) => c > this.bestClean || (c >= enough - 1e-6 && (rank < this.accRank || (rank === this.accRank && c > this.accClean)))
    if (!counts(clean)) return false
    clean = this.simulate(sim, view, this.cand, aspect, true, clean, VERIFY_STEP, from)
    if (clean > this.bestClean) {
      this.bestClean = clean
      copySetup(this.best, this.cand)
    }
    if (clean >= enough - 1e-6 && (rank < this.accRank || (rank === this.accRank && clean > this.accClean))) {
      this.accRank = rank
      this.accClean = clean
      copySetup(this.acc, this.cand)
    }
    return rank <= 1 && clean >= end - 1e-6
  }

  /** Candidates d'un type de plan, dans l'ordre de préférence (this.cand, une à chaque étape). */
  private *candidates(sim: SimState, kind: ShotKind): Generator<void> {
    const c = this.cand
    const L = this.layout
    c.kind = kind
    const side0 = this.setup.side || 1
    switch (kind) {
      case 'track':
      case 'crane': {
        for (const slot of this.subjects(sim, 1)) {
          const b = sim.bySlot[slot]
          if (!b || b.dive !== 'none') continue
          c.slot = slot
          c.hk = b.z > 10 ? 1 : 0
          if (kind === 'crane') {
            // le plan large d'arrivée : lacets essayés autour du nord (l'arène se lit de biais)
            for (const sd of [side0, -side0]) {
              c.look = TRACK_LOOKS[0]!
              c.side = sd
              const base = (this.rand() - 0.5) * 50 * DEG
              for (let k = 0; k < 6; k++) {
                c.yaw = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 60 * DEG
                yield
              }
            }
          } else
            for (const look of TRACK_LOOKS)
              for (const sd of [side0, -side0]) {
                c.look = look
                c.side = sd
                yield
              }
        }
        return
      }
      case 'sunset': {
        for (const slot of this.subjects(sim, 1)) {
          const b = sim.bySlot[slot]
          if (!b || b.dive !== 'none') continue
          c.slot = slot
          for (const dist of SUNSET_DISTS)
            for (const sunX of L.sunXs) {
              c.dist = dist
              c.sunX = sunX
              yield
            }
        }
        return
      }
      case 'sky': {
        const sunAz = sim.sun.azimuth
        // direction du soleil (sim) : visée face à lui = contre-jour, puis on s'en écarte
        const sunDir = Math.atan2(Math.cos(sunAz), Math.sin(sunAz))
        const slots = this.subjects(sim, 1)
        for (const pitch of SKY_PITCHES)
          for (const off of SKY_OFFSETS)
            for (const slot of slots) {
              const b = sim.bySlot[slot]
              if (!b || b.dive !== 'none') continue
              c.slot = slot
              c.az = sunDir + off * DEG
              c.pitch = pitch
              for (const dist of SKY_DISTS) {
                c.dist = dist
                yield
              }
            }
        return
      }
      case 'group': {
        for (const slot of this.subjects(sim, 0)) {
          c.slot = slot
          c.side = side0
          const base = (this.rand() - 0.5) * 70 * DEG
          for (let k = 0; k < 12; k++) {
            c.yaw = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 30 * DEG
            yield
          }
        }
        return
      }
      case 'orbit': {
        // l'oiseau qui a le plus de voisins proches d'abord
        const order = sim.birds
          .map((b) => ({ slot: b.slot, c: sim.birds.filter((o) => Math.hypot(o.x - b.x, o.y - b.y) < ORBIT_GROUP_RADIUS).length + this.rand() * 0.5 }))
          .sort((p, q) => q.c - p.c)
        for (const { slot } of order.slice(0, 4)) {
          c.slot = slot
          c.side = side0
          for (const pitch of ORBIT_PITCHES) {
            c.pitch = pitch
            const base = (this.rand() - 0.5) * 60 * DEG
            for (let k = 0; k < 10; k++) {
              c.yaw = base + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 36 * DEG
              yield
            }
          }
        }
        return
      }
      default:
        return
    }
  }

  /** Plans de repli, dans l'ordre, pour un plan voulu. */
  private static fallbacksOf(kind: ShotKind): ShotKind[] {
    switch (kind) {
      case 'sunset':
        return ['sky', 'track', 'group']
      case 'track':
        return ['sky', 'sunset', 'group']
      case 'crane':
        return ['track', 'sky', 'group']
      default:
        return ['track', 'sky', 'sunset']
    }
  }

  private startJob(sim: SimState, from: number, want: ShotKind, big: boolean): void {
    this.judged = 0
    this.predUsed = 0
    this.bestClean = -1
    this.accClean = -1
    this.accRank = Infinity
    this.job = { from, want, kinds: [want, ...CineShot.fallbacksOf(want)], ki: 0, it: null, kindEnd: big ? WANT_BUDGET_BIG : WANT_BUDGET, big, done: false, sim }
  }

  /** Mène la recherche en cours pour au plus `slice` jugements ; true quand elle est finie. */
  private runJob(sim: SimState, view: GameView, aspect: number, slice: number, ms = Infinity): boolean {
    const j = this.job
    if (!j || j.done) return true
    const stop = this.judged + slice
    const t0 = ms < Infinity ? performance.now() : 0
    while (this.judged < stop && (ms === Infinity || performance.now() - t0 < ms)) {
      if (!j.it) j.it = this.candidates(sim, j.kinds[j.ki]!)
      const r = this.judged > j.kindEnd ? { done: true } : j.it.next()
      if (!r.done) {
        if (this.tryCand(sim, view, aspect, j.from, j.want)) {
          j.done = true
          break
        }
        continue
      }
      // type épuisé (ou son budget) : le plan voulu suffit-il ? sinon repli suivant
      j.it = null
      j.ki++
      if (j.ki >= j.kinds.length || this.accRank === 0) {
        j.done = true
        break
      }
      j.kindEnd = this.judged + (j.big ? FALLBACK_BUDGET_BIG : FALLBACK_BUDGET)
    }
    return j.done
  }

  /**
   * Adopte le résultat de la recherche : parmi les prises qui tiennent MIN_TAKE s (ou jusqu'à la fin
   * du plan), la plus belle (rankOf), sinon la plus longue propre. Coupe franche : rien n'est montré
   * avant ce choix.
   */
  private adopt(sim: SimState, view: GameView, aspect: number, retry = true): void {
    const j = this.job!
    const want = j.want
    const end = Math.max(this.t, this.dur)
    // la plus belle qui tient MIN_TAKE s (ou jusqu'à la fin), sinon la plus longue propre
    if (this.accClean >= 0) {
      copySetup(this.best, this.acc)
      this.bestClean = this.accClean
    }
    if (this.best.kind !== want) this.fallbacks++
    if (this.bestClean <= this.t || this.best.slot < 0 || !sim.bySlot[this.best.slot]) {
      // rien de propre (ou sim vide) : la meilleure trouvée, sinon premier oiseau venu en suivi simple
      if (this.best.slot < 0 || !sim.bySlot[this.best.slot]) {
        copySetup(this.best, this.setup)
        this.best.kind = 'track'
        this.best.slot = sim.birds[0]?.slot ?? -1
      }
      this.bestClean = Math.max(this.bestClean, this.t)
    }
    copySetup(this.setup, this.best)
    this.job = null
    // vérification fine depuis maintenant (le tri a pu sauter un défaut bref ; la prise commence
    // peut-être une frame plus tôt ou plus tard que prévu) et Simoun à masquer
    this.predUsed = 0
    this.cleanUntil = this.simulate(sim, view, this.setup, aspect, true, Math.max(this.t, this.bestClean), FINE_STEP)
    this.hideStorm = this.stormSeen
    if (retry && this.cleanUntil < Math.min(end, this.t + ADOPT_MIN)) {
      if (cineDebug.log) cineDebug.log(`  prise préparée (${this.best.kind}, propre →${this.bestClean.toFixed(2)}) refusée à la coupe : ${this.simFault} à ${this.cleanUntil.toFixed(2)} (t=${this.t.toFixed(2)}, from=${j.from.toFixed(2)})`)
      // la prise préparée ne tient plus depuis maintenant (elle commence plus tôt ou plus tard que
      // prévu) : recherche immédiate depuis cet instant, sans rien montrer avant
      this.startJob(sim, this.t, want, false)
      this.runJob(sim, view, aspect, SYNC_BUDGET)
      return this.adopt(sim, view, aspect, false)
    }
    // horizon réellement simulé : jusqu'à la fin du plan, ou jusqu'au premier défaut prévu
    this.checkedUntil = Math.min(end, this.t + Math.max(0, demoFuture.horizon(sim, view.alpha)))
    if (cineDebug.log) cineDebug.log(`plan t=${this.t.toFixed(2)} from=${j.from.toFixed(2)} want=${want} got=${this.best.kind} clean→${this.cleanUntil.toFixed(1)}/${end.toFixed(1)} judged=${this.judged} horizon=${demoFuture.horizon(sim, view.alpha).toFixed(1)} why=${this.lastFault || '-'} end=${this.cleanUntil < end - 1e-3 ? this.simFault + (this.simFault === 'near' ? faultInfo.nearKind : '') : '-'}`)
    this.planned = true
    this.fresh = true
    this.lastFault = ''
  }

  /** Choix de prise maintenant : la recherche préparée pour cet instant si elle existe (finie au besoin), sinon une recherche bornée. */
  private plan(sim: SimState, view: GameView, aspect: number): void {
    const j = this.job
    if (!j || j.sim !== sim || j.from - this.t > EARLY_END + 0.1 || j.from - this.t < -0.3) this.startJob(sim, this.t, this.kind === 'still' ? 'track' : this.kind, false)
    this.runJob(sim, view, aspect, SYNC_BUDGET)
    this.adopt(sim, view, aspect)
  }

  /**
   * Plan suivant de la séquence, préparé avant sa coupe (director) : son horloge court déjà (t < 0) ;
   * la recherche de sa première prise (à t = 0) avance d'une tranche par frame.
   */
  prepare(dt: number, sim: SimState, view: GameView, aspect: number, from = 0): void {
    this.t += dt
    if (!this.job || this.job.sim !== sim || Math.abs(this.job.from - from) > 0.05) this.startJob(sim, Math.max(from, this.t), this.kind === 'still' ? 'track' : this.kind, true)
    this.runJob(sim, view, aspect, SLICE, SLICE_MS)
  }

  // ── surveillance ──

  /**
   * true = nouvelle prise maintenant : on arrive au premier défaut prévu de la prise ; ou la prise,
   * resimulée dans son état présent quand l'avenir connu s'allonge, montre un défaut dans moins de
   * 0,6 s ; ou (filet de sécurité) l'image rendue a un défaut depuis 0,1 s.
   */
  private watch(dt: number, sim: SimState, view: GameView, aspect: number, out: Pose): boolean {
    this.checkClock -= dt
    if (this.checkClock <= 0) {
      this.checkClock = CHECK_PERIOD
      predictBirds(sim, view, 0, _now)
      this.lastFault = frameFault(sim, _now, out, aspect, this.layout, this.hideStorm, this.judgeSubject(this.setup, this.t))
      // la prise telle qu'elle est rendue (ressorts à 60 i/s) s'écarte un peu de sa simulation (pas de
      // 0,1 s) : toutes les 0,5 s, elle est resimulée depuis son état présent sur les 1,6 s à venir
      this.recheck -= CHECK_PERIOD
      if (this.recheck <= 0 && this.cleanUntil > this.t) {
        this.recheck = RECHECK
        const until = Math.min(this.cleanUntil, this.t + 1.6)
        const c = this.simulate(sim, view, this.setup, aspect, false, until, FINE_STEP, this.t, this.hideStorm)
        if (c < until - 1e-6) {
          this.cleanUntil = c
          this.job = null
        }
      }
      // l'avenir connu s'est allongé depuis le choix (début de boucle) : on prolonge la validation
      const known = Math.min(this.dur, this.t + demoFuture.horizon(sim, view.alpha))
      if (this.cleanUntil >= this.checkedUntil - 1e-6 && this.checkedUntil < this.dur - 1e-3 && known > this.checkedUntil + 0.5) {
        const c = this.simulate(sim, view, this.setup, aspect, false, known, VERIFY_STEP, this.t, this.hideStorm)
        this.checkedUntil = known
        if (c < known - 1e-6) {
          this.cleanUntil = c
          this.job = null
        }
      }
    }
    if (dt <= 0) return false
    if (this.lastFault) this.faultTime += dt
    else this.faultTime = 0
    if (this.faultTime > 0.1 && this.sinceCut > RECUT_SOON) return true
    // (défaut prévu juste avant la fin du plan et plan suivant prêt : le réalisateur coupe sur lui)
    const handOver = this.nextReady && this.dur - this.cleanUntil < EARLY_END
    if (!handOver && this.cleanUntil < this.dur - 1e-3 && this.t >= this.cleanUntil - CUT_MARGIN && this.sinceCut > RECUT_SOON) return true
    return false
  }
}

/** Séquenceur : enchaîne des plans (coupes franches au titre ; fondus lents aux crédits). */
export interface SequenceEntry {
  kind: ShotKind
  /** Titre : début en fraction du soleil de la démo (u) ; crédits : durée (s). */
  at: number
}

/**
 * Titre (démo de 40 s, nuit à 40 s, rebouclage à 44 s) : ouverture sur un oiseau dans le ciel (le
 * premier plan après le chargement et après chaque rebouclage est un suivi validé), grue qui révèle
 * le sable peint, plan bas de groupe, suivi, plan bas de groupe à l'heure dorée (la vue large qui
 * tournait laissait l'action sous le pied de page et une moitié d'image de sable vide : retirée) ;
 * la boucle finit sur le couchant (le plus beau plan), en deux prises (deux oiseaux).
 */
/** Le plan suivant du titre est préparé pendant ces dernières secondes du plan en cours (s). */
export const TITLE_PREPARE = 2.4

export const TITLE_SEQUENCE: SequenceEntry[] = [
  { kind: 'track', at: 0 },
  { kind: 'crane', at: 0.14 },
  { kind: 'group', at: 0.3 },
  { kind: 'track', at: 0.44 },
  { kind: 'group', at: 0.58 },
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
