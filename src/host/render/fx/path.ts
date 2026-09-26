// Tampon circulaire de points (x, y, z, t) : historique des traînées, des bouts
// d'ailes et des centres d'ombre. Capacité fixe, aucune allocation après création.

export class PathBuffer {
  readonly data: Float32Array
  private head = -1
  private n = 0

  constructor(readonly capacity: number) {
    this.data = new Float32Array(capacity * 4)
  }

  get count(): number {
    return this.n
  }

  clear(): void {
    this.n = 0
    this.head = -1
  }

  push(x: number, y: number, z: number, t: number): void {
    this.head = (this.head + 1) % this.capacity
    const o = this.head * 4
    this.data[o] = x
    this.data[o + 1] = y
    this.data[o + 2] = z
    this.data[o + 3] = t
    if (this.n < this.capacity) this.n++
  }

  /** Index de stockage du k-ième point en partant du plus récent (k = 0). */
  at(k: number): number {
    return ((this.head - k + this.capacity * 2) % this.capacity) * 4
  }

  /** Retire les points les plus anciens pour n'en garder que `keep`. */
  truncate(keep: number): void {
    if (keep < this.n) this.n = Math.max(0, keep)
  }

  /** Copie les `count` points les plus récents (du plus ancien au plus récent) dans `out` (x, y, z, t). */
  copyRecent(out: Float32Array, count: number): number {
    const m = Math.min(count, this.n, out.length / 4)
    for (let i = 0; i < m; i++) {
      const o = this.at(m - 1 - i)
      out[i * 4] = this.data[o]!
      out[i * 4 + 1] = this.data[o + 1]!
      out[i * 4 + 2] = this.data[o + 2]!
      out[i * 4 + 3] = this.data[o + 3]!
    }
    return m
  }
}
