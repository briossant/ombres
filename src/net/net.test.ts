// Tests unitaires des parties pures de src/net (aucun réseau).
import { describe, expect, it } from 'vitest'
import type { BirdState, SimEvent, SimState } from '../sim/types.ts'
import { RULES } from '../sim/rules.ts'
import { Backoff, RttEstimator, memoryStore } from './util.ts'
import { RELATIVE_MAX_DEG, toBirdInput, type PhoneControlState } from './phoneInput.ts'
import { CueRouter, leadersOf, rankOf, statusFromSim, statusUrgent } from './phoneCues.ts'
import { LobbyGoalTracker } from './lobbyGoals.ts'
import { isRoomCode, normalizeRoomCode, phoneId } from './phoneClient.ts'
import { joinUrlFor } from './hostSession.ts'
import { sanitizeName, NAME_MAX_LENGTH } from '../shared/messages.ts'
import type { PhoneCue } from '../shared/messages.ts'

describe('Backoff', () => {
  it('double de 0,5 à 4 s puis plafonne', () => {
    const b = new Backoff(500, 4000, 0)
    expect([b.next(), b.next(), b.next(), b.next(), b.next(), b.next()]).toEqual([500, 1000, 2000, 4000, 4000, 4000])
    b.reset()
    expect(b.next()).toBe(500)
  })
  it('gigue bornée à ±20 %', () => {
    const lo = new Backoff(500, 4000, 0.2, () => 0)
    const hi = new Backoff(500, 4000, 0.2, () => 1)
    expect(lo.next()).toBe(400)
    expect(hi.next()).toBe(600)
  })
})

describe('RttEstimator', () => {
  it('médiane glissante, insensible à une pointe', () => {
    const r = new RttEstimator(5)
    for (const v of [20, 22, 400, 21, 19]) r.add(v)
    expect(r.value).toBe(21)
    r.add(-5)
    expect(r.count).toBe(5)
  })
})

describe('codes de salle, noms, id', () => {
  it('normalise la saisie', () => {
    expect(normalizeRoomCode(' ab-cd ')).toBe('ABCD')
    expect(normalizeRoomCode('io01xyzw')).toBe('XYZW')
    expect(isRoomCode('ABCD')).toBe(true)
    expect(isRoomCode('ABCI')).toBe(false)
  })
  it('nettoie les noms', () => {
    expect(sanitizeName('  Jean \n  Paul ')).toBe('Jean Paul')
    expect(sanitizeName('a\u0000b‮c')).toBe('abc')
    expect([...sanitizeName('x'.repeat(40))].length).toBe(NAME_MAX_LENGTH)
    expect(sanitizeName('🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦🐦')).toBe('🐦'.repeat(NAME_MAX_LENGTH))
  })
  it('id persistant', () => {
    const store = memoryStore()
    const a = phoneId(store)
    expect(a).toMatch(/^[0-9a-f]{32}$/)
    expect(phoneId(store)).toBe(a)
  })
  it('URL du QR code', () => {
    expect(joinUrlFor('http://192.168.1.16:8803/', 'ABCD')).toBe('http://192.168.1.16:8803/play?r=ABCD')
  })
})

describe('toBirdInput', () => {
  const base: PhoneControlState = { x: 0, y: 0, dive: false, divePresses: 3, flapPresses: 4, scheme: 'absolute' }
  it('absolu : vecteur borné au disque, compteurs recopiés', () => {
    const b = toBirdInput({ ...base, x: 3, y: 4, dive: true }, 0)
    expect(b.dirX).toBeCloseTo(0.6)
    expect(b.dirY).toBeCloseTo(0.8)
    expect(b.dive).toBe(true)
    expect(b.divePresses).toBe(3)
    expect(b.flapPresses).toBe(4)
  })
  it('relatif : zone morte = garder le cap', () => {
    const b = toBirdInput({ ...base, scheme: 'relative', x: RULES.stickDeadzone * 0.5 }, 1)
    expect(b.dirX).toBe(0)
    expect(b.dirY).toBe(0)
  })
  it('relatif : stick à droite = virage à droite (cap décroissant)', () => {
    const heading = Math.PI / 2 // nord
    const b = toBirdInput({ ...base, scheme: 'relative', x: 1 }, heading)
    const target = Math.atan2(b.dirY, b.dirX)
    expect(target).toBeCloseTo(heading - (RELATIVE_MAX_DEG * Math.PI) / 180)
    const l = toBirdInput({ ...base, scheme: 'relative', x: -0.6 }, heading)
    expect(Math.atan2(l.dirY, l.dirX)).toBeGreaterThan(heading)
  })
})

