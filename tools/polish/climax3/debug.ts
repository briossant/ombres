// Débogage : couverture des tours des parades candidates à un instant donné (carte, graine, t).
//   npx tsx tools/polish/climax3/debug.ts (copie de climax/debug-cover.ts : parades autour du cadre sans recul) --map=geantes --seed=1 --t=101.3 [--n=4]
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdInput, BirdState, MapId, SimEvent } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { createBot, defaultBots, type Bot } from '../../../src/bots/index.ts'
import { Emitter } from '../../../src/host/bus.ts'
import { CameraDirector } from '../../../src/host/camera/director.ts'
import { cueCamera } from '../../../src/host/camera/cue.ts'
import { towerCoverage } from '../../../src/host/camera/framingRig.ts'
import { towerClearance, towerCoverStats } from '../../../src/host/camera/towerCover.ts'
import { birdAnchors } from '../../../src/host/render/bird/anchors.ts'
import type { GameView } from '../../../src/host/view.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const n = +(opt.n ?? 4)
const seed = +(opt.seed ?? 1)
const map = (opt.map ?? 'geantes') as MapId
const T = +(opt.t ?? 101)
const aspect = 16 / 9
const events = new Emitter<SimEvent>()
const dir = new CameraDirector(events)
const sim = createSimulation({ mode: 'round', seed, mapId: map, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
const specs = defaultBots(0, 1)
// --dev : mêmes bots que la page de dev (src/dev/camera/runner.ts)
const DEV = ['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'fool', 'watchmaker'] as const
const bots: Bot[] = Array.from({ length: n }, (_, slot) =>
  opt.dev ? createBot({ slot, personality: DEV[slot % 7]!, level: (slot % 3) as 0 | 1 | 2, seed: seed * 13 + slot }) : createBot({ slot, personality: specs[slot % specs.length]!.personality, level: 1, seed: seed * 1000 + slot }),
)
const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
const prev: (BirdState | undefined)[] = new Array(12).fill(undefined)
const view: GameView = { sim: sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
for (let s = 0; s < n; s++) view.players[s] = { slot: s, colorIndex: s, name: '', kind: s === 0 ? 'keyboard' : 'bot', assist: false }
birdAnchors.scale.fill(1.3)
cueCamera('round', { cut: true })
let evs: SimEvent[] = []
const every = +(opt.every ?? 0)
let nextLog = T - every * 6
while (sim.state.sun.t < T) {
  if (every > 0 && sim.state.sun.t >= nextLog) {
    nextLog += every
    const F0 = dir.framing as unknown as Record<string, any>
    console.log(`  t=${sim.state.sun.t.toFixed(1)} larg ${dir.framing.width.toFixed(0)} relève ${((F0.boost.x * 180) / Math.PI).toFixed(1)}° (but ${((F0.boostGoal * 180) / Math.PI).toFixed(1)}) recul ×${Math.exp(F0.widen.x).toFixed(2)} (but ×${Math.exp(F0.widenGoal).toFixed(2)}) glisse (${(F0.shiftGoalX ?? 0).toFixed(0)}, ${(F0.shiftGoalY ?? 0).toFixed(0)}) cible (${dir.framing.rig.tx.toFixed(0)}, ${dir.framing.rig.ty.toFixed(0)}) visée (${F0.goalX.toFixed(0)}, ${F0.goalY.toFixed(0)}) caméra ${(100 * F0.towerCover).toFixed(1)} % réel ${(100 * towerCoverage(sim.state, dir.framing.rig, aspect, 0.5, Infinity, 60)).toFixed(1)} % sans parade ${(100 * F0.coverTrace.base).toFixed(1)} % prévu ${(100 * F0.coverTrace.chosen).toFixed(1)} % masque ${F0.gsMask.toString(2)} gsLow ${F0.gsLow.x.toFixed(2)} choix ${F0.coverTrace.pick}`)
  }
  for (const b of bots) inputs[b.slot] = b.think(sim.state, evs)
  for (const b of sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
  evs = sim.step(inputs)
  for (const e of evs) events.emit(e)
  for (const alpha of [0.5, 1]) {
    view.alpha = alpha
    dir.update(1 / 60, view, aspect)
  }
}
const F = dir.framing as unknown as Record<string, any>
const r = { ...dir.framing.rig }
const deg = (x: number) => ((x * 180) / Math.PI).toFixed(1)
const w0 = Math.exp(F.widen.x)
console.log(`t=${sim.state.sun.t.toFixed(2)} rig tx ${r.tx.toFixed(0)} ty ${r.ty.toFixed(0)} pitch ${deg(r.pitch)} dist ${r.dist.toFixed(0)} (sans recul ${(r.dist / w0).toFixed(0)}) boost ${deg(F.boost.x)} widen ×${w0.toFixed(2)} gsLow ${F.gsLow.x.toFixed(2)} masque ${F.gsMask.toString(2)}`)
for (const b of sim.state.birds) console.log(`  oiseau ${b.slot} (${b.x.toFixed(0)}, ${b.y.toFixed(0)}, ${b.z.toFixed(0)})${b.slot === sim.state.crownSlot ? ' couronne' : ''}`)
// candidats autour du cadre SANS recul : recul k, relève b (°), glissement est dx (m), nord dy (m)
const base = { ...r, pitch: r.pitch - F.boost.x, dist: r.dist / w0 }
for (const [k, b, dx, dy] of [[1, 0, 0, 0], [1, 5, 0, 0], [1, 8, 0, 0], [1, 14, 0, 0], [1, -6, 0, 0], [1.2, 0, 0, 0], [1.45, 0, 0, 0], [1.8, 0, 0, 0], [1, 0, 30, 0], [1, 0, -30, 0], [1, 0, 50, 0], [1, 0, -50, 0], [1, 0, 0, 30], [1, 0, 0, -30], [0.85, 0, 0, 0], [0.7, 0, 0, 0], [1.2, 5, 0, 0], [1, 5, 30, 0]] as const) {
  const q = { ...base, pitch: base.pitch + (b * Math.PI) / 180, dist: base.dist * k, tx: base.tx + dx, ty: base.ty + dy }
  const c = towerCoverage(sim.state, q, aspect)
  const mw = towerCoverStats.maxWidth
  const cp = Math.cos(q.pitch)
  const cl = towerClearance(sim.state, q.tx, q.ty - cp * q.dist, Math.sin(q.pitch) * q.dist)
  console.log(`  ×${k} ${b >= 0 ? '+' : ''}${b}° dx ${dx} dy ${dy} : couverture ${(100 * c).toFixed(1)} % (plus large ${(100 * mw).toFixed(0)} %), dégagement ${cl.toFixed(0)} m, caméra (${q.tx.toFixed(0)}, ${(q.ty - cp * q.dist).toFixed(0)}, ${(Math.sin(q.pitch) * q.dist).toFixed(0)})`)
}
