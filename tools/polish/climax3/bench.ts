// Banc headless du correcteur « climax-3 » (polish vague 3) : vraie sim, vrais bots, vrai
// CameraDirector à 60 i/s, sans navigateur (base : tools/polish/verify2/crownbench.ts).
// Mesure les 13 secondes de l'entrée et de la Grande Ombre (97 → 110 s), image par image :
//  - couverture des tours (tours entières, au-dessus de 0,5 m) : totale et par tour (la plus grosse) ;
//  - disques tranchés : un disque de tour (parasol, pile, gnomon) devant un oiseau, coupé en partie
//    par le disque de dégagement de l'oiseau (birdScreen.ts / towerMaterial.ts) : part de sa surface
//    à l'écran effacée entre 8 et 92 % ; « au centre » si le disque est dans le tiers central ;
//    le modèle suit le matériau (DISC_WHOLE : chapeau entier effacé, sinon coupe au cercle) ;
//  - envergure médiane affichée, largeur cadrée ;
//  - front de nuit dans le cadre, porteur de la couronne à l'écran (dans le rectangle utile),
//    bots coupés au bord ou sous le HUD.
//   npx tsx tools/polish/climax3/bench.ts [--ns=2,4,6] [--seeds=1..8] [--map=...] [--humans=0] [--worst=8] [--rows]
import * as THREE from 'three'
import { createSimulation } from '../../../src/sim/simulation.ts'
import type { BirdInput, BirdState, MapId, SimEvent, SimState, TowerDef } from '../../../src/sim/types.ts'
import { RULES } from '../../../src/sim/rules.ts'
import { createBot, defaultBots, type Bot, type BotPersonality } from '../../../src/bots/index.ts'
import { Emitter } from '../../../src/host/bus.ts'
import { CameraDirector } from '../../../src/host/camera/director.ts'
import { cueCamera } from '../../../src/host/camera/cue.ts'
import { towerCoverage } from '../../../src/host/camera/framingRig.ts'
import { birdAnchors } from '../../../src/host/render/bird/anchors.ts'
import { BIRD_CLEAR_R } from '../../../src/host/render/world/birdScreen.ts'
import { foregroundHats, HAT_NEAR } from '../../../src/host/camera/towerCover.ts'
import { DISC_WHOLE } from '../../../src/host/render/world/towerMaterial.ts'
import type { GameView } from '../../../src/host/view.ts'

