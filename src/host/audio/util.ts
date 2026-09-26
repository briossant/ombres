// Petits outils partagés par le moteur audio : conversions, hasard à graine, rampes sans clic.

/** dB → gain linéaire. */
export const dbToGain = (db: number): number => (db <= -120 ? 0 : Math.pow(10, db / 20))
/** Gain linéaire → dB. */
export const gainToDb = (g: number): number => (g <= 1e-6 ? -120 : 20 * Math.log10(g))
/** Demi-tons → facteur de vitesse de lecture. */
export const semis = (st: number): number => Math.pow(2, st / 12)
export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v)
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t
/** Interpolation lissée (0 → 1) entre deux bornes. */
export function smoothstep(e0: number, e1: number, x: number): number {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** MIDI → Hz (la4 = 440). */
export const mtof = (m: number): number => 440 * Math.pow(2, (m - 69) / 12)

const NOTE_INDEX: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }
/** « A3 », « C#4 », « Bb2 » → numéro MIDI. */
export function noteToMidi(name: string): number {
  const m = /^([A-G])([#b]?)(-?\d)$/.exec(name)
  if (!m) throw new Error(`note invalide : ${name}`)
  const acc = m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0
  return 12 * (Number(m[3]) + 1) + NOTE_INDEX[m[1]!]! + acc
}

/** PRNG déterministe (mulberry32) : rendus hors ligne reproductibles. */
export class Rng {
  private s: number
  constructor(seed: number) {
    this.s = seed >>> 0 || 0x9e3779b9
  }
  next(): number {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0)
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next()
  }
  int(a: number, bInclusive: number): number {
    return a + Math.floor(this.next() * (bInclusive - a + 1))
  }
  chance(p: number): boolean {
    return this.next() < p
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length)]!
  }
}

/**
 * Rampe linéaire vers une cible, partant de la valeur courante (volumes, ducking, pause).
 * Finie (pas de setTargetAtTime sans fin) : le paramètre redevient constant, donc gratuit.
 */
export function rampTo(param: AudioParam, value: number, when: number, seconds: number): void {
  param.cancelScheduledValues(when)
  param.setValueAtTime(param.value, when)
  param.linearRampToValueAtTime(value, when + Math.max(seconds, 0.002))
}

/**
 * Rampe linéaire FINIE vers une valeur (remplace setTargetAtTime pour les mises à jour
 * fréquentes) : une fois la rampe terminée, le paramètre redevient constant et Chrome cesse de
 * le calculer à l'échantillon (un filtre automatisé recalcule ses coefficients à chaque
 * échantillon : c'est ce qui coûtait le plus cher dans l'ambiance).
 * Ne fait rien si l'écart relatif est sous `epsilon`.
 */
const glides = new WeakMap<AudioParam, { target: number; end: number }>()
export function glide(param: AudioParam, value: number, when: number, seconds: number, epsilon = 0.004): void {
  const tol = (a: number, b: number) => Math.abs(a - b) <= epsilon * Math.max(Math.abs(a), Math.abs(b), 1e-4)
  // déjà en route vers la même cible : on laisse finir (relancer la rampe à chaque image la ralentirait)
  const prev = glides.get(param)
  if (prev && tol(prev.target, value) && (when < prev.end || tol(param.value, value))) return
  const cur = param.value
  if (!prev && tol(cur, value)) return
  const end = when + Math.max(0.005, seconds)
  param.cancelScheduledValues(when)
  param.setValueAtTime(cur, when)
  param.linearRampToValueAtTime(value, end)
  glides.set(param, { target: value, end })
}

/** Pas instantané (sans rampe) si la valeur a assez changé : pour les filtres qui dérivent lentement. */
export function stepTo(param: AudioParam, value: number, when: number, epsilon = 0.01): void {
  if (Math.abs(value - param.value) <= epsilon * Math.max(Math.abs(param.value), 1e-4)) return
  param.cancelScheduledValues(when)
  param.setValueAtTime(value, when)
}
