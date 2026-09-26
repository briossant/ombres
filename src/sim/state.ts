// État interne de la simulation. Tout est en données simples (nombres, tableaux,
// tableaux typés) pour que le snapshot soit un simple parcours de l'objet.

import { RULES } from './rules.ts'
import type { BirdRoundStats, BirdState, SimState } from './types.ts'
import type { Grid } from './territory.ts'
import { makeFootprint } from './footprint.ts'

export const MAX_SLOTS = 12
/** Ticks d'historique pour les fenêtres de 3 s (gain net, gros vol). */
export const HISTORY_TICKS = Math.round(3 * RULES.tickHz)
/** Empreintes mémorisées pour le vol de traînée (RULES.trailBufferSeconds). */
export const TRAIL_CAP = Math.round(RULES.trailBufferSeconds * RULES.tickHz) + 2
/** Flottants par empreinte : temps, cx0, cy0, cx1, cy1, A, B, dx, dy. */
export const TRAIL_STRIDE = 9

/** Oiseau complet (les champs d'ajout sont toujours présents). */
export type Bird = BirdState & {
  paintedCells: number
  paleOnStrong: number
  gain3s: number
  stolen3s: number
  flapDirX: number
  flapDirY: number
}

export type Stats = BirdRoundStats & { feints: number; keptFrom60: number; finalCells: number }

/** État interne d'un oiseau (hors contrat public). */
export interface BirdInternal {
  slot: number
  /** Derniers compteurs d'appuis vus. */
  divePresses: number
  flapPresses: number
  /** Appuis en tampon (s restantes), GDD §12.1. */
  diveBuffer: number
  flapBuffer: number
  /** Temps depuis le dernier appui sur PLONGER (tap bref = maintenu pendant inputBufferSeconds). */
  sinceDivePress: number
  /** PLONGER maintenu (entrée brute du tick). */
  diveHeld: boolean
  /** Direction du joystick au tick (norme ≤ 1). */
  stickX: number
  stickY: number
  /** Taux de lacet du pilotage (hors rappel du Simoun). */
  ctrlTurnRate: number
  /** Vitesse additionnelle du coup d'aile et des poussées (m/s). */
  fvx: number
  fvy: number
  pvx: number
  pvy: number
  /** Centre de l'empreinte peinte au tick précédent (balayage), valide si prevFp. */
  prevFp: boolean
  prevFpX: number
  prevFpY: number
  /** Cible verrouillée au tick précédent et âge du verrouillage (ticks). */
  lockAge: number
  // piqué
  commitVx: number
  commitVy: number
  commitVz: number
  commitDur: number
  commitElapsed: number
  /** La cible a battu des ailes depuis le début du piqué (esquive). */
  targetFlapped: boolean
  /** Touche en attente (grâce de latence de la cible) : temps restant, −1 sinon. */
  pendingHit: number
  pendingX: number
  pendingY: number
  pendingZ: number
  /** Grâce de latence de cet oiseau quand il est la cible (s). */
  latencyGrace: number
  /** Coup d'aile automatique (aide au vol) programmé : temps restant, −1 sinon. */
  autoFlap: number
  autoFlapX: number
  autoFlapY: number
  /** Immunité à appliquer à la fin du décrochage (s). */
  immunityPending: number
  // anneau d'empreintes (vol de traînée)
  trail: Float32Array
  trailHead: number
  trailCount: number
  // événements et rappels
  prevStrong: boolean
  prevHidden: boolean
  prevStorm: boolean
  tskCooldown: number
  towerBumpCooldown: number
  bumpCooldown: Float32Array
  bigStealActive: boolean
  /** Point et cap d'apparition (boucle du compte à rebours). */
  spawnX: number
  spawnY: number
  spawnHeading: number
  /** Cumul de cellules volées (repeint + traînées) : sert au stolen3s. */
  stolenTotal: number
}

