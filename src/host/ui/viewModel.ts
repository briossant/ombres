// Modèle de vue de l'interface du PC (écrans + HUD) : c'est le CONTRAT entre
// l'UI (src/host/ui) et le runner de phase 3.
//
// - Le runner ÉCRIT dans ces stores zustand (≤ 10 Hz, jamais à chaque frame) et
//   implémente les ACTIONS (callbacks) déclenchées par l'UI.
// - Les seules données à 60 Hz (positions écran des oiseaux pour les étiquettes,
//   flèches hors champ et bulles) passent par l'objet mutable `hudAnchors`, lu
//   dans une boucle rAF de l'UI, sans re-rendu React.
// - Aide à l'intégration : `hudFromSim(state)` (throttlé) et `connectHudEvents()`
//   dérivent l'essentiel du HUD de la simulation et du bus d'événements.
//
// Documentation complète : docs/agent-notes/ui.md.
import { create } from 'zustand'
import type { MapId, RoundPhase, SimEvent, SimState } from '../../sim/types.ts'
import { RULES } from '../../sim/rules.ts'
import type { PlayerKind } from '../view.ts'
import { simEvents, type Emitter } from '../bus.ts'
import { t } from '../../shared/i18n.ts'

// ─── Écrans ────────────────────────────────────────────────────────────────

export type ScreenId =
  | 'loading' // chargement (progression réelle)
  | 'title' // écran titre (scène de démo derrière)
  | 'lobby' // salon : QR, slots, réglages de partie
  | 'rules' // les 3 cartes des règles (interstitiel avant la 1re manche)
  | 'game' // HUD de manche
  | 'roundResults' // résultats de manche
  | 'matchResults' // podium, titres, revanche
  | 'credits'
  /** Plan de mise en scène sans panneau (ajout runner) : montée de nuit, arrivée du podium. */
  | 'cinematic'

/** Surcouche par-dessus l'écran courant. La pause est un état à part (`paused`). */
export type OverlayId = 'settings' | null

export type HostLink = 'ok' | 'reconnecting' | 'lost'

export interface UiState {
  screen: ScreenId
  overlay: OverlayId
  /** Chargement : progression réelle 0..1 et clé i18n du libellé (ex. 'host.loading.sounds'). */
  loading: { progress: number; labelKey: string }
  /** Écran titre : faux tant qu'on affiche « appuie sur une touche ». */
  titleMenuOpen: boolean
  /** Partie en pause (la pause se superpose au HUD). `pausedBy` : slot qui l'a demandée, -1 = le PC. */
  paused: boolean
  pausedBy: number
  /** Lien PC ↔ serveur : 'reconnecting' affiche la surcouche « reconnexion ». */
  hostLink: HostLink
}

export const useUi = create<UiState>(() => ({
  screen: 'loading',
  overlay: null,
  loading: { progress: 0, labelKey: 'host.loading.start' },
  titleMenuOpen: false,
  paused: false,
  pausedBy: -1,
  hostLink: 'ok',
}))

// ─── Joueurs (salon, HUD, résultats) ───────────────────────────────────────

/** Personnalités de bots (GDD §14.2). L'Horloger n'existe qu'aux niveaux 1 et 2. */
export type BotPersonality = 'falcon' | 'ploughman' | 'magpie' | 'nomad' | 'lookout' | 'fool' | 'watchmaker'
export const BOT_PERSONALITIES: readonly BotPersonality[] = ['falcon', 'ploughman', 'magpie', 'nomad', 'lookout', 'fool', 'watchmaker']

/** Niveaux de bots : 0 Oisillon, 1 Voyageur, 2 Seigneur des sables (index des tableaux RULES.bot*). */
export type BotLevel = 0 | 1 | 2
export const BOT_LEVELS: readonly BotLevel[] = [0, 1, 2]

/** Micro-objectifs du salon (GDD §15.2). */
export interface LobbyGoals {
  fly: boolean
  dive: boolean
  strike: boolean
}

