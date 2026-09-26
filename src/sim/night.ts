// La Grande Ombre (GDD §7.1) : front perpendiculaire à la direction des ombres, au
// profil dentelé fixe (la silhouette de la Falaise), qui traverse l'arène d'ouest
// en est entre greatShadowAt·T/110 et T. Derrière le front, le sable est figé.

import { RULES } from './rules.ts'
import type { NightState } from './types.ts'

/** Profil dentelé au point de coordonnée transverse q (m), interpolé linéairement. */
export function jagAt(night: NightState, q: number): number {
  const n = night.jag.length
  if (n === 0) return 0
  const f = ((q + night.jagSpan) / (2 * night.jagSpan)) * (n - 1)
  if (f <= 0) return night.jag[0]!
  if (f >= n - 1) return night.jag[n - 1]!
  const i = Math.floor(f)
  const t = f - i
  return night.jag[i]! + (night.jag[i + 1]! - night.jag[i]!) * t
}

/** Le point (x, y) est-il dans la nuit ? */
export function isNightAt(night: NightState, x: number, y: number): boolean {
  if (!night.active) return false
  const along = x * night.dirX + y * night.dirY
  const q = -x * night.dirY + y * night.dirX
  return along < night.s + jagAt(night, q)
}

/** Étendue de l'ellipse le long de (dx, dy) (fonction de support). */
export function ellipseSupport(a: number, b: number, dx: number, dy: number): number {
  return Math.sqrt(a * a * dx * dx + b * b * dy * dy)
}

/**
 * Position du front à l'instant t (s de soleil) : de −(ext + jag) à +(ext + jag)
 * entre le début de la Grande Ombre et T, pour que la nuit entre juste au bord
 * ouest et couvre tout au bord est.
 */
export function frontPosition(t: number, T: number, ext: number): number {
  const t0 = RULES.greatShadowAt * (T / RULES.roundSunSeconds)
  const k = Math.min(1, Math.max(0, (t - t0) / (T - t0)))
  const span = ext + RULES.greatShadowJagAmp
  return -span + 2 * span * k
}

/** Vitesse du front (m/s) pour une arène et une durée données (GDD §17-B). */
export function frontSpeed(a: number, b: number, T: number, dx: number, dy: number): number {
  const ext = ellipseSupport(a, b, dx, dy) + RULES.greatShadowJagAmp
  const t0 = RULES.greatShadowAt * (T / RULES.roundSunSeconds)
  return (2 * ext) / (T - t0)
}
