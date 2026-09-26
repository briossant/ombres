// <Fx /> : effets « encre » de la partie (traînées, bouffées, piqués, icônes…),
// déclenchés par le bus simEvents et par l'état de gameView. À placer dans la
// scène R3F de l'agent world, APRÈS <Birds /> (il lit les ancres des oiseaux).
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { simEvents as defaultBus } from '../../bus.ts'
import { gameView as defaultView, type GameView } from '../../view.ts'
import type { Emitter } from '../../bus.ts'
import type { SimEvent } from '../../../sim/types.ts'
import { FxSystem, type FxQuality } from './system.ts'

export interface FxProps {
  /** Preset de qualité (plafond de particules 300 / 800 / 1500). Défaut : 'high'. */
  quality?: FxQuality
  view?: GameView
  events?: Emitter<SimEvent>
  /** Gloire de victoire derrière cet oiseau (slot), −1 ou absent = aucune. */
  glorySlot?: number
  /** Priorité useFrame (défaut 0 : après <Birds /> qui est à −1). */
  priority?: number
  /** Reçoit le système (tests, mise en scène). */
  onSystem?: (s: FxSystem) => void
}

export function Fx({ quality = 'high', view = defaultView, events = defaultBus, glorySlot = -1, priority = 0, onSystem }: FxProps) {
  const system = useMemo(() => new FxSystem(quality), [quality])
  useEffect(() => () => system.dispose(), [system])
  useEffect(() => events.on(e => system.push(e)), [events, system])
  useEffect(() => {
    onSystem?.(system)
  }, [system, onSystem])
  system.setGlory(glorySlot)

  const size = useThree(s => s.size)
  const dpr = useThree(s => s.viewport.dpr)
  useFrame((state, delta) => {
    system.update(view, state.camera, delta, size.height * dpr)
  }, priority)

  return <primitive object={system.root} dispose={null} />
}
