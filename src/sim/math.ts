// Petits outils numériques partagés par la simulation (purs, sans allocation).

export const TAU = Math.PI * 2

export function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t
}

/** Écart angulaire a − b ramené dans ]−π, π]. */
export function angDiff(a: number, b: number): number {
  let d = (a - b) % TAU
  if (d > Math.PI) d -= TAU
  else if (d <= -Math.PI) d += TAU
  return d
}

/** Angle ramené dans ]−π, π]. */
export function wrapAngle(a: number): number {
  return angDiff(a, 0)
}

/** Lissage exponentiel d'ordre 1 : fraction à parcourir vers la cible pendant dt. */
export function expK(dt: number, tau: number): number {
  return tau <= 0 ? 1 : 1 - Math.exp(-dt / tau)
}

/** Hachage entier 32 bits (mélange de type murmur3 fmix), déterministe. */
export function hash32(a: number, b = 0, c = 0): number {
  let h = Math.imul(a ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(b + 0x7f4a7c15, 0xc2b2ae35) ^ Math.imul(c + 0x165667b1, 0x27d4eb2f)
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/** Hachage d'une chaîne (FNV-1a 32 bits). */
export function hashString(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}
