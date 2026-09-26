// Outils de la caméra : ressorts critiques, poses, bases de vue, garde-fous (sol, tours).
// Repère three : (x, y, z) = (sim.x, altitude, −sim.y). Aucune allocation dans les boucles.
import * as THREE from 'three'
import { towerRadiusAt } from '../../sim/maps.ts'
import type { TowerDef } from '../../sim/types.ts'

export const DEG = Math.PI / 180
export const clamp = (x: number, a: number, b: number) => (x < a ? a : x > b ? b : x)
export const clamp01 = (x: number) => clamp(x, 0, 1)
export const lerp = (a: number, b: number, k: number) => a + (b - a) * k
export const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}
/** Lissage « cinéma » : départ et arrivée sans à-coup (dérivées 1 et 2 nulles). */
export const smoother = (t: number) => {
  const x = clamp01(t)
  return x * x * x * (x * (x * 6 - 15) + 10)
}
export const easeOutCubic = (t: number) => 1 - Math.pow(1 - clamp01(t), 3)
/** Angle ramené dans ]−π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % (2 * Math.PI)
  if (a < 0) a += 2 * Math.PI
  return a - Math.PI
}

/**
 * Ressort critique amorti (solution exacte, stable pour tout dt) : pas de dépassement,
 * vitesse continue. `omega` en rad/s (temps de réponse ≈ 4 / ω).
 */
export class Spring {
  x = 0
  v = 0
  step(target: number, omega: number, dt: number): number {
    if (dt <= 0) return this.x
    const delta = this.x - target
    const tmp = (this.v + omega * delta) * dt
    const e = Math.exp(-omega * dt)
    this.x = target + (delta + tmp) * e
    this.v = (this.v - omega * tmp) * e
    return this.x
  }
  /** Idem pour un angle (le plus court chemin). */
  stepAngle(target: number, omega: number, dt: number): number {
    const t = this.x + wrapAngle(target - this.x)
    return this.step(t, omega, dt)
  }
  snap(x: number): void {
    this.x = x
    this.v = 0
  }
}

export interface Pose {
  pos: THREE.Vector3
  quat: THREE.Quaternion
  fov: number
}

export function makePose(): Pose {
  return { pos: new THREE.Vector3(0, 260, 230), quat: new THREE.Quaternion(), fov: 40 }
}

export function copyPose(dst: Pose, src: Pose): Pose {
  dst.pos.copy(src.pos)
  dst.quat.copy(src.quat)
  dst.fov = src.fov
  return dst
}

const _e = new THREE.Euler(0, 0, 0, 'YXZ')
/**
 * Orientation depuis un lacet (0 = regarde le nord = −z three ; +90° = l'ouest) et un
 * tangage (positif = vers le bas). Pas de singularité en vue verticale (nord en haut).
 */
export function yawPitchQuat(out: THREE.Quaternion, yaw: number, pitch: number): THREE.Quaternion {
  _e.set(-pitch, yaw, 0, 'YXZ')
  return out.setFromEuler(_e)
}

/** Lacet three d'une direction horizontale sim (dx est, dy nord). */
export const yawOfDir = (dx: number, dy: number) => Math.atan2(-dx, dy)

/** Direction de visée (three) pour un lacet et un tangage. */
export function forwardOf(yaw: number, pitch: number, out: THREE.Vector3): THREE.Vector3 {
  const cp = Math.cos(pitch)
  return out.set(-Math.sin(yaw) * cp, -Math.sin(pitch), -Math.cos(yaw) * cp)
}

const _m = new THREE.Matrix4()
const _up = new THREE.Vector3(0, 1, 0)
/** Orientation « regarde vers » (up = +Y). */
export function lookQuat(out: THREE.Quaternion, from: THREE.Vector3, to: THREE.Vector3): THREE.Quaternion {
  _m.lookAt(from, to, _up)
  return out.setFromRotationMatrix(_m)
}

