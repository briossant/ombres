// Banc d'essai headless : manches complètes jouées par des politiques enfichables,
// avec les métriques des critères du GDD §18. Pur (aucune API Node ni DOM) :
// réutilisable par l'agent bots (vrais bots) et par tools/sim-run.ts.
//
//   const report = runRound({ mapId: 'parasols', seed: 1, policies: ['mixed', 'hunter', …] })
//   Une politique est une fonction (state, slot) => BirdInput, appelée à chaque tick.
//   Politiques scriptées de référence (portées de validate.mjs) : low, high, mixed, hunter, adapt.

import { RULES, DEG } from './rules.ts'
import type { BirdInput, MapId, SimConfig, SimEvent, SimState, SunState } from './types.ts'
import { createSimulation } from './simulation.ts'
import { angDiff } from './math.ts'
import { mulberry32 } from './rng.ts'
import { computeFootprint, cruiseSpeed, makeFootprint, shadowRadius } from './footprint.ts'
import { cellIndexAt } from './territory.ts'
import { ellipticRadius } from './arena.ts'

/** Politique : produit l'entrée d'un oiseau à chaque tick (même couche d'entrée qu'un humain). */
export type Policy = (state: SimState, slot: number) => BirdInput
export type PolicyName = 'low' | 'high' | 'mixed' | 'hunter' | 'adapt' | 'idle'
export type PolicySpec = PolicyName | Policy | ((slot: number, seed: number) => Policy)

// ─── Carte de valeur partagée (blocs de 8 m, recalculée chaque seconde) ─────

interface BlockStats {
  key: string
  size: number
  bw: number
  bh: number
  neutral: Float32Array
  pale: Float32Array
  strong: Float32Array
  tot: Float32Array
}

const blockCache = new WeakMap<SimState, BlockStats>()

function blocks(state: SimState): BlockStats {
  const g = state.grid
  const key = `${Math.floor(state.time)}:${g.version}`
  let B = blockCache.get(state)
  const size = RULES.botBlockSize
  if (!B) {
    const bw = Math.ceil((g.cols * g.cellW) / size)
    const bh = Math.ceil((g.rows * g.cellH) / size)
    B = { key: '', size, bw, bh, neutral: new Float32Array(bw * bh), pale: new Float32Array(bw * bh * 12), strong: new Float32Array(bw * bh * 12), tot: new Float32Array(bw * bh) }
    blockCache.set(state, B)
  }
  if (B.key.split(':')[0] === key.split(':')[0]) return B
  B.key = key
  B.neutral.fill(0)
  B.pale.fill(0)
  B.strong.fill(0)
  B.tot.fill(0)
  for (let j = 0; j < g.rows; j++) {
    const by = Math.floor((j * g.cellH) / size)
    for (let i = 0; i < g.cols; i++) {
      const k = j * g.cols + i
      if (!g.inArena[k]) continue
      const bi = by * B.bw + Math.floor((i * g.cellW) / size)
      B.tot[bi]!++
      if (g.frozen[k]) continue
      const o = g.owner[k]!
      if (o === 0) B.neutral[bi]!++
      else if (g.level[k] === RULES.levelStrong) B.strong[bi * 12 + o - 1]!++
      else B.pale[bi * 12 + o - 1]!++
    }
  }
  return B
}

function blockValueAt(state: SimState, B: BlockStats, slot: number, strong: boolean, x: number, y: number): number {
  const g = state.grid
  const bx = Math.floor((x - g.x0) / B.size)
  const by = Math.floor((y - g.y0) / B.size)
  if (bx < 0 || by < 0 || bx >= B.bw || by >= B.bh) return 0
  const bi = by * B.bw + bx
  if (!B.tot[bi]) return 0
  let v = RULES.botValueNeutral * B.neutral[bi]!
  for (const o of state.birds) {
    const s = o.slot
    if (s === slot) {
      if (strong) v += RULES.botValueUpgradeOwn * B.pale[bi * 12 + s]!
      continue
    }
    const w = s === state.crownSlot ? RULES.botValueStealCrown : RULES.botValueSteal
    v += w * (B.pale[bi * 12 + s]! + (strong ? B.strong[bi * 12 + s]! : 0))
  }
  return v / ((B.size * B.size) / (g.cellW * g.cellH))
}

