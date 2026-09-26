// Fumée : une manche de 6 oiseaux avec entrées aléatoires, compte les événements.
import { createSimulation } from '../src/sim/simulation.ts'
import type { BirdInput, SimEvent } from '../src/sim/types.ts'
import { mulberry32 } from '../src/sim/rng.ts'

const n = +(process.argv[2] ?? 6)
const sim = createSimulation({ mode: 'round', seed: 1, mapId: 'parasols', birds: Array.from({ length: n }, (_, i) => ({ slot: i, assist: false })), sunSeconds: 110, countdown: true })
const rnd = mulberry32(3)
const inputs: BirdInput[] = Array.from({ length: n }, () => ({ dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }))
const counts: Record<string, number> = {}
let ticks = 0
const t0 = performance.now()
let maxMs = 0
while (!sim.state.over && ticks < 30 * 130) {
  for (let i = 0; i < n; i++) {
    const inp = inputs[i]!
    if (rnd() < 0.03) { const a = rnd() * Math.PI * 2; inp.dirX = Math.cos(a); inp.dirY = Math.sin(a) }
    if (rnd() < 0.02) inp.dive = !inp.dive
    if (rnd() < 0.01) inp.divePresses++
    if (rnd() < 0.01) inp.flapPresses++
  }
  const s = performance.now()
  const ev: SimEvent[] = sim.step(inputs)
  maxMs = Math.max(maxMs, performance.now() - s)
  for (const e of ev) counts[e.type] = (counts[e.type] ?? 0) + 1
  ticks++
}
const el = performance.now() - t0
console.log('ticks', ticks, 'over', sim.state.over, 'ms/tick', (el / ticks).toFixed(3), 'max', maxMs.toFixed(2))
console.log(counts)
const g = sim.state.grid
console.log('counts', Array.from(g.counts).slice(0, n + 1).map((c) => (100 * c / g.arenaCells).toFixed(1)).join(' '), 'arena', g.arenaCells)
console.log('stats', sim.state.stats.slice(0, n).map((s) => s && `${s.hits}/${s.misses}/${s.divesStarted} low ${s.timeLow.toFixed(0)} hid ${s.hiddenTime.toFixed(1)}`).join(' | '))
