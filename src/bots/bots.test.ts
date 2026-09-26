// Tests de base des bots : entrées valides (pas de NaN, joystick borné, compteurs
// monotones), déterminisme par graine, équité (≤ 2 bots par cible et par fenêtre de
// 10 s), perception retardée, mannequin du lobby, compositions, remplaçant.
import { describe, expect, it, vi } from 'vitest'
import { createSimulation } from '../sim/simulation.ts'
import { RULES } from '../sim/rules.ts'
import { makePolicy } from '../sim/harness.ts'
import type { BirdInput, SimConfig, SimEvent, SimState } from '../sim/types.ts'
import { BOT_PERSONALITIES, createBot, createLobbyDummy, createSubstituteBot, defaultBots, demoTeam, coordinatorFor, type Bot, type BotLevel } from './index.ts'
import { ObservationHistory, makeSeen } from './perception.ts'
import { BotCoordinator } from './coordinator.ts'

// des manches entières tournent ici : la machine peut être chargée (agents en parallèle)
vi.setConfig({ testTimeout: 180_000 })

function config(n: number, over: Partial<SimConfig> = {}): SimConfig {
  return {
    mode: 'round',
    seed: 7,
    mapId: 'parasols',
    birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
    sunSeconds: RULES.titleDemoSunSeconds,
    countdown: true,
    ...over,
  }
}

type Driver = (state: SimState, events: readonly SimEvent[], slot: number) => BirdInput

/** Joue jusqu'à la fin (ou `maxTicks`) ; `check` voit chaque entrée produite. */
function play(cfg: SimConfig, drivers: Driver[], opts: { maxTicks?: number; check?: (slot: number, input: BirdInput, state: SimState) => void; onEvents?: (e: SimEvent[], state: SimState) => void } = {}): SimState {
  const sim = createSimulation(cfg)
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  let events: SimEvent[] = []
  const max = opts.maxTicks ?? 1e9
  for (let tick = 0; tick < max && !sim.state.over; tick++) {
    for (let s = 0; s < drivers.length; s++) {
      const input = drivers[s]!(sim.state, events, s)
      opts.check?.(s, input, sim.state)
      inputs[s] = { ...input }
    }
    events = sim.step(inputs)
    opts.onEvents?.(events, sim.state)
  }
  return sim.state
}

const botDriver = (bot: Bot): Driver => (state, events) => bot.think(state, events)

describe('entrées des bots', () => {
  for (const level of [0, 1, 2] as BotLevel[]) {
    it(`les 7 caractères (niveau ${level}) : entrées finies, joystick ≤ 1, compteurs monotones`, () => {
      const bots = BOT_PERSONALITIES.map((personality, slot) => createBot({ slot, personality, level, seed: 11 + slot }))
      const prev = bots.map(() => ({ d: 0, f: 0 }))
      let checked = 0
      const final = play(
        config(bots.length, { seed: 3 + level }),
        bots.map(botDriver),
        {
          check: (slot, input) => {
            expect(Number.isFinite(input.dirX) && Number.isFinite(input.dirY)).toBe(true)
            expect(Math.hypot(input.dirX, input.dirY)).toBeLessThanOrEqual(1 + 1e-9)
            expect(typeof input.dive).toBe('boolean')
            expect(Number.isInteger(input.divePresses) && Number.isInteger(input.flapPresses)).toBe(true)
            expect(input.divePresses).toBeGreaterThanOrEqual(prev[slot]!.d)
            expect(input.flapPresses).toBeGreaterThanOrEqual(prev[slot]!.f)
            prev[slot] = { d: input.divePresses, f: input.flapPresses }
            checked++
          },
        },
      )
      expect(checked).toBeGreaterThan(1000)
      // tout le monde a peint, personne n'est parti en NaN
      for (const b of final.birds) {
        expect(Number.isFinite(b.x + b.y + b.z)).toBe(true)
        expect(final.grid.counts[b.slot + 1]).toBeGreaterThan(0)
      }
      // l'Horloger n'existe pas en Oisillon : il joue Voyageur
      expect(bots[6]!.level).toBe(level === 0 ? 1 : level)
    })
  }
})