const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
const range = (s: string) => s.split(',').flatMap((p) => { const m = /^(\d+)\.\.(\d+)$/.exec(p); return m ? Array.from({ length: +m[2]! - +m[1]! + 1 }, (_, i) => +m[1]! + i) : [+p] })
const ns = range(String(opt.ns ?? opt.n ?? '2,4,6'))
const seeds = range(String(opt.seeds ?? '1..8'))
const maps = String(opt.map ?? 'parasols,aiguilles,geantes,cadran').split(',') as MapId[]
const humans = new Set(String(opt.humans ?? '0').split(',').filter((s) => s !== '').map(Number))
const T0 = +(opt.t0 ?? 97)
const W = 1920
const H = 1080
const aspect = W / H
const cam = new THREE.PerspectiveCamera(40, aspect, 1, 9000)
const v = new THREE.Vector3()
const c = new THREE.Vector3()
const pc = (x: number) => (100 * x).toFixed(1)
const popcount = (m: number) => { let c = 0; while (m) { c += m & 1; m >>>= 1 } return c }
const DEV_PERSONALITIES: BotPersonality[] = ['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'fool', 'watchmaker']

type Frame = { map: string; n: number; seed: number; t: number; width: number; span: number; cover: number; towerMax: number; towerName: string; fg: number; slice: number; sliceCentral: boolean; front: boolean | null; crown: 'in' | 'edge' | 'off' | 'human' | 'none'; botEdge: number; botOut: number; chosen: number; widen: number; boost: number; mask: number }
const frames: Frame[] = []
const updMs: number[] = []
const picks = new Map<number, number>()
let lastEvals = 0

/** Disques d'une tour (segments larges et courts) : centre (sim), altitude du dessus, rayon. */
function discsOf(t: TowerDef): { x: number; y: number; z: number; r: number }[] {
  const out: { x: number; y: number; z: number; r: number }[] = []
  for (const g of t.segments) {
    const r = Math.max(g.r0, g.r1)
    if (r < t.trunkRadius + 3 || g.z1 - g.z0 > 6.5) continue
    out.push({ x: t.x + (g.ox1 ?? 0), y: t.y + (g.oy1 ?? 0), z: g.z1, r })
  }
  return out
}

/**
 * Part (0..1) de la surface à l'écran d'un disque qui est effacée par les cercles de dégagement des
 * oiseaux qu'il cache (même règle que le matériau), et position écran de son centre.
 */
function sliceOf(d: { x: number; y: number; z: number; r: number }, birdsScr: { x: number; y: number; R: number; dist: number }[]): { frac: number; cx: number; cy: number; area: number } {
  v.set(d.x, d.z, -d.y)
  const dd = v.distanceTo(c)
  v.project(cam)
  const cx = ((v.x + 1) / 2) * W
  const cy = ((1 - v.y) / 2) * H
  if (v.z > 1) return { frac: 0, cx, cy, area: 0 }
  // ellipse écran du disque : demi-axe horizontal r·k/d, vertical × sin(dépression)
  const k = H / 2 / Math.tan((cam.fov * Math.PI) / 360)
  const ax = (d.r * k) / Math.max(1, dd)
  const sinD = Math.max(0.08, Math.abs(c.y - d.z) / Math.max(1e-3, dd))
  const ay = ax * sinD
  const hide = birdsScr.filter((b) => b.dist > dd)
  if (!hide.length) return { frac: 0, cx, cy, area: Math.PI * ax * ay }
  // chapeau entier : le disque disparaît dès qu'un cercle d'oiseau touche son ellipse (bande comprise)
  let tot = 0
  let cut = 0
  const N = 14
  for (let j = 0; j < N; j++)
    for (let i = 0; i < N; i++) {
      const u = ((i + 0.5) / N) * 2 - 1
      const w = ((j + 0.5) / N) * 2 - 1
      if (u * u + w * w > 1) continue
      const px = cx + u * ax
      const py = cy + w * ay
      if (px < 0 || px > W || py < 0 || py > H) continue
      tot++
      for (const b of hide) if (Math.hypot(px - b.x, py - b.y) < b.R) { cut++; break }
    }
  if (DISC_WHOLE && cut > 0) cut = tot
  return { frac: tot ? cut / tot : 0, cx, cy, area: Math.PI * ax * ay }
}

for (const map of maps)
  for (const n of ns)
    for (const seed of seeds) {
      const maxScale = n > 8 ? RULES.birdRenderScaleMaxCrowded : RULES.birdRenderScaleMax
      const events = new Emitter<SimEvent>()
      const dir = new CameraDirector(events)
      const sim = createSimulation({ mode: 'round', seed, mapId: map, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
      const specs = defaultBots(0, 1)
      // --bots=dev : mêmes bots que la page de dev de la caméra (src/dev/camera/runner.ts), pour la capture des cas repérés
      const bots: Bot[] = Array.from({ length: n }, (_, slot) =>
        opt.bots === 'dev'
          ? createBot({ slot, personality: DEV_PERSONALITIES[slot % 7]!, level: (slot % 3) as 0 | 1 | 2, seed: seed * 13 + slot })
          : createBot({ slot, personality: specs[slot % specs.length]!.personality, level: 1, seed: seed * 1000 + slot }),
      )
      const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
      const prev: (BirdState | undefined)[] = new Array(12).fill(undefined)
      const view: GameView = { sim: sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
      for (let s = 0; s < n; s++) view.players[s] = { slot: s, colorIndex: s, name: '', kind: humans.has(s) ? 'keyboard' : 'bot', assist: false }
      birdAnchors.scale.fill(1)
      birdAnchors.spanPx.fill(0)
      cueCamera('round', { cut: true })
      const discs = sim.state.towers.map(discsOf)
      const singles = sim.state.towers.map((t) => ({ towers: [t] }) as unknown as SimState)
      let evs: SimEvent[] = []
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
          updMs.push(performance.now() - tu)
          {
            const tr = dir.framing.coverTrace as { pick?: number; evals?: number }
            if (tr.evals !== undefined && tr.evals !== lastEvals) {
              lastEvals = tr.evals
              picks.set(tr.pick ?? -1, (picks.get(tr.pick ?? -1) ?? 0) + 1)
            }
          }
          const st = sim.state
          if (st.sun.t < T0 || st.sun.t >= 110 || st.over) continue
          cam.position.copy(pose.pos)
          cam.quaternion.copy(pose.quat)
          cam.fov = pose.fov
          cam.updateProjectionMatrix()
          cam.updateMatrixWorld(true)
          cam.getWorldPosition(c)
          const tanV = Math.tan((cam.fov * Math.PI) / 360)
          const k = H / 2 / tanV
          const spans: number[] = []
          const birdsScr: { x: number; y: number; R: number; dist: number }[] = []
          let crown: Frame['crown'] = 'none'
          let botEdge = 0
          let botOut = 0
          for (const b of st.birds) {
            const p = prev[b.slot] ?? b
            v.set(p.x + (b.x - p.x) * alpha, p.z + (b.z - p.z) * alpha, -(p.y + (b.y - p.y) * alpha))
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
            if (!out) birdsScr.push({ x: sx, y: sy, R: Math.max(12, (BIRD_CLEAR_R * k) / d), dist: d })
            const boxOut = sx - span / 2 < W * 0.05 || sx + span / 2 > W * 0.95 || sy - span / 2 < H * 0.2 || sy + 0.74 * span > H * 0.88
            if (!humans.has(b.slot)) {
              if (out) botOut++
              else if (boxOut) botEdge++
            }
            if (b.slot === st.crownSlot) crown = humans.has(b.slot) ? 'human' : out ? 'off' : boxOut ? 'edge' : 'in'
          }
          spans.sort((a, b) => a - b)
          const rig = dir.framing.rig
          // couverture PEINTE : chapeaux de premier plan effacés comme par le matériau (camera/towerCover.ts, HAT_NEAR)
          const hatNear = opt.hats === '0' || !foregroundHats(st) ? 0 : HAT_NEAR
          const cover = towerCoverage(st, rig, aspect, 0.5, Infinity, hatNear)
          let towerMax = 0
          let towerName = ''
          // premier plan : tour dont le pied est à moins de 0,8 × la distance au sol de la caméra à la cible du cadre (moitié basse de l’image)
          let fg = 0
          const camH = Math.hypot(rig.tx - c.x, rig.ty + c.z)
          let slice = 0
          let sliceCentral = false
          st.towers.forEach((t, ti) => {
            const ct = towerCoverage(singles[ti]!, rig, aspect, 0.5, Infinity, hatNear)
            if (ct > towerMax) {
              towerMax = ct
              towerName = `${t.archetype}#${t.id}`
            }
            if (Math.hypot(t.x - c.x, t.y + c.z) < 0.8 * camH) fg = Math.max(fg, ct)
            for (const d of discs[ti]!) {
              const s = sliceOf(d, birdsScr)
              // tranché : une partie seulement du disque est effacée, et le disque se voit (> 0,4 % de l'écran)
              if (s.frac > 0.08 && s.frac < 0.92 && s.area > 0.004 * W * H) {
                slice = Math.max(slice, s.frac)
                if (s.cx > W / 3 - W * 0.05 && s.cx < (2 * W) / 3 + W * 0.05 && s.cy > H * 0.2 && s.cy < H * 0.85) sliceCentral = true
              }
            }
          })
          // front de nuit à l'écran : un point du front à la hauteur des oiseaux dans le cadre
          let front: boolean | null = null
          if (st.sun.phase === 'greatShadow' && st.night.active) {
            const nt = st.night
            let yM = 0
            for (const b of st.birds) yM += b.x * -nt.dirY + b.y * nt.dirX
            yM /= Math.max(1, st.birds.length)
            front = false
            for (let q = -2; q <= 2 && !front; q++) {
              const along = yM + q * 25
              v.set(nt.dirX * nt.s - nt.dirY * along, 0, -(nt.dirY * nt.s + nt.dirX * along)).project(cam)
              if (v.z < 1 && v.x > -0.96 && v.x < 0.96 && v.y > -0.96 && v.y < 0.96) front = true
            }
          }
          const f: Frame = { map, n, seed, t: +st.sun.t.toFixed(2), width: dir.framing.width, span: spans[Math.floor(spans.length / 2)] ?? 0, cover, towerMax, towerName, fg, slice, sliceCentral, front, crown, botEdge, botOut, chosen: dir.framing.coverTrace.chosen, widen: Math.exp((dir.framing as unknown as { widen: { x: number } }).widen.x), boost: ((dir.framing as unknown as { boost: { x: number } }).boost.x * 180) / Math.PI, mask: popcount(dir.framing.gsMask & ((1 << n) - 1)) }
          frames.push(f)
          if (opt.trace) {
            const [tm, tn, ts, ta, tb] = String(opt.trace).split(':')
            if (tm === map && +tn! === n && +ts! === seed && st.sun.t >= +ta! && st.sun.t <= +tb! && alpha === 1 && Math.round(st.sun.t * 30) % 3 === 0) {
              const F = dir.framing as unknown as Record<string, any>
              console.log(`  t=${st.sun.t.toFixed(2)} larg ${dir.framing.width.toFixed(0)} tours ${pc(cover)} max ${pc(towerMax)} ${towerName} 1er plan ${pc(fg)} | caméra : sans parade ${pc(F.coverTrace.base)} prévu ${pc(F.coverTrace.chosen)} choix ${F.coverTrace.pick} relève ${((F.boost.x * 180) / Math.PI).toFixed(1)}° recul ×${Math.exp(F.widen.x).toFixed(2)} (but ×${Math.exp(F.widenGoal).toFixed(2)}) glisse (${F.shiftGoalX.toFixed(0)}, ${F.shiftGoalY.toFixed(0)}) cible (${rig.tx.toFixed(0)}, ${rig.ty.toFixed(0)}) caméra (${c.x.toFixed(0)}, ${(-c.z).toFixed(0)}, ${c.y.toFixed(0)}) masque ${dir.framing.gsMask.toString(2)}`)
            }
          }
          if (opt.rows && Math.round(st.sun.t * 60) % 30 === 0 && alpha === 1)
            console.log(`${map} n${n} s${seed} t=${f.t} larg ${f.width.toFixed(0)} env ${f.span.toFixed(0)} tours ${(100 * cover).toFixed(1)} (max ${(100 * towerMax).toFixed(1)} ${towerName}, 1er plan ${(100 * fg).toFixed(1)}) tranche ${slice.toFixed(2)}${sliceCentral ? ' CENTRE' : ''} front ${front} couronne ${crown}`)
        }
      }
      dir.dispose()
    }

const q = (a: number[], p: number) => { const b = [...a].sort((x, y) => x - y); return b.length ? b[Math.min(b.length - 1, Math.floor(p * b.length))]! : NaN }
/**
 * Image ratée : une tour > 12 % du cadre (ou toutes > 18 %), tour de premier plan > 6 %, disque tranché
 * au centre, ou plan large (> 250 m à 6 oiseaux ou moins, dès 98 s).
 */
const bad = (f: Frame) => f.towerMax > 0.12 || f.cover > 0.18 || f.fg > 0.06 || f.sliceCentral || (f.n <= 6 && f.t >= 98 && f.width > 250)
console.log(`bots=${opt.bots ?? 'banc'} cartes=${maps.join(',')} n=${ns.join(',')} graines=${seeds.join(',')} humains=${[...humans].join(',') || 'aucun'} fenêtre ${T0}-110 s ; DISC_WHOLE=${DISC_WHOLE}`)
console.log('| carte | n | images | env. méd (p10 des médianes par manche) | largeur méd / max | tours tot. max / > 12 % | tour seule max / > 12 % | 1er plan max / > 6 % | disques tranchés (centre) | images composées | front vu | couronne (bot) à l\'écran / coupée / hors | bots coupés (moy.) |')
console.log('|---|---|---|---|---|---|---|---|---|---|---|---|---|')
const groups: [string, (f: Frame) => boolean][] = []
for (const m of maps) for (const n of ns) groups.push([`${m} | ${n}`, (f) => f.map === m && f.n === n])
for (const n of ns) groups.push([`**toutes** | ${n}`, (f) => f.n === n])
for (const [name, sel] of groups) {
  const g = frames.filter(sel)
  if (!g.length) continue
  const perRound = new Map<string, number[]>()
  for (const f of g) {
    const key = `${f.map}/${f.n}/${f.seed}`
    if (!perRound.has(key)) perRound.set(key, [])
    perRound.get(key)!.push(f.span)
  }
  const roundMed = [...perRound.values()].map((a) => q(a, 0.5))
  const fr = g.filter((f) => f.front !== null)
  const cr = g.filter((f) => f.crown === 'in' || f.crown === 'edge' || f.crown === 'off')
  console.log(
    `| ${name} | ${g.length} | ${q(g.map((f) => f.span), 0.5).toFixed(0)} px (${q(roundMed, 0.1).toFixed(0)}) | ${q(g.map((f) => f.width), 0.5).toFixed(0)} / ${Math.max(...g.map((f) => f.width)).toFixed(0)} m | ${pc(Math.max(...g.map((f) => f.cover)))} / ${pc(g.filter((f) => f.cover > 0.12).length / g.length)} % | ${pc(Math.max(...g.map((f) => f.towerMax)))} / ${pc(g.filter((f) => f.towerMax > 0.12).length / g.length)} % | ${pc(Math.max(...g.map((f) => f.fg)))} / ${pc(g.filter((f) => f.fg > 0.06).length / g.length)} % | ${pc(g.filter((f) => f.slice > 0).length / g.length)} % (${pc(g.filter((f) => f.sliceCentral).length / g.length)} %) | ${pc(g.filter((f) => !bad(f)).length / g.length)} % | ${fr.length ? pc(fr.filter((f) => f.front).length / fr.length) : '-'} % | ${cr.length ? `${pc(cr.filter((f) => f.crown === 'in').length / cr.length)} / ${pc(cr.filter((f) => f.crown === 'edge').length / cr.length)} / ${pc(cr.filter((f) => f.crown === 'off').length / cr.length)}` : '-'} % | ${(g.reduce((a, f) => a + f.botEdge, 0) / g.length).toFixed(2)} |`,
  )
}
console.log(`coût de CameraDirector.update (toute la manche) : médiane ${q(updMs, 0.5).toFixed(3)} ms, p99 ${q(updMs, 0.99).toFixed(3)} ms, p99,9 ${q(updMs, 0.999).toFixed(2)} ms`)
console.log(`parades choisies (indice de candidat : nombre) : ${[...picks.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v}`).join(' ')}`)
// causes des images ratées (dès 98 s)
{
  const g = frames.filter((f) => f.t >= 98)
  const k = (sel: (f: Frame) => boolean) => pc(g.filter(sel).length / g.length)
  const hi = g.filter((f) => f.towerMax > 0.12)
  console.log(`images avec une tour > 12 % : ${hi.length} ; la caméra y prévoyait sa parade sous 10 % : ${pc(hi.filter((f) => f.chosen <= 0.1).length / Math.max(1, hi.length))} %, sous 12 % : ${pc(hi.filter((f) => f.chosen <= 0.12).length / Math.max(1, hi.length))} %`)
  console.log(`ratées dès 98 s : ${k(bad)} % — une tour > 12 % : ${k((f) => f.towerMax > 0.12)} %, toutes > 18 % : ${k((f) => f.cover > 0.18)} % (> 12 % : ${k((f) => f.cover > 0.12)} %), 1er plan > 6 % : ${k((f) => f.fg > 0.06)} %, tranché au centre : ${k((f) => f.sliceCentral)} %, plan large > 250 m : ${k((f) => f.n <= 6 && f.width > 250)} % ; couronne (bot) hors ou coupée : ${pc(g.filter((f) => f.crown === 'off' || f.crown === 'edge').length / Math.max(1, g.filter((f) => f.crown !== 'human' && f.crown !== 'none').length))} % ; envergure médiane < 100 px : ${k((f) => f.span < 100)} %`)
}
// par seconde, toutes cartes (entrée : 97-100 s)
console.log('par tranche : t | env. méd | largeur méd | tours tot. max | tour seule > 12 % | 1er plan > 6 % | tranchés au centre | couronne hors ou coupée | composées')
for (let t0 = T0; t0 < 110; t0 += 1) {
  const r = frames.filter((f) => f.t >= t0 && f.t < t0 + 1)
  if (!r.length) continue
  const cr = r.filter((f) => f.crown === 'in' || f.crown === 'edge' || f.crown === 'off')
  console.log(`  ${t0}-${t0 + 1} s | ${q(r.map((f) => f.span), 0.5).toFixed(0)} px | ${q(r.map((f) => f.width), 0.5).toFixed(0)} m | ${pc(Math.max(...r.map((f) => f.cover)))} % | ${pc(r.filter((f) => f.towerMax > 0.12).length / r.length)} % | ${pc(r.filter((f) => f.fg > 0.06).length / r.length)} % | ${pc(r.filter((f) => f.sliceCentral).length / r.length)} % | ${cr.length ? pc(cr.filter((f) => f.crown !== 'in').length / cr.length) : '-'} % | ${pc(r.filter((f) => !bad(f)).length / r.length)} %`)
}
// pires images (pour les captures) : tour seule, tranches centrales, largeur
const worst = +(opt.worst ?? 8)
const show = (label: string, list: Frame[]) => {
  console.log(label)
  for (const f of list.slice(0, worst)) console.log(`  ${f.map} n${f.n} s${f.seed} t=${f.t} larg ${f.width.toFixed(0)} env ${f.span.toFixed(0)} tours ${pc(f.cover)} (max ${pc(f.towerMax)} ${f.towerName}, 1er plan ${pc(f.fg)}) tranche ${f.slice.toFixed(2)}${f.sliceCentral ? ' CENTRE' : ''} couronne ${f.crown} recul ×${f.widen.toFixed(2)} relève ${f.boost.toFixed(1)}° cadrés ${f.mask}/${f.n}`)
}
const dedupe = (list: Frame[]) => { const seen = new Set<string>(); return list.filter((f) => { const k = `${f.map}${f.n}${f.seed}${Math.floor(f.t)}`; if (seen.has(k)) return false; seen.add(k); return true }) }
show('pires : tour seule', dedupe([...frames].sort((a, b) => b.towerMax - a.towerMax)))
show('pires : tours totales', dedupe([...frames].sort((a, b) => b.cover - a.cover)))
show('pires : tranches au centre', dedupe(frames.filter((f) => f.sliceCentral).sort((a, b) => b.slice - a.slice)))
show('pires : premier plan', dedupe([...frames].sort((a, b) => b.fg - a.fg)))
show('pires : largeur (dès 98 s)', dedupe(frames.filter((f) => f.t >= 98).sort((a, b) => b.width - a.width)))
show('pires : envergure', dedupe([...frames].sort((a, b) => a.span - b.span)))
