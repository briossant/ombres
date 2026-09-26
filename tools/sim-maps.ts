// Vérification des cartes : règles de placement (GDD §9.3) et couverture d'ombre
// des tours au fil de la manche, comparée au GDD §9.4 / validate.mjs.
//   npx tsx tools/sim-maps.ts [mapId…]
import { getMap, arenaPresetFor, towerNames, MAP_IDS } from '../src/sim/maps.ts'
import { allocHulls, updateHulls, hullRowInterval } from '../src/sim/towers.ts'
import { makeSun } from '../src/sim/sun.ts'
import { ellipseEdgeDistance } from '../src/sim/arena.ts'
import { RULES } from '../src/sim/rules.ts'
import type { MapId } from '../src/sim/types.ts'

const COLS = RULES.gridCols
const ROWS = RULES.gridRows
const TIMES = [0, 30, 55, 70, 85, 98]
const GDD: Record<string, number[]> = {
  parasols: [4.7, 6.6, 9.8, 12.6, 16.1, 15.6],
  aiguilles: [0.5, 2.3, 4.6, 6.9, 9.7, 10.7],
  geantes: [2.7, 4.1, 9.3, 15.3, 23.3, 24.4],
  cadran: [3.9, 5.2, 7.7, 10.1, 10.8, 9.9],
}

function coverage(mapId: MapId, n: number, mirror = false): { cov: number[]; issues: string[] } {
  const map = getMap(mapId, n, mirror)
  const { a, b } = map.arena
  const cw = (2 * a) / COLS
  const ch = (2 * b) / ROWS
  const inArena = new Uint8Array(COLS * ROWS)
  let arenaCells = 0
  for (let j = 0; j < ROWS; j++) {
    const y = -b + (j + 0.5) * ch
    for (let i = 0; i < COLS; i++) {
      const x = -a + (i + 0.5) * cw
      if ((x / a) ** 2 + (y / b) ** 2 > 1) continue
      let foot = false
      for (const t of map.towers) if (!t.outside && Math.hypot(x - t.x, y - t.y) < t.segments[0]!.r0) foot = true
      if (foot) continue
      inArena[j * COLS + i] = 1
      arenaCells++
    }
  }
  const hulls = allocHulls(map.towers)
  const mask = new Uint8Array(COLS * ROWS)
  const iv = { lo: 0, hi: 0 }
  const cov = TIMES.map((t) => {
    const s = makeSun(t, RULES.roundSunSeconds)
    updateHulls(map.towers, s.cotE, s.shadowDirX, s.shadowDirY, hulls)
    mask.fill(0)
    for (const h of hulls) {
      const j0 = Math.max(0, Math.floor((h.minY + b) / ch - 0.5))
      const j1 = Math.min(ROWS - 1, Math.ceil((h.maxY + b) / ch - 0.5))
      for (let j = j0; j <= j1; j++) {
        const y = -b + (j + 0.5) * ch
        if (!hullRowInterval(h, y, iv)) continue
        const i0 = Math.max(0, Math.ceil((iv.lo + a) / cw - 0.5))
        const i1 = Math.min(COLS - 1, Math.floor((iv.hi + a) / cw - 0.5))
        for (let i = i0; i <= i1; i++) mask[j * COLS + i] = 1
      }
    }
    let c = 0
    for (let k = 0; k < mask.length; k++) if (mask[k] && inArena[k]) c++
    return (100 * c) / arenaCells
  })
  // règles de placement
  const issues: string[] = []
  const inner = map.towers.filter((t) => !t.outside)
  for (let i = 0; i < inner.length; i++)
    for (let j = i + 1; j < inner.length; j++) {
      const d = Math.hypot(inner[i]!.x - inner[j]!.x, inner[i]!.y - inner[j]!.y)
      if (d < RULES.towerMinSpacing - 0.01) issues.push(`espacement ${inner[i]!.id}-${inner[j]!.id} ${d.toFixed(1)} m`)
    }
  for (const t of inner) {
    const e = ellipseEdgeDistance(t.x, t.y, a, b)
    if (e < RULES.towerEdgeMargin - 0.01) issues.push(`bord ${t.id} ${e.toFixed(1)} m`)
    for (const s of t.segments) if (s.z0 < RULES.towerWideMinZ && Math.max(s.r0, s.z1 <= RULES.towerWideMinZ ? s.r1 : 0) > RULES.towerLowMaxRadius) issues.push(`large sous 24 m : tour ${t.id}`)
  }
  for (const t of map.towers.filter((t) => t.outside)) if (ellipseEdgeDistance(t.x, t.y, a, b) > -t.trunkRadius) issues.push(`tour extérieure ${t.id} dans l'arène`)
  return { cov, issues }
}

const maps = (process.argv.slice(2) as MapId[]).filter((m) => MAP_IDS.includes(m))
const list: MapId[] = maps.length ? maps : ['parasols', 'aiguilles', 'geantes', 'cadran']
console.log(`Couverture des ombres de tours (% de l'arène) aux instants ${TIMES.join(' / ')} s\n`)
for (const id of list) {
  const map = getMap(id, 6)
  console.log(`## ${id} (preset 5-6) : ${map.towers.length} tours`)
  const names = towerNames(id, 6)
  for (const t of map.towers)
    console.log(
      `  ${names[t.id]!.padEnd(22)} ${t.archetype.padEnd(9)} (${t.x.toFixed(1)}, ${t.y.toFixed(1)}) h ${t.height.toFixed(1)} fût ${t.trunkRadius.toFixed(2)} segs ${t.segments.length}${t.outside ? ' [hors arène]' : ''}`,
    )
  for (let p = 0; p < RULES.arenaPresets.length; p++) {
    const n = RULES.arenaPresets[p]!.maxBirds
    const { cov, issues } = coverage(id, n)
    const ref = p === 3 && GDD[id] ? `   GDD ${GDD[id]!.map((v) => v.toFixed(1)).join(' / ')}` : ''
    const preset = arenaPresetFor(n)
    console.log(
      `  N≤${String(n).padEnd(2)} ${String(preset.a).padStart(3)}×${preset.b} ${String(getMap(id, n).towers.length).padStart(2)} tours : ${cov.map((v) => v.toFixed(1).padStart(4)).join(' / ')}${ref}${issues.length ? '   ⚠ ' + issues.join(', ') : ''}`,
    )
  }
  console.log()
}
{
  const m = getMap('lobby', 1)
  const { cov, issues } = coverage('lobby', 1)
  console.log(`## lobby : arène ${m.arena.a}×${m.arena.b}, ${m.towers.length} tour ; couverture ${cov.map((v) => v.toFixed(1)).join(' / ')} ${issues.join(', ')}`)
}
