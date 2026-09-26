// Arène d'équilibrage : parties complètes headless jouées par les vrais bots
// (src/bots), métriques des critères du GDD §14.3 et §18, recherche d'anomalies de la
// simulation (NaN, oiseaux hors de l'arène ou coincés, comptes faux, cellules jamais
// peintes, piqués trop longs).
//
//   npx tsx tools/bots-arena.ts [--suite=all|voyageurs6|lordVs3|fledglingVs3|duel|four|twelve|levels|solo|demo]
//                               [--rounds=56] [--workers=3] [--out=shots/bots/arena] [--seed=1]
//
// Positions tournantes, cartes tournantes (Parasols, Aiguilles, Géantes, Cadran, parfois
// en miroir), graines différentes à chaque manche. Sortie : tableaux Markdown sur stdout
// et JSON complet dans <out>-<suite>.json.

import { fork } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { createSimulation } from '../src/sim/simulation.ts'
import type { BirdInput, MapId, SimEvent } from '../src/sim/types.ts'
import { RULES } from '../src/sim/rules.ts'
import { ellipticRadius } from '../src/sim/arena.ts'
import { trunkAt } from '../src/sim/towers.ts'
import { makePolicy, type Policy, type PolicyName } from '../src/sim/harness.ts'
import { createBot, demoTeam, BOT_PERSONALITIES, type Bot, type BotLevel, type BotPersonality } from '../src/bots/index.ts'

// ─── Modèle ────────────────────────────────────────────────────────────────

/** Une place : un bot (caractère, niveau) ou une politique scriptée (proxy d'humain). */
type Seat = { personality: BotPersonality; level: BotLevel } | { policy: PolicyName }

interface RoundSpec {
  suite: string
  index: number
  seats: Seat[]
  /** seat → slot : la place i joue le slot perm[i]. */
  perm: number[]
  mapId: MapId
  mirror: boolean
  seed: number
  sunSeconds: number
  mode: 'round' | 'demo'
}

interface SlotOutcome {
  slot: number
  seat: number
  label: string
  personality: string
  level: number
  share: number
  rank: number
  win: boolean
  divesLaunched: number
  divesCommitted: number
  hits: number
  misses: number
  feints: number
  attacked: number
  gotHit: number
  dodges: number
  timeLow: number
  timeHigh: number
  hidden: number
  storm: number
  flaps: number
  stolen: number
  /** Part possédée aux repères de phase (15, 55, 85, 98 s et fin). */
  shareAt: number[]
}

/** Repères de phase (s, manche de 110 s) pour suivre la part de chacun. */
const PHASE_MARKS = [15, 55, 85, 98] as const

interface RoundOutcome {
  suite: string
  index: number
  mapId: MapId
  mirror: boolean
  n: number
  seed: number
  slots: SlotOutcome[]
  winner: number
  leaderAt: Record<number, number>
  neutralAt45: number
  leaderChanges: number
  lateChanges: number
  stolenGreatShadow: number
  gapTop2: number
  nearestNeighbor: number
  dives: number
  hits: number
  maxHitsTaken: number
  lowFrac: number
  kept60: number
  botMsMean: number
  botMsP99: number
  botMsMax: number
  simMsMean: number
  anomalies: string[]
  /** Cellules de l'arène jamais possédées pendant la manche. */
  neverOwned: number
  arenaCells: number
  /** Cellules possédées au moins une fois (base64), pour l'union par carte. */
  everOwned: string
}

const MAPS: MapId[] = ['parasols', 'aiguilles', 'geantes', 'cadran']
const NON_WATCH = BOT_PERSONALITIES.filter((p) => p !== 'watchmaker')

function seatLabel(s: Seat): string {
  if ('policy' in s) return `script:${s.policy}`
  return `${s.personality}/L${s.level}`
}

// ─── Suites ────────────────────────────────────────────────────────────────

