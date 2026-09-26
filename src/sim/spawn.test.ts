// Régression (agent bots, parties d'arène) : dans les petites arènes encombrées, aucune
// place dégagée n'était trouvée à ±60° sur l'anneau d'apparition ; l'oiseau apparaissait
// alors à moins d'1 m d'un fût et sa boucle du compte à rebours traversait la tour
// (7 configurations sur 1 152). Voir docs/research/balance-report.md §5.
import { describe, expect, it } from 'vitest'
import { createSimulation } from './simulation.ts'
import { trunkAt } from './towers.ts'
import type { MapId } from './types.ts'

describe('apparition et compte à rebours', () => {
  it('aucun oiseau n’apparaît contre un fût ni ne le traverse pendant le compte à rebours', () => {
    const c = { x: 0, y: 0 }
    let minSpawn = Infinity
    let minLoop = Infinity
    for (const mapId of ['parasols', 'aiguilles', 'geantes', 'cadran'] as MapId[]) {
      for (const mirror of [false, true]) {
        for (let n = 1; n <= 12; n++) {
          for (const seed of [7, 11]) {
            const sim = createSimulation({ mode: 'round', seed: seed * 7919 + n, mapId, mirror, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: 110, countdown: true })
            for (const b of sim.state.birds) for (const t of sim.state.towers) if (!t.outside) minSpawn = Math.min(minSpawn, Math.hypot(b.x - t.x, b.y - t.y) - t.trunkRadius)
            while (sim.state.sun.t < 0) {
              sim.step([])
              for (const b of sim.state.birds) {
                for (const t of sim.state.towers) {
                  if (t.outside) continue
                  const r = trunkAt(t, b.z, c)
                  if (r > 0) minLoop = Math.min(minLoop, Math.hypot(c.x - b.x, c.y - b.y) - r)
                }
              }
            }
          }
        }
      }
    }
    expect(minSpawn).toBeGreaterThan(20)
    expect(minLoop).toBeGreaterThan(0)
  }, 120_000)
})
