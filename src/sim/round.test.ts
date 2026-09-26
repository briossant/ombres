import { describe, expect, it, vi } from 'vitest'
import { RULES } from './rules.ts'
import { createSimulation, internalsOf, restoreSimulation } from './simulation.ts'
import { cellAtPoint, controlledSim, holdInput, placeBird, setCells, stateHash } from './testkit.ts'
import { frontSpeed } from './night.ts'
import { hash32 } from './math.ts'
import type { BirdInput, SimConfig, SimEvent, Simulation } from './types.ts'

// manches complètes : la machine peut être chargée, on laisse de la marge
vi.setConfig({ testTimeout: 120_000 })

const DT = 1 / RULES.tickHz

/** Entrées déterministes pures (tick, slot) : caps qui changent lentement, PLONGER par périodes, appuis rares. */
function scriptedInput(tick: number, slot: number): BirdInput {
  const phase = Math.floor(tick / 45)
  const a = (hash32(phase, slot, 1) / 4294967296) * Math.PI * 2
  const dive = hash32(Math.floor(tick / 70), slot, 2) % 3 === 0
  return {
    dirX: Math.cos(a),
    dirY: Math.sin(a),
    dive,
    divePresses: Math.floor(tick / 97) + slot,
    flapPresses: Math.floor(tick / 131),
  }
}

function roundConfig(n: number, overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    mode: 'round',
    seed: 11,
    mapId: 'parasols',
    birds: Array.from({ length: n }, (_, i) => ({ slot: i, assist: false })),
    sunSeconds: 110,
    countdown: true,
    ...overrides,
  }
}

function runTicks(sim: Simulation, from: number, count: number, sink?: SimEvent[]): void {
  const inputs: (BirdInput | undefined)[] = new Array(12).fill(undefined)
  for (let t = from; t < from + count; t++) {
    for (const b of sim.state.birds) inputs[b.slot] = scriptedInput(t, b.slot)
    const ev = sim.step(inputs)
    if (sink) sink.push(...ev)
  }
}

