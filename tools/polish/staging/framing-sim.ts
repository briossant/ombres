// Banc headless du cadrage de manche (polish staging S1, S2, S3, S6) : vraie sim + vrais bots +
// vrai CameraDirector à 60 i/s, sans navigateur ni GPU. Mesure, par phase :
//  - « sous la bande » et « hors cadre » avec les critères de tools/polish/feel/read-stats.mjs
//    (ancre = oiseau + min(0,24 × envergure, 8 % H) ; haut = ancre − 0,9 × envergure ; bande HUD 116 px) ;
//  - boîtes d'oiseau hors du rectangle utile ; envergure affichée ; sable vide sous l'arène ;
//  - part d'écran couverte par les tours ; punch-ins et gain d'envergure autour des touches.
//   npx tsx tools/polish/staging/framing-sim.ts [--n=6] [--seeds=1,2,3] [--map=parasols] [--scale=1.3] [--human=0]
import * as THREE from 'three'
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdInput, BirdState, MapId, SimEvent } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { createBot, defaultBots, type Bot } from '../../../src/bots/index.ts'
import { Emitter } from '../../../src/host/bus.ts'
import { CameraDirector } from '../../../src/host/camera/director.ts'
import { cameraState, cueCamera, cameraBeats } from '../../../src/host/camera/cue.ts'
import { birdAnchors } from '../../../src/host/render/bird/anchors.ts'
import type { GameView } from '../../../src/host/view.ts'
import { rigPose } from '../../../src/host/camera/cine.ts'
import { makePose } from '../../../src/host/camera/math.ts'
const gpose = makePose()

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const n = +(opt.n ?? 6)
const seeds = String(opt.seeds ?? '1,2,3').split(',').map(Number)
const maps = String(opt.map ?? 'parasols,aiguilles,geantes,cadran').split(',') as MapId[]
const maxScale = +(opt.scale ?? (n > 8 ? 1.6 : RULES.birdRenderScaleMax))
const human = +(opt.human ?? 0)
const W = 1920
const H = 1080
const BAR = 116
const aspect = W / H

type Acc = { n: number; birds: number; under: number; out: number; boxOut: number; punchN: number; samplesUnder: number; spans: number[]; gap: number[]; cover: number[]; width: number[] }
const by: Record<string, Acc> = {}
const acc = (k: string): Acc => (by[k] ??= { n: 0, birds: 0, under: 0, out: 0, boxOut: 0, punchN: 0, samplesUnder: 0, spans: [], gap: [], cover: [], width: [] })
const hits: { t: number; crown: boolean; human: boolean; before: number; peak: number; punched: boolean; wr: number }[] = []
let punches: number[] = []
let run = 0

const cam = new THREE.PerspectiveCamera(40, aspect, 1, 9000)
const v = new THREE.Vector3()
const c = new THREE.Vector3()