export interface Internal {
  /** Générateur (mulberry32). */
  rng: number
  /** Nombre de ticks depuis le début de la manche courante (démo : remis à zéro à chaque boucle). */
  roundTick: number
  /** Temps de soleil courant (s ; négatif pendant le compte à rebours). */
  sunT: number
  birds: BirdInternal[]
  /** Masques : ombres de tours (10 Hz) et nuit (incrémental). */
  towerMask: Uint8Array
  nightMask: Uint8Array
  /** Temps de soleil du dernier calcul du masque des tours. */
  maskSunT: number
  /** Nuit : première colonne non encore dans la nuit, par ligne. */
  nightCol: Int32Array
  /** Territoire à t = 60 s (titre du Bâtisseur). */
  owner60: Uint8Array
  owner60Taken: boolean
  /** Historique des comptes par propriétaire, anneau de HISTORY_TICKS + 1 entrées × 13. */
  countHist: Int32Array
  /** Historique des cumuls de vol par slot, même anneau × 12. */
  stolenHist: Float64Array
  histHead: number
  histCount: number
  /** Couronne : candidat et depuis quand (s). */
  crownCand: number
  crownCandSince: number
  /** Événements de temps déjà émis (drapeaux). */
  nextCountdown: number
  tenSecondsDone: boolean
  lastSecondsNext: number
  nightDone: boolean
  overDone: boolean
  statMarks: number
  /** Comptes au début de la Grande Ombre (gain de la Grande Ombre). */
  countsAt98: Int32Array
  /** Lobby : prochain effacement ; démo : fin de la pause entre deux boucles. */
  lobbyResetAt: number
  demoRestartAt: number
  /** Graine de la boucle de démo (varie à chaque boucle). */
  loop: number
}

export function makeStats(): Stats {
  return {
    hits: 0,
    gotHit: 0,
    dodges: 0,
    misses: 0,
    divesStarted: 0,
    stolenCells: 0,
    trailStolenCells: 0,
    maxGain3s: 0,
    timeLow: 0,
    timeHigh: 0,
    hiddenTime: 0,
    stormTime: 0,
    cellsAt60: 0,
    frozenOwnAtNight: 0,
    gainGreatShadow: 0,
    rankAt80: 0,
    rankAt90: 0,
    rankAt98: 0,
    rankAtNight: 0,
    feints: 0,
    keptFrom60: 0,
    finalCells: 0,
  }
}

export function makeBird(slot: number, assist: boolean): Bird {
  return {
    slot,
    x: 0,
    y: 0,
    z: RULES.altHigh,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    turnRate: 0,
    speed: RULES.speedHigh,
    targetLow: false,
    strong: false,
    shadow: makeFootprint(),
    dive: 'none',
    diveTarget: -1,
    diveTime: 0,
    lockTarget: -1,
    lockedBy: -1,
    stun: 0,
    stunKind: 'none',
    immune: 0,
    flap: 0,
    flapCooldown: 0,
    diveCooldown: 0,
    hidden: false,
    inNight: false,
    inStorm: false,
    crown: false,
    assist,
    towerSlide: 0,
    paintedCells: 0,
    paleOnStrong: 0,
    gain3s: 0,
    stolen3s: 0,
    flapDirX: 1,
    flapDirY: 0,
  }
}

export function makeBirdInternal(slot: number): BirdInternal {
  return {
    slot,
    divePresses: 0,
    flapPresses: 0,
    diveBuffer: 0,
    flapBuffer: 0,
    sinceDivePress: 1e3,
    diveHeld: false,
    stickX: 0,
    stickY: 0,
    ctrlTurnRate: 0,
    fvx: 0,
    fvy: 0,
    pvx: 0,
    pvy: 0,
    prevFp: false,
    prevFpX: 0,
    prevFpY: 0,
    lockAge: 0,
    commitVx: 0,
    commitVy: 0,
    commitVz: 0,
    commitDur: 0,
    commitElapsed: 0,
    targetFlapped: false,
    pendingHit: -1,
    pendingX: 0,
    pendingY: 0,
    pendingZ: 0,
    latencyGrace: 0,
    autoFlap: -1,
    autoFlapX: 0,
    autoFlapY: 0,
    immunityPending: 0,
    trail: new Float32Array(TRAIL_CAP * TRAIL_STRIDE),
    trailHead: 0,
    trailCount: 0,
    prevStrong: false,
    prevHidden: false,
    prevStorm: false,
    tskCooldown: 0,
    towerBumpCooldown: 0,
    bumpCooldown: new Float32Array(MAX_SLOTS),
    bigStealActive: false,
    spawnX: 0,
    spawnY: 0,
    spawnHeading: 0,
    stolenTotal: 0,
  }
}

/** Vue interne complète d'une simulation. */
export interface World {
  state: SimState & { grid: Grid; birds: Bird[]; bySlot: (Bird | undefined)[]; stats: (Stats | undefined)[] }
  internal: Internal
}
