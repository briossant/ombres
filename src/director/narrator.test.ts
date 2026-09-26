import { describe, expect, it } from 'vitest'
import { RULES } from '../sim/rules.ts'
import type { BirdInput, SimEvent } from '../sim/types.ts'
import { KIND_SPECS, NARRATOR_LINES, narratorLine } from './lines.ts'
import { NarratorDirector, type NarratorCue } from './narrator.ts'
import { FakeSim } from './testing.ts'

const DT = 1 / RULES.tickHz
const CLIP = 2.5

interface Played {
  t: number
  cue: NarratorCue
}

/** Manche scriptée : événements injectés à des instants de soleil donnés, pas de 30 Hz. */
class Round {
  readonly sim: FakeSim
  readonly director: NarratorDirector
  readonly played: Played[] = []
  private t = -RULES.countdownSeconds
  /** Décalage du temps réel (plusieurs manches avec le même directeur : le temps réel avance). */
  private offset = 0
  private script: { t: number; events?: SimEvent[]; fn?: (sim: FakeSim) => void }[] = []

  constructor(
    birds: number,
    humans: number[],
    opts: { rounds?: number; round?: number; director?: NarratorDirector; auto?: boolean; T?: number; offset?: number } = {},
  ) {
    this.offset = opts.offset ?? 0
    this.sim = new FakeSim({ birds, T: opts.T })
    this.director = opts.director ?? new NarratorDirector({ seed: 7, durationOf: () => CLIP })
    this.director.setPlayers(Array.from({ length: birds }, (_, s) => ({ slot: s, colorIndex: (s * 5) % 12, human: humans.includes(s) })))
    if (!opts.director) this.director.startMatch({ rounds: opts.rounds ?? 3, lastRoundDouble: true })
    const cue = this.director.startRound(opts.round ?? 1, this.now)
    if (cue) this.played.push({ t: this.t, cue })
    if (opts.auto !== false) this.clockEvents()
  }

  get now(): number {
    return this.t + RULES.countdownSeconds + this.offset
  }

  /** Événements d'horloge de la vraie simulation (compte à rebours, phases, dix secondes, nuit). */
  private clockEvents(): void {
    const k = this.sim.state.sun.T / RULES.roundSunSeconds
    for (const n of [3, 2, 1]) this.at(-n, { type: 'countdown', n })
    this.at(0, { type: 'countdown', n: 0 }, { type: 'phase', phase: 'noon' })
    this.at(RULES.phaseAfternoonAt * k, { type: 'phase', phase: 'afternoon' })
    this.at(RULES.phaseGoldenAt * k, { type: 'phase', phase: 'golden' })
    this.at(RULES.phaseSunsetAt * k, { type: 'phase', phase: 'sunset' })
    this.at(RULES.greatShadowAt * k, { type: 'phase', phase: 'greatShadow' })
    this.at(RULES.tenSecondsAt * k, { type: 'tenSeconds' })
    this.at(this.sim.state.sun.T, { type: 'phase', phase: 'night' }, { type: 'night' })
  }

  at(t: number, ...events: SimEvent[]): this {
    this.script.push({ t, events })
    return this
  }

  do(t: number, fn: (sim: FakeSim) => void): this {
    this.script.push({ t, fn })
    return this
  }

  run(until: number, inputs?: (t: number) => (BirdInput | undefined)[]): this {
    this.script.sort((a, b) => a.t - b.t)
    while (this.t < until - 1e-9) {
      this.t += DT
      this.sim.setSunT(this.t)
      const events: SimEvent[] = []
      while (this.script.length && this.script[0].t <= this.t + 1e-9) {
        const s = this.script.shift()!
        if (s.fn) s.fn(this.sim)
        if (s.events) events.push(...s.events)
      }
      const cue = this.director.update(this.sim.state, events, this.now, inputs?.(this.t))
      if (cue) this.played.push({ t: this.t, cue })
    }
    return this
  }

  kinds(): string[] {
    return this.played.map(p => p.cue.kind)
  }

  find(kind: string): Played | undefined {
    return this.played.find(p => p.cue.kind === kind)
  }
}

