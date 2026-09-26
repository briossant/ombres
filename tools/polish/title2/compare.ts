// Avant / après, même juge : filme les mêmes démos (mêmes graines, cartes, ralenti de la dernière
// seconde) avec la caméra du titre d'avant la vague 2 (copie figée dans `_old/`) ou celle d'aujourd'hui,
// et juge chaque image (10 Hz) avec le juge strict d'aujourd'hui en mode « plan large » (sans sujet
// désigné : tours, cases de l'UI, oiseaux sous l'UI ou sur l'objectif, au moins un oiseau net), le seul
// commun aux deux caméras.
//   npx tsx tools/polish/title2/compare.ts [--old] [--seeds=1,2,3]
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdState, MapId, SimEvent } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { createBot, demoTeam } from '../../../src/bots/index.ts'
import { Emitter } from '../../../src/host/bus.ts'
import { InputRouter, type LocalInput } from '../../../src/input/router.ts'
import { cueCamera } from '../../../src/host/camera/cue.ts'
import { BirdSet, frameFault, predictBirds, TITLE_LAYOUT } from '../../../src/host/camera/cine.ts'
import { demoFuture } from '../../../src/host/camera/demoFuture.ts'
import { worldView } from '../../../src/host/render/worldView.ts'
import type { GameView } from '../../../src/host/view.ts'
import type { Pose } from '../../../src/host/camera/math.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const seeds = String(opt.seeds ?? '1,2,3').split(',').map(Number)
const maps: MapId[] = ['parasols', 'aiguilles', 'geantes', 'cadran']
const OLD = !!opt.old
const { CameraDirector } = OLD ? await import('./_old/director.ts') : await import('../../../src/host/camera/director.ts')

function hashSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const events = new Emitter<SimEvent>()
const dir = new CameraDirector(events)
cueCamera('title', { cut: true })
const birds = new BirdSet()
let total = 0
let bad = 0
const by: Record<string, number> = {}
for (const seed of seeds)
  for (const map of maps) {
    const team = demoTeam(6, seed)
    const sim = createSimulation({ mode: 'demo', seed, mapId: map, birds: team.map((_, i) => ({ slot: i, assist: false })), sunSeconds: RULES.titleDemoSunSeconds, countdown: false })
    const mk = () => team.map((spec, i) => createBot({ slot: i, personality: spec.personality, level: spec.level, seed: hashSeed(seed, i) }))
    const router = new InputRouter(null as unknown as LocalInput)
    router.reset()
    for (const b of mk()) router.set(b.slot, { kind: 'bot', bot: b })
    if (!OLD) {
      demoFuture.prebuild(sim.state, mk())
      demoFuture.warm(sim.state)
      demoFuture.begin(sim.state)
    }
    const prev: (BirdState | undefined)[] = new Array(12).fill(undefined)
    const view: GameView = { sim: sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
    let evs: SimEvent[] = []
    let over = false
    let frame = 0
    const TICK = 1 / RULES.tickHz
    let acc = TICK
    while (!over) {
      for (const b of sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
      evs = sim.step(router.collect(sim.state, evs))
      if (!OLD) demoFuture.follow(sim.state)
      for (const e of evs) {
        events.emit(e)
        if (e.type === 'territoryReset') over = true
      }
      if (over) break
      acc -= TICK
      for (;;) {
        const scale = sim.state.timeScaleHint
        if (acc + scale / 60 > TICK + 1e-9) break
        acc += scale / 60
        view.timeScale = scale
        view.alpha = Math.max(0, acc / TICK)
        view.realTime += 1 / 60
        const pose: Pose = dir.update(1 / 60, view, 16 / 9)
        if (frame++ % 6 !== 0) continue
        predictBirds(sim.state, view, 0, birds)
        const f = frameFault(sim.state, birds, pose, 16 / 9, TITLE_LAYOUT, worldView.hideStorm, -1)
        total++
        if (f) {
          bad++
          by[f] = (by[f] ?? 0) + 1
        }
      }
    }
  }
console.log(`${OLD ? 'AVANT' : 'APRÈS'} : ${total} images, ${bad} ratées (${((100 * bad) / total).toFixed(1)} %) ${JSON.stringify(by)}`)
