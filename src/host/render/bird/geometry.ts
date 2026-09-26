// Maillage procédural de l'oiseau-ptérosaure (façon Arzach) et de son cavalier.
//
// Tout est construit par lofts de sections lissées le long de courbes dessinées
// (profils monotones), jamais par assemblage de primitives : un seul tube continu
// pour queue-corps-cou-tête-bec, deux ailes à profil d'aile (loft d'envergure),
// une crête, des pattes repliées, et un cavalier encapuchonné (buste, capuche,
// bras, jambes, cape, tapis de selle, mât et fanion fourchu).
//
// Repère modèle : X = gauche, Y = haut, Z = avant, en mètres. Envergure 11 m.
// Chaque sommet porte : os et poids (4 max), `aPart` (matériau), `aCoord`
// (coordonnées de surface propres à la pièce : envergure/corde de l'aile,
// longueur/travers du fanion…).
import { BufferGeometry, Float32BufferAttribute, Uint16BufferAttribute, Uint32BufferAttribute } from 'three'
import { catmullRom, distribute, profile, type V3 } from './curves.ts'
import { clamp01, smoothstep } from './math.ts'
import { BONE_INDEX, type AnchorDef, type AnchorName, type BindPositions, type BoneName } from './skeleton.ts'

/** Identifiant de pièce (attribut `aPart`) : choisit la couleur dans le matériau. */
export const PART = {
  body: 0,
  wing: 1,
  leather: 2,
  cape: 3,
  saddle: 4,
  flag: 5,
  pole: 6,
  crest: 7,
  beak: 8,
} as const

/** Niveaux de détail : `far` pour la distance de jeu (46-200 px d'envergure), `high` pour les gros plans. */
export type BirdDetail = 'far' | 'low' | 'medium' | 'high'

type Weights = Array<[BoneName, number]>

// ─── Dimensions (source unique de la forme) ────────────────────────────────

/** Envergure du maillage (m). RULES.wingspan = 11. */
export const MODEL_WINGSPAN = 11

/** Allongement du cou (m) : les clés « tête et bec » sont décalées vers l'avant. */
const NECK_EXT = 0.32
/** Décale une abscisse du cou/de la tête (clés dessinées pour un cou court). */
const nz = (z: number): number => z + NECK_EXT * clamp01((z - 1.05) / (2.3 - 1.05))
const bodyProfile = (keys: ReadonlyArray<readonly [number, number]>) => profile(keys.map(([x, y]) => [nz(x), y] as const))

const Z_TAIL = -2.55
const Z_BEAK = nz(4.15)
const TAIL_ROUND = 0.24 // longueur de l'arrondi de l'éventail

// Ligne centrale (z → y) et demi-épaisseurs du tube principal.
const bodyY = bodyProfile([
  [-2.55, 0.12],
  [-2.0, 0.1],
  [-1.2, 0.04],
  [-0.4, 0.0],
  [0.4, 0.02],
  [0.9, 0.1],
  [1.3, 0.27],
  [1.7, 0.5],
  [2.1, 0.66],
  [2.4, 0.7],
  [2.7, 0.69],
  [4.15, 0.53],
])
const bodyW = bodyProfile([
  [-2.55, 0.32],
  [-2.25, 0.32],
  [-2.0, 0.29],
  [-1.6, 0.21],
  [-1.15, 0.19],
  [-0.7, 0.3],
  [-0.2, 0.42],
  [0.25, 0.45],
  [0.7, 0.4],
  [1.05, 0.23],
  [1.4, 0.14],
  [1.8, 0.118],
  [2.1, 0.135],
  [2.32, 0.155],
  [2.52, 0.128],
  [2.68, 0.098],
  [3.2, 0.064],
  [3.8, 0.03],
  [4.15, 0.0],
])
const bodyHt = bodyProfile([
  [-2.55, 0.035],
  [-2.0, 0.04],
  [-1.6, 0.075],
  [-1.15, 0.12],
  [-0.7, 0.23],
  [-0.2, 0.31],
  [0.25, 0.33],
  [0.7, 0.3],
  [1.05, 0.2],
  [1.4, 0.13],
  [1.8, 0.11],
  [2.1, 0.14],
  [2.32, 0.172],
  [2.52, 0.15],
  [2.68, 0.11],
  [3.2, 0.058],
  [3.8, 0.026],
  [4.15, 0.0],
])
const bodyHb = bodyProfile([
  [-2.55, 0.03],
  [-2.0, 0.035],
  [-1.6, 0.07],
  [-1.15, 0.13],
  [-0.7, 0.27],
  [-0.2, 0.39],
  [0.25, 0.42],
  [0.7, 0.36],
  [1.05, 0.22],
  [1.4, 0.13],
  [1.8, 0.11],
  [2.1, 0.13],
  [2.32, 0.15],
  [2.52, 0.12],
  [2.68, 0.088],
  [3.2, 0.048],
  [3.8, 0.02],
  [4.15, 0.0],
])