const hit = (hunter: number, target: number, extra: Partial<{ stolenCells: number; crown: boolean }> = {}): SimEvent => ({
  type: 'diveHit',
  hunter,
  target,
  x: 0,
  y: 0,
  z: 0,
  stolenCells: extra.stolenCells ?? 10,
  crown: extra.crown ?? false,
})

describe('catalogue', () => {
  it('chaque type a au moins une réplique, chaque réplique a un type connu', () => {
    for (const kind of Object.keys(KIND_SPECS)) expect(NARRATOR_LINES.some(l => l.kind === kind)).toBe(true)
    expect(new Set(NARRATOR_LINES.map(l => l.id)).size).toBe(NARRATOR_LINES.length)
    expect(narratorLine('leaderChange2')?.kind).toBe('leaderChange')
  })
})

describe('structure de partie', () => {
  it("ouvre la partie à midi, une fois la conque d'« Envol » retombée, jamais pendant le compte à rebours", () => {
    const r = new Round(4, [0]).at(-2, hit(1, 2)).at(0.5, hit(2, 3)).run(3)
    expect(r.kinds()).toEqual(['matchOpen'])
    expect(r.played[0].t).toBeGreaterThanOrEqual(1.5 - 1e-9)
    expect(r.played[0].t).toBeLessThan(1.6)
    expect(r.played[0].cue.colorIndex).toBeUndefined()
    expect(r.played[0].cue.key).toBe('narrator.matchOpen')
  })

  it('annonce la dernière manche avant le compte à rebours et saute alors l’ouverture', () => {
    const d = new NarratorDirector({ seed: 1, durationOf: () => CLIP })
    d.startMatch({ rounds: 3, lastRoundDouble: true })
    const r = new Round(3, [0], { director: d, round: 3 }).run(4)
    expect(r.kinds()).toEqual(['lastRound'])
    expect(r.played[0].t).toBeLessThan(-RULES.countdownSeconds + 0.01)
  })

  it('manche 2 : une ouverture de manche, variantes différentes d’une manche à l’autre', () => {
    const d = new NarratorDirector({ seed: 3, durationOf: () => CLIP })
    d.startMatch({ rounds: 5, lastRoundDouble: true })
    const ids = [2, 3, 4].map(n => new Round(3, [0], { director: d, round: n, offset: n * 200 }).run(2).played[0].cue.lineId)
    expect(ids.every(id => id.startsWith('roundOpen'))).toBe(true)
    expect(new Set(ids).size).toBe(3)
  })

  it('pas de « dernier soleil » dans une partie en une manche', () => {
    const r = new Round(2, [0], { rounds: 1 }).run(2)
    expect(r.kinds()).toEqual(['matchOpen'])
  })

  it('« dernier soleil » annoncé sur les résultats, avant de lancer la manche : pas répété, pas d’ouverture', () => {
    const d = new NarratorDirector({ seed: 1, durationOf: () => CLIP })
    d.startMatch({ rounds: 3, lastRoundDouble: true })
    expect(d.announceLastRound(2, 50)).toBeNull() // pas la dernière manche
    const cue = d.announceLastRound(3, 51)
    expect(cue).toMatchObject({ kind: 'lastRound', lineId: 'lastRound' })
    expect(d.announceLastRound(3, 52)).toBeNull()
    const r = new Round(3, [0], { director: d, round: 3, offset: 60 }).run(5)
    expect(r.kinds()).toEqual([])
  })

  it('la graine de partie change le tirage des variantes', () => {
    const draw = (seed: number) => {
      const d = new NarratorDirector({ durationOf: () => CLIP })
      d.startMatch({ rounds: 3, lastRoundDouble: true, seed })
      return new Round(3, [0], { director: d, round: 1 }).run(100).played.map(p => p.cue.lineId).join()
    }
    const draws = new Set([1, 2, 3, 4, 5, 6].map(draw))
    expect(draws.size).toBeGreaterThan(1)
    expect(draw(4)).toBe(draw(4))
  })
})

