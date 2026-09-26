// Partie complète (GDD §11) : manches, ordre des cartes, soleils, vainqueur,
// départages, faits marquants, titres. L'état de partie est un objet JSON simple
// (sérialisable tel quel pour le rafraîchissement du PC).
//
//   const match = createMatch({ seed, rounds: 3, length: 'normal', birds })
//   const sim = createSimulation(roundConfig(match))        // manche courante
//   … à la nuit (événement 'night' ou state.over) :
//   const result = finishRound(match, sim.state)            // soleils, rangs, faits marquants
//   if (isMatchOver(match)) { matchWinners(match); matchTitles(match) }

import { RULES } from './rules.ts'
import type { BirdRoundStats, BirdSetup, MapId, SimConfig, SimState } from './types.ts'
import { hash32 } from './math.ts'
import { accumulateTitleStats, assignTitles, emptyTitleStats, withSovereign, type TitleAward, type TitleStats } from './titles.ts'

export type RoundLength = keyof typeof RULES.roundLengthPresets

export interface MatchConfig {
  seed: number
  /** 1, 3 ou 5 manches (RULES.roundsOptions). */
  rounds: number
  /** Durée du soleil : courte 80 s, normale 110 s, longue 150 s. */
  length: RoundLength
  /** La dernière manche compte double (« Dernier couchant »), vrai par défaut. */
  lastDouble?: boolean
  /** Oiseaux de la partie (bots compris), fixes pendant toute la partie. */
  birds: BirdSetup[]
}

export interface RoundMap {
  mapId: MapId
  mirror: boolean
}

/** Fait marquant d'une manche, à afficher avec son chiffre (une mention au plus, GDD §11.3). */
export interface RoundFact {
  /** Mêmes clés que RoundFactKind de src/host/ui/viewModel.ts. */
  kind: 'bigSteal' | 'lastRay' | 'comeback' | 'mirage' | 'hunter' | 'dodger' | 'photoFinish' | 'landslide'
  slot: number
  /**
   * Valeur : fraction d'arène (bigSteal : gain en 3 s ; lastRay : gain de la Grande Ombre ;
   * comeback, mirage : part finale ; photoFinish, landslide : écart 1er-2e), compte (hunter, dodger).
   */
  value: number
  /** Intérêt relatif (le premier est la mention retenue). */
  score: number
}

export interface RoundResult {
  /** Index de manche (0-based). */
  index: number
  mapId: MapId
  mirror: boolean
  multiplier: number
  arenaCells: number
  /** Slots présents à la fin de la manche. */
  slots: number[]
  /** Par slot (longueur 12, 0 si absent). */
  cells: number[]
  shares: number[]
  /** Rang (1 = premier, ex æquo = même rang, 0 si absent). */
  ranks: number[]
  /** Soleils gagnés (multiplicateur compris). */
  suns: number[]
  /** Slots au premier rang (plusieurs si égalité exacte). */
  winners: number[]
  /** Égalité exacte au premier rang. */
  tie: boolean
  /** Les deux premiers sont à moins de RULES.closeFinishGap (écart affiché au dixième de pour cent). */
  close: boolean
  /** Statistiques de manche par slot (copies), null si absent. */
  stats: (BirdRoundStats | null)[]
  facts: RoundFact[]
  highlight: RoundFact | null
}

export interface MatchStanding {
  slot: number
  suns: number
  /** Territoire cumulé (somme des parts) : premier départage. */
  cumulativeShare: number
  /** Manches gagnées : second départage. */
  roundWins: number
  /** Rang dans la partie (1 = premier ; co-victoire possible). */
  rank: number
}

export interface MatchState {
  version: 1
  config: MatchConfig
  maps: RoundMap[]
  results: RoundResult[]
}

// ─── Création, ordre des cartes ────────────────────────────────────────────

/**
 * Ordre des cartes (GDD §11.2) : Parasols, puis Aiguilles ou Géantes (tirage), puis
 * Le Cadran en dernier. En 5 manches : Parasols, Aiguilles, Géantes, Parasols en
 * miroir, Cadran. En 1 manche : Parasols (carte d'ouverture, la plus lisible).
 */
