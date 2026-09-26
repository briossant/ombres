// Encombrement de l'image par les tours (polish S3, S4) : part d'un rectangle d'écran couverte par
// la silhouette des tours, largeur de la plus grosse, tour trop proche, rideau du Simoun trop proche.
// Pur (sans three) : la projection est fournie par l'appelant (rig de jeu ou pose de cinéma).
// Repère sim : x est, y nord, z altitude.
import type { SimState } from '../../sim/types.ts'
import type { ScreenRect } from './framing.ts'

export const FULL_SCREEN: ScreenRect = { x0: 0, x1: 1, y0: 0, y1: 1 }

/** Projette un point sim en fractions d'écran (origine en haut à gauche) ; `out.z` = profondeur le long de l'axe (m). */
export type Projector = (x: number, y: number, z: number, out: { x: number; y: number; z: number }) => void

const COV_W = 48
const COV_H = 27
const covStamp = new Uint32Array(COV_W * COV_H)
let covId = 0
const _a = { x: 0, y: 0, z: 0 }
const _b = { x: 0, y: 0, z: 0 }

/** Largeur (fraction de l'écran) de la plus grosse tour à la dernière mesure de towerCover. */
export const towerCoverStats = { maxWidth: 0 }

/**
 * Part de `rect` (0..1) couverte par les parties de tours au-dessus de `minZ` m. Chaque tronc de
 * cône (ou disque) est projeté en une suite d'ellipses entre ses deux sections (demi-axe
 * horizontal r/d, vertical r·sin θ/d pour une section horizontale vue sous θ), union rastérisée
 * sur une grille de 48 × 27 cellules sur l'écran entier : les recouvrements ne comptent qu'une
 * fois. Met aussi à jour towerCoverStats.maxWidth (largeur écran de la plus large des tours).
 */
export function towerCover(
  sim: SimState,
  camX: number,
  camY: number,
  camZ: number,
  project: Projector,
  tanH: number,
  tanV: number,
  minZ: number,
  rect: ScreenRect,
  /** Seules les tours à moins de cette distance horizontale (m) comptent pour maxWidth (premier plan). */
  widthMaxDist = Infinity,
  /** Seules les tours à moins de cette distance horizontale (m) comptent pour la couverture. */
  coverMaxDist = Infinity,
): number {
  covId = (covId + 1) >>> 0 || 1
  let covered = 0
  let total = 0
  let maxW = 0
  const ri0 = Math.max(0, Math.floor(rect.x0 * COV_W))
  const ri1 = Math.min(COV_W - 1, Math.ceil(rect.x1 * COV_W) - 1)
  const rj0 = Math.max(0, Math.floor(rect.y0 * COV_H))
  const rj1 = Math.min(COV_H - 1, Math.ceil(rect.y1 * COV_H) - 1)
  total = Math.max(1, (ri1 - ri0 + 1) * (rj1 - rj0 + 1))
  for (const t of sim.towers) {
    if (t.height <= minZ) continue
    if (coverMaxDist < Infinity && Math.hypot(t.x - camX, t.y - camY) > coverMaxDist) continue
    let tMinX = Infinity
    let tMaxX = -Infinity
    for (const g of t.segments) {
      if (g.z1 <= minZ) continue
      const z0 = Math.max(g.z0, minZ)
      const k0 = g.z1 > g.z0 ? (z0 - g.z0) / (g.z1 - g.z0) : 0
      const r0 = g.z1 > g.z0 ? g.r0 + (g.r1 - g.r0) * k0 : Math.max(g.r0, g.r1)
      const r1 = g.z1 > g.z0 ? g.r1 : r0
      const ox0 = (g.ox0 ?? 0) + ((g.ox1 ?? 0) - (g.ox0 ?? 0)) * k0
      const oy0 = (g.oy0 ?? 0) + ((g.oy1 ?? 0) - (g.oy0 ?? 0)) * k0
      const x0 = t.x + ox0
      const y0 = t.y + oy0
      const x1 = t.x + (g.ox1 ?? 0)
      const y1 = t.y + (g.oy1 ?? 0)
      project(x0, y0, z0, _a)
      project(x1, y1, g.z1, _b)
      if (_a.z < 2 || _b.z < 2) continue
      // demi-axes des sections (fractions d'écran)
      const ax0 = r0 / _a.z / (2 * tanH)
      const ax1 = r1 / _b.z / (2 * tanH)
      const ay0 = (r0 * sinDepression(camX, camY, camZ, x0, y0, z0)) / _a.z / (2 * tanV)
      const ay1 = (r1 * sinDepression(camX, camY, camZ, x1, y1, g.z1)) / _b.z / (2 * tanV)
      const minX = Math.min(_a.x - ax0, _b.x - ax1)
      const maxX = Math.max(_a.x + ax0, _b.x + ax1)
      const minY = Math.min(_a.y - ay0, _b.y - ay1)
      const maxY = Math.max(_a.y + ay0, _b.y + ay1)
      if (maxX < 0 || minX > 1 || maxY < 0 || minY > 1) continue
      tMinX = Math.min(tMinX, Math.max(0, minX))
      tMaxX = Math.max(tMaxX, Math.min(1, maxX))
      const i0 = Math.max(ri0, Math.floor(minX * COV_W))
      const i1 = Math.min(ri1, Math.floor(maxX * COV_W))
      const j0 = Math.max(rj0, Math.floor(minY * COV_H))
      const j1 = Math.min(rj1, Math.floor(maxY * COV_H))
      if (i0 > i1 || j0 > j1) continue
      const sx = _b.x - _a.x
      const sy = _b.y - _a.y
      const len2 = sx * sx + sy * sy
      for (let j = j0; j <= j1; j++) {
        const cy = (j + 0.5) / COV_H
        for (let i = i0; i <= i1; i++) {
          const idx = j * COV_W + i
          if (covStamp[idx] === covId) continue
          const cx = (i + 0.5) / COV_W
          // section la plus proche le long du tronc projeté
          let u = len2 > 1e-12 ? ((cx - _a.x) * sx + (cy - _a.y) * sy) / len2 : 0
          u = u < 0 ? 0 : u > 1 ? 1 : u
          const ex = ax0 + (ax1 - ax0) * u
          const ey = Math.max(ay0 + (ay1 - ay0) * u, 1e-4)
          const dx = (cx - (_a.x + sx * u)) / ex
          const dy = (cy - (_a.y + sy * u)) / ey
          if (dx * dx + dy * dy <= 1) {
            covStamp[idx] = covId
            covered++
          }
        }
      }
    }
    if (tMaxX > tMinX && Math.hypot(t.x - camX, t.y - camY) < widthMaxDist) maxW = Math.max(maxW, tMaxX - tMinX)
  }
  towerCoverStats.maxWidth = maxW
  return covered / total
}

