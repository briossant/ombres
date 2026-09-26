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
  /** Couronne affichée : slot porteur (−1 = aucune), centre et haut (three, monde), frame d'écriture. */
  crown: { slot: -1, frame: -1, cx: 0, cy: 0, cz: 0, tx: 0, ty: 0, tz: 0 },
}

export const anchorOffset = (slot: number, name: AnchorName): number => slot * STRIDE + ANCHOR_NAMES.indexOf(name) * 3

/**
 * Hauteur (m) de la base de la couronne au-dessus du cavalier, le long du « haut »
 * de l'écran (ART_BIBLE §6.7 : ≈ 3 m) : 2,5 m caméra à l'horizontale, 3,5 m en
 * plongée. `downness` = |composante verticale de la visée|. Jamais multipliée par
 * l'échelle cosmétique au-delà de 1 (polish B4 : la couronne flottait 80 à 340 px
 * au-dessus du meneur).
 */
export const crownLift = (downness: number): number => 2.5 + 1.0 * Math.min(1, Math.abs(downness))

/**
 * Podium (mode perch) : la couronne est posée juste au-dessus de la tête de l'oiseau.
 * Hauteur (m, × échelle de l'oiseau, 1 au podium) du HAUT de la couronne au-dessus de
 * l'ancre `head` : la mise en scène doit garder cette hauteur libre sous le bandeau.
 */
export const PERCH_CROWN_TOP_M = 1.1
/** Podium : écart (m) entre l'ancre `head` et la base de la couronne. */
export const PERCH_CROWN_LIFT_M = 0.32

/** Hauteur (m, avant échelle) de la pile d'icônes (chevron, « ! »…) sans couronne ; avec couronne, la pile part du haut de la couronne (`birdAnchors.crown`). */
export const iconLift = (downness: number, crowned: boolean): number => (crowned ? crownLift(downness) + 1.6 : 2.4 + 1.8 * Math.min(1, Math.abs(downness)))

export const ANCHOR_STRIDE = STRIDE