export interface SlotVM {
  /** 0..11, identité stable pendant la partie. */
  slot: number
  /** Index dans PLAYER_COLORS. */
  colorIndex: number
  /** Nom choisi sur le téléphone ; vide = on affiche le nom de la couleur (bots : « Jade · Faucon »). */
  name: string
  kind: PlayerKind
  /** Présent si kind === 'bot'. */
  bot?: { personality: BotPersonality; level: BotLevel }
  /** Téléphone connecté (toujours vrai pour clavier et bots). */
  connected: boolean
  /** A tapé « Prêt » sur son téléphone (salon, entre les manches). */
  ready: boolean
  goals: LobbyGoals
  /** Aide au vol activée (icône plume à côté du nom). */
  assist: boolean
  /** Bot remplaçant d'un humain déconnecté (garde sa couleur, rend la main à la reconnexion). */
  substitute: boolean
  /** Clavier partagé : groupe de touches (1 = ZQSD/WASD, 2 = IJKL). */
  keyboardGroup?: 1 | 2
  /** Premier humain : peut lancer la partie depuis son téléphone. */
  host?: boolean
}

export interface RosterState {
  /** Joueurs présents, dans l'ordre d'arrivée (≤ 12). */
  slots: SlotVM[]
}

export const useRoster = create<RosterState>(() => ({ slots: [] }))

export const NO_GOALS: Readonly<LobbyGoals> = Object.freeze({ fly: false, dive: false, strike: false })

// ─── Salon ─────────────────────────────────────────────────────────────────

export type RoundLength = keyof typeof RULES.roundLengthPresets
export type RoundsOption = (typeof RULES.roundsOptions)[number]

export interface MatchSettingsVM {
  rounds: RoundsOption
  length: RoundLength
  /** Niveau appliqué aux bots ajoutés (et à tous les bots quand on le change). */
  botLevel: BotLevel
  /** La dernière manche compte double (GDD §11.1). */
  lastRoundDouble: boolean
}

export type LobbyConnection = 'connecting' | 'online' | 'offline'

export interface LobbyState {
  /** Code de salle (4 lettres, ROOM_ALPHABET), null tant que le serveur n'a pas répondu. */
  roomCode: string | null
  /** URL complète encodée dans le QR (ex. http://192.168.1.16:8787/play?r=KX4P). */
  joinUrl: string | null
  connection: LobbyConnection
  match: MatchSettingsVM
  /** Au moins un joueur au clavier a rejoint : les flèches pilotent son oiseau, l'UI ne s'en sert plus. */
  keyboardJoined: boolean
}

export const DEFAULT_MATCH: Readonly<MatchSettingsVM> = Object.freeze({
  rounds: RULES.roundsDefault as RoundsOption,
  length: 'normal',
  botLevel: 1,
  lastRoundDouble: true,
})

export const useLobby = create<LobbyState>(() => ({
  roomCode: null,
  joinUrl: null,
  connection: 'connecting',
  match: { ...DEFAULT_MATCH },
  keyboardJoined: false,
}))

// ─── Cartes des règles ─────────────────────────────────────────────────────

export interface RulesCardsState {
  /** Instant (performance.now, ms) de fin automatique ; null = pas de minuterie. */
  deadline: number | null
  /** Téléphones qui ont tapé OK / humains présents. */
  okCount: number
  humanCount: number
}

export const useRulesCards = create<RulesCardsState>(() => ({ deadline: null, okCount: 0, humanCount: 0 }))

// ─── HUD ───────────────────────────────────────────────────────────────────

export interface ShareVM {
  slot: number
  /** Cellules possédées (grid.counts[slot + 1]). */
  cells: number
}

/** Flèche d'indication d'une bannière (effet `HintEffect` du directeur des indications). */
export type BannerArrow = 'northSouth' | 'east'

export interface BannerVM {
  id: number
  /** Clé i18n du titre (ex. 'host.phase.golden'). */
  key: string
  /** Clé i18n d'une ligne secondaire (indication « à tous »), optionnelle. */
  subKey?: string
  params?: Record<string, string | number>
  /** Ton : 'phase' (case papier) ou 'alert' (inversion encre, ex. dernière manche). */
  tone: 'phase' | 'alert'
  /** 'strip' : bandeau fin sous la bande de sable (hors de l'arène) ; défaut : case centrale. */
  layout?: 'case' | 'strip'
  /** Flèche dessinée dans la bannière (↕ heure dorée, → Grande Ombre). */
  arrow?: BannerArrow
}

