// Conversion d'une entrée de téléphone en BirdInput (la seule entrée que la simulation connaisse).
// Pur : utilisé par phoneHub, testable sans réseau.
import type { BirdInput } from '../sim/types.ts'
import { RULES, DEG } from '../sim/rules.ts'
import type { ControlScheme } from '../shared/messages.ts'

/**
 * Mode Relatif (« volant ») : l'axe X donne un écart de cap par rapport au cap courant,
 * de RELATIVE_MIN_DEG juste après la zone morte à RELATIVE_MAX_DEG en butée.
 * L'oiseau tourne à sa vitesse de lacet maximale tant que l'écart n'est pas rattrapé :
 * on recalcule le cap visé à chaque tick, donc pousser le stick = tourner en continu.
 * TODO(rules) : à déplacer dans RULES (demande notée dans docs/agent-notes/REQUESTS.md).
 */
export const RELATIVE_MIN_DEG = 25
export const RELATIVE_MAX_DEG = 90

export interface PhoneControlState {
  /** Vecteur de pilotage (repère écran du téléphone, y > 0 = haut), disque unité. */
  x: number
  y: number
  /** PLONGER maintenu. */
  dive: boolean
  /** Compteurs monotones tenus par le hub (jamais remis à zéro pendant une partie). */
  divePresses: number
  flapPresses: number
  scheme: ControlScheme
}

/** Borne un vecteur au disque unité. */
export function clampStick(x: number, y: number): [number, number] {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return [0, 0]
  const m = Math.hypot(x, y)
  return m > 1 ? [x / m, y / m] : [x, y]
}

/**
 * Entrée de simulation pour un oiseau piloté par téléphone.
 * @param heading cap courant de l'oiseau (rad), utilisé par le mode Relatif.
 */
export function toBirdInput(s: PhoneControlState, heading: number, out: BirdInput = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }): BirdInput {
  out.dive = s.dive
  out.divePresses = s.divePresses
  out.flapPresses = s.flapPresses
  if (s.scheme === 'relative') {
    const ax = Math.abs(s.x)
    const dz = RULES.stickDeadzone
    if (ax < dz || !Number.isFinite(heading)) {
      out.dirX = 0
      out.dirY = 0
    } else {
      const k = Math.min(1, (ax - dz) / (1 - dz))
      // x > 0 : virage à droite = sens horaire = cap décroissant (cap trigonométrique).
      const offset = -Math.sign(s.x) * (RELATIVE_MIN_DEG + (RELATIVE_MAX_DEG - RELATIVE_MIN_DEG) * k) * DEG
      out.dirX = Math.cos(heading + offset)
      out.dirY = Math.sin(heading + offset)
    }
    return out
  }
  // Absolu et inclinaison : le vecteur est déjà un cap à l'écran (haut = nord).
  const [x, y] = clampStick(s.x, s.y)
  out.dirX = x
  out.dirY = y
  return out
}
