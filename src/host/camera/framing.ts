// Cadrage « de jeu » (GDD §13.1) : trouver la cible au sol et la distance d'une caméra à
// lacet et tangage donnés pour qu'un nuage de points tienne dans un rectangle de l'écran.
// Pur (sans three), testable. Repère sim : x est, y nord, z altitude.
import { DEG } from './math.ts'

/** Rig « orbital » : cible au sol, lacet, tangage (positif = vers le bas), distance. */
export interface Rig {
  tx: number
  ty: number
  /** Altitude du point visé (0 = sol). */
  tz: number
  yaw: number
  pitch: number
  dist: number
  fov: number
}

export function makeRig(): Rig {
  return { tx: 0, ty: 0, tz: 0, yaw: 0, pitch: 58 * DEG, dist: 400, fov: 40 }
}

export function copyRig(dst: Rig, src: Rig): Rig {
  dst.tx = src.tx
  dst.ty = src.ty
  dst.tz = src.tz
  dst.yaw = src.yaw
  dst.pitch = src.pitch
  dst.dist = src.dist
  dst.fov = src.fov
  return dst
}

/** Rectangle cible en fractions d'écran (0..1, origine en haut à gauche). */
export interface ScreenRect {
  x0: number
  x1: number
  y0: number
  y1: number
}

export interface FitResult {
  tx: number
  ty: number
  dist: number
  /** Largeur cadrée (m) à la profondeur de la cible. */
  width: number
}

/**
 * Base de la caméra (repère sim, z haut) pour un lacet/tangage : avant f, droite r, haut u.
 * Lacet 0 = regarde le nord (+y sim).
 */
function basis(yaw: number, pitch: number, o: Float64Array): void {
  const cy = Math.cos(yaw)
  const sy = Math.sin(yaw)
  const cp = Math.cos(pitch)
  const sp = Math.sin(pitch)
  // avant (sim) : lacet three ψ → direction horizontale sim (−sin ψ, cos ψ)
  o[0] = -sy * cp
  o[1] = cy * cp
  o[2] = -sp
  // droite
  o[3] = cy
  o[4] = sy
  o[5] = 0
  // haut = droite × avant (repère direct : x est, y nord, z haut)
  o[6] = o[4] * o[2] - o[5] * o[1]
  o[7] = o[5] * o[0] - o[3] * o[2]
  o[8] = o[3] * o[1] - o[4] * o[0]
}

const B = new Float64Array(9)

/**
 * Ajuste (tx, ty, dist) pour que les `count` points (x, y, z) de `pts` tiennent dans `rect`,
 * pour un lacet, un tangage (> 0, vers le bas), un FOV vertical (°) et un rapport d'aspect.
 * Résolution exacte en perspective : chaque bord du rectangle est un plan passant par la
 * caméra ; on place la caméra au plus près des points sous ces quatre contraintes (l'axe
 * non limitant est centré), puis on borne la distance à [minDist, maxDist].
 */
export function fitPoints(
  pts: Float64Array,
  count: number,
  yaw: number,
  pitch: number,
  fovDeg: number,
  aspect: number,
  rect: ScreenRect,
  minDist: number,
  maxDist: number,
  out: FitResult,
): FitResult {
  basis(yaw, pitch, B)
  const tanV = Math.tan((fovDeg * DEG) / 2)
  const tanH = tanV * aspect
  // bords du rectangle en NDC (y vers le haut), en pente (tan)
  const xl = (rect.x0 * 2 - 1) * tanH
  const xr = (rect.x1 * 2 - 1) * tanH
  const yb = (1 - rect.y1 * 2) * tanV
  const yt = (1 - rect.y0 * 2) * tanV
  let mL = Infinity
  let mR = Infinity
  let mB = Infinity
  let mT = Infinity
  for (let i = 0; i < count; i++) {
    const px = pts[i * 3]!
    const py = pts[i * 3 + 1]!
    const pz = pts[i * 3 + 2]!
    const pf = px * B[0]! + py * B[1]! + pz * B[2]!
    const pr = px * B[3]! + py * B[4]! + pz * B[5]!
    const pu = px * B[6]! + py * B[7]! + pz * B[8]!
    mL = Math.min(mL, pr - xl * pf)
    mR = Math.min(mR, xr * pf - pr)
    mB = Math.min(mB, pu - yb * pf)
    mT = Math.min(mT, yt * pf - pu)
  }
  const sinP = Math.sin(pitch)
  if (count === 0 || !Number.isFinite(mL)) {
    out.tx = 0
    out.ty = 0
    out.dist = Math.max(minDist, Math.min(maxDist, (minDist + maxDist) / 2))
    out.width = 2 * out.dist * tanH
    return out
  }
  // position de la caméra dans la base (droite, haut, avant) : cf le long de l'avant
  const cfx = (mL + mR) / (xr - xl)
  const cfy = (mB + mT) / (yt - yb)
  const cf = Math.min(cfx, cfy)
  // intervalles admis sur les deux axes transverses : on centre
  const cr = (mL + xl * cf + (xr * cf - mR)) / 2
  const cu = (mB + yb * cf + (yt * cf - mT)) / 2
  let cx = cr * B[3]! + cu * B[6]! + cf * B[0]!
  let cy = cr * B[4]! + cu * B[7]! + cf * B[1]!
  let cz = cr * B[5]! + cu * B[8]! + cf * B[2]!
  // cible = intersection de l'axe de visée avec le sol (z = 0) ; distance bornée
  let dist = sinP > 1e-3 ? cz / sinP : 400
  const tx = cx + B[0]! * dist
  const ty = cy + B[1]! * dist
  const d2 = Math.max(minDist, Math.min(maxDist, dist))
  if (d2 !== dist) {
    dist = d2
    cx = tx - B[0]! * dist
    cy = ty - B[1]! * dist
    cz = -B[2]! * dist
  }
  void cz
  out.tx = tx
  out.ty = ty
  out.dist = dist
  out.width = 2 * dist * tanH
  return out
}

/** Distance pour une largeur cadrée donnée (à la profondeur de la cible). */
export function distForWidth(width: number, fovDeg: number, aspect: number): number {
  return width / (2 * Math.tan((fovDeg * DEG) / 2) * aspect)
}