export interface SubtitleVM {
  id: number
  /** Clé i18n de la réplique (ex. 'narrator.leadChange.1') : le texte suit la langue. */
  key?: string
  /** Ou texte déjà localisé. Dans les deux cas, `{color}` est remplacé par le nom stylé. */
  text?: string
  /** Couleur désignée par la réplique (index PLAYER_COLORS), null si aucune. */
  colorIndex: number | null
}

export interface HintVM {
  id: number
  /** Oiseau qui porte la bulle (la pointe le désigne). */
  slot: number
  /**
   * Joueurs concernés (slot en premier) : une même indication arrivée pour
   * plusieurs joueurs à moins de HINT_MERGE_MS forme UNE bulle, avec leurs jetons.
   */
  slots: number[]
  key: string
  params?: Record<string, string | number>
  /** performance.now (ms) d'apparition et de fin. */
  at: number
  until: number
}

export type ToastTone = 'info' | 'alert'

export interface ToastVM {
  id: number
  key: string
  params?: Record<string, string | number>
  /** Joueur concerné (pastille), -1 = aucun. */
  slot: number
  tone: ToastTone
}

export interface GainVM {
  id: number
  slot: number
  /** Part de l'arène gagnée (0..1), affichée « +2,4 % ». */
  frac: number
  /** Position écran (px CSS du viewport) au moment de l'événement. */
  x: number
  y: number
}

export interface HudState {
  round: number
  rounds: number
  /** Manche courante comptée double. */
  doubleRound: boolean
  phase: RoundPhase
  /** Avancée du soleil en temps, 0..1 (SunState.u) : position du disque sur le cadran. */
  sunU: number
  /** Horloge de palette (SunState.paletteElevDeg) : couleur du ciel du cadran. */
  paletteElevDeg: number
  /** Compte à rebours de départ : 3, 2, 1, 0 = « Envol ! », null sinon. */
  countdown: number | null
  /** « 5 4 3 2 1 » de fin, null sinon. */
  lastSeconds: number | null
  shares: ShareVM[]
  arenaCells: number
  crownSlot: number
  /** Flash du segment d'un gros voleur (id change à chaque flash). */
  flash: { slot: number; id: number } | null
  banner: BannerVM | null
  subtitle: SubtitleVM | null
  hints: HintVM[]
  toasts: ToastVM[]
  gains: GainVM[]
  /** Étiquettes de nom : instant (performance.now, ms) jusqu'auquel l'étiquette du slot est visible. */
  tagsUntil: number[]
  /** Étiquettes qui pulsent (COUP D'AILE au départ : « où suis-je ? ») : instant de fin par slot. */
  tagPulseUntil: number[]
}

const emptyTags = (): number[] => Array.from({ length: 12 }, () => 0)

export const useHud = create<HudState>(() => ({
  round: 1,
  rounds: RULES.roundsDefault,
  doubleRound: false,
  phase: 'countdown',
  sunU: 0,
  paletteElevDeg: 80,
  countdown: null,
  lastSeconds: null,
  shares: [],
  arenaCells: 1,
  crownSlot: -1,
  flash: null,
  banner: null,
  subtitle: null,
  hints: [],
  toasts: [],
  gains: [],
  tagsUntil: emptyTags(),
  tagPulseUntil: emptyTags(),
}))

/** Au plus deux bulles d'indication à la fois sur la TV (le téléphone reçoit toujours son message). */
export const HINT_MAX_BUBBLES = 2
/** Une même indication arrivée à moins de 2 s d'intervalle forme une seule bulle (jetons des joueurs). */
export const HINT_MERGE_MS = 2000
/** Une bulle affichée depuis au moins ce temps peut céder sa place à une nouvelle. */
const HINT_MIN_SHOWN_MS = 1200
/** Fenêtre après « Envol ! » où un COUP D'AILE fait pulser l'étiquette du joueur. */
export const FLAP_FIND_MS = 5000

/**
 * Positions écran des oiseaux, écrites par le runner À CHAQUE FRAME (après le
 * rendu de la caméra), lues par l'UI dans sa boucle rAF. Coordonnées en px CSS
 * du viewport (0,0 en haut à gauche), même hors de l'écran (les flèches s'en servent).
 */
export interface BirdAnchor {
  active: boolean
  /** Point d'ancrage de l'étiquette (sous l'oiseau), px CSS du viewport. */
  x: number
  y: number
  /** Le point est derrière la caméra (projection inversée) : flèche seulement. */
  behind: boolean
  /** Oiseau caché (ombre de tour / nuit) : étiquette en contour seul. */
  hidden: boolean
}