function buildSuite(name: string, rounds: number, seed0: number): RoundSpec[] {
  const specs: RoundSpec[] = []
  const push = (index: number, seats: Seat[], opts: Partial<RoundSpec> = {}) => {
    const n = seats.length
    const perm = seats.map((_, i) => (i + index) % n)
    specs.push({
      suite: name,
      index,
      seats,
      perm,
      mapId: MAPS[index % MAPS.length]!,
      mirror: index % 8 >= 4 && MAPS[index % MAPS.length] === 'parasols',
      seed: seed0 * 100003 + index * 7919 + name.length * 31,
      sunSeconds: RULES.roundSunSeconds,
      mode: 'round',
      ...opts,
    })
  }
  const V = (p: BotPersonality, level: BotLevel = 1): Seat => ({ personality: p, level })
  for (let r = 0; r < rounds; r++) {
    switch (name) {
      case 'voyageurs6': {
        // 6 Voyageurs : les 7 caractères, un seul au repos à chaque manche
        const out = BOT_PERSONALITIES[r % 7]!
        push(r, BOT_PERSONALITIES.filter((p) => p !== out).map((p) => V(p)))
        break
      }
      case 'lordVs3': {
        // un Seigneur (caractère tournant) contre trois Oisillons
        const lord = BOT_PERSONALITIES[r % 7]!
        const others = [0, 1, 2].map((k) => NON_WATCH[(r + 2 * k + 1) % NON_WATCH.length]!)
        push(r, [V(lord, 2), ...others.map((p) => V(p, 0))])
        break
      }
      case 'lordVs3same': {
        // diagnostic : même caractère partout, un Seigneur contre trois Oisillons (effet pur du niveau)
        const p = NON_WATCH[r % NON_WATCH.length]!
        push(r, [V(p, 2), V(p, 0), V(p, 0), V(p, 0)])
        break
      }
      case 'fledglingVs3': {
        const fl = NON_WATCH[r % NON_WATCH.length]!
        const others = [0, 1, 2].map((k) => BOT_PERSONALITIES[(r + 2 * k + 1) % 7]!)
        push(r, [V(fl, 0), ...others.map((p) => V(p, 2))])
        break
      }
      case 'duel': {
        const a = BOT_PERSONALITIES[r % 7]!
        const b = BOT_PERSONALITIES[(r + 1 + Math.floor(r / 7)) % 7]!
        push(r, [V(a), V(b === a ? BOT_PERSONALITIES[(r + 3) % 7]! : b)])
        break
      }
      case 'four': {
        push(r, [0, 1, 2, 3].map((k) => V(BOT_PERSONALITIES[(r + k * 2) % 7]!)))
        break
      }
      case 'twelve': {
        push(r, Array.from({ length: 12 }, (_, k) => V(BOT_PERSONALITIES[(r + k) % 7]!)))
        break
      }
      case 'levels': {
        // 6 oiseaux : deux par niveau, caractères tournants (hors Horloger en Oisillon)
        const seats: Seat[] = []
        for (let k = 0; k < 6; k++) {
          const level = Math.floor(k / 2) as BotLevel
          const pool = level === 0 ? NON_WATCH : BOT_PERSONALITIES
          seats.push(V(pool[(r + k * 3) % pool.length]!, level))
        }
        push(r, seats)
        break
      }
      case 'solo': {
        // un humain seul (proxy : politique scriptée « mixed ») + la composition par défaut
        push(r, [{ policy: 'mixed' }, V('falcon'), V('ploughman'), V('nomad')])
        break
      }
      case 'demo': {
        push(r, demoTeam(6, r), { mode: 'demo', sunSeconds: RULES.titleDemoSunSeconds })
        break
      }
      default:
        throw new Error(`suite inconnue : ${name}`)
    }
  }
  return specs
}

// ─── Une manche ────────────────────────────────────────────────────────────

const trunkC = { x: 0, y: 0 }