describe('déterminisme', () => {
  function run(seed: number): { hash: number; counts: number[] } {
    const bots = BOT_PERSONALITIES.slice(0, 6).map((personality, slot) => createBot({ slot, personality, level: 1, seed: seed + slot }))
    let hash = 0
    const st = play(config(6), bots.map(botDriver), {
      check: (_s, i) => {
        hash = (Math.imul(hash, 31) + Math.round(i.dirX * 1e4) * 7 + Math.round(i.dirY * 1e4) * 13 + (i.dive ? 1 : 0) + i.divePresses * 3 + i.flapPresses * 5) | 0
      },
    })
    return { hash, counts: Array.from(st.grid.counts) }
  }
  it('même graine, mêmes entrées ; autre graine, autre partie', () => {
    const a = run(100)
    const b = run(100)
    const c = run(200)
    expect(a.hash).toBe(b.hash)
    expect(a.counts).toEqual(b.counts)
    expect(c.hash).not.toBe(a.hash)
  })
})

describe('équité', () => {
  it(`au plus ${RULES.maxBotsPerTarget} bots piquent un même oiseau par fenêtre de ${RULES.botTargetWindow} s`, () => {
    // deux oiseaux qui rasent le sable sans jamais esquiver (les proies idéales), et quatre
    // Fous (ils piquent tout ce qui bouge) avec deux Faucons Seigneurs
    const hunters: Bot[] = [
      ...[2, 3, 4, 5].map((slot) => createBot({ slot, personality: 'fool', level: 1, seed: slot })),
      ...[6, 7].map((slot) => createBot({ slot, personality: 'falcon', level: 2, seed: slot })),
    ]
    const preys = [makePolicy('low', 0, 1), makePolicy('low', 1, 2)]
    const drivers: Driver[] = [(state) => preys[0]!(state, 0), (state) => preys[1]!(state, 1), ...hunters.map(botDriver)]
    const windups: { hunter: number; target: number; time: number }[] = []
    play(config(8, { sunSeconds: RULES.roundSunSeconds, seed: 21 }), drivers, {
      onEvents: (events, state) => {
        for (const e of events) if (e.type === 'diveWindup') windups.push({ hunter: e.hunter, target: e.target, time: state.time })
      },
    })
    const onPreys = windups.filter((w) => w.target <= 1)
    expect(onPreys.length).toBeGreaterThan(5)
    for (const w of onPreys) {
      const hunters = new Set(onPreys.filter((o) => o.target === w.target && o.time <= w.time && o.time > w.time - RULES.botTargetWindow).map((o) => o.hunter))
      expect(hunters.size).toBeLessThanOrEqual(RULES.maxBotsPerTarget)
    }
  })

  it('le coordinateur refuse un troisième chasseur dans la fenêtre', () => {
    const sim = createSimulation(config(4))
    const co = new BotCoordinator(sim.state)
    for (const s of [1, 2, 3]) co.registerBot(s)
    co.engage(1, 0, 10)
    co.engage(2, 0, 12)
    expect(co.canEngage(3, 0, 13)).toBe(false)
    expect(co.canEngage(1, 0, 13)).toBe(true)
    expect(co.canEngage(3, 0, 10 + RULES.botTargetWindow + 0.1)).toBe(true)
  })
})

describe('perception retardée', () => {
  it('un bot voit les autres avec le retard de son niveau', () => {
    const sim = createSimulation(config(2, { countdown: false }))
    const h = new ObservationHistory()
    const xs: number[] = []
    for (let i = 0; i < 20; i++) {
      sim.step([])
      h.record(sim.state)
      xs.push(sim.state.bySlot[1]!.x)
    }
    const seen = makeSeen()
    expect(h.see(1, 0, seen)).toBe(true)
    expect(seen.x).toBeCloseTo(xs[19]!, 3)
    expect(h.see(1, 9, seen)).toBe(true)
    expect(seen.x).toBeCloseTo(xs[10]!, 3)
    expect(Math.hypot(seen.vx, seen.vy)).toBeGreaterThan(10)
    expect(h.see(5, 0, seen)).toBe(false)
  })
})

