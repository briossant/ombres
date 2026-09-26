// Cartes d'Ombres : tours (profils de révolution exacts), arène selon le nombre
// d'oiseaux, profil dentelé de la Falaise (front de la Grande Ombre).
//
// Sources : GDD §4.1 (presets), §9.3 (règles de placement, mise à l'échelle),
// §9.4 (les quatre cartes au preset 5-6 oiseaux), §15 (lobby) ; ART_BIBLE §6.6
// (archétypes). Toute la géométrie de gameplay est exprimée en troncs de cône
// (TowerSegment) : bulbes = 4 troncs, dômes = 3, disques = cylindres courts à
// bords biseautés. Les profils sont MONOTONES en z (le z1 d'un segment est le z0
// du suivant ; un segment de hauteur nulle est une marche plate, dessous d'un
// disque) : le rendu peut tourner le profil d'un seul tenant (lathe).
//
// API : getMap(mapId, birdCount, mirror) → MapInfo (arène, tours, Falaise).

import { RULES, DEG } from './rules.ts'
import type { MapId, TowerArchetype, TowerDef, TowerSegment } from './types.ts'
import { hash32, hashString } from './math.ts'
import { mulberry32 } from './rng.ts'
import { ellipseEdgeDistance } from './arena.ts'

// ─── Arène ─────────────────────────────────────────────────────────────────

export interface ArenaPreset {
  /** Index dans RULES.arenaPresets (0 = 1-2 oiseaux … 5 = 10-12 oiseaux). */
  index: number
  maxBirds: number
  a: number
  b: number
  /** Nombre de tours de la carte Les Parasols (GDD §4.1). */
  towers: number
}

/** Preset d'arène pour N oiseaux (bots compris), GDD §4.1. */
export function arenaPresetFor(birdCount: number): ArenaPreset {
  const presets = RULES.arenaPresets
  let index = presets.findIndex((p) => birdCount <= p.maxBirds)
  if (index < 0) index = presets.length - 1
  const p = presets[index]!
  return { index, maxBirds: p.maxBirds, a: p.a, b: p.b, towers: p.towers }
}

/** Index du preset de référence des cartes (5-6 oiseaux, 165 × 114 m). */
export const REFERENCE_PRESET_INDEX = 3
const REF_A = RULES.arenaPresets[REFERENCE_PRESET_INDEX]!.a
const REF_B = RULES.arenaPresets[REFERENCE_PRESET_INDEX]!.b

// ─── Constructeur de profils ───────────────────────────────────────────────

/** Point de profil : section horizontale circulaire de rayon r à l'altitude z. */
interface ProfilePoint {
  z: number
  r: number
}

/**
 * Profil de révolution construit de bas en haut. Chaque paire de points
 * consécutifs est un tronc de cône ; deux points de même z forment une marche plate.
 */