function playRound(spec: RoundSpec): RoundOutcome {
  const n = spec.seats.length
  const sim = createSimulation({
    mode: spec.mode,
    seed: spec.seed,
    mapId: spec.mapId,
    mirror: spec.mirror,
    birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
    sunSeconds: spec.sunSeconds,
    countdown: spec.mode === 'round',
  })
  const st = sim.state
  const seatOf: number[] = new Array(n)
  const drivers: ({ bot: Bot } | { policy: Policy })[] = new Array(n)
  spec.seats.forEach((seat, i) => {
    const slot = spec.perm[i]!
    seatOf[slot] = i
    drivers[slot] = 'policy' in seat ? { policy: makePolicy(seat.policy, slot, spec.seed + slot) } : { bot: createBot({ slot, personality: seat.personality, level: seat.level, seed: spec.seed * 31 + slot }) }
  })
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  let events: SimEvent[] = []
  const k = spec.sunSeconds / RULES.roundSunSeconds
  const anomalies: string[] = []
  const note = (s: string) => {
    if (anomalies.length < 12 && !anomalies.includes(s)) anomalies.push(s)
  }
  const botTimes: number[] = []
  let simMs = 0
  const extra = Array.from({ length: n }, () => ({ launched: 0, committed: 0, attacked: 0, flaps: 0 }))
  const hitsTaken = new Array(12).fill(0)
  let hits = 0
  let dives = 0
  const leaderAt: Record<number, number> = {}
  let neutralAt45 = 0
  let leaderChanges = 0
  let lateChanges = 0
  let owner98: Uint8Array | null = null
  let nnSum = 0
  let nnCount = 0
  const everOwned = new Uint8Array(st.grid.owner.length)
  const lastMove = new Float64Array(n * 3).fill(-1)
  const diveStart = new Float64Array(12).fill(-1)
  const leader = () => {
    let best = -1
    let c = -1
    for (const b of st.birds) if (st.grid.counts[b.slot + 1]! > c) {
      c = st.grid.counts[b.slot + 1]!
      best = b.slot
    }
    return best
  }
  let demoLoops = 0
  const shareMarks: number[][] = Array.from({ length: n }, () => [])
  while (!st.over) {
    const t0 = performance.now()
    for (let s = 0; s < n; s++) {
      const d = drivers[s]!
      inputs[s] = 'bot' in d ? d.bot.think(st, events) : d.policy(st, s)
    }
    const t1 = performance.now()
    events = sim.step(inputs)
    const t2 = performance.now()
    botTimes.push(t1 - t0)
    simMs += t2 - t1
    const t = st.sun.t
    for (const e of events) {
      switch (e.type) {
        case 'diveWindup':
          extra[e.hunter]!.launched++
          diveStart[e.hunter] = st.time
          break
        case 'diveCommit':
          extra[e.hunter]!.committed++
          extra[e.target]!.attacked++
          dives++
          break
        case 'diveHit':
          hits++
          hitsTaken[e.target]++
          diveStart[e.hunter] = -1
          break
        case 'diveMiss':
        case 'diveCancel':
          diveStart[e.hunter] = -1
          break
        case 'flap':
          extra[e.slot]!.flaps++
          break
        case 'crown':
          if (e.prev >= 0) {
            leaderChanges++
            if (t >= 90 * k) lateChanges++
          }
          break
        case 'over':
          // démo : la boucle reprend 2 s après (territoire effacé) ; on s'arrête au bilan
          demoLoops++
          break
        default:
          break
      }
    }
    if (spec.mode === 'demo' && demoLoops >= 1) break
    // relevés
    for (const [mark, fn] of [
      [45, () => (neutralAt45 = st.grid.counts[0]! / st.grid.arenaCells)],
      [60, () => (leaderAt[60] = leader())],
      [90, () => (leaderAt[90] = leader())],
      [98, () => {
        leaderAt[98] = leader()
        owner98 = Uint8Array.from(st.grid.owner)
      }],
    ] as [number, () => void][]) {
      if (t >= mark * k && t - 1 / RULES.tickHz < mark * k) fn()
    }
    for (const mark of PHASE_MARKS) {
      if (t >= mark * k && t - 1 / RULES.tickHz < mark * k) for (let s = 0; s < n; s++) shareMarks[s]!.push(st.grid.counts[s + 1]! / st.grid.arenaCells)
    }
    if (t >= 30 * k && t <= 90 * k && st.tick % 5 === 0 && n > 1) {
      let sum = 0
      for (const b of st.birds) {
        let m = Infinity
        for (const o of st.birds) if (o !== b) m = Math.min(m, Math.hypot(o.x - b.x, o.y - b.y))
        sum += m
      }
      nnSum += sum / n
      nnCount++
    }
    // invariants
    if (st.tick % 3 === 0) {
      const g = st.grid
      for (let q = 0; q < g.owner.length; q++) if (g.owner[q]) everOwned[q] = 1
    }
    for (const b of st.birds) {
      if (!Number.isFinite(b.x + b.y + b.z + b.heading + b.speed + b.vx + b.vy)) note(`NaN oiseau ${b.slot} t=${t.toFixed(1)}`)
      if (ellipticRadius(b.x, b.y, st.arena.a, st.arena.b) > 1.001) note(`oiseau ${b.slot} hors de l'arène t=${t.toFixed(1)}`)
      for (const tw of st.towers) {
        if (tw.outside || b.dive !== 'none') continue
        const r = trunkAt(tw, b.z, trunkC)
        if (r > 0 && Math.hypot(trunkC.x - b.x, trunkC.y - b.y) < r - 0.3) note(`oiseau ${b.slot} dans le fût ${tw.id} t=${t.toFixed(1)}`)
      }
      if (diveStart[b.slot]! >= 0 && st.time - diveStart[b.slot]! > RULES.diveWindup + RULES.diveMaxTime + 0.2) note(`piqué trop long ${b.slot} t=${t.toFixed(1)}`)
      // coincé : moins de 5 m parcourus en 2 s (chemin cumulé) sans être décroché
      const o = b.slot * 3
      if (t > 0) {
        if (lastMove[o + 2]! < 0) lastMove[o + 2] = 0
        lastMove[o + 2]! += Math.hypot(b.x - lastMove[o]!, b.y - lastMove[o + 1]!)
        // un oiseau décroché dérive et peut rester plaqué au mur du Simoun : ce n'est pas un blocage
        if (b.stun > 0) lastMove[o + 2]! += 100
      }
      lastMove[o] = b.x
      lastMove[o + 1] = b.y
      if (st.tick % 60 === 0 && t > 2) {
        if (lastMove[o + 2]! < 5 && b.stun <= 0) note(`oiseau ${b.slot} immobile t=${t.toFixed(1)}`)
        lastMove[o + 2] = 0
      }
    }
    if (st.tick % 30 === 0) {
      const g = st.grid
      let sum = 0
      for (let c = 0; c <= 12; c++) sum += g.counts[c]!
      if (sum !== g.arenaCells) note(`comptes faux (${sum} ≠ ${g.arenaCells}) t=${t.toFixed(1)}`)
    }
  }
  const g = st.grid
  const shares = Array.from({ length: n }, (_, s) => g.counts[s + 1]! / g.arenaCells)
  const order = shares.map((_, i) => i).sort((p, q) => shares[q]! - shares[p]!)
  const rankOf = (s: number) => 1 + shares.filter((v) => v > shares[s]!).length
  let stolenGS = 0
  const o98 = owner98 as Uint8Array | null
  if (o98) for (let q = 0; q < g.owner.length; q++) if (g.inArena[q] && g.owner[q] !== o98[q] && o98[q]! > 0) stolenGS++
  // recompte exact (vérifie les compteurs de la grille)
  const recount = new Int32Array(13)
  for (let q = 0; q < g.owner.length; q++) if (g.inArena[q]) recount[g.owner[q]!]!++
  for (let c = 0; c <= 12; c++) if (recount[c] !== g.counts[c]) note(`compteur ${c} : ${g.counts[c]} ≠ recompte ${recount[c]}`)
  let never = 0
  for (let q = 0; q < g.owner.length; q++) if (g.inArena[q] && !everOwned[q] && !g.owner[q]) never++
  let low = 0
  let high = 0
  let kept = 0
  let owned = 0
  const slots: SlotOutcome[] = []
  for (let s = 0; s < n; s++) {
    const stt = st.stats[s]!
    const seat = spec.seats[seatOf[s]!]!
    low += stt.timeLow
    high += stt.timeHigh
    kept += stt.keptFrom60 ?? 0
    owned += stt.finalCells ?? 0
    slots.push({
      slot: s,
      seat: seatOf[s]!,
      label: seatLabel(seat),
      personality: 'policy' in seat ? `script:${seat.policy}` : seat.personality,
      level: 'policy' in seat ? -1 : seat.level,
      share: shares[s]!,
      rank: rankOf(s),
      win: order[0] === s,
      divesLaunched: extra[s]!.launched,
      divesCommitted: extra[s]!.committed,
      hits: stt.hits,
      misses: stt.misses,
      feints: stt.feints ?? 0,
      attacked: extra[s]!.attacked,
      gotHit: stt.gotHit,
      dodges: stt.dodges,
      timeLow: stt.timeLow,
      timeHigh: stt.timeHigh,
      hidden: stt.hiddenTime,
      storm: stt.stormTime,
      flaps: extra[s]!.flaps,
      stolen: stt.stolenCells / g.arenaCells,
      shareAt: [...shareMarks[s]!, shares[s]!],
    })
  }
  botTimes.sort((p, q) => p - q)
  return {
    suite: spec.suite,
    index: spec.index,
    mapId: spec.mapId,
    mirror: spec.mirror,
    n,
    seed: spec.seed,
    slots,
    winner: order[0]!,
    leaderAt,
    neutralAt45,
    leaderChanges,
    lateChanges,
    stolenGreatShadow: stolenGS / g.arenaCells,
    gapTop2: n > 1 ? shares[order[0]!]! - shares[order[1]!]! : shares[0]!,
    nearestNeighbor: nnCount ? nnSum / nnCount : 0,
    dives,
    hits,
    maxHitsTaken: Math.max(...hitsTaken),
    lowFrac: low / Math.max(1e-9, low + high),
    kept60: owned ? kept / owned : 0,
    botMsMean: botTimes.reduce((p, q) => p + q, 0) / Math.max(1, botTimes.length),
    botMsP99: botTimes[Math.floor(botTimes.length * 0.99)] ?? 0,
    botMsMax: botTimes[botTimes.length - 1] ?? 0,
    simMsMean: simMs / Math.max(1, botTimes.length),
    anomalies,
    neverOwned: never,
    arenaCells: g.arenaCells,
    everOwned: Buffer.from(everOwned).toString('base64'),
  }
}