/** sin de l'angle sous lequel on voit une section horizontale (1 = vue de dessus). */
function sinDepression(cx: number, cy: number, cz: number, x: number, y: number, z: number): number {
  const dh = Math.hypot(x - cx, y - cy)
  const dz = Math.abs(cz - z)
  return Math.max(0.08, dz / Math.max(1e-3, Math.hypot(dh, dz)))
}

/**
 * Distance (m, horizontale) de la caméra à la tour la plus proche dont une partie est dans le champ
 * horizontal (lacet `heading` sim : direction de visée (hx, hy), demi-angle `halfH`). Infinity si aucune.
 */
export function nearestTowerInView(sim: SimState, camX: number, camY: number, hx: number, hy: number, halfH: number): number {
  let best = Infinity
  const hl = Math.hypot(hx, hy) || 1
  const fx = hx / hl
  const fy = hy / hl
  for (const t of sim.towers) {
    let rMax = 0
    for (const g of t.segments) rMax = Math.max(rMax, g.r0, g.r1)
    const dx = t.x - camX
    const dy = t.y - camY
    const d = Math.hypot(dx, dy)
    const along = (dx * fx + dy * fy) / Math.max(1e-3, d)
    const ang = Math.acos(Math.max(-1, Math.min(1, along)))
    const half = d <= rMax ? Math.PI : Math.asin(Math.min(1, rMax / d))
    if (ang - half > halfH) continue
    best = Math.min(best, Math.max(0, d - rMax))
  }
  return best
}

/**
 * Distance (m) au rideau du Simoun (bord de l'arène, ρ = 1) le long de trois directions horizontales
 * du champ (centre et bords) ; 0 si la caméra est déjà dehors et regarde vers l'arène.
 */
export function stormDistanceInView(sim: SimState, camX: number, camY: number, hx: number, hy: number, halfH: number): number {
  const a = sim.arena.a
  const b = sim.arena.b
  const base = Math.atan2(hy, hx)
  let best = Infinity
  const inside = (camX / a) ** 2 + (camY / b) ** 2 <= 1
  if (!inside) return 0
  for (let k = -1; k <= 1; k++) {
    const off = k * halfH
    const dx = Math.cos(base + off)
    const dy = Math.sin(base + off)
    // (camX + t dx)²/a² + (camY + t dy)²/b² = 1, t > 0
    const A = (dx * dx) / (a * a) + (dy * dy) / (b * b)
    const B = 2 * ((camX * dx) / (a * a) + (camY * dy) / (b * b))
    const C = (camX * camX) / (a * a) + (camY * camY) / (b * b) - 1
    const disc = B * B - 4 * A * C
    if (disc < 0) continue
    const t = (-B + Math.sqrt(disc)) / (2 * A)
    if (t > 0) best = Math.min(best, t)
  }
  return best
}
