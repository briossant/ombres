// Paramètres des trois niveaux (GDD §14.3). Les valeurs chiffrées du GDD viennent de
// RULES (§19.12) ; ce fichier n'ajoute que des réglages de comportement de l'IA (qui
// ne sont pas des règles du jeu) : comment chaque niveau lit les tours, choisit ses
// victimes, panique au cri.

import { RULES, DEG } from '../sim/rules.ts'
import type { BotLevel } from './types.ts'

export type VictimPolicy =
  | 'botsOrCrown' // Oisillon : des bots ou la couronne, jamais un joueur en aide au vol
  | 'crownThenClosest' // Voyageur : la couronne, sinon le plus proche
  | 'optimal' // Seigneur : grosse traînée, coup d'aile adverse en recharge

export type TowerSense =
  | 'ignore' // Oisillon : ne voit pas que le sable est figé
  | 'avoid' // Voyageur : évite de peindre du figé, se cache quand il est visé
  | 'exploit' // Seigneur : scelle, exploite les éclipses

export interface LevelParams {
  level: BotLevel
  /** Temps de réaction perçu (s) : les autres oiseaux sont vus avec ce retard. */
  reaction: number
  /** Intervalle de replanification (s). */
  decision: number
  /** Bruit sur le cap (rad, amplitude). */
  headingNoise: number
  /** Part du décalage de l'ombre compensée en visant. */
  shadowComp: number
  /** Anticipe la course du soleil (ombres futures). */
  anticipateSun: boolean
  /** Verrouillage tenu avant de piquer (s). */
  lockHold: number
  badDiveChance: number
  /** Réaction au clac : moyenne, écart type (s), probabilité d'oubli. */
  flapMean: number
  flapSd: number
  flapForget: number
  feintChance: number
  /** Probabilité, à chaque décision, d'oublier que le pâle ne recouvre pas le fort. */
  paleOnStrongChance: number
  /** Départ vers l'est avant la Grande Ombre (s pour T = 110), null = attend le front. */
  nightLeaveAt: number | null
  /** Une erreur volontaire toutes les … s en moyenne. */
  errorEvery: number
  victims: VictimPolicy
  towers: TowerSense
  /** Coup d'aile de panique au cri (prise d'élan) au lieu d'attendre le clac. */
  panicFlapChance: number
  /** Probabilité de remonter quand un chevron apparaît au-dessus de soi (bas, menacé). */
  climbWhenLocked: number
  /**
   * Profondeur de la décision de cap : un Oisillon ne regarde que 8 caps, à courte
   * distance (il repeint souvent son propre sable) ; Voyageur et Seigneur, les 16 caps
   * du GDD jusqu'à 120 m.
   */
  headingStep: number
  nearCount: number
  farCount: number
  /** Durée des erreurs volontaires (multiplicateur). */
  blunderScale: number
  /** Au couchant, goût des piqués rentables (s'ajoute au goût du caractère). */
  sunsetHunt: number
  /**
   * Part du bonus « voler en travers des ombres » que le bot comprend (0 : l'Oisillon ne
   * l'a pas découvert ; 1 : le Seigneur en tire tout le débit du soir).
   */
  sweepSkill: number
  /** Durée minimale (s) entre deux changements d'étage décidés (un débutant reste où il est). */
  altitudeDwell: number
  /** Penchant pour le haut du débutant (multiplie le goût du bas du caractère). */
  lowShyness: number
  /** Coups d'aile de sprint pour peindre plus vite quand aucun chasseur n'est en vue (par seconde). */
  sprintRate: number
  /**
   * Anticipation du clac (GDD §8.5 : « lire la prise d'élan et la distance permet de faire
   * mieux que le réflexe pur ») : probabilité de lire la prise d'élan, et délai visé
   * après le clac attendu (s, moyenne).
   */
  anticipateChance: number
  anticipateDelay: number
  /** Distance (m) sous laquelle un oiseau plus haut interdit le sprint (le Seigneur se fie à son esquive). */
  sprintSafeRadius: number
  /**
   * Coût d'un changement de cap (valeur par radian) : le débutant vire au moindre
   * frémissement de valeur et repasse sur sa propre traînée ; le Seigneur trace des
   * lignes franches (mesuré : +4 points de part à coût 1 000 contre 20, voir le rapport).
   */
  turnCost: number
  /** Choix d'une destination (raid, champ) parmi les N meilleures : le débutant vise « à peu près ». */
  planSpread: number
  /**
   * Sens du classement (0..1) : voler au rival direct (plus gros que soi) plutôt qu'à un
   * oiseau loin derrière, et le viser en priorité (la bande de sable du HUD le montre).
   */
  rivalry: number
}