/**
 * Cellules de l'arène jamais possédées dans AUCUNE des manches d'une même carte et d'une
 * même taille : un sable impossible à peindre trahirait un bogue de la simulation.
 */
function neverPaintable(rs: RoundOutcome[]): string[] {
  const groups = new Map<string, { union: Uint8Array; rounds: number; sample: RoundOutcome }>()
  for (const r of rs) {
    const key = `${r.mapId}${r.mirror ? '-miroir' : ''} n=${r.n}`
    const bits = Buffer.from(r.everOwned, 'base64')
    let g = groups.get(key)
    if (!g) {
      g = { union: new Uint8Array(bits.length), rounds: 0, sample: r }
      groups.set(key, g)
    }
    g.rounds++
    for (let q = 0; q < bits.length; q++) if (bits[q]) g.union[q] = 1
  }
  const out: string[] = []
  for (const [key, g] of groups) {
    const sim = createSimulation({ mode: 'round', seed: 1, mapId: g.sample.mapId, mirror: g.sample.mirror, birds: Array.from({ length: g.sample.n }, (_, slot) => ({ slot, assist: false })), sunSeconds: 110, countdown: false })
    const grid = sim.state.grid
    let never = 0
    let sx = 0
    let sy = 0
    for (let q = 0; q < grid.owner.length; q++) {
      if (!grid.inArena[q] || g.union[q]) continue
      never++
      sx += q % grid.cols
      sy += Math.floor(q / grid.cols)
    }
    const where = never ? ` (barycentre colonne ${(sx / never).toFixed(0)}, ligne ${(sy / never).toFixed(0)})` : ''
    out.push(`${key} : ${g.rounds} manches, ${never} cellules jamais peintes sur ${grid.arenaCells}${where}`)
  }
  return out
}

