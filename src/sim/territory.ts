// Grille de territoire (GDD §4.2, §6.2) : 512 × 352 cellules sur le rectangle
// englobant l'ellipse. Rastérisation exacte par lignes (les formes balayées sont
// convexes : une ligne les coupe en un seul intervalle), sans allocation.

import { RULES } from './rules.ts'
import type { DirtyRect, TerritoryGrid, TowerDef } from './types.ts'
import { hullRowInterval, type ShadowHull } from './towers.ts'

/** Grille complète (champs d'ajout toujours présents). */
export type Grid = TerritoryGrid & { dirty: DirtyRect; frozenVersion: number }

/** Crée la grille d'une arène (a, b) : cellules comptées = centre dans l'ellipse, hors du pied des tours. */
export function createGrid(a: number, b: number, towers: readonly TowerDef[]): Grid {
  const cols = RULES.gridCols
  const rows = RULES.gridRows
  const n = cols * rows
  const cellW = (2 * a) / cols
  const cellH = (2 * b) / rows
  const inArena = new Uint8Array(n)
  // ellipse : intervalle de colonnes par ligne
  for (let j = 0; j < rows; j++) {
    const y = -b + (j + 0.5) * cellH
    const q = 1 - (y / b) * (y / b)
    if (q < 0) continue
    const w = a * Math.sqrt(q)
    const i0 = Math.max(0, Math.ceil((a - w) / cellW - 0.5))
    const i1 = Math.min(cols - 1, Math.floor((a + w) / cellW - 0.5))
    for (let i = i0; i <= i1; i++) {
      const x = -a + (i + 0.5) * cellW
      if ((x / a) * (x / a) + (y / b) * (y / b) <= 1) inArena[j * cols + i] = 1
    }
  }
  // pied des tours
  for (const t of towers) {
    if (t.outside) continue
    const r = t.segments[0]?.r0 ?? 0
    const i0 = Math.max(0, Math.floor((t.x - r + a) / cellW))
    const i1 = Math.min(cols - 1, Math.ceil((t.x + r + a) / cellW))
    const j0 = Math.max(0, Math.floor((t.y - r + b) / cellH))
    const j1 = Math.min(rows - 1, Math.ceil((t.y + r + b) / cellH))
    for (let j = j0; j <= j1; j++) {
      const dy = -b + (j + 0.5) * cellH - t.y
      for (let i = i0; i <= i1; i++) {
        const dx = -a + (i + 0.5) * cellW - t.x
        if (dx * dx + dy * dy < r * r) inArena[j * cols + i] = 0
      }
    }
  }
  let arenaCells = 0
  for (let k = 0; k < n; k++) arenaCells += inArena[k]!
  const counts = new Int32Array(13)
  counts[0] = arenaCells
  return {
    cols,
    rows,
    x0: -a,
    y0: -b,
    cellW,
    cellH,
    owner: new Uint8Array(n),
    level: new Uint8Array(n),
    prevOwner: new Uint8Array(n),
    changedAt: new Float32Array(n).fill(-1000),
    frozen: new Uint8Array(n),
    inArena,
    arenaCells,
    counts,
    version: 0,
    dirty: { x0: cols, y0: rows, x1: -1, y1: -1 },
    frozenVersion: 0,
  }
}

/** Index de la cellule contenant (x, y), −1 hors grille. */
export function cellIndexAt(g: TerritoryGrid, x: number, y: number): number {
  const i = Math.floor((x - g.x0) / g.cellW)
  const j = Math.floor((y - g.y0) / g.cellH)
  if (i < 0 || j < 0 || i >= g.cols || j >= g.rows) return -1
  return j * g.cols + i
}

/** Centre monde de la cellule k. */
export function cellCenter(g: TerritoryGrid, k: number, out: { x: number; y: number }): { x: number; y: number } {
  const i = k % g.cols
  const j = (k - i) / g.cols
  out.x = g.x0 + (i + 0.5) * g.cellW
  out.y = g.y0 + (j + 0.5) * g.cellH
  return out
}

/** Élargit le rectangle sale à la cellule (i, j). */
export function markDirty(g: Grid, i: number, j: number): void {
  const d = g.dirty
  if (i < d.x0) d.x0 = i
  if (i > d.x1) d.x1 = i
  if (j < d.y0) d.y0 = j
  if (j > d.y1) d.y1 = j
}

/** Vide le rectangle sale (à appeler par le rendu après l'envoi de la texture). */
export function clearDirty(g: TerritoryGrid): void {
  if (!g.dirty) return
  g.dirty.x0 = g.cols
  g.dirty.y0 = g.rows
  g.dirty.x1 = -1
  g.dirty.y1 = -1
}

/** Marque toute la grille comme sale (remise à zéro, restauration). */
export function markAllDirty(g: Grid): void {
  g.dirty.x0 = 0
  g.dirty.y0 = 0
  g.dirty.x1 = g.cols - 1
  g.dirty.y1 = g.rows - 1
}

// ─── Intervalles de lignes ──────────────────────────────────────────────────

