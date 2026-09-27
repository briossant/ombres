// Logotype « OMBRES » figé (même dessin que src/host/ui/Logo.tsx, ART_BIBLE §8.1) pour les images
// et pages hors du jeu : case de BD, ciel de papier, bande de désert, lettres papier bordées
// d'encre, ombres portées plates d'un soleil bas. Pas d'animation, pas de dépendance au jeu.
//   node tools/launch/logo-svg.mjs [elevDeg=12] [az=1.0]  → SVG sur la sortie standard

const WORD = 'OMBRES'
const FONT_SIZE = 168
const W = 880
const BASE = 196
const BAND = 86

/** Ombre des lettres : lavande le jour, violet profond au coucher (comme Logo.tsx, mélange sRGB suffisant ici). */
function shadowColor(elevDeg) {
  const k = Math.min(1, Math.max(0, (16 - elevDeg) / 10))
  const a = [0x9c, 0x88, 0xa0]
  const b = [0x4e, 0x3b, 0x7e]
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * k).toString(16).padStart(2, '0')).join('')
}

function shadowMatrix(elevDeg, az) {
  const cot = 1 / Math.tan((elevDeg * Math.PI) / 180)
  const kx = cot * Math.cos(az) * 0.5
  const ky = cot * Math.sin(az) * 0.3
  return `matrix(1 0 ${(-kx).toFixed(4)} ${(-ky).toFixed(4)} ${(kx * BASE).toFixed(2)} ${(BASE * (1 + ky)).toFixed(2)})`
}

/**
 * @param {{ elevDeg?: number, az?: number, id?: string, sunY?: number, font?: string }} [o]
 * @returns {string} élément <svg> autonome (couleurs en dur, police Julius Sans One attendue dans la page)
 */
export function logoSvg(o = {}) {
  const elevDeg = o.elevDeg ?? 12
  const az = o.az ?? 1.0
  const id = o.id ?? 'lg'
  const font = o.font ?? "'Julius Sans One'"
  const shadow = shadowColor(elevDeg)
  const L = -64
  const R = W + 64
  const TOP = -36
  const BOTTOM = BASE + BAND
  const frame = `M${L} ${TOP}L${R} ${TOP}L${R} ${BOTTOM}L${L} ${BOTTOM}Z`
  const ground = `M${L} ${BASE}L${R} ${BASE}L${R} ${BOTTOM}L${L} ${BOTTOM}Z`
  const sunY = o.sunY ?? BASE - 40
  const t = (extra) => `<text x="0" y="${BASE}" font-family="${font}" font-size="${FONT_SIZE}" textLength="${W}" lengthAdjust="spacing" ${extra}>${WORD}</text>`
  const vb = `${L - 6} ${TOP - 6} ${R - L + 20} ${BOTTOM - TOP + 22}`
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" role="img" aria-label="Ombres">` +
    `<defs><clipPath id="${id}-g"><path d="${ground}"/></clipPath></defs>` +
    `<path d="${frame}" transform="translate(8 8)" fill="rgb(161 142 161 / .6)"/>` +
    `<path d="${frame}" fill="#F7F0E3"/>` +
    `<path d="${ground}" fill="#EFD5AE"/>` +
    `<circle cx="${L + 34}" cy="${sunY}" r="15" fill="#FFF2C3" stroke="#2B1D23" stroke-width="2.4"/>` +
    `<g clip-path="url(#${id}-g)"><g transform="${shadowMatrix(elevDeg, az)}">${t(`fill="${shadow}" stroke="${shadow}" stroke-width="22" stroke-linejoin="round"`)}</g>` +
    `<path d="M${W * 0.2} ${BASE + BAND * 0.72}q5 -6 11 0z" fill="#C9A98E" stroke="#2B1D23" stroke-width="1.6"/>` +
    `<path d="M${W * 0.83} ${BASE + BAND * 0.58}q4 -5 9 0z" fill="#C9A98E" stroke="#2B1D23" stroke-width="1.5"/></g>` +
    `<path d="M${L - 4} ${BASE + 0.8}L${R + 3} ${BASE - 0.6}" stroke="#2B1D23" stroke-width="3" stroke-linecap="round" fill="none"/>` +
    `<g stroke="#2B1D23" stroke-width="3" stroke-linecap="round" fill="none">` +
    `<path d="M${L - 6} ${TOP + 0.5}L${R + 5} ${TOP - 0.5}"/><path d="M${R + 0.5} ${TOP - 5}L${R - 0.5} ${BOTTOM + 4}"/>` +
    `<path d="M${R + 4} ${BOTTOM + 0.5}L${L - 5} ${BOTTOM - 0.4}"/><path d="M${L - 0.4} ${BOTTOM + 5}L${L + 0.5} ${TOP - 4}"/></g>` +
    `<g class="logo-letters">${t('fill="#2B1D23" stroke="#2B1D23" stroke-width="23" stroke-linejoin="round"')}` +
    `${t('fill="#F7F0E3" stroke="#F7F0E3" stroke-width="16" stroke-linejoin="round"')}` +
    `${t('fill="none" stroke="#2B1D23" stroke-width="1.2" opacity=".3"')}</g></svg>`
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [elev, az] = process.argv.slice(2).map(Number)
  process.stdout.write(logoSvg({ elevDeg: elev || 12, az: az || 1.0 }) + '\n')
}