class Profile {
  readonly pts: ProfilePoint[] = []
  constructor(r0: number) {
    this.pts.push({ z: 0, r: r0 })
  }
  get z(): number {
    return this.pts[this.pts.length - 1]!.z
  }
  get r(): number {
    return this.pts[this.pts.length - 1]!.r
  }
  /** Tronc de cône jusqu'à (z, r). */
  to(z: number, r: number): this {
    this.pts.push({ z, r })
    return this
  }
  /** Marche plate (même z) vers le rayon r. */
  step(r: number): this {
    if (Math.abs(r - this.r) > 1e-6) this.pts.push({ z: this.z, r })
    return this
  }
  /** Disque (cylindre court) de rayon r et d'épaisseur th, bords biseautés, posé à z. */
  disc(z: number, r: number, th: number, shaftTopR?: number): this {
    if (z > this.z + 1e-6) this.to(z, this.r)
    const bevel = Math.min(0.9, th * 0.25)
    this.step(r - bevel * 1.6)
    this.to(z + bevel, r)
    this.to(z + th - bevel * 0.8, r)
    this.to(z + th, r - bevel * 1.3)
    if (shaftTopR !== undefined) this.step(shaftTopR)
    return this
  }
  /**
   * Raccorde une forme décrite par ses propres points (z croissant) au profil :
   * si elle commence sous le haut courant, on la reprend à l'altitude courante
   * (rayon interpolé), la partie cachée dans le fût étant sans effet sur l'ombre.
   */
  private shape(points: ProfilePoint[]): this {
    const first = points[0]!
    if (first.z > this.z + 1e-6) {
      this.to(first.z, this.r)
      this.step(first.r)
    } else {
      let r = first.r
      for (let i = 0; i + 1 < points.length; i++) {
        const p = points[i]!
        const q = points[i + 1]!
        if (this.z >= p.z && this.z <= q.z) {
          r = q.z > p.z ? p.r + (q.r - p.r) * ((this.z - p.z) / (q.z - p.z)) : q.r
          break
        }
      }
      this.step(Math.max(r, 0))
    }
    for (const p of points) if (p.z > this.z + 1e-6) this.to(p.z, p.r)
    return this
  }
  /** Bulbe centré en zc, de rayon R : 4 troncs (profil de validate.mjs). */
  bulb(zc: number, R: number): this {
    return this.shape([
      { z: zc - R, r: R * 0.45 },
      { z: zc - R * 0.5, r: R * 0.87 },
      { z: zc, r: R },
      { z: zc + R * 0.5, r: R * 0.87 },
      { z: zc + R, r: R * 0.3 },
    ])
  }
  /** Oignon (bulbe à pointe) : 4 troncs, rayon max R à zc, pointe effilée jusqu'à zTop. */
  onion(z0: number, zc: number, R: number, zTop: number): this {
    return this.shape([
      { z: z0, r: Math.min(R * 0.5, RULES.towerLowMaxRadius) },
      { z: zc - (zc - z0) * 0.35, r: R * 0.9 },
      { z: zc, r: R },
      { z: zc + (zTop - zc) * 0.4, r: R * 0.72 },
      { z: zTop, r: 0 },
    ])
  }
  /** Dôme hémisphérique de rayon R posé sur le haut courant : 3 troncs. */
  dome(R: number): this {
    const z = this.z
    this.step(R)
    this.to(z + R * 0.5, R * 0.87)
    this.to(z + R * 0.87, R * 0.5)
    this.to(z + R, 0)
    return this
  }
  /** Flèche conique jusqu'à zTop (pointe), depuis le rayon r0. */
  spire(r0: number, zTop: number): this {
    this.step(r0)
    this.to(zTop, 0)
    return this
  }
  /** Lanterne (petit cylindre) puis calotte. */
  lantern(r: number, h: number): this {
    const z = this.z
    this.step(r)
    this.to(z + h, r)
    this.to(z + h + r * 0.6, r * 0.55)
    this.to(z + h + r * 0.9, 0)
    return this
  }
  segments(): TowerSegment[] {
    const out: TowerSegment[] = []
    for (let i = 0; i + 1 < this.pts.length; i++) {
      const p = this.pts[i]!
      const q = this.pts[i + 1]!
      out.push({ z0: p.z, r0: p.r, z1: q.z, r1: q.r })
    }
    return out
  }
}

/** Rayon d'un fût conique (r0 → r1 de z0 à z1) à l'altitude z. */
function shaftR(r0: number, r1: number, z1: number, z: number): number {
  return r0 + (r1 - r0) * Math.min(1, Math.max(0, z / z1))
}

// ─── Archétypes (ART_BIBLE §6.6, dimensions de gameplay du GDD §9.4) ────────

/** Parasol : fût, grand disque biseauté, lanterne. */
function parasol(o: { shaft: [number, number, number]; discR: number; discTh?: number; lantern?: boolean; spire?: [number, number] }): Profile {
  const [r0, r1, h] = o.shaft
  const p = new Profile(r0).to(h, r1)
  p.disc(h, o.discR, o.discTh ?? 3)
  if (o.spire) {
    // flèche du Grand Parasol (GDD : r 2 → 1 sur 10 m), terminée en pointe
    const [rs, len] = o.spire
    p.step(rs)
    p.to(p.z + len * 0.85, rs * 0.55)
    p.to(p.z + len * 0.15, 0)
  } else if (o.lantern !== false) {
    p.lantern(2, 2.5)
  }
  return p
}

/** Aiguille (fuseau) : fût conique fin, bulbe, flèche. */
function aiguille(o: { shaft: [number, number, number]; bulbR: number; bulbC?: number; spire?: number; spireR?: number }): Profile {
  const [r0, r1, h] = o.shaft
  const zc = o.bulbC ?? h + o.bulbR * 0.8
  const p = new Profile(r0).to(Math.min(h, zc - o.bulbR), shaftR(r0, r1, h, Math.min(h, zc - o.bulbR)))
  p.bulb(zc, o.bulbR)
  const spire = o.spire ?? 5
  if (spire > 0) p.spire(Math.min(o.spireR ?? 0.8, p.r), p.z + spire)
  return p
}