export function mapOrder(rounds: number, seed: number): RoundMap[] {
  if (rounds <= 1) return [{ mapId: 'parasols', mirror: false }]
  if (rounds >= 5) {
    return [
      { mapId: 'parasols', mirror: false },
      { mapId: 'aiguilles', mirror: false },
      { mapId: 'geantes', mirror: false },
      { mapId: 'parasols', mirror: true },
      { mapId: 'cadran', mirror: false },
    ]
  }
  const middle: MapId = hash32(seed, 0x6d6170) % 2 === 0 ? 'aiguilles' : 'geantes'
  const out: RoundMap[] = [{ mapId: 'parasols', mirror: false }]
  for (let i = 1; i < rounds - 1; i++) out.push({ mapId: i === 1 ? middle : middle === 'aiguilles' ? 'geantes' : 'aiguilles', mirror: false })
  out.push({ mapId: 'cadran', mirror: false })
  return out
}

export function createMatch(config: MatchConfig): MatchState {
  const rounds = RULES.roundsOptions.includes(config.rounds as 1 | 3 | 5) ? config.rounds : RULES.roundsDefault
  const cfg: MatchConfig = { ...config, rounds, lastDouble: config.lastDouble ?? true, birds: config.birds.map((b) => ({ ...b })) }
  return { version: 1, config: cfg, maps: mapOrder(rounds, config.seed), results: [] }
}

/** Index de la manche à jouer (= nombre de manches terminées). */
export function currentRoundIndex(match: MatchState): number {
  return match.results.length
}

export function isMatchOver(match: MatchState): boolean {
  return match.results.length >= match.config.rounds
}

/** La manche d'index i compte-t-elle double ? */
export function roundMultiplier(match: MatchState, index: number): number {
  return match.config.lastDouble !== false && index === match.config.rounds - 1 && match.config.rounds > 1 ? RULES.lastRoundMultiplier : 1
}

/** Durée du soleil de la partie (s). */
export function sunSecondsOf(match: MatchState): number {
  return RULES.roundLengthPresets[match.config.length] ?? RULES.roundSunSeconds
}

/** Configuration de simulation de la manche `index` (par défaut : la manche courante). */
export function roundConfig(match: MatchState, index = currentRoundIndex(match), birds: BirdSetup[] = match.config.birds): SimConfig {
  const m = match.maps[Math.min(index, match.maps.length - 1)]!
  return {
    mode: 'round',
    seed: hash32(match.config.seed, index + 1),
    mapId: m.mapId,
    mirror: m.mirror,
    birds: birds.map((b) => ({ ...b })),
    sunSeconds: sunSecondsOf(match),
    countdown: true,
  }
}

// ─── Fin de manche ─────────────────────────────────────────────────────────

/** Rangs avec ex æquo (même nombre de cellules = même rang, le meilleur). */
export function ranksOf(cells: readonly number[], slots: readonly number[]): number[] {
  const ranks = new Array(12).fill(0)
  for (const s of slots) {
    let r = 1
    for (const o of slots) if (cells[o]! > cells[s]!) r++
    ranks[s] = r
  }
  return ranks
}

/** Soleils (GDD §11.1) : un par oiseau devancé, plus un au vainqueur, × multiplicateur. */
export function sunsOf(cells: readonly number[], slots: readonly number[], multiplier: number): number[] {
  const suns = new Array(12).fill(0)
  const ranks = ranksOf(cells, slots)
  for (const s of slots) {
    let beaten = 0
    for (const o of slots) if (cells[o]! < cells[s]!) beaten++
    suns[s] = (beaten + (ranks[s] === 1 ? RULES.winnerBonusSuns : 0)) * multiplier
  }
  return suns
}

function copyStats(s: BirdRoundStats | undefined): BirdRoundStats | null {
  return s ? { ...s } : null
}