// ─── Faux état de simulation ───────────────────────────────────────────────

function bird(slot: number, over: Partial<BirdState> = {}): BirdState {
  return {
    slot, x: 0, y: 0, z: 18, vx: 0, vy: 0, vz: 0, heading: 0, turnRate: 0, speed: 21, targetLow: false, strong: false,
    shadow: { cx: 0, cy: 0, r: 11, rAlong: 11, strong: false, paints: true },
    dive: 'none', diveTarget: -1, diveTime: 0, lockTarget: -1, lockedBy: -1, stun: 0, stunKind: 'none', immune: 0,
    flap: 0, flapCooldown: 0, diveCooldown: 0, hidden: false, inNight: false, inStorm: false, crown: false, assist: false, towerSlide: 0,
    ...over,
  }
}

function fakeState(birds: BirdState[], counts: number[], extra: Partial<SimState> = {}): SimState {
  const bySlot: (BirdState | undefined)[] = new Array(12).fill(undefined)
  for (const b of birds) bySlot[b.slot] = b
  const c = new Int32Array(13)
  counts.forEach((v, i) => (c[i] = v))
  return {
    config: { mode: 'round', seed: 1, mapId: 'parasols', birds: [], sunSeconds: 110, countdown: true },
    tick: 0, time: 10,
    sun: { t: 5, u: 0.3, T: 110, elevation: 1, azimuth: 4, shadowDirX: 1, shadowDirY: 0, cotE: 0.2, stretch: 1, paletteElevDeg: 60, phase: 'afternoon' },
    birds, bySlot,
    grid: { counts: c, arenaCells: 1000 } as unknown as SimState['grid'],
    crownSlot: -1,
    ...extra,
  } as unknown as SimState
}

describe('rang et statut', () => {
  it('rang avec ex æquo', () => {
    const s = fakeState([bird(0), bird(1), bird(2)], [0, 100, 300, 100])
    expect(rankOf(s, 1)).toBe(1)
    expect(rankOf(s, 0)).toBe(2)
    expect(rankOf(s, 2)).toBe(2)
    expect(leadersOf(s)).toEqual([1])
  })
  it('statusFromSim : PIQUER à la couleur de la cible, recharge, compte à rebours', () => {
    const s = fakeState([bird(0, { lockTarget: 1, flapCooldown: 1.234, strong: true }), bird(1, { lockedBy: 0 })], [0, 250, 50])
    const colorOf = (slot: number) => [7, 3][slot] ?? -1
    const st = statusFromSim(s, 0, colorOf)!
    expect(st.target).toBe(3)
    expect(st.hunter).toBe(-1)
    expect(st.share).toBeCloseTo(0.25)
    expect(st.flapCd).toBeCloseTo(1.2)
    expect(st.low).toBe(true)
    expect(statusFromSim(s, 1, colorOf)!.hunter).toBe(7)
    const cd = fakeState([bird(0)], [0], { sun: { ...s.sun, t: -2.2, phase: 'countdown' } })
    expect(statusFromSim(cd, 0, colorOf)!.countdown).toBe(3)
    expect(statusFromSim(s, 5, colorOf)).toBeNull()
  })
  it('urgence : cible et recharge repartie', () => {
    const s = fakeState([bird(0)], [0, 10])
    const a = statusFromSim(s, 0, () => 0)!
    expect(statusUrgent(a, { ...a, share: a.share + 0.01 })).toBe(false)
    expect(statusUrgent(a, { ...a, target: 4 })).toBe(true)
    expect(statusUrgent({ ...a, flapCd: 1 }, { ...a, flapCd: 2.9 })).toBe(true)
  })
})

