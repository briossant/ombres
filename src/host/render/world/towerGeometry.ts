// Géométrie des tours (ART_BIBLE §6.6, GDD §9.1).
//
// Le CORPS est tourné (lathe) EXACTEMENT depuis TowerDef.segments : c'est lui qui
// projette l'ombre (height map) et elle coïncide avec l'ombre de gameplay. Les
// profils sont des polygones (bulbes = 4 troncs) : la silhouette reste exacte,
// mais les normales sont lissées entre troncs voisins (< 38°) pour que les bulbes
// et dômes soient ombrés « ronds » ; les arêtes vives (disques, marches) restent
// dures et reçoivent un trait d'encre.
//
// Le DÉCOR (jupe de sable, colliers, nacelles, mâts et fanions neutres, haubans,
// conduites) n'a pas d'ombre de gameplay : maillage séparé, pas de caster. Il reste
// collé aux fûts (≤ 1,5 m), dans la marge de collision des oiseaux.
import type * as THREE from 'three'
import { RULES } from '../../../sim/rules.ts'
import type { TowerArchetype, TowerDef, TowerSegment } from '../../../sim/types.ts'
import { PALETTE_CONSTANTS } from '../../../shared/players.ts'
import { towerId } from '../npr/ids.ts'
import { hexToOklab, type Vec3 } from '../npr/oklab.ts'
import { DECO, GeoBuilder, type VertexAttrs } from './geoBuilder.ts'

const C = PALETTE_CONSTANTS
const LAB = {
  cream: hexToOklab(C.towerCream),
  ochre: hexToOklab(C.towerOchre),
  terracotta: hexToOklab(C.towerTerracotta),
  turquoise: hexToOklab(C.domeTurquoise),
  cobalt: hexToOklab(C.domeCobalt),
  ink: hexToOklab('#2B1D23'),
  // variantes proches (usure, bandes) : même famille de teintes
  creamWarm: hexToOklab('#EBD7B4'),
  ochreLight: hexToOklab('#E2B777'),
  sand: hexToOklab('#F1DABE'),
  flagCream: hexToOklab('#F3E7CF'),
  flagOchre: hexToOklab('#DDB06A'),
}

const RADIAL = 48
/** Rien de décoratif sous l'altitude des disques de gameplay (les oiseaux volent en dessous). */
const RULES_WIDE_MIN_Z = RULES.towerWideMinZ
const WIDE = 5.3
const SMOOTH_DEG = 38
/** Profondeurs (m) des anneaux de cavité ajoutés sous chaque surplomb large (polish W7). */
const CAVITY_RINGS = [2, 6] as const

/** Parties d'une tour : décalage d'ID (encre aux frontières) et couleur. */
const PART = { body: 0, crown: 1, disc: 2, tip: 3 } as const

interface Pt {
  r: number
  z: number
  /** Décalage de l'axe (repère sim), tours inclinées. */
  ox: number
  oy: number
}

type SegClass = 'shaft' | 'wide' | 'taper' | 'under' | 'top' | 'tip'

interface Seg {
  a: Pt
  b: Pt
  cls: SegClass
  /** Normale de profil (radiale, verticale). */
  n: [number, number]
  part: number
  albedo: Vec3
  deco: number
  cavityA: number
  cavityB: number
  zone: [number, number]
  /**
   * Anneaux intermédiaires (altitude, cavité) : 2 et 6 m sous chaque surplomb, pour que la
   * cavité (couche croisée des hachures) ne soit pas interpolée sur des fûts de 20 m (polish W7).
   */
  inner?: Array<[number, number]>
}

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function profileOf(segments: readonly TowerSegment[]): Pt[] {
  const s0 = segments[0]!
  const pts: Pt[] = [{ r: s0.r0, z: s0.z0, ox: s0.ox0 ?? 0, oy: s0.oy0 ?? 0 }]
  for (const s of segments) pts.push({ r: s.r1, z: s.z1, ox: s.ox1 ?? 0, oy: s.oy1 ?? 0 })
  return pts
}

function classify(a: Pt, b: Pt, isLast: boolean): SegClass {
  const dz = b.z - a.z
  const dr = b.r - a.r
  if (dz < 1e-4) return dr > 0 ? 'under' : 'top'
  if (isLast && b.r < 1e-3 && a.r <= 1.6) return 'tip'
  // fût : quasi vertical (les troncs d'un bulbe dépassent 0,12) et assez long, ou étroit
  if (Math.abs(dr) / dz < 0.12 && (dz >= 4 || Math.max(a.r, b.r) <= WIDE)) return 'shaft'
  if (Math.max(a.r, b.r) > WIDE) return 'wide'
  return 'taper'
}