describe('fréquence', () => {
  it('au moins 8 s entre deux répliques ; un événement trop ancien est abandonné', () => {
    const r = new Round(4, [0, 1]).at(20, hit(0, 1)).at(22, { type: 'diveMiss', hunter: 2, target: 3, dodged: false, x: 0, y: 0 }).run(30)
    const inRound = r.played.filter(p => p.cue.kind !== 'matchOpen')
    expect(inRound.map(p => p.cue.kind)).toEqual(['firstHit'])
  })

  it('« Dix secondes » se tait juste après la Grande Ombre, et parle si la Grande Ombre s’est tue', () => {
    const r = new Round(3, [0]).run(104)
    expect(r.find('greatShadow')!.t).toBeCloseTo(RULES.greatShadowAt, 1)
    expect(r.find('tenSeconds')).toBeUndefined()
    // sans réplique de Grande Ombre (phase non annoncée), « Dix secondes » est dit à 100 s
    const q = new Round(3, [0], { auto: false })
    for (const n of [3, 2, 1]) q.at(-n, { type: 'countdown', n })
    q.at(0, { type: 'countdown', n: 0 }, { type: 'phase', phase: 'noon' }).at(RULES.tenSecondsAt, { type: 'tenSeconds' }).run(104)
    expect(q.find('tenSeconds')!.t).toBeCloseTo(RULES.tenSecondsAt, 1)
  })

  it('priorité 1 : 3 s après la précédente', () => {
    const r = new Round(3, [0], { auto: false })
    r.at(0, { type: 'countdown', n: 0 }, { type: 'phase', phase: 'noon' })
      .at(RULES.phaseGoldenAt, { type: 'phase', phase: 'golden' })
      .at(RULES.phaseGoldenAt + 1, { type: 'phase', phase: 'greatShadow' })
      .run(RULES.phaseGoldenAt + 8)
    const golden = r.find('golden')!
    const gs = r.find('greatShadow')!
    expect(gs.t - golden.t).toBeGreaterThanOrEqual(RULES.narratorUrgentGap - 1e-6)
    expect(gs.t - golden.t).toBeLessThan(RULES.narratorUrgentGap + 0.1)
  })

  it('un événement plus prioritaire survenu entre-temps passe devant', () => {
    // Premier piqué annoncé à 24 s : on attend jusqu'à 32 s. Une esquive (4) à 30 s puis un doublé
    // (2) à 31 s sont en file ensemble ; à 32 s, le doublé passe devant.
    const r = new Round(4, [0, 1, 2, 3])
      .at(24, hit(3, 2))
      .at(30, { type: 'diveMiss', hunter: 1, target: 0, dodged: true, x: 0, y: 0 })
      .at(31, hit(2, 3), hit(2, 1))
      .run(40)
    expect(r.kinds()).toEqual(['matchOpen', 'firstHit', 'doubleHit'])
  })

  it('à priorité égale, l’événement qui concerne un humain passe devant (celui des bots perd un niveau)', () => {
    const r = new Round(4, [3])
      .at(30, { type: 'bigSteal', slot: 0, frac: 0.05, victim: 1 }, { type: 'bigSteal', slot: 2, frac: 0.045, victim: 3 })
      .run(35)
    const steal = r.find('bigSteal')!
    expect(steal.cue.slot === 3 || steal.cue.slot === 2).toBe(true)
    // La variante qui nomme l'humain (la victime) est préférée.
    expect(steal.cue.slot).toBe(3)
    expect(steal.cue.lineId).toBe('bigStealVictim')
    expect(steal.cue.priority).toBe(2)
  })

  it('un événement 100 % bots perd un niveau de priorité', () => {
    const r = new Round(4, [0]).at(30, { type: 'bigSteal', slot: 1, frac: 0.05, victim: 2 }).run(33)
    expect(r.find('bigSteal')!.cue.priority).toBe(KIND_SPECS.bigSteal.priority + 1)
  })

  it('une réplique d’événement ne bloque pas une réplique d’horloge imminente', () => {
    // Un gros vol à 50 s imposerait 8 s de silence et ferait sauter l'heure dorée (55 s).
    const r = new Round(3, [0, 1, 2]).at(50, { type: 'bigSteal', slot: 0, frac: 0.05, victim: 1 }).run(60)
    expect(r.find('bigSteal')).toBeUndefined()
    expect(r.find('golden')!.t).toBeCloseTo(RULES.phaseGoldenAt, 1)
    // À priorité égale et au même instant, l'horloge passe devant.
    const q = new Round(3, [0, 1, 2]).at(RULES.phaseSunsetAt, { type: 'bigSteal', slot: 0, frac: 0.05, victim: 1 }).run(90)
    expect(q.find('sunset')).toBeDefined()
  })

  it('silence à partir de 107 s', () => {
    const r = new Round(3, [0]).at(107.5, { type: 'bigSteal', slot: 0, frac: 0.2, victim: 1 }).run(111)
    expect(r.played.every(p => p.t < RULES.narratorQuietFrom || KIND_SPECS[p.cue.kind].scope === 'match')).toBe(true)
    expect(r.find('bigSteal')).toBeUndefined()
    expect(r.find('hugeSweep')).toBeUndefined()
  })

  it('les instants sont mis à l’échelle de la durée du soleil (manche courte de 80 s)', () => {
    const r = new Round(3, [0], { T: 80 }).run(81)
    const k = 80 / RULES.roundSunSeconds
    expect(r.find('golden')!.t).toBeCloseTo(RULES.phaseGoldenAt * k, 1)
    expect(r.played.every(p => p.t < RULES.narratorQuietFrom * k)).toBe(true)
  })
})

