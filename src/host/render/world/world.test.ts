// Tests du rendu du monde qui ne demandent pas de GPU : palette (horloge, OKLab),
// géométrie des tours (fidèle aux segments de gameplay), texture de territoire
// (tuiles sales, horodatages).
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { getMap, MAP_IDS } from '../../../sim/maps.ts'
import { RULES } from '../../../sim/rules.ts'
import type { TerritoryGrid } from '../../../sim/types.ts'
import { hexToLinear, linearToHex, linearToOklab, oklabToLinear } from '../npr/oklab.ts'
import { gameElevForPalette, paletteColor, paletteElev, sunElevationDeg, updatePalette } from '../npr/palette.ts'
import { buildTowerGeometries } from './towerGeometry.ts'
import { TERR_OLD, TerritoryTexture } from './territoryTexture.ts'

describe('palette', () => {
  it('OKLab aller-retour exact', () => {
    for (const hex of ['#F1DABE', '#2B1D23', '#6886BD', '#E57E5E', '#000000', '#FFFFFF']) {
      const lin = hexToLinear(hex)
      const back = oklabToLinear(linearToOklab(lin))
      for (let i = 0; i < 3; i++) expect(Math.abs(back[i]! - lin[i]!)).toBeLessThan(1e-5)
      expect(linearToHex(back)).toBe(hex)
    }
  })

  it("horloge de palette : KF1 en fin de soleil, identité au-dessus de e(0,7 T)", () => {
    expect(paletteElev(RULES.sunElevEndDeg)).toBeCloseTo(1, 6)
    const eS = sunElevationDeg(0.7)
    expect(paletteElev(eS)).toBeCloseTo(eS, 6)
    expect(paletteElev(40)).toBe(40)
    for (let pe = 1; pe < 30; pe += 0.5) expect(paletteElev(gameElevForPalette(pe))).toBeCloseTo(pe, 6)
    let prev = -Infinity
    for (let e = RULES.sunElevEndDeg; e <= 88; e += 0.25) {
      const v = paletteElev(e)
      expect(v).toBeGreaterThan(prev)
      prev = v
    }
  })

  it('les keyframes sont restituées exactement', () => {
    updatePalette({ paletteElevDeg: 80 })
    expect(linearToHex(colorArr(paletteColor('groundFlat')))).toBe('#F1DABE')
    updatePalette({ paletteElevDeg: 1 })
    expect(linearToHex(colorArr(paletteColor('groundFlat')))).toBe('#797286')
    expect(linearToHex(colorArr(paletteColor('ink')))).toBe('#231521')
  })
})

function colorArr(c: THREE.Color): [number, number, number] {
  return [c.r, c.g, c.b]
}

