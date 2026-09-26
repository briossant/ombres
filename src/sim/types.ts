// Contrat public de la simulation d'Ombres.
//
// La simulation est du TypeScript pur (aucun import DOM / three / React), à pas
// fixe (RULES.tickHz = 30 Hz), déterministe pour une graine et une suite
// d'entrées données. Le PC fait autorité : il est le seul à la faire tourner.
// Consommateurs en lecture seule : rendu, bots, HUD, narrateur, audio, caméra.
//
// CONVENTIONS (identiques à docs/GDD.md)
// - Monde : x = est, y = nord, z = altitude, en mètres. Le rendu three.js
//   (Y en haut) convertit : three(x, y, z) = (sim.x, sim.z, -sim.y).
// - Cap (heading) : radians, sens trigonométrique depuis +x (est). Direction = (cos h, sin h).
// - Azimut du soleil : degrés/radians depuis le nord, sens horaire (convention GDD).
// - Propriétaire d'une cellule : 0 = neutre, slot + 1 pour un joueur (1..12).
// - Slot : 0..11, identité stable d'un joueur pendant toute la partie.
//   La couleur est portée par la couche joueurs (src/shared/players.ts), pas par la sim.

// ─── Entrées ───────────────────────────────────────────────────────────────

/** Entrée d'un oiseau à un tick : identique qu'elle vienne d'un téléphone, du clavier ou d'un bot. */
export interface BirdInput {
  /** Direction voulue dans le monde (x est, y nord), norme ≤ 1. Sous RULES.stickDeadzone : on garde le cap. */
  dirX: number
  dirY: number
  /** PLONGER maintenu (vise l'altitude basse ; déclenche un piqué si une cible est verrouillée). */
  dive: boolean
  /** Compteurs monotones d'appuis (un appui bref entre deux ticks n'est jamais perdu). */
  divePresses: number
  flapPresses: number
}

export const NEUTRAL_INPUT: Readonly<BirdInput> = Object.freeze({ dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 })

// ─── Configuration ─────────────────────────────────────────────────────────

export type SimMode =
  | 'round' // vraie manche : compte à rebours, soleil, Grande Ombre, nuit
  | 'lobby' // désert du lobby : soleil fixe, territoire remis à zéro périodiquement, pas de fin
  | 'demo' // écran titre : manche de bots au coucher accéléré, qui boucle

export type MapId = 'parasols' | 'aiguilles' | 'geantes' | 'cadran' | 'lobby'

export interface BirdSetup {
  slot: number
  /** Aide au vol (GDD §12.1) : visible, verrouillage élargi, évitement, immunité plus longue. */
  assist: boolean
}

export interface SimConfig {
  mode: SimMode
  seed: number
  mapId: MapId
  /** Carte en miroir nord-sud (5e manche d'une partie en 5 manches). */
  mirror?: boolean
  /** Oiseaux présents (la taille d'arène dépend de leur nombre, bots compris). */
  birds: BirdSetup[]
  /** Durée du soleil T en secondes (80 / 110 / 150 ; démo : RULES.titleDemoSunSeconds). */
  sunSeconds: number
  /** Compte à rebours de RULES.countdownSeconds avant le soleil (manche). */
  countdown: boolean
  /** Surcharges (lobby). */
  arenaOverride?: { a: number; b: number }
  fixedSunElevDeg?: number
  paintResetSeconds?: number
}

// ─── Soleil ────────────────────────────────────────────────────────────────

export type RoundPhase =
  | 'countdown'
  | 'noon'
  | 'afternoon'
  | 'golden'
  | 'sunset'
  | 'greatShadow'
  | 'night' // gel : RULES.nightHoldSeconds
  | 'over' // manche terminée, résultats figés

export interface SunState {
  /** Secondes de soleil écoulées (négatif pendant le compte à rebours). */
  t: number
  /** t / T borné à [0, 1] : c'est aussi l'avancée du cadran du HUD. */
  u: number
  T: number
  /** Élévation de gameplay, en radians. */
  elevation: number
  /** Azimut depuis le nord, sens horaire, en radians. */
  azimuth: number
  /** Direction horizontale unitaire des ombres (opposée au soleil), repère monde. */
  shadowDirX: number
  shadowDirY: number
  /** cot(e) : décalage de l'ombre par mètre de hauteur. */
  cotE: number
  /** Étirement S = min(1 / sin e, RULES.stretchMax). */
  stretch: number
  /** Horloge de palette en degrés (ART_BIBLE §2.4) : pour la couleur uniquement, jamais pour le gameplay. */
  paletteElevDeg: number
  phase: RoundPhase
}

