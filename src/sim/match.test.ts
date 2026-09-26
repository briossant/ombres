import { describe, expect, it, vi } from 'vitest'
import { RULES } from './rules.ts'
import { createMatch, finishRound, isMatchOver, mapOrder, matchStandings, matchTitles, matchWinners, ranksOf, restoreMatch, roundConfig, sunsOf, matchSnapshot } from './match.ts'
import { assignTitles, emptyTitleStats, withSovereign, type TitleStats } from './titles.ts'
import { createSimulation } from './simulation.ts'
import { makePolicy } from './harness.ts'
import type { BirdInput, SimState } from './types.ts'

// manches complètes : la machine peut être chargée, on laisse de la marge
vi.setConfig({ testTimeout: 120_000 })

describe('soleils et rangs (GDD §11.1)', () => {
  it('4 oiseaux : 4 / 2 / 1 / 0 ; 6 oiseaux : 6 / 4 / 3 / 2 / 1 / 0', () => {
    const slots4 = [0, 1, 2, 3]
    const cells4 = [400, 300, 200, 100]
    expect(sunsOf(cells4, slots4, 1).slice(0, 4)).toEqual([4, 2, 1, 0])
    const slots6 = [0, 1, 2, 3, 4, 5]
    const cells6 = [60, 50, 40, 30, 20, 10]
    expect(sunsOf(cells6, slots6, 1).slice(0, 6)).toEqual([6, 4, 3, 2, 1, 0])
    // dernière manche × 2
    expect(sunsOf(cells4, slots4, RULES.lastRoundMultiplier).slice(0, 4)).toEqual([8, 4, 2, 0])
  })

  it('ex æquo : même rang, le meilleur (et le bonus de vainqueur pour tous les premiers)', () => {
    const slots = [0, 1, 2, 3]
    const cells = [300, 300, 200, 200]
    expect(ranksOf(cells, slots).slice(0, 4)).toEqual([1, 1, 3, 3])
    expect(sunsOf(cells, slots, 1).slice(0, 4)).toEqual([3, 3, 0, 0])
  })
})

describe('partie (GDD §11.2)', () => {
  it('ordre des cartes : Parasols, Aiguilles|Géantes, Cadran ; 5 manches avec miroir', () => {
    const three = mapOrder(3, 1)
    expect(three[0]).toEqual({ mapId: 'parasols', mirror: false })
    expect(['aiguilles', 'geantes']).toContain(three[1]!.mapId)
    expect(three[2]).toEqual({ mapId: 'cadran', mirror: false })
    const draws = new Set([1, 2, 3, 4, 5, 6, 7, 8].map((s) => mapOrder(3, s)[1]!.mapId))
    expect(draws.size).toBe(2)
    expect(mapOrder(5, 1)).toEqual([
      { mapId: 'parasols', mirror: false },
      { mapId: 'aiguilles', mirror: false },
      { mapId: 'geantes', mirror: false },
      { mapId: 'parasols', mirror: true },
      { mapId: 'cadran', mirror: false },
    ])
    expect(mapOrder(1, 1)).toEqual([{ mapId: 'parasols', mirror: false }])
  })

  it('classement : soleils, puis territoire cumulé, puis manches gagnées, puis co-victoire', () => {
    const match = createMatch({ seed: 1, rounds: 3, length: 'normal', birds: [0, 1, 2].map((slot) => ({ slot, assist: false })) })
    const fake = (cells: number[]): SimState =>
      ({
        birds: [0, 1, 2].map((slot) => ({ slot })),
        grid: { counts: Int32Array.from([0, cells[0]!, cells[1]!, cells[2]!, 0, 0, 0, 0, 0, 0, 0, 0, 0]), arenaCells: 1000 },
        stats: [],
        over: true,
      }) as unknown as SimState
    finishRound(match, fake([500, 300, 200])) // 3 / 1 / 0
    finishRound(match, fake([200, 500, 300])) // 0 / 3 / 1
    expect(isMatchOver(match)).toBe(false)
    finishRound(match, fake([300, 200, 500])) // dernière × 2 : 2 / 0 / 6
    expect(isMatchOver(match)).toBe(true)
    const st = matchStandings(match)
    expect(st.map((r) => [r.slot, r.suns])).toEqual([
      [2, 7],
      [0, 5],
      [1, 4],
    ])
    expect(matchWinners(match)).toEqual([2])
    expect(match.results[2]!.multiplier).toBe(2)
    // départage au territoire cumulé
    const m2 = createMatch({ seed: 1, rounds: 1, length: 'short', birds: [0, 1].map((slot) => ({ slot, assist: false })) })
    finishRound(m2, { ...fake([400, 400, 0]), birds: [{ slot: 0 }, { slot: 1 }] } as unknown as SimState)
    expect(matchWinners(m2)).toEqual([0, 1]) // co-victoire : le désert refuse de choisir
    expect(roundConfig(m2).sunSeconds).toBe(RULES.roundLengthPresets.short)
    // sérialisable
    expect(restoreMatch(JSON.parse(JSON.stringify(matchSnapshot(match))))).toEqual(match)
  })
})

