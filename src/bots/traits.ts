// Caractères des bots (GDD §14.2) : réglages de comportement de l'IA. Ce ne sont pas
// des règles du jeu (celles-ci restent dans RULES) mais la « personnalité » : étage
// préféré, goût du vol, réaction à la menace, erreurs typiques.

import type { BlunderKind, BotPersonality } from './types.ts'

export type ThreatResponse =
  | 'normal' // se cache ou remonte selon le niveau
  | 'flee' // Laboureur : fuit en ligne droite (erreur crédible)
  | 'ignore' // ne lève pas la tête (Pie gourmande, Nomade qui néglige la défense)

export interface Traits {
  /** Multiplicateur de la valeur basse dans le choix haut/bas (1,6 = politique « mixed » du GDD). */
  lowBias: number
  /** Multiplicateurs des valeurs de cellule du GDD (neutre, vol, couronne, renfort, scellage). */
  neutral: number
  steal: number
  crown: number
  upgrade: number
  seal: number
  /** Probabilité de piquer une cible verrouillée qui n'est pas sa proie (tirée par épisode). */
  opportunism: number
  threat: ThreatResponse
  /** Décalage (s, T = 110) du départ vers l'est par rapport au niveau. */
  nightLeaveShift: number
  /** Multiplicateur du coût d'un virage du niveau (Nomade : lignes droites ; Fou : virevolte). */
  turnMul: number
  /** Rayon elliptique au-delà duquel un cap est pénalisé (tempête). */
  stormFrom: number
  /** Coups d'aile gratuits (par seconde, quand il est rechargé). */
  freeFlapRate: number
  /** Erreurs volontaires typiques et leurs poids. */
  blunders: readonly (readonly [BlunderKind, number])[]
  /** Multiplicateur de la fréquence des erreurs du niveau (Fou : deux fois plus). */
  blunderRate: number
  /** Multiplicateur des coups d'aile de sprint du niveau (le Laboureur, placide, sprinte peu). */
  sprintMul: number
}

const BASE: Traits = {
  lowBias: 1.6,
  neutral: 1,
  steal: 1,
  crown: 1,
  upgrade: 1,
  seal: 1,
  opportunism: 0.6,
  threat: 'normal',
  nightLeaveShift: 0,
  turnMul: 1,
  stormFrom: 0.9,
  freeFlapRate: 0,
  blunderRate: 1,
  sprintMul: 1,
  blunders: [
    ['hesitate', 1],
    ['storm', 1],
    ['stayLow', 1],
  ],
}

export const TRAITS: Record<BotPersonality, Traits> = {
  // chasseur : haut, peint pâle entre deux attaques ; oublie de peindre, s'acharne
  falcon: {
    ...BASE,
    lowBias: 0.55,
    opportunism: 0.7,
    blunders: [
      ['wander', 3],
      ['hesitate', 1],
      ['storm', 1],
    ],
  },
  // bâtisseur : bas, sillons près de chez lui, scelle devant les ombres ; ne lève jamais la tête
  ploughman: {
    ...BASE,
    lowBias: 3.2,
    upgrade: 1.4,
    seal: 1.6,
    opportunism: 0.3,
    threat: 'flee',
    turnMul: 1.2,
    blunders: [
      ['stayLow', 1],
      ['hesitate', 2],
      ['wander', 1],
    ],
  },
  // pillarde : bas, file droit sur le sable du meneur ; gourmande, reste bas sous les chasseurs
  magpie: {
    ...BASE,
    lowBias: 2.6,
    steal: 1.35,
    crown: 1.5,
    neutral: 0.8,
    opportunism: 0.45,
    threat: 'ignore',
    // son coup d'aile, elle le garde pour l'entrée du raid (sa signature), pas pour sprinter
    sprintMul: 0,
    blunders: [
      ['stayLow', 3],
      ['panicFlap', 1],
      ['hesitate', 1],
    ],
  },
  // balayeur : haut, grandes lignes en travers des ombres ; frôle la tempête, néglige la défense
  nomad: {
    ...BASE,
    lowBias: 0.7,
    opportunism: 0.45,
    threat: 'ignore',
    nightLeaveShift: -5,
    turnMul: 2,
    stormFrom: 0.93,
    blunders: [
      ['overshoot', 3],
      ['storm', 2],
      ['wander', 1],
    ],
  },
  // embusqué : bas près des tours, se cache et jaillit ; trop passif, en retard au couchant
  lookout: {
    ...BASE,
    lowBias: 2.4,
    seal: 1.5,
    opportunism: 0.8,
    nightLeaveShift: 3,
    blunders: [
      ['overstay', 3],
      ['hesitate', 1],
      ['stayLow', 1],
    ],
  },
  // chaos : zigzags, coups d'aile gratuits, pique tout ce qui bouge ; rate beaucoup
  fool: {
    ...BASE,
    lowBias: 1.4,
    opportunism: 1,
    freeFlapRate: 0.1,
    blunderRate: 2,
    stormFrom: 0.96,
    turnMul: 0.15,
    blunders: [
      ['storm', 4],
      ['panicFlap', 2],
      ['hesitate', 1],
    ],
  },
  // méthodique : scelle à l'est des tours, se place à l'est avant la nuit, pique au couchant
  watchmaker: {
    ...BASE,
    lowBias: 1.8,
    seal: 1.9,
    opportunism: 0.35,
    nightLeaveShift: -2,
    blunders: [
      ['hesitate', 2],
      ['wander', 1],
    ],
  },
}
