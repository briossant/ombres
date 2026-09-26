// Titres de fin de partie (GDD §11.4) : un titre par joueur au plus, attribution
// gloutonne par z-score au-dessus des seuils ; chaque titre s'affiche avec son chiffre.
// Polish vague 1 (G10) : titres positifs d'abord (le Rapace au chasseur qui domine), jamais un
// titre négatif à qui domine son domaine (le meilleur chasseur n'est pas « le Kamikaze »),
// et un titre de repli pour le vainqueur de la partie (« Le Souverain », voir matchTitles).

import { RULES } from './rules.ts'
import type { BirdRoundStats } from './types.ts'

export type TitleId =
  | 'rapace'
  | 'gibier'
  | 'anguille'
  | 'kamikaze'
  | 'pilleur'
  | 'raseMottes'
  | 'nuage'
  | 'batisseur'
  | 'notaire'
  | 'dernierRayon'
  | 'lezard'
  | 'revenant'
  /** Repli du vainqueur de la partie sans autre titre (hors attribution par z-score). */
  | 'souverain'

/** Unité du chiffre affiché : nombre, fraction 0..1 (à afficher en %), secondes, places (mêmes clés que src/host/ui/viewModel.ts). */
export type TitleUnit = 'count' | 'frac' | 'seconds' | 'places'

export const TITLE_ORDER: readonly TitleId[] = ['rapace', 'gibier', 'anguille', 'kamikaze', 'pilleur', 'raseMottes', 'nuage', 'batisseur', 'notaire', 'dernierRayon', 'lezard', 'revenant']

export const TITLE_UNITS: Record<TitleId, TitleUnit> = {
  rapace: 'count',
  gibier: 'count',
  anguille: 'count',
  kamikaze: 'count',
  pilleur: 'frac',
  raseMottes: 'frac',
  nuage: 'frac',
  batisseur: 'frac',
  notaire: 'frac',
  dernierRayon: 'frac',
  lezard: 'seconds',
  revenant: 'places',
  souverain: 'count',
}

/** Titres flatteurs, attribués d'abord ; neutres ensuite ; les moqueurs en dernier. */
const POSITIVE_TITLES: readonly TitleId[] = ['rapace', 'anguille', 'pilleur', 'batisseur', 'notaire', 'dernierRayon', 'lezard', 'revenant']
const NEUTRAL_TITLES: readonly TitleId[] = ['raseMottes', 'nuage']
const NEGATIVE_TITLES: readonly TitleId[] = ['gibier', 'kamikaze']
/** Domaine d'un titre moqueur : celui qui domine ce titre flatteur ne reçoit pas le moqueur. */
const NEGATIVE_DOMAIN: Partial<Record<TitleId, TitleId>> = { kamikaze: 'rapace', gibier: 'anguille' }

/** Statistiques cumulées d'un joueur sur une ou plusieurs manches (entrée des titres). */
export interface TitleStats {
  slot: number
  hits: number
  gotHit: number
  dodges: number
  misses: number
  /** Sable pris à d'autres, en fraction d'arène, cumulé sur les manches. */
  stolenFrac: number
  timeLow: number
  timeHigh: number
  /** Cellules finales déjà à soi à 60 s / cellules finales (cumulées sur les manches). */
  keptFrom60: number
  finalCells: number
  /** Territoire figé sous les tours à la nuit, fraction d'arène, moyenne par manche. */
  frozenOwnFrac: number
  /** Gain net pendant la Grande Ombre, fraction d'arène, cumulé. */
  greatShadowFrac: number
  hiddenTime: number
  /** Meilleur nombre de places gagnées entre 90 s et la nuit sur une manche. */
  placesGained: number
}

export interface TitleAward {
  slot: number
  title: TitleId
  /** Chiffre affiché (voir `unit`). */
  value: number
  unit: TitleUnit
  /** Score de sélection (z-score dans le groupe). */
  z: number
}

export function emptyTitleStats(slot: number): TitleStats {
  return {
    slot,
    hits: 0,
    gotHit: 0,
    dodges: 0,
    misses: 0,
    stolenFrac: 0,
    timeLow: 0,
    timeHigh: 0,
    keptFrom60: 0,
    finalCells: 0,
    frozenOwnFrac: 0,
    greatShadowFrac: 0,
    hiddenTime: 0,
    placesGained: 0,
  }
}

/** Ajoute les statistiques d'une manche (moyennes : frozenOwnFrac pondéré par `rounds`). */
export function accumulateTitleStats(acc: TitleStats, s: BirdRoundStats, arenaCells: number, roundsSoFar: number): void {
  const cells = Math.max(1, arenaCells)
  acc.hits += s.hits
  acc.gotHit += s.gotHit
  acc.dodges += s.dodges
  acc.misses += s.misses
  acc.stolenFrac += s.stolenCells / cells
  acc.timeLow += s.timeLow
  acc.timeHigh += s.timeHigh
  acc.keptFrom60 += s.keptFrom60 ?? 0
  acc.finalCells += s.finalCells ?? 0
  acc.frozenOwnFrac = (acc.frozenOwnFrac * roundsSoFar + s.frozenOwnAtNight / cells) / (roundsSoFar + 1)
  acc.greatShadowFrac += s.gainGreatShadow / cells
  acc.hiddenTime += s.hiddenTime
  if (s.rankAt90 > 0 && s.rankAtNight > 0) acc.placesGained = Math.max(acc.placesGained, s.rankAt90 - s.rankAtNight)
}