describe('titres (GDD §11.4)', () => {
  const player = (slot: number, over: Partial<TitleStats>): TitleStats => ({ ...emptyTitleStats(slot), timeLow: 40, timeHigh: 60, ...over })

  it('un titre au plus par joueur, chaque titre une fois, au-dessus du seuil, par z-score', () => {
    const players = [
      player(0, { hits: 6, misses: 3 }), // Rapace (et Kamikaze possible)
      player(1, { gotHit: 5 }), // Gibier
      player(2, { hiddenTime: 30 }), // Lézard
      player(3, { timeLow: 10, timeHigh: 90 }), // Nuage
      player(4, {}), // rien
      player(5, { hits: 3, misses: 4 }), // Kamikaze (Rapace pris par 0)
    ]
    const awards = assignTitles(players)
    const by = Object.fromEntries(awards.map((a) => [a.slot, a.title]))
    expect(by[0]).toBe('rapace')
    expect(by[1]).toBe('gibier')
    expect(by[2]).toBe('lezard')
    expect(by[3]).toBe('nuage')
    expect(by[5]).toBe('kamikaze')
    expect(by[4]).toBeUndefined()
    expect(new Set(awards.map((a) => a.title)).size).toBe(awards.length)
    expect(awards.find((a) => a.slot === 0)!.value).toBe(6)
    expect(awards.find((a) => a.slot === 3)!.unit).toBe('frac')
  })

  it('le chasseur qui domine est le Rapace, jamais le Kamikaze (titres flatteurs d’abord)', () => {
    // 7 touches, 0 subie, mais 5 piqués dans le sable : avant, z(Kamikaze) > z(Rapace)
    const players = [
      player(0, { hits: 7, misses: 5 }),
      player(1, { hits: 1, misses: 3 }),
      player(2, { hits: 0, misses: 0 }),
      player(3, { hits: 1, misses: 0, gotHit: 4 }),
    ]
    const by = Object.fromEntries(assignTitles(players).map((a) => [a.slot, a.title]))
    expect(by[0]).toBe('rapace')
    expect(by[1]).toBe('kamikaze')
    expect(by[3]).toBe('gibier')
  })

  it('pas de titre moqueur à qui domine son domaine (meilleure anguille ≠ Gibier)', () => {
    const players = [
      player(0, { dodges: 6, gotHit: 5, hiddenTime: 40 }), // Lézard pris d'abord : Anguille libre, mais pas Gibier
      player(1, { dodges: 2, gotHit: 3 }),
      player(2, { hiddenTime: 50 }),
    ]
    const by = Object.fromEntries(assignTitles(players).map((a) => [a.slot, a.title]))
    expect(by[0]).not.toBe('gibier')
    expect(by[1]).toBe('gibier')
  })

  it('Dernier Rayon : seulement le plus haut gain de la Grande Ombre, s\'il est positif', () => {
    const awards = assignTitles([player(0, { greatShadowFrac: 0.05 }), player(1, { greatShadowFrac: 0.02 }), player(2, { greatShadowFrac: -0.01 })])
    expect(awards).toEqual([expect.objectContaining({ slot: 0, title: 'dernierRayon' })])
    expect(assignTitles([player(0, { greatShadowFrac: 0 }), player(1, { greatShadowFrac: 0 })])).toEqual([])
  })

  it('partie complète de bots : résultats, faits marquants et titres cohérents', { timeout: 120_000 }, () => {
    const birds = [0, 1, 2, 3].map((slot) => ({ slot, assist: false }))
    const match = createMatch({ seed: 9, rounds: 3, length: 'short', birds })
    while (!isMatchOver(match)) {
      const sim = createSimulation(roundConfig(match))
      const pols = birds.map((b, i) => makePolicy((['mixed', 'hunter', 'low', 'high'] as const)[i]!, b.slot, 77 + i + match.results.length))
      const inputs: (BirdInput | undefined)[] = []
      while (!sim.state.over) {
        for (const b of sim.state.birds) inputs[b.slot] = pols[b.slot]!(sim.state, b.slot)
        sim.step(inputs)
      }
      const r = finishRound(match, sim.state)
      expect(r.slots).toEqual([0, 1, 2, 3])
      expect(r.shares.reduce((a, v) => a + v, 0)).toBeLessThanOrEqual(1)
      expect(r.winners.length).toBeGreaterThan(0)
      expect(r.suns.reduce((a, v) => a + v, 0)).toBe((6 + 1) * r.multiplier) // 3+2+1+0 + bonus, sans ex æquo
      if (r.highlight) expect(r.facts).toContain(r.highlight)
    }
    // un fait marquant ne revient jamais dans la même partie
    const kinds = match.results.map((r) => r.highlight?.kind).filter((k) => k !== undefined)
    expect(new Set(kinds).size).toBe(kinds.length)
    expect(match.results.map((r) => r.mapId)).toEqual(['parasols', expect.stringMatching(/aiguilles|geantes/), 'cadran'])
    const titles = matchTitles(match)
    expect(new Set(titles.map((t) => t.slot)).size).toBe(titles.length)
    expect(matchWinners(match).length).toBeGreaterThan(0)
    // le vainqueur a toujours un titre (« Le Souverain » à défaut)
    for (const w of matchWinners(match)) expect(titles.some((t) => t.slot === w)).toBe(true)
  })

  it('vainqueur sans titre : « Le Souverain », avec son total de soleils', () => {
    const awards = assignTitles([player(0, {}), player(1, { hits: 5 }), player(2, {})])
    expect(awards.map((a) => a.slot)).toEqual([1])
    const out = withSovereign(awards, [{ slot: 0, suns: 11 }])
    expect(out).toEqual([expect.objectContaining({ slot: 0, title: 'souverain', value: 11, unit: 'count' }), expect.objectContaining({ slot: 1, title: 'rapace' })])
    // un vainqueur qui a déjà un titre le garde ; co-vainqueurs : chacun le sien
    expect(withSovereign(awards, [{ slot: 1, suns: 9 }])).toEqual(awards)
    expect(withSovereign([], [{ slot: 0, suns: 7 }, { slot: 2, suns: 7 }]).map((a) => a.title)).toEqual(['souverain', 'souverain'])
  })
})
