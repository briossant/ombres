// Cinématique du titre (polish vague 2, correcteur title) : cases de l'UI, juge de composition,
// jumelle de la démo (avenir exact), et une démo réelle filmée sans image ratée.
import { describe, expect, it } from 'vitest'
import * as THREE from 'three'
import { createBot, demoTeam } from '../../bots/index.ts'
import { InputRouter, type LocalInput } from '../../input/router.ts'
import { createSimulation } from '../../sim/simulation.ts'
import { RULES } from '../../sim/rules.ts'
import type { MapId, SimEvent } from '../../sim/types.ts'
import { Emitter } from '../bus.ts'
import { worldView } from '../render/worldView.ts'
import type { GameView } from '../view.ts'
import { BirdSet, frameFault, predictBirds, TITLE_LAYOUT, titleUiRects, type CineShot } from './cine.ts'
import { cameraState, cueCamera } from './cue.ts'
import { DemoFuture, demoFuture } from './demoFuture.ts'
import { CameraDirector } from './director.ts'
import { DEG, makePose, placeForSubject, yawOfDir, yawPitchQuat } from './math.ts'

const seedOf = (seed: number, i: number) => (seed * 7919 + i * 104729) >>> 0

function demo(seed: number, map: MapId) {
  const team = demoTeam(6, seed)
  const cfg = { mode: 'demo' as const, seed, mapId: map, birds: team.map((_, i) => ({ slot: i, assist: false })), sunSeconds: RULES.titleDemoSunSeconds, countdown: false }
  const sim = createSimulation(cfg)
  const bots = () => team.map((spec, i) => createBot({ slot: i, personality: spec.personality, level: spec.level, seed: seedOf(seed, i) }))
  const router = new InputRouter(null as unknown as LocalInput)
  router.reset()
  for (const b of bots()) router.set(b.slot, { kind: 'bot', bot: b })
  let evs: SimEvent[] = []
  return { sim, bots, step: () => (evs = sim.step(router.collect(sim.state, evs))) }
}

describe('titre : cases de l’UI', () => {
  it('16:9 : logo, pitch, pied de page, bouton et menu aux places mesurées', () => {
    const [logo, pitch, foot, press, menu] = titleUiRects(16 / 9)
    expect(logo!.x0).toBeCloseTo(0.03, 2)
    expect(logo!.x1).toBeCloseTo(0.576, 2)
    expect(pitch!.y1).toBeCloseTo(0.455, 2)
    expect(foot!.y0).toBeCloseTo(0.785, 2)
    expect(press!.x0).toBeGreaterThan(0.38)
    expect(press!.x1).toBeLessThan(0.62)
    expect(menu!.x0).toBeCloseTo(0.72, 2)
  })
})

describe('titre : juge de composition', () => {
  const d = demo(3, 'parasols')
  const v: GameView = { sim: d.sim.state, prevBirds: [], alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
  const birds = predictBirds(d.sim.state, v, 0, new BirdSet())
  const aspect = 16 / 9

  it('une tour collée à l’objectif est refusée', () => {
    const t = d.sim.state.towers[0]!
    const p = makePose()
    p.pos.set(t.x + 14, 8, -t.y)
    yawPitchQuat(p.quat, yawOfDir(-1, 0), 0)
    expect(frameFault(d.sim.state, birds, p, aspect, TITLE_LAYOUT, true, -1)).toMatch(/near|wide|clutter/)
  })

  it('le sujet sous le logo est toujours refusé ; posé dans la zone libre, une prise propre existe', () => {
    const p = makePose()
    let clean = 0
    for (const bird of d.sim.state.birds)
      for (let a = 0; a < 360; a += 15)
        for (const [sx, sy, bad] of [
          [0.3, 0.2, true],
          [0.72, 0.46, false],
        ] as const) {
          yawPitchQuat(p.quat, a * DEG, -20 * DEG)
          p.fov = 40
          placeForSubject(p.pos, new THREE.Vector3(bird.x, bird.z + 1, -bird.y), p.quat, 40, aspect, sx, sy, 34)
          const f = frameFault(d.sim.state, birds, p, aspect, TITLE_LAYOUT, true, bird.slot)
          if (bad) expect(f).not.toBe('')
          else if (f === '') clean++
        }
    expect(clean).toBeGreaterThan(0)
  })
})

describe('titre : jumelle de la démo', () => {
  it('suit la démo au tick près et connaît son avenir', () => {
    const d = demo(11, 'cadran')
    const f = new DemoFuture()
    f.prebuild(d.sim.state, d.bots())
    f.warm(d.sim.state)
    f.begin(d.sim.state)
    const v: GameView = { sim: d.sim.state, prevBirds: [], alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
    const ahead = new BirdSet()
    expect(f.birdsAt(d.sim.state, 1, 3, ahead)).toBe(true)
    const b0 = ahead.get(2)!
    for (let k = 0; k < 90; k++) {
      d.step()
      f.follow(d.sim.state)
    }
    expect(f.valid).toBe(true)
    const now = predictBirds(d.sim.state, v, 0, new BirdSet()).get(2)!
    expect(Math.hypot(now.x - b0.x, now.y - b0.y, now.z - b0.z)).toBeLessThan(0.02)
    for (let k = 0; k < 300; k++) {
      d.step()
      f.follow(d.sim.state)
    }
    expect(f.valid).toBe(true)
    expect(f.horizon(d.sim.state, 1)).toBeGreaterThan(7.5)
  })
})

describe('titre : une démo filmée', () => {
  it('20 s de démo, chaque image composée ; aucune pose non finie', { timeout: 60000 }, () => {
    const d = demo(5, 'geantes')
    demoFuture.prebuild(d.sim.state, d.bots())
    demoFuture.warm(d.sim.state)
    demoFuture.begin(d.sim.state)
    const prev = new Array(12).fill(undefined)
    const v: GameView = { sim: d.sim.state, prevBirds: prev, alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
    const dir = new CameraDirector(new Emitter<SimEvent>())
    cueCamera('title', { cut: true })
    const shot = () => (dir as unknown as { shot: CineShot }).shot
    let judged = 0
    let bad = 0
    for (let tick = 0; tick < 20 * RULES.tickHz; tick++) {
      for (const b of d.sim.state.birds) prev[b.slot] = { ...b, shadow: { ...b.shadow } }
      d.step()
      demoFuture.follow(d.sim.state)
      for (const alpha of [0.5, 1]) {
        v.alpha = alpha
        v.realTime += 1 / 60
        const p = dir.update(1 / 60, v, 16 / 9)
        expect(Number.isFinite(p.pos.x + p.pos.y + p.pos.z + p.quat.w)).toBe(true)
        if (alpha === 1 && tick % 3 === 0) {
          judged++
          if (shot().judge(d.sim.state, v, p, 16 / 9, worldView.hideStorm)) bad++
        }
      }
    }
    expect(cameraState.mode).toBe('title')
    expect(judged).toBeGreaterThan(190)
    expect(bad).toBe(0)
    dir.dispose()
    demoFuture.end()
  })
})