/** Rayon et décalage de l'axe du profil à l'altitude z (première occurrence). */
function sampleProfile(pts: readonly Pt[], z: number): Pt {
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (z >= a.z && z <= b.z && b.z > a.z) {
      const k = (z - a.z) / (b.z - a.z)
      return { r: a.r + (b.r - a.r) * k, z, ox: a.ox + (b.ox - a.ox) * k, oy: a.oy + (b.oy - a.oy) * k }
    }
  }
  const last = pts[pts.length - 1]!
  return { ...last, z }
}

// ─── Couleurs par archétype (ART_BIBLE §6.6 : crème ~50 %, ocre ~25 %, terracotta ~20 %, dômes ≤ 5 %) ──

interface Scheme {
  shaft: Vec3
  disc: (k: number) => Vec3
  crown: Vec3
  bulb: Vec3
  shaftDeco: number
}

function schemeFor(arch: TowerArchetype, r: () => number): Scheme {
  const flip = r() < 0.5
  switch (arch) {
    case 'parasol':
      return { shaft: LAB.cream, disc: () => (flip ? LAB.ochre : LAB.terracotta), crown: flip ? LAB.terracotta : LAB.ochre, bulb: LAB.ochre, shaftDeco: DECO.windows }
    case 'aiguille':
      return { shaft: LAB.terracotta, disc: () => LAB.cream, crown: LAB.cream, bulb: LAB.cream, shaftDeco: DECO.windows }
    case 'pile':
      return { shaft: LAB.cream, disc: (k) => (k % 2 === 0 ? LAB.ochre : LAB.creamWarm), crown: LAB.turquoise, bulb: LAB.ochre, shaftDeco: DECO.windows }
    case 'colonne':
      return { shaft: LAB.ochre, disc: () => LAB.terracotta, crown: LAB.cobalt, bulb: LAB.terracotta, shaftDeco: DECO.flutes }
    case 'bulbe':
      return { shaft: LAB.cream, disc: () => LAB.ochre, crown: LAB.terracotta, bulb: LAB.terracotta, shaftDeco: DECO.windows }
    case 'geante':
      return { shaft: flip ? LAB.cream : LAB.creamWarm, disc: () => LAB.ochre, crown: LAB.terracotta, bulb: LAB.terracotta, shaftDeco: DECO.windows }
    case 'gnomon':
      return { shaft: LAB.terracotta, disc: (k) => (k === 1 ? LAB.cobalt : LAB.ochre), crown: LAB.ochre, bulb: LAB.ochre, shaftDeco: DECO.bands }
    case 'cathedrale':
    default:
      return { shaft: LAB.cream, disc: (k) => [LAB.ochre, LAB.terracotta, LAB.turquoise][k % 3]!, crown: LAB.ochre, bulb: LAB.ochre, shaftDeco: DECO.windows }
  }
}

// ─── Corps ─────────────────────────────────────────────────────────────────

function profileNormal(a: Pt, b: Pt): [number, number] {
  const dr = b.r - a.r
  const dz = b.z - a.z
  const l = Math.hypot(dr, dz) || 1
  return [dz / l, -dr / l]
}