describe('tours', () => {
  it('le corps reproduit exactement les segments de gameplay (silhouette et hauteur)', () => {
    for (const id of MAP_IDS) {
      for (const n of [2, 6, 12]) {
        const map = getMap(id, n)
        const { body, decor } = buildTowerGeometries(map.towers)
        const pos = body.getAttribute('position') as THREE.BufferAttribute
        const loc = body.getAttribute('tloc') as THREE.BufferAttribute
        expect(pos.count).toBeGreaterThan(0)
        for (let i = 0; i < pos.count; i++) {
          expect(Number.isFinite(pos.getX(i) + pos.getY(i) + pos.getZ(i))).toBe(true)
          // rayon local (relatif à l'axe, incliné compris) = rayon du profil au sommet
          const r = Math.hypot(loc.getX(i), loc.getZ(i))
          expect(Math.abs(r - loc.getW(i))).toBeLessThan(1e-3)
        }
        // hauteur maximale du corps = hauteur de gameplay de la plus haute tour
        body.computeBoundingBox()
        const hMax = Math.max(...map.towers.map((t) => t.height))
        expect(body.boundingBox!.max.y).toBeCloseTo(hMax, 3)
        expect(decor.getAttribute('position').count).toBeGreaterThan(0)
      }
    }
  })

  it('chaque segment non plat est tourné au bon rayon, à la bonne position', () => {
    const map = getMap('parasols', 6)
    const t = map.towers[0]!
    const { body } = buildTowerGeometries([t])
    const pos = body.getAttribute('position') as THREE.BufferAttribute
    for (const s of t.segments) {
      if (s.z1 - s.z0 < 1e-3) continue
      const zm = (s.z0 + s.z1) / 2
      // rayon attendu au milieu du tronc : les sommets aux extrémités encadrent le profil
      let found = 0
      for (let i = 0; i < pos.count; i++) {
        const z = pos.getY(i)
        if (Math.abs(z - s.z0) < 1e-4 || Math.abs(z - s.z1) < 1e-4) {
          const r = Math.hypot(pos.getX(i) - t.x, pos.getZ(i) + t.y)
          const expected = Math.abs(z - s.z0) < 1e-4 ? s.r0 : s.r1
          if (Math.abs(r - expected) < 1e-3) found++
        }
      }
      expect(found).toBeGreaterThan(0)
      expect(zm).toBeGreaterThan(0)
    }
  })
  it('cavité exacte sous les surplombs : anneaux 2 et 6 m sous chaque disque, creux < 0,25 seulement tout près', () => {
    // polish W7 : la cavité (couche croisée des hachures) n'est plus interpolée sur tout un fût
    const map = getMap('parasols', 6)
    for (const t of map.towers) {
      const { body } = buildTowerGeometries([t])
      const pos = body.getAttribute('position') as THREE.BufferAttribute
      const deco = body.getAttribute('tdeco') as THREE.BufferAttribute
      const overhangs = t.segments.filter((s) => s.z1 - s.z0 < 1e-4 && s.r1 - s.r0 > 2.5).map((s) => s.z0)
      for (const oz of overhangs) {
        for (const d of [2, 6]) {
          const z = oz - d
          if (z <= 0.5) continue
          let ring = 0
          let cav = 1
          for (let i = 0; i < pos.count; i++) {
            if (Math.abs(pos.getY(i) - z) < 1e-4) {
              ring++
              cav = Math.min(cav, deco.getW(i))
            }
          }
          expect(ring).toBeGreaterThan(0)
          // 2 m sous le disque : cavité ≈ 0,38 (> 0,25 : pas de couche croisée) ; 6 m : aucune
          expect(cav).toBeGreaterThan(d === 2 ? 0.3 : 0.95)
        }
      }
    }
  })
})

function fakeGrid(cols = 64, rows = 48): TerritoryGrid {
  const n = cols * rows
  return {
    cols,
    rows,
    x0: -50,
    y0: -40,
    cellW: 100 / cols,
    cellH: 80 / rows,
    owner: new Uint8Array(n),
    level: new Uint8Array(n),
    prevOwner: new Uint8Array(n),
    changedAt: new Float32Array(n),
    frozen: new Uint8Array(n),
    inArena: new Uint8Array(n).fill(1),
    arenaCells: n,
    counts: new Int32Array(13),
    version: 0,
    dirty: { x0: cols, y0: rows, x1: -1, y1: -1 },
  }
}

