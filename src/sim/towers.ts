// Ombres exactes des tours (GDD §9.1) et collisions de fût (GDD §5.3).
//
// Sous lumière parallèle, l'ombre au sol d'un tronc de cône à sections horizontales
// circulaires est exactement l'enveloppe convexe de deux cercles : rayon r0 centré
// en base + (ox0, oy0) + z0·cot(e)·d̂, rayon r1 centré en base + (ox1, oy1) + z1·cot(e)·d̂.
// L'ombre d'une tour est l'union de ses segments. Implémentation de référence :
// segHull / inHull de docs/research/gdd-validation/validate.mjs.

import type { TowerDef } from './types.ts'

/** Enveloppe convexe de deux cercles (ombre d'un segment), précalculée pour les tests. */
export interface ShadowHull {
  /** Tour d'origine (TowerDef.id) et index du segment. */
  tower: number
  segment: number
  c0x: number
  c0y: number
  r0: number
  c1x: number
  c1y: number
  r1: number
  /** Un cercle contient l'autre : pas de bande tangente. */
  circleOnly: boolean
  /** Axe C0 → C1 (unitaire). */
  ux: number
  uy: number
  /** Normales extérieures des deux tangentes et leurs constantes (n·p ≤ c). */
  mpx: number
  mpy: number
  mmx: number
  mmy: number
  cP: number
  cM: number
  /** Bornes de la bande le long de l'axe. */
  s0: number
  s1: number
  /** Points de tangence (± : côtés), pour les intervalles de ligne et le rendu de débogage. */
  p0px: number
  p0py: number
  p1px: number
  p1py: number
  p0mx: number
  p0my: number
  p1mx: number
  p1my: number
  minX: number
  maxX: number
  minY: number
  maxY: number
}

function emptyHull(tower: number, segment: number): ShadowHull {
  return {
    tower,
    segment,
    c0x: 0,
    c0y: 0,
    r0: 0,
    c1x: 0,
    c1y: 0,
    r1: 0,
    circleOnly: true,
    ux: 1,
    uy: 0,
    mpx: 0,
    mpy: 0,
    mmx: 0,
    mmy: 0,
    cP: 0,
    cM: 0,
    s0: 0,
    s1: 0,
    p0px: 0,
    p0py: 0,
    p1px: 0,
    p1py: 0,
    p0mx: 0,
    p0my: 0,
    p1mx: 0,
    p1my: 0,
    minX: 0,
    maxX: 0,
    minY: 0,
    maxY: 0,
  }
}

/** Alloue un tableau d'enveloppes (une par segment de tour), à mettre à jour avec updateHulls. */
export function allocHulls(towers: readonly TowerDef[]): ShadowHull[] {
  const out: ShadowHull[] = []
  for (const t of towers) for (let i = 0; i < t.segments.length; i++) out.push(emptyHull(t.id, i))
  return out
}

/** Calcule l'enveloppe d'un segment (en place). */
export function setHull(
  h: ShadowHull,
  c0x: number,
  c0y: number,
  r0: number,
  c1x: number,
  c1y: number,
  r1: number,
): void {
  h.c0x = c0x
  h.c0y = c0y
  h.r0 = r0
  h.c1x = c1x
  h.c1y = c1y
  h.r1 = r1
  const dx = c1x - c0x
  const dy = c1y - c0y
  const L = Math.hypot(dx, dy)
  h.circleOnly = L <= Math.abs(r1 - r0) + 1e-9
  h.minX = Math.min(c0x - r0, c1x - r1)
  h.maxX = Math.max(c0x + r0, c1x + r1)
  h.minY = Math.min(c0y - r0, c1y - r1)
  h.maxY = Math.max(c0y + r0, c1y + r1)
  if (h.circleOnly) return
  const ux = dx / L
  const uy = dy / L
  const nx = -uy
  const ny = ux
  const sp = (r0 - r1) / L
  const cp = Math.sqrt(Math.max(0, 1 - sp * sp))
  h.ux = ux
  h.uy = uy
  h.mpx = ux * sp + nx * cp
  h.mpy = uy * sp + ny * cp
  h.mmx = ux * sp - nx * cp
  h.mmy = uy * sp - ny * cp
  h.cP = h.mpx * c0x + h.mpy * c0y + r0
  h.cM = h.mmx * c0x + h.mmy * c0y + r0
  h.s0 = ux * c0x + uy * c0y + r0 * sp
  h.s1 = ux * c1x + uy * c1y + r1 * sp
  h.p0px = c0x + r0 * h.mpx
  h.p0py = c0y + r0 * h.mpy
  h.p1px = c1x + r1 * h.mpx
  h.p1py = c1y + r1 * h.mpy
  h.p0mx = c0x + r0 * h.mmx
  h.p0my = c0y + r0 * h.mmy
  h.p1mx = c1x + r1 * h.mmx
  h.p1my = c1y + r1 * h.mmy
}