for (const map of maps)
  for (const seed of seeds) {
    const events = new Emitter<SimEvent>()
    const dir = new CameraDirector(events)
    const sim = createSimulation({ mode: 'round', seed, mapId: map, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
    const specs = defaultBots(0, 1)
    const bots: Bot[] = Array.from({ length: n }, (_, slot) => createBot({ slot, personality: specs[slot % specs.length]!.personality, level: 1, seed: seed * 1000 + slot }))
    const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
    const prev: (BirdState | undefined)[] = new Array(12).fill(undefined)
    const view: GameView = { sim: sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
    for (let s = 0; s < n; s++) view.players[s] = { slot: s, colorIndex: s, name: '', kind: s === human ? 'keyboard' : 'bot', assist: false }
    birdAnchors.scale.fill(1)
    birdAnchors.spanPx.fill(0)
    cueCamera('round', { cut: true })
    run++
    const offBeat = cameraBeats.on((b) => { if (b.type === 'punchIn') punches.push(sim.state.time + run * 1000) })
    let evs: SimEvent[] = []
    const pending: { t: number; slots: [number, number]; crown: boolean; human: boolean; before: number; peak: number; until: number; count0: number; w0: number; wmin: number }[] = []
    const spanOf = (slot: number) => birdAnchors.spanPx[slot] ?? 0
    while (!sim.state.over) {
      for (const b of bots) inputs[b.slot] = b.think(sim.state, evs)
      for (const b of sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
      evs = sim.step(inputs)
      for (const e of evs) {
        const count0 = cameraState.punchCount
        events.emit(e)
        if (e.type === 'diveHit') {
          const hum = e.hunter === human || e.target === human
          if (e.crown && cameraState.punchCount === count0) console.log(`couronne t=${sim.state.time.toFixed(1)} refus : ${dir.framing.punchReject || '(écart, disque, hors champ)'} `)
          pending.push({ t: sim.state.time, slots: [e.hunter, e.target], crown: e.crown, human: hum, before: (spanOf(e.hunter) + spanOf(e.target)) / 2, peak: 0, until: sim.state.time + 1.6, count0, w0: dir.framing.width, wmin: Infinity })
        }
      }
      for (const alpha of [0.5, 1]) {
        view.alpha = alpha
        view.realTime += 1 / 60
        let pose = dir.update(1 / 60, view, aspect)
        if (opt.goal && sim.state.sun.t >= 0) {
          // diagnostic : le cadre visé (sans le retard des ressorts) au lieu du cadre rendu
          const F = dir.framing as unknown as { goalX: number; goalY: number; goalW: number; rig: { pitch: number } }
          const tanH = Math.tan((20 * Math.PI) / 180) * aspect
          const r = { tx: F.goalX, ty: F.goalY, tz: 0, yaw: 0, pitch: F.rig.pitch, dist: F.goalW / (2 * tanH), fov: 40 }
          pose = rigPose(r, gpose)
        }
        cam.position.copy(pose.pos)
        cam.quaternion.copy(pose.quat)
        cam.fov = pose.fov
        cam.updateProjectionMatrix()
        cam.updateMatrixWorld(true)
        cam.getWorldPosition(c)
        const st = sim.state
        const tanV = Math.tan((cam.fov * Math.PI) / 360)
        const ph = st.sun.phase
        // images de punch-in (les oiseaux hors de la paire peuvent sortir) comptées à part
        const A = acc(cameraState.punch > 0.02 ? 'punch' : ph)
        A.n++
        let anyUnder = false
        for (const b of st.birds) {
          const p = prev[b.slot] ?? b
          v.set(p.x + (b.x - p.x) * alpha, p.z + (b.z - p.z) * alpha, -(p.y + (b.y - p.y) * alpha))
          const d = Math.max(1, v.distanceTo(c))
          const raw = (RULES.wingspan / d / tanV) * (H / 2)
          const scale = Math.min(maxScale, Math.max(1, 60 / raw))
          const span = raw * scale
          birdAnchors.scale[b.slot] = scale
          birdAnchors.spanPx[b.slot] = span
          v.project(cam)
          const sx = ((v.x + 1) / 2) * W
          const sy = ((1 - v.y) / 2) * H
          const ay = sy + Math.min(0.24 * span, H * 0.08)
          A.birds++
          A.spans.push(span)
          if (sx < 0 || sx > W || ay < 0 || ay > H || v.z > 1) A.out++
          else if (ay - 0.9 * span < BAR + 10) {
            A.under++
            anyUnder = true
          }
          // boîte (ancre ± demi-envergure) hors du rectangle utile (marge 1 %)
          const crowded = n > 8
          const y1 = crowded ? 0.975 : 0.87
          if (sx - span / 2 < W * 0.05 || sx + span / 2 > W * 0.95 || sy - span / 2 < H * 0.2 || ay + span / 2 > H * (y1 + 0.01)) A.boxOut++
        }
        if (anyUnder) A.samplesUnder++
        A.gap.push(1 - cameraState.arena.y1)
        A.cover.push(cameraState.towerCover)
        if (opt.gslog && st.sun.phase === 'greatShadow' && Math.round(view.realTime * 60) % 60 === 0) {
          const xs = st.birds.map((b) => `${b.x.toFixed(0)}${b.inNight ? 'n' : ''}`).join(' ')
          const F2 = dir.framing as unknown as { widen: { x: number }; boost: { x: number }; goalW: number }
          console.log(`GS recul ×${Math.exp(F2.widen.x).toFixed(2)} relève ${(F2.boost.x * 180 / Math.PI).toFixed(1)}° visée ${F2.goalW.toFixed(0)} tours ${(100 * cameraState.towerCover).toFixed(0)}% ombres x ${st.birds.map((b) => b.shadow.cx.toFixed(0)).join(' ')}`)
          {
            const F3 = dir.framing as unknown as { softSet: { pts: Float64Array; count: number }; hardSet: { pts: Float64Array; count: number } }
            const bb = (S: { pts: Float64Array; count: number }) => {
              let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9
              for (let i = 0; i < S.count; i++) { x0 = Math.min(x0, S.pts[i * 3]!); x1 = Math.max(x1, S.pts[i * 3]!); y0 = Math.min(y0, S.pts[i * 3 + 1]!); y1 = Math.max(y1, S.pts[i * 3 + 1]!) }
              return `${S.count} pts x ${x0.toFixed(0)}..${x1.toFixed(0)} y ${y0.toFixed(0)}..${y1.toFixed(0)}`
            }
            console.log(`GS sujet ${bb(F3.softSet)} | dur ${bb(F3.hardSet)}`)
          }
          console.log(`GS ${map}/${seed} t=${st.sun.t.toFixed(1)} front s=${st.night.s.toFixed(0)} dir=(${st.night.dirX.toFixed(2)},${st.night.dirY.toFixed(2)}) largeur ${(2 * Math.tan(20 * Math.PI / 180) * aspect * dir.framing.rig.dist).toFixed(0)} cible x ${dir.framing.rig.tx.toFixed(0)} oiseaux x ${xs}`)
        }
        if (opt.coverlog && cameraState.towerCover > 0.2 && Math.round(view.realTime * 60) % 30 === 0) {
          const F = dir.framing as unknown as { boost: { x: number }; boostGoal: number }
          console.log(`couverture ${(100 * cameraState.towerCover).toFixed(0)} % ${map}/${seed} t=${st.sun.t.toFixed(1)} tangage ${(dir.framing.rig.pitch * 180 / Math.PI).toFixed(1)}° (relève ${(F.boost.x * 180 / Math.PI).toFixed(1)}°, but ${(F.boostGoal * 180 / Math.PI).toFixed(1)}°) cam (${cam.position.x.toFixed(0)}, ${(-cam.position.z).toFixed(0)}, ${cam.position.y.toFixed(0)}) cible (${dir.framing.rig.tx.toFixed(0)}, ${dir.framing.rig.ty.toFixed(0)}) largeur ${(2 * Math.tan(20 * Math.PI / 180) * aspect * dir.framing.rig.dist).toFixed(0)}`)
        }
        A.width.push(dir.framing.width)
        for (const q of pending) {
          if (st.time <= q.until) {
            q.peak = Math.max(q.peak, (spanOf(q.slots[0]) + spanOf(q.slots[1])) / 2)
            q.wmin = Math.min(q.wmin, 2 * Math.tan((20 * Math.PI) / 180) * aspect * dir.framing.rig.dist)
          }
        }
      }
      for (let i = pending.length - 1; i >= 0; i--) {
        const q = pending[i]!
        if (sim.state.time > q.until) {
          hits.push({ t: q.t, crown: q.crown, human: q.human, before: q.before, peak: q.peak, punched: cameraState.punchCount > q.count0, wr: q.wmin / q.w0 })
          pending.splice(i, 1)
        }
      }
    }
    offBeat()
    dir.dispose()
  }

const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))]! : NaN }
console.log(`n=${n} maps=${maps.join(',')} seeds=${seeds.join(',')} échelle max ${maxScale}`)
console.log('| phase | images | envergure p10/méd/p90 | sous la bande (oiseaux) | images avec ≥1 oiseau sous la bande | hors cadre | boîte hors rect. utile | sable vide bas méd/p90 | tours méd/p90/max | largeur méd |')
console.log('|---|---|---|---|---|---|---|---|---|---|')
for (const k of ['countdown', 'noon', 'afternoon', 'golden', 'sunset', 'greatShadow', 'punch']) {
  const s = by[k]
  if (!s) continue
  const pc = (x: number, d: number) => `${((100 * x) / d).toFixed(1)} %`
  console.log(`| ${k} | ${s.n} | ${q(s.spans, 0.1).toFixed(0)} / ${q(s.spans, 0.5).toFixed(0)} / ${q(s.spans, 0.9).toFixed(0)} | ${pc(s.under, s.birds)} | ${pc(s.samplesUnder, s.n)} | ${pc(s.out, s.birds)} | ${pc(s.boxOut, s.birds)} | ${(100 * q(s.gap, 0.5)).toFixed(1)} / ${(100 * q(s.gap, 0.9)).toFixed(1)} % | ${(100 * q(s.cover, 0.5)).toFixed(1)} / ${(100 * q(s.cover, 0.9)).toFixed(1)} / ${(100 * Math.max(...s.cover)).toFixed(1)} % | ${q(s.width, 0.5).toFixed(0)} m |`)
}
const crownHits = hits.filter((h) => h.crown || h.human)
console.log(`touches ${hits.length}, punch-ins ${punches.length}, dont couronne/humain ${crownHits.length} :`)
for (const h of crownHits) console.log(`  t=${h.t.toFixed(1)} ${h.crown ? 'couronne' : ''}${h.human ? ' humain' : ''} envergure ${h.before.toFixed(0)} → ${h.peak.toFixed(0)} px (× ${(h.peak / Math.max(1, h.before)).toFixed(2)}) ${h.punched ? `punch-in, largeur × ${h.wr.toFixed(2)}` : ''}`)
punches = punches.sort((a, b) => a - b)
let minGap = Infinity
for (let i = 1; i < punches.length; i++) minGap = Math.min(minGap, punches[i]! - punches[i - 1]!)
console.log(`écart minimal entre punch-ins (s de sim, par manche) : ${Number.isFinite(minGap) ? minGap.toFixed(1) : '—'}`)