function cellValue(state: SimState, k: number, slot: number, strong: boolean): number {
  const g = state.grid
  if (k < 0 || !g.inArena[k] || g.frozen[k]) return 0
  const o = g.owner[k]!
  const l = g.level[k]!
  if (o === slot + 1) return strong && l === RULES.levelPale ? RULES.botValueUpgradeOwn : 0
  if (o === 0) return RULES.botValueNeutral
  if (strong || l === RULES.levelPale) return o - 1 === state.crownSlot ? RULES.botValueStealCrown : RULES.botValueSteal
  return 0
}

const _fp = makeFootprint()
const SAMPLE_UV = [
  [0, 0],
  [0.6, 0],
  [-0.6, 0],
  [0, 0.6],
  [0, -0.6],
  [0.45, 0.45],
  [-0.45, -0.45],
]

function footprintValue(state: SimState, sun: SunState, slot: number, x: number, y: number, z: number): number {
  const fp = computeFootprint(sun, x, y, z, _fp)
  let v = 0
  for (const [u, w] of SAMPLE_UV) {
    const px = fp.cx + u! * fp.rAlong * sun.shadowDirX - w! * fp.r * sun.shadowDirY
    const py = fp.cy + u! * fp.rAlong * sun.shadowDirY + w! * fp.r * sun.shadowDirX
    v += cellValue(state, cellIndexAt(state.grid, px, py), slot, fp.strong)
  }
  return v / SAMPLE_UV.length
}

/**
 * Meilleur cap (16 caps évalués) pour peindre à l'altitude z : valeur des cellules
 * sous l'ombre future à 0,7 / 1,4 / 2,1 s et des blocs lointains là où tombera
 * l'ombre, × débit de balayage, moins la tempête et les demi-tours (GDD §14.1,
 * `bestHeading` de validate.mjs).
 */
export function bestHeading(state: SimState, slot: number, z: number): { heading: number; value: number } {
  const b = state.bySlot[slot]!
  const sun = state.sun
  const B = blocks(state)
  const v = cruiseSpeed(z)
  const r = shadowRadius(z)
  const strong = z <= RULES.strongMaxAlt
  const shAng = Math.atan2(sun.shadowDirY, sun.shadowDirX)
  const off = z * sun.cotE
  let best = b.heading
  let bestV = -Infinity
  for (let q = 0; q < 16; q++) {
    const a = (q * Math.PI) / 8
    const ca = Math.cos(a)
    const sa = Math.sin(a)
    const sweep = 2 * r * v * (1 + (sun.stretch - 1) * Math.abs(Math.sin(a - shAng)))
    let near = 0
    for (const tt of [0.7, 1.4, 2.1]) near += footprintValue(state, sun, slot, b.x + ca * v * tt, b.y + sa * v * tt, z) / 3
    let far = 0
    const fars: [number, number][] = [
      [25, 0.45],
      [50, 0.3],
      [80, 0.2],
      [120, 0.12],
    ]
    for (const [d, w] of fars) far += w * blockValueAt(state, B, slot, strong, b.x + ca * d + off * sun.shadowDirX, b.y + sa * d + off * sun.shadowDirY)
    let val = sweep * (near + far)
    for (const d of [15, 30, 45]) {
      const rho = ellipticRadius(b.x + ca * d, b.y + sa * d, state.arena.a, state.arena.b)
      if (rho > 0.9) val -= 3000 * (rho - 0.9) * (60 / d)
    }
    val -= Math.abs(angDiff(a, b.heading)) * 20
    if (val > bestV) {
      bestV = val
      best = a
    }
  }
  return { heading: best, value: bestV }
}

// ─── Politiques scriptées ──────────────────────────────────────────────────

interface ScriptOptions {
  /** Réaction au clac (s) : moyenne, écart type, probabilité d'oubli. */
  flapReactMean: number
  flapReactSd: number
  flapForget: number
  /** Intervalle de décision (s). */
  decisionMin: number
  decisionMax: number
  headingNoiseDeg: number
  /** Verrouillage tenu avant de piquer (s). */
  lockHold: number
}

const DEFAULT_SCRIPT: ScriptOptions = {
  flapReactMean: 0.3,
  flapReactSd: 0.05,
  flapForget: 0.1,
  decisionMin: 0.45,
  decisionMax: 0.65,
  headingNoiseDeg: 8,
  lockHold: 0.2,
}