/** Réglages d'IA propres aux niveaux (hors RULES : ce ne sont pas des règles du jeu). */
const AI = {
  victims: ['botsOrCrown', 'crownThenClosest', 'optimal'] as const,
  towers: ['ignore', 'avoid', 'exploit'] as const,
  panicFlapChance: [0.3, 0.06, 0],
  climbWhenLocked: [0, 0.55, 0.45],
  headingStep: [2, 1, 1],
  nearCount: [2, 3, 3],
  farCount: [2, 4, 4],
  blunderScale: [1.7, 1, 0.8],
  sunsetHunt: [0, 0.2, 0.6],
  sweepSkill: [0, 0.6, 1],
  altitudeDwell: [6, 1.2, 0.5],
  lowShyness: [0.7, 1, 1],
  sprintRate: [0, 0.15, 0.6],
  anticipateChance: [0, 0.35, 0.8],
  anticipateDelay: [0.3, 0.16, 0.1],
  sprintSafeRadius: [80, 80, 55],
  turnCost: [150, 900, 1500],
  planSpread: [6, 2, 1],
  rivalry: [0, 0.5, 1],
}

export function levelParams(level: BotLevel): LevelParams {
  return {
    level,
    reaction: RULES.botReactionMs[level]! / 1000,
    decision: RULES.botDecisionSeconds[level]!,
    headingNoise: RULES.botHeadingNoiseDeg[level]! * DEG,
    shadowComp: RULES.botShadowAimComp[level]!,
    anticipateSun: level === 2,
    lockHold: RULES.botLockHoldSeconds[level]!,
    badDiveChance: RULES.botBadDiveChance[level]!,
    flapMean: RULES.botFlapReactMeanS[level]!,
    flapSd: RULES.botFlapReactSdS[level]!,
    flapForget: RULES.botFlapForgetChance[level]!,
    feintChance: RULES.botFeintChance[level]!,
    paleOnStrongChance: RULES.botPaleOnStrongChance[level]!,
    nightLeaveAt: RULES.botNightLeaveAt[level] ?? null,
    errorEvery: RULES.botErrorEverySeconds[level]!,
    victims: AI.victims[level],
    towers: AI.towers[level],
    panicFlapChance: AI.panicFlapChance[level]!,
    climbWhenLocked: AI.climbWhenLocked[level]!,
    headingStep: AI.headingStep[level]!,
    nearCount: AI.nearCount[level]!,
    farCount: AI.farCount[level]!,
    blunderScale: AI.blunderScale[level]!,
    sunsetHunt: AI.sunsetHunt[level]!,
    sweepSkill: AI.sweepSkill[level]!,
    altitudeDwell: AI.altitudeDwell[level]!,
    lowShyness: AI.lowShyness[level]!,
    sprintRate: AI.sprintRate[level]!,
    anticipateChance: AI.anticipateChance[level]!,
    anticipateDelay: AI.anticipateDelay[level]!,
    sprintSafeRadius: AI.sprintSafeRadius[level]!,
    turnCost: AI.turnCost[level]!,
    planSpread: AI.planSpread[level]!,
    rivalry: AI.rivalry[level]!,
  }
}