export const hudAnchors: { birds: BirdAnchor[] } = {
  birds: Array.from({ length: 12 }, () => ({ active: false, x: 0, y: 0, behind: false, hidden: false })),
}

// ─── Résultats de manche ───────────────────────────────────────────────────

export interface RoundRowVM {
  slot: number
  /** Part du désert (0..1) à la nuit. */
  share: number
  cells: number
  /** 1 = premier ; ex æquo au même rang. */
  rank: number
  /** Soleils gagnés cette manche (déjà multipliés si manche double). */
  suns: number
  /** Total de soleils après cette manche. */
  totalSuns: number
}

export type RoundFactKind = 'bigSteal' | 'lastRay' | 'comeback' | 'mirage' | 'hunter' | 'dodger' | 'photoFinish' | 'landslide'

/** Le fait marquant de la manche (au plus un). `value` : fraction d'arène, compte ou écart selon `kind`. */
export interface RoundFactVM {
  kind: RoundFactKind
  slot: number
  value: number
}

export interface RoundResultsState {
  round: number
  rounds: number
  double: boolean
  mapId: MapId
  /** Carte de la manche suivante (annoncée), null si c'était la dernière. */
  nextMapId: MapId | null
  /** Trié par rang. */
  rows: RoundRowVM[]
  tie: boolean
  fact: RoundFactVM | null
  /** Passage automatique à la manche suivante (performance.now, ms), null sinon. */
  deadline: number | null
  readyCount: number
  humanCount: number
}

export const useRoundResults = create<RoundResultsState>(() => ({
  round: 1,
  rounds: 3,
  double: false,
  mapId: 'parasols',
  nextMapId: null,
  rows: [],
  tie: false,
  fact: null,
  deadline: null,
  readyCount: 0,
  humanCount: 0,
}))

// ─── Résultats de partie ───────────────────────────────────────────────────

/** Les 12 titres (GDD §11.4) + « souverain », repli du vainqueur sans titre (polish G10) ; clés i18n `titles.<id>.name|desc|stat`. */
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
  | 'souverain'

export const TITLE_IDS: readonly TitleId[] = ['rapace', 'gibier', 'anguille', 'kamikaze', 'pilleur', 'raseMottes', 'nuage', 'batisseur', 'notaire', 'dernierRayon', 'lezard', 'revenant', 'souverain']

