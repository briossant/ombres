// Glyphes des 12 joueurs (ART_BIBLE §3.5) : croix, vagues, croissant, disque, triangle, carré,
// goutte, étoile, chevron, losange, anneau, éclair. Géométrie identique à celle de la TV
// (public/ui/glyphs/<clé>.svg, agent ui) : boîte -12..12, en currentColor.
// TODO(intégration) : importer src/shared/glyphs.ts dès qu'il existe (demande ui → lead).
import type { CSSProperties, ReactElement } from 'react'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { inkOn } from '../format.tsx'

type Shape =
  | { d: string; stroke?: number }
  | { circle: number; stroke?: number }
  | { rect: number }

const waves = (y0: number) => {
  const pts: string[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    pts.push(`${(t * 19 - 9.5).toFixed(2)} ${(y0 + Math.sin(t * 2 * Math.PI) * 2.5).toFixed(2)}`)
  }
  return `M${pts.join('L')}`
}

const SHAPES: Record<string, Shape> = {
  cross: { d: 'M-2.2-9h4.4v6.8h6.8v4.4h-6.8v6.8h-4.4v-6.8h-6.8v-4.4h6.8z' },
  waves: { d: `${waves(-3.8)} ${waves(3.8)}`, stroke: 2.8 },
  crescent: { d: 'M8.15 3.82A9 9 0 1 1 1.5 -8.87A7.2 7.2 0 1 0 8.15 3.82Z' },
  disc: { circle: 8.5 },
  triangle: { d: 'M0 -9.5L9.5 7.5L-9.5 7.5Z' },
  square: { rect: 7.2 },
  drop: { d: 'M0 -9.8C3.5 -4.5 8 -0.5 8 3A8 8 0 0 1 -8 3C-8 -0.5 -3.5 -4.5 0 -9.8Z' },
  star: { d: 'M0 -9.4L2.47 -2.8L9.51 -2.49L3.99 1.9L5.88 8.69L0 4.8L-5.88 8.69L-3.99 1.9L-9.51 -2.49L-2.47 -2.8Z' },
  chevron: { d: 'M-9 4.5L0 -4.5L9 4.5', stroke: 3.6 },
  diamond: { d: 'M0 -10L7.5 0L0 10L-7.5 0Z' },
  ring: { circle: 7, stroke: 3.2 },
  bolt: { d: 'M2.5 -10L-5.5 1.2L-0.2 1.2L-2.5 10L5.5 -1.2L0.2 -1.2Z' },
}

/** Forme du glyphe d'un joueur, centrée sur (0, 0). */
export function GlyphShape({ index }: { index: number }): ReactElement | null {
  const key = PLAYER_COLORS[index]?.glyph
  const s = key ? SHAPES[key] : undefined
  if (!s) return null
  if ('rect' in s) return <rect x={-s.rect} y={-s.rect} width={s.rect * 2} height={s.rect * 2} fill="currentColor" />
  if ('circle' in s)
    return s.stroke ? <circle r={s.circle} fill="none" stroke="currentColor" strokeWidth={s.stroke} /> : <circle r={s.circle} fill="currentColor" />
  return s.stroke ? (
    <path d={s.d} fill="none" stroke="currentColor" strokeWidth={s.stroke} strokeLinecap="round" strokeLinejoin="round" />
  ) : (
    <path d={s.d} fill="currentColor" />
  )
}

/** Glyphe seul (à l'encre par défaut). */
export function Glyph({ index, size = 20, color, style }: { index: number; size?: number; color?: string; style?: CSSProperties }) {
  return (
    <svg className="glyph" width={size} height={size} viewBox="-12 -12 24 24" aria-hidden="true" style={{ color, ...style }}>
      <GlyphShape index={index} />
    </svg>
  )
}

/**
 * Jeton de joueur : pastille à sa couleur, cerclée d'encre, glyphe à l'encre
 * (papier sur les couleurs sombres, pour rester lisible).
 */
export function Token({ index, size = 28, className }: { index: number; size?: number; className?: string }) {
  const c = PLAYER_COLORS[index]
  if (!c) return null
  return (
    <svg className={`token ${className ?? ''}`} width={size} height={size} viewBox="-16 -16 32 32" aria-hidden="true">
      <circle r="14.5" fill={c.hex} stroke="#2B1D23" strokeWidth="2" />
      <g transform="scale(0.8)" style={{ color: inkOn(index) }}>
        <GlyphShape index={index} />
      </g>
    </svg>
  )
}
