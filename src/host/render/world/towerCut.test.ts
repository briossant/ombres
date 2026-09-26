// Coupe des tours à chapeau (polish vague 3, towerMaterial.ts DISC_WHOLE) : un disque n'est jamais
// tranché par le cercle de dégagement d'un oiseau ; la tour disparaît en entier au-dessus d'une coupe.
import * as THREE from 'three'
import { describe, expect, it } from 'vitest'
import { RULES } from '../../../sim/rules.ts'
import { createSimulation } from '../../../sim/simulation.ts'
import { hatCutBase, towerHats } from '../../camera/towerCover.ts'
import { BIRD_CLEAR_R } from './birdScreen.ts'
import { towerCut, type HatView } from './towerMaterial.ts'

describe('towerCut (chapeaux effacés en entier)', () => {
  const sim = createSimulation({ mode: 'round', seed: 1, mapId: 'parasols', birds: [{ slot: 0, assist: false }], sunSeconds: RULES.roundSunSeconds, countdown: true })
  const ti = sim.state.towers.findIndex((t) => t.archetype === 'parasol' && t.height > 40)
  const t = sim.state.towers[ti]!
  const hats = towerHats(sim.state.towers)[ti]!
  const W = 1920
  const H = 1080
  // caméra de manche type : 110 m au sud, 110 m de haut, qui regarde le pied de la tour
  const cam = new THREE.PerspectiveCamera(40, W / H, 1, 5000)
  cam.position.set(t.x, 110, -(t.y - 110))
  cam.lookAt(t.x, 10, -(t.y + 20))
  cam.updateMatrixWorld(true)
  const vp = new THREE.Matrix4().multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
  const v = new THREE.Vector3()
  const view: HatView = {
    pos: { x: cam.position.x, y: cam.position.y, z: cam.position.z },
    project: (x, y, z, o) => {
      v.set(x, y, z).applyMatrix4(vp)
      o.x = v.x
      o.y = v.y
      o.z = v.z
    },
    w: W,
    h: H,
    k: H / (2 * Math.tan((20 * Math.PI) / 180)),
  }
  /** Oiseau à l'écran comme NPR.uBirdScr (birdScreen.ts) : px origine en bas, rayon de dégagement, distance. */
  const bird = (x: number, y: number, z: number) => {
    v.set(x, z, -y).applyMatrix4(vp)
    const d = Math.hypot(x - cam.position.x, z - cam.position.y, -y - cam.position.z)
    return { x: ((v.x + 1) / 2) * W, y: ((v.y + 1) / 2) * H, z: Math.max(12, (BIRD_CLEAR_R * view.k) / d), w: d }
  }
  const out = { z: 0, amount: 0 }

  it("un oiseau caché par le chapeau (vu de la caméra) : effacé en entier, coupe sous le chapeau", () => {
    towerCut(t, hats, view, [bird(t.x + 3, t.y + 25, 15)], 1, out)
    expect(out.amount).toBe(1)
    expect(out.z).toBeLessThanOrEqual(hatCutBase(hats[0]!))
    expect(out.z).toBeGreaterThanOrEqual(3)
  })

  it('oiseau loin sur le côté, ou devant la tour : aucune coupe', () => {
    towerCut(t, hats, view, [bird(t.x + 150, t.y, 15)], 1, out)
    expect(out.amount).toBe(0)
    towerCut(t, hats, view, [bird(t.x, t.y - 60, 60)], 1, out)
    expect(out.amount).toBe(0)
  })

  it('caméra à moins de la distance de proximité du chapeau : effacé au-dessus de son bas', () => {
    const near: HatView = { ...view, pos: { x: t.x, y: hats[0]!.z1 + 20, z: -(t.y - 25) } }
    towerCut(t, hats, near, [], 0, out, 55, 65)
    expect(out.amount).toBe(1)
    expect(out.z).toBe(hatCutBase(hats[0]!))
  })
})