describe('détection', () => {
  it('piqués : le premier ouvre la chasse, un doublé l’emporte sur une touche simple', () => {
    const r = new Round(4, [0, 1, 2, 3]).at(20, hit(0, 1)).at(40, hit(2, 1)).at(41, hit(2, 3)).run(50)
    expect(r.kinds()).toEqual(['matchOpen', 'firstHit', 'doubleHit'])
    expect(r.find('doubleHit')!.cue.slot).toBe(2)
  })

  it('touches simples : 25 s d’écart entre deux annonces de piqué', () => {
    const r = new Round(4, [0, 1, 2, 3]).at(20, hit(0, 1)).at(35, hit(1, 2)).at(46, hit(3, 0)).run(60)
    const hits = r.played.filter(p => p.cue.kind === 'hit' || p.cue.kind === 'firstHit')
    expect(hits.map(p => p.cue.kind)).toEqual(['firstHit', 'hit'])
    expect(hits[1].t - hits[0].t).toBeGreaterThanOrEqual(RULES.diveHitNarrMinGap)
  })

  it('couronne abattue nomme la victime', () => {
    const r = new Round(3, [0, 1, 2]).at(30, hit(0, 1, { crown: true })).run(35)
    const c = r.played.find(p => p.cue.kind === 'crownDown')!
    expect(c.cue.slot).toBe(1)
  })

  it('série de chasse : trois touches du même oiseau en 20 s', () => {
    const r = new Round(5, [0, 1, 2, 3, 4]).at(12, hit(4, 0)).at(22, hit(4, 1)).at(31, hit(4, 2)).run(40)
    expect(r.find('huntStreak')?.cue.slot).toBe(4)
  })

  it('traînée volée ≥ 2 % de l’arène', () => {
    const r = new Round(3, [0, 1, 2]).at(12, hit(1, 2)).at(30, hit(0, 1, { stolenCells: 80 })).run(36)
    expect(r.find('trailSteal')?.cue.slot).toBe(0)
  })

  it('esquive nomme celui qui esquive ; raté nomme le chasseur', () => {
    const a = new Round(3, [0, 1, 2]).at(20, { type: 'diveMiss', hunter: 1, target: 2, dodged: true, x: 0, y: 0 }).run(25)
    expect(a.find('dodge')?.cue.slot).toBe(2)
    const b = new Round(3, [0, 1, 2]).at(20, { type: 'diveMiss', hunter: 1, target: 2, dodged: false, x: 0, y: 0 }).run(25)
    expect(b.find('miss')?.cue.slot).toBe(1)
  })

  it('première couronne de la partie, puis changement de meneur (ancien meneur tenu ≥ 8 s, après 15 s)', () => {
    const r = new Round(3, [0, 1, 2])
      .do(5, s => (s.state.crownSlot = 0))
      .at(5, { type: 'crown', slot: 0, prev: -1 })
      .do(30, s => (s.state.crownSlot = 1))
      .at(30, { type: 'crown', slot: 1, prev: 0 })
      .do(36, s => (s.state.crownSlot = 2))
      .at(36, { type: 'crown', slot: 2, prev: 1 }) // l'ancien n'a tenu que 6 s : pas d'annonce
      .run(45)
    expect(r.kinds()).toEqual(['matchOpen', 'firstCrown', 'leaderChange'])
    expect(r.find('firstCrown')!.cue.slot).toBe(0)
    expect(r.find('leaderChange')!.cue.slot).toBe(1)
  })

  it('une annonce de couronne n’est plus valable si la couronne a changé de tête entre-temps', () => {
    const r = new Round(3, [0, 1, 2])
      .at(3, hit(1, 2)) // réplique à 3 s : bloque jusqu'à 11 s
      .do(4, s => (s.state.crownSlot = 0))
      .at(4, { type: 'crown', slot: 0, prev: -1 })
      .do(6, s => (s.state.crownSlot = -1))
      .at(6, { type: 'crown', slot: -1, prev: 0 })
      .run(14)
    expect(r.find('firstCrown')).toBeUndefined()
  })

  it('gros vol et balayage géant après 85 s', () => {
    const a = new Round(3, [0, 1, 2]).at(40, { type: 'bigSteal', slot: 2, frac: 0.03, victim: 1 }).run(45)
    expect(a.find('bigSteal')).toBeUndefined() // sous le seuil du narrateur (4 %)
    // (le couchant est annoncé à 85 s : on attend l'écart de 8 s)
    const b = new Round(3, [0, 1, 2]).at(93.5, { type: 'bigSteal', slot: 2, frac: 0.07, victim: 1 }).run(97)
    expect(b.find('hugeSweep')).toBeDefined()
    expect(b.find('bigSteal')).toBeUndefined()
  })

  it('caché longtemps : 8 s d’affilée sous une tour (pas la nuit)', () => {
    const r = new Round(3, [0, 1, 2])
      .do(20, s => (s.bird(1).hidden = true))
      .do(26, s => (s.bird(1).hidden = false))
      .do(30, s => (s.bird(2).hidden = true))
      .run(45)
    const h = r.find('hiddenLong')!
    expect(h.cue.slot).toBe(2)
    expect(h.t).toBeGreaterThanOrEqual(30 + RULES.hiddenLongSeconds - 0.05)
  })

  it('tempête : 3 s dans la bande du Simoun', () => {
    const r = new Round(3, [0, 1, 2]).do(20, s => (s.bird(0).inStorm = true)).run(26)
    expect(r.find('storm')?.cue.slot).toBe(0)
  })

  it('immobile : humain sans entrée depuis 10 s, une fois par joueur et par partie', () => {
    const inputs = (t: number): (BirdInput | undefined)[] => [
      { dirX: t < 20 ? Math.sin(t) : 0.3, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 },
      { dirX: Math.sin(t * 3), dirY: 0, dive: false, divePresses: 0, flapPresses: 0 },
      undefined,
    ]
    const r = new Round(3, [0, 1]).run(40, inputs)
    const idle = r.played.filter(p => p.cue.kind === 'idle')
    expect(idle.map(p => p.cue.slot)).toEqual([0])
    expect(idle[0].t).toBeGreaterThanOrEqual(20 + RULES.idleSeconds - 0.05)
  })

  it('écart énorme après 60 s', () => {
    const r = new Round(3, [0, 1, 2])
      .do(50, s => {
        s.setShare(0, 0.4)
        s.setShare(1, 0.2)
        s.setShare(2, 0.1)
      })
      .run(66)
    const run = r.find('runaway')!
    expect(run.cue.slot).toBe(0)
    expect(run.t).toBeGreaterThanOrEqual(60)
  })

  it('photo-finish vers 101,5 s quand les deux premiers sont à moins de 1,5 point, fini avant les 5 dernières secondes', () => {
    const close = (s: FakeSim) => {
      s.setShare(0, 0.3)
      s.setShare(1, 0.29)
      s.setShare(2, 0.1)
    }
    const r = new Round(3, [0, 1, 2]).do(90, close).run(110)
    const p = r.find('photoFinish')!
    expect(p.t).toBeGreaterThanOrEqual(101.5 - 1e-6)
    expect(p.t + CLIP).toBeLessThanOrEqual(RULES.roundSunSeconds - 5 - 0.2)
    // une Grande Ombre bavarde (clip long) : le photo-finish ne tiendrait pas, il se tait
    const d = new NarratorDirector({ seed: 7, durationOf: id => (id.startsWith('greatShadow') ? 4.5 : CLIP) })
    d.startMatch({ rounds: 3, lastRoundDouble: true })
    const q = new Round(3, [0, 1, 2], { director: d }).do(90, close).run(110)
    expect(q.find('greatShadow')).toBeDefined()
    expect(q.find('photoFinish')).toBeUndefined()
  })
})