// ─── Agrégation ────────────────────────────────────────────────────────────

const pct = (v: number, d = 0) => (Number.isFinite(v) ? (100 * v).toFixed(d) + ' %' : '—')
const row = (cells: (string | number)[]) => '| ' + cells.join(' | ') + ' |'
const header = (cells: string[]) => row(cells) + '\n' + row(cells.map(() => '---'))
const mean = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : NaN)

interface Summary {
  suite: string
  rounds: number
  n: number
  neutralAt45: number
  leaderWin: Record<number, number>
  lateChangeRounds: number
  leaderChanges: number
  stolenGreatShadow: number
  gapTop2: number
  nearestNeighbor: number
  divesPerRound: number
  hitRate: number
  maxHitsTaken: number
  lowFrac: number
  kept60: number
  botMsMean: number
  botMsP99: number
  botMsMax: number
  simMsMean: number
  byLabel: Record<string, { rounds: number; wins: number; share: number; dives: number; hits: number; misses: number; feints: number; attacked: number; gotHit: number; dodges: number; low: number; hidden: number; storm: number; flaps: number }>
  byPersonality: Record<string, { rounds: number; wins: number; share: number; shareAt: number[] }>
  byLevel: Record<string, { rounds: number; wins: number; share: number; attacked: number; gotHit: number; dodges: number }>
  anomalies: string[]
  neverOwnedMax: number
  neverPaintable: string[]
}

