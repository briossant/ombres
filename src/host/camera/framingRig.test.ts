// Cadrage de manche (polish S1, S2, S3, S6) : boîtes des oiseaux dans le rectangle utile, arène
// à 12 oiseaux, front de la Grande Ombre borné, couverture des tours, punch-in.
import { describe, expect, it } from 'vitest'
import { createBot, defaultBots } from '../../bots/index.ts'
import { RULES } from '../../sim/rules.ts'
import { createSimulation } from '../../sim/simulation.ts'
import type { BirdInput, BirdState, SimEvent, SimState } from '../../sim/types.ts'
import { crownLift } from '../render/bird/anchors.ts'
import type { GameView } from '../view.ts'
import { projectRig, type Rig } from './framing.ts'
import { CROWDED_BIRDS, FramingRig, greatShadowProgress, towerCoverage, USEFUL_RECT, USEFUL_RECT_CROWDED } from './framingRig.ts'
import { DEG } from './math.ts'

const aspect = 16 / 9

function run(n: number, seed: number, times: number[], visit: (sim: SimState, view: GameView) => void, map: 'parasols' | 'cadran' = 'parasols') {
  const sim = createSimulation({ mode: 'round', seed, mapId: map, birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: true })
  const specs = defaultBots(0, 1)
  const bots = Array.from({ length: n }, (_, slot) => createBot({ slot, personality: specs[slot % specs.length]!.personality, level: 1, seed: seed * 100 + slot }))
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  const prev: (BirdState | undefined)[] = new Array(12).fill(undefined)
  const view: GameView = { sim: sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
  let evs: SimEvent[] = []
  const todo = [...times].sort((a, b) => a - b)
  if (todo[0]! < 0) visit(sim.state, view), todo.shift()
  while (todo.length && !sim.state.over) {
    for (const b of bots) inputs[b.slot] = b.think(sim.state, evs)
    for (const b of sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
    evs = sim.step(inputs)
    if (sim.state.sun.t >= todo[0]!) {
      visit(sim.state, view)
      todo.shift()
    }
  }
}

/** Pire débordement (fractions d'écran, > 0 = dehors) des boîtes d'oiseaux (du masque de slots) hors d'un rectangle. */
function worstBox(rig: Rig, sim: SimState, rect: typeof USEFUL_RECT, mask = 0xfff): number {
  const o = { x: 0, y: 0, z: 0 }
  const up = { y: Math.sin(rig.pitch), z: Math.cos(rig.pitch) }
  let worst = -1
  for (const b of sim.birds) {
    if (!((mask >> b.slot) & 1)) continue
    const W = RULES.wingspan
    const top = sim.crownSlot === b.slot ? Math.max(0.5 * W, crownLift(Math.sin(rig.pitch)) + 1.6) : 0.5 * W
    const bot = 0.74 * W
    projectRig(rig, aspect, b.x - 0.5 * W, b.y, b.z, o)
    worst = Math.max(worst, rect.x0 - o.x)
    projectRig(rig, aspect, b.x + 0.5 * W, b.y, b.z, o)
    worst = Math.max(worst, o.x - rect.x1)
    projectRig(rig, aspect, b.x, b.y + up.y * top, b.z + up.z * top, o)
    worst = Math.max(worst, rect.y0 - o.y)
    projectRig(rig, aspect, b.x, b.y - up.y * bot, b.z - up.z * bot, o)
    worst = Math.max(worst, o.y - rect.y1)
  }
  return worst
}

describe('FramingRig (manche)', () => {
  for (const n of [2, 6, 12])
    it(`${n} oiseaux : chaque boîte d'oiseau cadré tient dans le rectangle utile, l'humain toujours (compte à rebours → Grande Ombre)`, { timeout: 60000 }, () => {
      const rect = n > CROWDED_BIRDS ? USEFUL_RECT_CROWDED : USEFUL_RECT
      run(n, 3, [-2.5, 20, 55, 88, 101], (sim, view) => {
        view.players[0] = { slot: 0, colorIndex: 0, name: 'J', kind: 'keyboard', assist: false }
        const f = new FramingRig()
        f.reset('round')
        f.snap(sim, view, aspect)
        // hors de la Grande Ombre, tous les oiseaux sont cadrés ; pendant, les bots loin du front
        // peuvent sortir (plan serré, vague 2), jamais l'humain
        if (sim.sun.phase !== 'greatShadow' || n > CROWDED_BIRDS) expect(f.gsMask).toBe(0xfff)
        expect(f.gsMask & 1).toBe(1)
        // cadre visé (snap) puis cadre suivi (ressorts + garde-fou)
        if (sim.sun.t >= 0) expect(worstBox(f.rig, sim, rect, f.gsMask)).toBeLessThan(0.012)
        for (let i = 0; i < 20; i++) f.update(1 / 60, sim, view, aspect)
        if (sim.sun.t >= 0) expect(worstBox(f.rig, sim, rect, f.gsMask)).toBeLessThan(0.012)
        if (sim.sun.t >= 0) expect(worstBox(f.rig, sim, rect, 1)).toBeLessThan(0.012)
      })
    })

  for (const n of [4, 6])
    it(`Grande Ombre à ${n} oiseaux : plan serré qui se resserre, front dans le cadre, humain tenu`, { timeout: 60000 }, () => {
      const widths: number[] = []
      let frontSeen = 0
      let samples = 0
      const sim0 = { f: null as FramingRig | null }
      run(n, 2, [96, 99, 101, 103, 105, 107, 109], (sim, view) => {
        view.players[0] = { slot: 0, colorIndex: 0, name: 'J', kind: 'keyboard', assist: false }
        const f = (sim0.f ??= new FramingRig())
        if (sim.sun.t < 97) {
          f.reset('round')
          f.snap(sim, view, aspect)
          return
        }
        // ressorts entre deux instants (2 s de jeu, pas de 1/60 s ; les oiseaux figés : borne basse)
        for (let i = 0; i < 120; i++) f.update(1 / 60, sim, view, aspect)
        widths.push(f.width)
        expect(worstBox(f.rig, sim, USEFUL_RECT, 1)).toBeLessThan(0.012)
        if (sim.night.active) {
          // le front à moins de 60 m derrière l'oiseau cadré le plus à l'ouest doit être dans le cadre
          const nt = sim.night
          const framed = sim.birds.filter((b) => (f.gsMask >> b.slot) & 1)
          const west = Math.min(...framed.map((b) => b.x * nt.dirX + b.y * nt.dirY))
          if (nt.s < west - 60 || nt.s > west) return
          samples++
          const o = { x: 0, y: 0, z: 0 }
          const yM = framed.reduce((a, b) => a + b.y, 0) / framed.length
          projectRig(f.rig, aspect, nt.dirX * nt.s - nt.dirY * yM, nt.dirY * nt.s + nt.dirX * yM, 0, o)
          if (o.x > 0 && o.x < 1 && o.y > 0 && o.y < 1) frontSeen++
        }
      })
      // jamais le plan large (arène entière = 2,2 a) ; le cadre final est plus serré que le premier
      for (const w of widths) expect(w).toBeLessThan(1.45 * (n > 4 ? 165 : 142))
      expect(widths[widths.length - 1]!).toBeLessThan(widths[0]!)
      expect(samples).toBeGreaterThan(0)
      expect(frontSeen).toBe(samples)
    })

  it('12 oiseaux dispersés : arène posée dans le rectangle utile, peu de sable vide en bas', { timeout: 60000 }, () => {
    run(12, 5, [30, 70], (sim, view) => {
      // oiseaux répartis sur toute l'arène : cadrage « arène entière »
      sim.birds.forEach((b, i) => {
        const th = (i / sim.birds.length) * Math.PI * 2
        b.x = Math.cos(th) * sim.arena.a * 0.8
        b.y = Math.sin(th) * sim.arena.b * 0.8
        b.shadow.cx = b.x + 10
        b.shadow.cy = b.y
        view.prevBirds[b.slot] = { ...b, shadow: { ...b.shadow } }
      })
      const f = new FramingRig()
      f.reset('round')
      f.snap(sim, view, aspect)
      const o = { x: 0, y: 0, z: 0 }
      let y1 = -1
      for (let i = 0; i < 48; i++) {
        const th = (i / 48) * Math.PI * 2
        projectRig(f.rig, aspect, Math.cos(th) * sim.arena.a, Math.sin(th) * sim.arena.b, 0, o)
        y1 = Math.max(y1, o.y)
      }
      // le bord sud de l'arène est à moins de 6 % du bas de l'écran (ou au-delà)
      expect(1 - y1).toBeLessThan(0.06)
    })
  })

  it("Grande Ombre : le front n'impose plus le plan large (borné à 40 m de l'oiseau le plus à l'ouest)", { timeout: 60000 }, () => {
    run(4, 2, [99.5], (sim, view) => {
      expect(sim.sun.phase).toBe('greatShadow')
      expect(greatShadowProgress(sim)).toBeGreaterThan(0)
      // groupe serré à l'est, front encore loin à l'ouest
      sim.birds.forEach((b, i) => {
        b.x = 60 + i * 8
        b.y = i * 6
        b.z = 6
        b.shadow.cx = b.x + 20
        b.shadow.cy = b.y
        view.prevBirds[b.slot] = { ...b, shadow: { ...b.shadow } }
      })
      sim.night.s = -sim.arena.a
      const f = new FramingRig()
      f.reset('round')
      f.snap(sim, view, aspect)
      // l'ancien cadrage allait du front (−a) aux ombres (≈ +110 m) : > 1,5 a
      expect(f.width).toBeLessThan(1.2 * sim.arena.a)
      expect(f.rig.pitch).toBeLessThan((RULES.camPitchEndDeg + 2) * DEG)
    })
  })

  it('couverture des tours : forte juste au-dessus d’un grand disque, faible de loin', () => {
    run(2, 1, [-2.9], (sim) => {
      const t = sim.towers.find((x) => x.archetype === 'parasol' && x.height > 40)!
      const near: Rig = { tx: t.x, ty: t.y + 30, tz: 0, yaw: 0, pitch: 45 * DEG, dist: 75, fov: 40 }
      const far: Rig = { tx: t.x, ty: t.y + 30, tz: 0, yaw: 0, pitch: 58 * DEG, dist: 600, fov: 40 }
      expect(towerCoverage(sim, near, aspect)).toBeGreaterThan(0.2)
      expect(towerCoverage(sim, far, aspect)).toBeLessThan(0.05)
    })
  })

  it('punch-in : une touche de couronne serre le cadre sur la paire, au plus un toutes les 6 s', { timeout: 60000 }, () => {
    run(6, 4, [40], (sim, view) => {
      const [h, g] = [sim.birds[0]!, sim.birds[1]!]
      g.x = h.x + 3
      g.y = h.y + 2
      view.prevBirds[g.slot] = { ...g, shadow: { ...g.shadow } }
      // témoin sans punch-in, mêmes mises à jour
      const ref = new FramingRig()
      ref.reset('round')
      ref.snap(sim, view, aspect)
      const f = new FramingRig()
      f.reset('round')
      f.snap(sim, view, aspect)
      for (let i = 0; i < 30; i++) f.update(1 / 60, sim, view, aspect), ref.update(1 / 60, sim, view, aspect)
      const w0 = f.rig.dist
      const hit = { type: 'diveHit' as const, hunter: h.slot, target: g.slot, x: g.x, y: g.y, z: g.z, stolenCells: 10, crown: true }
      expect(f.onDiveHit(hit, sim, view)).toBe(true)
      let minDist = Infinity
      for (let i = 0; i < 60; i++) {
        f.update(1 / 60, sim, view, aspect)
        ref.update(1 / 60, sim, view, aspect)
        minDist = Math.min(minDist, f.rig.dist)
      }
      expect(minDist).toBeLessThan(w0 * 0.78)
      // la paire reste dans le rectangle utile pendant le punch-in
      const o = { x: 0, y: 0, z: 0 }
      for (const b of [h, g]) {
        projectRig(f.rig, aspect, b.x, b.y, b.z, o)
        expect(o.x).toBeGreaterThan(USEFUL_RECT.x0)
        expect(o.x).toBeLessThan(USEFUL_RECT.x1)
        expect(o.y).toBeGreaterThan(USEFUL_RECT.y0)
        expect(o.y).toBeLessThan(USEFUL_RECT.y1)
      }
      // une deuxième touche dans les 6 s ne relance rien
      expect(f.onDiveHit(hit, sim, view)).toBe(false)
      // retour en ressort
      for (let i = 0; i < 60 * 4; i++) f.update(1 / 60, sim, view, aspect), ref.update(1 / 60, sim, view, aspect)
      expect(f.punchLevel).toBeLessThan(0.02)
      expect(Math.abs(f.rig.dist / ref.rig.dist - 1)).toBeLessThan(0.03)
    })
  })

  it('punch-in : une touche entre bots sans enjeu ne déclenche rien ; un humain impliqué, si', { timeout: 60000 }, () => {
    run(6, 6, [30], (sim, view) => {
      const f = new FramingRig()
      f.reset('round')
      f.snap(sim, view, aspect)
      const [h, g] = [sim.birds[2]!, sim.birds[3]!]
      const hit = { type: 'diveHit' as const, hunter: h.slot, target: g.slot, x: g.x, y: g.y, z: g.z, stolenCells: 1, crown: false }
      expect(f.onDiveHit(hit, sim, view)).toBe(false)
      view.players[g.slot] = { slot: g.slot, colorIndex: g.slot, name: 'J', kind: 'phone', assist: false }
      expect(f.onDiveHit(hit, sim, view)).toBe(true)
      view.players[g.slot] = undefined
    })
  })
})