// ─── Arène, tours, nuit ────────────────────────────────────────────────────

export interface ArenaState {
  /** Demi-axes de l'ellipse (a est-ouest, b nord-sud). */
  a: number
  b: number
  /** Rayon elliptique (fraction) où commence le Simoun (RULES.stormSoftFrom, ou resserré). */
  stormFrom: number
}

/**
 * Tronc de cône horizontal (sections horizontales circulaires) d'une tour.
 * Son ombre au sol est exactement l'enveloppe convexe de deux cercles (GDD §9.1).
 * ox/oy : décalage horizontal du centre de la section par rapport au pied de la tour
 * (tours inclinées comme le gnomon) ; 0 par défaut.
 */
export interface TowerSegment {
  z0: number
  r0: number
  z1: number
  r1: number
  ox0?: number
  oy0?: number
  ox1?: number
  oy1?: number
}

export type TowerArchetype = 'parasol' | 'aiguille' | 'pile' | 'colonne' | 'bulbe' | 'geante' | 'cathedrale' | 'gnomon'

export interface TowerDef {
  id: number
  x: number
  y: number
  archetype: TowerArchetype
  /** Géométrie de gameplay (ombres, collisions). Le rendu la reproduit exactement, décors fins en plus. */
  segments: TowerSegment[]
  height: number
  /** Rayon de collision du fût sous RULES.towerWideMinZ. */
  trunkRadius: number
  /** Hors de l'arène (Géantes) : ombre seulement, pas de collision. */
  outside: boolean
  /** Graine des détails décoratifs (fenêtres, fissures, fanions). */
  seed: number
}

/** Front de la Grande Ombre (GDD §7.1). Un point p est dans la nuit si dot(p, dir) < s + jagAt(dot(p, perp)). */
export interface NightState {
  active: boolean
  dirX: number
  dirY: number
  /** Position du front le long de dir (mètres). */
  s: number
  /** Profil dentelé fixe (±RULES.greatShadowJagAmp), échantillonné régulièrement de -jagSpan à +jagSpan le long de perp = (-dirY, dirX). */
  jag: Float32Array
  jagSpan: number
}

// ─── Territoire ────────────────────────────────────────────────────────────

export interface DirtyRect {
  x0: number
  y0: number
  x1: number
  y1: number
}

export interface TerritoryGrid {
  cols: number
  rows: number
  /** Coin (colonne 0, ligne 0) en coordonnées monde : (-a, -b). Ligne 0 = sud. */
  x0: number
  y0: number
  cellW: number
  cellH: number
  /** 0 = neutre, slot + 1. */
  owner: Uint8Array
  /** 0 = aucun, RULES.levelPale = 1, RULES.levelStrong = 2. */
  level: Uint8Array
  /** Propriétaire précédent (pour les transitions de rendu). */
  prevOwner: Uint8Array
  /** Instant (state.time, s) du dernier changement de la cellule. */
  changedAt: Float32Array
  /** 1 = figée (ombre de tour ou nuit). Tours recalculées à RULES.towerMaskHz, nuit à chaque tick. */
  frozen: Uint8Array
  /** 1 = cellule comptée (centre dans l'ellipse, hors pied des tours). */
  inArena: Uint8Array
  arenaCells: number
  /** Nombre de cellules possédées par code propriétaire (0..12). */
  counts: Int32Array
  /** Incrémenté à chaque modification de owner/level. */
  version: number
  /**
   * Ajout sim : rectangle (en cellules, bornes incluses) des cellules modifiées depuis
   * la dernière remise à zéro par le consommateur (le rendu du territoire) ; vide si x0 > x1.
   * Remettre à zéro avec `clearDirty(grid)` (src/sim/territory.ts) après l'envoi de la texture.
   */
  dirty?: DirtyRect
  /** Ajout sim : incrémenté à chaque recalcul du masque figé (tours à 10 Hz, avancée de la nuit). */
  frozenVersion?: number
}

