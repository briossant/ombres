// Manche synthétique pour la page de dev : une FakeSim dont le territoire évolue de façon
// plausible (ruée de midi, vols, balayages du couchant), avec des piqués, des cachettes, une
// tempête, un joueur qui décroche… Le directeur du narrateur tourne dessus à 30 Hz, instantanément.
import { RULES } from '../../sim/rules.ts'
import type { SimEvent } from '../../sim/types.ts'
import { NarratorDirector, type DirectorPlayer, type NarratorCue } from '../../director/narrator.ts'
import { FakeSim } from '../../director/testing.ts'

export interface SimulatedCue {
  /** Temps de soleil (s). */
  t: number
  cue: NarratorCue
}

export interface SimulatedRound {
  cues: SimulatedCue[]
  /** Événements notables injectés (pour la frise). */
  events: { t: number; label: string }[]
}

export interface SimulateOptions {
  seed: number
  birds: number
  humans: number
  round: number
  rounds: number
  durationOf?: (lineId: string, colorIndex: number | undefined) => number | undefined
  /** Directeur partagé entre plusieurs manches (mémoire des variantes). */
  director?: NarratorDirector
  /** Décalage du temps réel (manches successives). */
  offset?: number
}

function lcg(seed: number): () => number {
  let a = seed >>> 0 || 1
  return () => {
    a = (Math.imul(a, 1664525) + 1013904223) >>> 0
    return a / 4294967296
  }
}

export function playersFor(birds: number, humans: number): DirectorPlayer[] {
  return Array.from({ length: birds }, (_, slot) => ({ slot, colorIndex: slot, human: slot < humans }))
}