/** Pile : fût et disques étagés, petit dôme turquoise au sommet. */
function pile(o: { shaft: [number, number, number]; discs: [number, number, number][]; domeR?: number }): Profile {
  const [r0, r1, h] = o.shaft
  const p = new Profile(r0)
  for (const [z, r, th] of o.discs) {
    p.to(z, shaftR(r0, r1, h, z))
    p.disc(z, r, th, shaftR(r0, r1, h, z + th))
  }
  if (p.z < h - 1e-6) p.to(h, r1)
  p.dome(o.domeR ?? Math.min(3, p.r))
  return p
}

/** Colonne à dôme : fût épais (≤ 5 m), disque, dôme cobalt. */
function colonne(o: { shaftR: number; h: number; discR: number; discTh: number; domeR?: number }): Profile {
  const p = new Profile(o.shaftR).to(o.h, o.shaftR)
  p.disc(o.h, o.discR, o.discTh, o.domeR ?? o.shaftR)
  p.dome(o.domeR ?? o.shaftR)
  return p
}

/** Bulbe (oignon) : fût étranglé, oignon à pointe (jamais plus de 5 m sous 24 m). */
function bulbe(o: { shaft: [number, number, number]; zc: number; R: number; zTop: number }): Profile {
  const [r0, r1, h] = o.shaft
  const p = new Profile(r0).to(h, r1)
  p.onion(h, o.zc, o.R, o.zTop)
  return p
}

/** Géante (hors arène) : fût massif, bulbe, flèche. */
function geante(o: { shaft: [number, number, number]; bulbC: number; bulbR: number; spire: number }): Profile {
  const [r0, r1, h] = o.shaft
  const p = new Profile(r0).to(h, r1)
  p.bulb(o.bulbC, o.bulbR)
  p.spire(Math.min(1.5, p.r), p.z + o.spire)
  return p
}

/** Gnomon : mât conique et disques étagés (GDD §9.4) ; inclinaison appliquée à part. */
function gnomon(): Profile {
  const r = (z: number) => shaftR(5, 3, 70, z)
  const p = new Profile(5)
  p.to(38, r(38)).disc(38, 12, 3, r(41))
  p.to(52, r(52)).disc(52, 16, 3, r(55))
  p.to(66, r(66)).disc(66, 7, 4)
  p.spire(1.2, 74)
  return p
}

// ─── Définitions des cartes (preset de référence 165 × 114 m) ───────────────

interface TowerSpec {
  name: string
  x: number
  y: number
  archetype: TowerArchetype
  profile: Profile
  outside?: boolean
  /** Inclinaison du mât (°) vers le sud (gnomon). */
  tiltSouthDeg?: number
}

interface MapSpec {
  /** Tours dans l'ordre de priorité : les dernières sont retirées en premier dans les petites arènes. */
  towers: TowerSpec[]
  /** Nombre de tours intérieures par preset (index 0..5). Les tours hors arène sont toujours présentes. */
  countByPreset: readonly number[]
  /** Carte d'ouverture : centre dégagé (GDD §9.3). */
  opening?: boolean
}

const T = (name: string, x: number, y: number, archetype: TowerArchetype, profile: Profile, extra?: Partial<TowerSpec>): TowerSpec => ({
  name,
  x,
  y,
  archetype,
  profile,
  ...extra,
})

