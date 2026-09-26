// Décision de cap par utilité (GDD §14.1 ; référence : bestHeading de validate.mjs).
//
// Pour chacun des 16 caps : valeur des cellules sous l'empreinte DE L'OMBRE (pas de
// l'oiseau) à 0,7 / 1,4 / 2,1 s, plus la valeur des blocs de 8 m à 25, 50, 80 et 120 m
// dans ce cap (là où tombera l'ombre), le tout multiplié par le débit de balayage
// 2r·v·(1 + (S − 1)·|sin(cap − direction des ombres)|). On pénalise la tempête, les fûts
// droit devant et les demi-tours. Chaque niveau vise avec sa propre compensation du
// décalage de l'ombre (un Oisillon croit son ombre plus près de lui qu'elle ne l'est).

import { RULES } from '../sim/rules.ts'
import type { SimState, SunState } from '../sim/types.ts'
import { angDiff } from '../sim/math.ts'
import { cruiseSpeed, shadowRadius } from '../sim/footprint.ts'
import { ellipticRadius } from '../sim/arena.ts'
import { isNightAt } from '../sim/night.ts'
import type { ValueMap } from './valueMap.ts'
import type { TowerSense } from './levels.ts'

export const HEADINGS = 16
const SLOTS = 12

/** Pondération des cellules (GDD §14.1), modulée par le caractère. */
export interface PaintWeights {
  neutral: number
  steal: number
  crown: number
  upgrade: number
  /** Multiplicateur du sable qui sera figé dans quelques secondes (scellage). */
  seal: number
  /** Oiseau dont le sable compte davantage (Pie : le meneur), −1 sinon. */
  focus: number
  focusMul: number
  /**
   * Rivalité par slot (multiplie la valeur d'une cellule volée) : prendre au rival direct
   * vaut plus que prendre à un oiseau loin derrière (le score est un classement).
   */
  rival: Float32Array
}

export interface EvalInput {
  state: SimState
  values: ValueMap
  /** Prévision des cellules bientôt figées (ShadeForecast.mask). */
  forecast: Uint8Array
  slot: number
  x: number
  y: number
  heading: number
  /** Part du décalage de l'ombre compensée (GDD §14.3 « visée avec l'ombre »). */
  comp: number
  /** Soleils aux trois horizons proches (le soleil courant si le bot n'anticipe pas). */
  suns: readonly SunState[]
  /** Erreur « pâle sur fort » : croit qu'une ombre pâle prend du sable fort. */
  paleOnStrong: boolean
  towers: TowerSense
  weights: PaintWeights
  /** Coût d'un virage (valeur par radian d'écart au cap actuel). */
  turnCost: number
  /** Coût relatif d'un virage : la valeur est réduite de turnRel × (écart / π). */
  turnRel: number
  /** Marge de la tempête : pénalité au-delà de ce rayon elliptique. */
  stormFrom: number
  /** Profondeur : 1 = les 16 caps, 2 = un sur deux ; horizons proches et lointains retenus. */
  headingStep: number
  nearCount: number
  farCount: number
  /** Part comprise du bonus de balayage en travers des ombres (0..1). */
  sweepSkill: number
}

const NEAR_TIMES = [0.7, 1.4, 2.1] as const
/** Blocs lointains : distance (m) et poids (0,6 × ceux du GDD : mesuré meilleur, voir le rapport). */
const FAR_D = [25, 50, 80, 120] as const
const FAR_W = [0.27, 0.18, 0.12, 0.07] as const
/** Points d'échantillonnage de l'empreinte (u le long des ombres, v en travers). */
const SAMPLE_U = [0, 0.6, -0.6, 0, 0, 0.45, -0.45] as const
const SAMPLE_V = [0, 0, 0, 0.6, -0.6, 0.45, -0.45] as const
const STORM_D = [15, 30, 45] as const

/** Valeur d'une cellule pour ce bot, selon que son ombre y serait forte ou pâle. */
export function cellValue(inp: EvalInput, k: number, strong: boolean, px: number, py: number): number {
  const g = inp.state.grid
  if (k < 0 || g.inArena[k] === 0) return 0
  if (g.frozen[k] === 1) {
    // l'Oisillon ne voit pas que l'ombre des tours fige le sable (la nuit, si)
    if (inp.towers !== 'ignore' || isNightAt(inp.state.night, px, py)) return 0
  }
  const w = inp.weights
  const seal = inp.forecast[k] === 1 && g.frozen[k] === 0 ? w.seal : 1
  const o = g.owner[k]!
  const lvl = g.level[k]!
  if (o === inp.slot + 1) return strong && lvl === RULES.levelPale ? w.upgrade * seal : 0
  if (o === 0) return w.neutral * seal
  if (strong || lvl === RULES.levelPale || inp.paleOnStrong) {
    const s = o - 1
    const base = s === inp.state.crownSlot ? w.crown : w.steal
    return base * (s === w.focus ? w.focusMul : 1) * w.rival[s]! * seal
  }
  return 0
}

