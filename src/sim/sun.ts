// Le soleil (GDD §7, §19.2) et l'horloge de palette (ART_BIBLE §2.4).
//
// e(u) = end + (start − end)(1 − u)^γ ; az(u) = azEnd − (azEnd − azStart)(1 − u)^k.
// Tous les instants de phase sont donnés pour T = 110 s et mis à l'échelle × T/110.

import { RULES, DEG } from './rules.ts'
import type { RoundPhase, SunState } from './types.ts'
import { clamp } from './math.ts'

/** Échelle des instants de phase pour une durée de soleil T. */
export function phaseScale(T: number): number {
  return T / RULES.roundSunSeconds
}

/** Élévation de gameplay (degrés) pour u = t/T. */
export function sunElevationDeg(u: number): number {
  const k = Math.pow(1 - clamp(u, 0, 1), RULES.sunElevGamma)
  return RULES.sunElevEndDeg + (RULES.sunElevStartDeg - RULES.sunElevEndDeg) * k
}

/** Azimut (degrés depuis le nord, sens horaire) pour u = t/T. */
export function sunAzimuthDeg(u: number): number {
  const k = Math.pow(1 - clamp(u, 0, 1), RULES.sunAzEaseExp)
  return RULES.sunAzEndDeg - (RULES.sunAzEndDeg - RULES.sunAzStartDeg) * k
}

/**
 * Horloge de palette (ART_BIBLE §2.4) : identité au-dessus de E_s = e(0,7·T),
 * puis [E_end, E_s] → [1°, E_s], pour que chaque manche finisse sur KF1.
 */
export function paletteElevDeg(eDeg: number): number {
  const eEnd = RULES.sunElevEndDeg
  const eS = sunElevationDeg(0.7)
  if (eDeg >= eS) return eDeg
  return 1 + ((eDeg - eEnd) * (eS - 1)) / (eS - eEnd)
}

/** Phase de manche au temps de soleil t (s ; négatif = compte à rebours). */
export function phaseAt(t: number, T: number): RoundPhase {
  const k = phaseScale(T)
  if (t < 0) return 'countdown'
  if (t < RULES.phaseAfternoonAt * k) return 'noon'
  if (t < RULES.phaseGoldenAt * k) return 'afternoon'
  if (t < RULES.phaseSunsetAt * k) return 'golden'
  if (t < RULES.greatShadowAt * k) return 'sunset'
  if (t < T) return 'greatShadow'
  if (t < T + RULES.nightHoldSeconds) return 'night'
  return 'over'
}

/** Remplit la géométrie du soleil (élévation, azimut, direction des ombres, cot, étirement). */
export function setSunAngles(s: SunState, eDeg: number, azDeg: number): void {
  const e = eDeg * DEG
  const az = azDeg * DEG
  s.elevation = e
  s.azimuth = az
  // direction du soleil (sin az, cos az) en (x est, y nord) ; les ombres vont à l'opposé
  s.shadowDirX = -Math.sin(az)
  s.shadowDirY = -Math.cos(az)
  s.cotE = 1 / Math.tan(e)
  s.stretch = Math.min(1 / Math.sin(e), RULES.stretchMax)
}

/** État du soleil d'une manche au temps t (s de soleil) pour une durée T. */
export function updateRoundSun(s: SunState, t: number, T: number): void {
  const u = clamp(t / T, 0, 1)
  s.t = t
  s.T = T
  s.u = u
  const eDeg = sunElevationDeg(u)
  setSunAngles(s, eDeg, sunAzimuthDeg(u))
  s.paletteElevDeg = paletteElevDeg(eDeg)
  s.phase = phaseAt(t, T)
}

/** Nouvel état de soleil (manche) au temps t. */
export function makeSun(t: number, T: number): SunState {
  const s: SunState = {
    t: 0,
    u: 0,
    T,
    elevation: 0,
    azimuth: 0,
    shadowDirX: 0,
    shadowDirY: 0,
    cotE: 0,
    stretch: 1,
    paletteElevDeg: 0,
    phase: 'countdown',
  }
  updateRoundSun(s, t, T)
  return s
}

/** Soleil fixe (lobby) : élévation et azimut imposés. */
export function setFixedSun(s: SunState, t: number, T: number, eDeg: number, azDeg: number, paletteDeg: number, phase: RoundPhase): void {
  s.t = t
  s.T = T
  s.u = 0
  setSunAngles(s, eDeg, azDeg)
  s.paletteElevDeg = paletteDeg
  s.phase = phase
}
