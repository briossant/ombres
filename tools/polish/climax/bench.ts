// Banc headless du correcteur « climax » (polish vague 2) : vraie sim, vrais bots, vrai
// CameraDirector à 60 i/s, sans navigateur. Mesure la Grande Ombre (98 → 110 s) seconde par seconde
// et, pour toute la manche, l'encombrement des tours :
//  - largeur cadrée, envergure affichée (modèle de l'échelle cosmétique de <Birds>), tangage ;
//  - oiseaux humains hors du rectangle utile, bots hors champ, front de nuit dans le cadre ;
//  - couverture des tours (≥ 20 m, estimation de la caméra ; tours entières), plus large tour ;
//  - distance de la caméra à la tour la plus proche (surface, en 3D).
//   npx tsx tools/polish/climax/bench.ts [--n=4] [--seeds=1,2,3] [--map=parasols,...] [--humans=0] [--rows]
import * as THREE from 'three'
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdInput, BirdState, MapId, SimEvent, SimState } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { createBot, defaultBots, type Bot } from '../../../src/bots/index.ts'
import { Emitter } from '../../../src/host/bus.ts'
import { CameraDirector } from '../../../src/host/camera/director.ts'
import { cameraState, cueCamera } from '../../../src/host/camera/cue.ts'
import { towerCoverage } from '../../../src/host/camera/framingRig.ts'
import { towerCoverStats } from '../../../src/host/camera/towerCover.ts'
import { birdAnchors } from '../../../src/host/render/bird/anchors.ts'
import type { GameView } from '../../../src/host/view.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const n = +(opt.n ?? 4)
const seeds = String(opt.seeds ?? '1,2,3').split(',').map(Number)
const maps = String(opt.map ?? 'parasols,aiguilles,geantes,cadran').split(',') as MapId[]
const humans = new Set(String(opt.humans ?? '0').split(',').filter((s) => s !== '').map(Number))
const maxScale = n > 8 ? RULES.birdRenderScaleMaxCrowded : RULES.birdRenderScaleMax
const W = 1920
const H = 1080
const aspect = W / H
const cam = new THREE.PerspectiveCamera(40, aspect, 1, 9000)
const v = new THREE.Vector3()
const c = new THREE.Vector3()

type Row = { t: number; width: number; span: number; pitch: number; cover: number; coverAll: number; maxW: number; humanOut: number; botOut: number; botEdge: number; front: boolean; near: number; punch: number }
const gsRows: Row[] = []
const updMs: number[] = []
const phaseAcc: Record<string, { cover: number[]; coverAll: number[]; near: number[]; maxW: number[]; width: number[]; span: number[]; humanOut: number; birds: number; over: number; ep: number; epMax: number }> = {}
const acc = (k: string) => (phaseAcc[k] ??= { cover: [], coverAll: [], near: [], maxW: [], width: [], span: [], humanOut: 0, birds: 0, over: 0, ep: 0, epMax: 0 })