export function simulateRound(opts: SimulateOptions): { round: SimulatedRound; director: NarratorDirector } {
  const rnd = lcg(opts.seed * 7919 + opts.round)
  const sim = new FakeSim({ birds: opts.birds, seed: opts.seed })
  const d = opts.director ?? new NarratorDirector({ seed: opts.seed, durationOf: opts.durationOf })
  d.setPlayers(playersFor(opts.birds, opts.humans))
  if (!opts.director) d.startMatch({ rounds: opts.rounds, lastRoundDouble: true })
  const offset = opts.offset ?? 0
  const T = RULES.roundSunSeconds
  const out: SimulatedRound = { cues: [], events: [] }
  const note = (t: number, label: string) => out.events.push({ t, label })
  const first = d.startRound(opts.round, offset)
  if (first) out.cues.push({ t: -RULES.countdownSeconds, cue: first })

  // Parts cibles par oiseau, qui dérivent ; la couronne suit le meneur avec 2 s d'hystérésis.
  const n = opts.birds
  const share = new Array(n).fill(0)
  const drift = Array.from({ length: n }, () => 0.6 + rnd() * 0.8)
  let crown = -1
  let leaderSince = 0
  let candidate = -1
  const hits: { t: number; e: SimEvent }[] = []
  for (let t = 8; t < 106; t += 4 + rnd() * 9) {
    const hunter = Math.floor(rnd() * n)
    const target = (hunter + 1 + Math.floor(rnd() * (n - 1))) % n
    const r = rnd()
    if (r < 0.55) hits.push({ t, e: { type: 'diveHit', hunter, target, x: 0, y: 0, z: 0, stolenCells: Math.floor(rnd() * 90), crown: false } })
    else if (r < 0.8) hits.push({ t, e: { type: 'diveMiss', hunter, target, dodged: rnd() < 0.5, x: 0, y: 0 } })
    if (r > 0.9 && t > 40) hits.push({ t: t + 1.2, e: { type: 'diveHit', hunter, target: (target + 1) % n === hunter ? (target + 2) % n : (target + 1) % n, x: 0, y: 0, z: 0, stolenCells: 20, crown: false } })
  }
  hits.sort((a, b) => a.t - b.t)
  const hiddenBird = Math.floor(rnd() * n)
  const hiddenFrom = 25 + rnd() * 30
  const stormBird = (hiddenBird + 1) % n
  const stormFrom = 30 + rnd() * 40
  const sweeper = Math.floor(rnd() * n)
  const sweepAt = 87 + rnd() * 8
  const grid = sim.state.grid

  for (let tick = -RULES.countdownSeconds * RULES.tickHz; tick <= (T + RULES.nightHoldSeconds) * RULES.tickHz; tick++) {
    const t = tick / RULES.tickHz
    const prevPhase = sim.state.sun.phase
    sim.setSunT(t)
    const events: SimEvent[] = []
    const s = sim.state
    if (t < 0 && Math.abs(t - Math.round(t)) < 1e-6) events.push({ type: 'countdown', n: -Math.round(t) })
    if (s.sun.phase !== prevPhase) {
      events.push({ type: 'phase', phase: s.sun.phase })
      if (s.sun.phase === 'noon') events.push({ type: 'countdown', n: 0 })
    }
    if (Math.abs(t - RULES.tenSecondsAt) < 1e-6) events.push({ type: 'tenSeconds' })

    if (t >= 0 && t <= T) {
      // Territoire : croissance, puis concurrence ; balayage du couchant.
      const dt = 1 / RULES.tickHz
      const rate = 0.0022 * (1 + 2.5 * s.sun.u * s.sun.u)
      for (let i = 0; i < n; i++) share[i] += dt * rate * drift[i] * (0.6 + 0.8 * rnd())
      if (t > sweepAt && t < sweepAt + 3) share[sweeper] += dt * 0.024
      const total = share.reduce((a, b) => a + b, 0)
      const cap = 0.92
      if (total > cap) for (let i = 0; i < n; i++) share[i] *= cap / total
      for (let i = 0; i < n; i++) sim.setCells(i, Math.round(share[i] * grid.arenaCells))
      if (Math.abs(t - (sweepAt + 3)) < 1e-6) {
        events.push({ type: 'bigSteal', slot: sweeper, frac: 0.07, victim: (sweeper + 1) % n })
        note(t, 'balayage')
      }

      // Couronne (meneur tenu 2 s)
      let lead = 0
      for (let i = 1; i < n; i++) if (share[i] > share[lead]) lead = i
      if (lead !== candidate) {
        candidate = lead
        leaderSince = t
      }
      if (candidate !== crown && t - leaderSince >= RULES.crownHysteresis && share[candidate] > 0) {
        events.push({ type: 'crown', slot: candidate, prev: crown })
        note(t, 'couronne')
        crown = candidate
        s.crownSlot = crown
        for (const b of s.birds) b.crown = b.slot === crown
      }

      // Piqués
      while (hits.length && hits[0].t <= t) {
        const h = hits.shift()!.e
        if (h.type === 'diveHit') {
          h.crown = h.target === crown
          const stolen = h.stolenCells / grid.arenaCells
          share[h.hunter] += stolen
          share[h.target] = Math.max(0, share[h.target] - stolen)
          note(t, h.crown ? 'couronne abattue' : 'touche')
        } else note(t, 'raté')
        events.push(h)
      }

      // Cachette et tempête
      sim.bird(hiddenBird).hidden = t > hiddenFrom && t < hiddenFrom + 11
      sim.bird(stormBird).inStorm = t > stormFrom && t < stormFrom + 4
      for (const b of s.birds) b.inNight = t >= RULES.greatShadowAt && b.x < -100 + (t - RULES.greatShadowAt) * 30
    }
    if (Math.abs(t - T) < 1e-6) events.push({ type: 'night' })

    const cue = d.update(s, events, t + RULES.countdownSeconds + offset)
    if (cue) out.cues.push({ t, cue })
  }
  const res = d.roundResults(sim.state, T + RULES.countdownSeconds + RULES.nightHoldSeconds + 1.5 + offset)
  if (res) out.cues.push({ t: T + RULES.nightHoldSeconds + 1.5, cue: res })
  return { round: out, director: d }
}