describe('résultats', () => {
  const finish = (shares: number[], setup?: (r: Round) => void): Round => {
    const r = new Round(shares.length, shares.map((_, i) => i))
    setup?.(r)
    r.do(1, s => shares.forEach((v, i) => s.setShare(i, v * 0.3)))
    r.do(100, s => shares.forEach((v, i) => s.setShare(i, v)))
    r.run(RULES.roundSunSeconds + RULES.nightHoldSeconds)
    const cue = r.director.roundResults(r.sim.state, r.now + 1.5)
    if (cue) r.played.push({ t: r.sim.state.sun.t, cue })
    return r
  }

  it('égalité exacte', () => {
    const r = finish([0.3, 0.3, 0.1])
    expect(r.played.at(-1)!.cue.kind).toBe('tie')
  })

  it('victoire écrasante (≥ 12 points)', () => {
    const r = finish([0.5, 0.2, 0.1])
    expect(r.played.at(-1)!.cue).toMatchObject({ kind: 'landslide', slot: 0 })
  })

  it('arrivée serrée (< 1 point)', () => {
    const r = finish([0.305, 0.3, 0.1])
    expect(r.played.at(-1)!.cue.kind).toBe('closeFinish')
  })

  it('remontée : dernier à 80 s, sur le podium à la nuit', () => {
    const r = new Round(4, [0, 1, 2, 3])
    r.do(70, s => [0.3, 0.2, 0.15, 0.05].forEach((v, i) => s.setShare(i, v)))
    r.do(90, s => [0.2, 0.18, 0.15, 0.26].forEach((v, i) => s.setShare(i, v)))
    r.run(RULES.roundSunSeconds + 1)
    const cue = r.director.roundResults(r.sim.state, r.now + 1.5)!
    expect(cue).toMatchObject({ kind: 'comeback', slot: 3 })
  })

  it('mirage : meneur à 98 s, pas vainqueur', () => {
    const r = new Round(3, [0, 1, 2])
    r.do(95, s => [0.3, 0.25, 0.1].forEach((v, i) => s.setShare(i, v)))
    r.do(105, s => [0.26, 0.31, 0.1].forEach((v, i) => s.setShare(i, v)))
    r.run(RULES.roundSunSeconds + 1)
    const cue = r.director.roundResults(r.sim.state, r.now + 1.5)!
    // Le vainqueur a aussi fait le plus gros gain de la Grande Ombre : « dernier rayon » passe avant.
    expect(cue.kind).toBe('lastRay')
    expect(cue.slot).toBe(1)
  })

  it('une réplique de résultats par manche, jamais deux fois la même dans la partie', () => {
    const d = new NarratorDirector({ seed: 5, durationOf: () => CLIP })
    d.startMatch({ rounds: 5, lastRoundDouble: true })
    const ids: string[] = []
    for (let n = 1; n <= 5; n++) {
      const r = new Round(3, [0], { director: d, round: n, offset: n * 200 })
      r.do(1, s => [0.3, 0.2, 0.1].forEach((v, i) => s.setShare(i, v)))
      r.run(RULES.roundSunSeconds + 1)
      ids.push(d.roundResults(r.sim.state, r.now + 1.5)!.lineId)
    }
    // 3 variantes de victoire : elles servent toutes avant d'être rejouées (la moins récente).
    expect(new Set(ids.slice(0, 3)).size).toBe(3)
    expect(ids.every(id => id.startsWith('roundWin'))).toBe(true)
  })

  it('deuxième égalité de la partie : l’arrivée serrée prend le relais', () => {
    const d = new NarratorDirector({ seed: 5, durationOf: () => CLIP })
    d.startMatch({ rounds: 3, lastRoundDouble: true })
    const kinds: string[] = []
    for (let n = 1; n <= 2; n++) {
      const r = new Round(3, [0], { director: d, round: n, offset: n * 200 })
      r.do(1, s => [0.3, 0.3, 0.1].forEach((v, i) => s.setShare(i, v)))
      r.run(RULES.roundSunSeconds + 1)
      kinds.push(d.roundResults(r.sim.state, r.now + 1.5)!.kind)
    }
    expect(kinds).toEqual(['tie', 'closeFinish'])
  })

  it('vainqueur de partie, co-victoire, revanche', () => {
    const d = new NarratorDirector({ seed: 1, durationOf: () => CLIP })
    d.setPlayers([{ slot: 0, colorIndex: 4, human: true }, { slot: 1, colorIndex: 7, human: false }])
    d.startMatch({ rounds: 3, lastRoundDouble: true })
    expect(d.matchResults([1], 100)).toMatchObject({ kind: 'matchWin', slot: 1, colorIndex: 7 })
    expect(d.rematch(101)).toBeNull() // écart de 8 s après le vainqueur (priorité 2)
    expect(d.poll(108.5)).toMatchObject({ kind: 'rematch' })
    expect(d.matchResults([0, 1], 200)).toMatchObject({ kind: 'matchTie' })
  })
})

