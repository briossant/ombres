// Arène elliptique (GDD §4) : rayon elliptique, distance au bord, Simoun.

/** Rayon elliptique : hypot(x/a, y/b) (1 = sur le bord). */
export function ellipticRadius(x: number, y: number, a: number, b: number): number {
  return Math.hypot(x / a, y / b)
}

/**
 * Distance euclidienne d'un point au bord de l'ellipse (positive à l'intérieur,
 * négative à l'extérieur). Recherche sur le paramètre angulaire (échantillonnage
 * puis affinage par section dorée) : exacte à 1 mm près, réservée à la mise en
 * place (cartes, apparitions), pas aux boucles chaudes.
 */
export function ellipseEdgeDistance(x: number, y: number, a: number, b: number): number {
  const px = Math.abs(x)
  const py = Math.abs(y)
  const d2 = (t: number) => {
    const ex = a * Math.cos(t) - px
    const ey = b * Math.sin(t) - py
    return ex * ex + ey * ey
  }
  const N = 48
  let best = 0
  let bestD = Infinity
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * (Math.PI / 2)
    const v = d2(t)
    if (v < bestD) {
      bestD = v
      best = t
    }
  }
  let lo = Math.max(0, best - Math.PI / 2 / N)
  let hi = Math.min(Math.PI / 2, best + Math.PI / 2 / N)
  const g = (Math.sqrt(5) - 1) / 2
  for (let i = 0; i < 40; i++) {
    const m1 = hi - g * (hi - lo)
    const m2 = lo + g * (hi - lo)
    if (d2(m1) < d2(m2)) hi = m2
    else lo = m1
  }
  const dist = Math.sqrt(d2((lo + hi) / 2))
  return ellipticRadius(x, y, a, b) <= 1 ? dist : -dist
}

/** Ramène un point sur le bord s'il en sort (Simoun, GDD §4.3). Retourne vrai si déplacé. */
export function clampToEllipse(p: { x: number; y: number }, a: number, b: number, maxRho = 1): boolean {
  const rho = ellipticRadius(p.x, p.y, a, b)
  if (rho <= maxRho) return false
  const k = maxRho / rho
  p.x *= k
  p.y *= k
  return true
}