/**
 * Tampon d'intervalles : triplets (ligne, colonne min, colonne max). Réutilisé
 * d'un appel à l'autre ; `count` = nombre de triplets valides.
 */
export interface Spans {
  data: Int32Array
  count: number
}

export function makeSpans(rows: number): Spans {
  return { data: new Int32Array(rows * 3), count: 0 }
}

/**
 * Cellules dont le centre est dans l'ellipse (demi-axes A le long de (dx, dy), B en
 * travers) balayée de (cx0, cy0) à (cx1, cy1). Le balayage est échantillonné tous
 * les RULES.paintMaxStepMeters au plus (GDD §6.2 : aucune cellule sautée) et chaque
 * ligne est remplie de l'extrême gauche à l'extrême droite des sous-pas (la forme
 * balayée est convexe).
 */
export function sweptEllipseSpans(
  g: TerritoryGrid,
  cx0: number,
  cy0: number,
  cx1: number,
  cy1: number,
  A: number,
  B: number,
  dx: number,
  dy: number,
  out: Spans,
): Spans {
  out.count = 0
  const mx = cx1 - cx0
  const my = cy1 - cy0
  const dist = Math.hypot(mx, my)
  const steps = Math.max(1, Math.ceil(dist / RULES.paintMaxStepMeters))
  const iA2 = 1 / (A * A)
  const iB2 = 1 / (B * B)
  const alpha = dx * dx * iA2 + dy * dy * iB2
  const beta = dx * dy * (iA2 - iB2)
  const invAB2 = iA2 * iB2
  const halfH = Math.sqrt(B * B * dx * dx + A * A * dy * dy)
  const yMin = Math.min(cy0, cy1) - halfH
  const yMax = Math.max(cy0, cy1) + halfH
  const j0 = Math.max(0, Math.ceil((yMin - g.y0) / g.cellH - 0.5))
  const j1 = Math.min(g.rows - 1, Math.floor((yMax - g.y0) / g.cellH - 0.5))
  const data = out.data
  let n = 0
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * g.cellH
    let lo = Infinity
    let hi = -Infinity
    for (let s = 0; s <= steps; s++) {
      const t = s / steps
      const cx = cx0 + mx * t
      const ry = y - (cy0 + my * t)
      const D = alpha - ry * ry * invAB2
      if (D < 0) continue
      const w = Math.sqrt(D) / alpha
      const c = cx - (beta * ry) / alpha
      if (c - w < lo) lo = c - w
      if (c + w > hi) hi = c + w
    }
    if (lo > hi) continue
    const i0 = Math.max(0, Math.ceil((lo - g.x0) / g.cellW - 0.5))
    const i1 = Math.min(g.cols - 1, Math.floor((hi - g.x0) / g.cellW - 0.5))
    if (i0 > i1) continue
    data[n++] = j
    data[n++] = i0
    data[n++] = i1
  }
  out.count = n / 3
  return out
}

const _iv = { lo: 0, hi: 0 }

/** Rastérise une enveloppe de tour dans un masque (1 = dans l'ombre). */
export function rasterHull(g: TerritoryGrid, h: ShadowHull, mask: Uint8Array): void {
  const j0 = Math.max(0, Math.ceil((h.minY - g.y0) / g.cellH - 0.5))
  const j1 = Math.min(g.rows - 1, Math.floor((h.maxY - g.y0) / g.cellH - 0.5))
  for (let j = j0; j <= j1; j++) {
    const y = g.y0 + (j + 0.5) * g.cellH
    if (!hullRowInterval(h, y, _iv)) continue
    const i0 = Math.max(0, Math.ceil((_iv.lo - g.x0) / g.cellW - 0.5))
    const i1 = Math.min(g.cols - 1, Math.floor((_iv.hi - g.x0) / g.cellW - 0.5))
    if (i0 > i1) continue
    mask.fill(1, j * g.cols + i0, j * g.cols + i1 + 1)
  }
}

// ─── Encodage compact (snapshots) ──────────────────────────────────────────

/** RLE d'un Uint8Array : paires (valeur, longueur en varint). Pire cas : 2 octets par valeur. */
export function rleEncode(src: Uint8Array): Uint8Array {
  const out = new Uint8Array(src.length * 2 + 16)
  let o = 0
  let i = 0
  const n = src.length
  while (i < n) {
    const v = src[i]!
    let j = i + 1
    while (j < n && src[j] === v) j++
    let run = j - i
    out[o++] = v
    while (run >= 0x80) {
      out[o++] = (run & 0x7f) | 0x80
      run >>>= 7
    }
    out[o++] = run
    i = j
  }
  return out.slice(0, o)
}

export function rleDecode(src: Uint8Array, length: number): Uint8Array {
  const out = new Uint8Array(length)
  let i = 0
  let o = 0
  while (i < src.length && o < length) {
    const v = src[i++]!
    let run = 0
    let shift = 0
    for (;;) {
      const byte = src[i++]!
      run |= (byte & 0x7f) << shift
      if (byte < 0x80) break
      shift += 7
    }
    out.fill(v, o, Math.min(length, o + run))
    o += run
  }
  return out
}
