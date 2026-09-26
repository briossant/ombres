// Vues de dessus d'une manche simulée à des instants donnés (PNG).
//   npx tsx tools/sim-render.ts [--map=parasols] [--n=6] [--policy=mixed] [--times=0,30,55,85,98,104,110] [--out=shots/sim] [--seed=1] [--mirror]
import { mkdirSync } from 'node:fs'
import { createSimulation } from '../src/sim/simulation.ts'
import type { BirdInput, MapId } from '../src/sim/types.ts'
import { makePolicy, type PolicyName } from '../src/sim/harness.ts'
import { drawState } from './sim-draw.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const mapId = (opt.map ?? 'parasols') as MapId
const n = +(opt.n ?? 6)
const policies = (opt.policy ?? 'mixed').split(',') as PolicyName[]
const times = (opt.times ?? '0,30,55,85,98,104,110').split(',').map(Number)
const out = opt.out ?? 'shots/sim'
const seed = +(opt.seed ?? 1)
const T = +(opt.T ?? 110)
mkdirSync(out, { recursive: true })

const sim = createSimulation({ mode: 'round', seed, mapId, mirror: opt.mirror === 'true', birds: Array.from({ length: n }, (_, i) => ({ slot: i, assist: false })), sunSeconds: T, countdown: true })
const pols = Array.from({ length: n }, (_, i) => makePolicy(policies[i % policies.length]!, i, seed * 101 + i))
const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
let next = 0
const hullsOpt = opt.hulls === 'true'
while (!sim.state.over && next < times.length) {
  for (const b of sim.state.birds) inputs[b.slot] = pols[b.slot]!(sim.state, b.slot)
  sim.step(inputs)
  if (sim.state.sun.t >= times[next]! - 1e-6) {
    const img = drawState(sim.state, { label: `${mapId} N${n}`, hulls: hullsOpt })
    const file = `${out}/${mapId}-n${n}-t${String(times[next]).padStart(3, '0')}.png`
    img.savePng(file)
    console.log(file)
    next++
  }
}
