// <GameCamera/> : pilote la caméra PAR DÉFAUT du Canvas (celle de <WorldCanvas>) à partir du
// réalisateur (director.ts), qui lit cameraCue (écrit par le runner) et gameView.
// useFrame de priorité −2 : après le runner (qui écrit gameView, priorité < −3) et
// <PodiumStage/> (−3), avant <HudProjector/> (−1,5), les oiseaux (−1) et les FX (0).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import type * as THREE from 'three'
import { gameView as defaultView, type GameView } from '../view.ts'
import { cameraState } from './cue.ts'
import { CameraDirector } from './director.ts'
import { groundFrame } from './math.ts'

export interface GameCameraProps {
  /** Accepté pour compatibilité (la caméra du Canvas est déjà celle par défaut). */
  makeDefault?: boolean
  /** Vue lue (défaut : gameView). */
  view?: GameView
  /** Priorité useFrame (défaut −2). */
  priority?: number
  /** Reçoit le réalisateur (pages de dev, scripts de capture). */
  onDirector?: (d: CameraDirector) => void
}

export function GameCamera({ view = defaultView, priority = -2, onDirector }: GameCameraProps) {
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const director = useMemo(() => new CameraDirector(), [])
  useEffect(() => () => director.dispose(), [director])
  useEffect(() => {
    onDirector?.(director)
  }, [director, onDirector])
  useFrame((state, delta) => {
    const size = state.size
    const aspect = size.width / Math.max(1, size.height)
    const pose = director.update(delta, view, aspect)
    camera.position.copy(pose.pos)
    camera.quaternion.copy(pose.quat)
    if (camera.fov !== pose.fov || camera.aspect !== aspect || camera.near !== 1 || camera.far !== 9000) {
      camera.fov = pose.fov
      camera.aspect = aspect
      camera.near = 1
      camera.far = 9000
      camera.updateProjectionMatrix()
    }
    camera.updateMatrixWorld()
    groundFrame(camera, cameraState.frame)
  }, priority)
  return null
}