describe('déroulé d\'une manche', () => {
  it('compte à rebours, phases, annonces, nuit, fin (GDD §3, §7)', () => {
    const sim = createSimulation(roundConfig(4))
    const ev: SimEvent[] = []
    let ticks = 0
    while (!sim.state.over && ticks < 200 * RULES.tickHz) {
      runTicks(sim, ticks, 1, ev)
      ticks++
    }
    const types = ev.map((e) => e.type)
    expect(ev.filter((e) => e.type === 'countdown').map((e) => (e as { n: number }).n)).toEqual([3, 2, 1, 0])
    expect(ev.filter((e) => e.type === 'phase').map((e) => (e as { phase: string }).phase)).toEqual(['noon', 'afternoon', 'golden', 'sunset', 'greatShadow', 'night', 'over'])
    expect(types.filter((t) => t === 'tenSeconds')).toHaveLength(1)
    expect(ev.filter((e) => e.type === 'lastSeconds').map((e) => (e as { n: number }).n)).toEqual([5, 4, 3, 2, 1])
    expect(types.indexOf('night')).toBeGreaterThan(types.indexOf('greatShadow' as never))
    expect(types.filter((t) => t === 'over')).toHaveLength(1)
    // 3 s + 110 s + 2 s
    expect(ticks).toBe((RULES.countdownSeconds + 110 + RULES.nightHoldSeconds) * RULES.tickHz)
    expect(sim.state.over).toBe(true)
    // tout est figé à la nuit
    expect(sim.state.grid.frozen.every((v) => v === 1)).toBe(true)
    // statistiques de nuit remplies
    for (const b of sim.state.birds) {
      const s = sim.state.stats[b.slot]!
      expect(s.finalCells).toBe(sim.state.grid.counts[b.slot + 1])
      expect(s.rankAtNight).toBeGreaterThan(0)
      expect(s.rankAt98).toBeGreaterThan(0)
      expect(s.timeLow + s.timeHigh).toBeCloseTo(110, 0)
    }
  })

  it('apparition : anneau à 45 %, tache forte de 8 m, loin des fûts, point atteint à t = 0', () => {
    const sim = createSimulation(roundConfig(6))
    const st = sim.state
    const { a, b } = st.arena
    // pendant le compte à rebours : pas de peinture, pilote automatique sur l'anneau
    const counts0 = Array.from(st.grid.counts)
    let minTrunk = Infinity
    for (let i = 0; i < RULES.countdownSeconds * RULES.tickHz - 1; i++) {
      sim.step([])
      for (const bird of st.birds) for (const t of st.towers) if (!t.outside) minTrunk = Math.min(minTrunk, Math.hypot(bird.x - t.x, bird.y - t.y) - t.trunkRadius)
    }
    // la boucle du pilote automatique ne frôle aucun fût
    expect(minTrunk).toBeGreaterThan(RULES.towerCollisionMargin)
    expect(Array.from(st.grid.counts)).toEqual(counts0)
    expect(st.sun.t).toBeLessThan(0)
    for (const bird of st.birds) {
      expect(Math.abs(Math.hypot(bird.x / a, bird.y / b) - RULES.spawnRingFrac)).toBeLessThan(0.01)
      for (const t of st.towers) if (!t.outside) expect(Math.hypot(bird.x - t.x, bird.y - t.y)).toBeGreaterThanOrEqual(RULES.spawnMinTowerDist - 1)
      // l'oiseau arrive sur sa tache forte de départ
      expect(cellAtPoint(sim, bird.x, bird.y)).toMatchObject({ owner: bird.slot + 1, level: RULES.levelStrong })
    }
    const splash = counts0[1]! * st.grid.cellW * st.grid.cellH
    expect(splash).toBeGreaterThan(Math.PI * 64 * 0.95)
    expect(splash).toBeLessThan(Math.PI * 64 * 1.05)
  })

  it('déterminisme : même graine et mêmes entrées → même état', () => {
    const a = createSimulation(roundConfig(6))
    const b = createSimulation(roundConfig(6))
    runTicks(a, 0, 60 * RULES.tickHz)
    runTicks(b, 0, 60 * RULES.tickHz)
    expect(stateHash(a)).toBe(stateHash(b))
    const c = createSimulation(roundConfig(6, { seed: 12 }))
    runTicks(c, 0, 60 * RULES.tickHz)
    expect(stateHash(c)).not.toBe(stateHash(a))
  })

  it('snapshot / restauration : la simulation reprend à l\'identique (JSON aller-retour)', () => {
    const a = createSimulation(roundConfig(5))
    runTicks(a, 0, 101 * RULES.tickHz)
    const json = JSON.stringify(a.snapshot())
    expect(json.length).toBeLessThan(600_000)
    const b = restoreSimulation(JSON.parse(json))
    expect(stateHash(b)).toBe(stateHash(a))
    expect(b.state.night.active).toBe(true)
    runTicks(a, 101 * RULES.tickHz, 15 * RULES.tickHz)
    runTicks(b, 101 * RULES.tickHz, 15 * RULES.tickHz)
    expect(stateHash(b)).toBe(stateHash(a))
    expect(b.state.over).toBe(a.state.over)
    expect(b.state.stats).toEqual(a.state.stats)
  })
})

