// Générateur pseudo-aléatoire à graine (mulberry32). L'état tient dans un entier
// 32 bits stocké dans un objet de données simple : il se sérialise avec le reste
// de l'état (snapshot) et reste déterministe. Jamais de Math.random() dans src/sim.

export interface RngState {
  rng: number
}

/** Tire un nombre dans [0, 1) et fait avancer l'état. */
export function nextRandom(st: RngState): number {
  let a = (st.rng + 0x6d2b79f5) | 0
  st.rng = a
  let t = Math.imul(a ^ (a >>> 15), 1 | a)
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296
}

/** Tire un nombre dans [lo, hi). */
export function randomRange(st: RngState, lo: number, hi: number): number {
  return lo + (hi - lo) * nextRandom(st)
}

/** Générateur autonome (outils, cartes) : fonction () => [0, 1). */
export function mulberry32(seed: number): () => number {
  const st: RngState = { rng: seed | 0 }
  return () => nextRandom(st)
}