/**
 * Met à jour les enveloppes pour un soleil donné : cotE = cot(élévation),
 * (dirX, dirY) = direction horizontale unitaire des ombres.
 */
export function updateHulls(towers: readonly TowerDef[], cotE: number, dirX: number, dirY: number, out: ShadowHull[]): void {
  let k = 0
  for (const t of towers) {
    for (const s of t.segments) {
      const h = out[k++]!
      setHull(
        h,
        t.x + (s.ox0 ?? 0) + s.z0 * cotE * dirX,
        t.y + (s.oy0 ?? 0) + s.z0 * cotE * dirY,
        s.r0,
        t.x + (s.ox1 ?? 0) + s.z1 * cotE * dirX,
        t.y + (s.oy1 ?? 0) + s.z1 * cotE * dirY,
        s.r1,
      )
    }
  }
}

/** Le point (px, py) est-il dans l'enveloppe ? */
export function inHull(h: ShadowHull, px: number, py: number): boolean {
  if (px < h.minX || px > h.maxX || py < h.minY || py > h.maxY) return false
  const d0x = px - h.c0x
  const d0y = py - h.c0y
  if (d0x * d0x + d0y * d0y <= h.r0 * h.r0) return true
  const d1x = px - h.c1x
  const d1y = py - h.c1y
  if (d1x * d1x + d1y * d1y <= h.r1 * h.r1) return true
  if (h.circleOnly) return false
  const s = h.ux * px + h.uy * py
  if (s < h.s0 || s > h.s1) return false
  return h.mpx * px + h.mpy * py <= h.cP && h.mmx * px + h.mmy * py <= h.cM
}

/** Le point est-il dans l'ombre d'au moins une tour ? */
export function inAnyHull(hulls: readonly ShadowHull[], px: number, py: number): boolean {
  for (let i = 0; i < hulls.length; i++) if (inHull(hulls[i]!, px, py)) return true
  return false
}

const _iv = { lo: 0, hi: 0 }

/**
 * Intersection de l'enveloppe (convexe) avec la ligne horizontale y : intervalle [lo, hi].
 * Retourne faux si vide. Les extrémités sont sur un cercle ou une tangente : on prend
 * les extrêmes des cordes des deux cercles et des croisements des deux tangentes.
 */
export function hullRowInterval(h: ShadowHull, y: number, out: { lo: number; hi: number } = _iv): boolean {
  if (y < h.minY || y > h.maxY) return false
  let lo = Infinity
  let hi = -Infinity
  const dy0 = y - h.c0y
  if (dy0 * dy0 <= h.r0 * h.r0) {
    const w = Math.sqrt(h.r0 * h.r0 - dy0 * dy0)
    lo = h.c0x - w
    hi = h.c0x + w
  }
  const dy1 = y - h.c1y
  if (dy1 * dy1 <= h.r1 * h.r1) {
    const w = Math.sqrt(h.r1 * h.r1 - dy1 * dy1)
    if (h.c1x - w < lo) lo = h.c1x - w
    if (h.c1x + w > hi) hi = h.c1x + w
  }
  if (!h.circleOnly) {
    // tangente « + »
    let ay = h.p0py
    let by = h.p1py
    if ((y - ay) * (y - by) <= 0 && ay !== by) {
      const x = h.p0px + ((h.p1px - h.p0px) * (y - ay)) / (by - ay)
      if (x < lo) lo = x
      if (x > hi) hi = x
    }
    ay = h.p0my
    by = h.p1my
    if ((y - ay) * (y - by) <= 0 && ay !== by) {
      const x = h.p0mx + ((h.p1mx - h.p0mx) * (y - ay)) / (by - ay)
      if (x < lo) lo = x
      if (x > hi) hi = x
    }
  }
  if (lo > hi) return false
  out.lo = lo
  out.hi = hi
  return true
}

// ─── Fûts : collisions ────────────────────────────────────────────────────

/**
 * Centre et rayon du fût d'une tour à l'altitude z (tours inclinées comprises).
 * Retourne le rayon (0 si la tour n'a pas de section à cette altitude).
 */
export function trunkAt(t: TowerDef, z: number, out: { x: number; y: number }): number {
  out.x = t.x
  out.y = t.y
  let r = 0
  for (const s of t.segments) {
    if (z < s.z0 || z > s.z1) continue
    const k = s.z1 > s.z0 ? (z - s.z0) / (s.z1 - s.z0) : 1
    const rr = s.r0 + (s.r1 - s.r0) * k
    if (rr >= r) {
      r = rr
      out.x = t.x + (s.ox0 ?? 0) + ((s.ox1 ?? 0) - (s.ox0 ?? 0)) * k
      out.y = t.y + (s.oy0 ?? 0) + ((s.oy1 ?? 0) - (s.oy0 ?? 0)) * k
    }
  }
  return r
}
