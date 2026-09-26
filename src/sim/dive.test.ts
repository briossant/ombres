import { describe, expect, it, vi } from 'vitest'
import { RULES } from './rules.ts'
import { controlledSim, diveTrial, holdInput, placeBird } from './testkit.ts'
import type { BirdInput, SimEvent } from './types.ts'

// manches complètes : la machine peut être chargée, on laisse de la marge
vi.setConfig({ testTimeout: 120_000 })

const N = 240

function batch(opts: Parameters<typeof diveTrial>[1] = {}, n = N) {
  let hits = 0
  let valid = 0
  let dur = 0
  const gaps: number[] = []
  for (let i = 0; i < n; i++) {
    const r = diveTrial(5000 + i, opts)
    if (r.cancelled) continue
    valid++
    if (r.hit) {
      hits++
      dur += r.duration
      if (r.committed) gaps.push(r.commitToContact)
    }
  }
  gaps.sort((a, b) => a - b)
  return { hit: hits / valid, dur: dur / Math.max(1, hits), median: gaps[gaps.length >> 1] ?? 0, valid }
}

describe('piqué : micro-simulation dans la vraie simulation (GDD §8, §17-E)', () => {
  it('sans réaction de la cible : ≈ 96 % de touches, piqué ≈ 0,87 s, clac → contact ≈ 0,4-0,5 s', { timeout: 60_000 }, () => {
    const r = batch()
    expect(r.valid).toBeGreaterThan(N * 0.9)
    expect(r.hit).toBeGreaterThan(0.93)
    expect(r.hit).toBeLessThan(0.995)
    expect(r.dur).toBeGreaterThan(0.75)
    expect(r.dur).toBeLessThan(0.95)
    expect(r.median).toBeGreaterThan(0.38)
    expect(r.median).toBeLessThan(0.52)
  })

  it('coup d\'aile au clac : la réaction décide (0,20 s esquive, 0,25-0,30 s à moitié, 0,40 s trop tard)', { timeout: 120_000 }, () => {
    const at = (rt: number) => batch({ flapAfterCommit: rt }).hit
    expect(at(0.2)).toBeLessThan(0.08)
    const r25 = at(0.25)
    expect(r25).toBeGreaterThan(0.06)
    expect(r25).toBeLessThan(0.35)
    const r30 = at(0.3)
    expect(r30).toBeGreaterThan(0.3)
    expect(r30).toBeLessThan(0.65)
    expect(at(0.4)).toBeGreaterThan(0.9)
  })

  it('grâce de latence : un coup d\'aile de téléphone compte à son horodatage client', { timeout: 60_000 }, () => {
    const late = batch({ flapAfterCommit: 0.35 }).hit
    const graced = batch({ flapAfterCommit: 0.35, latencyGrace: RULES.latencyGraceMax }).hit
    expect(late).toBeGreaterThan(0.85)
    expect(graced).toBeLessThan(0.3)
  })

  it('feinte : relâcher PLONGER avant le clac annule sans pénalité (recharge 1 s)', () => {
    const sim = controlledSim(2, { a: 300, b: 200 })
    placeBird(sim, 0, 100, -100, RULES.altHigh, 0)
    placeBird(sim, 1, 115, -100, RULES.altLow, 0)
    const ia: BirdInput = { dirX: 1, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    const ev: SimEvent[] = []
    ev.push(...sim.step([ia, holdInput(sim, 1)]))
    expect(sim.state.bySlot[0]!.lockTarget).toBe(1)
    ia.dive = true
    ia.divePresses = 1
    ev.push(...sim.step([ia, holdInput(sim, 1)]))
    expect(sim.state.bySlot[0]!.dive).toBe('windup')
    ia.dive = false
    for (let i = 0; i < 6; i++) ev.push(...sim.step([ia, holdInput(sim, 1)]))
    const cancel = ev.find((e) => e.type === 'diveCancel')
    expect(cancel).toMatchObject({ type: 'diveCancel', hunter: 0, target: 1, reason: 'feint' })
    const a = sim.state.bySlot[0]!
    expect(a.dive).toBe('none')
    expect(a.stun).toBe(0)
    expect(a.diveCooldown).toBeGreaterThan(0.7)
    expect(sim.state.stats[0]!.feints).toBe(1)
  })

  it('tomber sur quelqu\'un, c\'est le piquer : PLONGER maintenu quand la cible devient verrouillable', () => {
    const sim = controlledSim(2, { a: 300, b: 200 })
    // la cible arrive en face : elle entre dans la zone de verrouillage pendant la descente
    placeBird(sim, 0, 100, -100, RULES.altHigh, 0)
    placeBird(sim, 1, 136, -100, RULES.altLow, Math.PI)
    const ia: BirdInput = { dirX: 1, dirY: 0, dive: true, divePresses: 0, flapPresses: 0 }
    let windup = false
    for (let i = 0; i < 40 && !windup; i++) for (const e of sim.step([ia, holdInput(sim, 1)])) if (e.type === 'diveWindup') windup = true
    expect(windup).toBe(true)
  })

  it('raté : le chasseur décroche 1 s au ras du sable, recharge ensuite ; la cible qui a battu des ailes esquive', () => {
    let found = false
    for (let seed = 0; seed < 30 && !found; seed++) {
      const r = diveTrial(9000 + seed, { flapAfterCommit: 0.15 })
      const miss = r.events.find((e) => e.type === 'diveMiss')
      if (!miss || miss.type !== 'diveMiss') continue
      found = true
      expect(miss.dodged).toBe(true)
    }
    expect(found).toBe(true)
  })

  it('verrouillage : 6 m plus bas, 26 m, cône ±70° ; un seul chevron par cible', () => {
    const sim = controlledSim(3, { a: 300, b: 200 })
    placeBird(sim, 0, 100, -100, RULES.altHigh, 0)
    placeBird(sim, 2, 95, -100, RULES.altHigh, 0)
    placeBird(sim, 1, 120, -100, RULES.altLow, 0)
    sim.step([holdInput(sim, 0), holdInput(sim, 1), holdInput(sim, 2)])
    const st = sim.state
    expect(st.bySlot[0]!.lockTarget).toBe(1)
    expect(st.bySlot[2]!.lockTarget).toBe(1)
    expect(st.bySlot[1]!.lockedBy).toBe(0) // le plus proche
    // derrière le chasseur : hors cône
    placeBird(sim, 1, 70, -100, RULES.altLow, 0)
    placeBird(sim, 0, 100, -100, RULES.altHigh, 0)
    placeBird(sim, 2, 200, 50, RULES.altHigh, 0)
    sim.step([holdInput(sim, 0), holdInput(sim, 1), holdInput(sim, 2)])
    expect(st.bySlot[0]!.lockTarget).toBe(-1)
    // trop loin
    placeBird(sim, 1, 130, -100, RULES.altLow, 0)
    placeBird(sim, 0, 100, -100, RULES.altHigh, 0)
    sim.step([holdInput(sim, 0), holdInput(sim, 1), holdInput(sim, 2)])
    expect(st.bySlot[0]!.lockTarget).toBe(-1)
    // aide au vol : 34 m
    sim.setAssist(0, true)
    placeBird(sim, 1, 130, -100, RULES.altLow, 0)
    placeBird(sim, 0, 100, -100, RULES.altHigh, 0)
    sim.step([holdInput(sim, 0), holdInput(sim, 1), holdInput(sim, 2)])
    expect(st.bySlot[0]!.lockTarget).toBe(1)
  })
})
