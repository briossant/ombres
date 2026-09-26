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
 * Un nuage de points à faire tenir dans un rectangle d'écran. `ext` (facultatif) donne, par
 * point, ses demi-étendues monde (m) le long des axes de la caméra : [côtés, haut, bas] ; un
 * oiseau devient ainsi une boîte (envergure, couronne, étiquette) et plus un simple point.
 * Exact en perspective : une étendue parallèle au plan de l'image se projette en e / profondeur.
 */
export interface FitSet {
  pts: Float64Array
  count: number
  rect: ScreenRect
  ext?: Float64Array | null
  /**
   * Sujet seulement : placement vertical quand il ne remplit pas la hauteur de son rectangle
   * (0 = contre le haut, 0,5 = centré, défaut ; 1 = contre le bas).
   */
  alignY?: number
}

export interface SetsFitResult extends FitResult {
  /** Glissement admis de la cible vers la droite / la gauche de l'écran (m), tous rectangles tenus. */
  slackRight: number
  slackLeft: number
}

export function makeSetsFit(): SetsFitResult {
  return { tx: 0, ty: 0, dist: 0, width: 0, slackRight: 0, slackLeft: 0 }
}

// marges par ensemble (réutilisées : aucune allocation par frame)
const MAX_SETS = 4
const S_L = new Float64Array(MAX_SETS)
const S_R = new Float64Array(MAX_SETS)
const S_B = new Float64Array(MAX_SETS)
const S_T = new Float64Array(MAX_SETS)
const S_XL = new Float64Array(MAX_SETS)
const S_XR = new Float64Array(MAX_SETS)
const S_YB = new Float64Array(MAX_SETS)
const S_YT = new Float64Array(MAX_SETS)
const S_ON = new Uint8Array(MAX_SETS)

/**
 * Cadrage conjoint de plusieurs ensembles, chacun dans son rectangle (au plus 4). Le premier
 * ensemble non vide est le sujet : il est centré dans son rectangle quand les autres le
 * permettent ; les autres sont des contraintes dures (ils tiennent toujours dans le leur).
 *
 * Chaque bord de rectangle est un plan passant par la caméra. En notant (cr, cu, cf) la
 * position de la caméra dans la base (droite, haut, avant), un point p tient dans le rectangle
 * k si cr − xl_k·cf ≤ mL_k et xr_k·cf − cr ≤ mR_k (idem en hauteur). Deux ensembles j, k sont
 * compatibles tant que (xr_k − xl_j)·cf ≤ mL_j + mR_k : la caméra la plus proche admise est le
 * minimum de ces bornes, puis la position transverse est celle du sujet ramenée dans
 * l'intersection des intervalles (toujours non vide à ce cf). La distance est enfin bornée à
 * [minDist, maxDist] en reculant le long de l'axe (les points convergent vers le centre de
 * l'écran, qui appartient à tous les rectangles utilisés).
 */