// ─── Oiseaux ───────────────────────────────────────────────────────────────

export interface ShadowFootprint {
  /** Centre de l'empreinte au sol. */
  cx: number
  cy: number
  /** Rayon en travers (r(h) = 5 → 11 m). */
  r: number
  /** Demi-axe le long de la direction des ombres : r × S. */
  rAlong: number
  /** FORT (altitude ≤ RULES.strongMaxAlt) sinon PÂLE. */
  strong: boolean
  /** L'ombre peint ce tick (faux si décroché, caché, hors arène…). */
  paints: boolean
}

export type DivePhase = 'none' | 'windup' | 'guided' | 'committed'
export type StunKind = 'none' | 'hit' | 'miss'

export interface BirdState {
  slot: number
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  /** Cap (rad). */
  heading: number
  /** Vitesse de lacet (rad/s, + = virage à gauche) : pilote l'inclinaison du rendu. */
  turnRate: number
  /** Vitesse horizontale (m/s). */
  speed: number
  /** PLONGER maintenu. */
  targetLow: boolean
  strong: boolean
  shadow: ShadowFootprint
  dive: DivePhase
  diveTarget: number
  /** Secondes depuis le début du piqué en cours. */
  diveTime: number
  /** Cible verrouillée par cet oiseau (chevron), -1 sinon. */
  lockTarget: number
  /** Chasseur dont le chevron est affiché au-dessus de cet oiseau, -1 sinon. */
  lockedBy: number
  /** Temps de décrochage restant (s), 0 sinon. */
  stun: number
  stunKind: StunKind
  /** Immunité restante (s). */
  immune: number
  /** Coup d'aile en cours : temps restant de l'impulsion (s). */
  flap: number
  flapCooldown: number
  diveCooldown: number
  hidden: boolean
  inNight: boolean
  /** Dans la bande du Simoun. */
  inStorm: boolean
  crown: boolean
  assist: boolean
  /** Glissade contre un fût : temps restant (s). */
  towerSlide: number
  // ─── Ajouts sim (compatibles, optionnels pour les maquettes ; toujours remplis par la sim) ───
  /** Cellules gagnées ou renforcées par cette ombre à ce tick (grain de sable qui coule, audio). */
  paintedCells?: number
  /** Durée (s) continue pendant laquelle l'ombre pâle frotte du sable fort adverse (0 sinon). */
  paleOnStrong?: number
  /** Gain net de cellules sur les 3 dernières secondes, en fraction de l'arène. */
  gain3s?: number
  /** Cellules prises à d'autres joueurs sur les 3 dernières secondes (repeint + traînées), fraction de l'arène. */
  stolen3s?: number
  /** Coup d'aile en cours : direction de l'impulsion (unitaire). */
  flapDirX?: number
  flapDirY?: number
}

// ─── Statistiques (titres, résultats) ──────────────────────────────────────

export interface BirdRoundStats {
  hits: number
  gotHit: number
  /** Esquives réussies (le chasseur a planté). */
  dodges: number
  misses: number
  divesStarted: number
  /** Cellules prises à d'autres (repeint + traînées). */
  stolenCells: number
  trailStolenCells: number
  /** Plus gros gain net en 3 s (cellules). */
  maxGain3s: number
  timeLow: number
  timeHigh: number
  hiddenTime: number
  stormTime: number
  /** Cellules possédées à t = 60 s (mis à l'échelle × T/110). */
  cellsAt60: number
  /** Cellules possédées et figées sous les tours à la nuit. */
  frozenOwnAtNight: number
  /** Gain net pendant la Grande Ombre. */
  gainGreatShadow: number
  /** Rangs (1 = premier) à 80 s, 90 s, 98 s et à la nuit. */
  rankAt80: number
  rankAt90: number
  rankAt98: number
  rankAtNight: number
  // ─── Ajouts sim (compatibles, optionnels pour les maquettes ; toujours remplis par la sim) ───
  /** Piqués annulés par le chasseur (PLONGER relâché avant le clac). */
  feints?: number
  /** Cellules possédées à la nuit qui étaient déjà à soi à t = 60 s (× T/110) : titre « Le Bâtisseur ». */
  keptFrom60?: number
  /** Cellules possédées à la nuit (score de manche). */
  finalCells?: number
}

