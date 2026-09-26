// FxSystem sans GPU : tous les événements et états sont digérés sans erreur, le
// plafond de particules est respecté et les pools se vident quand les effets meurent.
import { PerspectiveCamera, Vector3 } from 'three'
import { describe, expect, it } from 'vitest'
import { RULES } from '../../../sim/rules.ts'
import type { BirdState, SimEvent, SimState } from '../../../sim/types.ts'
import type { GameView } from '../../view.ts'
import { FX_CAPS, FxSystem } from './system.ts'
import { PathBuffer } from './path.ts'
import { SHAPE } from './glsl.ts'

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

function view(birds: BirdState[], mode: 'round' | 'demo' = 'round'): GameView {
  const bySlot: (BirdState | undefined)[] = new Array(12)
  for (const b of birds) bySlot[b.slot] = b
  const sim = {
    config: { mode },
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

/** Caméra de jeu (plongée) au-dessus de l'origine. */
function gameCamera(): PerspectiveCamera {
  const cam = new PerspectiveCamera(40, 16 / 9, 1, 9000)
  cam.position.set(0, 200, 150)
  cam.lookAt(0, 0, 0)
  cam.updateMatrixWorld()
  return cam
}

/** Plus long segment d'un ruban (m) dans les tampons du lot : une ligne fantôme se voit ici. */
function longestRibbonSegment(fx: FxSystem): number {
  const R = fx.ribbons as unknown as { pos: { array: Float32Array }; index: { array: Uint16Array }; ni: number }
  const P = R.pos.array
  const I = R.index.array
  let best = 0
  for (let i = 0; i < R.ni; i += 3) {
    for (const [a, b] of [
      [I[i]!, I[i + 1]!],
      [I[i + 1]!, I[i + 2]!],
      [I[i]!, I[i + 2]!],
    ] as const) {
      const d = Math.hypot(P[a * 3]! - P[b * 3]!, P[a * 3 + 1]! - P[b * 3 + 1]!, P[a * 3 + 2]! - P[b * 3 + 2]!)
      best = Math.max(best, d)
    }
  }
  return best
}

describe('FxSystem : traînées fantômes (polish B2)', () => {
  it('oublie les traînées au changement de simulation, même figée (timeScale 0)', () => {
    const fx = new FxSystem('high')
    const cam = gameCamera()
    // Oiseau HAUT (filets d'air) et BAS (ruban) qui volent dans une première simulation.
    const a = [bird(0, { z: RULES.altHigh }), bird(1, { x: -40 })]
    const v1 = view(a)
    for (let i = 0; i < 60; i++) {
      for (const b of a) b.x += 0.4
      fx.update(v1, cam, 1 / 60, 1080)
    }
    // Nouvelle manche : mêmes slots, téléportés loin, simulation figée (compte à rebours).
    const b2 = [bird(0, { x: 120, y: 80, z: RULES.altHigh }), bird(1, { x: -120, y: -70 })]
    const v2 = view(b2)
    v2.timeScale = 0
    for (let i = 0; i < 30; i++) fx.update(v2, cam, 1 / 60, 1080)
    expect(longestRibbonSegment(fx)).toBeLessThan(5)
    fx.dispose()
  })

  it('oublie la traînée d’un oiseau téléporté de plus de 20 m dans la même simulation', () => {
    const fx = new FxSystem('high')
    const cam = gameCamera()
    const a = [bird(0, { z: RULES.altHigh })]
    const v = view(a)
    for (let i = 0; i < 60; i++) {
      a[0]!.x += 0.4
      fx.update(v, cam, 1 / 60, 1080)
    }
    a[0]!.x += 60
    a[0]!.y += 40
    fx.update(v, cam, 1 / 60, 1080)
    expect(longestRibbonSegment(fx)).toBeLessThan(5)
    fx.dispose()
  })
})

describe('FxSystem : gros plans et esquive (polish B6, B7)', () => {
  it('aucune icône d’état en démo', () => {
    const fx = new FxSystem('high')
    const cam = gameCamera()
    const birds = [bird(0, { hidden: true, lockedBy: 1 }), bird(1, { dive: 'windup', diveTarget: 0 })]
    const v = view(birds, 'demo')
    for (let i = 0; i < 30; i++) fx.update(v, cam, 1 / 60, 1080)
    expect(fx.stats().icons).toBe(0)
    const v2 = view(birds, 'round')
    for (let i = 0; i < 30; i++) fx.update(v2, cam, 1 / 60, 1080)
    expect(fx.stats().icons).toBeGreaterThan(0)
    fx.dispose()
  })

  it('une esquive dessine l’arc, des plumes et les étoiles du chasseur', () => {
    const fx = new FxSystem('high')
    const cam = gameCamera()
    const hunter = bird(0, { x: 10, z: RULES.altLow, stun: RULES.missStun, stunKind: 'miss' })
    const target = bird(1, { x: 30 })
    const v = view([hunter, target])
    fx.update(v, cam, 1 / 60, 1080)
    const before = fx.stats()
    fx.push({ type: 'diveMiss', hunter: 0, target: 1, dodged: true, x: 10, y: 0 })
    for (let i = 0; i < 6; i++) fx.update(v, cam, 1 / 60, 1080)
    const after = fx.stats()
    // arc + étoiles du chasseur + plumes : au moins 1 + 3 + 4 sprites de plus
    expect(after.sprites).toBeGreaterThanOrEqual(before.sprites + 8)
    expect(after.particles).toBeGreaterThan(before.particles + 3)
    expect(spriteHalfPx(fx, cam, SHAPE.arc).length).toBe(1)
    expect(iconHalfPx(fx, cam, SHAPE.cross4).length).toBe(6)
    expect(spriteHalfPx(fx, cam, SHAPE.feather).length).toBeGreaterThanOrEqual(4)
    // Encore 0,35 s : étoiles et plumes à pleine taille, lisibles à 50 px d'envergure.
    for (let i = 0; i < 21; i++) fx.update(v, cam, 1 / 60, 1080)
    for (const h of iconHalfPx(fx, cam, SHAPE.cross4)) expect(h).toBeGreaterThanOrEqual(6.5)
    for (const h of spriteHalfPx(fx, cam, SHAPE.feather)) expect(h).toBeGreaterThanOrEqual(5.5)
    fx.dispose()
  })
})

/** Demi-taille à l'écran (px à 1080p) d'un sprite, calculée comme le vertex shader. */
function spriteHalfPx(fx: FxSystem, cam: PerspectiveCamera, shape: number, batch: 'sprites' | 'icons' = 'sprites'): number[] {
  const B = fx[batch] as unknown as { a: Record<string, { array: Float32Array }>; count: number }
  const P = B.a.pos!.array
  const S = B.a.size!.array
  const R = B.a.rot!.array
  const out: number[] = []
  const v = new Vector3()
  for (let i = 0; i < B.count; i++) {
    if (Math.round(R[i * 2 + 1]!) !== shape) continue
    // Seulement ce qui est à l'écran (devant la caméra, dans le cadre).
    const ndc = new Vector3(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!).project(cam)
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) continue
    v.set(P[i * 3]!, P[i * 3 + 1]!, P[i * 3 + 2]!).applyMatrix4(cam.matrixWorldInverse)
    const pxPerM = (1080 * 0.5 * cam.projectionMatrix.elements[5]!) / Math.max(-v.z, 1e-3)
    out.push(Math.max(S[i * 4]! * pxPerM, S[i * 4 + 1]!))
  }
  return out
}

const iconHalfPx = (fx: FxSystem, cam: PerspectiveCamera, shape: number): number[] => spriteHalfPx(fx, cam, shape, 'icons')

/** Largeur à l'écran (px à 1080p) des points de ruban, calculée comme le vertex shader. */
function ribbonWidthsPx(fx: FxSystem, cam: PerspectiveCamera): number[] {
  const R = fx.ribbons as unknown as { pos: { array: Float32Array }; width: { array: Float32Array }; nv: number }
  const out: number[] = []
  const v = new Vector3()
  for (let i = 0; i < R.nv; i += 2) {
    const ndc = new Vector3(R.pos.array[i * 3]!, R.pos.array[i * 3 + 1]!, R.pos.array[i * 3 + 2]!).project(cam)
    if (Math.abs(ndc.x) > 1 || Math.abs(ndc.y) > 1 || ndc.z > 1) continue
    v.set(R.pos.array[i * 3]!, R.pos.array[i * 3 + 1]!, R.pos.array[i * 3 + 2]!).applyMatrix4(cam.matrixWorldInverse)
    const pxPerM = (1080 * 0.5 * cam.projectionMatrix.elements[5]!) / Math.max(-v.z, 1e-3)
    out.push(Math.max(R.width.array[i * 3]! * pxPerM, R.width.array[i * 3 + 1]!))
  }
  return out
}

describe('FxSystem : gros plans (polish B6)', () => {
  for (const dist of [12, 20, 35, 60]) {
    it(`caméra à ${dist} m : bouffées ≤ 60 px, ruban ≤ 6 px`, () => {
      const fx = new FxSystem('high')
      const b = bird(0, { x: 0, z: RULES.altLow })
      const v = view([b])
      const cam = new PerspectiveCamera(40, 16 / 9, 0.5, 9000)
      for (let i = 0; i < 180; i++) {
        b.x += 0.3
        b.shadow.cx = b.x
        cam.position.set(b.x - dist * 0.6, dist * 0.35, dist * 0.7)
        cam.lookAt(b.x, 1, 0)
        cam.updateMatrixWorld()
        fx.update(v, cam, 1 / 60, 1080)
        for (const h of spriteHalfPx(fx, cam, SHAPE.puff)) expect(h * 2 * 0.92).toBeLessThanOrEqual(60.5)
        for (const w of ribbonWidthsPx(fx, cam)) expect(w).toBeLessThanOrEqual(6.01)
      }
      fx.dispose()
    })
  }
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