export function fitSets(
  sets: readonly FitSet[],
  yaw: number,
  pitch: number,
  fovDeg: number,
  aspect: number,
  minDist: number,
  maxDist: number,
  out: SetsFitResult,
): SetsFitResult {
  basis(yaw, pitch, B)
  const tanV = Math.tan((fovDeg * DEG) / 2)
  const tanH = tanV * aspect
  const nSets = Math.min(MAX_SETS, sets.length)
  let primary = -1
  for (let k = 0; k < nSets; k++) {
    const s = sets[k]!
    const rect = s.rect
    // bords du rectangle en NDC (y vers le haut), en pente (tan)
    const xl = (S_XL[k] = (rect.x0 * 2 - 1) * tanH)
    const xr = (S_XR[k] = (rect.x1 * 2 - 1) * tanH)
    const yb = (S_YB[k] = (1 - rect.y1 * 2) * tanV)
    const yt = (S_YT[k] = (1 - rect.y0 * 2) * tanV)
    let mL = Infinity
    let mR = Infinity
    let mB = Infinity
    let mT = Infinity
    const P = s.pts
    const E = s.ext
    for (let i = 0; i < s.count; i++) {
      const px = P[i * 3]!
      const py = P[i * 3 + 1]!
      const pz = P[i * 3 + 2]!
      const pf = px * B[0]! + py * B[1]! + pz * B[2]!
      const pr = px * B[3]! + py * B[4]! + pz * B[5]!
      const pu = px * B[6]! + py * B[7]! + pz * B[8]!
      const es = E ? E[i * 3]! : 0
      const et = E ? E[i * 3 + 1]! : 0
      const eb = E ? E[i * 3 + 2]! : 0
      mL = Math.min(mL, pr - es - xl * pf)
      mR = Math.min(mR, xr * pf - (pr + es))
      mB = Math.min(mB, pu - eb - yb * pf)
      mT = Math.min(mT, yt * pf - (pu + et))
    }
    S_L[k] = mL
    S_R[k] = mR
    S_B[k] = mB
    S_T[k] = mT
    S_ON[k] = s.count > 0 && Number.isFinite(mL) ? 1 : 0
    if (S_ON[k] && primary < 0) primary = k
  }
  out.slackRight = out.slackLeft = 0
  const sinP = Math.sin(pitch)
  if (primary < 0) {
    out.tx = 0
    out.ty = 0
    out.dist = Math.max(minDist, Math.min(maxDist, (minDist + maxDist) / 2))
    out.width = 2 * out.dist * tanH
    return out
  }
  // caméra la plus proche compatible avec toutes les paires d'ensembles
  let cf = Infinity
  for (let k = 0; k < nSets; k++) {
    if (!S_ON[k]) continue
    for (let j = 0; j < nSets; j++) {
      if (!S_ON[j]) continue
      cf = Math.min(cf, (S_L[j]! + S_R[k]!) / (S_XR[k]! - S_XL[j]!), (S_B[j]! + S_T[k]!) / (S_YT[k]! - S_YB[j]!))
    }
  }
  // intersection des intervalles transverses à ce cf
  let loR = -Infinity
  let hiR = Infinity
  let loU = -Infinity
  let hiU = Infinity
  for (let k = 0; k < nSets; k++) {
    if (!S_ON[k]) continue
    loR = Math.max(loR, S_XR[k]! * cf - S_R[k]!)
    hiR = Math.min(hiR, S_L[k]! + S_XL[k]! * cf)
    loU = Math.max(loU, S_YT[k]! * cf - S_T[k]!)
    hiU = Math.min(hiU, S_B[k]! + S_YB[k]! * cf)
  }
  const p = primary
  // le sujet centré dans son propre rectangle, ramené dans l'intervalle commun
  const cr = clampI((S_XR[p]! * cf - S_R[p]! + S_L[p]! + S_XL[p]! * cf) / 2, loR, hiR)
  const al = sets[p]!.alignY ?? 0.5
  const cu = clampI(S_YT[p]! * cf - S_T[p]! + (S_B[p]! + S_YB[p]! * cf - (S_YT[p]! * cf - S_T[p]!)) * al, loU, hiU)
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
  out.tx = tx
  out.ty = ty
  out.dist = dist
  out.width = 2 * dist * tanH
  // glissements latéraux admis à la position finale (la caméra glisse le long de « droite »)
  const fcf = cx * B[0]! + cy * B[1]! + cz * B[2]!
  let slR = Infinity
  let slL = Infinity
  for (let k = 0; k < nSets; k++) {
    if (!S_ON[k]) continue
    // marge gauche du rectangle k : (pr − e − cr) − xl·(pf − cf) = mL + xl·cf − cr (au pire point)
    slR = Math.min(slR, S_L[k]! + S_XL[k]! * fcf - cr)
    slL = Math.min(slL, cr - (S_XR[k]! * fcf - S_R[k]!))
  }
  out.slackRight = Math.max(0, slR)
  out.slackLeft = Math.max(0, slL)
  return out
}

/**
 * Ramène un rig (cible, distance ; lacet, tangage et FOV inchangés) au plus près de lui-même pour
 * que tous les ensembles tiennent dans leurs rectangles : recul si la caméra est trop proche, puis
 * glissement latéral minimal. Continu en la position de départ : sert de garde-fou dur derrière des
 * ressorts (le retard des ressorts ne fait plus sortir un oiseau du cadre). Renvoie vrai si modifié.
 */
