// Fumée : une manche de bots, résumé par oiseau (développement du module bots).
//   npx tsx tools/bots-smoke.ts [--n=6] [--seed=1] [--map=parasols] [--level=1] [--p=falcon,ploughman,...]
import { createSimulation } from '../src/sim/simulation.ts'
import type { BirdInput, MapId, SimEvent } from '../src/sim/types.ts'
import { RULES } from '../src/sim/rules.ts'
import { createBot, BOT_PERSONALITIES, type Bot, type BotLevel, type BotPersonality } from '../src/bots/index.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const n = +(opt.n ?? 6)
const seed = +(opt.seed ?? 1)
const mapId = (opt.map ?? 'parasols') as MapId
const level = +(opt.level ?? 1) as BotLevel
const pers = (opt.p ? opt.p.split(',') : BOT_PERSONALITIES) as BotPersonality[]
const sim = createSimulation({ mode: 'round', seed, mapId, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
const bots: Bot[] = Array.from({ length: n }, (_, slot) => createBot({ slot, personality: pers[slot % pers.length]!, level, seed: seed * 1000 + slot }))
const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
let events: SimEvent[] = []
let botMs = 0, simMs = 0, ticks = 0, botMax = 0
const intents = new Map<string, number>()
const counts: Record<string, number> = {}
while (!sim.state.over) {
  const t0 = performance.now()
  for (const b of bots) inputs[b.slot] = b.think(sim.state, events)
  const t1 = performance.now()
  events = sim.step(inputs)
  const t2 = performance.now()
  botMs += t1 - t0; simMs += t2 - t1; ticks++; botMax = Math.max(botMax, t1 - t0)
  for (const b of bots) { const k = `${b.slot}:${b.intent.kind}`; intents.set(k, (intents.get(k) ?? 0) + 1) }
  for (const e of events) counts[e.type] = (counts[e.type] ?? 0) + 1
  for (const b of sim.state.birds) if (!Number.isFinite(b.x + b.y + b.z + b.heading)) throw new Error('NaN bird ' + b.slot)
}
const st = sim.state
console.log(`map ${mapId} n=${n} level=${level} ticks=${ticks} bot ${(botMs / ticks).toFixed(3)} ms/tick (max ${botMax.toFixed(2)}) sim ${(simMs / ticks).toFixed(3)} ms/tick`)
console.log('events', JSON.stringify(counts))
for (const b of bots) {
  const s = st.stats[b.slot]!
  const share = st.grid.counts[b.slot + 1]! / st.grid.arenaCells
  const it = [...intents.entries()].filter(([k]) => k.startsWith(b.slot + ':')).map(([k, v]) => `${k.split(':')[1]} ${(100 * v / ticks).toFixed(0)}%`).join(' ')
  console.log(`${b.slot} ${b.personality.padEnd(10)} L${b.level} share ${(100 * share).toFixed(1).padStart(5)}% low ${(100 * s.timeLow / (s.timeLow + s.timeHigh)).toFixed(0).padStart(3)}% dives ${s.divesStarted} hits ${s.hits} miss ${s.misses} feints ${s.feints} gotHit ${s.gotHit} dodges ${s.dodges} hidden ${s.hiddenTime.toFixed(1)}s storm ${s.stormTime.toFixed(1)}s | ${it}`)
}
console.log('neutral', (100 * st.grid.counts[0]! / st.grid.arenaCells).toFixed(1) + '%')
