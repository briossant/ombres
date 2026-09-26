// Messages applicatifs échangés entre le PC (hôte) et les téléphones.
// Le serveur les relaie sans les lire (src/shared/protocol.ts). Toute évolution se fait ici,
// en incrémentant PROTOCOL_VERSION si un ancien téléphone ne peut plus comprendre le PC :
// un téléphone qui reçoit une vue d'une autre version se recharge tout seul (même salle, même id).
//
//   téléphone ──PhoneToHost──▶ PC       PC ──HostToPhone──▶ téléphone
//
// Propriétaire : agent net-phone (docs/agent-notes/net-phone.md).
import type { Lang } from './protocol.ts'

export const PROTOCOL_VERSION = 2

// ─── Téléphone → PC ────────────────────────────────────────────────────────

/** Boutons de la manette (bitmask du champ `b`). */
export const BTN_DIVE = 1 // PLONGER (maintenu = bas ; devient PIQUER quand une cible est verrouillée)
export const BTN_FLAP = 2 // COUP D'AILE (appui)

/**
 * Type de contrôle (GDD §12.1).
 * - absolute : le joystick donne un cap absolu à l'écran (haut = nord = haut de la TV) ;
 * - relative : l'axe X du joystick tourne à gauche / à droite, comme un volant ;
 * - tilt : le vecteur d'inclinaison du téléphone donne le cap (converti en x, y par le téléphone).
 */
export type ControlScheme = 'absolute' | 'relative' | 'tilt'
export const CONTROL_SCHEMES: readonly ControlScheme[] = ['absolute', 'relative', 'tilt']

/**
 * Entrée de manette. Envoyée à RULES.inputSendHz quand elle change, immédiatement sur un appui
 * ou un relâché de bouton, et en battement à 1 Hz sinon.
 */
export interface PhoneInput {
  k: 'in'
  /** Numéro de séquence croissant (repart de 0 si la page du téléphone est rechargée). */
  seq: number
  /**
   * Vecteur de pilotage dans le disque unité, repère de l'écran du téléphone
   * (x > 0 = droite, y > 0 = haut). En mode tilt : déjà converti depuis l'inclinaison.
   * Brut : la zone morte (RULES.stickDeadzone) est appliquée par la simulation.
   */
  x: number
  y: number
  /** Boutons maintenus (bitmask BTN_*). */
  b: number
  /** Compteurs monotones d'appuis (PLONGER, COUP D'AILE) : un appui bref n'est jamais perdu. */
  d: number
  f: number
}

/** Capacités de l'appareil, pour le PC (statistiques, décisions d'interface). */
export interface PhoneCaps {
  vibrate: boolean
  tilt: boolean
  ios: boolean
}

/**
 * Envoyé par le téléphone à chaque (re)connexion et quand le PC le demande (`who`) :
 * préférences locales, que le PC applique si le joueur n'a pas encore de profil.
 */
export interface PhoneHello {
  k: 'hello'
  v: number
  /** Nom mémorisé sur ce téléphone (suggestion), null si aucun. */
  name: string | null
  /** Couleur préférée (index PLAYER_COLORS), null si aucune. */
  color: number | null
  scheme: ControlScheme
  assist: boolean
  /** Langue du navigateur du téléphone (information : le téléphone suit la langue du PC). */
  lang: Lang
  caps: PhoneCaps
  /**
   * Indications contextuelles déjà vues sur ce téléphone (clés `hints.*`, mémorisées en localStorage) :
   * le réglage « Conseils : Auto » suit le joueur d'un PC à l'autre (GDD §15.4).
   */
  seenHints?: string[]
}

export type PhoneAction =
  | 'start' // lancer la partie (meneur, lobby)
  | 'rematch' // voter la revanche (fin de partie)
  | 'toLobby' // voter le retour au salon (fin de partie)
  | 'pause' // appui long sur pause (manette)
  | 'resume' // reprendre (surcouche de pause)

export type PhoneToHost =
  | PhoneInput
  | PhoneHello
  /** Choix du nom et de la couleur (index), color null = laisser le PC choisir. */
  | { k: 'profile'; name: string; color: number | null }
  /** Prêt (entre les manches, cartes des règles). */
  | { k: 'ready'; ready: boolean }
  | { k: 'scheme'; scheme: ControlScheme }
  /** Aide au vol (GDD §12.1). */
  | { k: 'assist'; on: boolean }
  | { k: 'action'; action: PhoneAction }
  /** RTT téléphone ↔ serveur mesuré par le téléphone (ms), pour la grâce de latence (GDD §8.6). */
  | { k: 'net'; rtt: number }

