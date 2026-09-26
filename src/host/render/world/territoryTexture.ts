// Texture de territoire (ART_BIBLE §4, NPR §4.6) : DataTexture RGBA8 de la taille
// de la grille de la sim (512 × 352), une cellule = un texel, lue en texelFetch.
//   R = propriétaire (0 neutre, slot + 1)
//   G = niveau (0 aucun, 90 pâle, 255 fort) : le shader lit q = smoothstep(0,45 ; 0,65 ; G)
//   B = horodatage du dernier changement, 20 Hz modulo 250 ; 250 = « ancien » (> 1,2 s)
//   A = propriétaire précédent (transitions : encre fraîche, front mouillé)
//
// Mises à jour ≤ 20 Hz, par rectangles sales seulement. La sim tient un rectangle
// englobant (`grid.dirty`, remis à zéro ici après l'envoi) ; comme plusieurs
// oiseaux éloignés donneraient un rectangle presque plein, on le découpe en tuiles
// de 16 × 16 cellules : seules les tuiles réellement modifiées (comparaison au
// miroir CPU) sont ré-encodées et envoyées, une plage de tuiles contiguës = un seul
// texSubImage2D (renderer.copyTextureToTexture depuis les données CPU).
// Chaque plage est ré-encodée ~1,5 s plus tard pour passer ses horodatages à
// « ancien » (sinon le modulo les rendrait « fraîches » 12,5 s plus tard).
//
// Champ de distance aux bords (polish 2) : `edgeTexture`, R8 filtrée, au quart de la résolution
// (un texel = 4 × 4 cellules ≈ 2,6 m) : distance (chanfrein, en texels, bornée à EDGE_MAX) au plus
// proche changement de propriétaire. Le sol s'en sert pour la bande de pigment qui s'accumule au
// bord d'un lavis (lisible à distance de jeu, là où le liseré de 3 px ne suffit plus). Recalculée
// entièrement (≈ 11 000 texels, deux passes) au plus 10 fois par seconde quand les propriétaires changent.
import * as THREE from 'three'
import { RULES } from '../../../sim/rules.ts'
import { clearDirty } from '../../../sim/territory.ts'
import type { TerritoryGrid } from '../../../sim/types.ts'

export const TERR_STAMP_HZ = 20
export const TERR_STAMP_MOD = 250
export const TERR_OLD = 250
const OLD_AFTER = 1.2
const EXPIRE_AFTER = 1.5
const LEVEL_BYTE = [0, 90, 255]
const TILE = 16
const QUEUE = 4096
/** Taille (en cellules) d'un texel du champ de distance aux bords. */
export const EDGE_BLOCK = 4
/** Distance maximale codée (texels du champ) : 255 = EDGE_MAX texels ou plus. */
export const EDGE_MAX = 8
const EDGE_HZ = 10

export class TerritoryTexture {
  readonly texture: THREE.DataTexture
  /**
   * Texture « de transit » partageant les mêmes données CPU, jamais envoyée au GPU :
   * copyTextureToTexture(transit → texture) fait alors un texSubImage2D depuis la
   * mémoire CPU (si la source était déjà sur le GPU, three copierait GPU → GPU).
   */
  private readonly staging: THREE.DataTexture
  readonly cols: number
  readonly rows: number
  private readonly data: Uint8Array
  private readonly tilesX: number
  private readonly tilesY: number
  private readonly tileDirty: Uint8Array
  private lastVersion = -1
  private lastUpload = -Infinity
  private boundGrid: TerritoryGrid | null = null
  private needsFull = true
  // file d'expiration des plages envoyées : (ligne de tuiles, tuile x0, tuile x1, instant)
  private readonly qRow = new Int16Array(QUEUE)
  private readonly qX0 = new Int16Array(QUEUE)
  private readonly qX1 = new Int16Array(QUEUE)
  private readonly qAt = new Float32Array(QUEUE)
  private qHead = 0
  private qLen = 0
  private readonly box = new THREE.Box2()
  private readonly pos = new THREE.Vector2()
  /** Statistiques (debug) : tuiles envoyées à la dernière mise à jour. */
  lastTiles = 0
  /** Distance aux bords de territoire (voir l'en-tête), lue en bilinéaire par le sol. */
  readonly edgeTexture: THREE.DataTexture
  readonly edgeCols: number
  readonly edgeRows: number
  private readonly edgeData: Uint8Array
  private readonly blockOwner: Uint8Array
  private readonly edgeDist: Uint16Array
  private edgeDirty = true
  private lastEdge = -Infinity
  /** Transit du champ de distance (même mémoire CPU) : envoi par texSubImage2D, sans initTexture. */
  private readonly edgeStaging: THREE.DataTexture
  private edgeUpload = false