function summarize(suite: string, rs: RoundOutcome[]): Summary {
  const byLabel: Summary['byLabel'] = {}
  const byPersonality: Summary['byPersonality'] = {}
  const byLevel: Summary['byLevel'] = {}
  for (const r of rs) {
    for (const s of r.slots) {
      const L = (byLabel[s.label] ??= { rounds: 0, wins: 0, share: 0, dives: 0, hits: 0, misses: 0, feints: 0, attacked: 0, gotHit: 0, dodges: 0, low: 0, hidden: 0, storm: 0, flaps: 0 })
      L.rounds++
      L.wins += s.win ? 1 : 0
      L.share += s.share
      L.dives += s.divesLaunched
      L.hits += s.hits
      L.misses += s.misses
      L.feints += s.feints
      L.attacked += s.attacked
      L.gotHit += s.gotHit
      L.dodges += s.dodges
      L.low += s.timeLow / Math.max(1e-9, s.timeLow + s.timeHigh)
      L.hidden += s.hidden
      L.storm += s.storm
      L.flaps += s.flaps
      const P = (byPersonality[s.personality] ??= { rounds: 0, wins: 0, share: 0, shareAt: [0, 0, 0, 0, 0] })
      P.rounds++
      P.wins += s.win ? 1 : 0
      P.share += s.share
      s.shareAt.forEach((v, i) => (P.shareAt[i] = (P.shareAt[i] ?? 0) + v / (r.n > 0 ? 1 : 1)))
      const V = (byLevel[String(s.level)] ??= { rounds: 0, wins: 0, share: 0, attacked: 0, gotHit: 0, dodges: 0 })
      V.rounds++
      V.wins += s.win ? 1 : 0
      V.share += s.share
      V.attacked += s.attacked
      V.gotHit += s.gotHit
      V.dodges += s.dodges
    }
  }
  const leaderWin: Record<number, number> = {}
  for (const L of [60, 90, 98]) leaderWin[L] = mean(rs.map((r) => (r.leaderAt[L] === r.winner ? 1 : 0)))
  const anomalies = [...new Set(rs.flatMap((r) => r.anomalies.map((a) => `${r.mapId}#${r.index}: ${a}`)))].slice(0, 30)
  return {
    suite,
    rounds: rs.length,
    n: rs[0]?.n ?? 0,
    neutralAt45: mean(rs.map((r) => r.neutralAt45)),
    leaderWin,
    lateChangeRounds: mean(rs.map((r) => (r.lateChanges > 0 ? 1 : 0))),
    leaderChanges: mean(rs.map((r) => r.leaderChanges)),
    stolenGreatShadow: mean(rs.map((r) => r.stolenGreatShadow)),
    gapTop2: mean(rs.map((r) => r.gapTop2)),
    nearestNeighbor: mean(rs.map((r) => r.nearestNeighbor)),
    divesPerRound: mean(rs.map((r) => r.dives)),
    hitRate: rs.reduce((p, r) => p + r.hits, 0) / Math.max(1, rs.reduce((p, r) => p + r.dives, 0)),
    maxHitsTaken: Math.max(...rs.map((r) => r.maxHitsTaken)),
    lowFrac: mean(rs.map((r) => r.lowFrac)),
    kept60: mean(rs.map((r) => r.kept60)),
    botMsMean: mean(rs.map((r) => r.botMsMean)),
    botMsP99: mean(rs.map((r) => r.botMsP99)),
    botMsMax: Math.max(...rs.map((r) => r.botMsMax)),
    simMsMean: mean(rs.map((r) => r.simMsMean)),
    byLabel,
    byPersonality,
    byLevel,
    anomalies,
    neverOwnedMax: Math.max(...rs.map((r) => r.neverOwned / r.arenaCells)),
    neverPaintable: neverPaintable(rs),
  }
}

