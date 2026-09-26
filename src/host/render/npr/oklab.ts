// Couleurs côté CPU : sRGB ↔ linéaire ↔ OKLab / OKLCH (Björn Ottosson, 2020).
// Toutes les interpolations de palette se font ici, en OKLab, jamais en sRGB
// (l'orange → violet du coucher passerait par la boue). Voir ART_BIBLE §2.5.
//
// Représentation : triplets `Vec3 = [x, y, z]` (tableaux simples, pas d'objets
// three.js) pour rester utilisable hors rendu et sans allocation dans les
// variantes `…Into(out, …)`.

export type Vec3 = [number, number, number]

const srgbToLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4))
const linearToSrgb = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055)

/** '#RRGGBB' → RGB linéaire. */
export function hexToLinear(hex: string): Vec3 {
  const n = parseInt(hex.replace('#', ''), 16)
  return [srgbToLinear(((n >> 16) & 255) / 255), srgbToLinear(((n >> 8) & 255) / 255), srgbToLinear((n & 255) / 255)]
}

/** RGB linéaire → '#RRGGBB' (bornage gamut). */
export function linearToHex(c: Readonly<Vec3>): string {
  const to = (v: number) => Math.round(Math.min(1, Math.max(0, linearToSrgb(Math.max(0, v)))) * 255)
  return '#' + ((1 << 24) | (to(c[0]) << 16) | (to(c[1]) << 8) | to(c[2])).toString(16).slice(1).toUpperCase()
}

export function linearToOklabInto(out: Vec3, c: Readonly<Vec3>): Vec3 {
  const r = c[0]
  const g = c[1]
  const b = c[2]
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b)
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b)
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b)
  out[0] = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s
  out[1] = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s
  out[2] = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  return out
}

export function oklabToLinearInto(out: Vec3, c: Readonly<Vec3>): Vec3 {
  const L = c[0]
  const a = c[1]
  const b = c[2]
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  out[0] = Math.max(0, 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)
  out[1] = Math.max(0, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)
  out[2] = Math.max(0, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)
  return out
}

export const linearToOklab = (c: Readonly<Vec3>): Vec3 => linearToOklabInto([0, 0, 0], c)
export const oklabToLinear = (c: Readonly<Vec3>): Vec3 => oklabToLinearInto([0, 0, 0], c)
export const hexToOklab = (hex: string): Vec3 => linearToOklab(hexToLinear(hex))

/** OKLCH (L, C, h en degrés) → OKLab. */
export function oklchToOklab(L: number, C: number, hDeg: number): Vec3 {
  const h = (hDeg * Math.PI) / 180
  return [L, C * Math.cos(h), C * Math.sin(h)]
}

export function mixInto(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 {
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = a[1] + (b[1] - a[1]) * t
  out[2] = a[2] + (b[2] - a[2]) * t
  return out
}

/**
 * Mélange de deux couleurs OKLab en passant par OKLCH, teinte par le chemin court.
 * Réservé au fondu des résultats KF-4 → KF-15 (ART_BIBLE §2.3) : l'horizon ocre → bleu
 * passerait par le brun en OKLab.
 */
export function mixOklchInto(out: Vec3, a: Readonly<Vec3>, b: Readonly<Vec3>, t: number): Vec3 {
  const ca = Math.hypot(a[1], a[2])
  const cb = Math.hypot(b[1], b[2])
  const ha = Math.atan2(a[2], a[1])
  let hb = Math.atan2(b[2], b[1])
  if (hb - ha > Math.PI) hb -= 2 * Math.PI
  else if (ha - hb > Math.PI) hb += 2 * Math.PI
  const c = ca + (cb - ca) * t
  const h = ha + (hb - ha) * t
  out[0] = a[0] + (b[0] - a[0]) * t
  out[1] = c * Math.cos(h)
  out[2] = c * Math.sin(h)
  return out
}

export const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v)
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp01((x - e0) / (e1 - e0))
  return t * t * (3 - 2 * t)
}