// Aile gauche (x > 0) ; la droite est le miroir. x = distance à l'axe (m).
const X_ROOT = 0.16
const X_TIP = 5.5
// Vue de dessus : bord d'attaque qui avance jusqu'au poignet puis file en
// flèche vers une pointe effilée ; bord de fuite échancré près du corps (le
// corps et la queue restent lisibles entre les ailes), silhouette en « M » tendu.
const wingZle = profile([
  [0.16, 0.56],
  [1.0, 0.74],
  [2.0, 0.88],
  [2.9, 0.92],
  [3.8, 0.64],
  [4.6, 0.14],
  [5.2, -0.38],
  [5.5, -0.7],
])
const wingZte = profile([
  [0.16, -0.95],
  [0.6, -1.0],
  [1.2, -0.95],
  [2.0, -0.8],
  [2.9, -0.58],
  [3.8, -0.46],
  [4.6, -0.48],
  [5.2, -0.58],
  [5.5, -0.7],
])
const wingChord = (x: number): number => Math.max(0, wingZle(x) - wingZte(x))
const wingY = profile([
  [0.16, 0.24],
  [1.0, 0.29],
  [2.5, 0.32],
  [4.0, 0.32],
  [5.5, 0.3],
])
const wingThick = profile([
  [0.16, 0.16],
  [1.5, 0.125],
  [3.2, 0.105],
  [4.5, 0.1],
  [5.5, 0.1],
])
const wingTwistDeg = profile([
  [0.16, 2],
  [3.2, 0],
  [5.5, -4],
])

/** Articulations de l'aile (distance à l'axe). La bande de couleur est entre le poignet et le doigt. */
const J_SHOULDER = 0.34
const J_ELBOW = 1.7
const J_WRIST = 2.85
const J_FINGER = 4.25
/** Bande de couleur du joueur : 55 → 70 % de la demi-envergure (ART_BIBLE §6.7). */
export const BAND_X0 = 0.555 * X_TIP
export const BAND_X1 = 0.7 * X_TIP

const sparZ = (x: number): number => wingZle(x) - 0.25 * wingChord(x)

// ─── Constructeur de maillage ──────────────────────────────────────────────

class MeshBuilder {
  pos: number[] = []
  skinI: number[] = []
  skinW: number[] = []
  part: number[] = []
  coord: number[] = []
  idx: number[] = []
  /** Sommets dont la normale est imposée (pointes). */
  forcedNormals = new Map<number, V3>()

  /** Transformation appliquée aux sommets (échelle du cavalier). */
  xform: ((p: V3) => V3) | null = null

  vertex(p: V3, w: Weights, part: number, u: number, v: number): number {
    if (this.xform) p = this.xform(p)
    this.pos.push(p[0], p[1], p[2])
    const ws = w
      .filter(([, x]) => x > 1e-4)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
    const sum = ws.reduce((s, [, x]) => s + x, 0) || 1
    for (let k = 0; k < 4; k++) {
      const e = ws[k]
      this.skinI.push(e ? BONE_INDEX[e[0]] : 0)
      this.skinW.push(e ? e[1] / sum : 0)
    }
    this.part.push(part)
    this.coord.push(u, v)
    return this.pos.length / 3 - 1
  }

  /**
   * Relie des anneaux de sommets (même longueur) en surface ; `closed` referme
   * chaque anneau. Oriente automatiquement les faces vers l'extérieur.
   */
  strip(rings: number[][], closed: boolean, apexStart?: number, apexEnd?: number): void {
    const first = this.idx.length
    const m = rings[0]!.length
    const segs = closed ? m : m - 1
    for (let i = 0; i < rings.length - 1; i++) {
      const a = rings[i]!
      const b = rings[i + 1]!
      for (let j = 0; j < segs; j++) {
        const j2 = (j + 1) % m
        this.idx.push(a[j]!, b[j]!, a[j2]!, a[j2]!, b[j]!, b[j2]!)
      }
    }
    if (apexStart !== undefined) {
      const r = rings[0]!
      for (let j = 0; j < segs; j++) this.idx.push(apexStart, r[(j + 1) % m]!, r[j]!)
    }
    if (apexEnd !== undefined) {
      const r = rings[rings.length - 1]!
      for (let j = 0; j < segs; j++) this.idx.push(apexEnd, r[j]!, r[(j + 1) % m]!)
    }
    // Orientation : volume signé par rapport au barycentre de la pièce.
    const verts = new Set<number>()
    for (let k = first; k < this.idx.length; k++) verts.add(this.idx[k]!)
    let cx = 0
    let cy = 0
    let cz = 0
    for (const v of verts) {
      cx += this.pos[v * 3]!
      cy += this.pos[v * 3 + 1]!
      cz += this.pos[v * 3 + 2]!
    }
    cx /= verts.size
    cy /= verts.size
    cz /= verts.size
    let vol = 0
    for (let k = first; k < this.idx.length; k += 3) {
      const p = (n: number, c: number) => this.pos[this.idx[k + n]! * 3 + c]!
      const ax = p(0, 0) - cx
      const ay = p(0, 1) - cy
      const az = p(0, 2) - cz
      const bx = p(1, 0) - cx
      const by = p(1, 1) - cy
      const bz = p(1, 2) - cz
      const qx = p(2, 0) - cx
      const qy = p(2, 1) - cy
      const qz = p(2, 2) - cz
      vol += ax * (by * qz - bz * qy) - ay * (bx * qz - bz * qx) + az * (bx * qy - by * qx)
    }
    if (vol < 0) {
      for (let k = first; k < this.idx.length; k += 3) {
        const t = this.idx[k + 1]!
        this.idx[k + 1] = this.idx[k + 2]!
        this.idx[k + 2] = t
      }
    }
  }

