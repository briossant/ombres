// <Birds /> : tous les oiseaux de la partie, animés procéduralement depuis
// gameView (état interpolé entre deux ticks). À placer dans la scène R3F de
// l'agent world ; ne déclenche aucun re-render React pendant le jeu.
import { useFrame, useThree } from '@react-three/fiber'
import { useEffect, useMemo } from 'react'
import { gameView as defaultView, type GameView } from '../../view.ts'
import type { BirdMode } from './animator.ts'
import { BirdsController } from './controller.ts'
import type { BirdDetail } from './geometry.ts'

export type BirdsQuality = 'low' | 'medium' | 'high' | 'ultra'

export interface BirdsProps {
  /** Preset de qualité (résolution des maillages, hachures). Défaut : 'high'. */
  quality?: BirdsQuality
  /** Vue de jeu à lire (défaut : gameView global). */
  view?: GameView
  /** Échelle cosmétique : 'auto' (défaut) = ≥ 60 px d'envergure, ≤ ×1,3 (×1,6 au-delà de 8 oiseaux) ; ou un facteur fixe. */
  renderScale?: number | 'auto'
  /** Mode de mise en scène par slot (ex. podium : 'perch'). */
  modes?: ReadonlyArray<BirdMode | undefined>
  /** Ombre « âme » dans la height shadow map (défaut : true). */
  castShadows?: boolean
  /** Priorité useFrame (défaut −1 : avant le rendu et avant les FX). */
  priority?: number
  /** Reçoit le contrôleur (mise en scène avancée, tests). */
  onController?: (c: BirdsController) => void
}

const DETAIL: Record<BirdsQuality, BirdDetail> = { low: 'low', medium: 'medium', high: 'high', ultra: 'high' } // maillage des gros plans ; « far » au loin

export function Birds({
  quality = 'high',
  view = defaultView,
  renderScale = 'auto',
  modes,
  castShadows = true,
  priority = -1,
  onController,
}: BirdsProps) {
  const controller = useMemo(
    () => new BirdsController({ detail: DETAIL[quality], renderScale, castShadows }),
    // renderScale n'impose pas de reconstruction : mis à jour ci-dessous.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [quality, castShadows],
  )
  controller.options.renderScale = renderScale
  useEffect(() => () => controller.dispose(), [controller])
  useEffect(() => {
    onController?.(controller)
  }, [controller, onController])
  const size = useThree(s => s.size)
  const dpr = useThree(s => s.viewport.dpr)
  useFrame((state, delta) => {
    if (modes) for (let i = 0; i < controller.modes.length; i++) controller.modes[i] = modes[i]
    controller.update(view, state.camera, delta, size.height * dpr)
  }, priority)

  return <primitive object={controller.root} dispose={null} />
}
