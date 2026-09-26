// Petits outils numériques partagés par l'oiseau et les FX : interpolations,
// angles, ressorts amortis. Aucune allocation : tout travaille sur des nombres
// ou des objets fournis par l'appelant.

export const TAU = Math.PI * 2

export const clamp = (x: number, a: number, b: number): number => (x < a ? a : x > b ? b : x)
export const clamp01 = (x: number): number => (x < 0 ? 0 : x > 1 ? 1 : x)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
export const invLerp = (a: number, b: number, x: number): number => clamp01((x - a) / (b - a))

export function smoothstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * (3 - 2 * t)
}

export function smootherstep(a: number, b: number, x: number): number {
  const t = clamp01((x - a) / (b - a))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/** Ramène un angle dans ]-π, π]. */
export function wrapAngle(a: number): number {
  a = (a + Math.PI) % TAU
  if (a < 0) a += TAU
  return a - Math.PI
}

/** Interpolation d'angle par le plus court chemin. */
export const lerpAngle = (a: number, b: number, t: number): number => a + wrapAngle(b - a) * t

/** Cloche lisse sur [0, 1] (0 aux bords, 1 au milieu). */
export const bump = (t: number): number => (t <= 0 || t >= 1 ? 0 : Math.sin(Math.PI * t) ** 2)

/** Hash entier → [0, 1) (déterministe, cosmétique). */
export function hash01(n: number): number {
  let x = Math.imul(n | 0, 0x9e3779b1) ^ 0x85ebca6b
  x = Math.imul(x ^ (x >>> 15), 0x2c1b3c6d)
  x = Math.imul(x ^ (x >>> 12), 0x297a2d39)
  x ^= x >>> 15
  return (x >>> 0) / 4294967296
}

/** Bruit 1D lisse (valeur interpolée), période infinie, amplitude [-1, 1]. */
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x)
  const f = x - i
  const a = hash01(i * 7919 + seed * 104729) * 2 - 1
  const b = hash01((i + 1) * 7919 + seed * 104729) * 2 - 1
  const u = f * f * (3 - 2 * f)
  return a + (b - a) * u
}

// ─── Ressorts amortis ─────────────────────────────────────────────────────
// Intégration d'Euler implicite : inconditionnellement stable (dt de 0 à 0,1 s,
// ω jusqu'à 60 rad/s), sans dépassement parasite. C'est la brique de toutes les
// animations de l'oiseau : aucune valeur ne saute, même quand l'état change.

export interface Spring {
  x: number
  v: number
}

export const spring = (x = 0): Spring => ({ x, v: 0 })

/**
 * Avance un ressort vers `target`.
 * @param omega pulsation propre (rad/s) : ~temps de réponse 4/ω
 * @param zeta amortissement (1 = critique, < 1 = rebond)
 */
export function springTo(s: Spring, target: number, omega: number, zeta: number, dt: number): number {
  if (dt <= 0) return s.x
  const w2 = omega * omega
  s.v = (s.v + dt * w2 * (target - s.x)) / (1 + 2 * zeta * omega * dt + w2 * dt * dt)
  s.x += dt * s.v
  return s.x
}

/** Comme springTo, mais pour un angle (cible ramenée au plus proche). */
export function springAngle(s: Spring, target: number, omega: number, zeta: number, dt: number): number {
  return springTo(s, s.x + wrapAngle(target - s.x), omega, zeta, dt)
}

/** Lissage exponentiel indépendant du pas de temps. */
export const damp = (x: number, target: number, lambda: number, dt: number): number =>
  target + (x - target) * Math.exp(-lambda * dt)
