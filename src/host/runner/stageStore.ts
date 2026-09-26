// État de mise en scène lu par les composants R3F de l'App (bas débit : change aux écrans).
import { create } from 'zustand'

export interface StageState {
  /** Gloire de victoire (FX) derrière ce slot : podium ; −1 = aucune. */
  glorySlot: number
}

export const useStage = create<StageState>(() => ({ glorySlot: -1 }))