  build(): BufferGeometry {
    const g = new BufferGeometry()
    g.setAttribute('position', new Float32BufferAttribute(this.pos, 3))
    g.setAttribute('skinIndex', new Uint16BufferAttribute(this.skinI, 4))
    g.setAttribute('skinWeight', new Float32BufferAttribute(this.skinW, 4))
    g.setAttribute('aPart', new Float32BufferAttribute(this.part, 1))
    g.setAttribute('aCoord', new Float32BufferAttribute(this.coord, 2))
    g.setIndex(this.pos.length / 3 > 65535 ? new Uint32BufferAttribute(this.idx, 1) : new Uint16BufferAttribute(this.idx, 1))
    g.computeVertexNormals()
    const n = g.getAttribute('normal') as Float32BufferAttribute
    for (const [v, d] of this.forcedNormals) {
      const l = Math.hypot(d[0], d[1], d[2]) || 1
      n.setXYZ(v, d[0] / l, d[1] / l, d[2] / l)
    }
    return g
  }
}

interface TubeSpec {
  /** Nombre d'intervalles le long du tube. */
  n: number
  /** Points par anneau. */
  m: number
  center: (t: number) => V3
  /** Vecteur de référence « haut » du repère des sections (défaut +Y). */
  ref?: V3
  /** Section : point 2D (le long de S, le long de U) pour l'angle a ∈ [0, 2π). */
  section: (t: number, a: number) => [number, number]
  weights: (t: number, p: V3) => Weights
  part: number
  coord?: (t: number, a: number) => [number, number]
  density?: (t: number) => number
  apexStart?: boolean
  apexEnd?: boolean
}

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]]
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1
  return [a[0] / l, a[1] / l, a[2] / l]
}

function tube(mb: MeshBuilder, s: TubeSpec): void {
  const ts = distribute(s.n, s.density ?? (() => 1))
  const rings: number[][] = []
  let apexS: number | undefined
  let apexE: number | undefined
  const ref = s.ref ?? [0, 1, 0]
  for (let i = 0; i <= s.n; i++) {
    const t = ts[i]!
    const c = s.center(t)
    const T = norm(sub(s.center(Math.min(1, t + 1e-3)), s.center(Math.max(0, t - 1e-3))))
    if ((i === 0 && s.apexStart) || (i === s.n && s.apexEnd)) {
      const [u, v] = s.coord ? s.coord(t, 0) : [t, 0]
      const vi = mb.vertex(c, s.weights(t, c), s.part, u, v)
      mb.forcedNormals.set(vi, i === 0 ? [-T[0], -T[1], -T[2]] : T)
      if (i === 0) apexS = vi
      else apexE = vi
      continue
    }
    let S = cross(ref, T)
    if (Math.hypot(S[0], S[1], S[2]) < 1e-4) S = cross(Math.abs(T[0]) < 0.9 ? [1, 0, 0] : [0, 1, 0], T)
    S = norm(S)
    const U = norm(cross(T, S))
    const ring: number[] = []
    for (let j = 0; j < s.m; j++) {
      const a = (j / s.m) * Math.PI * 2
      const [sx, sy] = s.section(t, a)
      const p: V3 = [c[0] + S[0] * sx + U[0] * sy, c[1] + S[1] * sx + U[1] * sy, c[2] + S[2] * sx + U[2] * sy]
      const [u, v] = s.coord ? s.coord(t, a) : [t, a / (Math.PI * 2)]
      ring.push(mb.vertex(p, s.weights(t, p), s.part, u, v))
    }
    rings.push(ring)
  }
  mb.strip(rings, true, apexS, apexE)
}

/** Poids le long d'une chaîne d'articulations (coordonnée 1D), fondu lissé de ±h autour de chaque articulation. */
function chainWeights(x: number, bones: readonly BoneName[], joints: readonly number[], h: readonly number[]): Weights {
  // bones[k] gouverne [joints[k-1], joints[k]] ; joints a bones.length - 1 éléments.
  for (let j = 0; j < joints.length; j++) {
    const c = joints[j]!
    if (Math.abs(x - c) < h[j]!) {
      const t = smoothstep(c - h[j]!, c + h[j]!, x)
      return [
        [bones[j]!, 1 - t],
        [bones[j + 1]!, t],
      ]
    }
  }
  let k = 0
  while (k < joints.length && x >= joints[k]!) k++
  return [[bones[k]!, 1]]
}

// ─── Pièces ────────────────────────────────────────────────────────────────

interface Res {
  body: number
  bodyM: number
  wing: number
  wingM: number
  small: number
  /** Facteur sur le nombre de points par anneau des petites pièces. */
  ringK: number
  /** Omet les pièces invisibles au loin (pattes, crête, bras et jambes du cavalier, fanion). */
  lean: boolean
}

const RES: Record<BirdDetail, Res> = {
  far: { body: 30, bodyM: 10, wing: 18, wingM: 5, small: 0.3, ringK: 0.6, lean: true },
  low: { body: 40, bodyM: 12, wing: 24, wingM: 7, small: 0.6, ringK: 0.8, lean: false },
  medium: { body: 64, bodyM: 16, wing: 34, wingM: 9, small: 0.8, ringK: 1, lean: false },
  high: { body: 88, bodyM: 20, wing: 44, wingM: 11, small: 1, ringK: 1, lean: false },
}