function analyseBody(t: TowerDef, pts: Pt[]): Seg[] {
  const r = rng(t.seed ^ 0x9e3779b9)
  const scheme = schemeFor(t.archetype, r)
  const segs: Seg[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    if (Math.abs(b.z - a.z) < 1e-5 && Math.abs(b.r - a.r) < 1e-5) continue
    segs.push({
      a,
      b,
      cls: classify(a, b, i + 2 === pts.length),
      n: profileNormal(a, b),
      part: PART.body,
      albedo: scheme.shaft,
      deco: DECO.plain,
      cavityA: 1,
      cavityB: 1,
      zone: [0, 0],
    })
  }
  // Groupes de « formes » : suites de segments hors fût (disques, bulbes, couronnes).
  let discIndex = 0
  let i = 0
  while (i < segs.length) {
    const s = segs[i]!
    if (s.cls === 'shaft') {
      s.part = PART.body
      s.albedo = scheme.shaft
      const len = s.b.z - s.a.z
      if (len >= 5) {
        s.deco = scheme.shaftDeco
        s.zone = [s.a.z + 2.2, s.b.z - 2.2]
      }
      i++
      continue
    }
    let j = i
    let zMin = Infinity
    let zMax = -Infinity
    let rMax = 0
    while (j < segs.length && segs[j]!.cls !== 'shaft') {
      const q = segs[j]!
      zMin = Math.min(zMin, q.a.z)
      zMax = Math.max(zMax, q.b.z)
      rMax = Math.max(rMax, q.a.r, q.b.r)
      j++
      // une marche rentrante suivie d'autre chose qu'un disque clôt la forme (disque puis dôme)
      const nx = segs[j]
      if (q.cls === 'top' && nx && nx.cls !== 'wide' && nx.cls !== 'top' && nx.cls !== 'under') break
    }
    const isCrown = j === segs.length
    const isDisc = rMax > WIDE && zMax - zMin <= 6.5
    for (let k = i; k < j; k++) {
      const q = segs[k]!
      if (q.cls === 'tip') {
        q.part = PART.tip
        q.albedo = LAB.ink
        q.deco = DECO.ink
      } else if (isDisc) {
        q.part = PART.disc
        q.albedo = scheme.disc(discIndex)
        q.deco = q.cls === 'under' ? DECO.underside : q.cls === 'top' || q.n[1] > 0.5 ? DECO.panels : DECO.plain
        if (q.deco === DECO.panels) q.zone = [rMax, 0]
      } else if (isCrown) {
        q.part = PART.crown
        q.albedo = t.archetype === 'geante' || t.archetype === 'aiguille' ? scheme.bulb : scheme.crown
        q.deco = t.archetype === 'bulbe' ? DECO.ribs : t.archetype === 'geante' && q.cls !== 'under' ? DECO.windows : DECO.plain
        if (q.deco === DECO.windows) q.zone = [q.a.z + 1.5, q.b.z - 1.5]
      } else {
        q.part = PART.crown
        q.albedo = scheme.bulb
        q.deco = t.archetype === 'bulbe' ? DECO.ribs : DECO.plain
      }
      // flèches fines : encre (ART_BIBLE : « flèche encre »)
      if (isCrown && q.cls === 'taper' && Math.max(q.a.r, q.b.r) <= 1.6 && q.b.z - q.a.z > 2) {
        q.part = PART.tip
        q.albedo = LAB.ink
        q.deco = DECO.ink
      }
    }
    if (isDisc) discIndex++
    i = j
  }
  // Cavité (AO bakée) : fût sous un surplomb large, dessous des disques.
  const overhangs = segs.filter((s) => s.cls === 'under' && s.b.r - s.a.r > 2.5).map((s) => s.a.z)
  const cav = (z: number): number => {
    let c = 1
    for (const oz of overhangs) {
      const d = oz - z
      if (d >= 0 && d < 6) c = Math.min(c, 0.18 + 0.82 * (d / 6) ** 1.3)
    }
    return c
  }
  for (const s of segs) {
    if (s.cls === 'under') {
      s.cavityA = s.cavityB = 0.3
    } else {
      s.cavityA = cav(s.a.z)
      s.cavityB = cav(s.b.z)
      if (s.b.z - s.a.z > 1) {
        const zs = new Set<number>()
        for (const oz of overhangs) for (const d of CAVITY_RINGS) if (oz - d > s.a.z + 0.25 && oz - d < s.b.z - 0.25) zs.add(oz - d)
        if (zs.size) s.inner = [...zs].sort((x, y) => x - y).map((z) => [z, cav(z)])
      }
    }
  }
  return segs
}

function smoothNormal(n0: [number, number], n1: [number, number]): [number, number] | null {
  const dot = n0[0] * n1[0] + n0[1] * n1[1]
  if (dot < Math.cos((SMOOTH_DEG * Math.PI) / 180)) return null
  const x = n0[0] + n1[0]
  const y = n0[1] + n1[1]
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}

interface Ctx {
  b: GeoBuilder
  tx: number
  ty: number
  seed: number
  idBase: number
}

/** Anneau de sommets d'un profil (r, z) avec une normale de profil. */
function ring(ctx: Ctx, p: Pt, n: [number, number], seg: Seg, cavity: number, radial = RADIAL): number {
  const first = ctx.b.vertexCount
  for (let k = 0; k < radial; k++) {
    const th = (k / radial) * Math.PI * 2
    const c = Math.cos(th)
    const s = Math.sin(th)
    const lx = p.r * c
    const lz = -p.r * s
    const attrs: VertexAttrs = {
      loc: [lx, p.z, lz, p.r],
      albedo: seg.albedo,
      deco: [ctx.idBase + seg.part, seg.deco, (ctx.seed % 997) / 997, cavity],
      zone: seg.zone,
    }
    ctx.b.vertex([ctx.tx + p.ox + lx, p.z, -(ctx.ty + p.oy) + lz], [n[0] * c, n[1], -n[0] * s], attrs)
  }
  return first
}

