// Choix de la manche filmée par la bande-annonce : la manche du jeu est déterministe une fois la graine
// de partie fixée (session.mjs --seed impose runner.matchSeed) et tous les
// oiseaux pilotés par des bots (les « téléphones » de la distribution sont pilotés par des bots à graine
// pendant la manche, voir session.mjs). On rejoue ici la manche EXACTE du runner (même routeur d'entrées,
// mêmes bots, mêmes graines) pour des centaines de graines, et on note chacune pour la bande-annonce :
// vainqueur humain, piqués entre humains au couchant, gros vols, meneur qui change, Grande Ombre disputée.
//   node tools/trailer/seeds-chrome.mjs [--from=1] [--n=200] [--top=8]  → classement (dans Chrome : FAIT FOI)
//   node tools/trailer/seeds-chrome.mjs --seed=1234                      → journal détaillé d'une graine de partie
//   npx tsx tools/trailer/seeds.ts …                                     → même chose dans Node (indicatif)
// Attention : Node (V8 12) et Chrome (V8 récent) n'arrondissent pas toutes les fonctions Math pareil ; une
// manche rejouée dans Node peut diverger de celle du jeu au bout d'une minute ou plus. Le jeu tourne dans
// Chrome : on choisit la graine dans Chrome.
import { ranking } from '../../src/sim/query.ts'
import { RULES } from '../../src/sim/rules.ts'
import type { SimEvent } from '../../src/sim/types.ts'
import { HUMAN_SLOTS, makeTrailerRound } from './round.ts'

export interface Hit {
  t: number
  hunter: number
  target: number
  stolen: number
  crown: boolean
  x: number
  y: number
}

export interface RoundLog {
  matchSeed: number
  T: number
  hits: Hit[]
  misses: { t: number; hunter: number; target: number; dodged: boolean }[]
  bigSteals: { t: number; slot: number; frac: number; victim: number }[]
  crowns: { t: number; slot: number }[]
  phases: { t: number; phase: string }[]
  shares: number[]
  rank: number[]
  nightT: number
}

const HUMANS = HUMAN_SLOTS

/** Rejoue la manche du trailer pour une graine de partie. */
export function playRound(matchSeed: number): RoundLog {
  const { sim, router } = makeTrailerRound(matchSeed)
  const log: RoundLog = { matchSeed, T: sim.state.sun.T, hits: [], misses: [], bigSteals: [], crowns: [], phases: [], shares: [], rank: [], nightT: -1 }
  let evs: SimEvent[] = []
  for (let guard = 0; guard < 200 * RULES.tickHz && !sim.state.over; guard++) {
    evs = sim.step(router.collect(sim.state, evs))
    const t = sim.state.sun.t
    for (const e of evs) {
      if (e.type === 'diveHit') log.hits.push({ t, hunter: e.hunter, target: e.target, stolen: e.stolenCells, crown: e.crown, x: e.x, y: e.y })
      else if (e.type === 'diveMiss') log.misses.push({ t, hunter: e.hunter, target: e.target, dodged: e.dodged })
      else if (e.type === 'bigSteal') log.bigSteals.push({ t, slot: e.slot, frac: e.frac, victim: e.victim })
      else if (e.type === 'crown') log.crowns.push({ t, slot: e.slot })
      else if (e.type === 'phase') log.phases.push({ t, phase: e.phase })
      else if (e.type === 'night') log.nightT = t
    }
  }
  const st = sim.state
  log.shares = Array.from({ length: 12 }, (_, s) => (st.grid.counts[s + 1] ?? 0) / Math.max(1, st.grid.arenaCells))
  log.rank = ranking(st)
  return log
}

/** Note « bande-annonce » d'une manche. */
export function score(l: RoundLog): { score: number; why: string[] } {
  const why: string[] = []
  let s = 0
  const winner = l.rank[0] ?? -1
  if (HUMANS.includes(winner)) (s += 30), why.push(`vainqueur humain ${winner}`)
  const golden = l.phases.find((p) => p.phase === 'golden')?.t ?? 55
  const gs = l.phases.find((p) => p.phase === 'greatShadow')?.t ?? l.T - 12
  // piqués réussis entre humains à l'heure dorée / au couchant, les plus gros vols d'abord
  const hh = l.hits.filter((h) => HUMANS.includes(h.hunter) && h.t >= golden && h.t < gs)
  const best = hh.sort((a, b) => b.stolen - a.stolen)[0]
  if (best) (s += 20 + Math.min(20, best.stolen / 40)), why.push(`piqué ${best.hunter}→${best.target} t=${best.t.toFixed(1)} vol ${best.stolen}`)
  const gsHits = l.hits.filter((h) => h.t >= gs)
  if (gsHits.length) (s += 8), why.push(`${gsHits.length} touche(s) dans la Grande Ombre`)
  const leads = l.crowns.filter((c) => c.slot >= 0).length
  s += Math.min(12, leads * 3)
  why.push(`${leads} couronnes`)
  const sorted = [...l.shares].sort((a, b) => b - a)
  const gap = (sorted[0] ?? 0) - (sorted[1] ?? 0)
  if (gap < 0.03) (s += 8), why.push(`serré ${(gap * 100).toFixed(1)} %`)
  s += Math.min(10, l.hits.length)
  return { score: s, why }
}

const isMain = typeof process !== 'undefined' && !!process.argv?.[1]?.endsWith('seeds.ts')
if (isMain) {
  const opt = Object.fromEntries(process.argv.slice(2).map((a) => { const i = a.indexOf('='); return i < 0 ? [a.replace(/^--/, ''), 'true'] : [a.slice(2, i), a.slice(i + 1)] }))
  if (opt.seed) {
    // --seed = graine de partie (session.mjs --seed : runner.matchSeed vaut exactement cette valeur)
    const l = playRound(Number(opt.seed))
    console.log(JSON.stringify({ seed: Number(opt.seed), ...score(l), log: opt.log ? l : undefined, rank: l.rank, shares: l.shares.map((x) => +(x * 100).toFixed(1)), hits: l.hits.length }, null, 1))
  } else {
    const from = Number(opt.from ?? 1)
    const n = Number(opt.n ?? 200)
    const rows: { seed: number; score: number; why: string[] }[] = []
    const t0 = Date.now()
    for (let s = from; s < from + n; s++) {
      const l = playRound(s)
      rows.push({ seed: s, ...score(l) })
    }
    rows.sort((a, b) => b.score - a.score)
    for (const r of rows.slice(0, Number(opt.top ?? 8))) console.log(`${r.seed}\t${r.score.toFixed(1)}\t${r.why.join(' · ')}`)
    console.log(`${n} manches en ${((Date.now() - t0) / 1000).toFixed(1)} s`)
  }
}