/** Points par anneau d'une petite pièce selon le niveau de détail. */
const rm = (r: Res, m: number): number => Math.max(5, Math.round(m * r.ringK))

/** Fondu d'arrondi elliptique à une extrémité du tube (1 loin du bout, 0 au bout). */
const roundEnd = (d: number, len: number): number => (d >= len ? 1 : Math.sqrt(Math.max(0, 1 - ((len - d) / len) ** 2)))

function bodyWeights(z: number): Weights {
  // tail2 | tail1 | pelvis | root | chest | neck1 | neck2 | neck3 | head
  return chainWeights(
    z,
    ['tail2', 'tail1', 'pelvis', 'root', 'chest', 'neck1', 'neck2', 'neck3', 'head'],
    [-1.8, -1.1, -0.55, 0.3, 1.0, nz(1.45), nz(1.85), nz(2.2)],
    [0.35, 0.35, 0.4, 0.45, 0.25, 0.22, 0.2, 0.14],
  )
}

function buildBody(mb: MeshBuilder, r: Res): void {
  const len = Z_BEAK - Z_TAIL
  const zAt = (t: number) => Z_TAIL + t * len
  tube(mb, {
    n: r.body,
    m: r.bodyM,
    center: t => [0, bodyY(zAt(t)), zAt(t)],
    section: (t, a) => {
      const z = zAt(t)
      const k = roundEnd(z - Z_TAIL, TAIL_ROUND)
      const w = bodyW(z) * k
      const s = Math.sin(a)
      const h = (s >= 0 ? bodyHt(z) : bodyHb(z)) * Math.max(k, 0.15 * k + 0.85 * Math.sqrt(k))
      // Section légèrement « carrée » sur le corps (dos plat, ligne claire).
      const sq = 0.18 * smoothstep(-1.5, -0.9, z) * (1 - smoothstep(0.8, 1.3, z))
      const c = Math.cos(a)
      const cc = Math.sign(c) * Math.abs(c) ** (1 - sq)
      return [w * cc, h * s]
    },
    weights: t => bodyWeights(zAt(t)),
    part: PART.body,
    coord: (t, a) => [zAt(t), a / (Math.PI * 2)],
    // Plus dense à l'éventail, au cou, à la tête et à la pointe du bec.
    density: t => {
      const z = zAt(t)
      return 1 + 2.2 * Math.exp(-(((z - Z_TAIL) / 0.25) ** 2)) + 0.8 * Math.exp(-(((z - 1.1) / 0.4) ** 2)) + 1.2 * Math.exp(-(((z - nz(2.4)) / 0.35) ** 2)) + 0.8 * Math.exp(-(((z - Z_BEAK) / 0.3) ** 2))
    },
    apexStart: true,
    apexEnd: true,
  })
}

/** Tag de pièce pour le bec (couleur légèrement plus chaude en gros plan). */
function buildCrest(mb: MeshBuilder, r: Res): void {
  const c = catmullRom([
    [0, 0.72, nz(2.46)],
    [0, 0.8, nz(2.26)],
    [0, 0.89, nz(2.0) - 0.05],
    [0, 0.98, nz(1.72) - 0.1],
  ])
  tube(mb, {
    n: Math.round(14 * r.small) + 4,
    m: rm(r, 8),
    center: c,
    ref: [1, 0, 0],
    section: (t, a) => {
      const h = 0.12 * (1 - t ** 1.6) + 0.004
      const w = 0.032 * (1 - 0.6 * t) + 0.004
      // Repère : S = ref × T ≈ vertical, U ≈ côté.
      return [h * Math.cos(a), w * Math.sin(a)]
    },
    weights: () => [['head', 1]],
    part: PART.crest,
    apexEnd: true,
    apexStart: true,
  })
}

