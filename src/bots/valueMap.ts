// Carte de valeur par blocs (RULES.botBlockSize = 8 m) : ce que chaque zone du désert
// contient (neutre, pâle et fort par propriétaire, sable bientôt scellé). Sert au choix
// d'un cap lointain (GDD §14.1). Partagée par tous les bots d'une simulation.
//
// Mise à jour incrémentale : quelques lignes de la grille par tick dans un tampon de
// travail, échangé avec le tampon courant à la fin de chaque passe (≈ 0,27 s). Le
// coût par tick reste constant (pas de pic d'une seconde à l'autre).

import { RULES } from '../sim/rules.ts'
import type { TerritoryGrid } from '../sim/types.ts'

const SLOTS = 12
/** Lignes de la grille accumulées par tick (352 / 22 = une passe complète en 16 ticks, ≈ 0,53 s). */
const ROWS_PER_TICK = 22

interface Layer {
  /** Cellules comptées du bloc. */
  tot: Float32Array
  /** Cellules neutres non figées. */
  neutral: Float32Array
  /** Cellules non figées qui seront figées bientôt (prévision des ombres et de la nuit). */
  seal: Float32Array
  /** Cellules non figées pâles / fortes, par slot (bloc × 12 + slot). */
  pale: Float32Array
  strong: Float32Array
}

function makeLayer(n: number): Layer {
  return {
    tot: new Float32Array(n),
    neutral: new Float32Array(n),
    seal: new Float32Array(n),
    pale: new Float32Array(n * SLOTS),
    strong: new Float32Array(n * SLOTS),
  }
}

function clearLayer(l: Layer): void {
  l.tot.fill(0)
  l.neutral.fill(0)
  l.seal.fill(0)
  l.pale.fill(0)
  l.strong.fill(0)
}

export class ValueMap {
  readonly size = RULES.botBlockSize
  readonly bw: number
  readonly bh: number
  /** Cellules par bloc plein (pour ramener une somme de bloc à une valeur moyenne par cellule). */
  readonly cellsPerBlock: number
  /** Passe complète la plus récente. */
  cur: Layer
  private work: Layer
  private row = 0
  /** Colonne → colonne de bloc, ligne → ligne de bloc (précalculées). */
  private readonly colBlock: Int32Array
  private readonly rowBlock: Int32Array
  /** Colonnes extrêmes des cellules comptées de chaque ligne (on ne parcourt que l'ellipse). */
  private readonly rowMin: Int32Array
  private readonly rowMax: Int32Array

  constructor(private readonly grid: TerritoryGrid) {
    this.bw = Math.ceil((grid.cols * grid.cellW) / this.size)
    this.bh = Math.ceil((grid.rows * grid.cellH) / this.size)
    this.cellsPerBlock = (this.size * this.size) / (grid.cellW * grid.cellH)
    const n = this.bw * this.bh
    this.cur = makeLayer(n)
    this.work = makeLayer(n)
    this.colBlock = new Int32Array(grid.cols)
    this.rowBlock = new Int32Array(grid.rows)
    for (let i = 0; i < grid.cols; i++) this.colBlock[i] = Math.min(this.bw - 1, Math.floor((i * grid.cellW) / this.size))
    for (let j = 0; j < grid.rows; j++) this.rowBlock[j] = Math.min(this.bh - 1, Math.floor((j * grid.cellH) / this.size))
    this.rowMin = new Int32Array(grid.rows).fill(grid.cols)
    this.rowMax = new Int32Array(grid.rows).fill(-1)
    for (let j = 0; j < grid.rows; j++) {
      for (let i = 0; i < grid.cols; i++) {
        if (grid.inArena[j * grid.cols + i] === 0) continue
        if (i < this.rowMin[j]!) this.rowMin[j] = i
        this.rowMax[j] = i
      }
    }
  }

  /** Passe complète immédiate (création, remise à zéro). */
  rebuild(forecast: Uint8Array | null): void {
    clearLayer(this.work)
    this.row = 0
    this.step(forecast, this.grid.rows)
  }

  /** Accumule les lignes suivantes ; échange les tampons à la fin d'une passe. */
  step(forecast: Uint8Array | null, rows = ROWS_PER_TICK): void {
    const g = this.grid
    const w = this.work
    const end = Math.min(g.rows, this.row + rows)
    const cols = g.cols
    const inArena = g.inArena
    const frozen = g.frozen
    const owner = g.owner
    const level = g.level
    const strongLevel = RULES.levelStrong
    const tot = w.tot
    const neutral = w.neutral
    const seal = w.seal
    const pale = w.pale
    const strong = w.strong
    const colBlock = this.colBlock
    for (let j = this.row; j < end; j++) {
      const rowBase = this.rowBlock[j]! * this.bw
      const kRow = j * cols
      const i1 = this.rowMax[j]!
      for (let i = this.rowMin[j]!; i <= i1; i++) {
        const k = kRow + i
        if (inArena[k] === 0) continue
        const bi = rowBase + colBlock[i]!
        tot[bi]!++
        if (frozen[k] === 1) continue
        if (forecast !== null && forecast[k] === 1) seal[bi]!++
        const o = owner[k]!
        if (o === 0) neutral[bi]!++
        else if (level[k] === strongLevel) strong[bi * SLOTS + o - 1]!++
        else pale[bi * SLOTS + o - 1]!++
      }
    }
    this.row = end
    if (this.row >= g.rows) {
      const done = this.work
      this.work = this.cur
      this.cur = done
      clearLayer(this.work)
      this.row = 0
    }
  }

  /** Index du bloc contenant (x, y), −1 hors de la grille. */
  blockAt(x: number, y: number): number {
    const bx = Math.floor((x - this.grid.x0) / this.size)
    const by = Math.floor((y - this.grid.y0) / this.size)
    if (bx < 0 || by < 0 || bx >= this.bw || by >= this.bh) return -1
    return by * this.bw + bx
  }

  /** Centre monde du bloc bi. */
  blockCenterX(bi: number): number {
    return this.grid.x0 + ((bi % this.bw) + 0.5) * this.size
  }

  blockCenterY(bi: number): number {
    return this.grid.y0 + (Math.floor(bi / this.bw) + 0.5) * this.size
  }

  /** Cellules de `slot` (pâles + fortes, non figées) dans le bloc. */
  ownedBy(bi: number, slot: number): number {
    const c = this.cur
    return c.pale[bi * SLOTS + slot]! + c.strong[bi * SLOTS + slot]!
  }
}
