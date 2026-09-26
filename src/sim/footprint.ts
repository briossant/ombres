// Ombre d'un oiseau (GDD §6.1) : ombre d'une sphère de rayon r(h), décalée de
// h·cot(e) dans la direction des ombres, étirée de S = min(1/sin e, stretchMax)
// le long de cette direction. Identique au rendu et au gameplay.

import { RULES } from './rules.ts'
import type { ShadowFootprint, SunState } from './types.ts'
import { clamp } from './math.ts'

/** α(h) ∈ [0, 1] : 0 au ras du sable (altLow), 1 au plafond (altHigh). */
export function altitudeAlpha(z: number): number {
  return clamp((z - RULES.altLow) / (RULES.altHigh - RULES.altLow), 0, 1)
}

/** Rayon de l'ombre avant étirement : r = 5 + 6·α (m). */
export function shadowRadius(z: number): number {
  return RULES.shadowRadiusLow + (RULES.shadowRadiusHigh - RULES.shadowRadiusLow) * altitudeAlpha(z)
}

/** FORT si l'altitude est ≤ RULES.strongMaxAlt. */
export function isStrongAltitude(z: number): boolean {
  return z <= RULES.strongMaxAlt
}

/** Vitesse de croisière interpolée selon l'altitude (m/s). */
export function cruiseSpeed(z: number): number {
  return RULES.speedLow + (RULES.speedHigh - RULES.speedLow) * altitudeAlpha(z)
}

export function makeFootprint(): ShadowFootprint {
  return { cx: 0, cy: 0, r: RULES.shadowRadiusHigh, rAlong: RULES.shadowRadiusHigh, strong: false, paints: false }
}

/** Empreinte de l'ombre d'un oiseau en (x, y, z) sous le soleil `sun` (en place). */
export function computeFootprint(sun: SunState, x: number, y: number, z: number, out: ShadowFootprint): ShadowFootprint {
  const off = z * sun.cotE
  const r = shadowRadius(z)
  out.cx = x + off * sun.shadowDirX
  out.cy = y + off * sun.shadowDirY
  out.r = r
  out.rAlong = r * sun.stretch
  out.strong = isStrongAltitude(z)
  return out
}

/** Le point (px, py) est-il dans l'ellipse de l'empreinte ? */
export function inFootprint(fp: ShadowFootprint, sun: SunState, px: number, py: number): boolean {
  const rx = px - fp.cx
  const ry = py - fp.cy
  const u = (rx * sun.shadowDirX + ry * sun.shadowDirY) / fp.rAlong
  const v = (-rx * sun.shadowDirY + ry * sun.shadowDirX) / fp.r
  return u * u + v * v <= 1
}

/**
 * 13 points d'échantillonnage de la cachette (GDD §9.2) en coordonnées d'ellipse
 * (u le long des ombres, v en travers, rayon 1 = bord) : le centre, 6 à mi-rayon,
 * 6 près du bord (0,95, décalés de 0,5 rad), comme validate.mjs.
 */
export const HIDE_SAMPLES: Float64Array = (() => {
  const n = RULES.hideSamplePoints
  const out = new Float64Array(n * 2)
  let k = 2 // centre en (0, 0)
  for (let q = 0; q < 6; q++) {
    const a = (q * Math.PI) / 3
    out[k++] = 0.5 * Math.cos(a)
    out[k++] = 0.5 * Math.sin(a)
    out[k++] = 0.95 * Math.cos(a + 0.5)
    out[k++] = 0.95 * Math.sin(a + 0.5)
  }
  return out
})()

/** Position monde du i-ème point d'échantillonnage de l'empreinte. */
export function footprintSample(fp: ShadowFootprint, sun: SunState, i: number, out: { x: number; y: number }): { x: number; y: number } {
  const u = HIDE_SAMPLES[2 * i]! * fp.rAlong
  const v = HIDE_SAMPLES[2 * i + 1]! * fp.r
  out.x = fp.cx + u * sun.shadowDirX - v * sun.shadowDirY
  out.y = fp.cy + u * sun.shadowDirY + v * sun.shadowDirX
  return out
}
