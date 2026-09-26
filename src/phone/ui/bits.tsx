// Petits composants partagés : chiffres à chasse fixe, barre d'échéance, soleil du bandeau.
import { useEffect, useRef } from 'react'

/** Nombre dont les chiffres occupent chacun une boîte de largeur fixe (ART_BIBLE §8.1). */
export function Num({ value, className }: { value: string; className?: string }) {
  return (
    <span className={`t-num ${className ?? ''}`}>
      {[...value].map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={i} className="num-d">
            {ch}
          </span>
        ) : (
          <span key={i}>{ch}</span>
        ),
      )}
    </span>
  )
}

/**
 * Barre d'échéance qui se vide jusqu'à `endAt` (performance.now, ms), animée en CSS :
 * aucune mise à jour React pendant le décompte.
 */
export function Deadline({ startAt, endAt }: { startAt: number; endAt: number }) {
  const ref = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const total = Math.max(1, endAt - startAt)
    const left = Math.max(0, endAt - performance.now())
    el.style.transition = 'none'
    el.style.transform = `scaleX(${left / total})`
    void el.offsetWidth
    el.style.transition = `transform ${left}ms linear`
    el.style.transform = 'scaleX(0)'
  }, [startAt, endAt])
  return (
    <div className="deadline" aria-hidden="true">
      <i ref={ref} />
    </div>
  )
}

/**
 * Mini-arc du soleil (bandeau) : un quart d'arc du zénith à la Falaise, à l'ouest (à gauche,
 * comme sur la TV), parcouru linéairement en temps. Segment de la Grande Ombre hachuré.
 */
export function SunArc({ u, size = 46 }: { u: number; size?: number }) {
  const cx = 40
  const cy = 30
  const r = 26
  const at = (k: number) => {
    const a = Math.PI / 2 + k * (Math.PI / 2) // du haut (zénith) vers la gauche (horizon ouest)
    return [cx + Math.cos(a) * r, cy - Math.sin(a) * r] as const
  }
  const [sx, sy] = at(Math.min(1, Math.max(0, u)))
  const gs = 98 / 110
  const [gx, gy] = at(gs)
  const [ex, ey] = at(1)
  return (
    <svg className="band__sun" width={size} height={size * 0.72} viewBox="0 0 46 34" aria-hidden="true">
      <path d={`M${cx} ${cy - r} A${r} ${r} 0 0 0 ${gx.toFixed(1)} ${gy.toFixed(1)}`} fill="none" stroke="currentColor" strokeWidth="2" />
      <path d={`M${gx.toFixed(1)} ${gy.toFixed(1)} A${r} ${r} 0 0 0 ${ex} ${ey}`} fill="none" stroke="currentColor" strokeWidth="4" strokeDasharray="1.6 1.6" />
      <path d="M8 31 L8 26 L11 24 L13 25 L15 22 L17 24 L17 31 Z" fill="currentColor" />
      <path d={`M4 ${cy + 1}H44`} stroke="currentColor" strokeWidth="1.5" />
      <circle cx={sx} cy={sy} r="5.2" fill="#FFF2C3" stroke="#2B1D23" strokeWidth="1.8" />
    </svg>
  )
}
