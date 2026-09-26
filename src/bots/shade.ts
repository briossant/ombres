// Ombres des tours vues par les bots : où elles seront dans quelques secondes (pour
// « sceller » du sable juste avant qu'elles le couvrent, GDD §9.5) et où un oiseau bas
// peut se cacher (cachettes, GDD §9.2). Partagé par tous les bots d'une simulation,
// recalculé deux fois par seconde.
//
// La course du soleil est connue de tous (le cadran du HUD, les ombres qui glissent) :
// prévoir où tombera l'ombre d'une tour n'est pas une information cachée, c'est ce que
// fait un joueur expérimenté.

import { RULES } from '../sim/rules.ts'
import type { SimState, SunState } from '../sim/types.ts'
import { allocHulls, inAnyHull, updateHulls, type ShadowHull } from '../sim/towers.ts'
import { rasterHull } from '../sim/territory.ts'
import { ellipseSupport, frontPosition, jagAt } from '../sim/night.ts'
import { computeFootprint, footprintSample, makeFootprint } from '../sim/footprint.ts'
import { ellipticRadius } from '../sim/arena.ts'
import { sunAt, towerShadowHulls, wouldBeHidden } from '../sim/query.ts'
import { phaseScale } from '../sim/sun.ts'

/** Horizon de la prévision (s de soleil) : le temps d'aller peindre devant une ombre. */
export const SEAL_LEAD = 3.5
/** Période de recalcul (s). */
const UPDATE_EVERY = 0.5

export interface HideSpot {
  /** Position de l'oiseau (bas) pour que son ombre soit couverte. */
  x: number
  y: number
  /** Encore une cachette dans SEAL_LEAD s (l'ombre ne s'en va pas tout de suite). */
  stable: boolean
  /** Tour qui porte l'ombre. */
  tower: number
}

const _fp = makeFootprint()
const _p = { x: 0, y: 0 }

/**
 * Le recalcul est étalé sur quelques ticks (prévision des ombres, rastérisation en deux
 * moitiés, nuit, cachettes) dans un masque de travail échangé à la fin : aucun pic.
 */
const PHASES = 4

export class ShadeForecast {
  /** 1 = cellule qui sera figée dans SEAL_LEAD s (ombre de tour ou nuit). */
  mask: Uint8Array
  private back: Uint8Array
  readonly spots: HideSpot[] = []
  /** Soleil prévu (à t + SEAL_LEAD). */
  futureSun: SunState
  private readonly future: ShadowHull[]
  private nextUpdate = -Infinity
  /** Étape du recalcul en cours (−1 : aucun). */
  private phase = -1
  private tFuture = 0
  version = 0

  constructor(state: SimState) {
    this.mask = new Uint8Array(state.grid.cols * state.grid.rows)
    this.back = new Uint8Array(state.grid.cols * state.grid.rows)
    this.future = allocHulls(state.towers)
    this.futureSun = state.sun
  }

  /** Force un recalcul complet immédiat au prochain appel (remise à zéro de la démo, reprise). */
  invalidate(): void {
    this.nextUpdate = -Infinity
    this.phase = -1
  }

  /** À appeler à chaque tick : avance le recalcul d'une étape. Retourne vrai quand un masque neuf est prêt. */
  update(state: SimState, immediate = false): boolean {
    if (this.phase < 0) {
      if (state.time < this.nextUpdate) return false
      this.nextUpdate = state.time + UPDATE_EVERY
      this.phase = 0
      // premier calcul (ou après remise à zéro) : tout de suite
      if (immediate || this.version === 0) {
        while (!this.stepPhase(state));
        return true
      }
    }
    return this.stepPhase(state)
  }