/** Distance 3D de la caméra à la surface de tour la plus proche au-dessus de 20 m (m). */
function nearestTowerSurface(sim: SimState, x: number, y: number, z: number): number {
  let best = Infinity
  for (const t of sim.towers) {
    if (t.height < 20) continue
    for (const g of t.segments) {
      if (g.z1 < 20) continue
      const zc = Math.max(Math.max(20, g.z0), Math.min(g.z1, z))
      const k = g.z1 > g.z0 ? (zc - g.z0) / (g.z1 - g.z0) : 0
      const r = g.r0 + (g.r1 - g.r0) * k
      const ox = (g.ox0 ?? 0) + ((g.ox1 ?? 0) - (g.ox0 ?? 0)) * k
      const oy = (g.oy0 ?? 0) + ((g.oy1 ?? 0) - (g.oy0 ?? 0)) * k
      const dh = Math.max(0, Math.hypot(x - t.x - ox, y - t.y - oy) - r)
      best = Math.min(best, Math.hypot(dh, z - zc))
    }
  }
  return best
}

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
    for (let s = 0; s < n; s++) view.players[s] = { slot: s, colorIndex: s, name: '', kind: humans.has(s) ? 'keyboard' : 'bot', assist: false }
    birdAnchors.scale.fill(1)
    birdAnchors.spanPx.fill(0)
    cueCamera('round', { cut: true })
    let evs: SimEvent[] = []
    let lastRow = -1
    while (!sim.state.over) {
      for (const b of bots) inputs[b.slot] = b.think(sim.state, evs)
      for (const b of sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
      evs = sim.step(inputs)
      for (const e of evs) events.emit(e)
      for (const alpha of [0.5, 1]) {
        view.alpha = alpha
        view.realTime += 1 / 60
        const tu = performance.now()
        const pose = dir.update(1 / 60, view, aspect)
        const du = performance.now() - tu
        updMs.push(du)
        cam.position.copy(pose.pos)
        cam.quaternion.copy(pose.quat)
        cam.fov = pose.fov
        cam.updateProjectionMatrix()
        cam.updateMatrixWorld(true)
        cam.getWorldPosition(c)
        const st = sim.state
        if (st.sun.t < 0) continue
        const tanV = Math.tan((cam.fov * Math.PI) / 360)
        const spans: number[] = []
        let humanOut = 0
        let botOut = 0
        let botEdge = 0
        let sumY = 0
        for (const b of st.birds) {
          const p = prev[b.slot] ?? b
          v.set(p.x + (b.x - p.x) * alpha, p.z + (b.z - p.z) * alpha, -(p.y + (b.y - p.y) * alpha))
          sumY += b.y
          const d = Math.max(1, v.distanceTo(c))
          const raw = (RULES.wingspan / d / tanV) * (H / 2)
          const scale = Math.min(maxScale, Math.max(1, 60 / raw))
          const span = raw * scale
          birdAnchors.scale[b.slot] = scale
          birdAnchors.spanPx[b.slot] = span
          spans.push(span)
          v.project(cam)
          const sx = ((v.x + 1) / 2) * W
          const sy = ((1 - v.y) / 2) * H
          const out = v.z > 1 || sx < 0 || sx > W || sy < 0 || sy > H
          const y1 = n > 8 ? 0.975 : 0.87
          const boxOut = sx - span / 2 < W * 0.05 || sx + span / 2 > W * 0.95 || sy - span / 2 < H * 0.2 || sy + 0.74 * span > H * (y1 + 0.01)
          if (humans.has(b.slot) && boxOut) humanOut++
          if (!humans.has(b.slot) && out) botOut++
          // bot à l'écran mais coupé au bord ou sous la bande du HUD (hors du rectangle utile)
          if (!humans.has(b.slot) && !out && boxOut) botEdge++
        }
        spans.sort((a, b) => a - b)
        const span = spans[Math.floor(spans.length / 2)] ?? 0
        const rig = dir.framing.rig
        const coverAll = towerCoverage(st, rig, aspect, 0.5)
        const maxW = towerCoverStats.maxWidth
        const near = nearestTowerSurface(st, c.x, -c.z, c.y)
        const ph = cameraState.punch > 0.02 ? 'punch' : st.sun.phase
        const A = acc(ph)
        A.cover.push(cameraState.towerCover)
        A.coverAll.push(coverAll)
        A.near.push(near)
        A.maxW.push(maxW)
        A.width.push(dir.framing.width)
        A.span.push(span)
        A.humanOut += humanOut
        A.birds += humans.size
        // épisodes de tours > 15 % (tours entières) : durée (s)
        if (coverAll > 0.15) {
          A.over++
          A.ep += 1 / 60
          A.epMax = Math.max(A.epMax, A.ep)
        } else A.ep = 0
        if (opt.coverlog && coverAll > 0.15 && Math.round(view.realTime * 60) % 15 === 0)
          console.log(`tours ${(100 * coverAll).toFixed(1)} % ${map}/${seed} t=${st.sun.t.toFixed(1)} ${ph} larg ${dir.framing.width.toFixed(0)} tang ${((rig.pitch * 180) / Math.PI).toFixed(1)}° cam (${c.x.toFixed(0)}, ${(-c.z).toFixed(0)}, ${c.y.toFixed(0)}) tour à ${near.toFixed(0)} m caméra ${(100 * cameraState.towerCover).toFixed(1)} % (sans parade ${(100 * dir.framing.coverTrace.base).toFixed(1)}, prévu ${(100 * dir.framing.coverTrace.chosen).toFixed(1)}) relève ${(((dir.framing as unknown as { boost: { x: number } }).boost.x * 180) / Math.PI).toFixed(1)}° recul ×${Math.exp((dir.framing as unknown as { widen: { x: number } }).widen.x).toFixed(2)}`)
        if (st.sun.phase === 'greatShadow') {
          // front de nuit à l'écran : au moins un point du front à la hauteur des oiseaux dans le cadre
          const nt = st.night
          const yM = sumY / Math.max(1, st.birds.length)
          const px = -nt.dirY
          const py = nt.dirX
          const q = nt.dirX * 0 + yM * 0
          void q
          let front = false
          for (let k = -2; k <= 2 && !front; k++) {
            const along = yM + k * 25
            v.set(nt.dirX * nt.s + px * along, 0, -(nt.dirY * nt.s + py * along)).project(cam)
            if (v.z < 1 && v.x > -0.96 && v.x < 0.96 && v.y > -0.96 && v.y < 0.96) front = true
          }
          const tt = Math.floor(st.sun.t * 2) / 2
          if (tt !== lastRow) {
            lastRow = tt
            gsRows.push({ t: tt, width: dir.framing.width, span, pitch: (rig.pitch * 180) / Math.PI, cover: cameraState.towerCover, coverAll, maxW, humanOut, botOut, botEdge, front: nt.active ? front : true, near, punch: cameraState.punch })
            if (opt.rows) console.log(`${map}/${seed} t=${tt.toFixed(1)} larg ${dir.framing.width.toFixed(0)} m env ${span.toFixed(0)} px tang ${((rig.pitch * 180) / Math.PI).toFixed(1)}° tours ${(100 * cameraState.towerCover).toFixed(1)}/${(100 * coverAll).toFixed(1)} % maxW ${(100 * maxW).toFixed(0)} % humains hors ${humanOut} bots hors champ ${botOut} front ${front ? 'oui' : 'NON'} tour à ${near.toFixed(0)} m${cameraState.punch > 0.02 ? ' punch' : ''}`)
          }
        }
      }
    }
    dir.dispose()
  }

