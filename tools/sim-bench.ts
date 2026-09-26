// Mesure du coût de step() dans Node : 12 oiseaux, politiques scriptées, par phase.
// La machine étant partagée, chaque manche (déterministe) est rejouée R fois et l'on
// garde, tick par tick, le temps minimal : on retire ainsi les préemptions externes.
//   npx tsx tools/sim-bench.ts [n=12] [repeats=3] [map=parasols]
import { createSimulation } from '../src/sim/simulation.ts'
import { makePolicy } from '../src/sim/harness.ts'
import type { BirdInput, MapId } from '../src/sim/types.ts'

const n = +(process.argv[2] ?? 12)
const repeats = +(process.argv[3] ?? 3)
const mapId = (process.argv[4] ?? 'parasols') as MapId

function run(): { times: number[]; phases: string[] } {
  const sim = createSimulation({ mode: 'round', seed: 50, mapId, birds: Array.from({ length: n }, (_, i) => ({ slot: i, assist: false })), sunSeconds: 110, countdown: true })
  const pols = Array.from({ length: n }, (_, i) => makePolicy(i % 4 === 3 ? 'hunter' : 'mixed', i, 31 + i))
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  const times: number[] = []
  const phases: string[] = []
  while (!sim.state.over) {
    for (const b of sim.state.birds) inputs[b.slot] = pols[b.slot]!(sim.state, b.slot)
    phases.push(sim.state.sun.phase)
    const t0 = performance.now()
    sim.step(inputs)
    times.push(performance.now() - t0)
  }
  return { times, phases }
}

run() // chauffe du JIT
let best: number[] | null = null
let phases: string[] = []
for (let r = 0; r < repeats; r++) {
  const res = run()
  phases = res.phases
  best = best ? best.map((v, i) => Math.min(v, res.times[i] ?? v)) : res.times
}
const byPhase: Record<string, number[]> = {}
best!.forEach((v, i) => (byPhase[phases[i]!] ??= []).push(v))
console.log(`step() — ${n} oiseaux, carte ${mapId}, minimum par tick sur ${repeats} répétitions`)
const all: number[] = []
for (const [phase, v] of Object.entries(byPhase)) {
  all.push(...v)
  const s = [...v].sort((a, b) => a - b)
  const mean = v.reduce((a, b) => a + b, 0) / v.length
  console.log(`  ${phase.padEnd(12)} moyenne ${mean.toFixed(3)} ms   p50 ${s[s.length >> 1]!.toFixed(3)}   p99 ${s[Math.floor(s.length * 0.99)]!.toFixed(3)}   max ${s[s.length - 1]!.toFixed(2)}`)
}
const s = all.sort((a, b) => a - b)
console.log(`  TOTAL        moyenne ${(all.reduce((a, b) => a + b, 0) / all.length).toFixed(3)} ms   p99 ${s[Math.floor(s.length * 0.99)]!.toFixed(3)}   max ${s[s.length - 1]!.toFixed(2)}`)