function bandFaces(b: GeoBuilder, lo: number, hi: number, radial = RADIAL): void {
  for (let k = 0; k < radial; k++) {
    const k1 = (k + 1) % radial
    b.quad(lo + k, lo + k1, hi + k1, hi + k)
  }
}

function buildBody(ctx: Ctx, segs: Seg[]): void {
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!
    const prev = segs[i - 1]
    const next = segs[i + 1]
    // lissage seulement entre troncs d'une même forme courbe : jamais avec une marche plate
    // (le dessus d'un disque doit rester parfaitement plat, sinon le terminateur le coupe
    // en deux au soleil rasant)
    const flat = (q: Seg) => q.cls === 'top' || q.cls === 'under'
    const canSmooth = (q: Seg | undefined): q is Seg => !!q && q.part === s.part && !flat(q) && !flat(s)
    const nA = (canSmooth(prev) && smoothNormal(prev.n, s.n)) || s.n
    const nB = (canSmooth(next) && smoothNormal(s.n, next.n)) || s.n
    let lo = ring(ctx, s.a, nA, s, s.cavityA)
    // anneaux intermédiaires (cavité exacte sous les surplombs) : même normale de segment droit
    for (const [z, c] of s.inner ?? []) {
      const k = (z - s.a.z) / (s.b.z - s.a.z)
      const p: Pt = { r: s.a.r + (s.b.r - s.a.r) * k, z, ox: s.a.ox + (s.b.ox - s.a.ox) * k, oy: s.a.oy + (s.b.oy - s.a.oy) * k }
      const n: [number, number] = [nA[0] + (nB[0] - nA[0]) * k, nA[1] + (nB[1] - nA[1]) * k]
      const l = Math.hypot(n[0], n[1]) || 1
      const mid = ring(ctx, p, [n[0] / l, n[1] / l], s, c)
      bandFaces(ctx.b, lo, mid)
      lo = mid
    }
    const hi = ring(ctx, s.b, nB, s, s.cavityB)
    bandFaces(ctx.b, lo, hi)
  }
  // sommet plat éventuel (profil qui ne se termine pas en pointe)
  const last = segs[segs.length - 1]
  if (last && last.b.r > 1e-3) {
    const cap: Seg = { ...last, n: [0, 1], cls: 'top' }
    const lo = ring(ctx, last.b, [0, 1], cap, 1)
    const c = ctx.b.vertex([ctx.tx + last.b.ox, last.b.z, -(ctx.ty + last.b.oy)], [0, 1, 0], {
      loc: [0, last.b.z, 0, 0],
      albedo: last.albedo,
      deco: [ctx.idBase + last.part, DECO.plain, 0, 1],
      zone: [0, 0],
    })
    for (let k = 0; k < RADIAL; k++) ctx.b.tri(lo + k, lo + ((k + 1) % RADIAL), c)
  }
}

// ─── Décor ─────────────────────────────────────────────────────────────────

interface DecoCtx extends Ctx {
  pts: Pt[]
}

/** Petit solide de révolution autour d'un axe vertical placé en (cx, cy) sim, depuis le pied. */
function latheDecor(
  ctx: DecoCtx,
  cx: number,
  cy: number,
  profile: Array<[number, number]>,
  albedo: Vec3,
  deco: number,
  part: number,
  radial = 20,
  cavity = 1,
): void {
  const pts: Pt[] = profile.map(([r, z]) => ({ r, z, ox: 0, oy: 0 }))
  const segs: Seg[] = []
  for (let i = 0; i + 1 < pts.length; i++) {
    const a = pts[i]!
    const b = pts[i + 1]!
    segs.push({ a, b, cls: 'shaft', n: profileNormal(a, b), part, albedo, deco, cavityA: cavity, cavityB: cavity, zone: [0, 0] })
  }
  const sub: Ctx = { ...ctx, tx: cx, ty: cy }
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]!
    const prev = segs[i - 1]
    const next = segs[i + 1]
    const nA = (prev && smoothNormal(prev.n, s.n)) || s.n
    const nB = (next && smoothNormal(s.n, next.n)) || s.n
    const lo = ringLocal(sub, ctx, s.a, nA, s, radial)
    const hi = ringLocal(sub, ctx, s.b, nB, s, radial)
    bandFaces(ctx.b, lo, hi, radial)
  }
}

