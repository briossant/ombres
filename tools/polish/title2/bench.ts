// Banc headless de la cinématique du titre (polish vague 2, correcteur title) : vraie démo (sim
// 'demo', équipe demoTeam, vrais bots, 4 cartes en rotation comme le runner), vrai CameraDirector en
// mode 'title' à 60 i/s, sans navigateur ni GPU. Juge chaque image rendue (10 Hz) avec frameFault
// (cine.ts : tour > 12 % ou au premier plan, tour derrière le logo, oiseau sous l'UI, sujet caché /
// coupé / absent / trop petit, oiseau sur l'objectif, Simoun en gros plan). Mesure aussi le rythme
// (coupes, durée des prises), les replis et le coût des choix de prise (pire frame).
//   npx tsx tools/polish/title2/bench.ts [--seeds=1,2,3] [--maps=parasols,aiguilles,geantes,cadran] [--aspect=1.7778] [--log]
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdState, MapId, SimEvent } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { createBot, demoTeam, type Bot } from '../../../src/bots/index.ts'
import { Emitter } from '../../../src/host/bus.ts'
import { InputRouter, type LocalInput } from '../../../src/input/router.ts'
import { CameraDirector } from '../../../src/host/camera/director.ts'
import { cameraBeats, cameraState, cueCamera } from '../../../src/host/camera/cue.ts'
import { cineDebug, faultInfo, type CineShot } from '../../../src/host/camera/cine.ts'
import { worldView } from '../../../src/host/render/worldView.ts'
import { demoFuture } from '../../../src/host/camera/demoFuture.ts'
import type { GameView } from '../../../src/host/view.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const seeds = String(opt.seeds ?? '1,2,3').split(',').map(Number)
const maps = String(opt.maps ?? 'parasols,aiguilles,geantes,cadran').split(',') as MapId[]
const aspect = Number(opt.aspect ?? 16 / 9)
const LOG = !!opt.log
if (opt.plans) cineDebug.log = (m) => console.log(m)

function hashSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

const events = new Emitter<SimEvent>()
const dir = new CameraDirector(events)
const D = dir as unknown as { shot: CineShot; spare: CineShot }
// --boot=S : la première démo tourne S s derrière l'écran de chargement (caméra 'loading'), puis coupe sur le titre
const BOOT = Number(opt.boot ?? 0)
// --credits : la caméra des crédits (mêmes plans, fondus lents) ; vérifie seulement les poses finies
const MODE = opt.credits ? 'credits' : 'title'
cueCamera(BOOT > 0 ? 'loading' : MODE, { cut: true })
let total = 0
let bad = 0
const byFault: Record<string, number> = {}
const byKind: Record<string, { n: number; bad: number }> = {}
let cuts = 0
const shotLens: number[] = []
let lastCutAt = 0
let worstMs = 0
const slow: string[] = []
const frameMs: number[] = []
const nanFrames: string[] = []
let fallbacks0 = 0
let recutsTotal = 0
const lines: string[] = []
let clock = 0
let where = ''
const shortTakes: string[] = []
cameraBeats.on((b) => {
  if (b.type === 'cut') {
    cuts++
    shotLens.push(clock - lastCutAt)
    if (clock - lastCutAt < 0.8) shortTakes.push(`${where} séquence ${(clock - lastCutAt).toFixed(2)} s`)
    lastCutAt = clock
  }
})