function buildWing(mb: MeshBuilder, r: Res, side: 1 | -1): void {
  const L = side > 0 ? 'L' : 'R'
  const bones = ['chest', `shoulder${L}`, `elbow${L}`, `wrist${L}`, `finger${L}`] as BoneName[]
  const joints = [X_ROOT + 0.25, J_ELBOW, J_WRIST, J_FINGER]
  const halfW = [0.22, 0.34, 0.3, 0.28]
  // Stations d'envergure, resserrées à l'emplanture, aux articulations, à la bande et à la pointe.
  const xs = distribute(r.wing, t => {
    const x = X_ROOT + t * (X_TIP - X_ROOT)
    let d = 1 + 1.5 * t * t
    for (const j of [J_ELBOW, J_WRIST, J_FINGER, BAND_X0, BAND_X1]) d += 0.9 * Math.exp(-(((x - j) / 0.18) ** 2))
    return d
  }).map(t => X_ROOT + t * (X_TIP - X_ROOT))
  const K = r.wingM // points par face
  // Abscisses de corde en espacement cosinus (serrées au bord d'attaque).
  const xc: number[] = []
  for (let k = 0; k <= K; k++) xc.push(0.5 * (1 - Math.cos((Math.PI * k) / K)))
  const rings: number[][] = []
  let apex: number | undefined
  let rootApex: number | undefined
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i]!
    const u = (x - X_ROOT) / (X_TIP - X_ROOT)
    const w = chainWeights(x, bones, joints, halfW)
    const le: V3 = [x * side, wingY(x) + 0.02 * Math.sin(Math.PI * u), wingZle(x)]
    if (i === xs.length - 1) {
      apex = mb.vertex(le, w, PART.wing, 1, 0)
      mb.forcedNormals.set(apex, [side, 0, -0.6])
      continue
    }
    const c = wingChord(x)
    const th = wingThick(x)
    const tw = (wingTwistDeg(x) * Math.PI) / 180
    const cd: V3 = [0, -Math.sin(tw), -Math.cos(tw)] // direction de corde (vers l'arrière)
    const up: V3 = [0, Math.cos(tw), -Math.sin(tw)]
    const camber = 0.045
    const p = 0.35
    const ring: number[] = []
    const pushPt = (q: number, upper: boolean) => {
      // NACA 4 chiffres, bord de fuite épaissi (le liseré d'encre a besoin d'un peu de matière).
      const yt = 5 * th * (0.2969 * Math.sqrt(q) - 0.126 * q - 0.3516 * q * q + 0.2843 * q ** 3 - 0.1015 * q ** 4)
      const yc = q < p ? (camber / (p * p)) * (2 * p * q - q * q) : (camber / ((1 - p) * (1 - p))) * (1 - 2 * p + 2 * p * q - q * q)
      const half = Math.max(yt * c, 0.009 * (1 - q) + 0.006)
      const off = yc * c + (upper ? half : -half)
      const pt: V3 = [le[0] + cd[0] * q * c + up[0] * off, le[1] + cd[1] * q * c + up[1] * off, le[2] + cd[2] * q * c + up[2] * off]
      ring.push(mb.vertex(pt, w, PART.wing, u, q))
    }
    if (i === 0) {
      // Emplanture fermée (cachée dans le corps, mais le bord de fuite en dépasse).
      const mid: V3 = [le[0] + cd[0] * 0.45 * c, le[1] + cd[1] * 0.45 * c, le[2] + cd[2] * 0.45 * c]
      rootApex = mb.vertex(mid, w, PART.wing, 0, 0.45)
      mb.forcedNormals.set(rootApex, [-side, 0, 0])
    }
    for (let k = K; k >= 0; k--) pushPt(xc[k]!, true) // extrados : bord de fuite → bord d'attaque
    for (let k = 1; k < K; k++) pushPt(xc[k]!, false) // intrados : bord d'attaque → bord de fuite
    rings.push(ring)
  }
  mb.strip(rings, true, rootApex, apex)
}

function buildLegs(mb: MeshBuilder, r: Res, side: 1 | -1): void {
  const L = side > 0 ? 'L' : 'R'
  const thigh = catmullRom([
    [0.14 * side, -0.12, -0.45],
    [0.22 * side, -0.24, -0.78],
    [0.26 * side, -0.26, -1.08],
  ])
  tube(mb, {
    n: Math.round(10 * r.small) + 3,
    m: rm(r, 8),
    center: thigh,
    section: (t, a) => {
      const rr = 0.11 * (1 - 0.45 * t) * roundEnd(t, 0.12)
      return [rr * Math.cos(a), rr * 0.9 * Math.sin(a)]
    },
    weights: t => (t < 0.2 ? [['pelvis', 1 - t / 0.2], [`thigh${L}` as BoneName, t / 0.2]] : [[`thigh${L}` as BoneName, 1]]),
    part: PART.body,
    apexStart: true,
    apexEnd: true,
  })
  const shin = catmullRom([
    [0.26 * side, -0.26, -1.04],
    [0.27 * side, -0.24, -1.4],
    [0.25 * side, -0.2, -1.72],
    [0.23 * side, -0.16, -1.9],
  ])
  tube(mb, {
    n: Math.round(12 * r.small) + 3,
    m: rm(r, 7),
    center: shin,
    section: (t, a) => {
      // Tibia fin puis pied aplati (griffes jointes).
      const foot = smoothstep(0.62, 0.8, t)
      const w = (0.05 * (1 - 0.3 * t) + 0.05 * foot * (1 - t)) * roundEnd(1 - t, 0.12) * roundEnd(t, 0.05)
      const h = 0.05 * (1 - 0.35 * t) * (1 - 0.45 * foot) * roundEnd(1 - t, 0.12) * roundEnd(t, 0.05)
      return [w * Math.cos(a), h * Math.sin(a)]
    },
    weights: () => [[`shin${L}` as BoneName, 1]],
    part: PART.beak,
    apexStart: true,
    apexEnd: true,
  })
}

// ─── Cavalier ──────────────────────────────────────────────────────────────

/** Hauteur du dos de l'oiseau sous le cavalier. */
const RIDER_Z = 0.74
const backTop = (z: number) => bodyY(z) + bodyHt(z)