/** Unité du chiffre d'un titre : compte, fraction (affichée en %), secondes, places. */
export type TitleUnit = 'count' | 'frac' | 'seconds' | 'places'
export const TITLE_UNITS: Readonly<Record<TitleId, TitleUnit>> = {
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

/** Statistiques de partie d'un joueur (cumulées sur les manches). */
export interface MatchStatsVM {
  hits: number
  gotHit: number
  dodges: number
  misses: number
  /** Sable pris aux autres, en fraction d'arène cumulée. */
  stolenFrac: number
  /** Part du temps passée en bas (0..1). */
  lowFrac: number
  hiddenSeconds: number
  roundsWon: number
}

export interface MatchRowVM {
  slot: number
  rank: number
  suns: number
  /** Territoire cumulé (somme des parts, départage). */
  totalShare: number
  title: { id: TitleId; value: number } | null
  stats: MatchStatsVM
  /** A voté la revanche. */
  votedRematch: boolean
}

export interface MatchResultsState {
  /** Trié par rang. */
  rows: MatchRowVM[]
  /** Plusieurs vainqueurs à égalité parfaite (« Le désert refuse de choisir »). */
  coWinners: boolean
  rematch: { votes: number; humans: number; deadline: number | null }
}

export const useMatchResults = create<MatchResultsState>(() => ({
  rows: [],
  coWinners: false,
  rematch: { votes: 0, humans: 0, deadline: null },
}))

// ─── Actions (implémentées par le runner) ──────────────────────────────────

export interface UiActions {
  /** Titre → salon : créer ou reprendre la salle. Défaut : change d'écran. */
  play(): void
  /** Ouvre / ferme les réglages (surcouche). Défaut : UI seule. */
  openSettings(): void
  closeSettings(): void
  /** Titre → crédits. Défaut : UI seule. */
  openCredits(): void
  /** Retour contextuel (Échap / B) : crédits → titre, salon → titre. Défaut : UI seule. */
  back(): void

  /** Salon : lancer la partie (cartes des règles puis manche 1). */
  startMatch(): void
  /** Ajoute un bot ; personality null = la première personnalité absente (GDD §14.3). */
  addBot(personality: BotPersonality | null, level: BotLevel): void
  removeBot(slot: number): void
  setBotLevel(slot: number, level: BotLevel): void
  setBotPersonality(slot: number, personality: BotPersonality): void
  setMatchSetting<K extends keyof MatchSettingsVM>(key: K, value: MatchSettingsVM[K]): void
  /** Bouton « Jouer au clavier » (même effet que la touche PLONGER du groupe 1). */
  joinKeyboard(): void

  /** Cartes des règles : passer. */
  skipRules(): void

  pause(): void
  resume(): void
  /** Abandonne la partie en cours et revient au salon (joueurs et bots gardés). */
  quitToLobby(): void
  /** Résultats de manche : manche suivante sans attendre. */
  continueResults(): void
  /** Résultats de partie : vote / lancement de la revanche depuis le PC (Entrée). */
  rematch(): void

  /** Plein écran (touche F). Défaut : API Fullscreen du navigateur. */
  toggleFullscreen(): void
}

const setScreen = (screen: ScreenId): void => useUi.setState({ screen, overlay: null })

/** Implémentations par défaut : navigation pure UI, et journal pour le reste. */
const defaultActions: UiActions = {
  play: () => setScreen('lobby'),
  openSettings: () => useUi.setState({ overlay: 'settings' }),
  closeSettings: () => useUi.setState({ overlay: null }),
  openCredits: () => setScreen('credits'),
  back: () => {
    const { screen, overlay } = useUi.getState()
    if (overlay) useUi.setState({ overlay: null })
    else if (screen === 'credits' || screen === 'lobby') {
      setScreen('title')
      useUi.setState({ titleMenuOpen: true })
    }
  },
  startMatch: () => console.info('[ui] startMatch (non branché)'),
  addBot: (p, l) => console.info('[ui] addBot', p, l),
  removeBot: s => console.info('[ui] removeBot', s),
  setBotLevel: (s, l) => console.info('[ui] setBotLevel', s, l),
  setBotPersonality: (s, p) => console.info('[ui] setBotPersonality', s, p),
  setMatchSetting: (key, value) => useLobby.setState(st => ({ match: { ...st.match, [key]: value } })),
  joinKeyboard: () => console.info('[ui] joinKeyboard (non branché)'),
  skipRules: () => setScreen('game'),
  pause: () => useUi.setState({ paused: true, pausedBy: -1 }),
  resume: () => useUi.setState({ paused: false, overlay: null }),
  quitToLobby: () => {
    useUi.setState({ paused: false })
    setScreen('lobby')
  },
  continueResults: () => console.info('[ui] continueResults (non branché)'),
  rematch: () => console.info('[ui] rematch (non branché)'),
  toggleFullscreen: () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen()
      else void document.documentElement.requestFullscreen({ navigationUI: 'hide' })
    } catch {
      // plein écran refusé (iframe, navigateur) : sans effet
    }
  },
}

/** Actions courantes. L'UI appelle toujours `uiActions.x()` (jamais une copie). */
export const uiActions: UiActions = { ...defaultActions }

/**
 * Branche les implémentations du runner. Les clés absentes gardent le défaut.
 * Retourne une fonction qui rétablit les défauts.
 */
export function setUiActions(impl: Partial<UiActions>): () => void {
  Object.assign(uiActions, impl)
  return () => Object.assign(uiActions, defaultActions)
}

// ─── Aides d'écriture (runner, directeur, audio) ───────────────────────────

let nextId = 1
const later = (ms: number, fn: () => void): void => {
  setTimeout(fn, ms)
}

/** Libellé de chargement + progression réelle (0..1). */
export function setLoading(progress: number, labelKey?: string): void {
  useUi.setState(s => ({ loading: { progress: Math.min(1, Math.max(0, progress)), labelKey: labelKey ?? s.loading.labelKey } }))
}

export function setScreenState(screen: ScreenId): void {
  setScreen(screen)
}