function report(S: Summary): string {
  const lines: string[] = []
  lines.push(`\n### ${S.suite} — ${S.rounds} manches, ${S.n} oiseaux\n`)
  lines.push(header(['critère', 'mesure', 'cible']))
  lines.push(row(['sable neutre à 45 s', pct(S.neutralAt45), '< 40 % (6 oiseaux)']))
  lines.push(row(['meneur à 60 / 90 / 98 s vainqueur', `${pct(S.leaderWin[60]!)} / ${pct(S.leaderWin[90]!)} / ${pct(S.leaderWin[98]!)}`, '98 s : 45-70 %']))
  lines.push(row(['manches avec changement de meneur après 90 s', pct(S.lateChangeRounds), '≥ 60 %']))
  lines.push(row(['changements de meneur / manche', S.leaderChanges.toFixed(1), '—']))
  lines.push(row(['volé pendant la Grande Ombre', pct(S.stolenGreatShadow, 1), '—']))
  lines.push(row(['écart 1er-2e', (100 * S.gapTop2).toFixed(1) + ' pt', '—']))
  lines.push(row(['plus proche voisin (30-90 s)', S.nearestNeighbor.toFixed(0) + ' m', '< 70 m']))
  lines.push(row(['piqués engagés / manche', S.divesPerRound.toFixed(1), '8-15 (6 oiseaux)']))
  lines.push(row(['touches', pct(S.hitRate), '35-55 %']))
  lines.push(row(['max de touches subies (un oiseau, une manche)', String(S.maxHitsTaken), '≤ 5']))
  lines.push(row(['temps en bas', pct(S.lowFrac), '30-60 %']))
  lines.push(row(['territoire final acquis avant 60 s', pct(S.kept60), '≥ 25 %']))
  lines.push(row(['bots : ms / tick (moyenne, p99, max)', `${S.botMsMean.toFixed(3)} · ${S.botMsP99.toFixed(2)} · ${S.botMsMax.toFixed(1)}`, '≤ 1 ms (11 bots)']))
  lines.push(row(['sim : ms / tick', S.simMsMean.toFixed(3), '—']))
  lines.push(row(['cellules jamais possédées (pire manche)', pct(S.neverOwnedMax, 2), '—']))
  lines.push('')
  lines.push(header(['place', 'manches', 'victoires', 'part', 'piqués', 'touches', 'ratés', 'feintes', 'visé (clac)', 'touché', 'esquives', 'esquive %', 'bas', 'caché s', 'tempête s', 'coups d\'aile']))
  for (const [label, L] of Object.entries(S.byLabel).sort((p, q) => q[1].wins / q[1].rounds - p[1].wins / p[1].rounds)) {
    lines.push(
      row([
        label,
        L.rounds,
        pct(L.wins / L.rounds),
        pct(L.share / L.rounds, 1),
        (L.dives / L.rounds).toFixed(1),
        (L.hits / L.rounds).toFixed(1),
        (L.misses / L.rounds).toFixed(1),
        (L.feints / L.rounds).toFixed(1),
        (L.attacked / L.rounds).toFixed(1),
        (L.gotHit / L.rounds).toFixed(1),
        (L.dodges / L.rounds).toFixed(1),
        pct(L.dodges / Math.max(1, L.dodges + L.gotHit)),
        pct(L.low / L.rounds),
        (L.hidden / L.rounds).toFixed(1),
        (L.storm / L.rounds).toFixed(1),
        (L.flaps / L.rounds).toFixed(1),
      ]),
    )
  }
  if (Object.keys(S.byPersonality).length > 1) {
    lines.push('')
    lines.push(header(['caractère', 'manches', 'victoires', 'part moyenne', 'part à 15 / 55 / 85 / 98 s / fin']))
    for (const [p, P] of Object.entries(S.byPersonality).sort((a, b) => b[1].wins / b[1].rounds - a[1].wins / a[1].rounds)) lines.push(row([p, P.rounds, pct(P.wins / P.rounds), pct(P.share / P.rounds, 1), P.shareAt.map((v) => (100 * v / P.rounds).toFixed(1)).join(' / ')]))
  }
  if (Object.keys(S.byLevel).length > 1) {
    lines.push('')
    lines.push(header(['niveau', 'manches', 'victoires', 'part moyenne', 'esquive (esquives / (esquives + touché))']))
    for (const [lv, V] of Object.entries(S.byLevel)) lines.push(row([lv, V.rounds, pct(V.wins / V.rounds), pct(V.share / V.rounds, 1), pct(V.dodges / Math.max(1, V.dodges + V.gotHit))]))
  }
  lines.push('\nSable jamais peint (union des manches par carte et taille) :')
  for (const a of S.neverPaintable) lines.push(`- ${a}`)
  if (S.anomalies.length) {
    lines.push('\nAnomalies :')
    for (const a of S.anomalies) lines.push(`- ${a}`)
  }
  return lines.join('\n')
}

