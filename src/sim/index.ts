// Point d'entrée public de la simulation (voir docs/agent-notes/sim.md).
export * from './types.ts'
export { RULES, DEG } from './rules.ts'
export { createSimulation, restoreSimulation } from './simulation.ts'
export { getMap, arenaPresetFor, getCliffProfile, towerRadiusAt, MAP_IDS, type MapInfo, type CliffProfile, type ArenaPreset } from './maps.ts'
export {
  createMatch,
  mapOrder,
  roundConfig,
  finishRound,
  isMatchOver,
  currentRoundIndex,
  roundMultiplier,
  sunSecondsOf,
  matchStandings,
  matchWinners,
  matchTitles,
  matchTitleStats,
  matchPlayerSummaries,
  roundTitles,
  matchSnapshot,
  restoreMatch,
  ranksOf,
  sunsOf,
  type MatchConfig,
  type MatchState,
  type RoundResult,
  type RoundFact,
  type MatchStanding,
  type MatchPlayerSummary,
  type RoundLength,
} from './match.ts'
export { assignTitles, TITLE_ORDER, TITLE_UNITS, type TitleId, type TitleUnit, type TitleAward, type TitleStats } from './titles.ts'
export * from './query.ts'