/** Politique scriptée de référence (validate.mjs), avec un vrai coup d'aile au clac. */
export function makePolicy(name: PolicyName, slot: number, seed: number, options: Partial<ScriptOptions> = {}): Policy {
  const o = { ...DEFAULT_SCRIPT, ...options }
  const rnd = mulberry32(seed)
  const input: BirdInput = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
  let want = 0
  let wantLow = name === 'low'
  let nextDecision = rnd() * 0.5
  let lockSince = -1
  let lockTarget = -1
  let diving = false
  let dodgeAt = -1
  let dodgeHunter = -1
  let dodgeX = 0
  let dodgeY = 0
  const gauss = () => {
    let u = 0
    let v = 0
    while (u === 0) u = rnd()
    while (v === 0) v = rnd()
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v)
  }
  return (state: SimState): BirdInput => {
    const b = state.bySlot[slot]
    if (!b) return input
    const t = state.sun.t
    const now = state.time
    if (name === 'idle') {
      input.dirX = 0
      input.dirY = 0
      input.dive = false
      return input
    }
    // ─ menace : réaction au clac
    let committedHunter = -1
    for (const h of state.birds) if (h.dive === 'committed' && h.diveTarget === slot) committedHunter = h.slot
    if (committedHunter >= 0 && dodgeHunter !== committedHunter) {
      dodgeHunter = committedHunter
      if (rnd() >= o.flapForget) {
        dodgeAt = now + Math.max(0.05, o.flapReactMean + o.flapReactSd * gauss())
        const h = state.bySlot[committedHunter]!
        const ax = b.x - h.x
        const ay = b.y - h.y
        const L = Math.hypot(ax, ay) || 1
        const side = rnd() < 0.5 ? 1 : -1
        dodgeX = (side * -ay) / L
        dodgeY = (side * ax) / L
        // du côté du centre si l'on est près du bord
        if (ellipticRadius(b.x, b.y, state.arena.a, state.arena.b) > 0.75 && dodgeX * -b.x + dodgeY * -b.y < 0) {
          dodgeX = -dodgeX
          dodgeY = -dodgeY
        }
      } else dodgeAt = -1
    }
    if (committedHunter < 0 && b.dive === 'none') dodgeHunter = -1
    let flapNow = false
    if (dodgeAt > 0 && now >= dodgeAt) {
      dodgeAt = -1
      flapNow = true
    }
    // ─ décisions de cap et d'étage
    nextDecision -= 1 / RULES.tickHz
    if (b.stun <= 0 && b.dive === 'none' && nextDecision <= 0) {
      nextDecision = o.decisionMin + rnd() * (o.decisionMax - o.decisionMin)
      let low = name === 'low'
      if (name === 'adapt') low = t >= RULES.phaseGoldenAt * (state.sun.T / RULES.roundSunSeconds)
      const hi = bestHeading(state, slot, RULES.altHigh)
      const lo = bestHeading(state, slot, RULES.altLow)
      if (name === 'mixed') {
        const threatened = b.lockedBy >= 0
        low = 1.6 * lo.value > hi.value && !(threatened && rnd() < 0.6)
      }
      wantLow = low
      let hd = (low ? lo : hi).heading
      if (name === 'hunter' && b.z > 12) {
        let prey = -1
        let pd = 110
        for (const p of state.birds) {
          if (p.slot === slot || p.z >= 12 || p.immune > 0 || p.stun > 0 || p.hidden || p.inNight) continue
          const d = Math.hypot(p.x - b.x, p.y - b.y)
          if (d < pd) {
            pd = d
            prey = p.slot
          }
        }
        if (prey >= 0) {
          const p = state.bySlot[prey]!
          hd = Math.atan2(p.y + Math.sin(p.heading) * p.speed * 0.6 - b.y, p.x + Math.cos(p.heading) * p.speed * 0.6 - b.x)
        }
      }
      want = hd + (rnd() * 2 - 1) * o.headingNoiseDeg * DEG
    }
    // ─ piqué : verrouillage tenu lockHold, puis PLONGER maintenu jusqu'à la résolution
    if (b.lockTarget !== lockTarget) {
      lockTarget = b.lockTarget
      lockSince = now
    }
    if (b.dive !== 'none') diving = true
    else if (diving) diving = false
    let wantDive = false
    if (name !== 'low' && b.dive === 'none' && b.lockTarget >= 0 && b.diveCooldown <= 0 && now - lockSince >= o.lockHold) {
      input.divePresses++
      wantDive = true
    }
    if (b.dive !== 'none') wantDive = true
    input.dive = wantDive || wantLow
    // ─ joystick
    let dx = Math.cos(want)
    let dy = Math.sin(want)
    if (flapNow) {
      dx = dodgeX
      dy = dodgeY
      input.flapPresses++
    }
    input.dirX = dx
    input.dirY = dy
    return input
  }
}

