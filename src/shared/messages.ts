// Messages applicatifs échangés entre le PC (hôte) et les téléphones.
// Le serveur les relaie sans les lire. Toute évolution se fait ici.

/** Boutons de la manette (bitmask). */
export const BTN_A = 1 // bouton principal (monter / battre des ailes)
export const BTN_B = 2 // bouton secondaire (piquer)

export type ControlScheme = 'joystick' | 'tilt'

/** Entrée brute envoyée par un téléphone (~30 Hz quand elle change, 5 Hz sinon). */
export interface PhoneInput {
  k: 'in'
  /** Numéro de séquence croissant (les paquets plus vieux que le dernier reçu sont ignorés). */
  seq: number
  /** Joystick ou inclinaison, normalisé dans [-1, 1]. y > 0 = vers le haut de l'écran du téléphone. */
  x: number
  y: number
  /** Boutons maintenus (bitmask BTN_*). */
  b: number
  /** Compteurs d'appuis par bouton, pour ne jamais perdre un appui bref entre deux paquets. */
  pa: number
  pb: number
}

export type PhoneToHost =
  | PhoneInput
  /** Choix du nom et de la couleur (index dans la palette), null = laisser l'hôte choisir. */
  | { k: 'profile'; name: string; color: number | null }
  | { k: 'ready'; ready: boolean }
  | { k: 'scheme'; scheme: ControlScheme }
  /** Actions de menu depuis le téléphone. */
  | { k: 'action'; action: 'start' | 'rematch' | 'toLobby' | 'pause' | 'resume' }

/** Écran que le téléphone doit afficher. */
export type PhoneScreen =
  | 'lobby' // choix nom/couleur, attente du lancement
  | 'intro' // présentation de la manche / tutoriel
  | 'play' // manette
  | 'roundEnd' // entre deux manches
  | 'matchEnd' // résultats de la partie, revanche
  | 'paused'

export interface PhoneView {
  k: 'view'
  screen: PhoneScreen
  lang: 'fr' | 'en'
  /** Identité du joueur sur ce téléphone. */
  you: {
    slot: number
    name: string
    colorIndex: number
    /** Premier joueur humain : peut lancer la partie / la revanche depuis son téléphone. */
    isHost: boolean
    ready: boolean
  }
  /** Couleurs déjà prises par d'autres joueurs (lobby). */
  takenColors: number[]
  /** Numéro de manche courante (1-based) et total. */
  round: number
  rounds: number
  /** Rang et part de territoire du joueur (0..1), pour l'écran manette et entre les manches. */
  rank: number
  share: number
  /** Titre éventuel gagné (fin de manche / partie), clé i18n. */
  title?: string
  scheme: ControlScheme
}

export type HostToPhone =
  | PhoneView
  /** Vibration (motif navigator.vibrate). */
  | { k: 'haptic'; pattern: number[] }
  /** Mise à jour légère pendant le jeu (~2 Hz). */
  | { k: 'status'; rank: number; share: number; stunned: boolean; diveReady: boolean; sun: number }
  /** Message court à afficher (événement qui concerne ce joueur), clé i18n + paramètres. */
  | { k: 'toast'; key: string; params?: Record<string, string | number> }