const MAP_SPECS: Record<MapId, MapSpec> = {
  // Les Parasols : grands refuges à midi, puis éclipses mobiles.
  parasols: {
    opening: true,
    countByPreset: RULES.arenaPresets.map((p) => p.towers),
    towers: [
      T('T1 Grand Parasol', -70, 8, 'parasol', parasol({ shaft: [4, 3.5, 44], discR: 18, discTh: 4, spire: [2, 10] })),
      T('T2 Parasol ouest', -128, -42, 'parasol', parasol({ shaft: [3.5, 3, 34], discR: 13 })),
      T('T3 Fuseau nord-ouest', -110, 60, 'aiguille', aiguille({ shaft: [4, 3, 46], bulbC: 54, bulbR: 8, spire: 8, spireR: 1.5 })),
      T('T4 Pile nord', -15, 72, 'pile', pile({ shaft: [3.5, 3, 36], discs: [[26, 10, 2], [33, 13, 3]] })),
      T('T5 Parasol sud', -10, -76, 'parasol', parasol({ shaft: [3, 2.5, 30], discR: 12 })),
      T('T6 Fuseau est', 68, 45, 'bulbe', bulbe({ shaft: [3.5, 2.5, 26], zc: 31, R: 6, zTop: 40 })),
      T('T7 Colonne est', 88, -38, 'colonne', colonne({ shaftR: 5, h: 24, discR: 9, discTh: 3 })),
      T('T8 Aiguille centre', 28, -18, 'aiguille', aiguille({ shaft: [3, 1.5, 40], bulbC: 44, bulbR: 5, spire: 5 })),
      T('T9 Parasol nord-est', 42, 88, 'parasol', parasol({ shaft: [3, 2.5, 30], discR: 12 })),
    ],
  },

  // Les Aiguilles : fuseaux fins en quinconce, hauteurs décroissantes d'ouest en est ;
  // au couchant, un code-barres de couloirs.
  aiguilles: {
    countByPreset: [7, 7, 8, 9, 10, 11],
    towers: [
      T('A1', -120, 20, 'aiguille', aiguille({ shaft: [3, 1.5, 52], bulbC: 56, bulbR: 5, spire: 6 })),
      T('A2', -85, -55, 'aiguille', aiguille({ shaft: [3, 1.5, 46], bulbC: 50, bulbR: 4.5, spire: 5 })),
      T('A3', -70, 70, 'aiguille', aiguille({ shaft: [3, 1.5, 44], bulbC: 48, bulbR: 4.5, spire: 5 })),
      T('A4', -35, 5, 'aiguille', aiguille({ shaft: [3, 1.5, 40], bulbC: 44, bulbR: 5, spire: 5 })),
      T('A5', -15, -85, 'aiguille', aiguille({ shaft: [2.5, 1.5, 36], bulbC: 40, bulbR: 4, spire: 4 })),
      T('A7', 45, -35, 'aiguille', aiguille({ shaft: [2.5, 1.5, 32], bulbC: 35, bulbR: 4, spire: 4 })),
      T('A8', 80, 30, 'aiguille', aiguille({ shaft: [2.5, 1.5, 28], bulbC: 31, bulbR: 3.5, spire: 3 })),
      T('A6', 10, 55, 'aiguille', aiguille({ shaft: [2.5, 1.5, 34], bulbC: 37, bulbR: 4, spire: 4 })),
      T('A9', 110, -50, 'aiguille', aiguille({ shaft: [2.5, 1.5, 26], bulbC: 29, bulbR: 3.5, spire: 3 })),
      // grandes arènes (7 oiseaux et plus)
      T('A10', -132, -30, 'aiguille', aiguille({ shaft: [3, 1.5, 48], bulbC: 52, bulbR: 4.5, spire: 5 })),
      T('A11', 132, 8, 'aiguille', aiguille({ shaft: [2.5, 1.5, 24], bulbC: 27, bulbR: 3.5, spire: 3 })),
    ],
  },

  // Les Géantes : deux tours géantes hors de l'arène, à l'ouest (« les doigts de la nuit »),
  // et quelques tours intérieures.
  geantes: {
    countByPreset: [3, 3, 4, 4, 5, 6],
    towers: [
      T('G1 Géante sud', -228, -38, 'geante', geante({ shaft: [10, 7, 100], bulbC: 108, bulbR: 12, spire: 14 }), { outside: true }),
      T('G2 Géante nord', -222, 62, 'geante', geante({ shaft: [9, 6, 84], bulbC: 91, bulbR: 10, spire: 12 }), { outside: true }),
      T('T1 Parasol', -95, 5, 'parasol', parasol({ shaft: [3.5, 3, 36], discR: 15 })),
      T('T3 Parasol', 15, 55, 'parasol', parasol({ shaft: [3, 2.5, 30], discR: 12 })),
      T('T2 Pile', -30, -65, 'pile', pile({ shaft: [3.5, 3, 34], discs: [[26, 9, 2], [31, 12, 3]] })),
      T('T4 Fuseau', 80, -20, 'bulbe', bulbe({ shaft: [3.5, 2.5, 27], zc: 33, R: 6, zTop: 42 })),
      // grandes arènes
      T('T5 Colonne', 70, 62, 'colonne', colonne({ shaftR: 4.5, h: 24, discR: 8, discTh: 3 })),
      T('T6 Bulbe', -58, 72, 'bulbe', bulbe({ shaft: [3, 2.5, 25], zc: 33, R: 8, zTop: 46 })),
    ],
  },

  // Le Cadran : un gnomon central dont l'ombre tourne comme l'aiguille d'un cadran solaire.
  cadran: {
    countByPreset: [5, 5, 5, 5, 6, 7],
    towers: [
      T('C0 Gnomon', -30, 0, 'gnomon', gnomon(), { tiltSouthDeg: 12 }),
      T('C1', 55, 55, 'parasol', parasol({ shaft: [3, 2.5, 28], discR: 11 })),
      T('C2', 55, -55, 'parasol', parasol({ shaft: [3, 2.5, 28], discR: 11 })),
      T('C3', -110, 58, 'parasol', parasol({ shaft: [3, 2.5, 34], discR: 12 })),
      T('C4', -110, -58, 'parasol', parasol({ shaft: [3, 2.5, 34], discR: 12 })),
      // grandes arènes
      T('C5 Pile', 125, 0, 'pile', pile({ shaft: [3, 2.5, 30], discs: [[22, 5, 1.5], [27, 10, 3]] })),
      T('C6 Colonne', -5, 88, 'colonne', colonne({ shaftR: 4.5, h: 24, discR: 8, discTh: 3 })),
    ],
  },

  // Désert du lobby (GDD §15) : une arène de 90 × 62 m et un parasol.
  lobby: {
    countByPreset: [1, 1, 1, 1, 1, 1],
    towers: [T('Parasol du lobby', -30, 10, 'parasol', parasol({ shaft: [3.5, 3.2, 25], discR: 14 }))],
  },
}

