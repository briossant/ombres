// Mode Inclinaison (GDD §12.1) : le vecteur d'inclinaison du téléphone donne le cap, mesuré depuis
// la position enregistrée (calibrage au « Prêt » ou par « Recalibrer »). Zone morte 5°, plein effet 20°.
//
// On ne travaille pas directement sur les angles beta/gamma (qui sautent de 180° près de la
// verticale) : on reconstruit le vecteur « haut du monde » dans le repère de l'appareil, continu,
// puis on mesure sa rotation depuis le calibrage, dans le repère de l'écran (qui tourne avec
// l'orientation paysage / portrait).
import { PHONE_RULES } from '../../net/phoneRules.ts'
import { screenAngle } from './screen.ts'

type Vec3 = [number, number, number]
type PermissionFn = () => Promise<'granted' | 'denied' | 'default'>

export type TiltSupport = 'yes' | 'needs-permission' | 'no'

const DEG = Math.PI / 180

/** Vecteur « haut du monde » exprimé dans le repère de l'appareil (x droite, y haut, z hors écran). */
export function upInDevice(betaDeg: number, gammaDeg: number): Vec3 {
  const b = betaDeg * DEG
  const g = gammaDeg * DEG
  return [-Math.sin(g) * Math.cos(b), Math.sin(b), Math.cos(g) * Math.cos(b)]
}

/** Passe du repère de l'appareil au repère de l'écran (orientation en degrés). */
export function deviceToScreen(v: Vec3, angleDeg: number): Vec3 {
  const a = angleDeg * DEG
  const c = Math.cos(a)
  const s = Math.sin(a)
  // droite de l'écran = (cos a, -sin a) ; haut de l'écran = (sin a, cos a) dans le repère appareil.
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]]
}

/** Rotation minimale qui amène `from` sur +z, appliquée à `v` (formule de Rodrigues). */
function alignToZ(from: Vec3, v: Vec3): Vec3 {
  const [fx, fy, fz] = from
  // axe = from × z = (fy, -fx, 0) ; cos = fz
  const ax = fy
  const ay = -fx
  const sin = Math.hypot(ax, ay)
  if (sin < 1e-6) return fz >= 0 ? v : [v[0], -v[1], -v[2]]
  const kx = ax / sin
  const ky = ay / sin
  const cos = fz
  const [x, y, z] = v
  const dot = kx * x + ky * y
  // v cos + (k × v) sin + k (k·v)(1 − cos), avec k = (kx, ky, 0)
  const cx = ky * z
  const cy = -kx * z
  const cz = kx * y - ky * x
  return [x * cos + cx * sin + kx * dot * (1 - cos), y * cos + cy * sin + ky * dot * (1 - cos), z * cos + cz * sin]
}

/**
 * Vecteur de pilotage (repère écran, y > 0 = haut) depuis l'inclinaison.
 * Pencher le bord droit vers le bas → x > 0 ; pencher le haut de l'écran vers l'avant → y > 0.
 * Sous la zone morte : (0, 0). Au-delà : direction unitaire × intensité (≥ 0,25 pour dépasser la
 * zone morte de la simulation, qui ne sert alors qu'à garder le cap).
 */
export function tiltVector(up: Vec3, calib: Vec3): { x: number; y: number; deg: number } {
  const r = alignToZ(calib, up)
  // r est le haut du monde vu depuis la pose calibrée : il penche à l'opposé de l'inclinaison.
  const tx = -r[0]
  const ty = -r[1]
  const m = Math.hypot(tx, ty)
  const deg = Math.asin(Math.min(1, m)) / DEG
  const dz = PHONE_RULES.tiltDeadzoneDeg
  if (deg < dz || m < 1e-6) return { x: 0, y: 0, deg }
  const k = Math.min(1, (deg - dz) / (PHONE_RULES.tiltMaxDeg - dz))
  const mag = 0.25 + 0.75 * k
  return { x: (tx / m) * mag, y: (ty / m) * mag, deg }
}

export function tiltSupport(): TiltSupport {
  if (typeof window === 'undefined' || typeof DeviceOrientationEvent === 'undefined') return 'no'
  const ctor = DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }
  return typeof ctor.requestPermission === 'function' ? 'needs-permission' : 'yes'
}

/** Demande l'autorisation iOS (depuis un geste utilisateur). */
export async function requestTiltPermission(): Promise<boolean> {
  const ctor = DeviceOrientationEvent as unknown as { requestPermission?: PermissionFn }
  if (typeof ctor.requestPermission !== 'function') return tiltSupport() === 'yes'
  try {
    return (await ctor.requestPermission()) === 'granted'
  } catch {
    return false
  }
}

export class TiltController {
  private up: Vec3 | null = null
  private calib: Vec3 | null = null
  private listening = false
  private lastEventAt = 0
  private readonly onOrientation = (e: DeviceOrientationEvent) => {
    if (e.beta === null || e.gamma === null) return
    this.up = deviceToScreen(upInDevice(e.beta, e.gamma), screenAngle())
    this.lastEventAt = performance.now()
    if (!this.calib) this.calib = this.up
    const v = tiltVector(this.up, this.calib)
    this.onVector(v.x, v.y)
  }

  constructor(private readonly onVector: (x: number, y: number) => void) {}

  start(): void {
    if (this.listening || typeof window === 'undefined') return
    this.listening = true
    window.addEventListener('deviceorientation', this.onOrientation)
  }

  stop(): void {
    if (!this.listening) return
    this.listening = false
    window.removeEventListener('deviceorientation', this.onOrientation)
    this.onVector(0, 0)
  }

  /** La position actuelle devient le neutre. */
  calibrate(): void {
    this.calib = this.up
    this.onVector(0, 0)
  }

  /** Des événements arrivent-ils ? (sinon : capteur absent ou autorisation manquante) */
  get alive(): boolean {
    return performance.now() - this.lastEventAt < 1500
  }

  get active(): boolean {
    return this.listening
  }
}
