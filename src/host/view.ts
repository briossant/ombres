// Vue de jeu partagée entre le runner (qui l'écrit à chaque frame) et le rendu
// R3F (qui la lit dans useFrame, sans re-render React). Les pages de lookdev la
// remplissent avec des données factices.
import type { BirdState, SimState } from '../sim/types.ts'

export type PlayerKind = 'phone' | 'keyboard' | 'bot'

export interface PlayerVisual {
  slot: number
  /** Index dans PLAYER_COLORS (src/shared/players.ts). */
  colorIndex: number
  name: string
  kind: PlayerKind
  assist: boolean
}

export interface GameView {
  /** État courant de la simulation (null avant la première). */
  sim: SimState | null
  /** États des oiseaux au tick précédent, par slot, pour l'interpolation. */
  prevBirds: (BirdState | undefined)[]
  /** Facteur d'interpolation entre le tick précédent et le courant, dans [0, 1]. */
  alpha: number
  /** Temps réel (s) depuis le lancement : animations cosmétiques. */
  realTime: number
  /** Facteur de temps courant (ralentis), pour les animations cosmétiques. */
  timeScale: number
  /** Joueurs par slot. */
  players: (PlayerVisual | undefined)[]
  /** Mode daltonien actif (motifs, glyphes). */
  colorblind: boolean
}

export const gameView: GameView = {
  sim: null,
  prevBirds: [],
  alpha: 0,
  realTime: 0,
  timeScale: 1,
  players: [],
  colorblind: false,
}

/** Interpolation d'un scalaire entre le tick précédent et le courant. */
export function lerpBird(slot: number, key: 'x' | 'y' | 'z'): number {
  const cur = gameView.sim?.bySlot[slot]
  if (!cur) return 0
  const prev = gameView.prevBirds[slot] ?? cur
  return prev[key] + (cur[key] - prev[key]) * gameView.alpha
}
