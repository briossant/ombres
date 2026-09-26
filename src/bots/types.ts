// Contrat public des bots d'Ombres (GDD §14).
//
// Un bot est une politique d'entrée : à chaque tick, il lit l'état de la simulation
// (uniquement ce que l'écran montre) et produit un BirdInput, exactement comme un
// téléphone ou un clavier. Module pur : ni DOM, ni three, ni React, aléatoire à graine.

import type { BirdInput, SimEvent, SimState } from '../sim/types.ts'

/** Les sept caractères (identifiants partagés avec l'UI : src/host/ui/viewModel.ts). */
export type BotPersonality = 'falcon' | 'ploughman' | 'magpie' | 'nomad' | 'lookout' | 'fool' | 'watchmaker'

export const BOT_PERSONALITIES: readonly BotPersonality[] = ['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'fool', 'watchmaker']

/** Niveau : index des tableaux RULES.bot* — 0 Oisillon, 1 Voyageur, 2 Seigneur des sables. */
export type BotLevel = 0 | 1 | 2

export const BOT_LEVELS: readonly BotLevel[] = [0, 1, 2]

/** Ce que fait le bot en ce moment (lisible à l'écran par sa trajectoire ; exposé pour le debug). */
export type IntentKind =
  | 'idle' // compte à rebours, nuit, décroché
  | 'paint' // peint là où ça rapporte (décision par utilité)
  | 'furrow' // Laboureur : sillons parallèles
  | 'raid' // Pie : ligne droite vers le sable du meneur
  | 'sweep' // Nomade : grande ligne droite en travers des ombres
  | 'hunt' // approche d'une proie par le haut
  | 'circle' // Faucon : cercle au-dessus de la proie avant le piqué
  | 'dive' // piqué en cours
  | 'lurk' // Guetteur : cercles serrés dans l'ombre d'une tour
  | 'ambush' // Guetteur : sortie brusque sur une proie
  | 'seal' // peint fort devant une ombre de tour qui arrive (scellage)
  | 'flee' // fuit un chasseur
  | 'hide' // file se cacher sous une tour
  | 'night' // file vers l'est avant / pendant la Grande Ombre
  | 'chaos' // Fou : zigzags
  | 'loop' // Fou : looping de célébration
  | 'dummy' // mannequin du lobby
  | 'blunder' // erreur volontaire en cours

/** Erreurs crédibles (GDD §14.2, §14.3 « erreurs volontaires »). */
export type BlunderKind =
  | 'storm' // file vers la tempête
  | 'hesitate' // hésite, godille
  | 'stayLow' // oublie de remonter
  | 'wander' // oublie de peindre, file tout droit
  | 'overshoot' // prolonge sa ligne trop loin (ombre hors de l'arène)
  | 'panicFlap' // coup d'aile pour rien
  | 'overstay' // Guetteur : s'attarde dans sa cachette

export interface BotIntent {
  kind: IntentKind
  /** Oiseau visé (proie, victime du raid), −1 sinon. */
  target: number
  /** Point visé (monde, m), NaN si aucun. */
  x: number
  y: number
  /** Veut voler bas (PLONGER maintenu). */
  low: boolean
  /** Erreur volontaire en cours, null sinon. */
  blunder: BlunderKind | null
}

export interface BotOptions {
  slot: number
  personality: BotPersonality
  level: BotLevel
  /** Graine du PRNG du bot (déterminisme : même graine + mêmes états = mêmes entrées). */
  seed: number
  /** Remplaçant d'un joueur déconnecté (GDD §14.3). */
  substitute?: boolean
}

export interface Bot {
  readonly slot: number
  readonly personality: BotPersonality
  /** Niveau effectif (l'Horloger n'existe pas en Oisillon : il joue Voyageur). */
  readonly level: BotLevel
  readonly substitute: boolean
  /**
   * À appeler à chaque tick avec l'état courant et les événements du dernier step().
   * Retourne l'entrée du tick (objet réutilisé d'un tick à l'autre : le copier pour le garder).
   */
  think(state: SimState, events: readonly SimEvent[]): BirdInput
  /** Intention courante (lecture seule). */
  readonly intent: Readonly<BotIntent>
  /** Oublie le plan en cours (automatique quand l'état de simulation change : nouvelle manche, reprise). */
  reset(): void
}