/** Bannière de phase / d'annonce (RULES.phaseBannerSeconds par défaut). */
export function showBanner(
  key: string,
  opts: { subKey?: string; params?: Record<string, string | number>; tone?: BannerVM['tone']; seconds?: number; layout?: BannerVM['layout']; arrow?: BannerArrow } = {},
): void {
  const id = nextId++
  useHud.setState({ banner: { id, key, subKey: opts.subKey, params: opts.params, tone: opts.tone ?? 'phase', layout: opts.layout, arrow: opts.arrow } })
  later((opts.seconds ?? RULES.phaseBannerSeconds) * 1000, () => {
    if (useHud.getState().banner?.id === id) useHud.setState({ banner: null })
  })
}

/**
 * Sous-titre du narrateur (cartouche « récitatif »), RULES.subtitleSeconds par
 * défaut ; passer la durée du clip audio si elle est plus longue.
 */
export function showSubtitle(sub: { key?: string; text?: string; colorIndex?: number | null; seconds?: number }): void {
  const id = nextId++
  useHud.setState({ subtitle: { id, key: sub.key, text: sub.text, colorIndex: sub.colorIndex ?? null } })
  later((sub.seconds ?? RULES.subtitleSeconds) * 1000, () => {
    if (useHud.getState().subtitle?.id === id) useHud.setState({ subtitle: null })
  })
}

/**
 * Signature d'une indication : le texte affiché (deux joueurs peuvent recevoir la même phrase
 * avec des paramètres différents, ex. libellés de touches non utilisés par cette phrase).
 */
const hintSig = (key: string, params?: Record<string, string | number>): string => t(key, params)

/** Retire les bulles expirées ; se reprogramme tant qu'il en reste. */
let hintSweep: ReturnType<typeof setTimeout> | undefined
function scheduleHintSweep(): void {
  clearTimeout(hintSweep)
  const hints = useHud.getState().hints
  if (!hints.length) return
  const next = Math.min(...hints.map(h => h.until))
  hintSweep = setTimeout(
    () => {
      const now = performance.now()
      useHud.setState(s => ({ hints: s.hints.filter(h => h.until > now + 5) }))
      scheduleHintSweep()
    },
    Math.max(16, next - performance.now()),
  )
}

/**
 * Bulle d'indication à la couleur du joueur, près de son oiseau (GDD §15.4).
 * - une bulle par joueur (la nouvelle remplace l'ancienne) ;
 * - même texte déjà affiché, ou apparu il y a moins de HINT_MERGE_MS : le joueur
 *   rejoint cette bulle (son jeton s'y ajoute) au lieu d'en ouvrir une seconde ;
 * - au plus HINT_MAX_BUBBLES bulles : la plus ancienne cède sa place si elle a été
 *   lue (HINT_MIN_SHOWN_MS), sinon la nouvelle n'apparaît que sur le téléphone.
 */
export function showHint(slot: number, key: string, params?: Record<string, string | number>, seconds = 4.5): void {
  const now = performance.now()
  const sig = hintSig(key, params)
  const cur = removeSlotFromHints(useHud.getState().hints, slot)
  const same = cur.find(h => hintSig(h.key, h.params) === sig && (h.until > now || now - h.at < HINT_MERGE_MS))
  let hints: HintVM[]
  if (same) {
    const merged: HintVM = { ...same, slots: [...same.slots, slot], until: Math.max(same.until, now + HINT_MERGE_MS) }
    hints = cur.map(h => (h === same ? merged : h))
  } else {
    hints = cur
    if (hints.length >= HINT_MAX_BUBBLES) {
      const oldest = hints.reduce((a, b) => (b.at < a.at ? b : a))
      if (now - oldest.at < HINT_MIN_SHOWN_MS) {
        if (hints !== useHud.getState().hints) useHud.setState({ hints })
        return
      }
      hints = hints.filter(h => h !== oldest)
    }
    hints = [...hints, { id: nextId++, slot, slots: [slot], key, params, at: now, until: now + seconds * 1000 }]
    showTag(slot, seconds)
  }
  useHud.setState({ hints })
  scheduleHintSweep()
}

