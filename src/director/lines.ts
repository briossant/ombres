// Catalogue des répliques du narrateur (GDD §16.4, réécrit pour la voix : voir
// docs/agent-notes/director.md). Le texte vit dans src/shared/strings/narrator.ts
// (clé `narrator.<id>`, placeholder `{color}`) ; les clips dans
// public/audio/narrator/<lang>/<id>[.<colorIndex>].mp3.
//
// Une réplique appartient à un TYPE d'événement (NarratorKind). Le directeur
// choisit le type (priorité, plafonds, écarts), puis une variante encore inédite
// dans la partie.
import { RULES } from '../sim/rules.ts'

export type NarratorKind =
  // Structure de partie (hors plafond de manche)
  | 'matchOpen'
  | 'roundOpen'
  | 'lastRound'
  // Événements de manche
  | 'firstHit'
  | 'hit'
  | 'doubleHit'
  | 'huntStreak'
  | 'dodge'
  | 'miss'
  | 'firstCrown'
  | 'leaderChange'
  | 'crownDown'
  | 'bigSteal'
  | 'trailSteal'
  | 'hugeSweep'
  | 'runaway'
  | 'hiddenLong'
  | 'storm'
  | 'idle'
  // Horloge solaire
  | 'golden'
  | 'sunset'
  | 'greatShadow'
  | 'tenSeconds'
  | 'photoFinish'
  // Résultats de manche (une seule réplique)
  | 'tie'
  | 'landslide'
  | 'closeFinish'
  | 'lastRay'
  | 'comeback'
  | 'mirage'
  | 'roundWin'
  // Fin de partie
  | 'matchWin'
  | 'matchTie'
  | 'rematch'

/** Qui la couleur de la réplique désigne. */
export type LineSubject =
  | 'none' // réplique neutre (pas de couleur)
  | 'actor' // l'auteur de l'événement (chasseur, voleur, meneur, vainqueur…)
  | 'victim' // celui qui le subit (proie, volé…)

export interface NarratorLine {
  id: string
  kind: NarratorKind
  subject: LineSubject
}

/**
 * - `round`   : événement de manche, compté dans le plafond de RULES.narratorMaxPerRound ;
 * - `clock`   : horloge solaire (heure dorée, couchant, Grande Ombre, dix secondes, photo-finish), comptée aussi ;
 * - `results` : réplique des résultats de manche (hors plafond) ;
 * - `match`   : ouverture, dernière manche, vainqueur de partie, revanche (hors plafond, hors silence).
 */
export type KindScope = 'round' | 'clock' | 'results' | 'match'

export interface KindSpec {
  /** 1 = passe toujours … 5 = remplissage (GDD §16.4). */
  priority: 1 | 2 | 3 | 4 | 5
  scope: KindScope
  capPerRound?: number
  capPerMatch?: number
  /** Écart minimal (s) avec la dernière réplique du même groupe. */
  groupGap?: number
  /** Groupe pour l'écart ci-dessus (défaut : le type lui-même). */
  gapGroup?: string
  /** Quand toutes les variantes ont servi dans la partie : rejouer la moins récente (sinon, silence). */
  reuse?: boolean
  /**
   * Condition durable (couronne, cachette, tempête…) : la réplique reste valable tant que la
   * condition tient, jusqu'à RULES.narratorMinGap s après l'événement, au lieu de la péremption
   * ordinaire de RULES.narratorStaleSeconds.
   */
  sustained?: boolean
  /** Départage de deux candidats issus d'un même événement : le plus spécifique gagne. */
  specificity?: number
}

/**
 * GDD §16.4 : 20 s entre deux « gros vols ». Aucune constante dédiée dans RULES (demandée dans
 * docs/agent-notes/REQUESTS.md) : même valeur que l'écart entre deux annonces de meneur.
 */
const BIG_STEAL_MIN_GAP = RULES.leaderChangeMinGap

