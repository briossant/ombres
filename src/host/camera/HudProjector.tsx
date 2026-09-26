// <HudProjector/> : à chaque frame, projette chaque oiseau en px CSS du viewport pour le HUD
// (hudAnchors.birds[slot] : étiquettes, jetons, bulles, flèches hors champ) et donne à l'audio
// le cadre visible au sol (setAudioListener). Priorité −1,5 : après <GameCamera/> (−2).
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { RULES } from '../../sim/rules.ts'
import { setAudioListener } from '../audio/index.ts'
import { birdAnchors } from '../render/bird/anchors.ts'
import { hudAnchors } from '../ui/viewModel.ts'
import { gameView as defaultView, type GameView } from '../view.ts'
import { cameraState } from './cue.ts'

export interface HudProjectorProps {
  view?: GameView
  /** Donne le cadre visible à l'audio (défaut : vrai). */
  audio?: boolean
  priority?: number
}

const _p = new THREE.Vector3()
const _c = new THREE.Vector3()
const MAX = 12

/** Écrit hudAnchors pour la caméra et la vue données (utilisable hors React). */
export function projectHudAnchors(camera: THREE.PerspectiveCamera, view: GameView, width: number, height: number, left = 0, top = 0): void {
  const sim = view.sim
  const birds = hudAnchors.birds
  if (!sim) {
    for (let i = 0; i < MAX; i++) birds[i]!.active = false
    return
  }
  const alpha = view.alpha
  camera.getWorldPosition(_c)
  const tanV = Math.tan((camera.fov * Math.PI) / 360)
  for (let slot = 0; slot < MAX; slot++) {
    const a = birds[slot]!
    const b = sim.bySlot[slot]
    if (!b) {
      a.active = false
      continue
    }
    const p = view.prevBirds[slot] ?? b
    const x = p.x + (b.x - p.x) * alpha
    const y = p.y + (b.y - p.y) * alpha
    const z = p.z + (b.z - p.z) * alpha
    _p.set(x, z, -y)
    // demi-hauteur apparente de l'oiseau (envergure × échelle cosmétique) : l'étiquette passe dessous
    const dist = Math.max(1, _p.distanceTo(_c))
    const halfPx = ((RULES.wingspan * (birdAnchors.scale[slot] || 1)) / dist / tanV) * (height / 2) * 0.24
    _p.project(camera)
    const behind = _p.z > 1
    let sx = ((_p.x + 1) / 2) * width
    let sy = ((1 - _p.y) / 2) * height
    if (behind) {
      sx = width - sx
      sy = height - sy
    }
    a.active = true
    a.x = left + sx
    a.y = top + sy + (behind ? 0 : Math.min(halfPx, height * 0.08))
    a.behind = behind
    a.hidden = b.hidden || b.inNight
  }
}

export function HudProjector({ view = defaultView, audio = true, priority = -1.5 }: HudProjectorProps) {
  useFrame((state) => {
    const size = state.size
    projectHudAnchors(state.camera as THREE.PerspectiveCamera, view, size.width, size.height, size.left, size.top)
    if (audio) {
      const f = cameraState.frame
      setAudioListener({ x: f.x, y: f.y, halfWidth: f.halfWidth, halfHeight: f.halfHeight })
    }
  }, priority)
  return null
}
