// Mélanges de couleurs en OKLab pour l'UI (vignette du cadran, chargement).
// Petit module autonome : l'UI ne dépend pas du code de rendu.
import palette from '../../shared/palette.json'

type V3 = [number, number, number]

const toLin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const toSrgb = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

function hexToOklab(hex: string): V3 {
  const n = parseInt(hex.slice(1), 16)
  const r = toLin(((n >> 16) & 255) / 255)
  const g = toLin(((n >> 8) & 255) / 255)
  const b = toLin((n & 255) / 255)
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s]
}

function oklabToHex([L, a, bb]: V3): string {
  const l = (L + 0.3963377774 * a + 0.2158037573 * bb) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * bb) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * bb) ** 3
  const rgb = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s]
  return '#' + rgb.map(c => Math.round(Math.min(1, Math.max(0, toSrgb(Math.max(0, c)))) * 255).toString(16).padStart(2, '0')).join('')
}

/** Mélange OKLab de deux couleurs hex (t = 0 → a, 1 → b). */
export function mixHex(a: string, b: string, t: number): string {
  const A = hexToOklab(a)
  const B = hexToOklab(b)
  const k = Math.min(1, Math.max(0, t))
  return oklabToHex([A[0] + (B[0] - A[0]) * k, A[1] + (B[1] - A[1]) * k, A[2] + (B[2] - A[2]) * k])
}

type KeyName = 'skyTop' | 'skyMid' | 'skyHorizon' | 'sun' | 'castShadow' | 'groundFlat' | 'sandLit' | 'ink'
const KF = palette.keyframes.map(k => ({ e: k.paletteElevDeg, hex: k.hex as Record<KeyName, string> }))

/** Couleur d'une clé de palette à l'horloge `paletteElevDeg` (interpolation OKLab entre keyframes). */
export function paletteColor(key: KeyName, paletteElevDeg: number): string {
  const e = paletteElevDeg
  if (e >= KF[0].e) return KF[0].hex[key]
  for (let i = 0; i < KF.length - 1; i++) {
    const hi = KF[i]
    const lo = KF[i + 1]
    if (e <= hi.e && e >= lo.e) return mixHex(lo.hex[key], hi.hex[key], (e - lo.e) / (hi.e - lo.e))
  }
  return KF[KF.length - 1].hex[key]
}
