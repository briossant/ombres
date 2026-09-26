// Fonctions de requête sur l'état de la simulation, pour les bots, le rendu, la
// caméra et les outils. Pures, en lecture seule, sans allocation dans les appels
// courants (les enveloppes d'ombres sont mises en cache par état et par tick).

import { RULES } from './rules.ts'
import type { ShadowFootprint, SimState, SunState, TerritoryGrid, TowerDef } from './types.ts'
import { allocHulls, inAnyHull, updateHulls, type ShadowHull } from './towers.ts'
import { computeFootprint, footprintSample, inFootprint, makeFootprint } from './footprint.ts'
import { isNightAt } from './night.ts'
import { makeSun } from './sun.ts'
import { cellCenter as gridCellCenter, cellIndexAt } from './territory.ts'

export type { ShadowHull } from './towers.ts'
export { shadowRadius, cruiseSpeed, altitudeAlpha, isStrongAltitude, HIDE_SAMPLES } from './footprint.ts'
export { ellipticRadius, ellipseEdgeDistance } from './arena.ts'
export { isNightAt, jagAt, frontSpeed } from './night.ts'
export { hullRowInterval, inHull, trunkAt } from './towers.ts'
export { sunElevationDeg, sunAzimuthDeg, paletteElevDeg, phaseAt, phaseScale } from './sun.ts'
export { clearDirty } from './territory.ts'

// ─── Soleil ────────────────────────────────────────────────────────────────

/** État du soleil d'une manche au temps t (s) pour une durée T (prévisions des bots, HUD). */
export function sunAt(t: number, T: number): SunState {
  return makeSun(t, T)
}

// ─── Empreintes ────────────────────────────────────────────────────────────

/**
 * Empreinte de l'ombre d'un oiseau placé en (x, y, z) sous le soleil `sun`
 * (GDD §6.1). Passez `out` pour éviter l'allocation.
 */
export function birdFootprintAt(sun: SunState, x: number, y: number, z: number, out: ShadowFootprint = makeFootprint()): ShadowFootprint {
  return computeFootprint(sun, x, y, z, out)
}

/** Le point (px, py) est-il dans l'empreinte ? */
export function footprintContains(fp: ShadowFootprint, sun: SunState, px: number, py: number): boolean {
  return inFootprint(fp, sun, px, py)
}

// ─── Ombres des tours ──────────────────────────────────────────────────────

const hullCache = new WeakMap<SimState, { key: string; hulls: ShadowHull[] }>()

/**
 * Enveloppes exactes des ombres de tours pour le soleil courant de l'état (une par
 * segment ; voir ShadowHull : cercles c0/c1, tangentes, boîte englobante).
 * Recalculées au plus une fois par tick. Pour le rendu de débogage et les bots.
 */
export function towerShadowHulls(state: SimState): readonly ShadowHull[] {
  const key = `${state.tick}:${state.sun.t}:${state.sun.cotE}`
  let c = hullCache.get(state)
  if (!c) {
    c = { key: '', hulls: allocHulls(state.towers) }
    hullCache.set(state, c)
  }
  if (c.key !== key) {
    if (c.hulls.length !== countSegments(state.towers)) c.hulls = allocHulls(state.towers)
    updateHulls(state.towers, state.sun.cotE, state.sun.shadowDirX, state.sun.shadowDirY, c.hulls)
    c.key = key
  }
  return c.hulls
}

function countSegments(towers: readonly TowerDef[]): number {
  let n = 0
  for (const t of towers) n += t.segments.length
  return n
}

/** Enveloppes des ombres de tours pour un soleil quelconque (prévision : où sera l'ombre à t + Δ). */
export function towerShadowHullsFor(towers: readonly TowerDef[], sun: SunState, out?: ShadowHull[]): ShadowHull[] {
  const hulls = out && out.length === countSegments(towers) ? out : allocHulls(towers)
  updateHulls(towers, sun.cotE, sun.shadowDirX, sun.shadowDirY, hulls)
  return hulls
}

/** Le point est-il dans l'ombre exacte d'une tour (soleil courant) ? */
export function isTowerShadeAt(state: SimState, x: number, y: number): boolean {
  return inAnyHull(towerShadowHulls(state), x, y)
}

/** La nuit (Grande Ombre) couvre-t-elle ce point ? */
export function isNightPoint(state: SimState, x: number, y: number): boolean {
  return isNightAt(state.night, x, y)
}

/** Sable figé en ce point selon la grille (ombre de tour à 10 Hz ou nuit) : ce que la peinture respecte. */
export function isFrozenAt(state: SimState, x: number, y: number): boolean {
  const k = cellIndexAt(state.grid, x, y)
  return k >= 0 && state.grid.frozen[k] === 1
}

