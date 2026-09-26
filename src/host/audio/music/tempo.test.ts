import { describe, expect, it } from 'vitest'
import { RULES } from '../../../sim/rules.ts'
import { MusicClock } from './clock.ts'
import { TempoMap } from './tempo.ts'

describe('carte de tempo de la manche', () => {
  for (const T of [80, 110, 150]) {
    const m = new TempoMap(T)
    const scale = T / RULES.roundSunSeconds
    it(`T = ${T} s : le départ et la Grande Ombre tombent sur des premiers temps`, () => {
      expect(m.beatAt(0)).toBe(0)
      expect(m.beatAt(m.tGS) / 4).toBeCloseTo(m.barsToGS, 9)
      expect(m.tGS).toBeCloseTo(RULES.greatShadowAt * scale, 9)
      // ~84 BPM avant la Grande Ombre
      expect(m.bps0 * 60).toBeGreaterThan(80)
      expect(m.bps0 * 60).toBeLessThan(88)
    })
    it(`T = ${T} s : Grande Ombre en 2/4, cœur de 1 Hz à ~2 Hz, la nuit sur un premier temps`, () => {
      expect(m.gsBeats % 2).toBe(0)
      expect(m.rateAt(m.tGS)).toBeCloseTo(1, 9)
      expect(m.r1).toBeGreaterThan(1.8)
      expect(m.r1).toBeLessThan(2.3)
      expect(m.beatAt(T) - m.beatGS).toBeCloseTo(m.gsBeats, 6)
      expect(m.info(m.barOfBeat(m.beatAt(T) - 1e-6)).section).toBe('greatShadow')
    })
    it(`T = ${T} s : timeAtBeat inverse beatAt`, () => {
      for (let t = -3; t < T + 1; t += 0.37) expect(m.timeAtBeat(m.beatAt(t))).toBeCloseTo(t, 6)
    })
    it(`T = ${T} s : sections dans l'ordre, chacune d'au moins deux mesures`, () => {
      const s = m.starts
      expect(s.noon).toBe(0)
      expect(s.afternoon).toBeGreaterThan(0)
      expect(s.golden - s.afternoon).toBeGreaterThanOrEqual(2)
      expect(s.sunset - s.golden).toBeGreaterThanOrEqual(2)
      expect(s.greatShadow - s.sunset).toBeGreaterThanOrEqual(2)
      // chaque entrée de section tombe à moins d'une demi-mesure du changement de phase
      const bar = 4 / m.bps0
      expect(Math.abs(s.afternoon * bar - RULES.phaseAfternoonAt * scale)).toBeLessThanOrEqual(bar / 2 + 1e-9)
      expect(Math.abs(s.golden * bar - RULES.phaseGoldenAt * scale)).toBeLessThanOrEqual(bar / 2 + 1e-9)
    })
  }
})

describe('horloge musicale', () => {
  it('suit la simulation, ralentis compris, sans à-coups', () => {
    const c = new MusicClock()
    let sim = 0, audio = 0
    c.sync(sim, 1, audio)
    for (let i = 0; i < 600; i++) {
      const scale = i > 200 && i < 260 ? 0.35 : 1
      audio += 1 / 60
      sim += scale / 60 + (Math.random() - 0.5) * 0.004 // gigue des ticks
      c.sync(sim, scale, audio)
      expect(Math.abs(c.simT - sim)).toBeLessThan(0.02)
    }
  })
  it('se fige quand la simulation est en pause, et se recale à la reprise', () => {
    const c = new MusicClock()
    let audio = 0
    c.sync(10, 1, audio)
    for (let i = 0; i < 30; i++) c.sync(10, 1, (audio += 1 / 60))
    expect(c.rate).toBe(0)
    c.sync(30, 1, (audio += 1 / 60))
    expect(c.simT).toBe(30)
  })
})
