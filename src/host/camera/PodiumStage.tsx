// <PodiumStage/> : au podium (cameraCue.mode === 'podium'), construit la scène synthétique du
// podium depuis le dernier état de manche et REMPLACE à chaque frame gameView.sim / prevBirds /
// alpha par cette scène (priorité −3 : après le runner, avant la caméra et les oiseaux).
// Remplit `stageModes` ('perch' pour les trois premiers) à passer à <Birds modes={stageModes}/>.
import { useFrame } from '@react-three/fiber'
import type { SimState } from '../../sim/types.ts'
import { gameView as defaultView, type GameView } from '../view.ts'
import { cameraCue } from './cue.ts'
import { podiumShared } from './director.ts'
import { animatePodium, buildPodiumView, type PodiumView } from './podium.ts'

/** Modes d'animation des oiseaux par slot, pour <Birds modes={stageModes}/> (mutable). */
export const stageModes: ('fly' | 'perch' | undefined)[] = new Array(12).fill(undefined)

export interface PodiumStageProps {
  view?: GameView
  priority?: number
}

let current: PodiumView | null = null
let builtVersion = -1
let builtAspect = 0
let source: SimState | null = null
let t0 = 0

/** Scène du podium en cours (null hors podium). */
export function currentPodium(): PodiumView | null {
  return current
}

export function PodiumStage({ view = defaultView, priority = -3 }: PodiumStageProps) {
  useFrame((state, delta) => {
    if (cameraCue.mode !== 'podium') {
      if (current) {
        // sortie du podium : on rend la main à la sim du runner
        if (view.sim === current.sim && source) view.sim = source
        current = null
        podiumShared.layout = null
        stageModes.fill(undefined)
      }
      return
    }
    const aspect = state.size.width / Math.max(1, state.size.height)
    if (view.sim && (!current || view.sim !== current.sim)) source = view.sim
    if (!source) return
    if (!current || builtVersion !== cameraCue.version || Math.abs(builtAspect - aspect) > 0.01) {
      const ranking = cameraCue.podium.length ? cameraCue.podium : source.birds.slice(0, 3).map((b) => b.slot)
      current = buildPodiumView(source, ranking, aspect, source.birds.length > 6)
      builtVersion = cameraCue.version
      builtAspect = aspect
      t0 = 0
      podiumShared.layout = current.layout
      podiumShared.version++
      for (let i = 0; i < 12; i++) stageModes[i] = current.modes[i]
    }
    t0 += Math.min(delta, 0.1)
    animatePodium(current, t0)
    view.sim = current.sim
    view.prevBirds = current.prevBirds
    view.alpha = 1
  }, priority)
  return null
}