describe('cachette et Grande Ombre (GDD §7.1, §9.2)', () => {
  it('un oiseau bas sous le parasol est caché : ni verrouillable, ni ciblé', () => {
    const sim = controlledSim(2, { a: 110, b: 76 })
    // parasol du lobby en (−30, 10), disque de 14 m à 25-28 m ; à midi son ombre est sous lui
    placeBird(sim, 0, -22, 10, RULES.altLow, Math.PI / 2)
    placeBird(sim, 1, -22, 0, RULES.altHigh, Math.PI / 2)
    const ev: SimEvent[] = []
    ev.push(...sim.step([holdInput(sim, 0), holdInput(sim, 1)]))
    expect(sim.state.bySlot[0]!.hidden).toBe(true)
    expect(sim.state.bySlot[1]!.lockTarget).toBe(-1)
    expect(ev.some((e) => e.type === 'hidden' && e.slot === 0 && e.hidden)).toBe(true)
    // le même oiseau hors de l'ombre est verrouillable
    placeBird(sim, 0, 40, -30, RULES.altLow, Math.PI / 2)
    placeBird(sim, 1, 40, -40, RULES.altHigh, Math.PI / 2)
    sim.step([holdInput(sim, 0), holdInput(sim, 1)])
    expect(sim.state.bySlot[0]!.hidden).toBe(false)
    expect(sim.state.bySlot[1]!.lockTarget).toBe(0)
  })

  it('front de nuit : du bord ouest à 98 s au bord est à 110 s, sable figé derrière, oiseaux dans la nuit', () => {
    const sim = createSimulation(roundConfig(6, { countdown: false }))
    const st = sim.state
    const inputs: (BirdInput | undefined)[] = []
    while (st.sun.t < 97.9) sim.step(inputs)
    expect(st.night.active).toBe(false)
    while (st.sun.t < 98.05) sim.step(inputs)
    expect(st.night.active).toBe(true)
    expect(st.night.s).toBeLessThan(-st.arena.a + 1)
    // vitesse du front ≈ 27,5 m/s dans l'arène 5-6 (GDD §17-B), profil dentelé compris
    const v = frontSpeed(st.arena.a, st.arena.b, 110, st.night.dirX, st.night.dirY)
    expect(v).toBeGreaterThan(27)
    expect(v).toBeLessThan(29.5)
    while (st.sun.t < 104) sim.step(inputs)
    // la moitié ouest est dans la nuit et figée, l'est non
    expect(cellAtPoint(sim, -100, 0).frozen).toBe(1)
    const east = cellAtPoint(sim, 140, 0)
    expect(east.frozen).toBe(0)
    // un oiseau placé loin dans la nuit y est (et n'est pas « caché »)
    const bird = st.birds[0]!
    placeBird(sim, bird.slot, -120, 0, RULES.altLow)
    sim.step(inputs)
    expect(bird.inNight).toBe(true)
    expect(bird.hidden).toBe(false)
    // un oiseau haut dans la nuit dont l'ombre tombe devant le front peint encore
    placeBird(sim, bird.slot, st.night.s - 40, 0, RULES.altHigh)
    const before = st.grid.counts[bird.slot + 1]!
    setCells(sim, st.night.s + 80, 0, 50, 0, 0)
    sim.step([{ dirX: 0, dirY: 1, dive: false, divePresses: 0, flapPresses: 0 }])
    expect(bird.inNight).toBe(false)
    expect(st.grid.counts[bird.slot + 1]!).toBeGreaterThan(before - 1)
  })
})

