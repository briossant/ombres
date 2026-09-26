// Couche d'entrée unique (ARCHITECTURE §1, BRIEF « une couche d'input unique ») :
// quelle que soit la source (téléphone, clavier, manette, bot), chaque oiseau reçoit un
// BirdInput par tick. La simulation ne sait pas qui pilote.
import type { BirdInput } from '../sim/types.ts'

/** Groupe local (clavier + manette) : 1 = ZQSD/WASD (+ manette 1), 2 = IJKL / pavé num. (+ manette 2). */
export type LocalGroup = 1 | 2

export const LOCAL_GROUPS: readonly LocalGroup[] = [1, 2]

/** Entrée neuve (réutilisable). */
export function newInput(): BirdInput {
  return { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
}

/** Copie sans allocation. */
export function copyInput(out: BirdInput, src: Readonly<BirdInput>): BirdInput {
  out.dirX = src.dirX
  out.dirY = src.dirY
  out.dive = src.dive
  out.divePresses = src.divePresses
  out.flapPresses = src.flapPresses
  return out
}

/** Une source locale lue au tick : direction (repère monde, haut de l'écran = nord), boutons, compteurs. */
export interface LocalState {
  dirX: number
  dirY: number
  dive: boolean
  divePresses: number
  flapPresses: number
}
