// Registre des points d'ancrage des oiseaux, écrit par <Birds /> à chaque frame
// (après l'animation) et lu par <Fx /> : bout de queue (traînée), bouts d'ailes
// (filets d'air), tête (étoiles du décrochage), haut du cavalier (couronne,
// chevrons)… Coordonnées three (monde). Si <Birds /> n'est pas monté, les FX
// retombent sur la position de la simulation.
import { MAX_PLAYERS } from '../../../shared/players.ts'
import { Emitter } from '../../bus.ts'

/** Événements de l'animation (pour l'audio : sons d'ailes calés sur l'image). */
export interface WingbeatEvent {
  type: 'wingbeat'
  slot: number
  /** Amplitude du battement (0,12 → 1 ; 1,2 pour le coup d'aile). */
  amp: number
  /** Coup d'aile (bouton) plutôt que battement de croisière. */
  power: boolean
  /** Position monde (three) de l'oiseau. */
  x: number
  y: number
  z: number
}

/** Émis par <Birds /> à chaque battement d'aile visible (l'aile passe l'horizontale en descendant). */
export const birdAnimEvents = new Emitter<WingbeatEvent>()
import { ANCHOR_NAMES, type AnchorName } from './skeleton.ts'

const STRIDE = ANCHOR_NAMES.length * 3

export const birdAnchors = {
  /** [slot][ancre][xyz] aplati. */
  data: new Float32Array(MAX_PLAYERS * STRIDE),
  /** Frame (compteur de rendu) de la dernière écriture, par slot ; -1 = jamais. */
  frame: new Int32Array(MAX_PLAYERS).fill(-1),
  /** Taille de l'oiseau à l'écran (px d'envergure), par slot. */
  spanPx: new Float32Array(MAX_PLAYERS),
  /** Échelle cosmétique appliquée, par slot. */
  scale: new Float32Array(MAX_PLAYERS).fill(1),
  /** Compteur de frames de <Birds />. */
  counter: 0,
}

export const anchorOffset = (slot: number, name: AnchorName): number => slot * STRIDE + ANCHOR_NAMES.indexOf(name) * 3

/**
 * Hauteur (m, avant échelle) de la couronne au-dessus du cavalier, le long du
 * « haut » de l'écran : 3,5 m caméra à l'horizontale (ART_BIBLE : 3 m au-dessus
 * du cavalier), jusqu'à 5,7 m en plongée, pour dégager le bec de l'oiseau quand
 * il vole vers le haut de l'écran. `downness` = |composante verticale de la visée|.
 */
export const crownLift = (downness: number): number => 3.5 + 2.2 * Math.min(1, Math.abs(downness))

/** Hauteur (m, avant échelle) de la pile d'icônes (chevron, « ! »…) : au-dessus de la couronne s'il y en a une. */
export const iconLift = (downness: number, crowned: boolean): number => (crowned ? crownLift(downness) + 2.8 : 2.4 + 1.8 * Math.min(1, Math.abs(downness)))

export const ANCHOR_STRIDE = STRIDE
