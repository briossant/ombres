// Courbes de profil pour la génération des maillages : interpolation cubique
// monotone (Fritsch-Carlson, sans dépassement entre les clés) et spline de
// Catmull-Rom pour les lignes centrales. Utilisé à la construction seulement.

export type Key = readonly [x: number, y: number]

/** Profil 1D lisse passant par les clés, sans oscillation (monotone par morceaux). */
export function profile(keys: readonly Key[]): (x: number) => number {
  const n = keys.length
  const xs = keys.map(k => k[0])
  const ys = keys.map(k => k[1])
  if (n === 1) return () => ys[0]!
  const d: number[] = []
  const m: number[] = new Array<number>(n).fill(0)
  for (let i = 0; i < n - 1; i++) d.push((ys[i + 1]! - ys[i]!) / (xs[i + 1]! - xs[i]!))
  m[0] = d[0]!
  m[n - 1] = d[n - 2]!
  for (let i = 1; i < n - 1; i++) m[i] = d[i - 1]! * d[i]! <= 0 ? 0 : (d[i - 1]! + d[i]!) / 2
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0
      m[i + 1] = 0
      continue
    }
    const a = m[i]! / d[i]!
    const b = m[i + 1]! / d[i]!
    const s = a * a + b * b
    if (s > 9) {
      const t = 3 / Math.sqrt(s)
      m[i] = t * a * d[i]!
      m[i + 1] = t * b * d[i]!
    }
  }
  return (x: number) => {
    if (x <= xs[0]!) return ys[0]!
    if (x >= xs[n - 1]!) return ys[n - 1]!
    let i = 0
    while (i < n - 2 && x > xs[i + 1]!) i++
    const h = xs[i + 1]! - xs[i]!
    const t = (x - xs[i]!) / h
    const t2 = t * t
    const t3 = t2 * t
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i]! +
      (t3 - 2 * t2 + t) * h * m[i]! +
      (-2 * t3 + 3 * t2) * ys[i + 1]! +
      (t3 - t2) * h * m[i + 1]!
    )
  }
}

export type V3 = [number, number, number]

/** Spline de Catmull-Rom (centripète) à travers des points 3D, paramètre t ∈ [0, 1] uniforme par segment. */
export function catmullRom(points: readonly V3[]): (t: number) => V3 {
  const n = points.length
  const P = (i: number): V3 => points[Math.max(0, Math.min(n - 1, i))]!
  return (t: number) => {
    const f = Math.max(0, Math.min(0.999999, t)) * (n - 1)
    const i = Math.floor(f)
    const u = f - i
    const p0 = P(i - 1)
    const p1 = P(i)
    const p2 = P(i + 1)
    const p3 = P(i + 2)
    const out: V3 = [0, 0, 0]
    const u2 = u * u
    const u3 = u2 * u
    for (let k = 0; k < 3; k++) {
      out[k] =
        0.5 *
        (2 * p1[k] +
          (-p0[k] + p2[k]) * u +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * u2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * u3)
    }
    return out
  }
}

/** Répartition non uniforme de n+1 échantillons sur [0, 1], plus dense là où `density` est grand. */
export function distribute(n: number, density: (t: number) => number): number[] {
  const M = 512
  const cum: number[] = [0]
  for (let i = 1; i <= M; i++) cum.push(cum[i - 1]! + density((i - 0.5) / M))
  const total = cum[M]!
  const out: number[] = []
  let j = 0
  for (let i = 0; i <= n; i++) {
    const target = (i / n) * total
    while (j < M && cum[j + 1]! < target) j++
    const seg = cum[j + 1]! - cum[j]!
    const f = seg > 0 ? (target - cum[j]!) / seg : 0
    out.push(Math.min(1, (j + f) / M))
  }
  out[0] = 0
  out[n] = 1
  return out
}
