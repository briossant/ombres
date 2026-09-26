// Aide : segments des tours d'une carte (pour régler la dissolution des chapeaux).
import { createSimulation } from '../../../src/sim/simulation.ts'
import { RULES } from '../../../src/sim/rules.ts'
for (const mapId of ['parasols', 'geantes', 'cadran'] as const) {
  const sim = createSimulation({ mode: 'round', seed: 1, mapId, birds: Array.from({ length: 4 }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: false })
  for (const t of sim.state.towers) console.log(mapId, t.id, t.archetype, 'trunk', t.trunkRadius, t.segments.map((g) => `[${g.z0.toFixed(1)}-${g.z1.toFixed(1)} r${g.r0.toFixed(1)}→${g.r1.toFixed(1)}${g.ox1 ? ` o${g.ox1.toFixed(1)},${(g.oy1 ?? 0).toFixed(1)}` : ''}]`).join(' '))
}
