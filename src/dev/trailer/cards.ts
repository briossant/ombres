// Cartons de la bande-annonce (anglais : la bande-annonce vise X, Hacker News, Reddit, Discord).
// Ce ne sont pas des textes du jeu : ils ne passent pas par t(). Durées en secondes.
// Chaque carton est capturé seul (fond transparent, ou papier) par tools/trailer/cards.mjs,
// puis composé sur les images du jeu par tools/trailer/edit.mjs.

export type CardPos = 'tl' | 'tr' | 'bl' | 'br' | 'bc' | 'tc'

export type CardSpec =
  /** Récitatif du narrateur (sous-titre de la voix off), comme dans le jeu, en plus grand. */
  | { kind: 'recit'; dur: number; text: string; colorIndex?: number; colorWord?: string }
  /** Légende en case de BD (Julius Sans One, capitales) ; une ligne après l'autre. */
  | { kind: 'caption'; dur: number; pos: CardPos; lines: { text: string; at: number; small?: boolean }[] }
  /** Planche « comment jouer » : papier, deux cases percées (le jeu et la manette y passent), légendes. */
  | { kind: 'howto'; dur: number }
  /** Carton final : logo, promesse, adresse ; variante B : crédit IA. */
  | { kind: 'final'; dur: number; credit: boolean }
  /** Cadre de téléphone (écran percé), fixe. */
  | { kind: 'phone'; dur: number }
  /** Version verticale (1080 × 1920) : page de BD, le jeu dans une case, la manette dans une autre, légendes. */
  | { kind: 'vertical'; dur: number; beats: { at: number; lines: string[]; phone?: boolean; final?: boolean }[] }

export const CARDS: Record<string, CardSpec> = {
  'recit-noon': { kind: 'recit', dur: 3.4, text: 'Noon. The sand is still nobody’s.' },
  'cap-paint': {
    kind: 'caption',
    dur: 3.6,
    pos: 'bl',
    lines: [
      { text: 'Your shadow', at: 0 },
      { text: 'paints the desert.', at: 0.45 },
    ],
  },
  'cap-phone': {
    kind: 'caption',
    dur: 3.4,
    pos: 'bl',
    lines: [
      { text: 'Your phone', at: 0 },
      { text: 'is the controller.', at: 0.4 },
    ],
  },
  'recit-golden': { kind: 'recit', dur: 3.2, text: 'The sun leans. Your shadows grow.' },
  'cap-dive': {
    kind: 'caption',
    dur: 4.2,
    pos: 'tl',
    lines: [
      { text: 'Dive on a rival.', at: 0 },
      { text: 'Steal their trail.', at: 1.5 },
    ],
  },
  'recit-night': { kind: 'recit', dur: 3.4, text: 'Night spills off the cliff. Everything stops.' },
  'recit-win': { kind: 'recit', dur: 3.2, text: 'Night falls. {color} keeps the desert.', colorIndex: 1, colorWord: 'Lagoon' },
  'cap-win': {
    kind: 'caption',
    dur: 3.0,
    pos: 'br',
    lines: [
      { text: 'At nightfall,', at: 0 },
      { text: 'the biggest territory wins.', at: 0.35 },
    ],
  },
  howto: { kind: 'howto', dur: 7.5 },
  'final-a': { kind: 'final', dur: 6.5, credit: false },
  'final-b': { kind: 'final', dur: 6.5, credit: true },
  phone: { kind: 'phone', dur: 1 / 60 },
  vertical: {
    kind: 'vertical',
    dur: 25.4,
    beats: [
      { at: 0, lines: ['Your shadow', 'paints the desert.'] },
      { at: 6.0, lines: ['Your phone', 'is the controller.'], phone: true },
      { at: 10.2, lines: ['The sun sets.', 'Shadows grow.'] },
      { at: 13.2, lines: ['Dive on a rival.', 'Steal their trail.'] },
      { at: 19.2, lines: ['At nightfall, the', 'biggest territory wins.'] },
      { at: 22.2, lines: [], final: true },
    ],
  },
}

export const URL_TEXT = 'ombres.deploy.breizhware.com'
export const CREDIT_TEXT = 'Designed, coded and directed by Claude Opus 5.5 (Anthropic) · supervised by Brieuc Crosson'

/** Géométrie partagée avec tools/trailer/edit.mjs (px, image 1920 × 1080). */
export const LAYOUT = {
  /** Cadre de téléphone : écran (trou) et boîtier. Rapport de l'écran = 852 / 393 (iPhone 15 Pro en paysage). */
  phone: { screen: { x: 24, y: 24, w: 704, h: 325 }, body: { w: 752, h: 373 }, radius: 44, screenRadius: 26 },
  /** Planche « comment jouer » : trous des cases (le salon à gauche, la manette à droite). */
  howto: {
    tv: { x: 72, y: 276, w: 1120, h: 630 },
    phone: { x: 1262, y: 276, w: 586, h: 270 },
  },
  /** Version verticale : case du jeu (16:9) et écran de la manette (trou), en px de la page 1080 × 1920. */
  vertical: {
    w: 1080,
    h: 1920,
    /** Case du jeu en 4:3 (image recadrée au centre). */
    main: { x: 40, y: 380, w: 1000, h: 750 },
    phoneBody: { x: 164, y: 1420 },
    phoneScreen: { x: 188, y: 1444, w: 704, h: 325 },
  },
} as const
