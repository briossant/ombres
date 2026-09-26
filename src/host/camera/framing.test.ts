import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { rigPose } from './cine.ts'
import { clampRigToSets, fitPoints, fitSets, makeSetsFit, projectRig, type FitSet, type Rig, type ScreenRect } from './framing.ts'
import { DEG, makePose } from './math.ts'

const aspect = 16 / 9

function screenBounds(yawDeg: number, pitchDeg: number, rect: ScreenRect, pts: number[][]) {
  const P = new Float64Array(pts.length * 3)
  pts.forEach((p, i) => P.set(p, i * 3))
  const out = { tx: 0, ty: 0, dist: 0, width: 0 }
  fitPoints(P, pts.length, yawDeg * DEG, pitchDeg * DEG, 40, aspect, rect, 20, 4000, out)
  const pose = makePose()
  rigPose({ tx: out.tx, ty: out.ty, tz: 0, yaw: yawDeg * DEG, pitch: pitchDeg * DEG, dist: out.dist, fov: 40 }, pose)
  const cam = new THREE.PerspectiveCamera(40, aspect, 1, 9000)
  cam.position.copy(pose.pos)
  cam.quaternion.copy(pose.quat)
  cam.updateMatrixWorld()
  cam.updateProjectionMatrix()
  let x0 = 9
  let x1 = -9
  let y0 = 9
  let y1 = -9
  for (const p of pts) {
    const v = new THREE.Vector3(p[0], p[2], -p[1]).project(cam)
    const sx = (v.x + 1) / 2
    const sy = (1 - v.y) / 2
    x0 = Math.min(x0, sx)
    x1 = Math.max(x1, sx)
    y0 = Math.min(y0, sy)
    y1 = Math.max(y1, sy)
  }
  return { x0, x1, y0, y1 }
}

const ellipse: number[][] = []
for (let i = 0; i < 20; i++) {
  const th = (i / 20) * Math.PI * 2
  ellipse.push([Math.cos(th) * 170, Math.sin(th) * 118, 0])
}

describe('fitPoints', () => {
  const rects: ScreenRect[] = [
    { x0: 0.05, x1: 0.69, y0: 0.5, y1: 0.95 },
    { x0: 0.12, x1: 0.88, y0: 0.15, y1: 0.85 },
    { x0: 0.035, x1: 0.515, y0: 0.085, y1: 0.915 },
  ]
  for (const rect of rects)
    for (const yaw of [0, 25, -40, 70])
      for (const pitch of [15, 26, 50, 89.99]) {
        it(`ellipse dans ${JSON.stringify(rect)} lacet ${yaw} tangage ${pitch}`, () => {
          const b = screenBounds(yaw, pitch, rect, ellipse)
          // tient dans le rectangle, et le remplit sur au moins un axe
          expect(b.x0).toBeGreaterThan(rect.x0 - 0.02)
          expect(b.x1).toBeLessThan(rect.x1 + 0.02)
          expect(b.y0).toBeGreaterThan(rect.y0 - 0.02)
          expect(b.y1).toBeLessThan(rect.y1 + 0.02)
          const fill = Math.max((b.x1 - b.x0) / (rect.x1 - rect.x0), (b.y1 - b.y0) / (rect.y1 - rect.y0))
          expect(fill).toBeGreaterThan(0.93)
        })
      }
  it('oiseaux et ombres (cadrage de jeu)', () => {
    const rect = { x0: 0.12, x1: 0.88, y0: 0.15, y1: 0.85 }
    const b = screenBounds(0, 55, rect, [
      [10, 20, 0],
      [-40, 30, 18],
      [60, -50, 4],
      [-80, -20, 0],
    ])
    expect(b.x0).toBeGreaterThan(0.1)
    expect(b.x1).toBeLessThan(0.9)
    expect(b.y0).toBeGreaterThan(0.13)
    expect(b.y1).toBeLessThan(0.87)
  })
})

/** Boîte écran (fractions) d'un point muni de demi-étendues [côtés, haut, bas] le long des axes de la caméra. */
function boxOnScreen(r: Rig, p: number[], e: number[]) {
  const o = { x: 0, y: 0, z: 0 }
  const up = [0, Math.sin(r.pitch), Math.cos(r.pitch)]
  const res = { x0: 9, x1: -9, y0: 9, y1: -9 }
  const pts = [
    [p[0]! - e[0]!, p[1]!, p[2]!],
    [p[0]! + e[0]!, p[1]!, p[2]!],
    [p[0]!, p[1]! + up[1]! * e[1]!, p[2]! + up[2]! * e[1]!],
    [p[0]!, p[1]! - up[1]! * e[2]!, p[2]! - up[2]! * e[2]!],
  ]
  for (const q of pts) {
    projectRig(r, aspect, q[0]!, q[1]!, q[2]!, o)
    res.x0 = Math.min(res.x0, o.x)
    res.x1 = Math.max(res.x1, o.x)
    res.y0 = Math.min(res.y0, o.y)
    res.y1 = Math.max(res.y1, o.y)
  }
  return res
}

