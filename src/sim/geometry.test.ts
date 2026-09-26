import { describe, expect, it } from 'vitest'
import { RULES } from './rules.ts'
import { allocHulls, hullRowInterval, inHull, setHull, updateHulls, trunkAt } from './towers.ts'
import { getMap, MAP_IDS, getCliffProfile } from './maps.ts'
import { makeSun } from './sun.ts'
import { mulberry32 } from './rng.ts'
import { createGrid, makeSpans, rleDecode, rleEncode, sweptEllipseSpans } from './territory.ts'
import { ellipseEdgeDistance } from './arena.ts'
import type { TowerDef } from './types.ts'

/** Force brute : le point est à l'ombre si une section horizontale du tronc de cône le couvre. */
function bruteShadow(t: TowerDef, cotE: number, dx: number, dy: number, px: number, py: number): boolean {
  for (const s of t.segments) {
    const N = 400
    for (let i = 0; i <= N; i++) {
      const k = i / N
      const z = s.z0 + (s.z1 - s.z0) * k
      const r = s.r0 + (s.r1 - s.r0) * k
      const ox = (s.ox0 ?? 0) + ((s.ox1 ?? 0) - (s.ox0 ?? 0)) * k
      const oy = (s.oy0 ?? 0) + ((s.oy1 ?? 0) - (s.oy0 ?? 0)) * k
      const cx = t.x + ox + z * cotE * dx
      const cy = t.y + oy + z * cotE * dy
      if ((px - cx) ** 2 + (py - cy) ** 2 <= r * r) return true
    }
  }
  return false
}

describe('ombres des tours (GDD §9.1)', () => {
  it('enveloppe de deux cercles = force brute (toutes les cartes, plusieurs soleils)', () => {
    const rnd = mulberry32(42)
    let tested = 0
    let mismatches = 0
    for (const id of MAP_IDS) {
      const map = getMap(id, 6)
      const hulls = allocHulls(map.towers)
      for (const t of [0, 40, 85, 110]) {
        const sun = makeSun(t, 110)
        updateHulls(map.towers, sun.cotE, sun.shadowDirX, sun.shadowDirY, hulls)
        for (const tower of map.towers) {
          const own = hulls.filter((h) => h.tower === tower.id)
          let minX = Infinity
          let maxX = -Infinity
          let minY = Infinity
          let maxY = -Infinity
          for (const h of own) {
            minX = Math.min(minX, h.minX)
            maxX = Math.max(maxX, h.maxX)
            minY = Math.min(minY, h.minY)
            maxY = Math.max(maxY, h.maxY)
          }
          for (let q = 0; q < 150; q++) {
            const px = minX + rnd() * (maxX - minX)
            const py = minY + rnd() * (maxY - minY)
            const exact = own.some((h) => inHull(h, px, py))
            const brute = bruteShadow(tower, sun.cotE, sun.shadowDirX, sun.shadowDirY, px, py)
            tested++
            if (exact !== brute) {
              // tolérance : l'échantillonnage de la force brute peut manquer un liseré très fin
              if (!exact && brute) mismatches++
              else if (exact && !brute) mismatches++
            }
          }
        }
      }
    }
    expect(tested).toBeGreaterThan(5000)
    expect(mismatches / tested).toBeLessThan(0.002)
  })

  it('intervalle de ligne cohérent avec le test de point', () => {
    const rnd = mulberry32(3)
    const h = allocHulls([{ id: 0, x: 0, y: 0, archetype: 'parasol', segments: [{ z0: 0, r0: 1, z1: 1, r1: 1 }], height: 1, trunkRadius: 1, outside: false, seed: 0 }])[0]!
    const iv = { lo: 0, hi: 0 }
    for (let n = 0; n < 300; n++) {
      setHull(h, rnd() * 20 - 10, rnd() * 20 - 10, 0.5 + rnd() * 6, rnd() * 60 - 30, rnd() * 60 - 30, rnd() * 8)
      for (let q = 0; q < 20; q++) {
        const y = h.minY + rnd() * (h.maxY - h.minY)
        const ok = hullRowInterval(h, y, iv)
        for (let s = 0; s < 20; s++) {
          const x = h.minX - 1 + rnd() * (h.maxX - h.minX + 2)
          const inside = inHull(h, x, y)
          const inIv = ok && x >= iv.lo - 1e-9 && x <= iv.hi + 1e-9
          if (Math.abs(x - iv.lo) > 1e-6 && Math.abs(x - iv.hi) > 1e-6) expect(inIv).toBe(inside)
        }
      }
    }
  })

  it('longueur de l\'ombre d\'une tour de 46 m (GDD §17-C)', () => {
    const tower: TowerDef = { id: 0, x: 0, y: 0, archetype: 'aiguille', segments: [{ z0: 0, r0: 0.001, z1: 46, r1: 0.001 }], height: 46, trunkRadius: 1, outside: false, seed: 0 }
    for (const [t, len] of [
      [55, 66],
      [85, 156],
      [98, 231],
      [110, 290],
    ] as const) {
      const sun = makeSun(t, 110)
      const hulls = allocHulls([tower])
      updateHulls([tower], sun.cotE, sun.shadowDirX, sun.shadowDirY, hulls)
      expect(Math.round(Math.hypot(hulls[0]!.c1x, hulls[0]!.c1y))).toBe(len)
    }
  })
})

