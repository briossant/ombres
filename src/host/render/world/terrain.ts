// Relief du décor (ART_BIBLE §6.5) : l'arène est une TOILE PLATE (y = 0, comme la
// sim) ; les dunes ne commencent qu'au-delà de 1,15 × le demi-axe, avec 4-8 m
// d'amplitude, et s'éteignent vers 850 m. Hauteurs calculées sur le CPU : toutes
// les passes voient la même géométrie. Coordonnées three.js (x est, z = −nord).

function hash2(x: number, z: number): number {
  const s = Math.sin(x * 12.9898 + z * 78.233) * 43758.5453
  return s - Math.floor(s)
}

function valueNoise(x: number, z: number): number {
  const ix = Math.floor(x)
  const iz = Math.floor(z)
  const fx = x - ix
  const fz = z - iz
  const ux = fx * fx * (3 - 2 * fx)
  const uz = fz * fz * (3 - 2 * fz)
  const a = hash2(ix, iz)
  const b = hash2(ix + 1, iz)
  const c = hash2(ix, iz + 1)
  const d = hash2(ix + 1, iz + 1)
  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - e0) / (e1 - e0)))
  return t * t * (3 - 2 * t)
}

export interface DuneSample {
  /** Hauteur (m). */
  h: number
  /** Phase de crête / π : une ligne d'encre là où elle est entière (R16). */
  phase: number
  /** Amplitude locale (m) : les crêtes ne sont tracées qu'au-delà de 1,5 m. */
  amp: number
}

export interface TerrainShape {
  /** Demi-axes de l'arène (m). */
  a: number
  b: number
}

/**
 * Enveloppe des dunes : 0 dans l'arène et sur un tablier plat autour (les pentes
 * éclairées, corail au couchant, se confondraient avec du territoire au bord du
 * cadre de jeu), 1 au large (≥ ~2,4 × demi-axe), 0 au-delà de ~850 m.
 */
export function duneEnvelope(x: number, z: number, t: TerrainShape): number {
  const rho = Math.hypot(x / t.a, z / t.b)
  const r = Math.hypot(x, z)
  return smooth(1.6, 2.5, rho) * (1 - smooth(720, 880, r))
}

export function duneAt(x: number, z: number, t: TerrainShape, out: DuneSample = { h: 0, phase: 0, amp: 0 }): DuneSample {
  const env = duneEnvelope(x, z, t)
  if (env <= 0) {
    out.h = 0
    out.phase = 0
    out.amp = 0
    return out
  }
  // vent dominant d'ouest-sud-ouest : crêtes allongées nord-nord-ouest
  const u = x * 0.8 + z * 0.35
  const v = -x * 0.35 + z * 0.8
  const warp = valueNoise(x / 120, z / 120) * 6.0
  const phase = u / 34 + warp
  const amp = 5.8 * (0.55 + valueNoise(x / 200 + 3, z / 200) * 0.8) * env
  const ridge = 1 - Math.abs(Math.sin(phase))
  out.h = Math.pow(ridge, 2.2) * amp + (Math.sin(v / 55 + warp * 0.5) * 0.5 + 0.5) * 1.6 * env
  out.phase = phase / Math.PI
  out.amp = amp
  return out
}

export const duneHeight = (x: number, z: number, t: TerrainShape): number => duneAt(x, z, t).h
