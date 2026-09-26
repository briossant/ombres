// Sauvegarde de session (D20 : rafraîchir le PC ne casse pas la partie). Tout l'état nécessaire
// pour reprendre l'écran en cours tient dans sessionStorage (propre à l'onglet) : joueurs,
// partie, simulation (snapshot JSON de src/sim), mémoire du narrateur, réglages de partie.
// La salle réseau (code + jeton) et les téléphones sont sauvegardés à part par HostSession
// et PhoneHub (src/net), dans le même stockage.
import type { NarratorMemory } from '../../director/index.ts'
import type { MatchState, SimSnapshot, TitleAward } from '../../sim/index.ts'
import type { MatchResultsState, MatchSettingsVM, RoundResultsState } from '../ui/viewModel.ts'
import { DEBUG_NOSAVE } from './debug.ts'
import type { Player } from './players.ts'
import type { ViewContext } from './views.ts'

export interface RunnerSnapshot {
  v: 1
  /** Date.now() de l'écriture : au-delà de la durée de vie d'une salle (10 min), on repart du titre. */
  savedAt: number
  phase: ViewContext['phase']
  roster: { players: Player[]; nextOrder: number }
  matchSettings: MatchSettingsVM
  botsCustomized: boolean
  rulesShown: boolean
  matchSeed: number
  match: MatchState | null
  roundIndex: number
  sim: SimSnapshot | null
  roundResult: { index: number } | null
  interlude: boolean
  /** Temps restant (ms) avant l'échéance de l'écran, null sinon. */
  deadlineLeft: number | null
  paused: boolean
  pausedBy: number
  narrator: NarratorMemory
  goals: { slot: number; fly: boolean; dive: boolean; strike: boolean }[]
  roundResultsVM: RoundResultsState | null
  matchResultsVM: MatchResultsState | null
  titles: TitleAward[] | null
  winners: number[] | null
}

const KEY = 'ombres.runner.v1'
/** Le serveur garde une salle sans hôte 10 min : au-delà, la reprise n'a plus de sens. */
const MAX_AGE_MS = 10 * 60 * 1000

export function writeSnapshot(s: RunnerSnapshot): void {
  if (DEBUG_NOSAVE) return
  try {
    sessionStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    // stockage plein ou indisponible : la reprise ne sera pas possible, le jeu continue
  }
}

export function readSnapshot(): RunnerSnapshot | null {
  if (DEBUG_NOSAVE) return null
  try {
    const raw = sessionStorage.getItem(KEY)
    if (!raw) return null
    const s = JSON.parse(raw) as RunnerSnapshot
    if (!s || s.v !== 1 || typeof s.savedAt !== 'number' || Date.now() - s.savedAt > MAX_AGE_MS) return null
    if (!s.roster || !Array.isArray(s.roster.players)) return null
    return s
  } catch {
    return null
  }
}

export function clearSnapshot(): void {
  try {
    sessionStorage.removeItem(KEY)
  } catch {
    // ignoré
  }
}