// ─── Falaise : profil dentelé du front de la Grande Ombre ───────────────────

export interface CliffProfile {
  /** Profil du front (m), ±RULES.greatShadowJagAmp, de −jagSpan à +jagSpan le long de perp. */
  jag: Float32Array
  jagSpan: number
  /** Silhouette de la crête (sans unité, −1..1), même échantillonnage que jag : +1 = crête haute. */
  crest: Float32Array
  /** Distance (m) de la Falaise à l'ouest et hauteur de sa crête (le soleil la touche à sunElevEndDeg). */
  distance: number
  height: number
}

/**
 * Profil de mesa : plateaux séparés par des ressauts raides, petites entailles.
 * Déterministe par carte. Une crête haute projette la nuit plus loin (jag > 0).
 */
export function getCliffProfile(mapId: MapId, arena: { a: number; b: number }): CliffProfile {
  const spacing = RULES.cliffJagSpacing
  const jagSpan = Math.ceil((Math.max(arena.a, arena.b) + 40) / spacing) * spacing
  const n = Math.round((2 * jagSpan) / spacing) + 1
  const crest = new Float32Array(n)
  const rand = mulberry32(hashString('cliff:' + mapId))
  // plateaux successifs (longueurs 14-46 m), niveaux dans [−1, 1], ressauts sur 3-7 m
  let i = 0
  let level = rand() * 2 - 1
  while (i < n) {
    const len = Math.max(2, Math.round((14 + rand() * 32) / spacing))
    const next = Math.max(-1, Math.min(1, level + (rand() < 0.5 ? -1 : 1) * (0.5 + rand() * 1.1)))
    const ramp = Math.max(1, Math.round((3 + rand() * 4) / spacing))
    for (let k = 0; k < len && i < n; k++, i++) {
      const t = k < len - ramp ? 0 : (k - (len - ramp) + 1) / ramp
      const s = t * t * (3 - 2 * t)
      crest[i] = level + (next - level) * s
    }
    level = next
  }
  // entailles (quelques creux étroits) et grain léger
  for (let k = 0; k < n; k++) {
    if (rand() < 0.04) {
      const w = 1 + Math.floor(rand() * 2)
      for (let q = -w; q <= w; q++) {
        const idx = k + q
        if (idx >= 0 && idx < n) crest[idx] = crest[idx]! - 0.35 * (1 - Math.abs(q) / (w + 1))
      }
    }
    crest[k] = crest[k]! + (rand() - 0.5) * 0.08
  }
  let maxAbs = 1e-6
  for (let k = 0; k < n; k++) maxAbs = Math.max(maxAbs, Math.abs(crest[k]!))
  const jag = new Float32Array(n)
  for (let k = 0; k < n; k++) {
    crest[k] = crest[k]! / maxAbs
    jag[k] = crest[k]! * RULES.greatShadowJagAmp
  }
  const distance = RULES.cliffDistance
  return { jag, jagSpan, crest, distance, height: distance * Math.tan(RULES.sunElevEndDeg * DEG) }
}

