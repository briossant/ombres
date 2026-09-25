// Identités des 12 joueurs (docs/ART_BIBLE.md §3). Source de vérité : palette.json.
// L'index de couleur (0..11) est aussi l'ordre d'attribution par défaut :
// les 6 premières restent distinctes pour les trois daltonismes.
import palette from './palette.json'
import type { Lang } from './protocol.ts'

export interface PlayerColor {
  /** 0..11 */
  index: number
  name: Record<Lang, string>
  /** Couleur d'identité (oiseau, HUD, liseré). */
  hex: string
  /** Variante lisible pour du texte sur papier clair. */
  text: string
  /** OKLCH [L, C, h°]. */
  oklch: [number, number, number]
  /** Glyphe du mode daltonien (clé). */
  glyph: string
  /** Motif de trame du mode daltonien (clé). */
  pattern: string
  /** Paramètres du lavis de territoire (ART_BIBLE §3.3). */
  terr: { dL: number; cs: number; h: number }
}

export const PLAYER_COLORS: readonly PlayerColor[] = palette.players.map((p, index) => ({
  index,
  name: { fr: p.fr, en: p.en },
  hex: p.hex,
  text: p.text,
  oklch: p.oklch as [number, number, number],
  glyph: p.glyphEn,
  pattern: p.pattern,
  terr: p.terr,
}))

export const MAX_PLAYERS = 12

export function colorName(index: number, lang: Lang): string {
  return PLAYER_COLORS[index]?.name[lang] ?? '?'
}

/** Constantes de couleur hors joueurs (os, papier, tours…). */
export const PALETTE_CONSTANTS = palette.constants