describe('texture de territoire', () => {
  it("n'envoie que les tuiles modifiées et vieillit les horodatages", () => {
    const g = fakeGrid()
    const tex = new TerritoryTexture(g.cols, g.rows)
    const uploads: THREE.Box2[] = []
    // seuls les envois vers la texture de territoire comptent (le champ de distance aux bords, polish 2,
    // part par le même chemin, sans rectangle)
    const renderer = { copyTextureToTexture: (_s: unknown, d: unknown, box: THREE.Box2) => d === tex.texture && uploads.push(box.clone()) } as unknown as THREE.WebGLRenderer
    tex.update(renderer, g, 0) // premier affichage : envoi complet (needsUpdate)
    expect(uploads.length).toBe(0)
    // on peint deux cellules éloignées à t = 1 s
    const paint = (x: number, y: number, t: number) => {
      const i = y * g.cols + x
      g.prevOwner[i] = g.owner[i]!
      g.owner[i] = 3
      g.level[i] = RULES.levelStrong
      g.changedAt[i] = t
      g.dirty!.x0 = Math.min(g.dirty!.x0, x)
      g.dirty!.y0 = Math.min(g.dirty!.y0, y)
      g.dirty!.x1 = Math.max(g.dirty!.x1, x)
      g.dirty!.y1 = Math.max(g.dirty!.y1, y)
      g.version++
    }
    paint(2, 3, 1)
    paint(60, 44, 1)
    tex.update(renderer, g, 1)
    expect(uploads.length).toBe(2) // deux tuiles 16×16, pas le rectangle englobant
    for (const b of uploads) expect((b.max.x - b.min.x) * (b.max.y - b.min.y)).toBeLessThanOrEqual(16 * 16)
    expect(g.dirty!.x1).toBe(-1) // rectangle sale de la sim remis à zéro
    const data = tex.texture.image.data as Uint8Array
    const i = (3 * g.cols + 2) * 4
    expect(data[i]).toBe(3)
    expect(data[i + 1]).toBe(255)
    expect(data[i + 2]).not.toBe(TERR_OLD) // horodatage frais
    // 1,5 s plus tard, les mêmes tuiles (et les lignes du premier envoi complet, planifiées
    // à 1,5 s) sont ré-envoyées avec un horodatage « ancien »
    uploads.length = 0
    tex.update(renderer, g, 2.6)
    const rowsOfTiles = Math.ceil(g.rows / 16)
    expect(uploads.length).toBe(2 + rowsOfTiles)
    expect(data[i + 2]).toBe(TERR_OLD)
    // plus rien à envoyer ensuite
    uploads.length = 0
    tex.update(renderer, g, 3.0)
    expect(uploads.length).toBe(0)
  })

  it('champ de distance aux bords : 0 sur un bord, borné loin des bords, recalculé ≤ 10 Hz', () => {
    const g = fakeGrid(128, 96)
    const tex = new TerritoryTexture(g.cols, g.rows)
    let edgeUploads = 0
    const renderer = { copyTextureToTexture: (_s: unknown, d: unknown) => void (d === tex.edgeTexture && edgeUploads++) } as unknown as THREE.WebGLRenderer
    // un grand carré peint de 40 × 40 cellules (10 × 10 texels du champ)
    for (let y = 8; y < 48; y++)
      for (let x = 8; x < 48; x++) {
        const i = y * g.cols + x
        g.owner[i] = 2
        g.level[i] = RULES.levelStrong
      }
    g.version++
    tex.update(renderer, g, 0)
    expect(edgeUploads).toBe(1)
    const e = tex.edgeTexture.image.data as Uint8Array
    const at = (cx: number, cy: number) => e[Math.floor(cy / 4) * tex.edgeCols + Math.floor(cx / 4)]!
    expect(at(8, 20)).toBe(0) // sur le bord gauche du carré
    expect(at(27, 27)).toBeGreaterThan(at(12, 27)) // plus loin du bord au centre
    expect(at(27, 27)).toBeGreaterThan(0)
    expect(at(g.cols - 4, g.rows - 4)).toBe(255) // sable nu loin de tout bord : borné
    // nouvelle peinture 50 ms plus tard : le champ attend 100 ms
    const i = 30 * g.cols + 30
    g.owner[i] = 5
    g.dirty = { x0: 30, y0: 30, x1: 30, y1: 30 }
    g.version++
    tex.update(renderer, g, 0.05)
    tex.update(renderer, g, 0.08)
    expect(edgeUploads).toBe(1)
    tex.update(renderer, g, 0.2)
    expect(edgeUploads).toBe(2)
    expect(at(30, 30)).toBe(0)
  })
})