describe('fitSets (sujet + contraintes dures)', () => {
  const soft: ScreenRect = { x0: 0.12, x1: 0.88, y0: 0.15, y1: 0.85 }
  const hard: ScreenRect = { x0: 0.06, x1: 0.94, y0: 0.21, y1: 0.87 }
  let seed = 7
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647)
  for (let c = 0; c < 12; c++)
    it(`configuration aléatoire ${c} : boîtes dans le rectangle utile, sujet dans le sien`, () => {
      const n = 2 + Math.floor(rnd() * 8)
      const S = new Float64Array(n * 3)
      const Hp = new Float64Array(n * 3)
      const He = new Float64Array(n * 3)
      for (let i = 0; i < n; i++) {
        const x = (rnd() - 0.5) * 300
        const y = (rnd() - 0.5) * 200
        const z = 4 + rnd() * 14
        // ombre décalée vers l'est (soleil bas), oiseau tiré vers elle
        const sx = x + rnd() * 90
        S.set([sx, y, 0], i * 3)
        Hp.set([x, y, z], i * 3)
        He.set([7, i === 0 ? 9 : 7, 10], i * 3)
      }
      const sets: FitSet[] = [
        { pts: S, count: n, rect: soft },
        { pts: Hp, count: n, rect: hard, ext: He },
      ]
      const pitch = (42 + rnd() * 16) * DEG
      const out = makeSetsFit()
      fitSets(sets, 0, pitch, 40, aspect, 60, 1e5, out)
      const r: Rig = { tx: out.tx, ty: out.ty, tz: 0, yaw: 0, pitch, dist: out.dist, fov: 40 }
      for (let i = 0; i < n; i++) {
        const b = boxOnScreen(r, [Hp[i * 3]!, Hp[i * 3 + 1]!, Hp[i * 3 + 2]!], [He[i * 3]!, He[i * 3 + 1]!, He[i * 3 + 2]!])
        expect(b.x0).toBeGreaterThan(hard.x0 - 1e-6)
        expect(b.x1).toBeLessThan(hard.x1 + 1e-6)
        expect(b.y0).toBeGreaterThan(hard.y0 - 1e-6)
        expect(b.y1).toBeLessThan(hard.y1 + 1e-6)
        const o = { x: 0, y: 0, z: 0 }
        projectRig(r, aspect, S[i * 3]!, S[i * 3 + 1]!, 0, o)
        expect(o.x).toBeGreaterThan(soft.x0 - 1e-6)
        expect(o.x).toBeLessThan(soft.x1 + 1e-6)
      }
      // le glissement annoncé vers la droite est admissible
      const r2 = { ...r, tx: r.tx + out.slackRight * 0.999 }
      for (let i = 0; i < n; i++) {
        const b = boxOnScreen(r2, [Hp[i * 3]!, Hp[i * 3 + 1]!, Hp[i * 3 + 2]!], [He[i * 3]!, He[i * 3 + 1]!, He[i * 3 + 2]!])
        expect(b.x0).toBeGreaterThan(hard.x0 - 1e-6)
      }
      // clampRigToSets : un rig trop serré et décalé est ramené dans les rectangles
      const r3: Rig = { ...r, dist: r.dist * 0.6, tx: r.tx + 40 }
      expect(clampRigToSets(r3, [sets[1]!], aspect)).toBe(true)
      for (let i = 0; i < n; i++) {
        const b = boxOnScreen(r3, [Hp[i * 3]!, Hp[i * 3 + 1]!, Hp[i * 3 + 2]!], [He[i * 3]!, He[i * 3 + 1]!, He[i * 3 + 2]!])
        expect(b.x0).toBeGreaterThan(hard.x0 - 1e-6)
        expect(b.x1).toBeLessThan(hard.x1 + 1e-6)
        expect(b.y0).toBeGreaterThan(hard.y0 - 1e-6)
        expect(b.y1).toBeLessThan(hard.y1 + 1e-6)
      }
      // un rig déjà admissible n'est pas modifié
      const r4 = { ...r }
      expect(clampRigToSets(r4, [sets[1]!], aspect)).toBe(false)
      expect(r4.tx).toBe(r.tx)
    })

  it('un seul ensemble : identique à fitPoints ; alignY pose le sujet contre le bas', () => {
    const E = new Float64Array(ellipse.length * 3)
    ellipse.forEach((p, i) => E.set(p, i * 3))
    const rect = { x0: 0.06, x1: 0.94, y0: 0.21, y1: 0.955 }
    const a = { tx: 0, ty: 0, dist: 0, width: 0 }
    fitPoints(E, ellipse.length, 0, 40 * DEG, 40, aspect, rect, 20, 4000, a)
    const b = makeSetsFit()
    fitSets([{ pts: E, count: ellipse.length, rect }], 0, 40 * DEG, 40, aspect, 20, 4000, b)
    expect(b.tx).toBeCloseTo(a.tx, 6)
    expect(b.ty).toBeCloseTo(a.ty, 6)
    expect(b.dist).toBeCloseTo(a.dist, 6)
    fitSets([{ pts: E, count: ellipse.length, rect, alignY: 1 }], 0, 40 * DEG, 40, aspect, 20, 4000, b)
    const s = screenBoundsOf({ tx: b.tx, ty: b.ty, tz: 0, yaw: 0, pitch: 40 * DEG, dist: b.dist, fov: 40 }, ellipse)
    expect(s.y1).toBeCloseTo(rect.y1, 3)
  })
})

function screenBoundsOf(r: Rig, pts: number[][]) {
  const o = { x: 0, y: 0, z: 0 }
  let y1 = -9
  for (const p of pts) {
    projectRig(r, aspect, p[0]!, p[1]!, p[2]!, o)
    y1 = Math.max(y1, o.y)
  }
  return { y1 }
}
