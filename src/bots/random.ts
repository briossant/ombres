// Générateur à graine des bots (mulberry32 de la simulation) et tirages usuels.
// Jamais de Math.random() : une même graine rejoue exactement les mêmes décisions.

import { nextRandom, type RngState } from '../sim/rng.ts'
import { hash32 } from '../sim/math.ts'

export class Rng {
  private readonly st: RngState
  private spare = NaN

  constructor(seed: number) {
    this.st = { rng: hash32(seed | 0, 0xb075) | 0 }
  }

  /** Uniforme dans [0, 1). */
  next(): number {
    return nextRandom(this.st)
  }

  range(lo: number, hi: number): number {
    return lo + (hi - lo) * this.next()
  }

  /** Symétrique dans [−a, a). */
  sym(a: number): number {
    return (this.next() * 2 - 1) * a
  }

  chance(p: number): boolean {
    return p > 0 && this.next() < p
  }

  int(n: number): number {
    return Math.floor(this.next() * n)
  }

  pick<T>(items: readonly T[]): T {
    return items[Math.min(items.length - 1, this.int(items.length))]!
  }

  /** Tirage pondéré : renvoie l'index. */
  weighted(weights: readonly number[]): number {
    let total = 0
    for (const w of weights) total += Math.max(0, w)
    let r = this.next() * total
    for (let i = 0; i < weights.length; i++) {
      r -= Math.max(0, weights[i]!)
      if (r < 0) return i
    }
    return weights.length - 1
  }

  /** Loi normale centrée réduite (Box-Muller, la seconde valeur est gardée). */
  gauss(): number {
    if (!Number.isNaN(this.spare)) {
      const v = this.spare
      this.spare = NaN
      return v
    }
    let u = 0
    while (u <= 1e-12) u = this.next()
    const v = this.next()
    const m = Math.sqrt(-2 * Math.log(u))
    this.spare = m * Math.sin(2 * Math.PI * v)
    return m * Math.cos(2 * Math.PI * v)
  }

  /** Durée exponentielle de moyenne `mean` (processus de Poisson). */
  exp(mean: number): number {
    return -Math.log(1 - this.next()) * mean
  }
}
