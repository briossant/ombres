// Contrat caméra ↔ runner (docs/agent-notes/staging.md).
//
// Le runner ÉCRIT `cameraCue` (mode, vainqueur, podium) et incrémente `version` à
// chaque changement ; la caméra (<GameCamera/>) le LIT à chaque frame. En retour, la
// caméra publie son état (`cameraState`) et ses temps forts (`cameraBeats`) : le
// runner peut s'y caler (ex. afficher le panneau des résultats quand la carte est cadrée).
import { Emitter } from '../bus.ts'

export type CameraMode = 'title' | 'lobby' | 'rules' | 'round' | 'roundResults' | 'podium' | 'credits' | 'loading'

export const cameraCue = {
  mode: 'loading' as CameraMode,
  /** Vainqueur de la manche (roundResults) ou de la partie (podium) ; −1 = aucun / égalité. */
  winnerSlot: -1,
  /** Podium : slots dans l'ordre du classement [1er, 2e, 3e] (1 à 3 entrées). */
  podium: [] as number[],
  /** Incrémenté par le runner à chaque écriture. */
  version: 0,
  // ─── Ajouts staging (compatibles) ───
  /**
   * Coupe sèche demandée : la caméra saute directement au plan du mode au lieu de
   * glisser. Remis à false par la caméra une fois appliqué. Inutile au changement de
   * simulation (nouvelle manche, lobby, démo) : la caméra coupe d'elle-même.
   */
  cut: false,
  /** Co-vainqueurs (égalité) : slots ; vide sinon. Facultatif. */
  coWinners: [] as number[],
}

/** Aide d'écriture pour le runner : change le mode (et le reste) puis incrémente `version`. */
export function cueCamera(
  mode: CameraMode,
  opts: { winnerSlot?: number; podium?: number[]; cut?: boolean; coWinners?: number[] } = {},
): void {
  cameraCue.mode = mode
  if (opts.winnerSlot !== undefined) cameraCue.winnerSlot = opts.winnerSlot
  if (opts.podium !== undefined) cameraCue.podium = opts.podium.slice(0, 3)
  if (opts.coWinners !== undefined) cameraCue.coWinners = opts.coWinners.slice()
  if (opts.cut !== undefined) cameraCue.cut = opts.cut
  cameraCue.version++
}

/** État publié par la caméra (lecture seule pour les autres modules). */
export const cameraState = {
  /** Mode effectivement appliqué. */
  mode: 'loading' as CameraMode,
  /** Secondes réelles depuis l'entrée dans ce mode. */
  modeTime: 0,
  /** Nom du plan en cours (titre, crédits…), pour le debug et les scripts de capture. */
  shot: '',
  /** roundResults : avancée de la montée à la verticale (0..1). */
  rise: 0,
  /** roundResults : la carte est cadrée (fin de la montée) → le panneau peut décompter. */
  mapReady: false,
  /** podium : le plan du podium est installé. */
  podiumReady: false,
  /** Cadre visible au sol (m, repère sim) : centre et demi-dimensions (audio). */
  frame: { x: 0, y: 0, halfWidth: 100, halfHeight: 70 },
}

export type CameraBeat =
  /** roundResults : début de la montée à la verticale (après la pause de la nuit). */
  | { type: 'riseStart' }
  /** roundResults : l'illumination du territoire vient d'être lancée (illuminateTerritory). */
  | { type: 'illuminate'; winnerSlot: number }
  /** roundResults : la carte est cadrée (fin de la montée) ; moment conseillé pour le décompte. */
  | { type: 'mapReady' }
  /** podium : le plan est installé. */
  | { type: 'podiumReady' }
  /** Coupe sèche appliquée (changement de plan instantané). */
  | { type: 'cut'; mode: CameraMode }

/** Temps forts de la mise en scène (le runner, l'UI ou l'audio peuvent s'y abonner). */
export const cameraBeats = new Emitter<CameraBeat>()