describe('cartes (GDD §9.3-9.4)', () => {
  it('règles de placement pour toutes les tailles d\'arène', () => {
    for (const id of ['parasols', 'aiguilles', 'geantes', 'cadran'] as const) {
      for (const p of RULES.arenaPresets) {
        for (const mirror of [false, true]) {
          const map = getMap(id, p.maxBirds, mirror)
          expect(map.arena).toEqual({ a: p.a, b: p.b })
          const inner = map.towers.filter((t) => !t.outside)
          for (let i = 0; i < inner.length; i++)
            for (let j = i + 1; j < inner.length; j++) expect(Math.hypot(inner[i]!.x - inner[j]!.x, inner[i]!.y - inner[j]!.y)).toBeGreaterThanOrEqual(RULES.towerMinSpacing - 0.02)
          for (const t of inner) {
            expect(ellipseEdgeDistance(t.x, t.y, p.a, p.b)).toBeGreaterThanOrEqual(RULES.towerEdgeMargin - 0.02)
            // rien de plus large que 5 m sous 24 m
            for (const s of t.segments) {
              if (s.z0 < RULES.towerWideMinZ) expect(s.r0).toBeLessThanOrEqual(RULES.towerLowMaxRadius + 1e-9)
              if (s.z1 < RULES.towerWideMinZ) expect(s.r1).toBeLessThanOrEqual(RULES.towerLowMaxRadius + 1e-9)
            }
            expect(t.trunkRadius).toBeLessThanOrEqual(RULES.towerLowMaxRadius)
            // profil monotone (lathe d'un seul tenant)
            for (let k = 1; k < t.segments.length; k++) {
              expect(t.segments[k]!.z0).toBe(t.segments[k - 1]!.z1)
              expect(t.segments[k]!.r0).toBe(t.segments[k - 1]!.r1)
            }
          }
          for (const t of map.towers.filter((t) => t.outside)) expect(ellipseEdgeDistance(t.x, t.y, p.a, p.b)).toBeLessThan(-10)
          if (id === 'parasols') {
            expect(inner.length).toBe(p.towers)
            for (const t of inner) expect(Math.hypot(t.x, t.y)).toBeGreaterThanOrEqual(RULES.openingCenterClear - 0.01)
          }
        }
      }
    }
  })

  it('preset 5-6 : positions exactes du GDD, miroir nord-sud', () => {
    const map = getMap('parasols', 6)
    expect(map.towers.map((t) => [t.x, t.y])).toEqual([
      [-70, 8],
      [-128, -42],
      [-110, 60],
      [-15, 72],
      [-10, -76],
      [68, 45],
      [88, -38],
    ])
    const mirror = getMap('parasols', 6, true)
    expect(mirror.towers.map((t) => t.y)).toEqual(map.towers.map((t) => -t.y + 0))
    // gnomon incliné vers le sud, et vers le nord en miroir
    const g = getMap('cadran', 6).towers[0]!
    expect(g.archetype).toBe('gnomon')
    expect(g.segments.at(-1)!.oy1!).toBeLessThan(-10)
    expect(getMap('cadran', 6, true).towers[0]!.segments.at(-1)!.oy1!).toBeGreaterThan(10)
    const c = { x: 0, y: 0 }
    expect(trunkAt(g, 10, c)).toBeGreaterThan(4)
    expect(c.y).toBeLessThan(-1)
  })

  it('lobby : 90 × 62, un parasol', () => {
    const m = getMap('lobby', 3)
    expect(m.arena).toEqual({ a: RULES.lobbyArenaA, b: RULES.lobbyArenaB })
    expect(m.towers).toHaveLength(1)
    expect(m.towers[0]!.archetype).toBe('parasol')
  })

  it('Falaise : profil dentelé ±6 m, déterministe', () => {
    const p = getCliffProfile('cadran', { a: 165, b: 114 })
    const q = getCliffProfile('cadran', { a: 165, b: 114 })
    expect(Array.from(p.jag)).toEqual(Array.from(q.jag))
    expect(Math.max(...p.jag)).toBeLessThanOrEqual(RULES.greatShadowJagAmp + 1e-6)
    expect(Math.min(...p.jag)).toBeGreaterThanOrEqual(-RULES.greatShadowJagAmp - 1e-6)
    expect(Math.max(...p.jag) - Math.min(...p.jag)).toBeGreaterThan(6)
    expect(p.jagSpan).toBeGreaterThan(165)
    expect(p.height).toBeCloseTo(1700 * Math.tan((9 * Math.PI) / 180), 6)
  })
})