// ─── Construction d'une carte ──────────────────────────────────────────────

export interface MapInfo {
  id: MapId
  mirror: boolean
  /** Preset d'arène retenu (index −1 pour une arène imposée, lobby). */
  presetIndex: number
  arena: { a: number; b: number }
  towers: TowerDef[]
  cliff: CliffProfile
  /** Carte d'ouverture (centre dégagé). */
  opening: boolean
}

/** Rayon d'un profil de segments à l'altitude z (0 si au-dessus du sommet). */
export function towerRadiusAt(segments: readonly TowerSegment[], z: number): number {
  let r = 0
  for (const s of segments) {
    if (z < s.z0 || z > s.z1) continue
    const k = s.z1 > s.z0 ? (z - s.z0) / (s.z1 - s.z0) : 1
    r = Math.max(r, s.r0 + (s.r1 - s.r0) * k)
  }
  return r
}

/** Décalage horizontal du centre de la section à l'altitude z (tours inclinées). */
export function towerOffsetAt(segments: readonly TowerSegment[], z: number, out: { x: number; y: number }): { x: number; y: number } {
  out.x = 0
  out.y = 0
  for (const s of segments) {
    if (z < s.z0 || z > s.z1) continue
    const k = s.z1 > s.z0 ? (z - s.z0) / (s.z1 - s.z0) : 0
    out.x = (s.ox0 ?? 0) + ((s.ox1 ?? 0) - (s.ox0 ?? 0)) * k
    out.y = (s.oy0 ?? 0) + ((s.oy1 ?? 0) - (s.oy0 ?? 0)) * k
    return out
  }
  return out
}

/** Rayon de collision du fût : rayon maximal sous RULES.towerWideMinZ. */
function trunkRadiusOf(segments: readonly TowerSegment[]): number {
  const zMax = RULES.towerWideMinZ
  let r = 0
  for (const s of segments) {
    if (s.z0 >= zMax) continue
    r = Math.max(r, s.r0)
    if (s.z1 <= zMax) r = Math.max(r, s.r1)
    else r = Math.max(r, s.r0 + (s.r1 - s.r0) * ((zMax - s.z0) / (s.z1 - s.z0)))
  }
  return r
}

/**
 * Répare les règles de placement après mise à l'échelle (GDD §9.3) : 45 m entre
 * fûts, 15 m au bord, centre dégagé sur la carte d'ouverture. Petits déplacements
 * itératifs, déterministes.
 */
function relaxPlacement(towers: TowerDef[], a: number, b: number, opening: boolean): void {
  const inner = towers.filter((t) => !t.outside)
  const minSp = RULES.towerMinSpacing
  const margin = RULES.towerEdgeMargin
  for (let iter = 0; iter < 80; iter++) {
    let moved = false
    for (let i = 0; i < inner.length; i++) {
      for (let j = i + 1; j < inner.length; j++) {
        const p = inner[i]!
        const q = inner[j]!
        const dx = q.x - p.x
        const dy = q.y - p.y
        const d = Math.hypot(dx, dy)
        if (d >= minSp) continue
        const push = (minSp - d) / 2 + 0.05
        const ux = d > 1e-9 ? dx / d : 1
        const uy = d > 1e-9 ? dy / d : 0
        p.x -= ux * push
        p.y -= uy * push
        q.x += ux * push
        q.y += uy * push
        moved = true
      }
    }
    for (const t of inner) {
      const e = ellipseEdgeDistance(t.x, t.y, a, b)
      if (e < margin) {
        const k = 1 - (margin - e + 0.1) / Math.max(1, Math.hypot(t.x, t.y))
        t.x *= k
        t.y *= k
        moved = true
      }
      if (opening) {
        const d = Math.hypot(t.x, t.y)
        const clear = RULES.openingCenterClear
        if (d < clear) {
          const k = clear / Math.max(1e-6, d) + 0.001
          t.x *= k
          t.y *= k
          moved = true
        }
      }
    }
    if (!moved) break
  }
}