/** Anneau d'un solide de décor : tloc reste relatif à l'axe de la TOUR (hachures cohérentes). */
function ringLocal(sub: Ctx, tower: DecoCtx, p: Pt, n: [number, number], seg: Seg, radial: number): number {
  const first = sub.b.vertexCount
  for (let k = 0; k < radial; k++) {
    const th = (k / radial) * Math.PI * 2
    const c = Math.cos(th)
    const s = Math.sin(th)
    const wx = sub.tx + p.r * c
    const wz = -sub.ty - p.r * s
    const axis = sampleProfile(tower.pts, p.z)
    sub.b.vertex([wx, p.z, wz], [n[0] * c, n[1], -n[0] * s], {
      loc: [wx - (tower.tx + axis.ox), p.z, wz + (tower.ty + axis.oy), Math.hypot(wx - tower.tx - axis.ox, wz + tower.ty + axis.oy)],
      albedo: seg.albedo,
      deco: [tower.idBase + seg.part, seg.deco, (tower.seed % 997) / 997, seg.cavityA],
      zone: [0, 0],
    })
  }
  return first
}

/** Cylindre fin entre deux points (mâts, haubans, conduites) : 6 faces, épaissi pour rester ≥ 1,5 px. */
function strut(ctx: DecoCtx, p0: Vec3, p1: Vec3, radius: number, albedo: Vec3, part: number, deco: number = DECO.ink): void {
  const b = ctx.b
  const d: Vec3 = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]]
  const len = Math.hypot(d[0], d[1], d[2]) || 1
  const ax: Vec3 = [d[0] / len, d[1] / len, d[2] / len]
  // base orthonormée autour de l'axe
  const up: Vec3 = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]
  const u: Vec3 = [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]]
  const ul = Math.hypot(u[0], u[1], u[2]) || 1
  u[0] /= ul
  u[1] /= ul
  u[2] /= ul
  const v: Vec3 = [ax[1] * u[2] - ax[2] * u[1], ax[2] * u[0] - ax[0] * u[2], ax[0] * u[1] - ax[1] * u[0]]
  const N = 6
  const start = b.vertexCount
  for (const [p, idx] of [
    [p0, 0],
    [p1, 1],
  ] as const) {
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2
      const c = Math.cos(th)
      const s = Math.sin(th)
      const n: Vec3 = [u[0] * c + v[0] * s, u[1] * c + v[1] * s, u[2] * c + v[2] * s]
      const w: Vec3 = [p[0] + n[0] * radius, p[1] + n[1] * radius, p[2] + n[2] * radius]
      b.vertex(w, n, {
        loc: [w[0] - ctx.tx, w[1], w[2] + ctx.ty, radius],
        albedo,
        deco: [ctx.idBase + part, deco, idx, 1],
        zone: [0, 0],
      })
    }
  }
  for (let k = 0; k < N; k++) {
    const k1 = (k + 1) % N
    b.quad(start + k, start + k1, start + N + k1, start + N + k)
  }
}

/** Fanion triangulaire neutre (double face), flottant dans le vent (mode `flag`). */
function flag(ctx: DecoCtx, mast: Vec3, len: number, height: number, albedo: Vec3, windDir: number): void {
  const b = ctx.b
  const c = Math.cos(windDir)
  const s = Math.sin(windDir)
  // plan du fanion : vertical, orienté selon le vent (repère three : x, -y sim)
  const along: Vec3 = [c, 0, -s]
  const n: Vec3 = [s, 0, c]
  const segs = 6
  for (const side of [1, -1]) {
    const nn: Vec3 = [n[0] * side, 0, n[2] * side]
    const base = b.vertexCount
    for (let k = 0; k <= segs; k++) {
      const u = k / segs
      const hw = (height / 2) * (1 - u) + 0.02
      for (const dy of [hw, -hw]) {
        const p: Vec3 = [mast[0] + along[0] * u * len, mast[1] + dy, mast[2] + along[2] * u * len]
        b.vertex(p, nn, {
          loc: [p[0] - ctx.tx, p[1], p[2] + ctx.ty, 0.2],
          albedo,
          deco: [ctx.idBase + PART.tip, DECO.flag, (ctx.seed % 97) / 97, 1],
          zone: [u, s * side],
        })
      }
    }
    for (let k = 0; k < segs; k++) {
      const a0 = base + k * 2
      const a1 = a0 + 1
      const b0 = a0 + 2
      const b1 = a0 + 3
      if (side > 0) b.quad(a0, b0, b1, a1)
      else b.quad(a0, a1, b1, b0)
    }
  }
}