describe('partie en cinq manches', () => {
  it('chaque manche a sa réplique d’heure dorée et de couchant (les variantes reviennent)', () => {
    const d = new NarratorDirector({ seed: 9, durationOf: () => CLIP })
    d.startMatch({ rounds: 5, lastRoundDouble: true })
    const golden: string[] = []
    const sunset: string[] = []
    for (let n = 1; n <= 5; n++) {
      const r = new Round(3, [0], { director: d, round: n, offset: n * 200 }).run(RULES.roundSunSeconds + 1)
      golden.push(r.find('golden')?.cue.lineId ?? '—')
      sunset.push(r.find('sunset')?.cue.lineId ?? '—')
    }
    expect(golden.every(id => id.startsWith('golden'))).toBe(true)
    expect(sunset.every(id => id.startsWith('sunset'))).toBe(true)
    // trois variantes avant la première redite, la moins récente revient ensuite
    expect(new Set(golden.slice(0, 3)).size).toBe(3)
    expect(golden[3]).toBe(golden[0])
  })
})

describe('mémoire', () => {
  it('exporte et réimporte la mémoire de partie (rafraîchissement du PC)', () => {
    const d = new NarratorDirector({ seed: 2, durationOf: () => CLIP })
    d.startMatch({ rounds: 3, lastRoundDouble: true })
    new Round(3, [0], { director: d, round: 1 }).run(60)
    const mem = JSON.parse(JSON.stringify(d.exportMemory()))
    const d2 = new NarratorDirector({ seed: 2, durationOf: () => CLIP })
    d2.importMemory(mem)
    const r = new Round(3, [0], { director: d2, round: 2, offset: 200 }).run(60)
    // la variante d'heure dorée de la manche 1 n'est pas rejouée
    const golden1 = Object.keys(mem.used).find(id => id.startsWith('golden'))
    expect(r.find('golden')!.cue.lineId).not.toBe(golden1)
  })
})