/** Valeur moyenne des cellules sous l'empreinte qu'aurait l'ombre d'un oiseau en (x, y, z). */
export function footprintValue(inp: EvalInput, sun: SunState, x: number, y: number, z: number): number {
  const g = inp.state.grid
  const off = z * sun.cotE * inp.comp
  const cx = x + off * sun.shadowDirX
  const cy = y + off * sun.shadowDirY
  const r = shadowRadius(z)
  const rAlong = r * sun.stretch
  const strong = z <= RULES.strongMaxAlt
  const dx = sun.shadowDirX
  const dy = sun.shadowDirY
  let v = 0
  for (let n = 0; n < SAMPLE_U.length; n++) {
    const u = SAMPLE_U[n]!
    const w = SAMPLE_V[n]!
    const px = cx + u * rAlong * dx - w * r * dy
    const py = cy + u * rAlong * dy + w * r * dx
    const i = Math.floor((px - g.x0) / g.cellW)
    const j = Math.floor((py - g.y0) / g.cellH)
    const k = i < 0 || j < 0 || i >= g.cols || j >= g.rows ? -1 : j * g.cols + i
    v += cellValue(inp, k, strong, px, py)
  }
  return v / SAMPLE_U.length
}

/** Valeur moyenne par cellule d'un bloc de la carte de valeur. */
export function blockValue(inp: EvalInput, bi: number, strong: boolean): number {
  if (bi < 0) return 0
  const m = inp.values
  const c = m.cur
  const tot = c.tot[bi]!
  if (tot <= 0) return 0
  const w = inp.weights
  const st = inp.state
  let v = w.neutral * c.neutral[bi]!
  const base = bi * SLOTS
  for (const b of st.birds) {
    const s = b.slot
    if (s === inp.slot) {
      if (strong) v += w.upgrade * c.pale[base + s]!
      continue
    }
    const ws = (s === st.crownSlot ? w.crown : w.steal) * (s === w.focus ? w.focusMul : 1) * w.rival[s]!
    v += ws * (c.pale[base + s]! + (strong || inp.paleOnStrong ? c.strong[base + s]! : 0))
  }
  // sable bientôt scellé : bonus proportionnel (la carte ne distingue pas son propriétaire)
  if (w.seal !== 1) v += (w.seal - 1) * 0.7 * c.seal[bi]!
  return v / m.cellsPerBlock
}

/**
 * Évalue les 16 caps à l'altitude z. `out[q]` reçoit la valeur du cap q·π/8 ;
 * retourne l'index du meilleur. Aucune allocation.
 */
export function evaluateHeadings(inp: EvalInput, z: number, out: Float64Array): number {
  const st = inp.state
  const sun0 = inp.suns[0]!
  const v = cruiseSpeed(z)
  const r = shadowRadius(z)
  const strong = z <= RULES.strongMaxAlt
  const shAng = Math.atan2(sun0.shadowDirY, sun0.shadowDirX)
  const off = z * sun0.cotE * inp.comp
  const { a, b } = st.arena
  let best = 0
  let bestV = -Infinity
  const nearN = Math.min(NEAR_TIMES.length, inp.nearCount)
  const farN = Math.min(FAR_D.length, inp.farCount)
  for (let q = 0; q < HEADINGS; q++) {
    if (q % inp.headingStep !== 0) {
      out[q] = -Infinity
      continue
    }
    const h = (q * Math.PI * 2) / HEADINGS
    const ca = Math.cos(h)
    const sa = Math.sin(h)
    const sweep = 2 * r * v * (1 + inp.sweepSkill * (sun0.stretch - 1) * Math.abs(Math.sin(h - shAng)))
    let near = 0
    for (let n = 0; n < nearN; n++) {
      const tt = NEAR_TIMES[n]!
      near += footprintValue(inp, inp.suns[n] ?? sun0, inp.x + ca * v * tt, inp.y + sa * v * tt, z)
    }
    near /= nearN
    let far = 0
    for (let n = 0; n < farN; n++) {
      const d = FAR_D[n]!
      far += FAR_W[n]! * blockValue(inp, inp.values.blockAt(inp.x + ca * d + off * sun0.shadowDirX, inp.y + sa * d + off * sun0.shadowDirY), strong)
    }
    let val = sweep * (near + far)
    // tempête : on n'y peint pas et elle détourne
    for (let n = 0; n < STORM_D.length; n++) {
      const d = STORM_D[n]!
      const rho = ellipticRadius(inp.x + ca * d, inp.y + sa * d, a, b)
      if (rho > inp.stormFrom) val -= 3000 * (rho - inp.stormFrom) * (60 / d)
    }
    // fût droit devant (glissade, −30 % de vitesse)
    val -= trunkPenalty(st, inp.x, inp.y, ca, sa)
    const turn = Math.abs(angDiff(h, inp.heading))
    if (inp.turnRel > 0 && val > 0) val *= 1 - (inp.turnRel * turn) / Math.PI
    val -= turn * inp.turnCost
    out[q] = val
    if (val > bestV) {
      bestV = val
      best = q
    }
  }
  return best
}

/** Pénalité si un fût coupe la trajectoire dans les 25 prochains mètres. */
function trunkPenalty(st: SimState, x: number, y: number, ca: number, sa: number): number {
  let p = 0
  for (const t of st.towers) {
    if (t.outside) continue
    const ex = t.x - x
    const ey = t.y - y
    const proj = ex * ca + ey * sa
    if (proj <= 0 || proj > 25) continue
    const perp = Math.abs(-ex * sa + ey * ca)
    const R = t.trunkRadius + RULES.towerCollisionMargin + 1.5
    if (perp < R) p += 250 * (1 - perp / R) * (1 - proj / 30)
  }
  return p
}

/** Cap (rad) de l'index q. */
export function headingOf(q: number): number {
  return (q * Math.PI * 2) / HEADINGS
}
