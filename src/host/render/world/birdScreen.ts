// Positions écran des oiseaux pour la dissolution en trame (polish W9, W10) : chaque frame,
// depuis gameView (interpolé comme le rendu) et la caméra, sans allocation. Écrit les uniforms
// partagés NPR.uBirdScr / uBirdScrN, lus par les tours et le rideau du Simoun.
import * as THREE from 'three'
import { RULES } from '../../../sim/rules.ts'
import type { GameView } from '../../view.ts'
import { NPR } from '../npr/uniforms.ts'

/** Rayon monde (m) autour d'un oiseau à ne pas masquer : demi-envergure à l'échelle max, + marge. */
export const BIRD_CLEAR_R = 0.5 * RULES.wingspan * RULES.birdRenderScaleMaxCrowded * 1.15
const _p = new THREE.Vector3()

export function updateBirdScreen(view: GameView, camera: THREE.Camera, bufferW: number, bufferH: number): void {
  const out = NPR.uBirdScr.value
  const sim = view.sim
  let n = 0
  if (sim && (camera as THREE.PerspectiveCamera).isPerspectiveCamera) {
    const cam = camera as THREE.PerspectiveCamera
    const k = bufferH / (2 * Math.tan((cam.fov * Math.PI) / 360))
    const a = view.alpha
    for (const b of sim.birds) {
      if (n >= out.length) break
      const p = view.prevBirds[b.slot] ?? b
      _p.set(p.x + (b.x - p.x) * a, p.z + (b.z - p.z) * a, -(p.y + (b.y - p.y) * a))
      const dist = _p.distanceTo(cam.position)
      _p.project(cam)
      if (_p.z > 1 || _p.z < -1) continue
      out[n]!.set((_p.x * 0.5 + 0.5) * bufferW, (_p.y * 0.5 + 0.5) * bufferH, Math.max(12, (BIRD_CLEAR_R * k) / Math.max(dist, 1)), dist)
      n++
    }
  }
  NPR.uBirdScrN.value = n
}