  constructor(cols: number = RULES.gridCols, rows: number = RULES.gridRows) {
    this.cols = cols
    this.rows = rows
    this.tilesX = Math.ceil(cols / TILE)
    this.tilesY = Math.ceil(rows / TILE)
    this.tileDirty = new Uint8Array(this.tilesX * this.tilesY)
    this.data = new Uint8Array(cols * rows * 4)
    for (let i = 0; i < cols * rows; i++) this.data[i * 4 + 2] = TERR_OLD
    const t = new THREE.DataTexture(this.data, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType)
    t.minFilter = THREE.NearestFilter
    t.magFilter = THREE.NearestFilter
    t.generateMipmaps = false
    t.flipY = false
    t.name = 'territory'
    t.needsUpdate = true
    this.texture = t
    this.staging = new THREE.DataTexture(this.data, cols, rows, THREE.RGBAFormat, THREE.UnsignedByteType)
    this.edgeCols = Math.ceil(cols / EDGE_BLOCK)
    this.edgeRows = Math.ceil(rows / EDGE_BLOCK)
    const ne = this.edgeCols * this.edgeRows
    this.edgeData = new Uint8Array(ne).fill(255)
    this.blockOwner = new Uint8Array(ne)
    this.edgeDist = new Uint16Array(ne)
    const e = new THREE.DataTexture(this.edgeData, this.edgeCols, this.edgeRows, THREE.RedFormat, THREE.UnsignedByteType)
    e.minFilter = THREE.LinearFilter
    e.magFilter = THREE.LinearFilter
    e.generateMipmaps = false
    e.flipY = false
    e.name = 'territory-edges'
    e.needsUpdate = true
    this.edgeTexture = e
    this.edgeStaging = new THREE.DataTexture(this.edgeData, this.edgeCols, this.edgeRows, THREE.RedFormat, THREE.UnsignedByteType)
  }

  /**
   * Champ de distance aux bords : un bloc est un « bord » si ses coins n'ont pas tous le propriétaire
   * de son centre, ou si un voisin (4-connexité) a un autre propriétaire ; puis chanfrein 10 / 14 en
   * deux passes. Aucune allocation.
   */
  private computeEdges(grid: TerritoryGrid): void {
    const W = this.edgeCols
    const H = this.edgeRows
    const cols = this.cols
    const rows = this.rows
    const owner = grid.owner
    const bo = this.blockOwner
    const d = this.edgeDist
    const B = EDGE_BLOCK
    for (let by = 0; by < H; by++) {
      const y0 = by * B
      const y1 = Math.min(rows - 1, y0 + B - 1)
      const yc = Math.min(rows - 1, y0 + (B >> 1))
      for (let bx = 0; bx < W; bx++) {
        const x0 = bx * B
        const x1 = Math.min(cols - 1, x0 + B - 1)
        const c = owner[yc * cols + Math.min(cols - 1, x0 + (B >> 1))]!
        bo[by * W + bx] = c
        const mixed = owner[y0 * cols + x0] !== c || owner[y0 * cols + x1] !== c || owner[y1 * cols + x0] !== c || owner[y1 * cols + x1] !== c
        d[by * W + bx] = mixed ? 0 : 0xffff
      }
    }
    for (let by = 0; by < H; by++)
      for (let bx = 0; bx < W; bx++) {
        const i = by * W + bx
        const c = bo[i]
        if ((bx > 0 && bo[i - 1] !== c) || (bx < W - 1 && bo[i + 1] !== c) || (by > 0 && bo[i - W] !== c) || (by < H - 1 && bo[i + W] !== c)) d[i] = 0
      }
    // chanfrein 10 / 14 (texels × 10)
    for (let by = 0; by < H; by++)
      for (let bx = 0; bx < W; bx++) {
        const i = by * W + bx
        let v = d[i]!
        if (v === 0) continue
        if (bx > 0) v = Math.min(v, d[i - 1]! + 10)
        if (by > 0) {
          v = Math.min(v, d[i - W]! + 10)
          if (bx > 0) v = Math.min(v, d[i - W - 1]! + 14)
          if (bx < W - 1) v = Math.min(v, d[i - W + 1]! + 14)
        }
        d[i] = v
      }
    const out = this.edgeData
    const scale = 255 / (EDGE_MAX * 10)
    for (let by = H - 1; by >= 0; by--)
      for (let bx = W - 1; bx >= 0; bx--) {
        const i = by * W + bx
        let v = d[i]!
        if (v !== 0) {
          if (bx < W - 1) v = Math.min(v, d[i + 1]! + 10)
          if (by < H - 1) {
            v = Math.min(v, d[i + W]! + 10)
            if (bx < W - 1) v = Math.min(v, d[i + W + 1]! + 14)
            if (bx > 0) v = Math.min(v, d[i + W - 1]! + 14)
          }
          d[i] = v
        }
        out[i] = Math.min(255, Math.round(v * scale))
      }
    this.edgeUpload = true
  }