function buildSaddle(mb: MeshBuilder, r: Res): void {
  // Tapis de selle : loft en travers du dos (le long d'un arc qui épouse le corps
  // puis s'évase de chaque côté), section elliptique aplatie (longueur 0,74 m).
  const z0 = RIDER_Z - 0.02
  const w = bodyW(z0)
  const ht = bodyHt(z0)
  const yc = bodyY(z0)
  const arc = (t: number): V3 => {
    // t ∈ [0, 1] de la droite à la gauche ; angle 0 = côté gauche, π/2 = dessus.
    const s = t * 2 - 1
    const a = Math.PI / 2 - s * (Math.PI / 2 + 0.3)
    const off = 0.035
    let x = (w + off) * Math.cos(a)
    let y = yc + (ht + off) * Math.sin(a)
    // Rabats rigides qui débordent du corps (lisibles vus de dessus).
    const flare = smoothstep(0.62, 1, Math.abs(s))
    x += Math.sign(s || 1) * flare * 0.2
    y += flare * 0.06
    return [x, y, z0]
  }
  tube(mb, {
    n: Math.round(18 * r.small) + 6,
    m: rm(r, 12),
    center: arc,
    ref: [0, 0, 1],
    section: (t, a) => {
      const k = roundEnd(t, 0.035) * roundEnd(1 - t, 0.035)
      // S = Z × T : épaisseur ; U : longueur (z). Bord légèrement carré.
      const c = Math.cos(a)
      const s = Math.sin(a)
      return [0.03 * c * k, 0.37 * Math.sign(s) * Math.abs(s) ** 0.7 * k]
    },
    weights: () => [['chest', 1]],
    part: PART.saddle,
    coord: (t, a) => [t, Math.sin(a)],
    apexStart: true,
    apexEnd: true,
  })
}

/** Le cavalier est « minuscule » : toutes ses pièces sont réduites autour de la selle. */
const RIDER_SCALE = 0.74
function riderXf(p: V3): V3 {
  const sy = backTop(RIDER_Z) + 0.03
  return [p[0] * RIDER_SCALE, sy + (p[1] - sy) * RIDER_SCALE, RIDER_Z + (p[2] - RIDER_Z) * RIDER_SCALE]
}

function buildRider(mb: MeshBuilder, r: Res): void {
  const seatY = backTop(RIDER_Z) + 0.06
  const rw = (): Weights => [['rider', 1]]
  // Buste (cuir), légèrement penché vers l'avant.
  const torso = catmullRom([
    [0, seatY - 0.02, RIDER_Z - 0.02],
    [0, seatY + 0.2, RIDER_Z],
    [0, seatY + 0.4, RIDER_Z + 0.05],
    [0, seatY + 0.52, RIDER_Z + 0.07],
  ])
  const tw = profile([
    [0, 0.17],
    [0.3, 0.145],
    [0.75, 0.2],
    [1, 0.09],
  ])
  const td = profile([
    [0, 0.14],
    [0.3, 0.115],
    [0.75, 0.13],
    [1, 0.08],
  ])
  tube(mb, {
    n: Math.round(12 * r.small) + 4,
    m: rm(r, 12),
    center: torso,
    ref: [0, 0, 1],
    // ref = Z : S = Z × T ≈ -X… on reste symétrique, peu importe le signe.
    section: (t, a) => [tw(t) * Math.cos(a), td(t) * Math.sin(a)],
    weights: rw,
    part: PART.leather,
    coord: t => [t, 0],
    apexStart: true,
  })
  // Capuche : monte au-dessus de la tête puis file en pointe vers l'arrière.
  const hy = seatY + 0.5
  const hood = catmullRom([
    [0, hy - 0.04, RIDER_Z + 0.08],
    [0, hy + 0.14, RIDER_Z + 0.08],
    [0, hy + 0.27, RIDER_Z + 0.02],
    [0, hy + 0.3, RIDER_Z - 0.14],
    [0, hy + 0.27, RIDER_Z - 0.3],
  ])
  const hr = profile([
    [0, 0.1],
    [0.28, 0.135],
    [0.5, 0.12],
    [0.75, 0.06],
    [1, 0],
  ])
  tube(mb, {
    n: Math.round(14 * r.small) + 4,
    m: rm(r, 12),
    center: hood,
    ref: [1, 0, 0],
    section: (t, a) => [hr(t) * Math.cos(a), hr(t) * 0.95 * Math.sin(a)],
    weights: rw,
    part: PART.leather,
    coord: t => [t + 2, 0], // u > 2 : capuche (ouverture du visage dessinée dans le matériau)
    apexStart: true,
    apexEnd: true,
  })
  if (r.lean) return
  for (const side of [1, -1] as const) {
    // Bras vers les rênes (à la base du cou).
    const arm = catmullRom([
      [0.17 * side, seatY + 0.4, RIDER_Z + 0.05],
      [0.2 * side, seatY + 0.26, RIDER_Z + 0.22],
      [0.12 * side, seatY + 0.2, RIDER_Z + 0.42],
    ])
    tube(mb, {
      n: Math.round(8 * r.small) + 3,
      m: rm(r, 7),
      center: arm,
      section: (t, a) => {
        const rr = 0.055 * (1 - 0.25 * t)
        return [rr * Math.cos(a), rr * Math.sin(a)]
      },
      weights: rw,
      part: PART.leather,
      coord: () => [1, 0],
      apexStart: true,
      apexEnd: true,
    })
    // Jambes à califourchon sur le tapis.
    const leg = catmullRom([
      [0.1 * side, seatY + 0.02, RIDER_Z],
      [0.3 * side, seatY - 0.06, RIDER_Z + 0.12],
      [0.47 * side, seatY - 0.2, RIDER_Z + 0.14],
      [0.52 * side, seatY - 0.42, RIDER_Z + 0.04],
    ])
    tube(mb, {
      n: Math.round(9 * r.small) + 3,
      m: rm(r, 7),
      center: leg,
      section: (t, a) => {
        const rr = 0.07 * (1 - 0.3 * t)
        return [rr * Math.cos(a), rr * Math.sin(a)]
      },
      weights: rw,
      part: PART.leather,
      coord: () => [1, 0],
      apexStart: true,
      apexEnd: true,
    })
  }
}

