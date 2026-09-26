// Lavis de fond : la couleur du joueur à 30 % sur le papier, bord irrégulier, liseré de 3 px
// (ART_BIBLE §8.7) — le téléphone ressemble au territoire du joueur. En mode daltonien, la trame
// du joueur (§3.5) s'y ajoute.
import { useLayoutEffect, useRef, useState } from 'react'
import { PLAYER_COLORS } from '../../shared/players.ts'

/** Bruit 1D périodique déterministe (somme de sinus), pour un bord de lavis « peint à la main ». */
function edgeNoise(t: number, seed: number): number {
  return (
    Math.sin(t * 2 * Math.PI * 3 + seed * 1.7) * 0.5 +
    Math.sin(t * 2 * Math.PI * 7 + seed * 3.1) * 0.3 +
    Math.sin(t * 2 * Math.PI * 13 + seed * 5.3) * 0.2
  )
}

/** Contour d'un rectangle arrondi bruité, lissé en Catmull-Rom → Bézier. */
export function washPath(w: number, h: number, seed: number, margin = 14, amp = 7): string {
  if (w < 40 || h < 40) return ''
  const r = Math.min(46, w / 4, h / 4)
  const x0 = margin
  const y0 = margin
  const x1 = w - margin
  const y1 = h - margin
  const perim = 2 * (x1 - x0 + y1 - y0)
  const N = Math.max(40, Math.round(perim / 22))
  // Points réguliers sur le rectangle arrondi (approximé), poussés vers l'intérieur par le bruit.
  const pts: [number, number][] = []
  for (let i = 0; i < N; i++) {
    const t = i / N
    let d = t * perim
    let x: number
    let y: number
    let nx: number
    let ny: number
    const W = x1 - x0
    const H = y1 - y0
    if (d < W) {
      x = x0 + d
      y = y0
      nx = 0
      ny = 1
    } else if ((d -= W) < H) {
      x = x1
      y = y0 + d
      nx = -1
      ny = 0
    } else if ((d -= H) < W) {
      x = x1 - d
      y = y1
      nx = 0
      ny = -1
    } else {
      d -= W
      x = x0
      y = y1 - d
      nx = 1
      ny = 0
    }
    // Coins : on rabat les points vers l'intérieur pour arrondir.
    const cx = Math.min(Math.max(x, x0 + r), x1 - r)
    const cy = Math.min(Math.max(y, y0 + r), y1 - r)
    const dx = x - cx
    const dy = y - cy
    const dist = Math.hypot(dx, dy)
    if (dist > r) {
      x = cx + (dx / dist) * r
      y = cy + (dy / dist) * r
    }
    const inset = (edgeNoise(t, seed) * 0.5 + 0.5) * amp
    pts.push([x + nx * inset, y + ny * inset])
  }
  const p = (i: number) => pts[((i % N) + N) % N]!
  let d = `M${p(0)[0].toFixed(1)} ${p(0)[1].toFixed(1)}`
  for (let i = 0; i < N; i++) {
    const [ax, ay] = p(i - 1)
    const [bx, by] = p(i)
    const [cx, cy] = p(i + 1)
    const [ex, ey] = p(i + 2)
    const c1x = bx + (cx - ax) / 6
    const c1y = by + (cy - ay) / 6
    const c2x = cx - (ex - bx) / 6
    const c2y = cy - (ey - by) / 6
    d += ` C${c1x.toFixed(1)} ${c1y.toFixed(1)} ${c2x.toFixed(1)} ${c2y.toFixed(1)} ${cx.toFixed(1)} ${cy.toFixed(1)}`
  }
  return `${d} Z`
}

/** Trame daltonienne du joueur (motifs §3.5), en espace écran. */
function CbPattern({ id, pattern, color }: { id: string; pattern: string; color: string }) {
  const s = 12
  const line = (d: string) => <path d={d} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" />
  let content
  switch (pattern) {
    case 'lignes45':
      content = line(`M0 ${s} L${s} 0`)
      break
    case 'lignes0':
      content = line(`M0 ${s / 2} H${s}`)
      break
    case 'points':
      content = <circle cx={s / 2} cy={s / 2} r={1.8} fill={color} />
      break
    case 'lignes90':
      content = line(`M${s / 2} 0 V${s}`)
      break
    case 'lignes135':
      content = line(`M0 0 L${s} ${s}`)
      break
    case 'grille':
      content = line(`M${s / 2} 0 V${s} M0 ${s / 2} H${s}`)
      break
    case 'grilleDiag':
      content = line(`M0 ${s} L${s} 0 M0 0 L${s} ${s}`)
      break
    case 'vagues':
      content = line(`M0 ${s / 2} Q${s / 4} ${s / 2 - 3} ${s / 2} ${s / 2} T${s} ${s / 2}`)
      break
    case 'tirets0':
      content = line(`M1 ${s / 2} H${s * 0.6}`)
      break
    case 'anneaux':
      content = <circle cx={s / 2} cy={s / 2} r={3} stroke={color} strokeWidth={1.4} fill="none" />
      break
    case 'zigzag':
      content = line(`M${s / 2 - 2} 0 L${s / 2 + 2} ${s / 2} L${s / 2 - 2} ${s}`)
      break
    default:
      content = line(`M${s / 2} 1 V${s * 0.6}`)
  }
  return (
    <pattern id={id} width={s} height={s} patternUnits="userSpaceOnUse">
      {content}
    </pattern>
  )
}

export function Wash({ color, colorblind = false }: { color: number | null; colorblind?: boolean }) {
  const ref = useRef<SVGSVGElement>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight })
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const pc = color !== null ? PLAYER_COLORS[color] : undefined
  const d = washPath(size.w, size.h, (color ?? 0) * 7.3 + 1.1)
  const patId = `cb-${color ?? 'x'}`
  return (
    <svg ref={ref} className="wash" aria-hidden="true">
      {pc && colorblind && (
        <defs>
          <CbPattern id={patId} pattern={pc.pattern} color={pc.text} />
        </defs>
      )}
      {d && pc && (
        <>
          <path className="fill" d={d} />
          {colorblind && <path d={d} fill={`url(#${patId})`} opacity={0.35} />}
          <path className="rim" d={d} />
        </>
      )}
    </svg>
  )
}