function resolvePolicy(spec: PolicySpec, slot: number, seed: number): Policy {
  return typeof spec === 'string' ? makePolicy(spec, slot, seed) : (spec as Policy)
}

// ─── Manche instrumentée ───────────────────────────────────────────────────

export interface RoundOptions {
  mapId?: MapId
  mirror?: boolean
  seed?: number
  /** Une politique par oiseau (slot = index). Chaînes : politiques scriptées. */
  policies: PolicySpec[]
  sunSeconds?: number
  /** Fabriques de politiques : appelées avec (slot, seed) au lieu d'être utilisées telles quelles. */
  factories?: boolean
  /** Appelé à chaque tick (instrumentation supplémentaire). */
  onTick?: (state: SimState, events: SimEvent[]) => void
}

export interface RoundReport {
  mapId: MapId
  n: number
  /** Parts finales par slot. */
  shares: number[]
  winner: number
  /** Meneur (plus de cellules) à 60 / 90 / 98 s. */
  leaderAt: Record<number, number>
  neutralAt45: number
  neutralFinal: number
  /** Changements de couronne (hors premier couronnement) et combien après 90 s. */
  leaderChanges: number
  leaderChangesAfter90: number
  /** Part de l'arène qui change de propriétaire pendant la Grande Ombre / dont prise à un joueur. */
  changedGreatShadow: number
  stolenGreatShadow: number
  gapTop2: number
  /** Distance moyenne au plus proche voisin (30-90 s). */
  nearestNeighbor: number
  dives: number
  hits: number
  misses: number
  dodges: number
  feints: number
  /** Traînée volée moyenne par touche (m²). */
  trailPerHit: number
  maxHitsTaken: number
  /** Part du temps passée en bas (tous oiseaux). */
  lowTimeFrac: number
  /** Territoire final déjà à son propriétaire à 60 s. */
  kept60: number
  /** Couverture moyenne des ombres de tours (% des cellules figées hors nuit) à 0, 55, 85, 98 s. */
  towerCoverage: Record<number, number>
  /** Temps moyen d'un tick (ms). */
  msPerTick: number
  maxMsPerTick: number
}