// Priorités et plafonds : GDD §16.4, avec deux écarts documentés (director.md §Décisions) :
// - photoFinish passe en priorité 1 : en priorité 2, l'écart de 8 s après « Dix secondes » (100 s)
//   et le silence de 107 s le rendaient injouable ;
// - golden/sunset/greatShadow/tenSeconds ont trois variantes (une par manche d'une partie standard),
//   et reviennent (la moins récente) aux manches 4 et 5 d'une partie en cinq manches : le soleil qui
//   descend est commenté à chaque manche.
export const KIND_SPECS: Record<NarratorKind, KindSpec> = {
  matchOpen: { priority: 1, scope: 'match', capPerMatch: 1 },
  roundOpen: { priority: 1, scope: 'match', reuse: true },
  lastRound: { priority: 1, scope: 'match', capPerMatch: 1 },

  firstHit: { priority: 3, scope: 'round', capPerRound: 1, gapGroup: 'hit', specificity: 2 },
  hit: { priority: 3, scope: 'round', capPerRound: 2, gapGroup: 'hit', groupGap: RULES.diveHitNarrMinGap, specificity: 1 },
  doubleHit: { priority: 2, scope: 'round', capPerRound: 1, specificity: 6 },
  huntStreak: { priority: 3, scope: 'round', capPerRound: 1, specificity: 4 },
  dodge: { priority: 4, scope: 'round', capPerRound: 1 },
  miss: { priority: 4, scope: 'round', capPerRound: 1 },
  firstCrown: { priority: 2, scope: 'round', capPerMatch: 1, gapGroup: 'leader', sustained: true, specificity: 2 },
  leaderChange: {
    priority: 2,
    scope: 'round',
    capPerRound: RULES.leaderChangeMaxPerRound,
    gapGroup: 'leader',
    groupGap: RULES.leaderChangeMinGap,
    sustained: true,
    specificity: 1,
  },
  crownDown: { priority: 2, scope: 'round', capPerRound: 1, specificity: 5 },
  bigSteal: { priority: 2, scope: 'round', capPerRound: 2, groupGap: BIG_STEAL_MIN_GAP, specificity: 1 },
  trailSteal: { priority: 3, scope: 'round', capPerRound: 1, specificity: 3 },
  hugeSweep: { priority: 2, scope: 'round', capPerRound: 1, specificity: 2 },
  runaway: { priority: 5, scope: 'round', capPerRound: 1, sustained: true },
  hiddenLong: { priority: 5, scope: 'round', capPerRound: 1, sustained: true },
  storm: { priority: 5, scope: 'round', capPerRound: 1, sustained: true },
  idle: { priority: 5, scope: 'round', capPerRound: 1, sustained: true },

  // Spécificité élevée : à priorité égale, l'horloge passe devant un événement survenu au même moment.
  golden: { priority: 2, scope: 'clock', specificity: 10, reuse: true },
  sunset: { priority: 2, scope: 'clock', specificity: 10, reuse: true },
  greatShadow: { priority: 1, scope: 'clock', reuse: true },
  tenSeconds: { priority: 1, scope: 'clock', reuse: true },
  photoFinish: { priority: 1, scope: 'clock' },

  tie: { priority: 1, scope: 'results' },
  landslide: { priority: 1, scope: 'results' },
  closeFinish: { priority: 1, scope: 'results' },
  lastRay: { priority: 1, scope: 'results' },
  comeback: { priority: 1, scope: 'results' },
  mirage: { priority: 1, scope: 'results' },
  roundWin: { priority: 1, scope: 'results', reuse: true },

  matchWin: { priority: 1, scope: 'match', reuse: true },
  matchTie: { priority: 1, scope: 'match', reuse: true },
  rematch: { priority: 2, scope: 'match', reuse: true },
}

/** Ordre des répliques de résultats (GDD §16.4) : la première applicable et inédite l'emporte. */
export const RESULT_ORDER: readonly NarratorKind[] = ['tie', 'landslide', 'closeFinish', 'lastRay', 'comeback', 'mirage', 'roundWin']

