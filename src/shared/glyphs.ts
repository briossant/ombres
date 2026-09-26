// Glyphes des 12 joueurs (ART_BIBLE §3.5) en SVG monochrome (`currentColor`).
// Module PUR partagé entre la TV (src/host/ui) et le téléphone (src/phone) :
// les deux affichent exactement les mêmes formes. Aussi exportées en fichiers
// dans public/ui/glyphs/<clé>.svg (src/dev/ui/exportGlyphs.ts).
//
// Repère : viewBox « -12 -12 24 24 », rayon nominal r = 10, d'après les formes
// de validation de docs/art/tools/sheet.html (même proportions).

export type GlyphKey = 'cross' | 'waves' | 'crescent' | 'disc' | 'triangle' | 'square' | 'drop' | 'star' | 'chevron' | 'diamond' | 'ring' | 'bolt'

/** Dans l'ordre d'attribution des couleurs (index PLAYER_COLORS). */
export const GLYPH_KEYS: readonly GlyphKey[] = ['cross', 'waves', 'crescent', 'disc', 'triangle', 'square', 'drop', 'star', 'chevron', 'diamond', 'ring', 'bolt']

const R = 10
const f = (n: number): string => (Math.round(n * 100) / 100).toString()

function wavePath(oy: number): string {
  const pts: string[] = []
  for (let i = 0; i <= 24; i++) {
    const t = i / 24
    pts.push(`${f((t - 0.5) * 1.9 * R)} ${f(oy * R + Math.sin(t * 2 * Math.PI) * 0.25 * R)}`)
  }
  return 'M' + pts.join('L')
}

function crescentPath(): string {
  const r0 = R * 0.9
  const cx = R * 0.42
  const cy = -R * 0.22
  const r1 = R * 0.72
  const d = Math.hypot(cx, cy)
  const x = (d * d + r0 * r0 - r1 * r1) / (2 * d)
  const h = Math.sqrt(Math.max(r0 * r0 - x * x, 0))
  const ux = cx / d
  const uy = cy / d
  const ax = x * ux - h * uy
  const ay = x * uy + h * ux
  const bx = x * ux + h * uy
  const by = x * uy - h * ux
  // Grand arc extérieur de A à B (par la gauche), puis arc intérieur de retour.
  return `M${f(ax)} ${f(ay)}A${f(r0)} ${f(r0)} 0 1 1 ${f(bx)} ${f(by)}A${f(r1)} ${f(r1)} 0 1 0 ${f(ax)} ${f(ay)}Z`
}

function starPath(): string {
  const pts: string[] = []
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5
    const rr = i % 2 ? R * 0.42 : R * 1.0
    pts.push(`${f(Math.cos(a) * rr)} ${f(Math.sin(a) * rr + 0.6)}`)
  }
  return 'M' + pts.join('L') + 'Z'
}

const fill = (d: string): string => `<path d="${d}" fill="currentColor"/>`
const stroke = (d: string, w: number): string => `<path d="${d}" fill="none" stroke="currentColor" stroke-width="${f(w)}" stroke-linecap="round" stroke-linejoin="round"/>`

/** Contenu SVG (sans la balise <svg>) de chaque glyphe. */
export const GLYPH_INNER: Readonly<Record<GlyphKey, string>> = {
  cross: fill('M-2.2-9h4.4v6.8h6.8v4.4h-6.8v6.8h-4.4v-6.8h-6.8v-4.4h6.8z'),
  waves: stroke(wavePath(-0.38), R * 0.28) + stroke(wavePath(0.38), R * 0.28),
  crescent: fill(crescentPath()),
  disc: `<circle r="${f(R * 0.85)}" fill="currentColor"/>`,
  triangle: fill(`M0 ${f(-R * 0.95)}L${f(R * 0.95)} ${f(R * 0.75)}L${f(-R * 0.95)} ${f(R * 0.75)}Z`),
  square: `<rect x="${f(-R * 0.72)}" y="${f(-R * 0.72)}" width="${f(R * 1.44)}" height="${f(R * 1.44)}" fill="currentColor"/>`,
  drop: fill(
    `M0 ${f(-R * 0.98)}C${f(R * 0.35)} ${f(-R * 0.45)} ${f(R * 0.8)} ${f(-R * 0.05)} ${f(R * 0.8)} ${f(R * 0.3)}` +
      `A${f(R * 0.8)} ${f(R * 0.8)} 0 0 1 ${f(-R * 0.8)} ${f(R * 0.3)}` +
      `C${f(-R * 0.8)} ${f(-R * 0.05)} ${f(-R * 0.35)} ${f(-R * 0.45)} 0 ${f(-R * 0.98)}Z`,
  ),
  star: fill(starPath()),
  chevron: stroke(`M${f(-R * 0.9)} ${f(R * 0.45)}L0 ${f(-R * 0.45)}L${f(R * 0.9)} ${f(R * 0.45)}`, R * 0.36),
  diamond: fill(`M0 ${f(-R)}L${f(R * 0.75)} 0L0 ${f(R)}L${f(-R * 0.75)} 0Z`),
  ring: `<circle r="${f(R * 0.7)}" fill="none" stroke="currentColor" stroke-width="${f(R * 0.32)}"/>`,
  bolt: fill(`M${f(R * 0.25)} ${f(-R)}L${f(-R * 0.55)} ${f(R * 0.12)}L${f(-R * 0.02)} ${f(R * 0.12)}L${f(-R * 0.25)} ${f(R)}L${f(R * 0.55)} ${f(-R * 0.12)}L${f(R * 0.02)} ${f(-R * 0.12)}Z`),
}

export const GLYPH_VIEWBOX = '-12 -12 24 24'

/** Glyphe par index de couleur (0..11). */
export function glyphKeyForColor(colorIndex: number): GlyphKey {
  return GLYPH_KEYS[((colorIndex % 12) + 12) % 12]
}

/** Fichier SVG autonome (pour <img>, CSS mask-image, atlas de sprites). */
export function glyphSvg(key: GlyphKey, opts: { size?: number; color?: string } = {}): string {
  const size = opts.size ?? 24
  const inner = opts.color ? GLYPH_INNER[key].replaceAll('currentColor', opts.color) : GLYPH_INNER[key]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${GLYPH_VIEWBOX}" width="${size}" height="${size}">${inner}</svg>`
}
