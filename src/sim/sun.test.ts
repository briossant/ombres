import { describe, expect, it } from 'vitest'
import { RULES, DEG } from './rules.ts'
import { makeSun, paletteElevDeg, phaseAt, sunAzimuthDeg, sunElevationDeg } from './sun.ts'
import { computeFootprint, makeFootprint, shadowRadius } from './footprint.ts'

// GDD §17-A : élévation, étirement, décalages et longueurs d'ombre BAS / HAUT
const TABLE: [t: number, e: number, S: number, offLow: number, offHigh: number, lenLow: number, lenHigh: number][] = [
  [0, 88.0, 1.0, 0.1, 0.6, 10, 22],
  [15, 71.5, 1.05, 1.3, 6, 11, 23],
  [30, 56.5, 1.2, 2.7, 12, 12, 26],
  [55, 35.1, 1.74, 5.7, 26, 17, 38],
  [70, 24.7, 2.4, 8.7, 39, 24, 53],
  [85, 16.4, 3.55, 13.6, 61, 35, 78],
  [98, 11.3, 5.11, 20.1, 90, 51, 112],
  [104, 9.8, 5.9, 23.3, 105, 59, 130],
  [110, 9.0, 6.39, 25.3, 114, 64, 141],
]

describe('soleil (GDD §7, §17-A)', () => {
  it.each(TABLE)('t = %d s : e, S, décalages et longueurs', (t, e, S, offLow, offHigh, lenLow, lenHigh) => {
    const s = makeSun(t, 110)
    expect(s.elevation / DEG).toBeCloseTo(e, 1)
    expect(s.stretch).toBeCloseTo(S, 1)
    expect(RULES.altLow * s.cotE).toBeCloseTo(offLow, 0)
    expect(Math.abs(RULES.altHigh * s.cotE - offHigh)).toBeLessThan(0.6)
    expect(Math.round(2 * shadowRadius(RULES.altLow) * s.stretch)).toBe(lenLow)
    expect(Math.round(2 * shadowRadius(RULES.altHigh) * s.stretch)).toBe(lenHigh)
  })

  it('azimut : 240° → 270°, ombres vers le nord-est puis plein est', () => {
    expect(sunAzimuthDeg(0)).toBeCloseTo(240, 6)
    expect(sunAzimuthDeg(1)).toBeCloseTo(270, 6)
    const noon = makeSun(0, 110)
    expect(noon.shadowDirX).toBeCloseTo(Math.sin(60 * DEG), 6)
    expect(noon.shadowDirY).toBeCloseTo(0.5, 6)
    const end = makeSun(110, 110)
    expect(end.shadowDirX).toBeCloseTo(1, 6)
    expect(end.shadowDirY).toBeCloseTo(0, 6)
  })

  it('phases mises à l\'échelle × T/110', () => {
    expect(phaseAt(-1, 110)).toBe('countdown')
    expect(phaseAt(0, 110)).toBe('noon')
    expect(phaseAt(15, 110)).toBe('afternoon')
    expect(phaseAt(55, 110)).toBe('golden')
    expect(phaseAt(85, 110)).toBe('sunset')
    expect(phaseAt(98, 110)).toBe('greatShadow')
    expect(phaseAt(110, 110)).toBe('night')
    expect(phaseAt(112, 110)).toBe('over')
    // manche courte de 80 s : Grande Ombre à 98 × 80/110
    expect(phaseAt((98 * 80) / 110 - 0.01, 80)).toBe('sunset')
    expect(phaseAt((98 * 80) / 110 + 0.01, 80)).toBe('greatShadow')
    // même courbe quelle que soit la durée : e ne dépend que de u
    expect(makeSun(40, 80).elevation).toBeCloseTo(makeSun(55, 110).elevation, 9)
  })

  it('horloge de palette : identité au-dessus de e(0,7 T), KF1 (1°) à la fin', () => {
    const eS = sunElevationDeg(0.7)
    expect(eS).toBeGreaterThan(20)
    expect(eS).toBeLessThan(21)
    expect(paletteElevDeg(60)).toBe(60)
    expect(paletteElevDeg(eS)).toBeCloseTo(eS, 9)
    expect(paletteElevDeg(RULES.sunElevEndDeg)).toBeCloseTo(1, 9)
    expect(makeSun(110, 110).paletteElevDeg).toBeCloseTo(1, 6)
    // monotone
    let prev = Infinity
    for (let t = 0; t <= 110; t += 1) {
      const p = makeSun(t, 110).paletteElevDeg
      expect(p).toBeLessThanOrEqual(prev + 1e-9)
      prev = p
    }
  })

  it('empreinte : ombre de sphère décalée et étirée (GDD §6.1)', () => {
    const s = makeSun(98, 110)
    const fp = computeFootprint(s, 10, 20, RULES.altHigh, makeFootprint())
    expect(fp.r).toBe(RULES.shadowRadiusHigh)
    expect(fp.rAlong).toBeCloseTo(RULES.shadowRadiusHigh * s.stretch, 9)
    expect(fp.cx).toBeCloseTo(10 + RULES.altHigh * s.cotE * s.shadowDirX, 9)
    expect(fp.cy).toBeCloseTo(20 + RULES.altHigh * s.cotE * s.shadowDirY, 9)
    expect(fp.strong).toBe(false)
    expect(computeFootprint(s, 0, 0, RULES.strongMaxAlt, makeFootprint()).strong).toBe(true)
    expect(computeFootprint(s, 0, 0, RULES.strongMaxAlt + 0.01, makeFootprint()).strong).toBe(false)
    expect(shadowRadius(11)).toBeCloseTo(5 + (6 * 7) / 14, 9)
  })
})
