// Point d'entrée public des bots (voir docs/agent-notes/bots.md).
//
//   const bot = createBot({ slot, personality: 'falcon', level: 1, seed })
//   // à chaque tick, avant sim.step() : inputs[slot] = bot.think(sim.state, lastEvents)
//
// Tous les bots d'une même simulation partagent automatiquement un coordinateur
// (perception, carte de valeur, équité « 2 bots au plus par cible »).
export type { Bot, BotOptions, BotPersonality, BotLevel, BotIntent, IntentKind, BlunderKind } from './types.ts'
export { BOT_PERSONALITIES, BOT_LEVELS } from './types.ts'
export { createBot } from './brain.ts'
export { coordinatorFor, BotCoordinator } from './coordinator.ts'
export { defaultBots, demoTeam, createSubstituteBot, createLobbyDummy, SUBSTITUTE_SPEC, type BotSpec } from './roster.ts'
export { levelParams, type LevelParams } from './levels.ts'
export { TRAITS, type Traits } from './traits.ts'