/** Retire un joueur des bulles : la sienne disparaît, il quitte celles qu'il partage. */
function removeSlotFromHints(hints: HintVM[], slot: number, key?: string): HintVM[] {
  let changed = false
  const out: HintVM[] = []
  for (const h of hints) {
    if ((key && h.key !== key) || !h.slots.includes(slot)) {
      out.push(h)
      continue
    }
    changed = true
    const rest = h.slots.filter(s => s !== slot)
    if (rest.length) out.push({ ...h, slot: rest[0]!, slots: rest })
  }
  return changed ? out : hints
}

/** Retire la bulle `key` (toutes si absent) d'un joueur : l'indication n'a plus d'objet. */
export function dismissHint(slot: number, key?: string): void {
  const cur = useHud.getState().hints
  const next = removeSlotFromHints(cur, slot, key)
  if (next !== cur) useHud.setState({ hints: next })
}

/** Toast d'événement de session (connexion, remplaçant…). Visible sur tous les écrans. */
export function pushToast(key: string, opts: { params?: Record<string, string | number>; slot?: number; tone?: ToastTone; seconds?: number } = {}): void {
  const id = nextId++
  useHud.setState(s => ({ toasts: [...s.toasts.slice(-3), { id, key, params: opts.params, slot: opts.slot ?? -1, tone: opts.tone ?? 'info' }] }))
  later((opts.seconds ?? 4) * 1000, () => useHud.setState(s => ({ toasts: s.toasts.filter(t => t.id !== id) })))
}

/** « +2,4 % » qui s'envole au-dessus d'un point (px CSS du viewport). */
export function popGain(slot: number, frac: number, x?: number, y?: number): void {
  const a = hudAnchors.birds[slot]
  const px = x ?? a?.x ?? 0
  const py = y ?? (a ? a.y - 60 : 0)
  if (x === undefined && (!a || !a.active || a.behind)) return
  const id = nextId++
  useHud.setState(s => ({ gains: [...s.gains.slice(-7), { id, slot, frac, x: px, y: py }] }))
  later(1000, () => useHud.setState(s => ({ gains: s.gains.filter(g => g.id !== id) })))
}

/** Montre l'étiquette de nom d'un joueur pendant `seconds`. */
export function showTag(slot: number, seconds = 3): void {
  if (slot < 0 || slot > 11) return
  const until = performance.now() + seconds * 1000
  useHud.setState(s => {
    if (s.tagsUntil[slot] >= until) return s
    const tagsUntil = s.tagsUntil.slice()
    tagsUntil[slot] = until
    return { tagsUntil }
  })
}

/** Fait pulser l'étiquette d'un joueur (et la montre) pendant `seconds`. */
export function pulseTag(slot: number, seconds = 2): void {
  if (slot < 0 || slot > 11) return
  showTag(slot, seconds)
  const until = performance.now() + seconds * 1000
  useHud.setState(s => {
    const tagPulseUntil = s.tagPulseUntil.slice()
    tagPulseUntil[slot] = until
    return { tagPulseUntil }
  })
}

/** Toutes les étiquettes (début de manche : RULES.nameTagSeconds). */
export function showAllTags(seconds: number = RULES.nameTagSeconds): void {
  const until = performance.now() + seconds * 1000
  useHud.setState({ tagsUntil: emptyTags().map(() => until) })
}

/** Remet le HUD à zéro au début d'une manche. */
export function resetHud(round: number, rounds: number, doubleRound: boolean): void {
  useHud.setState({
    round,
    rounds,
    doubleRound,
    phase: 'countdown',
    sunU: 0,
    paletteElevDeg: RULES.sunElevStartDeg,
    countdown: null,
    lastSeconds: null,
    shares: [],
    crownSlot: -1,
    flash: null,
    banner: null,
    subtitle: null,
    hints: [],
    gains: [],
    tagsUntil: emptyTags(),
    tagPulseUntil: emptyTags(),
  })
}

// ─── Dérivation depuis la simulation ───────────────────────────────────────

let lastHudSync = -Infinity

/** Bulle « esquive » (COUP D'AILE) : retirée dès que le piqué est résolu. */
const DODGE_HINT_KEY = 'hints.dodge'

/**
 * À appeler à chaque tick (ou frame) par le runner : recopie soleil, parts et
 * couronne dans le store HUD, au plus 10 fois par seconde.
 */