describe('grille et rastérisation', () => {
  it('arène comptée : centre dans l\'ellipse, hors du pied des tours', () => {
    const map = getMap('parasols', 6)
    const g = createGrid(165, 114, map.towers)
    expect(g.cols).toBe(512)
    expect(g.rows).toBe(352)
    const area = g.arenaCells * g.cellW * g.cellH
    expect(area).toBeGreaterThan(Math.PI * 165 * 114 * 0.99)
    expect(area).toBeLessThan(Math.PI * 165 * 114 * 1.01)
    expect(g.counts[0]).toBe(g.arenaCells)
  })

  it('ellipse balayée : exacte sans déplacement, aucun trou avec déplacement', () => {
    const g = createGrid(110, 76, [])
    const spans = makeSpans(g.rows)
    const dx = Math.cos(0.3)
    const dy = Math.sin(0.3)
    const A = 20
    const B = 6
    sweptEllipseSpans(g, 5, 3, 5, 3, A, B, dx, dy, spans)
    const inside = new Set<number>()
    for (let s = 0; s < spans.count; s++) for (let i = spans.data[3 * s + 1]!; i <= spans.data[3 * s + 2]!; i++) inside.add(spans.data[3 * s]! * g.cols + i)
    for (let j = 0; j < g.rows; j++)
      for (let i = 0; i < g.cols; i++) {
        const x = g.x0 + (i + 0.5) * g.cellW - 5
        const y = g.y0 + (j + 0.5) * g.cellH - 3
        const u = (x * dx + y * dy) / A
        const v = (-x * dy + y * dx) / B
        const exp = u * u + v * v <= 1
        if (Math.abs(u * u + v * v - 1) > 1e-6) expect(inside.has(j * g.cols + i)).toBe(exp)
      }
    // balayage de 30 m : la bande entre les deux ellipses est pleine
    sweptEllipseSpans(g, -20, 0, 10, 0, 5, 5, 1, 0, spans)
    let cells = 0
    for (let s = 0; s < spans.count; s++) cells += spans.data[3 * s + 2]! - spans.data[3 * s + 1]! + 1
    const area = cells * g.cellW * g.cellH
    expect(area).toBeGreaterThan((Math.PI * 25 + 300) * 0.97)
    expect(area).toBeLessThan((Math.PI * 25 + 300) * 1.03)
  })

  it('RLE aller-retour', () => {
    const rnd = mulberry32(9)
    const a = new Uint8Array(5000)
    for (let i = 0; i < a.length; i++) a[i] = rnd() < 0.01 ? Math.floor(rnd() * 13) : i > 0 ? a[i - 1]! : 0
    expect(Array.from(rleDecode(rleEncode(a), a.length))).toEqual(Array.from(a))
  })
})