describe('CueRouter', () => {
  const run = (events: SimEvent[], state: SimState, router = new CueRouter()) => {
    const out: [number | 'all', PhoneCue, number | undefined][] = []
    router.route(events, state, (t, c, n) => out.push([t, c, n]))
    return out
  }
  it('piqué : prise d’élan, clac, touche', () => {
    const s = fakeState([bird(0), bird(1)], [0, 1, 1])
    expect(run([{ type: 'diveWindup', hunter: 0, target: 1 }, { type: 'diveCommit', hunter: 0, target: 1 }], s)).toEqual([
      [1, 'windup', undefined],
      [1, 'clac', undefined],
    ])
    expect(run([{ type: 'diveHit', hunter: 0, target: 1, x: 0, y: 0, z: 0, stolenCells: 3, crown: false }], s)).toEqual([
      [0, 'hit', undefined],
      [1, 'stunned', undefined],
    ])
    expect(run([{ type: 'diveMiss', hunter: 0, target: 1, dodged: true, x: 0, y: 0 }], s)).toEqual([
      [0, 'planted', undefined],
      [1, 'dodge', undefined],
    ])
  })
  it('verrouillage : au plus un tic toutes les 2 s par cible', () => {
    const router = new CueRouter()
    const s = fakeState([bird(0), bird(1)], [0])
    const lock: SimEvent = { type: 'lock', hunter: 0, target: 1 }
    expect(run([lock], s, router)).toHaveLength(1)
    expect(run([lock], { ...s, time: s.time + 1 } as SimState, router)).toHaveLength(0)
    expect(run([lock], { ...s, time: s.time + RULES.lockTickMinGapSeconds } as SimState, router)).toHaveLength(1)
  })
  it('compte à rebours, dernières secondes, victoire', () => {
    const s = fakeState([bird(0), bird(1)], [0, 5, 9])
    expect(run([{ type: 'countdown', n: 2 }, { type: 'countdown', n: 0 }, { type: 'lastSeconds', n: 4 }, { type: 'over' }], s)).toEqual([
      ['all', 'countdown', 2],
      ['all', 'go', undefined],
      ['all', 'tick', 4],
      [1, 'roundWin', undefined],
    ])
  })
})

describe('LobbyGoalTracker', () => {
  it('coche Vole, Plonge, Pique', () => {
    const g = new LobbyGoalTracker()
    const dt = 1 / RULES.tickHz
    const fly = { dirX: 1, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    let ticks = 0
    while (!g.goals(2).fly && ticks < 500) {
      g.update(2, fly, dt)
      ticks++
    }
    expect(ticks).toBe(Math.ceil(RULES.lobbyGoalFlySeconds * RULES.tickHz - 1e-9))
    // PLONGER doit être tenu d'affilée : un relâché remet le compteur à zéro.
    for (let i = 0; i < 20; i++) g.update(2, { ...fly, dive: true }, dt)
    g.update(2, { ...fly, dive: false }, dt)
    expect(g.goals(2).dive).toBe(false)
    for (let i = 0; i < RULES.tickHz * RULES.lobbyGoalDiveHoldSeconds + 1; i++) g.update(2, { ...fly, dive: true }, dt)
    expect(g.goals(2).dive).toBe(true)
    expect(g.onSimEvent({ type: 'diveHit', hunter: 2, target: 5, x: 0, y: 0, z: 0, stolenCells: 0, crown: false })).toBe(2)
    expect(g.allDone(2)).toBe(true)
  })
})