/** Joue une manche complète et en tire les métriques du GDD §18. */
export function runRound(opts: RoundOptions): RoundReport {
  const n = opts.policies.length
  const seed = opts.seed ?? 1
  const mapId = opts.mapId ?? 'parasols'
  const config: SimConfig = {
    mode: 'round',
    seed,
    mapId,
    mirror: opts.mirror ?? false,
    birds: Array.from({ length: n }, (_, i) => ({ slot: i, assist: false })),
    sunSeconds: opts.sunSeconds ?? RULES.roundSunSeconds,
    countdown: true,
  }
  const sim = createSimulation(config)
  const st = sim.state
  const policies = opts.policies.map((p, i) => (opts.factories && typeof p === 'function' ? (p as (s: number, sd: number) => Policy)(i, seed * 7919 + i) : resolvePolicy(p, i, seed * 7919 + i)))
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  const k = config.sunSeconds / RULES.roundSunSeconds
  const leaderAt: Record<number, number> = {}
  const marks = [45, 60, 90, 98].map((x) => x * k)
  let neutralAt45 = 0
  let leaderChanges = 0
  let changesAfter90 = 0
  let nnSum = 0
  let nnCount = 0
  let hits = 0
  let trailCells = 0
  const hitsTaken = new Array(12).fill(0)
  let owner98: Uint8Array | null = null
  const cov: Record<number, number> = {}
  const covMarks = [0, 55, 85, 98]
  let msSum = 0
  let msMax = 0
  let ticks = 0
  const leader = () => {
    let best = -1
    let c = -1
    for (const b of st.birds) if (st.grid.counts[b.slot + 1]! > c) {
      c = st.grid.counts[b.slot + 1]!
      best = b.slot
    }
    return best
  }
  while (!st.over) {
    for (const b of st.birds) inputs[b.slot] = policies[b.slot]!(st, b.slot)
    const t0 = performance.now()
    const events = sim.step(inputs)
    const dt = performance.now() - t0
    msSum += dt
    msMax = Math.max(msMax, dt)
    ticks++
    const t = st.sun.t
    for (const e of events) {
      if (e.type === 'crown' && e.prev >= 0) {
        leaderChanges++
        if (t >= 90 * k) changesAfter90++
      } else if (e.type === 'diveHit') {
        hits++
        trailCells += e.stolenCells
        hitsTaken[e.target]++
      }
    }
    for (let m = 0; m < marks.length; m++) {
      const at = marks[m]!
      if (t >= at && t - 1 / RULES.tickHz < at) {
        if (m === 0) neutralAt45 = st.grid.counts[0]! / st.grid.arenaCells
        else leaderAt[[60, 90, 98][m - 1]!] = leader()
        if (m === 3) owner98 = Uint8Array.from(st.grid.owner)
      }
    }
    for (const c of covMarks) {
      if (t >= c * k && t - 1 / RULES.tickHz < c * k) {
        let f = 0
        const g = st.grid
        const hullFrozen = g.frozen
        for (let q = 0; q < g.owner.length; q++) if (g.inArena[q] && hullFrozen[q]) f++
        cov[c] = f / g.arenaCells
      }
    }
    if (t >= 30 * k && t <= 90 * k && st.tick % 5 === 0) {
      let sum = 0
      for (const b of st.birds) {
        let m = Infinity
        for (const o of st.birds) if (o !== b) m = Math.min(m, Math.hypot(o.x - b.x, o.y - b.y))
        sum += m
      }
      if (st.birds.length > 1) {
        nnSum += sum / st.birds.length
        nnCount++
      }
    }
    opts.onTick?.(st, events)
  }
  const g = st.grid
  const shares = Array.from({ length: n }, (_, i) => g.counts[i + 1]! / g.arenaCells)
  const order = shares.map((_, i) => i).sort((p, q) => shares[q]! - shares[p]!)
  let changed = 0
  let stolen = 0
  if (owner98) {
    for (let q = 0; q < g.owner.length; q++) {
      if (!g.inArena[q] || g.owner[q] === owner98[q]) continue
      changed++
      if (owner98[q]! > 0) stolen++
    }
  }
  let dives = 0
  let misses = 0
  let dodges = 0
  let feints = 0
  let low = 0
  let high = 0
  let kept = 0
  let owned = 0
  for (let i = 0; i < n; i++) {
    const s = st.stats[i]!
    dives += s.divesStarted - (s.feints ?? 0)
    misses += s.misses
    dodges += s.dodges
    feints += s.feints ?? 0
    low += s.timeLow
    high += s.timeHigh
    kept += s.keptFrom60 ?? 0
    owned += s.finalCells ?? 0
  }
  return {
    mapId,
    n,
    shares,
    winner: order[0]!,
    leaderAt,
    neutralAt45,
    neutralFinal: g.counts[0]! / g.arenaCells,
    leaderChanges,
    leaderChangesAfter90: changesAfter90,
    changedGreatShadow: changed / g.arenaCells,
    stolenGreatShadow: stolen / g.arenaCells,
    gapTop2: n > 1 ? shares[order[0]!]! - shares[order[1]!]! : shares[0]!,
    nearestNeighbor: nnCount ? nnSum / nnCount : 0,
    dives,
    hits,
    misses,
    dodges,
    feints,
    trailPerHit: hits ? (trailCells * g.cellW * g.cellH) / hits : 0,
    maxHitsTaken: Math.max(...hitsTaken),
    lowTimeFrac: low / Math.max(1e-9, low + high),
    kept60: owned ? kept / owned : 0,
    towerCoverage: cov,
    msPerTick: msSum / Math.max(1, ticks),
    maxMsPerTick: msMax,
  }
}