/**
 * Place la caméra pour que `subject` (three) apparaisse au point d'écran (sx, sy)
 * (0..1, origine en haut à gauche), à la distance `dist`, avec l'orientation `quat`.
 */
export function placeForSubject(
  out: THREE.Vector3,
  subject: THREE.Vector3,
  quat: THREE.Quaternion,
  fovDeg: number,
  aspect: number,
  sx: number,
  sy: number,
  dist: number,
): THREE.Vector3 {
  const tv = Math.tan((fovDeg * DEG) / 2)
  const th = tv * aspect
  out.set((sx * 2 - 1) * th, (1 - sy * 2) * tv, -1).normalize().applyQuaternion(quat)
  return out.multiplyScalar(-dist).add(subject)
}

/** Interpolation de poses : position (avec arc vertical facultatif), orientation (slerp), FOV. */
export function blendPose(out: Pose, a: Pose, b: Pose, k: number, arc = 0): Pose {
  out.pos.lerpVectors(a.pos, b.pos, k)
  if (arc > 0) out.pos.y += arc * Math.sin(Math.PI * clamp01(k))
  out.quat.slerpQuaternions(a.quat, b.quat, k)
  out.fov = lerp(a.fov, b.fov, k)
  return out
}

/** Distance entre deux poses (m + équivalent angulaire), pour choisir la durée d'un fondu. */
export function poseDistance(a: Pose, b: Pose): number {
  return a.pos.distanceTo(b.pos) + a.quat.angleTo(b.quat) * 60
}

/**
 * Garde-fous : jamais sous le sol (plus haut hors de l'arène, où il y a des dunes), jamais
 * dans une tour (poussée radiale hors du fût, marge `margin`).
 * @param arena demi-axes de l'arène (dunes au-delà de 1,5 × le rayon elliptique)
 */
export function guardPosition(pos: THREE.Vector3, towers: readonly TowerDef[] | null, arena: { a: number; b: number } | null, margin = 3): void {
  let minY = 2.5
  if (arena) {
    const rho = Math.hypot(pos.x / arena.a, pos.z / arena.b)
    minY = lerp(2.5, 14, smoothstep(1.15, 1.6, rho))
  }
  if (pos.y < minY) pos.y = minY
  if (!towers) return
  for (const t of towers) {
    if (pos.y > t.height + margin) continue
    const dx = pos.x - t.x
    const dz = pos.z + t.y
    const d = Math.hypot(dx, dz)
    const r = towerRadiusAt(t.segments, Math.max(0, pos.y)) + margin
    if (d < r) {
      if (d < 1e-3) {
        pos.x = t.x + r
      } else {
        pos.x = t.x + (dx / d) * r
        pos.z = -t.y + (dz / d) * r
      }
    }
  }
}

const _ray = new THREE.Vector3()
const _corners = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
] as const
/**
 * Cadre visible au sol (repère sim) : boîte englobante des points où les rayons des coins
 * de l'écran touchent le sol (bornés à `maxDist` m quand ils passent au-dessus de l'horizon).
 */
export function groundFrame(camera: THREE.PerspectiveCamera, out: { x: number; y: number; halfWidth: number; halfHeight: number }, maxDist = 700): void {
  let x0 = Infinity
  let x1 = -Infinity
  let y0 = Infinity
  let y1 = -Infinity
  const p = camera.position
  for (const [cx, cy] of _corners) {
    _ray.set(cx, cy, 0.5).unproject(camera).sub(p).normalize()
    let t = maxDist
    if (_ray.y < -1e-4) t = Math.min(maxDist, p.y / -_ray.y)
    const gx = p.x + _ray.x * t
    const gy = -(p.z + _ray.z * t)
    if (gx < x0) x0 = gx
    if (gx > x1) x1 = gx
    if (gy < y0) y0 = gy
    if (gy > y1) y1 = gy
  }
  out.x = (x0 + x1) / 2
  out.y = (y0 + y1) / 2
  out.halfWidth = Math.max(1, (x1 - x0) / 2)
  out.halfHeight = Math.max(1, (y1 - y0) / 2)
}
