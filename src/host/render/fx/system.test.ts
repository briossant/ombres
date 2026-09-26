// FxSystem sans GPU : tous les événements et états sont digérés sans erreur, le
// plafond de particules est respecté et les pools se vident quand les effets meurent.
import { PerspectiveCamera } from 'three'
import { describe, expect, it } from 'vitest'
import { RULES } from '../../../sim/rules.ts'
import type { BirdState, SimEvent, SimState } from '../../../sim/types.ts'
import type { GameView } from '../../view.ts'
import { FX_CAPS, FxSystem } from './system.ts'
import { PathBuffer } from './path.ts'

function bird(slot: number, over: Partial<BirdState> = {}): BirdState {
  return {
    slot,
    x: slot * 20,
    y: 0,
    z: RULES.altLow,
    vx: 16,
    vy: 0,
    vz: 0,
    heading: 0,
    turnRate: 0,
    speed: 16,
    targetLow: true,
    strong: true,
    shadow: { cx: slot * 20, cy: 0, r: 5, rAlong: 5, strong: true, paints: true },
    dive: 'none',
    diveTarget: -1,
    diveTime: 0,
    lockTarget: -1,
    lockedBy: -1,
    stun: 0,
    stunKind: 'none',
    immune: 0,
    flap: 0,
    flapCooldown: 0,
    diveCooldown: 0,
    hidden: false,
    inNight: false,
    inStorm: false,
    crown: false,
    assist: false,
    towerSlide: 0,
    ...over,
  }
}

function view(birds: BirdState[]): GameView {
  const bySlot: (BirdState | undefined)[] = new Array(12)
  for (const b of birds) bySlot[b.slot] = b
  const sim = {
    birds,
    bySlot,
    crownSlot: 0,
    arena: { a: 165, b: 114, stormFrom: 0.92 },
    night: { active: true, dirX: 1, dirY: 0, s: 0, jag: new Float32Array(8), jagSpan: 200 },
  } as unknown as SimState
  return { sim, prevBirds: [], alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: true }
}

describe('FxSystem', () => {
  it('digère tous les états et événements, respecte le plafond', () => {
    const fx = new FxSystem('low')
    const birds = [
      bird(0, { dive: 'committed', diveTarget: 1, vz: -15 }),
      bird(1, { lockedBy: 0, immune: 1 }),
      bird(2, { stun: 1, stunKind: 'hit', hidden: true, assist: true }),
      bird(3, { z: RULES.altHigh, strong: false }),
    ]
    const v = view(birds)
    const cam = new PerspectiveCamera(40, 16 / 9, 1, 9000)
    cam.position.set(0, 200, 150)
    cam.lookAt(0, 0, 0)
    cam.updateMatrixWorld()
    const events: SimEvent[] = [
      { type: 'diveHit', hunter: 0, target: 1, x: 20, y: 0, z: 4, stolenCells: 100, crown: false },
      { type: 'diveMiss', hunter: 0, target: 1, dodged: true, x: 20, y: 0 },
      { type: 'diveCommit', hunter: 0, target: 1 },
      { type: 'flap', slot: 3 },
      { type: 'bump', a: 0, b: 1, x: 10, y: 0, z: 4 },
      { type: 'towerBump', slot: 2, tower: 0 },
      { type: 'paleOnStrong', slot: 3, x: 5, y: 5 },
      { type: 'crown', slot: 1, prev: 0 },
      { type: 'bigSteal', slot: 0, frac: 0.05, victim: 1 },
    ]
    fx.setGlory(1)
    for (let i = 0; i < 240; i++) {
      if (i % 20 === 0) for (const e of events) fx.push(e)
      for (const b of birds) b.x += 0.5
      fx.update(v, cam, 1 / 60, 1080)
      const s = fx.stats()
      expect(s.particles).toBeLessThanOrEqual(FX_CAPS.low)
    }
    expect(fx.stats().sprites).toBeGreaterThan(0)
    expect(fx.stats().strokes).toBeGreaterThan(0)
    fx.dispose()
  })
})

describe('PathBuffer', () => {
  it('garde les plus récents et les copie dans l’ordre', () => {
    const p = new PathBuffer(4)
    for (let i = 0; i < 6; i++) p.push(i, 0, 0, i)
    expect(p.count).toBe(4)
    const out = new Float32Array(16)
    expect(p.copyRecent(out, 3)).toBe(3)
    expect([out[0], out[4], out[8]]).toEqual([3, 4, 5])
  })
})
