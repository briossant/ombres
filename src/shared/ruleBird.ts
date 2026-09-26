// Pictogramme de l'oiseau des cartes de règles (TV et téléphone) : le ptérosaure
// du jeu vu de dessus (ART_BIBLE §6.7), module PUR (aucune dépendance).
//
// Repère : viewBox 0 0 100 100, centre (50, 50), tête vers +x (droite).
// - ailes longues et étroites « en M tendu » : le bord d'attaque avance jusqu'au
//   poignet puis file en arrière vers une pointe effilée ; bord de fuite creusé
//   jusqu'aux hanches (membrane de ptérosaure) ;
// - long cou, tête au bec droit avec une courte crête arrière ;
// - queue en éventail étroit ;
// - bande d'aile à la couleur du joueur, entre 55 et 70 % de la demi-envergure
//   (§6.7 « identifiant principal ») ; pastille de selle (cavalier) sur le dos.
//
// Usage : dessiner dans l'ordre les formes de `ruleBirdShapes(folded)` ; l'aile du
// bas est l'aile du haut en miroir (`RULE_BIRD_MIRROR`). La bande se découpe par
// l'aile (`clipPath` avec `RULE_BIRD.wing`).

/** Tracés de l'oiseau (coordonnées du viewBox 0 0 100 100). */
export const RULE_BIRD = {
  viewBox: '0 0 100 100',
  /** Aile haute ouverte (y < 50) : épaule → poignet avancé → pointe → bord de fuite creusé → hanche. */
  wing: 'M49 46L56.5 31.5L61 22L54 11.5L45.5 2.5L47 13Q45.5 29 40 45.5Z',
  /** Aile haute repliée (piqué) : plaquée le long du corps, pointe vers l'arrière. */
  wingFolded: 'M52 46.5L57 42L44 37.5L28 38.5L40 44Q43 46 45 47Z',
  /** Bande d'aile : entre 55 et 70 % de la demi-envergure (y de 17,6 à 24,4), découpée par l'aile. */
  band: 'M30 17.6H70V24.4H30Z',
  /** Corps, cou, tête (bec droit, crête courte) et queue en éventail : un seul contour. */
  body:
    'M30.5 47.5L21 43Q17.5 50 21 57L30.5 52.5Q38 55.5 47 55Q55 54.5 58.5 52L66 51.2L69 52.4Q73 52.8 76.5 51.4L90 50.3V49.7L76.5 48.6Q73 47.2 69 47.6L63 45.2L66 48.8L58.5 48Q55 45.5 47 45Q38 44.5 30.5 47.5Z',
  /** Pastille de selle (couleur du joueur) sur le dos. */
  saddle: { cx: 49, cy: 50, r: 3.4 },
  /** Œil (point d'encre). */
  eye: { cx: 72.5, cy: 49.2, r: 0.9 },
} as const

/** Transformation qui donne l'aile du bas à partir de l'aile du haut (miroir autour de y = 50). */
export const RULE_BIRD_MIRROR = 'matrix(1 0 0 -1 0 100)'

export type RuleBirdRole = 'wing' | 'band' | 'body' | 'saddle' | 'eye'

export interface RuleBirdShape {
  role: RuleBirdRole
  /** Tracé SVG (`d`) ; les disques (selle, œil) sont des cercles `cx cy r`. */
  d?: string
  circle?: { cx: number; cy: number; r: number }
  /** Aile ou bande du bas : miroir de celle du haut. */
  mirror?: boolean
}

/**
 * Formes à dessiner, de l'arrière vers l'avant : ailes (fond os + trait), bandes
 * (couleur du joueur, à découper par l'aile), corps, selle, œil. Ailes repliées :
 * pas de bande visible (elle est sous l'aile).
 */
export function ruleBirdShapes(folded = false): RuleBirdShape[] {
  const wing = folded ? RULE_BIRD.wingFolded : RULE_BIRD.wing
  const out: RuleBirdShape[] = [
    { role: 'wing', d: wing },
    { role: 'wing', d: wing, mirror: true },
  ]
  if (!folded) out.push({ role: 'band', d: RULE_BIRD.band }, { role: 'band', d: RULE_BIRD.band, mirror: true })
  out.push({ role: 'body', d: RULE_BIRD.body }, { role: 'saddle', circle: RULE_BIRD.saddle }, { role: 'eye', circle: RULE_BIRD.eye })
  return out
}