/** Rampe hélicoïdale collée au fût (escalier extérieur) : bande plate qui s'enroule. */
function helix(ctx: DecoCtx, z0: number, z1: number, turns: number, width: number, phase: number, albedo: Vec3): void {
  const b = ctx.b
  const N = Math.max(24, Math.round(turns * 40))
  const th = 0.32
  const rows: number[][] = []
  for (let k = 0; k <= N; k++) {
    const u = k / N
    const a = phase + u * turns * Math.PI * 2
    const z = z0 + (z1 - z0) * u
    const p = sampleProfile(ctx.pts, z)
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const ax = ctx.tx + p.ox
    const az = -(ctx.ty + p.oy)
    const rIn = p.r - 0.05
    const rOut = p.r + width
    const ring: number[] = []
    // dessus (intérieur, extérieur), dessous (intérieur, extérieur), tranche (haut, bas)
    const pts: Array<[number, number, [number, number, number]]> = [
      [rIn, z, [0, 1, 0]],
      [rOut, z, [0, 1, 0]],
      [rIn, z - th, [0, -1, 0]],
      [rOut, z - th, [0, -1, 0]],
      [rOut, z, [c, 0, -sn]],
      [rOut, z - th, [c, 0, -sn]],
    ]
    for (const [rr, zz, n] of pts) {
      const w: Vec3 = [ax + c * rr, zz, az - sn * rr]
      ring.push(
        b.vertex(w, n, {
          loc: [w[0] - ax, zz, w[2] - az, rr],
          albedo,
          deco: [ctx.idBase + PART.disc, DECO.plain, 0, 1],
          zone: [0, 0],
        }),
      )
    }
    rows.push(ring)
  }
  for (let k = 0; k < N; k++) {
    const A = rows[k]!
    const B = rows[k + 1]!
    b.quad(A[0]!, B[0]!, B[1]!, A[1]!) // dessus
    b.quad(A[2]!, A[3]!, B[3]!, B[2]!) // dessous
    b.quad(A[5]!, B[5]!, B[4]!, A[4]!) // tranche
  }
}

/** Ailettes verticales (contreforts fins) le long d'un fût. */
function fins(ctx: DecoCtx, z0: number, z1: number, count: number, depth: number, phase: number, albedo: Vec3): void {
  const b = ctx.b
  const half = 0.16
  for (let f = 0; f < count; f++) {
    const a = phase + (f / count) * Math.PI * 2
    const c = Math.cos(a)
    const sn = Math.sin(a)
    const tx = -sn
    const tz = -c // tangente (repère three)
    const steps = 6
    const faces: number[][] = []
    for (let k = 0; k <= steps; k++) {
      const u = k / steps
      const z = z0 + (z1 - z0) * u
      const p = sampleProfile(ctx.pts, z)
      const d = depth * Math.sin(Math.PI * Math.min(1, u * 1.15)) ** 0.6 // effilée aux bouts
      const ax = ctx.tx + p.ox
      const az = -(ctx.ty + p.oy)
      const r0 = p.r - 0.05
      const r1 = p.r + d
      const v: number[] = []
      for (const [rr, side] of [
        [r0, 1],
        [r1, 1],
        [r1, -1],
        [r0, -1],
      ] as const) {
        const w: Vec3 = [ax + c * rr + tx * half * side, z, az - sn * rr + tz * half * side]
        const n: Vec3 = rr === r1 && side === 1 ? [c, 0, -sn] : [tx * side, 0, tz * side]
        v.push(b.vertex(w, n, { loc: [w[0] - ax, z, w[2] - az, rr], albedo, deco: [ctx.idBase + PART.disc, DECO.plain, 0, 1], zone: [0, 0] }))
      }
      faces.push(v)
    }
    for (let k = 0; k < steps; k++) {
      const A = faces[k]!
      const B = faces[k + 1]!
      b.quad(A[0]!, B[0]!, B[1]!, A[1]!)
      b.quad(A[1]!, B[1]!, B[2]!, A[2]!)
      b.quad(A[2]!, B[2]!, B[3]!, A[3]!)
    }
  }
}

