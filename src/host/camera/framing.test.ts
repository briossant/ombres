import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { rigPose } from './cine.ts'
import { fitPoints, type ScreenRect } from './framing.ts'
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