export function hudFromSim(state: SimState, force = false): void {
  const now = performance.now()
  if (!force && now - lastHudSync < 100) return
  lastHudSync = now
  const shares: ShareVM[] = []
  for (const b of state.birds) shares.push({ slot: b.slot, cells: state.grid.counts[b.slot + 1] ?? 0 })
  useHud.setState({
    phase: state.sun.phase,
    sunU: state.sun.u,
    paletteElevDeg: state.sun.paletteElevDeg,
    shares,
    arenaCells: Math.max(1, state.grid.arenaCells),
    crownSlot: state.crownSlot,
  })
}

/** Grande Ombre : bandeau bref, la nuit qui avance reste le sujet (au plus 2,5 s). */
const GREAT_SHADOW_BANNER_SECONDS = 2.5

/**
 * Bannières de phase (les indications « à tous » viennent du domaine hints, avec
 * leur effet : flèche nord-sud à l'heure dorée, vers l'est à la Grande Ombre).
 */
const PHASE_BANNERS: Partial<Record<RoundPhase, { key: string; subKey?: string; tone?: BannerVM['tone']; layout?: BannerVM['layout']; arrow?: BannerArrow; seconds?: number }>> = {
  afternoon: { key: 'host.phase.afternoon' },
  golden: { key: 'host.phase.golden', subKey: 'host.phaseHint.golden', arrow: 'northSouth', seconds: RULES.phaseBannerSeconds + 1.5 },
  sunset: { key: 'host.phase.sunset' },
  greatShadow: { key: 'host.phase.greatShadow', subKey: 'host.phaseHint.greatShadow', tone: 'alert', layout: 'strip', arrow: 'east', seconds: GREAT_SHADOW_BANNER_SECONDS },
}

/** Instant (performance.now) de « Envol ! » : fenêtre du COUP D'AILE qui montre son oiseau. */
let goAt = -Infinity

/**
 * Abonne le HUD aux événements de simulation : compte à rebours, bannières de
 * phase, 5 dernières secondes, flash de gros vol, « +x % », étiquettes lors des
 * événements. Retourne la fonction de désabonnement.
 */
export function connectHudEvents(bus: Emitter<SimEvent> = simEvents): () => void {
  let countdownClear = 0
  return bus.on(e => {
    switch (e.type) {
      case 'countdown': {
        useHud.setState({ countdown: e.n })
        if (e.n === 3) showAllTags(RULES.countdownSeconds + RULES.nameTagSeconds)
        if (e.n === 0) goAt = performance.now()
        const my = ++countdownClear
        if (e.n === 0) later(900, () => my === countdownClear && useHud.setState({ countdown: null }))
        break
      }
      case 'phase': {
        useHud.setState({ phase: e.phase })
        const b = PHASE_BANNERS[e.phase]
        if (b) showBanner(b.key, { subKey: b.subKey, tone: b.tone, layout: b.layout, arrow: b.arrow, seconds: b.seconds })
        if (e.phase === 'night' || e.phase === 'over') useHud.setState({ lastSeconds: null, banner: null })
        break
      }
      case 'lastSeconds':
        useHud.setState({ lastSeconds: e.n })
        later(1000, () => useHud.getState().lastSeconds === e.n && e.n === 1 && useHud.setState({ lastSeconds: null }))
        break
      case 'bigSteal': {
        useHud.setState({ flash: { slot: e.slot, id: nextId++ } })
        popGain(e.slot, e.frac)
        showTag(e.slot)
        break
      }
      case 'diveHit': {
        const cells = useHud.getState().arenaCells
        if (e.stolenCells > 0) popGain(e.hunter, e.stolenCells / cells)
        showTag(e.hunter)
        showTag(e.target)
        dismissHint(e.target, DODGE_HINT_KEY)
        break
      }
      case 'diveMiss':
        showTag(e.hunter, 2)
        dismissHint(e.target, DODGE_HINT_KEY)
        break
      case 'diveCancel':
        dismissHint(e.target, DODGE_HINT_KEY)
        break
      case 'flap':
        // « Où est mon oiseau ? » : un COUP D'AILE juste après l'envol fait pulser son étiquette.
        if (performance.now() - goAt < FLAP_FIND_MS) pulseTag(e.slot, 1.6)
        break
      case 'crown':
        if (e.slot >= 0) showTag(e.slot)
        useHud.setState({ crownSlot: e.slot })
        break
      case 'night':
        useHud.setState({ lastSeconds: null })
        break
      default:
        break
    }
  })
}