/** Clock kinds réservés dans le budget de manche (joués à coup sûr, dans cet ordre). */
export const RESERVED_CLOCK: readonly NarratorKind[] = ['golden', 'sunset', 'greatShadow', 'tenSeconds']

const L = (id: string, kind: NarratorKind, subject: LineSubject = 'actor'): NarratorLine => ({ id, kind, subject })

export const NARRATOR_LINES: readonly NarratorLine[] = [
  L('matchOpen', 'matchOpen', 'none'),
  L('roundOpen1', 'roundOpen', 'none'),
  L('roundOpen2', 'roundOpen', 'none'),
  L('roundOpen3', 'roundOpen', 'none'),
  L('lastRound', 'lastRound', 'none'),

  L('firstHit', 'firstHit'),
  L('hitHunter', 'hit'),
  L('hitVictim', 'hit', 'victim'),
  L('doubleHit', 'doubleHit'),
  L('huntStreak', 'huntStreak'),
  L('dodge', 'dodge'),
  L('miss', 'miss'),
  L('firstCrown', 'firstCrown'),
  L('leaderChange1', 'leaderChange'),
  L('leaderChange2', 'leaderChange'),
  L('leaderChange3', 'leaderChange'),
  L('leaderChange4', 'leaderChange'),
  L('crownDown', 'crownDown', 'victim'),
  L('bigSteal', 'bigSteal'),
  L('bigStealVictim', 'bigSteal', 'victim'),
  L('trailSteal', 'trailSteal'),
  L('hugeSweep', 'hugeSweep', 'none'),
  L('runaway', 'runaway'),
  L('hiddenLong', 'hiddenLong'),
  L('storm', 'storm'),
  L('idle', 'idle'),

  L('golden1', 'golden', 'none'),
  L('golden2', 'golden', 'none'),
  L('golden3', 'golden', 'none'),
  L('sunset1', 'sunset', 'none'),
  L('sunset2', 'sunset', 'none'),
  L('sunset3', 'sunset', 'none'),
  L('greatShadow1', 'greatShadow', 'none'),
  L('greatShadow2', 'greatShadow', 'none'),
  L('greatShadow3', 'greatShadow', 'none'),
  L('tenSeconds1', 'tenSeconds', 'none'),
  L('tenSeconds2', 'tenSeconds', 'none'),
  L('tenSeconds3', 'tenSeconds', 'none'),
  L('photoFinish1', 'photoFinish', 'none'),
  L('photoFinish2', 'photoFinish', 'none'),

  L('tie', 'tie', 'none'),
  L('landslide', 'landslide'),
  L('closeFinish1', 'closeFinish', 'none'),
  L('closeFinish2', 'closeFinish', 'none'),
  L('lastRay', 'lastRay'),
  L('comeback', 'comeback'),
  L('mirage', 'mirage'),
  L('roundWin1', 'roundWin'),
  L('roundWin2', 'roundWin'),
  L('roundWin3', 'roundWin'),

  L('matchWin', 'matchWin'),
  L('matchTie', 'matchTie', 'none'),
  L('rematch', 'rematch', 'none'),
]

export const LINES_BY_KIND: Readonly<Record<NarratorKind, readonly NarratorLine[]>> = (() => {
  const out = Object.fromEntries(Object.keys(KIND_SPECS).map(k => [k, [] as NarratorLine[]])) as Record<NarratorKind, NarratorLine[]>
  for (const line of NARRATOR_LINES) out[line.kind].push(line)
  return out
})()

const BY_ID = new Map(NARRATOR_LINES.map(l => [l.id, l]))

export function narratorLine(id: string): NarratorLine | undefined {
  return BY_ID.get(id)
}

/** Réplique qui nomme une couleur (12 clips par langue). */
export function lineHasColor(line: NarratorLine): boolean {
  return line.subject !== 'none'
}