export interface BatchReport {
  rounds: number
  /** Part moyenne et victoires par politique (index de la composition, rotation des positions). */
  share: number[]
  wins: number[]
  leaderWin: Record<number, number>
  neutralAt45: number
  neutralFinal: number
  leaderChanges: number
  roundsWithLateChange: number
  changedGreatShadow: number
  stolenGreatShadow: number
  gapTop2: number
  nearestNeighbor: number
  divesPerRound: number
  hitRate: number
  dodgesPerRound: number
  trailPerHit: number
  maxHitsTaken: number
  lowTimeFrac: number
  kept60: number
  towerCoverage: Record<number, number>
  msPerTick: number
  maxMsPerTick: number
}

/**
 * Plusieurs manches, positions tournantes (la politique i joue le slot (i + r) mod n
 * à la manche r), comme validate.mjs.
 */
export function runBatch(policies: PolicySpec[], rounds: number, opts: Omit<RoundOptions, 'policies' | 'seed'> & { seed?: number } = {}): BatchReport {
  const n = policies.length
  const share = new Array(n).fill(0)
  const wins = new Array(n).fill(0)
  const leaderWin: Record<number, number> = { 60: 0, 90: 0, 98: 0 }
  const acc = { neutralAt45: 0, neutralFinal: 0, leaderChanges: 0, late: 0, changed: 0, stolen: 0, gap: 0, nn: 0, dives: 0, hits: 0, dodges: 0, trail: 0, maxHits: 0, low: 0, kept: 0, ms: 0, msMax: 0 }
  const cov: Record<number, number> = {}
  for (let r = 0; r < rounds; r++) {
    const perm = policies.map((_, i) => policies[(i + r) % n]!)
    const rep = runRound({ ...opts, policies: perm, seed: (opts.seed ?? 100) + r * 7919 })
    for (let i = 0; i < n; i++) {
      const pi = (i + r) % n
      share[pi] += rep.shares[i]!
      if (i === rep.winner) wins[pi]++
    }
    for (const L of [60, 90, 98]) if (rep.leaderAt[L] === rep.winner) leaderWin[L]!++
    acc.neutralAt45 += rep.neutralAt45
    acc.neutralFinal += rep.neutralFinal
    acc.leaderChanges += rep.leaderChanges
    acc.late += rep.leaderChangesAfter90 > 0 ? 1 : 0
    acc.changed += rep.changedGreatShadow
    acc.stolen += rep.stolenGreatShadow
    acc.gap += rep.gapTop2
    acc.nn += rep.nearestNeighbor
    acc.dives += rep.dives
    acc.hits += rep.hits
    acc.dodges += rep.dodges
    acc.trail += rep.trailPerHit * rep.hits
    acc.maxHits = Math.max(acc.maxHits, rep.maxHitsTaken)
    acc.low += rep.lowTimeFrac
    acc.kept += rep.kept60
    acc.ms += rep.msPerTick
    acc.msMax = Math.max(acc.msMax, rep.maxMsPerTick)
    for (const [k, v] of Object.entries(rep.towerCoverage)) cov[+k] = (cov[+k] ?? 0) + v / rounds
  }
  return {
    rounds,
    share: share.map((v) => v / rounds),
    wins: wins.map((v) => v / rounds),
    leaderWin: Object.fromEntries(Object.entries(leaderWin).map(([k, v]) => [k, v / rounds])),
    neutralAt45: acc.neutralAt45 / rounds,
    neutralFinal: acc.neutralFinal / rounds,
    leaderChanges: acc.leaderChanges / rounds,
    roundsWithLateChange: acc.late / rounds,
    changedGreatShadow: acc.changed / rounds,
    stolenGreatShadow: acc.stolen / rounds,
    gapTop2: acc.gap / rounds,
    nearestNeighbor: acc.nn / rounds,
    divesPerRound: acc.dives / rounds,
    hitRate: acc.hits / Math.max(1, acc.dives),
    dodgesPerRound: acc.dodges / rounds,
    trailPerHit: acc.trail / Math.max(1, acc.hits),
    maxHitsTaken: acc.maxHits,
    lowTimeFrac: acc.low / rounds,
    kept60: acc.kept / rounds,
    towerCoverage: cov,
    msPerTick: acc.ms / rounds,
    maxMsPerTick: acc.msMax,
  }
}