const _p = { x: 0, y: 0 }

/**
 * Couverture d'une empreinte (13 points de la cachette, GDD §9.2) : fraction dans
 * l'ombre des tours, dans la nuit, et dans l'une ou l'autre. Caché si `any` ≥ 0,9
 * (hors nuit) ; dans la nuit si `night` ≥ 0,9.
 */
export function shadowCoverage(state: SimState, fp: ShadowFootprint): { tower: number; night: number; any: number } {
  const hulls = towerShadowHulls(state)
  const n = RULES.hideSamplePoints
  let tower = 0
  let night = 0
  let any = 0
  for (let i = 0; i < n; i++) {
    footprintSample(fp, state.sun, i, _p)
    const inT = inAnyHull(hulls, _p.x, _p.y)
    const inN = isNightAt(state.night, _p.x, _p.y)
    if (inT) tower++
    if (inN) night++
    if (inT || inN) any++
  }
  return { tower: tower / n, night: night / n, any: any / n }
}

/** Un oiseau serait-il caché (ou dans la nuit) en (x, y, z) sous le soleil courant ? */
export function wouldBeHidden(state: SimState, x: number, y: number, z: number): boolean {
  const fp = computeFootprint(state.sun, x, y, z, _fp)
  return shadowCoverage(state, fp).any >= RULES.hideCoverFrac
}
const _fp = makeFootprint()

// ─── Grille ────────────────────────────────────────────────────────────────

/** Cellule contenant le point monde (x, y) : index k = j·cols + i, ou −1 hors grille. */
export function cellAt(grid: TerritoryGrid, x: number, y: number): number {
  return cellIndexAt(grid, x, y)
}

/** Centre monde de la cellule k. */
export function cellCenter(grid: TerritoryGrid, k: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  return gridCellCenter(grid, k, out)
}

/** Colonne et ligne (fractionnaires) d'un point monde : pratique pour les UV de texture. */
export function worldToGrid(grid: TerritoryGrid, x: number, y: number, out: { x: number; y: number } = { x: 0, y: 0 }): { x: number; y: number } {
  out.x = (x - grid.x0) / grid.cellW
  out.y = (y - grid.y0) / grid.cellH
  return out
}

// ─── Score ─────────────────────────────────────────────────────────────────

/** Part du désert possédée par un slot (0..1). */
export function shareOf(state: SimState, slot: number): number {
  return state.grid.counts[slot + 1]! / Math.max(1, state.grid.arenaCells)
}

/** Rang d'un slot (1 = premier ; ex æquo = même rang). */
export function rankOf(state: SimState, slot: number): number {
  const c = state.grid.counts[slot + 1]!
  let r = 1
  for (const b of state.birds) if (state.grid.counts[b.slot + 1]! > c) r++
  return r
}

/** Slots présents triés par territoire décroissant (à égalité : slot croissant). */
export function ranking(state: SimState): number[] {
  const counts = state.grid.counts
  return state.birds.map((b) => b.slot).sort((p, q) => counts[q + 1]! - counts[p + 1]! || p - q)
}

// ─── Piqué ─────────────────────────────────────────────────────────────────

/**
 * Point d'interception d'un piqué lancé maintenant par `hunter` sur `target`
 * (même prédiction que la simulation : cible extrapolée sur un arc). Pour les
 * bots (juger un piqué) et la caméra (cadrer la paire).
 */
export function predictInterception(state: SimState, hunter: number, target: number, out: { x: number; y: number; t: number } = { x: 0, y: 0, t: 0 }): { x: number; y: number; t: number } {
  const a = state.bySlot[hunter]
  const t = state.bySlot[target]
  if (!a || !t) return out
  const pred = (tt: number) => {
    const om = t.turnRate
    if (Math.abs(om) < 1e-3) {
      _p.x = t.x + t.speed * Math.cos(t.heading) * tt
      _p.y = t.y + t.speed * Math.sin(t.heading) * tt
    } else {
      _p.x = t.x + (t.speed / om) * (Math.sin(t.heading + om * tt) - Math.sin(t.heading))
      _p.y = t.y + (t.speed / om) * (-Math.cos(t.heading + om * tt) + Math.cos(t.heading))
    }
  }
  let tau = Math.hypot(t.x - a.x, t.y - a.y) / RULES.diveHSpeed
  for (let i = 0; i < 6; i++) {
    pred(tau)
    tau = Math.hypot(_p.x - a.x, _p.y - a.y) / RULES.diveHSpeed
  }
  pred(tau)
  out.x = _p.x
  out.y = _p.y
  out.t = tau + (a.dive === 'none' ? RULES.diveWindup : 0)
  return out
}