describe('coût', () => {
  it('une manche entière à 30 Hz avec 12 oiseaux coûte moins de 0,1 ms par tick', () => {
    const r = new Round(12, [0, 1, 2, 3, 4, 5])
    for (let t = 5; t < 105; t += 3) r.at(t, hit(Math.floor(t) % 12, (Math.floor(t) + 5) % 12))
    const inputs = (t: number) => Array.from({ length: 12 }, () => ({ dirX: Math.sin(t), dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }))
    const t0 = performance.now()
    r.run(RULES.roundSunSeconds, inputs)
    const perTick = (performance.now() - t0) / ((RULES.roundSunSeconds + RULES.countdownSeconds) * RULES.tickHz)
    expect(perTick).toBeLessThan(0.1)
  })
})

describe('manches entières synthétiques (invariants GDD §16.3)', () => {
  /** Flux d'événements pseudo-aléatoire dense : bien plus d'événements que de place pour parler. */
  function chaos(seed: number, birds: number, humans: number[]): Round {
    let a = seed
    const rnd = () => ((a = (a * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    const r = new Round(birds, humans)
    let crown = -1
    for (let t = 0.5; t < 112; t += 0.25 + rnd() * 1.5) {
      const p = Math.floor(rnd() * birds)
      const q = (p + 1 + Math.floor(rnd() * (birds - 1))) % birds
      const x = rnd()
      if (x < 0.25) r.at(t, hit(p, q, { stolenCells: Math.floor(rnd() * 120), crown: q === crown }))
      else if (x < 0.4) r.at(t, { type: 'diveMiss', hunter: p, target: q, dodged: rnd() < 0.5, x: 0, y: 0 })
      else if (x < 0.55) r.at(t, { type: 'bigSteal', slot: p, frac: 0.03 + rnd() * 0.05, victim: q })
      else if (x < 0.62) {
        const prev = crown
        crown = p
        r.do(t, s => (s.state.crownSlot = p)).at(t, { type: 'crown', slot: p, prev })
      } else if (x < 0.7) r.do(t, s => (s.bird(p).hidden = !s.bird(p).hidden))
      else if (x < 0.75) r.do(t, s => (s.bird(p).inStorm = !s.bird(p).inStorm))
      else r.do(t, s => s.setShare(p, rnd() * 0.3))
    }
    return r.run(RULES.roundSunSeconds + RULES.nightHoldSeconds)
  }

  for (const [seed, birds, humans] of [
    [1, 4, [0]],
    [2, 6, [0, 1, 2]],
    [3, 2, [0]],
    [4, 12, [0, 3, 5, 7]],
    [5, 5, []],
  ] as [number, number, number[]][]) {
    it(`graine ${seed}, ${birds} oiseaux, ${humans.length} humain(s)`, () => {
      const r = chaos(seed, birds, humans)
      const inRound = r.played.filter(p => ['round', 'clock'].includes(KIND_SPECS[p.cue.kind].scope))
      // Écarts : jamais de chevauchement, 8 s (3 s en priorité 1) entre deux débuts.
      for (let i = 1; i < r.played.length; i++) {
        const prev = r.played[i - 1]
        const cur = r.played[i]
        expect(cur.t - prev.t).toBeGreaterThanOrEqual(CLIP)
        const gap = cur.cue.priority <= 1 ? RULES.narratorUrgentGap : RULES.narratorMinGap
        expect(cur.t - prev.t).toBeGreaterThanOrEqual(gap - 1e-6)
      }
      // Plafond de manche (les priorités 1 passent toujours).
      expect(inRound.filter(p => p.cue.priority > 1).length).toBeLessThanOrEqual(RULES.narratorMaxPerRound)
      expect(inRound.length).toBeLessThanOrEqual(RULES.narratorMaxPerRound + 1)
      // Silences.
      expect(inRound.every(p => p.t >= 0 && p.t < RULES.narratorQuietFrom)).toBe(true)
      // Aucune variante rejouée.
      const ids = r.played.map(p => p.cue.lineId)
      expect(new Set(ids).size).toBe(ids.length)
      // Les répliques d'horloge sont dites ; « Dix secondes » seulement sans la Grande Ombre.
      for (const k of ['golden', 'sunset', 'greatShadow']) expect(r.find(k)).toBeDefined()
      expect(r.find('tenSeconds')).toBeUndefined()
      // Fin de manche qui respire : rien sur les coups de bois des 5 dernières secondes, et au plus
      // deux répliques (Grande Ombre, photo-finish) dans les 13 dernières secondes.
      const T = RULES.roundSunSeconds
      expect(inRound.every(p => p.t + CLIP <= T - 5 - 0.2 + 1e-6)).toBe(true)
      expect(inRound.filter(p => p.t >= T - 13).length).toBeLessThanOrEqual(2)
      // Plafonds par type.
      for (const [kind, spec] of Object.entries(KIND_SPECS)) {
        if (spec.capPerRound !== undefined) expect(inRound.filter(p => p.cue.kind === kind).length).toBeLessThanOrEqual(spec.capPerRound)
      }
      // Toute réplique à couleur nomme un joueur présent.
      for (const p of r.played) {
        const line = narratorLine(p.cue.lineId)!
        expect(line.subject === 'none').toBe(p.cue.colorIndex === undefined)
      }
    })
  }
})