export const NAME_MAX_LENGTH = 14

/** Nettoie un nom saisi : espaces normalisés, caractères de contrôle retirés, longueur bornée. */
export function sanitizeName(raw: string): string {
  const clean = raw.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2066-\u2069]/g, '')
  return [...clean.replace(/\s+/g, ' ').trim()].slice(0, NAME_MAX_LENGTH).join('')
}

// ─── PC → téléphone ────────────────────────────────────────────────────────

/** Écran que le téléphone doit afficher. La pause est une surcouche (`paused`), pas un écran. */
export type PhoneScreen =
  | 'lobby' // choix nom/couleur puis salon jouable (micro-objectifs, cartes, lancement)
  | 'intro' // les 3 cartes des règles avant la première manche (OK pour passer)
  | 'play' // manette (compte à rebours compris)
  | 'roundEnd' // entre deux manches : stats perso + Prêt
  | 'matchEnd' // fin de partie : titre, Revanche / Salon
  | 'spectate' // arrivé en cours de partie : joue à la prochaine manche

export interface PhoneYou {
  slot: number
  name: string
  /** Index dans PLAYER_COLORS. */
  color: number
  /** Premier joueur humain : lance la partie depuis son téléphone. */
  leader: boolean
  /** Le joueur a validé son nom et sa couleur (sinon le téléphone affiche l'écran de profil). */
  profileSet: boolean
  ready: boolean
  assist: boolean
  scheme: ControlScheme
}

export interface LobbyGoals {
  fly: boolean
  dive: boolean
  strike: boolean
}

export interface LobbyInfo {
  /** Couleurs prises par les autres joueurs et les bots. */
  taken: number[]
  goals: LobbyGoals
  /** Le meneur peut lancer maintenant. */
  canStart: boolean
  /** Nom du meneur (pour « En attente de … »), null si c'est toi ou personne. */
  leaderName: string | null
  humans: number
  bots: number
  rounds: number
  /** La dernière manche compte double. */
  lastDouble: boolean
}

export type MapKey = 'parasols' | 'aiguilles' | 'geantes' | 'cadran' | 'lobby'

export interface IntroInfo {
  round: number
  rounds: number
  map: MapKey
  double: boolean
  /** Joueurs ayant tapé OK / total des téléphones. */
  ok: number
  total: number
  /** Secondes restantes avant la suite, au moment de l'envoi (null = pas de limite). */
  deadlineIn: number | null
}

export interface PlayInfo {
  round: number
  rounds: number
  map: MapKey
  double: boolean
}

export interface PlayerTag {
  name: string
  color: number
}

export interface RoundStatsView {
  hits: number
  gotHit: number
  dodges: number
  misses: number
  /** Part de l'arène prise aux autres (repeint + traînées), 0..1. */
  stolen: number
  /** Part du temps passée en bas (FORT), 0..1. */
  lowFrac: number
  /** Temps caché (s). */
  hidden: number
}

export interface RoundEndInfo {
  round: number
  rounds: number
  /** Rang de manche (1 = premier) sur `of` oiseaux ; part finale (0..1). */
  rank: number
  of: number
  share: number
  /** Soleils gagnés cette manche, total de la partie, et rang au total. */
  suns: number
  total: number
  totalRank: number
  winner: PlayerTag | null
  stats: RoundStatsView
  /** Mention éventuelle (clé i18n + paramètres), ex. plus gros vol. */
  mention: { key: string; params?: ToastParams } | null
  readyCount: number
  readyTotal: number
  deadlineIn: number | null
  /** La manche suivante est la dernière (compte double). */
  nextDouble: boolean
}

export type Vote = 'rematch' | 'toLobby'

export interface MatchEndInfo {
  rank: number
  of: number
  suns: number
  /** Vainqueur(s) : plusieurs en cas de co-victoire. */
  winners: PlayerTag[]
  /**
   * Titre gagné, null si aucun : clé i18n (domaine titles), valeur affichée (« 4 piqués »),
   * et libellé déjà traduit par le PC, utilisé si la clé manque côté téléphone.
   */
  title: { key: string; value?: string; label?: string } | null
  podium: (PlayerTag & { suns: number })[]
  vote: { rematch: number; toLobby: number; humans: number; mine: Vote | null; deadlineIn: number | null }
}

export interface PauseInfo {
  /** Qui a mis en pause (null = l'écran PC). */
  by: PlayerTag | null
  canResume: boolean
}

