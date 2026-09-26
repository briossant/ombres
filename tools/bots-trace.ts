// Vues de dessus d'une manche de bots avec les trajectoires récentes de chaque oiseau :
// pour juger à l'œil les signatures des caractères (cercles, sillons, lignes droites…).
//   npx tsx tools/bots-trace.ts [--p=falcon,ploughman,...] [--level=1] [--seed=1] [--map=parasols]
//                               [--times=20,45,70,95,105] [--trail=8] [--out=shots/bots] [--name=trace] [--only=0,2]
import { mkdirSync } from 'node:fs'
import { createSimulation } from '../src/sim/simulation.ts'
import type { BirdInput, MapId, SimEvent, SimMode } from '../src/sim/types.ts'
import { RULES } from '../src/sim/rules.ts'
import { PLAYER_COLORS } from '../src/shared/players.ts'
import { createBot, createLobbyDummy, BOT_PERSONALITIES, type Bot, type BotLevel, type BotPersonality } from '../src/bots/index.ts'
import { drawState } from './sim-draw.ts'
import { hex, mix } from './sim-image.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const pers = (opt.p ? opt.p.split(',') : BOT_PERSONALITIES.slice(0, 6)) as (BotPersonality | 'dummy')[]
const levels = (opt.level ?? '1').split(',').map(Number) as BotLevel[]
const seed = +(opt.seed ?? 1)
const mode = (opt.mode ?? 'round') as SimMode
const mapId = (opt.map ?? (mode === 'lobby' ? 'lobby' : 'parasols')) as MapId
const T = mode === 'demo' ? RULES.titleDemoSunSeconds : +(opt.T ?? RULES.roundSunSeconds)
const times = (opt.times ?? '20,45,70,95,105').split(',').map(Number)
const trailSec = +(opt.trail ?? 8)
const out = opt.out ?? 'shots/bots'
const name = opt.name ?? 'trace'
/** Slots dont on dessine la trajectoire (défaut : tous). */
const only = opt.only ? new Set(opt.only.split(',').map(Number)) : null
mkdirSync(out, { recursive: true })
const n = pers.length
const sim = createSimulation({ mode, seed, mapId, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: T, countdown: mode === 'round' })
const bots: Bot[] = pers.map((p, slot) => (p === 'dummy' ? createLobbyDummy(slot) : createBot({ slot, personality: p, level: levels[slot % levels.length]!, seed: seed * 1000 + slot })))
const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
let events: SimEvent[] = []
const hist: { x: number; y: number; z: number; dive: boolean }[][] = bots.map(() => [])
const keep = Math.round(trailSec * RULES.tickHz)
let next = 0
const clock = () => (mode === 'lobby' ? sim.state.time : sim.state.sun.t)
while (next < times.length && !sim.state.over) {
  for (const b of bots) inputs[b.slot] = b.think(sim.state, events)
  events = sim.step(inputs)
  for (const b of sim.state.birds) {
    const h = hist[b.slot]!
    h.push({ x: b.x, y: b.y, z: b.z, dive: b.dive !== 'none' })
    if (h.length > keep) h.shift()
  }
  if (clock() >= times[next]! - 1e-6) {
    const st = sim.state
    const img = drawState(st, { label: `${mapId} ${pers.join(' ')}` })
    const g = st.grid
    const toPx = (x: number, y: number): [number, number] => [((x - g.x0) / g.cellW) * 2, 28 + (g.rows - (y - g.y0) / g.cellH) * 2]
    for (const b of bots) {
      if (only && !only.has(b.slot)) continue
      const h = hist[b.slot]!
      const c = hex(PLAYER_COLORS[b.slot % 12]!.hex)
      for (let i = 1; i < h.length; i++) {
        const [x0, y0] = toPx(h[i - 1]!.x, h[i - 1]!.y)
        const [x1, y1] = toPx(h[i]!.x, h[i]!.y)
        const age = 1 - i / h.length
        const col = h[i]!.dive ? hex('#C0282D') : h[i]!.z <= RULES.strongMaxAlt ? mix(c, hex('#2B1D23'), 0.55) : c
        img.line(x0, y0, x1, y1, col, h[i]!.z <= RULES.strongMaxAlt ? 3 : 2, 0.95 - 0.6 * age)
      }
      const me = st.bySlot[b.slot]
      if (me) {
        const [bx, by] = toPx(me.x, me.y)
        img.text(bx + 10, by - 18, `${b.personality === 'ploughman' && pers[b.slot] === 'dummy' ? 'DUMMY' : b.personality.toUpperCase()} ${b.intent.kind.toUpperCase()}`, hex('#2B1D23'), 1)
      }
    }
    const file = `${out}/${name}-t${String(times[next]).padStart(3, '0')}.png`
    img.savePng(file)
    console.log(file)
    next++
  }
}