  /** Recalcule le champ de distance aux bords s'il a changé (≤ 10 Hz) et l'envoie. */
  private updateEdges(renderer: THREE.WebGLRenderer, grid: TerritoryGrid, now: number): void {
    if (this.edgeDirty && !(now - this.lastEdge < 1 / EDGE_HZ && now >= this.lastEdge)) {
      this.computeEdges(grid)
      this.edgeDirty = false
      this.lastEdge = now
    }
    if (this.edgeUpload) {
      this.edgeUpload = false
      renderer.copyTextureToTexture(this.edgeStaging, this.edgeTexture)
    }
  }

  /** Horloge (en « tics » d'horodatage) à passer au shader : (temps × 20) mod 250. */
  static clock(simTime: number): number {
    return (((simTime * TERR_STAMP_HZ) % TERR_STAMP_MOD) + TERR_STAMP_MOD) % TERR_STAMP_MOD
  }

  private encodeRect(grid: TerritoryGrid, x0: number, y0: number, x1: number, y1: number, now: number): void {
    const d = this.data
    const cols = this.cols
    for (let y = y0; y <= y1; y++) {
      let i = y * cols + x0
      for (let x = x0; x <= x1; x++, i++) {
        const o = i * 4
        d[o] = grid.owner[i]!
        d[o + 1] = LEVEL_BYTE[grid.level[i]!] ?? 0
        const at = grid.changedAt[i]!
        const age = now - at
        d[o + 2] = age > OLD_AFTER || age < -0.5 ? TERR_OLD : Math.floor(at * TERR_STAMP_HZ) % TERR_STAMP_MOD
        d[o + 3] = grid.prevOwner[i]!
      }
    }
  }

  private uploadRect(renderer: THREE.WebGLRenderer, x0: number, y0: number, x1: number, y1: number): void {
    this.box.min.set(x0, y0)
    this.box.max.set(x1 + 1, y1 + 1)
    this.pos.set(x0, y0)
    renderer.copyTextureToTexture(this.staging, this.texture, this.box, this.pos)
  }

  /** Plage de tuiles (ligne ty, colonnes tx0..tx1) : encode, envoie, et planifie l'expiration. */
  private flushSpan(renderer: THREE.WebGLRenderer, grid: TerritoryGrid, ty: number, tx0: number, tx1: number, now: number, schedule: boolean): void {
    const x0 = tx0 * TILE
    const y0 = ty * TILE
    const x1 = Math.min(this.cols - 1, (tx1 + 1) * TILE - 1)
    const y1 = Math.min(this.rows - 1, (ty + 1) * TILE - 1)
    this.encodeRect(grid, x0, y0, x1, y1, now)
    this.uploadRect(renderer, x0, y0, x1, y1)
    this.lastTiles += tx1 - tx0 + 1
    if (schedule) {
      if (this.qLen >= QUEUE) {
        this.needsFull = true // file saturée : tout ré-encoder à la prochaine occasion
        return
      }
      const k = (this.qHead + this.qLen) % QUEUE
      this.qRow[k] = ty
      this.qX0[k] = tx0
      this.qX1[k] = tx1
      this.qAt[k] = now + EXPIRE_AFTER
      this.qLen++
    }
  }