  private stepPhase(state: SimState): boolean {
    const lobby = state.config.mode === 'lobby'
    const g = state.grid
    const half = Math.ceil(this.future.length / 2)
    switch (this.phase) {
      case 0: {
        const sun = state.sun
        this.tFuture = Math.max(0, sun.t) + SEAL_LEAD
        this.futureSun = lobby ? sun : sunAt(Math.min(this.tFuture, sun.T), sun.T)
        const fs = this.futureSun
        updateHulls(state.towers, fs.cotE, fs.shadowDirX, fs.shadowDirY, this.future)
        this.back.fill(0)
        for (let i = 0; i < half; i++) rasterHull(g, this.future[i]!, this.back)
        break
      }
      case 1:
        for (let i = half; i < this.future.length; i++) rasterHull(g, this.future[i]!, this.back)
        break
      case 2: {
        if (!lobby) this.addNight(state, this.tFuture, this.back)
        const done = this.mask
        this.mask = this.back
        this.back = done
        this.version++
        break
      }
      default:
        this.findSpots(state)
        this.phase = -1
        return true
    }
    this.phase++
    return this.phase >= PHASES
  }

  /** Nuit prévue : front à t + SEAL_LEAD (même profil dentelé que la simulation). */
  private addNight(state: SimState, tFuture: number, mask: Uint8Array): void {
    const T = state.config.sunSeconds
    const t0 = RULES.greatShadowAt * phaseScale(T)
    if (tFuture < t0) return
    const night = state.night
    const dx = night.active ? night.dirX : this.futureSun.shadowDirX
    const dy = night.active ? night.dirY : this.futureSun.shadowDirY
    if (dx < 0.3) return
    const ext = ellipseSupport(state.arena.a, state.arena.b, dx, dy)
    const s = frontPosition(Math.min(tFuture, T), T, ext)
    const g = state.grid
    const probe = { ...night, active: true, dirX: dx, dirY: dy, s }
    for (let j = 0; j < g.rows; j++) {
      const y = g.y0 + (j + 0.5) * g.cellH
      // bord du front sur cette ligne : along = s + jag(q), résolu en une itération (dx ≈ 1)
      let x = (s - y * dy) / dx
      const q = -x * dy + y * dx
      x = (s + jagAt(probe, q) - y * dy) / dx
      const i1 = Math.min(g.cols - 1, Math.floor((x - g.x0) / g.cellW - 0.5))
      if (i1 >= 0) mask.fill(1, j * g.cols, j * g.cols + i1 + 1)
    }
  }

  /** Cachettes d'un oiseau bas : sous les ombres larges (disques, bulbes). */
  private findSpots(state: SimState): void {
    this.spots.length = 0
    const hulls = towerShadowHulls(state)
    const sun = state.sun
    const off = RULES.altLow * sun.cotE
    const { a, b } = state.arena
    for (const h of hulls) {
      if (Math.max(h.r0, h.r1) < 5.5) continue
      for (let f = 0; f <= 1.001; f += 1 / 3) {
        const px = h.c0x + (h.c1x - h.c0x) * f
        const py = h.c0y + (h.c1y - h.c0y) * f
        const x = px - off * sun.shadowDirX
        const y = py - off * sun.shadowDirY
        if (ellipticRadius(x, y, a, b) > 0.86) continue
        if (this.nearTrunk(state, x, y)) continue
        if (!wouldBeHidden(state, x, y, RULES.altLow)) continue
        if (this.spots.some((s) => Math.hypot(s.x - x, s.y - y) < 6)) continue
        this.spots.push({ x, y, stable: this.hiddenLater(x, y), tower: h.tower })
      }
    }
  }

  private nearTrunk(state: SimState, x: number, y: number): boolean {
    for (const t of state.towers) {
      if (t.outside) continue
      if (Math.hypot(t.x - x, t.y - y) < t.trunkRadius + RULES.towerCollisionMargin + 3) return true
    }
    return false
  }

  /** L'ombre d'un oiseau bas immobile en (x, y) serait-elle encore couverte au soleil prévu ? */
  private hiddenLater(x: number, y: number): boolean {
    const fs = this.futureSun
    const fp = computeFootprint(fs, x, y, RULES.altLow, _fp)
    let n = 0
    for (let i = 0; i < RULES.hideSamplePoints; i++) {
      footprintSample(fp, fs, i, _p)
      if (inAnyHull(this.future, _p.x, _p.y)) n++
    }
    return n / RULES.hideSamplePoints >= RULES.hideCoverFrac
  }
}