/** Valeur de la statistique d'un titre pour un joueur. */
export function titleValue(title: TitleId, s: TitleStats): number {
  const flight = s.timeLow + s.timeHigh
  switch (title) {
    case 'rapace':
      return s.hits
    case 'gibier':
      return s.gotHit
    case 'anguille':
      return s.dodges
    case 'kamikaze':
      return s.misses
    case 'pilleur':
      return s.stolenFrac
    case 'raseMottes':
      return flight > 0 ? s.timeLow / flight : 0
    case 'nuage':
      return flight > 0 ? s.timeHigh / flight : 0
    case 'batisseur':
      return s.finalCells > 0 ? s.keptFrom60 / s.finalCells : 0
    case 'notaire':
      return s.frozenOwnFrac
    case 'dernierRayon':
      return s.greatShadowFrac
    case 'lezard':
      return s.hiddenTime
    case 'revenant':
      return s.placesGained
    case 'souverain':
      return 0
  }
}

/** Seuil d'éligibilité (GDD §11.4). « Dernier Rayon » : le plus haut, > 0 (traité à part). */
export function titleThreshold(title: TitleId): number {
  switch (title) {
    case 'rapace':
      return RULES.titleRapaceMin
    case 'gibier':
      return RULES.titleGibierMin
    case 'anguille':
      return RULES.titleAnguilleMin
    case 'kamikaze':
      return RULES.titleKamikazeMin
    case 'pilleur':
      return RULES.titlePilleurMinFrac
    case 'raseMottes':
      return RULES.titleRaseMottesMinFrac
    case 'nuage':
      return RULES.titleNuageMinFrac
    case 'batisseur':
      return RULES.titleBatisseurMinFrac
    case 'notaire':
      return RULES.titleNotaireMinFrac
    case 'dernierRayon':
      return Number.MIN_VALUE
    case 'lezard':
      return RULES.titleLezardMinSeconds
    case 'revenant':
      return RULES.titleRevenantMinPlaces
    case 'souverain':
      return Infinity
  }
}

/**
 * Titre de repli (polish G10) : chaque vainqueur sans titre devient « Le Souverain », avec son
 * total de soleils pour chiffre. Renvoie une nouvelle liste triée par slot.
 */
export function withSovereign(awards: readonly TitleAward[], winners: readonly { slot: number; suns: number }[]): TitleAward[] {
  const out = [...awards]
  for (const w of winners) {
    if (out.some((a) => a.slot === w.slot)) continue
    out.push({ slot: w.slot, title: 'souverain', value: w.suns, unit: TITLE_UNITS.souverain, z: 0 })
  }
  return out.sort((p, q) => p.slot - q.slot)
}

/**
 * Attribution gloutonne : pour chaque paire (joueur, titre) au-dessus du seuil, le
 * z-score de la statistique dans le groupe ; on attribue la paire la plus forte, on
 * retire ce joueur et ce titre, et on recommence. Déterministe (égalités : ordre des
 * titres, puis slot). Ordre des passes (G10) : le Rapace à qui domine les touches
 * (≥ RULES.titleRapaceDominance × la moyenne), puis les titres flatteurs, les neutres, et
 * enfin les moqueurs, jamais à qui domine leur domaine.
 */
export function assignTitles(players: readonly TitleStats[]): TitleAward[] {
  const pairs: TitleAward[] = []
  const best = new Map<TitleId, number>()
  const mean = new Map<TitleId, number>()
  for (const title of TITLE_ORDER) {
    const values = players.map((p) => titleValue(title, p))
    const n = values.length
    if (n === 0) continue
    const avg = values.reduce((a, v) => a + v, 0) / n
    const sd = Math.sqrt(values.reduce((a, v) => a + (v - avg) * (v - avg), 0) / n)
    const max = Math.max(...values)
    best.set(title, max)
    mean.set(title, avg)
    for (let i = 0; i < n; i++) {
      const v = values[i]!
      if (title === 'dernierRayon') {
        if (!(v > 0) || v < max) continue
      } else if (v < titleThreshold(title) - 1e-12) continue
      const z = sd > 1e-12 ? (v - avg) / sd : 0
      pairs.push({ slot: players[i]!.slot, title, value: v, unit: TITLE_UNITS[title], z })
    }
  }
  pairs.sort((p, q) => q.z - p.z || TITLE_ORDER.indexOf(p.title) - TITLE_ORDER.indexOf(q.title) || p.slot - q.slot)
  const out: TitleAward[] = []
  const usedSlots = new Set<number>()
  const usedTitles = new Set<TitleId>()
  const give = (p: TitleAward): void => {
    if (usedSlots.has(p.slot) || usedTitles.has(p.title)) return
    usedSlots.add(p.slot)
    usedTitles.add(p.title)
    out.push(p)
  }
  // 1. le chasseur qui domine les touches est le Rapace, quoi qu'en disent ses autres statistiques
  const hitsMean = mean.get('rapace') ?? 0
  const topHits = best.get('rapace') ?? 0
  if (hitsMean > 0 && topHits >= RULES.titleRapaceDominance * hitsMean) {
    const rapace = pairs.find((p) => p.title === 'rapace' && p.value === topHits)
    if (rapace) give(rapace)
  }
  // 2. flatteurs, 3. neutres, 4. moqueurs (pas à qui domine le domaine : meilleur chasseur, meilleure anguille)
  for (const p of pairs) if (POSITIVE_TITLES.includes(p.title)) give(p)
  for (const p of pairs) if (NEUTRAL_TITLES.includes(p.title)) give(p)
  for (const p of pairs) {
    if (!NEGATIVE_TITLES.includes(p.title)) continue
    const domain = NEGATIVE_DOMAIN[p.title]
    if (domain) {
      const top = best.get(domain) ?? 0
      const me = titleValue(domain, players.find((x) => x.slot === p.slot)!)
      if (top > 0 && me >= top) continue
    }
    give(p)
  }
  return out.sort((p, q) => p.slot - q.slot)
}
