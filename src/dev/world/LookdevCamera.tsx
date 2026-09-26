// Caméras de lookdev (la caméra de jeu est faite en phase 3) : cadrage de jeu
// (tangage 58° → 42° selon l'avancée du soleil, nord en haut, arène entière),
// plans bas de mise en scène, vue verticale des résultats, orbite.
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { gameView } from '../../host/view.ts'
import { RULES } from '../../sim/rules.ts'

export type CamMode = 'game' | 'low' | 'lowe' | 'top' | 'orbit' | 'close'

const DEG = Math.PI / 180

export interface LookdevCameraProps {
  mode: CamMode
  /** Surcharges (m) : cible et distance du cadrage de jeu. */
  target?: [number, number]
  dist?: number
  pitchDeg?: number
}

export function LookdevCamera({ mode, target, dist, pitchDeg }: LookdevCameraProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  useFrame((state) => {
    const sim = gameView.sim
    const a = sim?.arena.a ?? 165
    const b = sim?.arena.b ?? 114
    const u = sim?.sun.u ?? 0
    const aspect = size.width / Math.max(1, size.height)
    camera.fov = 40
    camera.aspect = aspect
    camera.near = 1
    camera.far = 9000
    const tanH = Math.tan(20 * DEG) * aspect
    if (mode === 'top') camera.up.set(0, 0, -1)
    else camera.up.set(0, 1, 0)
    if (mode === 'game') {
      const p = (pitchDeg ?? RULES.camPitchStartDeg + (RULES.camPitchEndDeg - RULES.camPitchStartDeg) * u) * DEG
      const D = dist ?? (a * 1.1) / tanH
      const tx = target?.[0] ?? 0
      const tz = -(target?.[1] ?? -b * 0.06)
      camera.position.set(tx, Math.sin(p) * D, tz + Math.cos(p) * D)
      camera.lookAt(tx, 0, tz)
    } else if (mode === 'low') {
      // contre-plongée vers le couchant (ouest) : horizon dans le tiers bas, Falaise et soleil
      camera.position.set(a * 0.55, 16, -b * 0.15)
      camera.lookAt(-1700, 95, -260)
    } else if (mode === 'lowe') {
      // plan bas, soleil dans le dos : longues ombres et territoire qui s'allume vers l'est
      camera.position.set(-a * 0.75, 30, b * 0.7)
      camera.lookAt(a * 0.4, 0, -b * 0.25)
    } else if (mode === 'close') {
      camera.position.set(-20, 70, 95)
      camera.lookAt(0, 8, 0)
    } else if (mode === 'top') {
      const H = Math.max((b * 1.18) / Math.tan(20 * DEG), (a * 1.12) / tanH)
      camera.position.set(0, H, 0.001)
      camera.lookAt(0, 0, 0)
    } else {
      const t = state.clock.elapsedTime * 0.08
      camera.position.set(Math.cos(t) * 320, 120, Math.sin(t) * 320)
      camera.lookAt(0, 10, 0)
    }
    camera.updateProjectionMatrix()
  })
  return null
}