describe('vol de traînée (GDD §8.4)', () => {
  /** Un chasseur (0) touche une cible basse (1) qui vole vers l'est depuis 3 s. */
  function trailScenario(crownVictim: boolean): { sim: Simulation; hit: SimEvent | undefined; hitX: number; y: number } {
    const sim = controlledSim(2, { a: 200, b: 140 })
    const st = sim.state
    const y = -60
    placeBird(sim, 1, -40, y, RULES.altLow, 0)
    placeBird(sim, 0, -120, 60, RULES.altHigh, 0)
    if (crownVictim) setCells(sim, 100, 80, 25, 2, RULES.levelStrong)
    const hunterIn: BirdInput = { dirX: 1, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    let hit: SimEvent | undefined
    // 3 s de vol : la cible peint une bande forte
    for (let i = 0; i < 3 * RULES.tickHz; i++) sim.step([hunterIn, holdInput(sim, 1)])
    if (crownVictim) expect(st.crownSlot).toBe(1)
    // le chasseur se place au-dessus, derrière la cible, puis pique
    const v = st.bySlot[1]!
    placeBird(sim, 0, v.x - 12, v.y + 2, RULES.altHigh, 0)
    for (let i = 0; i < 90 && !hit; i++) {
      const a = st.bySlot[0]!
      if (a.lockTarget === 1 && a.dive === 'none') {
        hunterIn.divePresses++
        hunterIn.dive = true
      }
      for (const e of sim.step([hunterIn, holdInput(sim, 1)])) if (e.type === 'diveHit' || e.type === 'diveMiss') hit = e
    }
    return { sim, hit, hitX: hit && hit.type === 'diveHit' ? hit.x : 0, y }
  }

  it('les 1,5 dernières secondes de traînée passent au chasseur, en gardant leur niveau', () => {
    const { sim, hit, hitX, y } = trailScenario(false)
    expect(hit?.type).toBe('diveHit')
    if (hit?.type !== 'diveHit') return
    expect(hit.stolenCells).toBeGreaterThan(50)
    // 10 m derrière la touche (≈ 0,6 s) : au chasseur, niveau fort conservé
    expect(cellAtPoint(sim, hitX - 10, y)).toMatchObject({ owner: 1, level: RULES.levelStrong })
    // 40 m derrière (≈ 2,5 s) : toujours à la victime
    expect(cellAtPoint(sim, hitX - 40, y)).toMatchObject({ owner: 2, level: RULES.levelStrong })
    const st = sim.state
    expect(st.bySlot[1]!.stun).toBeGreaterThan(0)
    expect(st.bySlot[1]!.stunKind).toBe('hit')
    expect(st.stats[0]!.hits).toBe(1)
    expect(st.stats[1]!.gotHit).toBe(1)
    expect(st.stats[0]!.trailStolenCells).toBe(hit.stolenCells)
    // vague : les cellules volées changent dans les 0,4 s à venir (changedAt futur, borné)
    const g = st.grid
    let maxAhead = 0
    for (let k = 0; k < g.changedAt.length; k++) if (g.owner[k] === 1 && g.prevOwner[k] === 2) maxAhead = Math.max(maxAhead, g.changedAt[k]! - st.time)
    expect(maxAhead).toBeGreaterThan(0.1)
    expect(maxAhead).toBeLessThanOrEqual(RULES.trailStealWaveSeconds + 1e-3)
  })

  it('sur la couronne, la traînée volée est de 3 s', () => {
    const plain = trailScenario(false)
    const crown = trailScenario(true)
    expect(crown.hit?.type).toBe('diveHit')
    if (crown.hit?.type !== 'diveHit' || plain.hit?.type !== 'diveHit') return
    expect(crown.hit.crown).toBe(true)
    expect(crown.hit.stolenCells).toBeGreaterThan(plain.hit.stolenCells * 1.6)
    expect(cellAtPoint(crown.sim, crown.hitX - 40, crown.y).owner).toBe(1)
  })

  it('après la touche : décrochage 1,5 s, immunité 2,5 s, rebond et recharge du chasseur', () => {
    const { sim, hit } = trailScenario(false)
    expect(hit?.type).toBe('diveHit')
    const st = sim.state
    const a = st.bySlot[0]!
    const v = st.bySlot[1]!
    expect(a.dive).toBe('none')
    expect(a.diveCooldown).toBeGreaterThan(0.9)
    expect(v.stun).toBeGreaterThan(1.4)
    const ev: SimEvent[] = []
    for (let i = 0; i < 2 * RULES.tickHz; i++) ev.push(...sim.step([holdInput(sim, 0), holdInput(sim, 1)]))
    expect(ev.some((e) => e.type === 'stunEnd' && e.slot === 1)).toBe(true)
    expect(v.immune).toBeGreaterThan(1.5)
    for (let i = 0; i < 3 * RULES.tickHz; i++) ev.push(...sim.step([holdInput(sim, 0), holdInput(sim, 1)]))
    expect(ev.some((e) => e.type === 'immuneEnd' && e.slot === 1)).toBe(true)
  })
})

describe('lobby et démo', () => {
  it('lobby : soleil fixe, territoire remis à zéro toutes les 30 s, oiseaux ajoutés et retirés, jamais de fin', () => {
    const sim = createSimulation({ mode: 'lobby', seed: 3, mapId: 'lobby', birds: [{ slot: 0, assist: false }], sunSeconds: 110, countdown: false })
    const st = sim.state
    expect(st.arena).toMatchObject({ a: RULES.lobbyArenaA, b: RULES.lobbyArenaB })
    const e0 = st.sun.elevation
    const ev: SimEvent[] = []
    for (let i = 0; i < 20 * RULES.tickHz; i++) ev.push(...sim.step([scriptedInput(i, 0)]))
    expect(st.sun.elevation).toBe(e0)
    expect(st.sun.paletteElevDeg).toBe(RULES.lobbyPaletteElevDeg)
    expect(st.grid.counts[1]!).toBeGreaterThan(0)
    sim.addBird({ slot: 3, assist: true })
    expect(st.bySlot[3]).toBeDefined()
    for (let i = 0; i < 11 * RULES.tickHz; i++) ev.push(...sim.step([scriptedInput(i, 0), undefined, undefined, scriptedInput(i, 3)]))
    expect(ev.filter((e) => e.type === 'territoryReset')).toHaveLength(1)
    expect(st.grid.counts[1]! + st.grid.counts[4]!).toBeLessThan(st.grid.arenaCells * 0.3)
    sim.removeBird(3)
    expect(st.bySlot[3]).toBeUndefined()
    expect(st.grid.counts[4]).toBe(0)
    expect(st.over).toBe(false)
    expect(st.night.active).toBe(false)
  })

  it('démo : soleil court, puis la manche boucle', () => {
    const sim = createSimulation({ mode: 'demo', seed: 5, mapId: 'parasols', birds: [0, 1, 2, 3].map((slot) => ({ slot, assist: false })), sunSeconds: RULES.titleDemoSunSeconds, countdown: false })
    const ev: SimEvent[] = []
    const total = (RULES.titleDemoSunSeconds + RULES.nightHoldSeconds + RULES.demoLoopPauseSeconds + 5) * RULES.tickHz
    for (let i = 0; i < total; i++) ev.push(...sim.step([0, 1, 2, 3].map((s) => scriptedInput(i, s))))
    expect(ev.some((e) => e.type === 'night')).toBe(true)
    expect(ev.some((e) => e.type === 'territoryReset')).toBe(true)
    expect(sim.state.over).toBe(false)
    expect(sim.state.sun.t).toBeGreaterThan(3)
    expect(sim.state.sun.t).toBeLessThan(6)
  })
})

describe('entrées et oiseau (GDD §5)', () => {
  it('altitudes, vitesses, virage : 4 m / 18 m, 16 / 21 m/s, montée 1,75 s, descente 0,64 s', () => {
    const sim = controlledSim(1, { a: 400, b: 300 })
    const b = sim.state.bySlot[0]!
    placeBird(sim, 0, 0, -100, RULES.altHigh, 0)
    const inp: BirdInput = { dirX: 1, dirY: 0, dive: true, divePresses: 0, flapPresses: 0 }
    let t = 0
    while (b.z > RULES.altLow + 1e-6 && t < 3) {
      sim.step([inp])
      t += DT
    }
    expect(t).toBeCloseTo(14 / RULES.descendRate, 1)
    for (let i = 0; i < 30; i++) sim.step([inp])
    expect(b.speed).toBeCloseTo(RULES.speedLow, 1)
    inp.dive = false
    t = 0
    while (b.z < RULES.altHigh - 1e-6 && t < 5) {
      sim.step([inp])
      t += DT
    }
    expect(t).toBeCloseTo(14 / RULES.climbRate, 1)
    for (let i = 0; i < 30; i++) sim.step([inp])
    expect(b.speed).toBeCloseTo(RULES.speedHigh, 1)
    // demi-tour : 180° à 105°/s (haut) avec accélération de lacet ≈ 1,85 s
    inp.dirX = -1
    t = 0
    while (Math.cos(b.heading) > -0.999 && t < 5) {
      sim.step([inp])
      t += DT
    }
    expect(t).toBeGreaterThan(180 / RULES.turnHighDegPerS)
    expect(t).toBeLessThan(180 / RULES.turnHighDegPerS + 0.4)
  })

  it('coup d\'aile : +22 m/s pendant 0,3 s, recharge de 3 s, appui bref jamais perdu', () => {
    const sim = controlledSim(1, { a: 400, b: 300 })
    const b = sim.state.bySlot[0]!
    placeBird(sim, 0, 0, -100, RULES.altHigh, 0)
    const inp: BirdInput = { dirX: 1, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    for (let i = 0; i < 10; i++) sim.step([inp])
    const y0 = b.y
    inp.dirX = 0
    inp.dirY = 1
    inp.flapPresses = 1
    const ev = sim.step([inp])
    inp.dirX = 1
    inp.dirY = 0
    expect(ev.some((e) => e.type === 'flap')).toBe(true)
    for (let i = 0; i < 8; i++) sim.step([inp])
    expect(b.y - y0).toBeGreaterThan(RULES.flapImpulse * RULES.flapDuration * 0.9)
    // second appui pendant la recharge : ignoré (au-delà du tampon)
    inp.flapPresses = 2
    const ev2: SimEvent[] = []
    for (let i = 0; i < 2 * RULES.tickHz; i++) ev2.push(...sim.step([inp]))
    expect(ev2.some((e) => e.type === 'flap')).toBe(false)
    for (let i = 0; i < RULES.tickHz; i++) ev2.push(...sim.step([inp]))
    expect(ev2.some((e) => e.type === 'flapReady')).toBe(true)
  })

  it('Simoun : on ne sort jamais de l\'arène', () => {
    const sim = createSimulation(roundConfig(2, { countdown: false }))
    const st = sim.state
    const inp: BirdInput = { dirX: 1, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    let maxRho = 0
    let storm = false
    for (let i = 0; i < 20 * RULES.tickHz; i++) {
      for (const e of sim.step([inp, inp])) if (e.type === 'storm' && e.inside) storm = true
      for (const b of st.birds) maxRho = Math.max(maxRho, Math.hypot(b.x / st.arena.a, b.y / st.arena.b))
    }
    expect(storm).toBe(true)
    expect(maxRho).toBeLessThanOrEqual(RULES.stormHardAt + 1e-9)
  })

  it('collision avec un fût : glissade, jamais à l\'intérieur', () => {
    const sim = controlledSim(1, { a: 110, b: 76 })
    const st = sim.state
    const tower = st.towers[0]!
    placeBird(sim, 0, tower.x - 30, tower.y, RULES.altLow, 0)
    const inp: BirdInput = { dirX: 1, dirY: 0, dive: true, divePresses: 0, flapPresses: 0 }
    const ev: SimEvent[] = []
    let minD = Infinity
    for (let i = 0; i < 3 * RULES.tickHz; i++) {
      ev.push(...sim.step([inp]))
      const b = st.bySlot[0]!
      minD = Math.min(minD, Math.hypot(b.x - tower.x, b.y - tower.y))
    }
    expect(minD).toBeGreaterThanOrEqual(tower.trunkRadius + RULES.towerCollisionMargin - 0.05)
    void internalsOf
  })
})
