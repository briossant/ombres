// Vibrations (navigator.vibrate). iOS ne les gère pas : l'interface remplace alors chaque
// vibration par un flash de la bordure (voir fx.ts), comme le prévoit le GDD §12.3.

let enabled = true

export const canVibrate = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'

export function setHapticsEnabled(on: boolean): void {
  enabled = on
  if (!on && canVibrate()) navigator.vibrate(0)
}

/** Vibre si possible. Retourne false quand l'appareil ne vibre pas (l'appelant fait un flash). */
export function vibrate(pattern: readonly number[]): boolean {
  if (!enabled || pattern.length === 0) return canVibrate()
  if (!canVibrate()) return false
  // Chrome refuse de vibrer avant le premier appui sur la page (page rechargée en pleine partie) :
  // on ne tente pas (pas d'erreur en console) et l'appelant fait le flash visuel.
  const activation = (navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation
  if (activation && !activation.hasBeenActive) return false
  try {
    return navigator.vibrate([...pattern])
  } catch {
    return false
  }
}
