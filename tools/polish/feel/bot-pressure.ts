// Pression des bots sur l'humain en solo (critique game feel) : piqués des bots (lancés, sur l'humain),
// instant du premier piqué de bot, feintes éclair (annulées < 0,2 s après la prise d'élan).
//   npx tsx tools/polish/feel/bot-pressure.ts [--rounds=12] [--policy=low|mixed|high] [--humans=1]
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdInput, MapId, SimEvent } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { makePolicy, type PolicyName } from '../../../src/sim/harness.ts'
import { createBot, defaultBots, type BotLevel } from '../../../src/bots/index.ts'

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const ROUNDS = Number(opt.rounds ?? 12)
const POLICY = (opt.policy ?? 'low') as PolicyName
const HUMANS = Number(opt.humans ?? 1)
const MAPS: MapId[] = ['parasols', 'aiguilles', 'geantes', 'cadran']
console.log(`| niveau | piqués de bots / manche | dont sur un humain | 1er piqué de bot (médiane, s) | 1er piqué sur un humain (médiane, s) | feintes < 0,2 s (sur tous les piqués de bots) | part des manches sans aucun piqué sur un humain |`)
console.log('|---|---|---|---|---|---|---|')
for (const level of [0, 1, 2] as BotLevel[]) {
  let dives = 0, onHuman = 0, quick = 0
  const firsts: number[] = [], firstsH: number[] = []
  let noneOnHuman = 0
  for (let r = 0; r < ROUNDS; r++) {
    const specs = defaultBots(HUMANS, level)
    const n = HUMANS + specs.length
    const seed = 500 + r * 131
    const sim = createSimulation({ mode: 'round', seed, mapId: MAPS[r % 4]!, mirror: r % 2 === 1, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
    const st = sim.state
    const drivers = Array.from({ length: n }, (_, s) => (s < HUMANS ? { p: makePolicy(POLICY, s, seed + s) } : { b: createBot({ slot: s, personality: specs[s - HUMANS]!.personality, level, seed: seed * 7 + s }) }))
    const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
    let events: SimEvent[] = []
    const wt: number[] = new Array(12).fill(-1)
    let first = -1, firstH = -1, onH = 0
    while (!st.over) {
      for (let s = 0; s < n; s++) {
        const d = drivers[s]!
        inputs[s] = d.b ? d.b.think(st, events) : d.p!(st, s)
      }
      events = sim.step(inputs)
      for (const e of events) {
        if (e.type === 'diveWindup' && e.hunter >= HUMANS) {
          dives++
          wt[e.hunter] = st.time
          if (first < 0) first = st.sun.t
          if (e.target < HUMANS) {
            onHuman++
            onH++
            if (firstH < 0) firstH = st.sun.t
          }
        }
        if (e.type === 'diveCancel' && e.hunter >= HUMANS && e.reason === 'feint' && st.time - wt[e.hunter]! < 0.2) quick++
      }
    }
    if (first >= 0) firsts.push(first)
    firstsH.push(firstH >= 0 ? firstH : 110)
    if (onH === 0) noneOnHuman++
  }
  const med = (a: number[]) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.floor(b.length / 2)]! : NaN }
  console.log(`| ${['Oisillon', 'Voyageur', 'Seigneur'][level]} | ${(dives / ROUNDS).toFixed(1)} | ${(onHuman / ROUNDS).toFixed(1)} | ${med(firsts).toFixed(0)} | ${med(firstsH).toFixed(0)} | ${quick} / ${dives} | ${Math.round((100 * noneOnHuman) / ROUNDS)} % |`)
}