function buildCape(mb: MeshBuilder, r: Res): void {
  const seatY = backTop(RIDER_Z) + 0.06
  // Cape-manteau : nouée sous la capuche, elle couvre les épaules et le dos,
  // puis file derrière le cavalier, portée par le vent.
  const top: V3 = [0, seatY + 0.5, RIDER_Z - 0.07]
  const c = catmullRom([
    top,
    [0, seatY + 0.32, RIDER_Z - 0.15],
    [0, seatY + 0.16, RIDER_Z - 0.46],
    [0, seatY + 0.1, RIDER_Z - 0.95],
  ])
  const hw = profile([
    [0, 0.2],
    [0.18, 0.27],
    [1, 0.4],
  ])
  tube(mb, {
    n: Math.round(14 * r.small) + 5,
    m: rm(r, 12),
    center: c,
    section: (t, a) => {
      const k = roundEnd(1 - t, 0.08)
      const w = hw(t) * (0.35 + 0.65 * k)
      const x = w * Math.cos(a)
      // Section en arc (la cape enveloppe les épaules en haut, s'aplatit ensuite).
      const arch = (0.26 * (1 - t) ** 1.5 + 0.06) * (x / w) ** 2
      return [x, 0.022 * Math.sin(a) * k - arch]
    },
    weights: t => {
      if (t < 0.08) return [['rider', 1 - t / 0.08], ['cape1', t / 0.08]]
      const b = smoothstep(0.35, 0.62, t)
      return [
        ['cape1', 1 - b],
        ['cape2', b],
      ]
    },
    part: PART.cape,
    coord: (t, a) => [t, Math.cos(a)],
    apexStart: true,
    apexEnd: true,
  })
}

/** Géométrie du mât et du fanion (positions exportées pour placer les os). */
const POLE_BASE: V3 = [0, 0.0, RIDER_Z - 0.16]
const POLE_TOP_Y = 2.62
const FLAG_Y = 2.4
const FLAG_LEN = 1.8

function buildPennant(mb: MeshBuilder, r: Res): void {
  const seatY = backTop(RIDER_Z) + 0.06
  const base: V3 = [0, seatY + 0.26, POLE_BASE[2]]
  const top: V3 = [0, POLE_TOP_Y, RIDER_Z - 0.38]
  tube(mb, {
    n: Math.round(8 * r.small) + 4,
    m: rm(r, 6),
    center: t => [0, base[1] + (top[1] - base[1]) * t, base[2] + (top[2] - base[2]) * t],
    ref: [0, 0, 1],
    section: (t, a) => {
      // Mât fin terminé par un pommeau.
      const knob = Math.exp(-(((t - 0.965) / 0.025) ** 2))
      const rr = 0.032 * (1 - 0.3 * t) + 0.04 * knob
      return [rr * Math.cos(a), rr * Math.sin(a)]
    },
    weights: () => [['pole', 1]],
    part: PART.pole,
    apexStart: true,
    apexEnd: true,
  })
  // Fanion : flamme de 1,8 × 0,35 m, fourchue. Corps + deux langues.
  const zAt = (t: number) => top[2] + 0.02 - t * FLAG_LEN
  const flagW = (t: number): Weights => {
    const b = smoothstep(0.25, 0.55, t)
    return [
      ['pen1', 1 - b],
      ['pen2', b],
    ]
  }
  tube(mb, {
    n: Math.round(12 * r.small) + 4,
    m: rm(r, 10),
    center: t => [0, FLAG_Y - 0.025 * t, zAt(t * 0.66)],
    section: (t, a) => {
      const h = (0.175 - 0.05 * t) * roundEnd(1 - t, 0.06) * roundEnd(t, 0.02)
      // S = Y × T : côté (x) ; U : vertical.
      return [0.014 * Math.cos(a) * Math.min(1, h / 0.02 + 0.2), h * Math.sin(a)]
    },
    weights: t => flagW(t * 0.66),
    part: PART.flag,
    coord: (t, a) => [(t * 0.66 * FLAG_LEN) / FLAG_LEN, Math.sin(a)],
    apexStart: true,
    apexEnd: true,
  })
  for (const s of [1, -1] as const) {
    const y0 = FLAG_Y + s * 0.075
    const y1 = FLAG_Y + s * 0.11 - 0.03
    tube(mb, {
      n: Math.round(9 * r.small) + 3,
      m: rm(r, 8),
      center: t => [0, y0 + (y1 - y0) * t, zAt(0.52 + 0.48 * t)],
      section: (t, a) => {
        const h = 0.085 * (1 - t) ** 0.9 * roundEnd(t, 0.05)
        return [0.012 * Math.cos(a), h * Math.sin(a)]
      },
      weights: () => [['pen2', 1]],
      part: PART.flag,
      coord: (t, a) => [0.52 + 0.48 * t, Math.sin(a) * 0.5 + s * 0.5],
      apexStart: true,
      apexEnd: true,
    })
  }
}