  /** Marque les tuiles dont owner/level diffèrent du miroir CPU (dans le rectangle donné). */
  private markTiles(grid: TerritoryGrid, x0: number, y0: number, x1: number, y1: number): boolean {
    const d = this.data
    const cols = this.cols
    const owner = grid.owner
    const level = grid.level
    let any = false
    for (let y = y0; y <= y1; y++) {
      const trow = ((y / TILE) | 0) * this.tilesX
      let i = y * cols + x0
      for (let x = x0; x <= x1; x++, i++) {
        if (d[i * 4] !== owner[i] || d[i * 4 + 1] !== LEVEL_BYTE[level[i]!]) {
          this.tileDirty[trow + ((x / TILE) | 0)] = 1
          any = true
          // saute au bout de la tuile : elle sera ré-encodée entièrement
          const skip = TILE - 1 - (x % TILE)
          x += skip
          i += skip
        }
      }
    }
    return any
  }

  /** Ré-encode et envoie toute la grille (nouvelle manche, reprise, premier affichage). */
  full(grid: TerritoryGrid, now: number): void {
    this.boundGrid = grid
    if (grid.dirty) clearDirty(grid)
    this.qLen = 0
    this.encodeRect(grid, 0, 0, this.cols - 1, this.rows - 1, now)
    this.texture.needsUpdate = true
    this.lastVersion = grid.version
    this.lastUpload = now
    this.needsFull = false
    this.computeEdges(grid)
    this.edgeDirty = false
    this.lastEdge = now
    // les cellules encore « fraîches » seront vieillies par une passe complète plus tard
    for (let ty = 0; ty < this.tilesY; ty++) {
      const k = (this.qHead + this.qLen) % QUEUE
      this.qRow[k] = ty
      this.qX0[k] = 0
      this.qX1[k] = this.tilesX - 1
      this.qAt[k] = now + EXPIRE_AFTER
      this.qLen++
    }
  }

  /**
   * À appeler chaque frame (avant le rendu) : envoie les tuiles modifiées (≤ 20 Hz)
   * et celles dont les horodatages expirent. `now` = temps de sim courant (s).
   */
  update(renderer: THREE.WebGLRenderer, grid: TerritoryGrid, now: number, maxHz = 20): void {
    if (this.needsFull || grid !== this.boundGrid || grid.cols !== this.cols || grid.rows !== this.rows) {
      this.full(grid, now)
      this.updateEdges(renderer, grid, now)
      return
    }
    if (now < this.lastUpload - 0.5) {
      this.full(grid, now) // temps de sim revenu en arrière (nouvelle manche, reprise)
      this.updateEdges(renderer, grid, now)
      return
    }
    if (now - this.lastUpload < 1 / maxHz) return
    this.lastTiles = 0
    let touched = false
    if (grid.version !== this.lastVersion) {
      const d = grid.dirty
      const any = d
        ? d.x1 >= d.x0 && d.y1 >= d.y0 && this.markTiles(grid, Math.max(0, d.x0), Math.max(0, d.y0), Math.min(this.cols - 1, d.x1), Math.min(this.rows - 1, d.y1))
        : this.markTiles(grid, 0, 0, this.cols - 1, this.rows - 1)
      if (d) clearDirty(grid)
      this.lastVersion = grid.version
      if (any) {
        this.edgeDirty = true
        for (let ty = 0; ty < this.tilesY; ty++) {
          let tx = 0
          while (tx < this.tilesX) {
            if (!this.tileDirty[ty * this.tilesX + tx]) {
              tx++
              continue
            }
            const tx0 = tx
            while (tx < this.tilesX && this.tileDirty[ty * this.tilesX + tx]) this.tileDirty[ty * this.tilesX + tx++] = 0
            this.flushSpan(renderer, grid, ty, tx0, tx - 1, now, true)
          }
        }
        touched = true
      }
    }
    // expirations (file ordonnée dans le temps)
    while (this.qLen > 0 && now >= this.qAt[this.qHead]!) {
      const k = this.qHead
      this.flushSpan(renderer, grid, this.qRow[k]!, this.qX0[k]!, this.qX1[k]!, now, false)
      this.qHead = (this.qHead + 1) % QUEUE
      this.qLen--
      touched = true
    }
    if (touched) this.lastUpload = now
    this.updateEdges(renderer, grid, now)
  }

  dispose(): void {
    this.texture.dispose()
    this.edgeTexture.dispose()
  }
}
