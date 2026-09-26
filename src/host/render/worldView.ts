// État de PRÉSENTATION du monde (hors simulation), mutable et lu à chaque frame
// par le rendu, comme gameView. L'orchestration (phase 3 : écrans, caméra,
// résultats) et les pages de lookdev l'écrivent. Tout a une valeur par défaut
// « jeu » : sans rien toucher, le monde suit la sim.
export const worldView = {
  /**
   * Horloge de palette imposée (°) : écran titre (KF16 = 16), lobby (KF50 = 50).
   * null = celle de la sim (`SunState.paletteElevDeg`).
   */
  paletteElevOverride: null as number | null,
  /** Soleil imposé (élévation, azimut en degrés) ; null = celui de la sim. */
  sunOverride: null as { elevDeg: number; azDeg: number } | null,
  /**
   * Fondu des résultats KF-4 → KF-15 (0..1), à animer pendant la montée de la
   * caméra à la verticale (2,5 s, ART_BIBLE §2.4).
   */
  resultsFade: 0,
  /**
   * Palette de nuit partout (0..1). null = automatique : 1 une fois la manche
   * finie (phases 'night' et 'over'), 0 sinon.
   */
  nightAll: null as number | null,
  /**
   * Illumination du territoire aux résultats (ART_BIBLE §4.7) : vague d'ouest en
   * est en 0,8 s, puis la couleur gagnante ré-imprime son lavis. `start` = temps
   * réel (s, gameView.realTime) du déclenchement ; winnerSlot −1 = aucun.
   */
  illumination: { start: -1, winnerSlot: -1 },
  /** Réduit le warp des bords du territoire à 0,5 cellule (décompte, photo-finish). */
  exactBorders: false,
  /** Masque le Simoun (écran titre sans arène, par exemple). */
  hideStorm: false,
  /** Oiseaux dont le fil d'ombre est masqué (slots), en plus de la règle automatique. */
  hideThreads: 0 as number,
  /**
   * Leviers de mesure (polish W5, scripts sous ?debug) : cascade focus sur le cadre de la manche,
   * lissage B-spline des ombres selon la taille du texel à l'écran. Toujours vrais en jeu.
   */
  roundFocus: true,
  shadowSmooth: true,
}

export type WorldView = typeof worldView

/** Déclenche l'illumination des résultats (à appeler au début du décompte). */
export function illuminateTerritory(winnerSlot: number, realTime: number): void {
  worldView.illumination.start = realTime
  worldView.illumination.winnerSlot = winnerSlot
}
