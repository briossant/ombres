// API publique du directeur (narrateur + indications contextuelles). Logique pure.
// Intégration : docs/agent-notes/director.md.
export { NarratorDirector, rankBirds, estimateDuration } from './narrator.ts'
export type { DirectorPlayer, NarratorCue, MatchInfo, NarratorOptions, NarratorMemory, RankEntry } from './narrator.ts'
export {
  HintsDirector,
  HINT_DEFS,
  HINT_IDS,
  createMemoryHintStore,
  createKeyValueHintMemory,
  paleOnStrongFraction,
} from './hints.ts'
export type { HintId, HintCue, HintDef, HintEffect, HintMemory, HintPlayer, KeyValueStore } from './hints.ts'
export { NARRATOR_LINES, KIND_SPECS, LINES_BY_KIND, narratorLine, lineHasColor } from './lines.ts'
export type { NarratorKind, NarratorLine, KindSpec, LineSubject } from './lines.ts'
export {
  narratorText,
  narratorTextParts,
  narratorClipId,
  narratorClipPath,
  subtitleSeconds,
  hintText,
  hintTextParts,
  hintParams,
  hintDisplaySeconds,
} from './text.ts'
export type { TextPart, ButtonLabels } from './text.ts'
export { indexNarratorManifest } from './manifest.ts'
export type { NarratorManifest, NarratorManifestLine, NarratorClipIndex } from './manifest.ts'