function roundFacts(state: SimState, cells: number[], ranks: number[], winners: number[]): RoundFact[] {
  const facts: RoundFact[] = []
  const arena = Math.max(1, state.grid.arenaCells)
  const n = state.birds.length
  const stats = (s: number) => state.stats[s]
  const slots = state.birds.map((b) => b.slot)
  // plus gros gain en 3 s
  let best = -1
  let bestV = 0
  for (const s of slots) {
    const v = (stats(s)?.maxGain3s ?? 0) / arena
    if (v > bestV) {
      bestV = v
      best = s
    }
  }
  if (best >= 0 && bestV >= RULES.bigStealFrac) facts.push({ kind: 'bigSteal', slot: best, value: bestV, score: 1 + bestV * 20 })
  // dernier rayon : le vainqueur a fait le plus gros gain de la Grande Ombre
  let gs = -1
  let gsV = 0
  for (const s of slots) {
    const v = (stats(s)?.gainGreatShadow ?? 0) / arena
    if (v > gsV) {
      gsV = v
      gs = s
    }
  }
  if (gs >= 0 && winners.includes(gs)) facts.push({ kind: 'lastRay', slot: gs, value: gsV, score: 2 + gsV * 10 })
  // remontée : dernier à 80 s, sur le podium à la nuit
  for (const s of slots) {
    const st = stats(s)
    if (!st || n < 3) continue
    if (st.rankAt80 === n && ranks[s]! <= 3) facts.push({ kind: 'comeback', slot: s, value: cells[s]! / arena, score: 2.5 })
  }
  // mirage : meneur à 98 s, pas vainqueur
  for (const s of slots) {
    const st = stats(s)
    if (st && st.rankAt98 === 1 && !winners.includes(s) && n > 1) facts.push({ kind: 'mirage', slot: s, value: cells[s]! / arena, score: 2.2 })
  }
  // chasseur, esquiveur, caché
  for (const s of slots) {
    const st = stats(s)
    if (!st) continue
    if (st.hits >= 3) facts.push({ kind: 'hunter', slot: s, value: st.hits, score: 1.2 + st.hits * 0.1 })
    if (st.dodges >= 2) facts.push({ kind: 'dodger', slot: s, value: st.dodges, score: 1.1 + st.dodges * 0.1 })
  }
  // écarts
  const order = [...slots].sort((p, q) => cells[q]! - cells[p]!)
  if (order.length > 1) {
    const gap = (cells[order[0]!]! - cells[order[1]!]!) / arena
    if (gap < RULES.closeFinishGap) facts.push({ kind: 'photoFinish', slot: order[0]!, value: gap, score: 3 })
    else if (gap >= RULES.landslideGap) facts.push({ kind: 'landslide', slot: order[0]!, value: gap, score: 3 })
  }
  facts.sort((p, q) => q.score - p.score || p.slot - q.slot)
  return facts
}

/**
 * Enregistre la manche terminée (à appeler à la nuit : les comptes sont figés) et
 * renvoie son résultat. Idempotent pour un même état de simulation.
 */
export function finishRound(match: MatchState, state: SimState): RoundResult {
  const already = finished.get(state)
  if (already && match.results.includes(already)) return already
  const index = currentRoundIndex(match)
  const m = match.maps[Math.min(index, match.maps.length - 1)]!
  const slots = state.birds.map((b) => b.slot).sort((a, b) => a - b)
  const cells = new Array(12).fill(0)
  for (const s of slots) cells[s] = state.grid.counts[s + 1]!
  const arena = Math.max(1, state.grid.arenaCells)
  const shares = cells.map((c) => c / arena)
  const ranks = ranksOf(cells, slots)
  const multiplier = roundMultiplier(match, index)
  const suns = sunsOf(cells, slots, multiplier)
  const winners = slots.filter((s) => ranks[s] === 1)
  const order = [...slots].sort((p, q) => cells[q]! - cells[p]!)
  const gap = order.length > 1 ? (cells[order[0]!]! - cells[order[1]!]!) / arena : 1
  const result: RoundResult = {
    index,
    mapId: m.mapId,
    mirror: m.mirror,
    multiplier,
    arenaCells: arena,
    slots,
    cells,
    shares,
    ranks,
    suns,
    winners,
    tie: winners.length > 1,
    close: gap < RULES.closeFinishGap,
    stats: Array.from({ length: 12 }, (_, s) => (slots.includes(s) ? copyStats(state.stats[s]) : null)),
    facts: [],
    highlight: null,
  }
  result.facts = roundFacts(state, cells, ranks, winners)
  // un fait marquant ne revient jamais dans la même partie (« Raz-de-marée » trois fois de suite)
  const told = new Set(match.results.map((r) => r.highlight?.kind))
  result.highlight = result.facts.find((f) => !told.has(f.kind)) ?? null
  match.results.push(result)
  finished.set(state, result)
  return result
}

/** Manches déjà enregistrées (même état de simulation → même résultat). */
const finished = new WeakMap<SimState, RoundResult>()

// ─── Classement de la partie ───────────────────────────────────────────────

/**
 * Classement (GDD §11.2) : total de soleils, puis territoire cumulé, puis manches
 * gagnées ; au-delà, co-victoire (« Le désert refuse de choisir »).
 */
