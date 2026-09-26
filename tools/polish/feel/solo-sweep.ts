// Difficulté du solo (critique game feel) : un « humain » (politique scriptée, plusieurs profils)
// contre la composition par défaut de defaultBots(1, niveau), aux trois niveaux. Manches headless.
//   npx tsx tools/polish/feel/solo-sweep.ts [--rounds=24] [--humans=1]
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdInput, MapId, SimEvent } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { makePolicy, type Policy } from '../../../src/sim/harness.ts'
import { createBot, defaultBots, type Bot, type BotLevel } from '../../../src/bots/index.ts'

const opt = Object.fromEntries(process.argv.slice(2).map(a => a.replace(/^--/, '').split('=')))
const ROUNDS = Number(opt.rounds ?? 24)
const HUMANS = Number(opt.humans ?? 1)
const MAPS: MapId[] = ['parasols', 'aiguilles', 'geantes', 'cadran']

type Profile = { label: string; make: (slot: number, seed: number) => Policy }
const PROFILES: Profile[] = [
  { label: 'inactif (ne touche à rien)', make: (s, seed) => makePolicy('idle', s, seed) },
  { label: 'débutant (mixte, réaction 0,5 s, bruit 25°, 40 % oublis)', make: (s, seed) => makePolicy('mixed', s, seed, { flapReactMean: 0.5, flapReactSd: 0.12, flapForget: 0.4, headingNoiseDeg: 25, decisionMin: 0.9, decisionMax: 1.4, lockHold: 0.8 }) },
  { label: 'toujours haut', make: (s, seed) => makePolicy('high', s, seed) },
  { label: 'toujours bas', make: (s, seed) => makePolicy('low', s, seed) },
  { label: 'appliqué (mixte)', make: (s, seed) => makePolicy('mixed', s, seed) },
  { label: 'chasseur', make: (s, seed) => makePolicy('hunter', s, seed) },
]

function round(profile: Profile, level: BotLevel, r: number) {
  const specs = defaultBots(HUMANS, level)
  const n = HUMANS + specs.length
  const seed = 1000 + r * 7919
  const mapId = MAPS[r % MAPS.length]!
  const sim = createSimulation({ mode: 'round', seed, mapId, mirror: r % 2 === 1, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
  const st = sim.state
  // positions tournantes : l'humain prend un slot différent à chaque manche
  const perm = Array.from({ length: n }, (_, i) => (i + r) % n)
  const drivers: ({ bot: Bot } | { policy: Policy })[] = new Array(n)
  const humanSlots: number[] = []
  for (let i = 0; i < n; i++) {
    const slot = perm[i]!
    if (i < HUMANS) {
      drivers[slot] = { policy: profile.make(slot, seed + slot) }
      humanSlots.push(slot)
    } else {
      const sp = specs[i - HUMANS]!
      drivers[slot] = { bot: createBot({ slot, personality: sp.personality, level: sp.level, seed: seed * 31 + slot }) }
    }
  }
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  let events: SimEvent[] = []
  const hitsOnHuman = { got: 0, dodged: 0, attacked: 0, humanHits: 0 }
  while (!st.over) {
    for (let s = 0; s < n; s++) {
      const d = drivers[s]!
      inputs[s] = 'bot' in d ? d.bot.think(st, events) : d.policy(st, s)
    }
    events = sim.step(inputs)
    for (const e of events) {
      if (e.type === 'diveCommit' && humanSlots.includes(e.target)) hitsOnHuman.attacked++
      if (e.type === 'diveHit' && humanSlots.includes(e.target)) hitsOnHuman.got++
      if (e.type === 'diveHit' && humanSlots.includes(e.hunter)) hitsOnHuman.humanHits++
      if (e.type === 'diveMiss' && e.dodged && humanSlots.includes(e.target)) hitsOnHuman.dodged++
    }
  }
  const shares = Array.from({ length: n }, (_, s) => st.grid.counts[s + 1]! / st.grid.arenaCells)
  const order = [...shares.keys()].sort((a, b) => shares[b]! - shares[a]!)
  const winner = order[0]!
  const winnerLabel = humanSlots.includes(winner) ? 'humain' : specs[perm.indexOf(winner) - HUMANS]!.personality
  const h = humanSlots[0]!
  const bestBot = Math.max(...shares.filter((_, s) => !humanSlots.includes(s)))
  return { humanWin: humanSlots.includes(winner), share: shares[h]!, rank: order.indexOf(h) + 1, margin: shares[winner]! - shares[order[1]!]!, bestBot, winnerLabel, ...hitsOnHuman }
}

const pct = (x: number) => (x * 100).toFixed(0) + ' %'
console.log(`# Solo : ${HUMANS} humain(s) contre defaultBots(${HUMANS}, niveau) — ${ROUNDS} manches par case\n`)
for (const level of [0, 1, 2] as BotLevel[]) {
  console.log(`## Niveau ${['Oisillon', 'Voyageur', 'Seigneur'][level]} — bots : ${defaultBots(HUMANS, level).map(b => b.personality).join(', ')}\n`)
  console.log('| profil humain | victoires humain | part moy. | rang moy. | meilleur bot moy. | vainqueurs bots | touché / attaqué | ses touches |')
  console.log('|---|---|---|---|---|---|---|---|')
  for (const p of PROFILES) {
    const res = Array.from({ length: ROUNDS }, (_, r) => round(p, level, r))
    const wins = res.filter(x => x.humanWin).length / ROUNDS
    const share = res.reduce((a, x) => a + x.share, 0) / ROUNDS
    const rank = res.reduce((a, x) => a + x.rank, 0) / ROUNDS
    const bb = res.reduce((a, x) => a + x.bestBot, 0) / ROUNDS
    const wl: Record<string, number> = {}
    for (const x of res) if (!x.humanWin) wl[x.winnerLabel] = (wl[x.winnerLabel] ?? 0) + 1
    const got = res.reduce((a, x) => a + x.got, 0)
    const att = res.reduce((a, x) => a + x.attacked, 0)
    const hh = res.reduce((a, x) => a + x.humanHits, 0)
    console.log(`| ${p.label} | ${pct(wins)} | ${pct(share)} | ${rank.toFixed(2)} | ${pct(bb)} | ${Object.entries(wl).map(([k, v]) => `${k} ${v}`).join(', ')} | ${(got / ROUNDS).toFixed(1)} / ${(att / ROUNDS).toFixed(1)} | ${(hh / ROUNDS).toFixed(1)} |`)
  }
  console.log('')
}