// ─── Assemblage ────────────────────────────────────────────────────────────

export interface BirdModel {
  geometry: BufferGeometry
  bind: BindPositions
  anchors: Record<AnchorName, AnchorDef>
  /** Centre de l'œil gauche (repère modèle) pour le matériau. */
  eye: V3
  /** Bornes de la bande colorée (distance à l'axe, m). */
  band: [number, number]
  /** Ouverture du visage dans la capuche : (x, y) du centre, z minimal, inutilisé. */
  face: [number, number, number, number]
  /** Coordonnées de la pointe de l'aile, de l'emplanture (repère modèle, aile gauche). */
  wingRootX: number
  wingTipX: number
}

export function buildBirdModel(detail: BirdDetail = 'high'): BirdModel {
  const r = RES[detail]
  const mb = new MeshBuilder()
  buildBody(mb, r)
  if (!r.lean) buildCrest(mb, r)
  buildWing(mb, r, 1)
  buildWing(mb, r, -1)
  if (!r.lean) {
    buildLegs(mb, r, 1)
    buildLegs(mb, r, -1)
  }
  buildSaddle(mb, r)
  mb.xform = riderXf
  buildRider(mb, r)
  buildCape(mb, r)
  if (!r.lean) buildPennant(mb, r)
  mb.xform = null
  const geometry = mb.build()
  geometry.computeBoundingSphere()
  geometry.computeBoundingBox()

  const seatY = backTop(RIDER_Z) + 0.06
  const bind: BindPositions = {
    root: [0, 0.05, 0],
    pelvis: [0, 0.02, -0.55],
    tail1: [0, bodyY(-1.1), -1.1],
    tail2: [0, bodyY(-1.8), -1.8],
    thighL: [0.14, -0.12, -0.45],
    shinL: [0.26, -0.26, -1.06],
    thighR: [-0.14, -0.12, -0.45],
    shinR: [-0.26, -0.26, -1.06],
    chest: [0, bodyY(0.3), 0.3],
    neck1: [0, bodyY(1.0), 1.0],
    neck2: [0, bodyY(nz(1.45)), nz(1.45)],
    neck3: [0, bodyY(nz(1.85)), nz(1.85)],
    head: [0, bodyY(nz(2.2)), nz(2.2)],
    shoulderL: [J_SHOULDER, wingY(J_SHOULDER), sparZ(J_SHOULDER)],
    elbowL: [J_ELBOW, wingY(J_ELBOW), sparZ(J_ELBOW)],
    wristL: [J_WRIST, wingY(J_WRIST), sparZ(J_WRIST)],
    fingerL: [J_FINGER, wingY(J_FINGER), sparZ(J_FINGER)],
    shoulderR: [-J_SHOULDER, wingY(J_SHOULDER), sparZ(J_SHOULDER)],
    elbowR: [-J_ELBOW, wingY(J_ELBOW), sparZ(J_ELBOW)],
    wristR: [-J_WRIST, wingY(J_WRIST), sparZ(J_WRIST)],
    fingerR: [-J_FINGER, wingY(J_FINGER), sparZ(J_FINGER)],
    rider: riderXf([0, seatY, RIDER_Z]),
    cape1: riderXf([0, seatY + 0.48, RIDER_Z - 0.08]),
    cape2: riderXf([0, seatY + 0.2, RIDER_Z - 0.36]),
    pole: riderXf([0, seatY + 0.26, POLE_BASE[2]]),
    pen1: riderXf([0, FLAG_Y, RIDER_Z - 0.38]),
    pen2: riderXf([0, FLAG_Y - 0.01, RIDER_Z - 0.38 - 0.62]),
  }
  const eyeZ = nz(2.36)
  const eyeA = 0.5
  const eye: V3 = [bodyW(eyeZ) * Math.cos(eyeA) * 0.98, bodyY(eyeZ) + bodyHt(eyeZ) * Math.sin(eyeA) * 0.98, eyeZ]
  const anchors: Record<AnchorName, AnchorDef> = {
    tail: { bone: 'tail2', pos: [0, bodyY(Z_TAIL) + 0.02, Z_TAIL + 0.05] },
    tipL: { bone: 'fingerL', pos: [X_TIP, wingY(X_TIP), wingZle(X_TIP)] },
    tipR: { bone: 'fingerR', pos: [-X_TIP, wingY(X_TIP), wingZle(X_TIP)] },
    head: { bone: 'head', pos: [0, bodyY(nz(2.3)), nz(2.3)] },
    beak: { bone: 'head', pos: [0, bodyY(Z_BEAK), Z_BEAK] },
    riderTop: { bone: 'rider', pos: riderXf([0, seatY + 0.85, RIDER_Z - 0.05]) },
    chest: { bone: 'chest', pos: [0, bodyY(0.2), 0.2] },
  }
  const fc = riderXf([0, seatY + 0.6, RIDER_Z + 0.12])
  const face: [number, number, number, number] = [0, fc[1], fc[2], 0]
  return { geometry, bind, anchors, eye, face, band: [BAND_X0, BAND_X1], wingRootX: X_ROOT, wingTipX: X_TIP }
}

/** Utilitaire de test : fraction d'envergure (0 emplanture → 1 pointe) d'une distance à l'axe. */
export const spanFraction = (x: number): number => clamp01((x - X_ROOT) / (X_TIP - X_ROOT))