// démos dans l'ordre ; comme au runner, la suivante est construite (et sa jumelle avancée) pendant la boucle en cours
const demos = seeds.flatMap((seed) => maps.map((map) => ({ seed, map })))
function build(seed: number, map: MapId) {
  const team = demoTeam(6, seed)
  const sim = createSimulation({ mode: 'demo', seed, mapId: map, birds: team.map((_, i) => ({ slot: i, assist: false })), sunSeconds: RULES.titleDemoSunSeconds, countdown: false })
  const bots: Bot[] = team.map((spec, i) => createBot({ slot: i, personality: spec.personality, level: spec.level, seed: hashSeed(seed, i) }))
  // jumelle (comme le runner) ; --nofuture : caméra sans avenir exact (extrapolation seule) ;
  // --cold : jumelle sans avance préparée au repos
  if (!opt.nofuture) {
    demoFuture.prebuild(sim.state, team.map((spec, i) => createBot({ slot: i, personality: spec.personality, level: spec.level, seed: hashSeed(seed, i) })))
    if (!opt.cold) demoFuture.warm(sim.state)
  }
  return { team, sim, bots }
}
let built = build(demos[0]!.seed, demos[0]!.map)
for (let di = 0; di < demos.length; di++) {
  {
    const { seed, map } = demos[di]!
    const { team, sim, bots } = built
    if (!opt.nofuture) demoFuture.begin(sim.state)
    else demoFuture.end()
    if (opt.plans) console.log(`=== ${map} s${seed}`)
    if (demos[di + 1]) built = build(demos[di + 1]!.seed, demos[di + 1]!.map)
    // entrées normalisées comme au runner (compteurs d'appuis continus)
    const router = new InputRouter(null as unknown as LocalInput)
    router.reset()
    for (const b of bots) router.set(b.slot, { kind: 'bot', bot: b })
    const prev: (BirdState | undefined)[] = new Array(12).fill(undefined)
    const view: GameView = { sim: sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
    for (let s = 0; s < team.length; s++) view.players[s] = { slot: s, colorIndex: s, name: '', kind: 'bot', assist: false }
    let evs: SimEvent[] = []
    let over = false
    let frame = 0
    let recuts0 = D.shot.recuts + D.spare.recuts
    let kind0 = ''
    // comme au runner : le temps de la sim suit le ralenti de la dernière seconde (timeScaleHint)
    const TICK = 1 / RULES.tickHz
    let acc = TICK
    while (!over) {
      for (const b of sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
      evs = sim.step(router.collect(sim.state, evs))
      if (!opt.nofuture) demoFuture.follow(sim.state)
      for (const e of evs) {
        events.emit(e)
        if (e.type === 'territoryReset') over = true
      }
      if (over) break
      // images rendues jusqu'au tick suivant (2 à 60 i/s, 4 pendant le ralenti ×0,5) : comme au runner,
      // chaque image avance l'accumulateur de dt × échelle, le tick part quand il déborde
      acc -= TICK
      for (;;) {
        const scale = sim.state.timeScaleHint
        if (acc + scale / 60 > TICK + 1e-9) break
        acc += scale / 60
        view.timeScale = scale
        const alpha = Math.max(0, acc / TICK)
        view.alpha = alpha
        view.realTime += 1 / 60
        clock += 1 / 60
        const t0 = performance.now()
        where = `${map} s${seed} t=${sim.state.sun.t.toFixed(2)} ${D.shot.actualKind}`
        if (BOOT > 0 && di === 0 && cameraState.mode === 'loading' && sim.state.sun.t >= BOOT) cueCamera(MODE, { cut: true })
        const pose = dir.update(1 / 60, view, aspect)
        const ms = performance.now() - t0
        if (ms > worstMs) worstMs = ms
        if (cameraState.mode === 'title') frameMs.push(ms)
        if (ms > 12) slow.push(`${map} s${seed} t=${sim.state.sun.t.toFixed(2)} ${ms.toFixed(1)} ms ${D.shot.actualKind}`)
        const shot = D.shot
        if (D.shot.recuts + D.spare.recuts !== recuts0) {
          recutsTotal += D.shot.recuts + D.spare.recuts - recuts0
          recuts0 = D.shot.recuts + D.spare.recuts
          cuts++
          shotLens.push(clock - lastCutAt)
          if (clock - lastCutAt < 0.8) shortTakes.push(`${where} interne ${(clock - lastCutAt).toFixed(2)} s`)
          lastCutAt = clock
        }
        const nonFinite = [pose.pos.x, pose.pos.y, pose.pos.z, pose.quat.x, pose.quat.y, pose.quat.z, pose.quat.w, pose.fov].some((v) => !Number.isFinite(v))
        if (nonFinite) nanFrames.push(`${map} s${seed} t=${sim.state.sun.t.toFixed(2)} ${D.shot.actualKind}`)
        if (frame++ % 6 !== 0 || cameraState.mode !== 'title') continue
        const f = shot.judge(sim.state, view, pose, aspect, worldView.hideStorm)
        const st = (shot as unknown as { setup: { pitch: number } }).setup
        const k = shot.actualKind === 'sky' ? `sky${Math.round((st.pitch * 180) / Math.PI)}` : shot.actualKind
        total++
        byKind[k] ??= { n: 0, bad: 0 }
        byKind[k].n++
        if (k !== kind0) kind0 = k
        if (f) {
          bad++
          byKind[k].bad++
          byFault[f] = (byFault[f] ?? 0) + 1
          if (LOG) console.log(`${map} s${seed} t=${sim.state.sun.t.toFixed(1)} ${cameraState.shot}/${k} ${f} subj=${shot.subjectSlot} ${f === 'bird-ui' ? `b${faultInfo.birdSlot} s=${faultInfo.birdSpan.toFixed(2)} ui=${faultInfo.birdUi.toFixed(2)}` : f === 'wide' || f === 'near' ? `w=${faultInfo.towerWidth.toFixed(2)}` : ''}`)
        }
      }
    }
    fallbacks0 = D.shot.fallbacks + D.spare.fallbacks
  }
}

if (LOG) console.log(lines.join('\n'))
if (opt.plans) console.log(Object.entries(cineDebug.faults).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([k, v]) => `${k} ${v}`).join('\n'))
const mean = shotLens.reduce((a, b) => a + b, 0) / Math.max(1, shotLens.length)
const sorted = [...shotLens].sort((a, b) => a - b)
console.log(`images ${total}, ratées ${bad} (${((100 * bad) / total).toFixed(1)} %) ${JSON.stringify(byFault)}`)
console.log(`par plan : ${Object.entries(byKind).map(([k, v]) => `${k} ${v.bad}/${v.n}`).join(', ')}`)
if (frameMs.length) {
  const f = [...frameMs].sort((a, b) => a - b)
  const q = (p: number) => f[Math.min(f.length - 1, Math.floor(p * f.length))]!.toFixed(2)
  console.log(`coût caméra par image (titre) : moyenne ${(f.reduce((a, b) => a + b, 0) / f.length).toFixed(2)} ms, p50 ${q(0.5)}, p95 ${q(0.95)}, p99 ${q(0.99)}, p99,9 ${q(0.999)}`)
}
console.log(`frames > 12 ms : ${slow.length}${slow.length ? '\n  ' + slow.slice(0, 40).join('\n  ') : ''}`)
console.log(`prises < 0,8 s : ${shortTakes.length}${shortTakes.length ? '\n  ' + shortTakes.join('\n  ') : ''}`)
console.log(`poses non finies : ${nanFrames.length}${nanFrames.length ? '\n  ' + nanFrames.slice(0, 20).join('\n  ') : ''}`)
console.log(`jumelle ${demoFuture.valid ? 'en accord' : 'DÉSACCORDÉE'}`)
console.log(`coupes ${cuts} (dont ${recutsTotal} internes), prise moyenne ${mean.toFixed(2)} s, plus courtes ${sorted.slice(0, 6).map((x) => x.toFixed(2)).join(' ')}, replis ${fallbacks0}, pire frame ${worstMs.toFixed(1)} ms`)
