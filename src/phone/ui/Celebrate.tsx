// Fin de partie, téléphone du vainqueur (idée W6 de la revue art) : son lavis couvre tout le fond en
// 1,5 s depuis son rang, avec un front mouillé (liseré de pigment), une gloire d'encre tourne derrière
// « 1er », et le téléphone joue un roulement de tambour. Les autres voient leurs chiffres s'écrire à la
// plume (classe .ink-write, phone.css). « Réduire les flashs » : gloire immobile (phone.css) ; le
// roulement passe par navigator.vibrate seul, sans flash de remplacement sur iOS.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { vibrate } from '../device/haptics.ts'

/** Début de la fête : après l'entrée du panneau (panel-in, 220 ms). */
export const CELEBRATE_DELAY_MS = 300
/** Durée du lavis qui couvre l'écran (W6). */
const FLOOD_MS = 1500
/**
 * Roulement de tambour (navigator.vibrate) : des coups qui se resserrent pendant que le lavis coule,
 * puis la frappe finale quand il couvre l'écran (≈ 1,5 s en tout).
 */
export const DRUM_ROLL: readonly number[] = [18, 110, 18, 90, 20, 70, 20, 55, 22, 45, 22, 36, 24, 30, 26, 26, 28, 24, 30, 22, 32, 20, 34, 60, 260]

/** Bord de lavis irrégulier (rayon 1, bruit ± amp), lissé en Catmull-Rom → Bézier. */
export function blobPath(seed: number, amp = 0.07, n = 40): string {
  const pts: [number, number][] = []
  for (let i = 0; i < n; i++) {
    const t = i / n
    const a = t * Math.PI * 2
    const noise = Math.sin(a * 3 + seed * 1.7) * 0.5 + Math.sin(a * 7 + seed * 3.1) * 0.3 + Math.sin(a * 13 + seed * 5.3) * 0.2
    const r = 1 - amp + noise * amp
    pts.push([Math.cos(a) * r, Math.sin(a) * r])
  }
  const p = (i: number) => pts[((i % n) + n) % n]!
  let d = `M${p(0)[0].toFixed(4)} ${p(0)[1].toFixed(4)}`
  for (let i = 0; i < n; i++) {
    const [ax, ay] = p(i - 1)
    const [bx, by] = p(i)
    const [cx, cy] = p(i + 1)
    const [ex, ey] = p(i + 2)
    d += ` C${(bx + (cx - ax) / 6).toFixed(4)} ${(by + (cy - ay) / 6).toFixed(4)} ${(cx - (ex - bx) / 6).toFixed(4)} ${(cy - (ey - by) / 6).toFixed(4)} ${cx.toFixed(4)} ${cy.toFixed(4)}`
  }
  return `${d} Z`
}

/**
 * Lavis du vainqueur : part du centre de `originSelector` (le rang) et couvre tout l'écran.
 * Placé juste après le lavis de fond et avant l'écran : les cases restent au-dessus.
 */
export function WinnerFlood({ color, originSelector }: { color: number; originSelector: string }) {
  const ref = useRef<SVGSVGElement>(null)
  const [geo, setGeo] = useState<{ x: number; y: number; r: number } | null>(null)

  useLayoutEffect(() => {
    const svg = ref.current
    if (!svg) return
    const measure = () => {
      const box = svg.getBoundingClientRect()
      const o = document.querySelector(originSelector)?.getBoundingClientRect()
      const x = o ? o.left + o.width / 2 - box.left : box.width * 0.25
      const y = o ? o.top + o.height / 2 - box.top : box.height * 0.55
      // Assez grand pour que le front (bruité, rayon ≥ 1 − 2 × amp) sorte de l'écran par tous les coins.
      const far = Math.max(Math.hypot(x, y), Math.hypot(box.width - x, y), Math.hypot(x, box.height - y), Math.hypot(box.width - x, box.height - y))
      setGeo({ x, y, r: far * 1.2 })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    return () => ro.disconnect()
  }, [originSelector])

  // Roulement de tambour, une fois, quand le lavis commence à couler (réglage Vibrations respecté).
  useEffect(() => {
    const id = setTimeout(() => vibrate(DRUM_ROLL), CELEBRATE_DELAY_MS)
    return () => clearTimeout(id)
  }, [])

  const d = blobPath(color * 3.7 + 0.9)
  return (
    <svg ref={ref} className="winner-flood" aria-hidden="true" style={{ ['--flood-ms' as string]: `${FLOOD_MS}ms`, ['--flood-delay' as string]: `${CELEBRATE_DELAY_MS}ms` }}>
      {geo && (
        <g transform={`translate(${geo.x.toFixed(1)} ${geo.y.toFixed(1)})`}>
          <g className="winner-flood__grow" style={{ ['--flood-r' as string]: geo.r.toFixed(1) }}>
            <path className="winner-flood__fill" d={d} />
            {/* front mouillé : le pigment s'accumule au bord de l'eau */}
            <path className="winner-flood__wet" d={d} vectorEffect="non-scaling-stroke" />
            <path className="winner-flood__rim" d={d} vectorEffect="non-scaling-stroke" />
          </g>
        </g>
      )}
    </svg>
  )
}

/** Gloire d'encre derrière le rang du vainqueur : disque soleil et rayons hachurés, qui tournent lentement. */
export function InkGlory() {
  const rays = []
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2
    const long = i % 2 === 0
    const r0 = 34
    const r1 = long ? 48 : 42
    rays.push(
      <path
        key={i}
        d={`M${(50 + Math.cos(a) * r0).toFixed(2)} ${(50 + Math.sin(a) * r0).toFixed(2)} L${(50 + Math.cos(a) * r1).toFixed(2)} ${(50 + Math.sin(a) * r1).toFixed(2)}`}
        strokeWidth={long ? 1.7 : 1.1}
      />,
    )
  }
  return (
    <svg className="ink-glory" viewBox="0 0 100 100" aria-hidden="true">
      <circle className="ink-glory__sun" cx="50" cy="50" r="31" />
      <g className="ink-glory__rays">{rays}</g>
    </svg>
  )
}
