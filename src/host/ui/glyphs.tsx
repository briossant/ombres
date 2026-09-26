// Composants React des glyphes et jetons de joueurs (ART_BIBLE §3.5, §8.5).
// Réutilisables par tout module hôte ; le téléphone utilisera glyphShapes.ts
// (pur) une fois déplacé dans src/shared, ou les fichiers public/ui/glyphs/*.svg.
import type { CSSProperties } from 'react'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { GLYPH_INNER, GLYPH_VIEWBOX, glyphKeyForColor, type GlyphKey } from './glyphShapes.ts'

export { GLYPH_KEYS, glyphKeyForColor, glyphSvg, type GlyphKey } from './glyphShapes.ts'

/** Glyphe seul, à la couleur du texte courant (currentColor). */
export function Glyph({ glyph, size = 24, className, style }: { glyph: GlyphKey; size?: number; className?: string; style?: CSSProperties }) {
  return (
    <svg
      className={className ? `glyph ${className}` : 'glyph'}
      style={style}
      width={size}
      height={size}
      viewBox={GLYPH_VIEWBOX}
      aria-hidden
      dangerouslySetInnerHTML={{ __html: GLYPH_INNER[glyph] }}
    />
  )
}

/**
 * Jeton de joueur : disque à la couleur d'identité, cerclé d'encre, glyphe à
 * l'encre dedans (mode normal comme daltonien : ART_BIBLE §3.5, « HUD TV »).
 * `variant="paper"` : jeton papier à bord de couleur (au-dessus de l'oiseau en mode daltonien).
 */
export function Token({ colorIndex, size = 40, variant = 'color', className, style }: { colorIndex: number; size?: number; variant?: 'color' | 'paper'; className?: string; style?: CSSProperties }) {
  const c = PLAYER_COLORS[colorIndex]
  const border = Math.max(1.5, size * 0.06)
  const s: CSSProperties =
    variant === 'color'
      ? { width: size, height: size, background: c?.hex, borderWidth: border, ...style }
      : { width: size, height: size, background: 'var(--paper)', borderColor: c?.hex, borderWidth: Math.max(2, size * 0.12), ...style }
  return (
    <span className={className ? `token ${className}` : 'token'} style={s}>
      <Glyph glyph={glyphKeyForColor(colorIndex)} size={size * 0.62} />
    </span>
  )
}