// ─── Exécution (processus parallèles) ──────────────────────────────────────

if (process.argv.includes('--child')) {
  // processus fils : reçoit ses manches, renvoie chaque résultat, puis null
  process.once('message', (specs: RoundSpec[]) => {
    for (const spec of specs) process.send!(playRound(spec))
    process.send!(null, () => process.exit(0))
  })
} else {
  const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
  const suites = (opt.suite ?? 'voyageurs6').split(',')
  const all = ['voyageurs6', 'lordVs3', 'fledglingVs3', 'duel', 'four', 'twelve', 'levels', 'solo', 'demo']
  const list = suites.includes('all') ? all : suites
  const rounds = +(opt.rounds ?? 56)
  const workers = Math.max(1, +(opt.workers ?? 3))
  const out = opt.out ?? 'shots/bots/arena'
  const seed0 = +(opt.seed ?? 1)
  mkdirSync(dirname(out), { recursive: true })
  const t0 = Date.now()
  for (const suite of list) {
    const specs = buildSuite(suite, suite === 'twelve' ? Math.min(rounds, +(opt.rounds12 ?? rounds)) : rounds, seed0)
    const chunks: RoundSpec[][] = Array.from({ length: Math.min(workers, specs.length) }, () => [])
    specs.forEach((s, i) => chunks[i % chunks.length]!.push(s))
    const results: RoundOutcome[] = []
    await Promise.all(
      chunks.map(
        (chunk) =>
          new Promise<void>((resolve, reject) => {
            const w = fork(fileURLToPath(import.meta.url), ['--child'], { execArgv: process.execArgv })
            w.on('message', (m: RoundOutcome | null) => {
              if (m === null) resolve()
              else {
                results.push(m)
                process.stderr.write(`\r${suite} ${results.length}/${specs.length}   `)
              }
            })
            w.on('error', reject)
            w.on('exit', (code) => (code ? reject(new Error(`processus fils : code ${code}`)) : resolve()))
            w.send(chunk)
          }),
      ),
    )
    results.sort((p, q) => p.index - q.index)
    const S = summarize(suite, results)
    console.log(report(S))
    writeFileSync(`${out}-${suite}.json`, JSON.stringify({ summary: S, rounds: results.map(({ everOwned: _e, ...r }) => r) }, null, 1))
  }
  process.stderr.write(`\n(${((Date.now() - t0) / 1000).toFixed(0)} s)\n`)
}