describe('bots de service', () => {
  it('le mannequin du lobby tourne au ras du sable, ne pique ni ne bat des ailes', () => {
    const dummy = createLobbyDummy(0)
    const cfg: SimConfig = { mode: 'lobby', seed: 1, mapId: 'lobby', birds: [{ slot: 0, assist: false }], sunSeconds: 60, countdown: false }
    const sim = createSimulation(cfg)
    let events: SimEvent[] = []
    let flaps = 0
    let lowTicks = 0
    let ticks = 0
    const start = { x: sim.state.bySlot[0]!.x, y: sim.state.bySlot[0]!.y }
    let maxDist = 0
    for (let i = 0; i < 30 * 25; i++) {
      const input = dummy.think(sim.state, events)
      if (input.flapPresses > 0) flaps++
      events = sim.step([{ ...input }])
      const b = sim.state.bySlot[0]!
      if (i > 30) {
        ticks++
        if (b.z <= RULES.altLow + 0.5) lowTicks++
        expect(Math.hypot(b.x / sim.state.arena.a, b.y / sim.state.arena.b)).toBeLessThan(0.9)
      }
      maxDist = Math.max(maxDist, Math.hypot(b.x - start.x, b.y - start.y))
    }
    expect(flaps).toBe(0)
    expect(sim.state.stats[0]!.divesStarted).toBe(0)
    expect(lowTicks / ticks).toBeGreaterThan(0.95)
    expect(maxDist).toBeGreaterThan(15)
  })

  it('composition par défaut selon le nombre d’humains (GDD §14.3)', () => {
    expect(defaultBots(1).map((b) => b.personality)).toEqual(['falcon', 'ploughman', 'nomad'])
    expect(defaultBots(2).map((b) => b.personality)).toEqual(['magpie', 'lookout'])
    expect(defaultBots(3).map((b) => b.personality)).toEqual(['falcon'])
    expect(defaultBots(4)).toEqual([])
    expect(defaultBots(1).every((b) => b.level === 1)).toBe(true)
    expect(defaultBots(2, 2).every((b) => b.level === 2)).toBe(true)
  })

  it('équipe de l’écran titre : variée, déterministe', () => {
    const t = demoTeam(6, 3)
    expect(t).toHaveLength(6)
    expect(new Set(t.map((s) => s.personality)).size).toBeGreaterThanOrEqual(5)
    expect(demoTeam(6, 3)).toEqual(t)
  })

  it('le remplaçant reprend un oiseau en pleine manche et continue de peindre', () => {
    const human = makePolicy('mixed', 0, 5)
    const others = [1, 2, 3].map((slot) => createBot({ slot, personality: BOT_PERSONALITIES[slot]!, level: 1, seed: slot }))
    let sub: Bot | null = null
    const T = RULES.titleDemoSunSeconds
    let countAtTakeover = 0
    const st = play(config(4, { sunSeconds: T }), [
      (state, events) => {
        if (state.sun.t < T * 0.4) return human(state, 0)
        if (!sub) {
          sub = createSubstituteBot(0, 99)
          countAtTakeover = state.grid.counts[1]!
        }
        return sub.think(state, events)
      },
      ...others.map(botDriver),
    ])
    expect(sub).not.toBeNull()
    expect(sub!.substitute).toBe(true)
    expect(sub!.personality).toBe('ploughman')
    expect(sub!.level).toBe(1)
    expect(st.stats[0]!.timeLow).toBeGreaterThan(5)
    expect(st.grid.counts[1]! + st.stats[0]!.gotHit * 400).toBeGreaterThan(countAtTakeover * 0.5)
  })

  it('les bots d’une même simulation partagent un coordinateur', () => {
    const sim = createSimulation(config(2))
    expect(coordinatorFor(sim.state)).toBe(coordinatorFor(sim.state))
    const other = createSimulation(config(2))
    expect(coordinatorFor(other.state)).not.toBe(coordinatorFor(sim.state))
  })
})