function buildDecor(ctx: DecoCtx, t: TowerDef, segs: Seg[]): void {
  const r = rng(t.seed ^ 0x51ed270b)
  const pts = ctx.pts
  const base = pts[0]!
  const scheme = schemeFor(t.archetype, rng(t.seed ^ 0x9e3779b9))
  // 1) jupe de sable au pied (0,9-1,3 m) : le sable s'accumule contre le fût
  const skirtH = 0.9 + r() * 0.5
  latheDecor(
    ctx,
    ctx.tx + base.ox,
    ctx.ty + base.oy,
    [
      [base.r + 1.7, 0],
      [base.r + 0.9, skirtH * 0.45],
      [base.r + 0.25, skirtH],
      [base.r - 0.05, skirtH + 0.15],
    ],
    LAB.sand,
    DECO.skirt,
    PART.body,
    32,
  )
  // 2) colliers : sous chaque forme (disque, bulbe), et régulièrement sur les grands fûts
  const shafts = segs.filter((s) => s.cls === 'shaft' && s.b.z - s.a.z > 4 && s.part === PART.body)
  for (const s of shafts) {
    const zTop = s.b.z
    const nextFeature = segs[segs.indexOf(s) + 1]
    const collarAlb = nextFeature ? nextFeature.albedo : scheme.disc(0)
    const rings: number[] = []
    if (nextFeature && nextFeature.part !== PART.tip) rings.push(zTop - 0.7)
    const len = zTop - s.a.z
    if (len > 22) for (let z = s.a.z + 11 + r() * 3; z < zTop - 6; z += 10 + r() * 4) rings.push(z)
    for (const z of rings) {
      const p = sampleProfile(pts, z)
      const rr = p.r + 0.32
      latheDecor(
        ctx,
        ctx.tx + p.ox,
        ctx.ty + p.oy,
        [
          [p.r - 0.05, z - 0.35],
          [rr, z - 0.3],
          [rr, z + 0.3],
          [p.r - 0.05, z + 0.35],
        ],
        collarAlb === LAB.ink ? scheme.disc(0) : collarAlb,
        DECO.plain,
        PART.disc,
        32,
      )
    }
  }
  // 3) nacelle organique accrochée au fût (étrangeté Moebius), côté sud-ouest de préférence
  const longShaft = shafts.find((s) => s.b.z - s.a.z >= 16 && Math.max(s.a.r, s.b.r) <= 4.2)
  if (longShaft && t.archetype !== 'colonne' && r() < 0.75) {
    const z = longShaft.a.z + (longShaft.b.z - longShaft.a.z) * (0.45 + r() * 0.25)
    const p = sampleProfile(pts, z)
    const ang = (-100 + r() * 140) * (Math.PI / 180) // autour du sud (face caméra)
    const R = 1.05 + r() * 0.35
    const off = p.r + R * 0.55
    const cx = ctx.tx + p.ox + Math.cos(ang) * off
    const cy = ctx.ty + p.oy + Math.sin(ang) * off
    const podAlb = r() < 0.5 ? LAB.ochre : LAB.terracotta
    latheDecor(
      ctx,
      cx,
      cy,
      [
        [0.05, z - R * 1.25],
        [R * 0.45, z - R * 1.05],
        [R * 0.92, z - R * 0.45],
        [R, z],
        [R * 0.9, z + R * 0.45],
        [R * 0.55, z + R * 0.85],
        [0.25, z + R * 1.05],
        [0.22, z + R * 1.8],
        [0.02, z + R * 1.95],
      ],
      podAlb,
      DECO.windows,
      PART.crown,
      20,
    )
  }
  // 3 bis) étrangetés : rampe hélicoïdale (aiguilles, géantes, parfois parasols),
  //        ailettes (piles, gnomon), lanternes pendues sous les grands disques
  const tallShaft = shafts.find((s) => s.b.z - s.a.z >= 18)
  if (tallShaft && (t.archetype === 'aiguille' || t.archetype === 'geante' || (t.archetype === 'parasol' && r() < 0.45))) {
    const z0 = tallShaft.a.z + 3 + r() * 3
    const z1 = tallShaft.b.z - 3
    const turns = (z1 - z0) / (9 + r() * 5)
    helix(ctx, z0, z1, turns, 1.1, r() * Math.PI * 2, r() < 0.5 ? LAB.ochre : LAB.terracotta)
  } else if (tallShaft && (t.archetype === 'pile' || t.archetype === 'gnomon' || t.archetype === 'bulbe')) {
    fins(ctx, tallShaft.a.z + 1.5, tallShaft.b.z - 2, 3 + Math.floor(r() * 2), 0.9, r() * Math.PI, scheme.disc(1))
  }
  for (const d of segs) {
    if (d.cls !== 'under' || d.part !== PART.disc || d.b.r < 9) continue
    const n = 4 + Math.floor(r() * 3)
    for (let k = 0; k < n; k++) {
      const a = (k / n) * Math.PI * 2 + r() * 0.4
      const rr = d.b.r * (0.62 + r() * 0.2)
      const zTop = d.a.z
      const drop = 2.2 + r() * 1.8
      if (zTop - drop - 1.4 < RULES_WIDE_MIN_Z) continue
      const cx = ctx.tx + d.a.ox + Math.cos(a) * rr
      const cy = ctx.ty + d.a.oy + Math.sin(a) * rr
      strut(ctx, [cx, zTop, -cy], [cx, zTop - drop, -cy], 0.12, LAB.ink, PART.tip)
      latheDecor(
        ctx,
        cx,
        cy,
        [
          [0.05, zTop - drop - 1.3],
          [0.42, zTop - drop - 0.95],
          [0.5, zTop - drop - 0.5],
          [0.3, zTop - drop - 0.1],
          [0.08, zTop - drop],
        ],
        r() < 0.5 ? LAB.terracotta : LAB.cream,
        DECO.plain,
        PART.crown,
        10,
      )
    }
  }
  // 4) mât et fanion neutre au sommet
  const top = pts[pts.length - 1]!
  const hasTip = segs.some((s) => s.part === PART.tip)
  if (t.archetype !== 'colonne' && r() < 0.85) {
    const mastH = (hasTip ? 3.5 : 5) + r() * 3
    const p0: Vec3 = [ctx.tx + top.ox, top.z - 0.4, -(ctx.ty + top.oy)]
    const p1: Vec3 = [p0[0], top.z + mastH, p0[2]]
    strut(ctx, p0, p1, 0.3, LAB.ink, PART.tip)
    strut(ctx, [p1[0] - 0.9, p1[1] - 1.2, p1[2]], [p1[0] + 0.9, p1[1] - 1.2, p1[2]], 0.18, LAB.ink, PART.tip)
    const windDir = (15 + r() * 30) * (Math.PI / 180) // vent d'ouest : fanions vers l'est
    flag(ctx, [p1[0], p1[1] - 0.6, p1[2]], 2.6 + r() * 0.8, 1.0, r() < 0.5 ? LAB.flagCream : LAB.flagOchre, windDir)
  }
  // 5) géantes : haubans épaissis et conduite verticale
  if (t.archetype === 'geante') {
    const zA = t.height * 0.62
    const pA = sampleProfile(pts, zA)
    for (let k = 0; k < 3; k++) {
      const ang = (k / 3) * Math.PI * 2 + r() * 0.5
      const dist = 26 + r() * 10
      const top3: Vec3 = [ctx.tx + pA.ox + Math.cos(ang) * pA.r, zA, -(ctx.ty + pA.oy) - Math.sin(ang) * pA.r]
      const foot: Vec3 = [ctx.tx + Math.cos(ang) * dist, 0, -ctx.ty - Math.sin(ang) * dist]
      strut(ctx, top3, foot, 0.42, LAB.ink, PART.tip)
      latheDecor(ctx, foot[0], -foot[2], [[1.2, 0], [0.9, 0.9], [0.1, 1.4]], LAB.ochre, DECO.plain, PART.disc, 12)
    }
  }
  if (t.archetype === 'geante' || t.archetype === 'colonne') {
    const ang = -Math.PI / 2 + (r() - 0.5) * 1.2
    const zb = 1.5
    const zt = (t.archetype === 'geante' ? t.height * 0.7 : t.height * 0.55) - 1
    const pb = sampleProfile(pts, zb)
    const pt = sampleProfile(pts, zt)
    const off = 0.45
    const a0: Vec3 = [ctx.tx + pb.ox + Math.cos(ang) * (pb.r + off), zb, -(ctx.ty + pb.oy) - Math.sin(ang) * (pb.r + off)]
    const a1: Vec3 = [ctx.tx + pt.ox + Math.cos(ang) * (pt.r + off), zt, -(ctx.ty + pt.oy) - Math.sin(ang) * (pt.r + off)]
    strut(ctx, a0, a1, 0.34, LAB.ochreLight, PART.disc, DECO.plain)
  }
}

export interface TowerGeometries {
  /** Corps exacts (caster d'ombre + visibles). */
  body: THREE.BufferGeometry
  /** Décor (visible seulement). */
  decor: THREE.BufferGeometry
}

export function buildTowerGeometries(towers: readonly TowerDef[]): TowerGeometries {
  const body = new GeoBuilder()
  const decor = new GeoBuilder()
  towers.forEach((t, index) => {
    if (t.segments.length === 0) return
    const pts = profileOf(t.segments)
    const segs = analyseBody(t, pts)
    const idBase = towerId(index)
    buildBody({ b: body, tx: t.x, ty: t.y, seed: t.seed, idBase }, segs)
    buildDecor({ b: decor, tx: t.x, ty: t.y, seed: t.seed, idBase, pts }, t, segs)
  })
  return { body: body.build(), decor: decor.build() }
}