// ─── État complet ──────────────────────────────────────────────────────────

export interface SimState {
  readonly config: SimConfig
  tick: number
  /** Temps de simulation (s) depuis la création, compte à rebours compris. */
  time: number
  sun: SunState
  arena: ArenaState
  towers: readonly TowerDef[]
  /** Oiseaux présents (ordre stable). */
  birds: BirdState[]
  /** Accès par slot (longueur 12, undefined si absent). */
  bySlot: (BirdState | undefined)[]
  grid: TerritoryGrid
  night: NightState
  /** Slot du meneur couronné, -1 si personne. */
  crownSlot: number
  /** Facteur de temps demandé par les règles (0,5 pendant la dernière seconde), appliqué par le runner. */
  timeScaleHint: number
  stats: (BirdRoundStats | undefined)[]
  /** Manche terminée (phase 'over'). */
  over: boolean
}

// ─── Événements ────────────────────────────────────────────────────────────
// Émis par step(), consommés par l'audio, le narrateur, les FX, la caméra, le HUD, les vibrations.

export type SimEvent =
  | { type: 'countdown'; n: number } // 3, 2, 1, puis 0 = « Envol ! »
  | { type: 'phase'; phase: RoundPhase }
  | { type: 'tenSeconds' }
  | { type: 'lastSeconds'; n: number } // 5..1
  | { type: 'altitude'; slot: number; strong: boolean } // bascule FORT/PÂLE
  | { type: 'lock'; hunter: number; target: number }
  | { type: 'unlock'; hunter: number; target: number }
  | { type: 'diveWindup'; hunter: number; target: number }
  | { type: 'diveCommit'; hunter: number; target: number } // le « clac »
  | { type: 'diveCancel'; hunter: number; target: number; reason: 'feint' | 'hidden' | 'immune' | 'lost' }
  | {
      type: 'diveHit'
      hunter: number
      target: number
      x: number
      y: number
      z: number
      /** Cellules de traînée volées. */
      stolenCells: number
      crown: boolean
    }
  | { type: 'diveMiss'; hunter: number; target: number; dodged: boolean; x: number; y: number }
  | { type: 'flap'; slot: number }
  | { type: 'flapReady'; slot: number }
  | { type: 'stunEnd'; slot: number }
  | { type: 'immuneEnd'; slot: number }
  | { type: 'bump'; a: number; b: number; x: number; y: number; z: number }
  | { type: 'towerBump'; slot: number; tower: number }
  | { type: 'paleOnStrong'; slot: number; x: number; y: number } // « tsk », limité en fréquence
  | { type: 'hidden'; slot: number; hidden: boolean }
  | { type: 'storm'; slot: number; inside: boolean }
  | { type: 'crown'; slot: number; prev: number } // après hystérésis ; slot -1 = personne
  /** Gain net ≥ RULES.bigStealFrac de l'arène en 3 s (flash du segment, coup de pinceau). */
  | { type: 'bigSteal'; slot: number; frac: number; victim: number }
  | { type: 'territoryReset' } // lobby
  | { type: 'night' } // gel
  | { type: 'over' }

// ─── API ───────────────────────────────────────────────────────────────────

export interface Simulation {
  readonly state: SimState
  /** Avance d'un tick (1 / RULES.tickHz s). `inputs[slot]` ; undefined = entrée neutre. */
  step(inputs: ReadonlyArray<BirdInput | undefined>): SimEvent[]
  /** Lobby : ajout / retrait dynamique d'oiseaux. */
  addBird(setup: BirdSetup): void
  removeBird(slot: number): void
  setAssist(slot: number, on: boolean): void
  /** Grâce de latence pour l'esquive d'un téléphone : min(RULES.latencyGraceMax, RTT/2). */
  setLatencyGrace(slot: number, seconds: number): void
  /** État sérialisable (rafraîchissement du PC). */
  snapshot(): SimSnapshot
}

/** JSON-sérialisable. Les tableaux typés sont encodés en base64. */
export interface SimSnapshot {
  version: 1
  config: SimConfig
  data: Record<string, unknown>
}