export interface PhoneView {
  k: 'view'
  v: number
  screen: PhoneScreen
  lang: Lang
  you: PhoneYou
  paused: PauseInfo | null
  /** Mode daltonien du PC : glyphe en grand dans le bandeau, trame sur le lavis (ART_BIBLE §3.5). */
  colorblind?: boolean
  lobby?: LobbyInfo
  intro?: IntroInfo
  play?: PlayInfo
  roundEnd?: RoundEndInfo
  matchEnd?: MatchEndInfo
  spectate?: { round: number; rounds: number }
}

/** État vivant pendant la manche (envoyé au changement, ≤ RULES.inputSendHz, diffé par le hub). */
export interface PhoneStatus {
  k: 'st'
  /** Rang (1 = premier), 0 = inconnu ; nombre d'oiseaux. */
  rank: number
  of: number
  /** Part du désert possédée (0..1, au millième). */
  share: number
  crown: boolean
  /** Avancée du soleil u (0..1) : le mini-arc du bandeau. */
  sun: number
  /** 3, 2, 1 pendant le compte à rebours, 0 sinon. */
  countdown: number
  /** Oiseau bas (ombre FORTE). */
  low: boolean
  /** Couleur de la cible verrouillée (PLONGER devient PIQUER), -1 sinon. */
  target: number
  /** Couleur du chasseur qui te verrouille, -1 sinon. */
  hunter: number
  /** Piqué en cours (prise d'élan, chute ou engagement). */
  diving: boolean
  hidden: boolean
  night: boolean
  /** Décrochage restant (s), 0 sinon. */
  stun: number
  immune: boolean
  /** Recharge restante du COUP D'AILE (s), 0 = prêt. */
  flapCd: number
}

/** Événements qui concernent un joueur : vibration + retour visuel sur son téléphone (GDD §12.3). */
export type PhoneCue =
  | 'altitude' // bascule bas ↔ haut
  | 'locked' // un chasseur te verrouille (au plus une fois par RULES.lockTickMinGapSeconds)
  | 'windup' // prise d'élan d'un piqué contre toi : bordure rouge
  | 'clac' // engagement contre toi : flash blanc
  | 'hit' // ton piqué touche
  | 'stunned' // tu décroches
  | 'dodge' // tu esquives
  | 'planted' // ton piqué est raté, tu plantes
  | 'flap' // ton COUP D'AILE est parti (confirmation, sans vibration)
  | 'flapReady' // COUP D'AILE rechargé
  | 'crown' // tu prends la couronne
  | 'bump' // collision (oiseau, tour, tempête)
  | 'greatShadow' // début de la Grande Ombre
  | 'tick' // chacune des 5 dernières secondes
  | 'roundWin' // victoire de manche
  | 'countdown' // 3, 2, 1 (n)
  | 'go' // Envol !

/** Motifs de vibration (navigator.vibrate) par événement — GDD §12.3. */
export const CUE_HAPTICS: Readonly<Record<PhoneCue, readonly number[]>> = {
  altitude: [10],
  locked: [8],
  windup: [120],
  clac: [35],
  hit: [20, 30, 90],
  stunned: [200, 60, 200],
  dodge: [15, 20, 15, 20, 15],
  planted: [120, 40, 120],
  flap: [],
  flapReady: [10],
  crown: [20, 30, 20, 30, 60],
  bump: [15],
  greatShadow: [80, 80, 80],
  tick: [25],
  roundWin: [100, 50, 100, 50, 300],
  countdown: [12],
  go: [40],
}

/**
 * Paramètres d'un message traduit. Convention : un paramètre numérique nommé `color`
 * (ou finissant par `Color`) est un index de couleur, remplacé par son nom dans la langue affichée.
 */
export type ToastParams = Record<string, string | number>
export type ToastTone = 'info' | 'good' | 'bad' | 'hint'

export type HostToPhone =
  | PhoneView
  | PhoneStatus
  | { k: 'cue'; cue: PhoneCue; n?: number }
  /** Vibration brute (motif navigator.vibrate), pour les cas non couverts par les cues. */
  | { k: 'haptic'; pattern: number[] }
  /** Message court (événement qui concerne ce joueur, indication), clé i18n + paramètres. */
  | { k: 'toast'; key: string; params?: ToastParams; tone?: ToastTone }
  /** Le PC (rafraîchi) redemande les préférences : le téléphone répond par `hello`. */
  | { k: 'who' }