/**
 * Carte prête à jouer pour N oiseaux : arène (preset GDD §4.1), tours mises à
 * l'échelle (positions × (a/165, b/114), rayons des parties larges > 5 m × √(a/165),
 * hauteurs et fûts inchangés), tours retirées ou ajoutées selon N, miroir nord-sud.
 * `arenaOverride` impose une arène (lobby) : la carte n'est alors pas mise à l'échelle.
 */
export function getMap(mapId: MapId, birdCount: number, mirror = false, arenaOverride?: { a: number; b: number }): MapInfo {
  const spec = MAP_SPECS[mapId]
  const isLobby = mapId === 'lobby'
  const preset = arenaPresetFor(Math.max(1, birdCount))
  const arena = arenaOverride ?? (isLobby ? { a: RULES.lobbyArenaA, b: RULES.lobbyArenaB } : { a: preset.a, b: preset.b })
  const scaled = !isLobby && !arenaOverride
  const sx = scaled ? arena.a / REF_A : 1
  const sy = scaled ? arena.b / REF_B : 1
  const sr = scaled ? Math.pow(arena.a / REF_A, RULES.towerWideRadiusScaleExp) : 1
  const wide = RULES.towerLowMaxRadius

  const count = spec.countByPreset[scaled ? preset.index : REFERENCE_PRESET_INDEX] ?? spec.towers.length
  const outside = spec.towers.filter((t) => t.outside)
  const inside = spec.towers.filter((t) => !t.outside).slice(0, count)
  const mapSeed = hashString('map:' + mapId)

  const towers: TowerDef[] = [...outside, ...inside].map((spec, id): TowerDef => {
    const tilt = spec.tiltSouthDeg ? Math.tan(spec.tiltSouthDeg * DEG) : 0
    const segments = spec.profile.segments().map((s): TowerSegment => {
      const seg: TowerSegment = {
        z0: s.z0,
        r0: s.r0 > wide ? s.r0 * sr : s.r0,
        z1: s.z1,
        r1: s.r1 > wide ? s.r1 * sr : s.r1,
      }
      if (tilt) {
        // mât incliné vers le sud : le centre de la section recule de z·tan(tilt)
        seg.ox0 = 0
        seg.oy0 = -s.z0 * tilt
        seg.ox1 = 0
        seg.oy1 = -s.z1 * tilt
      }
      return seg
    })
    let height = 0
    for (const s of segments) height = Math.max(height, s.z1)
    return {
      id,
      x: spec.x * sx,
      y: spec.y * sy,
      archetype: spec.archetype,
      segments,
      height,
      trunkRadius: trunkRadiusOf(segments),
      outside: spec.outside ?? false,
      seed: hash32(mapSeed, id),
    }
  })

  if (scaled) relaxPlacement(towers, arena.a, arena.b, spec.opening ?? false)

  if (mirror) {
    for (const t of towers) {
      t.y = -t.y
      for (const s of t.segments) {
        if (s.oy0 !== undefined) s.oy0 = -s.oy0
        if (s.oy1 !== undefined) s.oy1 = -s.oy1
      }
    }
  }
  // positions arrondies au centimètre (lisibilité des journaux, stabilité)
  for (const t of towers) {
    t.x = Math.round(t.x * 100) / 100
    t.y = Math.round(t.y * 100) / 100
  }

  return {
    id: mapId,
    mirror,
    presetIndex: scaled ? preset.index : -1,
    arena,
    towers,
    cliff: getCliffProfile(mapId, arena),
    opening: spec.opening ?? false,
  }
}

/** Noms internes des tours d'une carte (journaux, outils). */
export function towerNames(mapId: MapId, birdCount: number): string[] {
  const spec = MAP_SPECS[mapId]
  const preset = arenaPresetFor(Math.max(1, birdCount))
  const count = spec.countByPreset[mapId === 'lobby' ? REFERENCE_PRESET_INDEX : preset.index] ?? spec.towers.length
  return [...spec.towers.filter((t) => t.outside), ...spec.towers.filter((t) => !t.outside).slice(0, count)].map((t) => t.name)
}

export const MAP_IDS: readonly MapId[] = ['parasols', 'aiguilles', 'geantes', 'cadran', 'lobby']
