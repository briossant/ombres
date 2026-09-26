// Banc de performance des bots : 11 bots (+ 1 oiseau neutre) sur une manche complète,
// temps de calcul de TOUS les bots par tick (moyenne, p50, p99, max), hors simulation.
//   npx tsx tools/bots-bench.ts [--bots=11] [--rounds=3] [--map=parasols] [--level=1]
// Machine partagée : on garde, pour chaque statistique, la meilleure des répétitions.
import { createSimulation } from '../src/sim/simulation.ts'
import type { BirdInput, MapId, SimEvent } from '../src/sim/types.ts'
import { RULES } from '../src/sim/rules.ts'
import { createBot, BOT_PERSONALITIES, type Bot, type BotLevel } from '../src/bots/index.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const nBots = +(opt.bots ?? 11)
const reps = +(opt.rounds ?? 3)
const mapId = (opt.map ?? 'parasols') as MapId
const level = +(opt.level ?? 1) as BotLevel
const n = Math.min(12, nBots + 1)

function run(seed: number): { mean: number; p50: number; p99: number; max: number; phases: Record<string, number> } {
  const sim = createSimulation({ mode: 'round', seed, mapId, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
  const bots: Bot[] = Array.from({ length: nBots }, (_, i) => createBot({ slot: i, personality: BOT_PERSONALITIES[i % 7]!, level: (opt.level === 'mix' ? (i % 3) : level) as BotLevel, seed: seed + i }))
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  let events: SimEvent[] = []
  const times: number[] = []
  const byPhase: Record<string, number[]> = {}
  while (!sim.state.over) {
    const t0 = performance.now()
    for (const b of bots) inputs[b.slot] = b.think(sim.state, events)
    const dt = performance.now() - t0
    if (sim.state.sun.t >= 0 && sim.state.sun.t < sim.state.sun.T) {
      times.push(dt)
      ;(byPhase[sim.state.sun.phase] ??= []).push(dt)
    }
    events = sim.step(inputs)
  }
  times.sort((a, b) => a - b)
  const phases: Record<string, number> = {}
  for (const [k, v] of Object.entries(byPhase)) phases[k] = v.reduce((a, b) => a + b, 0) / v.length
  return { mean: times.reduce((a, b) => a + b, 0) / times.length, p50: times[Math.floor(times.length / 2)]!, p99: times[Math.floor(times.length * 0.99)]!, max: times[times.length - 1]!, phases }
}

// tour de chauffe (compilation JIT), puis mesures
run(999)
const results = Array.from({ length: reps }, (_, r) => run(100 + r))
const best = (k: 'mean' | 'p50' | 'p99' | 'max') => Math.min(...results.map((r) => r[k]))
console.log(`${nBots} bots (${opt.level ?? level}), ${mapId}, ${reps} manches : moyenne ${best('mean').toFixed(3)} ms/tick · p50 ${best('p50').toFixed(3)} · p99 ${best('p99').toFixed(3)} · max ${best('max').toFixed(2)}`)
const ph = results.reduce<Record<string, number>>((acc, r) => {
  for (const [k, v] of Object.entries(r.phases)) acc[k] = Math.min(acc[k] ?? Infinity, v)
  return acc
}, {})
console.log('par phase (moyenne, meilleure répétition) :', Object.entries(ph).map(([k, v]) => `${k} ${v.toFixed(3)}`).join(' · '))