export function matchStandings(match: MatchState): MatchStanding[] {
  const slots = new Set<number>()
  for (const b of match.config.birds) slots.add(b.slot)
  for (const r of match.results) for (const s of r.slots) slots.add(s)
  const rows: MatchStanding[] = [...slots].map((slot) => ({ slot, suns: 0, cumulativeShare: 0, roundWins: 0, rank: 0 }))
  for (const row of rows) {
    for (const r of match.results) {
      row.suns += r.suns[row.slot] ?? 0
      row.cumulativeShare += r.shares[row.slot] ?? 0
      if (r.winners.includes(row.slot)) row.roundWins++
    }
  }
  const cmp = (p: MatchStanding, q: MatchStanding) => q.suns - p.suns || q.cumulativeShare - p.cumulativeShare || q.roundWins - p.roundWins
  rows.sort((p, q) => cmp(p, q) || p.slot - q.slot)
  for (const row of rows) {
    let r = 1
    for (const o of rows) if (cmp(o, row) < 0) r++
    row.rank = r
  }
  return rows
}

/** Vainqueur(s) de la partie (plusieurs = co-victoire). */
export function matchWinners(match: MatchState): number[] {
  return matchStandings(match)
    .filter((r) => r.rank === 1)
    .map((r) => r.slot)
}

// ─── Titres ────────────────────────────────────────────────────────────────

/** Statistiques de titres cumulées sur les manches jouées. */
export function matchTitleStats(match: MatchState): TitleStats[] {
  const bySlot = new Map<number, { acc: TitleStats; rounds: number }>()
  for (const r of match.results) {
    for (const s of r.slots) {
      const st = r.stats[s]
      if (!st) continue
      let e = bySlot.get(s)
      if (!e) {
        e = { acc: emptyTitleStats(s), rounds: 0 }
        bySlot.set(s, e)
      }
      accumulateTitleStats(e.acc, st, r.arenaCells, e.rounds)
      e.rounds++
    }
  }
  return [...bySlot.values()].map((e) => e.acc).sort((p, q) => p.slot - q.slot)
}

/**
 * Titres de fin de partie (GDD §11.4). Polish G10 : le vainqueur de la partie a toujours un
 * titre ; sans aucun autre, il est « Le Souverain » (son total de soleils en chiffre).
 */
export function matchTitles(match: MatchState): TitleAward[] {
  const standings = matchStandings(match)
  const winners = matchWinners(match).map((slot) => ({ slot, suns: standings.find((s) => s.slot === slot)?.suns ?? 0 }))
  return withSovereign(assignTitles(matchTitleStats(match)), winners)
}

/** Titres d'une seule manche (mêmes règles, statistiques de la manche). */
export function roundTitles(result: RoundResult): TitleAward[] {
  const players: TitleStats[] = []
  for (const s of result.slots) {
    const st = result.stats[s]
    if (!st) continue
    const acc = emptyTitleStats(s)
    accumulateTitleStats(acc, st, result.arenaCells, 0)
    players.push(acc)
  }
  return assignTitles(players)
}

/** Statistiques de partie par joueur (mêmes champs que MatchStatsVM de l'UI). */
export interface MatchPlayerSummary {
  slot: number
  hits: number
  gotHit: number
  dodges: number
  misses: number
  /** Sable pris aux autres, fraction d'arène cumulée. */
  stolenFrac: number
  /** Part du temps passée en bas (0..1). */
  lowFrac: number
  hiddenSeconds: number
  roundsWon: number
}

export function matchPlayerSummaries(match: MatchState): MatchPlayerSummary[] {
  const standings = matchStandings(match)
  return matchTitleStats(match).map((t) => {
    const flight = t.timeLow + t.timeHigh
    return {
      slot: t.slot,
      hits: t.hits,
      gotHit: t.gotHit,
      dodges: t.dodges,
      misses: t.misses,
      stolenFrac: t.stolenFrac,
      lowFrac: flight > 0 ? t.timeLow / flight : 0,
      hiddenSeconds: t.hiddenTime,
      roundsWon: standings.find((r) => r.slot === t.slot)?.roundWins ?? 0,
    }
  })
}

/** Copie JSON de l'état de partie (sauvegarde) ; l'objet est déjà sérialisable. */
export function matchSnapshot(match: MatchState): MatchState {
  return JSON.parse(JSON.stringify(match)) as MatchState
}

export function restoreMatch(data: unknown): MatchState {
  const m = data as MatchState
  if (!m || m.version !== 1 || !Array.isArray(m.results) || !Array.isArray(m.maps)) throw new Error('état de partie invalide')
  return JSON.parse(JSON.stringify(m)) as MatchState
}