export function clampRigToSets(r: Rig, sets: readonly FitSet[], aspect: number): boolean {
  basis(r.yaw, r.pitch, B)
  const tanV = Math.tan((r.fov * DEG) / 2)
  const tanH = tanV * aspect
  const nSets = Math.min(MAX_SETS, sets.length)
  let any = false
  for (let k = 0; k < nSets; k++) {
    const s = sets[k]!
    const rect = s.rect
    const xl = (S_XL[k] = (rect.x0 * 2 - 1) * tanH)
    const xr = (S_XR[k] = (rect.x1 * 2 - 1) * tanH)
    const yb = (S_YB[k] = (1 - rect.y1 * 2) * tanV)
    const yt = (S_YT[k] = (1 - rect.y0 * 2) * tanV)
    let mL = Infinity
    let mR = Infinity
    let mB = Infinity
    let mT = Infinity
    const P = s.pts
    const E = s.ext
    for (let i = 0; i < s.count; i++) {
      const px = P[i * 3]!
      const py = P[i * 3 + 1]!
      const pz = P[i * 3 + 2]!
      const pf = px * B[0]! + py * B[1]! + pz * B[2]!
      const pr = px * B[3]! + py * B[4]! + pz * B[5]!
      const pu = px * B[6]! + py * B[7]! + pz * B[8]!
      const es = E ? E[i * 3]! : 0
      const et = E ? E[i * 3 + 1]! : 0
      const eb = E ? E[i * 3 + 2]! : 0
      mL = Math.min(mL, pr - es - xl * pf)
      mR = Math.min(mR, xr * pf - (pr + es))
      mB = Math.min(mB, pu - eb - yb * pf)
      mT = Math.min(mT, yt * pf - (pu + et))
    }
    S_L[k] = mL
    S_R[k] = mR
    S_B[k] = mB
    S_T[k] = mT
    S_ON[k] = s.count > 0 && Number.isFinite(mL) ? 1 : 0
    if (S_ON[k]) any = true
  }
  if (!any) return false
  // caméra actuelle dans la base
  const cx0 = r.tx - B[0]! * r.dist
  const cy0 = r.ty - B[1]! * r.dist
  const cz0 = r.tz - B[2]! * r.dist
  let cr = cx0 * B[3]! + cy0 * B[4]! + cz0 * B[5]!
  let cu = cx0 * B[6]! + cy0 * B[7]! + cz0 * B[8]!
  let cf = cx0 * B[0]! + cy0 * B[1]! + cz0 * B[2]!
  let cfMax = Infinity
  for (let k = 0; k < nSets; k++) {
    if (!S_ON[k]) continue
    for (let j = 0; j < nSets; j++) {
      if (!S_ON[j]) continue
      cfMax = Math.min(cfMax, (S_L[j]! + S_R[k]!) / (S_XR[k]! - S_XL[j]!), (S_B[j]! + S_T[k]!) / (S_YT[k]! - S_YB[j]!))
    }
  }
  // tolérance (m) : un rig posé exactement sur une frontière (sortie de fitSets) n'est pas touché
  const eps = 1e-6 * (1 + Math.abs(cf))
  let changed = false
  if (cf > cfMax + eps) {
    cf = cfMax
    changed = true
  }
  let loR = -Infinity
  let hiR = Infinity
  let loU = -Infinity
  let hiU = Infinity
  for (let k = 0; k < nSets; k++) {
    if (!S_ON[k]) continue
    loR = Math.max(loR, S_XR[k]! * cf - S_R[k]!)
    hiR = Math.min(hiR, S_L[k]! + S_XL[k]! * cf)
    loU = Math.max(loU, S_YT[k]! * cf - S_T[k]!)
    hiU = Math.min(hiU, S_B[k]! + S_YB[k]! * cf)
  }
  if (cr < loR - eps || cr > hiR + eps) {
    cr = cr < loR ? loR : hiR
    changed = true
  }
  if (cu < loU - eps || cu > hiU + eps) {
    cu = cu < loU ? loU : hiU
    changed = true
  }
  if (!changed) return false
  const cx = cr * B[3]! + cu * B[6]! + cf * B[0]!
  const cy = cr * B[4]! + cu * B[7]! + cf * B[1]!
  const cz = cr * B[5]! + cu * B[8]! + cf * B[2]!
  const sinP = -B[2]!
  if (sinP < 1e-3) return false
  const dist = (cz - r.tz) / sinP
  r.tx = cx + B[0]! * dist
  r.ty = cy + B[1]! * dist
  r.dist = dist
  return true
}

/** v ramené dans [lo, hi] (milieu si l'intervalle est vide, par arrondi). */
function clampI(v: number, lo: number, hi: number): number {
  return lo > hi ? (lo + hi) / 2 : v < lo ? lo : v > hi ? hi : v
}

const _one: FitSet[] = [{ pts: new Float64Array(0), count: 0, rect: { x0: 0, x1: 1, y0: 0, y1: 1 }, ext: null, alignY: 0.5 }]
const _oneOut = makeSetsFit()

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
  const s = _one[0]!
  s.pts = pts
  s.count = count
  s.rect = rect
  s.ext = null
  fitSets(_one, yaw, pitch, fovDeg, aspect, minDist, maxDist, _oneOut)
  out.tx = _oneOut.tx
  out.ty = _oneOut.ty
  out.dist = _oneOut.dist
  out.width = _oneOut.width
  return out
}

/**
 * Point d'écran (fractions, origine en haut à gauche) d'un point monde (repère sim) vu par un
 * rig ; `out.z` = profondeur le long de l'axe (≤ 0 : derrière la caméra). Pur, sans three.
 */
export function projectRig(r: Rig, aspect: number, x: number, y: number, z: number, out: { x: number; y: number; z: number }): { x: number; y: number; z: number } {
  basis(r.yaw, r.pitch, B)
  const tanV = Math.tan((r.fov * DEG) / 2)
  const tanH = tanV * aspect
  // caméra = cible − avant × distance
  const cx = r.tx - B[0]! * r.dist
  const cy = r.ty - B[1]! * r.dist
  const cz = r.tz - B[2]! * r.dist
  const dx = x - cx
  const dy = y - cy
  const dz = z - cz
  const f = dx * B[0]! + dy * B[1]! + dz * B[2]!
  const rr = dx * B[3]! + dy * B[4]! + dz * B[5]!
  const u = dx * B[6]! + dy * B[7]! + dz * B[8]!
  const d = Math.max(1e-3, f)
  out.x = (rr / d / tanH + 1) / 2
  out.y = (1 - u / d / tanV) / 2
  out.z = f
  return out
}

/** Distance pour une largeur cadrée donnée (à la profondeur de la cible). */
export function distForWidth(width: number, fovDeg: number, aspect: number): number {
  return width / (2 * Math.tan((fovDeg * DEG) / 2) * aspect)
}