const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))]! : NaN }
console.log(`n=${n} cartes=${maps.join(',')} graines=${seeds.join(',')} humains=${[...humans].join(',') || 'aucun'}`)
console.log('| phase | largeur méd | envergure p10/méd | tours (caméra) méd/p90/max | tours entières p90/max | images > 15 % (plus long épisode) | plus large tour p90/max | tour la plus proche min/p10 | humains hors rect. |')
console.log('|---|---|---|---|---|---|---|---|---|')
for (const k of ['noon', 'afternoon', 'golden', 'sunset', 'greatShadow', 'punch']) {
  const s = phaseAcc[k]
  if (!s) continue
  const pc = (x: number) => `${(100 * x).toFixed(1)}`
  console.log(`| ${k} | ${q(s.width, 0.5).toFixed(0)} m (p90 ${q(s.width, 0.9).toFixed(0)}) | ${q(s.span, 0.1).toFixed(0)} / ${q(s.span, 0.5).toFixed(0)} px | ${pc(q(s.cover, 0.5))} / ${pc(q(s.cover, 0.9))} / ${pc(Math.max(...s.cover))} % | ${pc(q(s.coverAll, 0.9))} / ${pc(Math.max(...s.coverAll))} % | ${((100 * s.over) / s.coverAll.length).toFixed(1)} % (${s.epMax.toFixed(1)} s) | ${pc(q(s.maxW, 0.9))} / ${pc(Math.max(...s.maxW))} % | ${Math.min(...s.near).toFixed(0)} / ${q(s.near, 0.1).toFixed(0)} m | ${((100 * s.humanOut) / Math.max(1, s.birds)).toFixed(1)} % |`)
}
console.log(`coût de CameraDirector.update : médiane ${q(updMs, 0.5).toFixed(3)} ms, p99 ${q(updMs, 0.99).toFixed(3)} ms, max ${Math.max(...updMs).toFixed(2)} ms`)
// Grande Ombre, par tranche de 2 s
console.log('Grande Ombre (toutes graines) : t | largeur méd | envergure méd | tangage méd | tours entières max | front visible | humains hors | bots hors champ (moy.) | bots coupés au bord (moy.)')
for (let t0 = 98; t0 < 110; t0 += 2) {
  const r = gsRows.filter((x) => x.t >= t0 && x.t < t0 + 2)
  if (!r.length) continue
  console.log(`  ${t0}-${t0 + 2} s | ${q(r.map((x) => x.width), 0.5).toFixed(0)} m | ${q(r.map((x) => x.span), 0.5).toFixed(0)} px | ${q(r.map((x) => x.pitch), 0.5).toFixed(1)}° | ${(100 * Math.max(...r.map((x) => x.coverAll))).toFixed(1)} % | ${((100 * r.filter((x) => x.front).length) / r.length).toFixed(0)} % | ${r.reduce((a, x) => a + x.humanOut, 0)} | ${(r.reduce((a, x) => a + x.botOut, 0) / r.length).toFixed(2)} | ${(r.reduce((a, x) => a + x.botEdge, 0) / r.length).toFixed(2)}`)
}
