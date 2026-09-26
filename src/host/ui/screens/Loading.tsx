// Écran de chargement (ART_BIBLE §8.8) : un soleil parcourt un arc pendant que
// l'ombre d'une tour s'allonge sur une bande de sable. La progression est
// réelle (useUi.loading.progress, écrite par le chargeur de phase 3). La
// palette de la vignette glisse du zénith (KF80) à l'heure dorée (KF16).
import { useEffect, useRef, useState } from 'react'
import { t } from '../../../shared/i18n.ts'
import { useUi } from '../viewModel.ts'
import { mixHex } from '../color.ts'
import { fmtPct } from '../format.ts'
import { Logo } from '../Logo.tsx'
import './loading.css'

// Géométrie de la vignette (unités SVG) : sol vu d'un peu au-dessus.
const VW = 1000
const VH = 420
const HORIZON = 236
const GROUND_H = 150
const BASE_Y = 296
const TOWER_X = 330
const SUN_CX = 540
const SUN_RX = 440
const SUN_RY = 200
/** Aplatissement du sol (profondeur → écran). */
const FLAT = 0.4
/** Direction des ombres au sol : vers la droite et un peu vers nous. */
const SHADOW_DIR = (22 * Math.PI) / 180
/** Longueur de l'ombre par unité de hauteur et de cot(e) (bornée à la vignette). */
const K = 0.6

const PEBBLES: [number, number][] = [
  [120, 262],
  [212, 322],
  [560, 350],
  [650, 262],
  [790, 330],
  [905, 276],
  [470, 300],
  [140, 356],
]

/** Élévation fictive (degrés) pour une progression 0..1 : 86° → 9°, comme la manche. */
const elevFor = (p: number) => 9 + 77 * Math.pow(1 - p, 1.3)

/** Point au sol à la distance `d` de la tour dans la direction des ombres. */
const along = (d: number): [number, number] => [TOWER_X + d * Math.cos(SHADOW_DIR), BASE_Y + d * Math.sin(SHADOW_DIR) * FLAT]

export function Loading() {
  const target = useUi(s => s.loading.progress)
  const labelKey = useUi(s => s.loading.labelKey)
  // Lissage visuel : le soleil rattrape la vraie progression (jamais en avance).
  const [p, setP] = useState(target)
  const pRef = useRef(target)
  useEffect(() => {
    let raf = 0
    const loop = () => {
      const cur = pRef.current
      const next = cur + (target - cur) * 0.12
      pRef.current = Math.abs(target - next) < 0.001 ? target : next
      setP(pRef.current)
      if (pRef.current !== target) raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const e = (elevFor(p) * Math.PI) / 180
  const cot = Math.min(7, 1 / Math.tan(e))
  const sunX = SUN_CX - SUN_RX * Math.cos(e)
  const sunY = HORIZON - SUN_RY * Math.sin(e)
  // Palette : KF80 → KF16 (sable, ombre, tour), en OKLab.
  const sand = mixHex('#F1DABE', '#F2B87A', p)
  const shadow = mixHex('#A18EA1', '#6F6089', p)
  const towerLit = mixHex('#EFE2C8', '#F6C592', p)
  const towerShade = mixHex('#C9B7A3', '#A9828C', p)

  // Tour « parasol » : fût, disque, flèche (hauteurs au-dessus du sol).
  const trunkH = 150
  const discR = 64
  const spireH = 206
  const [tx, ty] = along(trunkH * cot * K)
  const [dx, dy] = along(trunkH * cot * K)
  const [sx, sy] = along(spireH * cot * K)
  const w = 11 * FLAT // demi-largeur de l'ombre du fût, vue écrasée
  const pct = Math.round(target * 100)

  return (
    <div className="screen loading">
      {/* Dessins sans animation d'entrée ni police : visibles dès la première image
          (les textes, eux, attendent leurs polices en font-display: block). */}
      <Logo animate={false} className="loading__logo" />
      <svg className="loading__scene" viewBox={`0 0 ${VW} ${VH}`} width={VW} height={VH} aria-hidden>
        <defs>
          <clipPath id="ld-ground">
            <rect x="40" y={HORIZON} width={VW - 80} height={GROUND_H} />
          </clipPath>
        </defs>
        {/* Arc du soleil, en pointillés d'encre, avec les graduations des phases */}
        <path
          d={`M${SUN_CX - SUN_RX} ${HORIZON} A${SUN_RX} ${SUN_RY} 0 0 1 ${SUN_CX} ${HORIZON - SUN_RY}`}
          fill="none"
          stroke="var(--ink-35)"
          strokeWidth={2}
          strokeDasharray="2 9"
          strokeLinecap="round"
        />
        {/* Sol : aplat de sable, cailloux à l'encre */}
        <g clipPath="url(#ld-ground)">
          <rect x="0" y={HORIZON} width={VW} height={GROUND_H} fill={sand} />
          {PEBBLES.map(([x, y], k) => (
            <path key={k} d={`M${x} ${y}h6`} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" opacity={0.5} />
          ))}
          {/* Ombres plates : fût (bande), disque (ellipse), flèche (pointe) */}
          <path d={`M${TOWER_X - 2} ${BASE_Y - w}L${tx} ${ty - w}L${tx} ${ty + w}L${TOWER_X + 2} ${BASE_Y + w}Z`} fill={shadow} />
          <ellipse cx={dx} cy={dy} rx={discR} ry={discR * FLAT} fill={shadow} />
          <path d={`M${dx} ${dy - 3}L${sx} ${sy}L${dx} ${dy + 3}Z`} fill={shadow} />
          <ellipse cx={TOWER_X} cy={BASE_Y} rx={12} ry={12 * FLAT} fill={shadow} />
        </g>
        <path d={`M40 ${HORIZON}H${VW - 40}`} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        <path d={`M40 ${HORIZON + GROUND_H}H${VW - 40}`} stroke="var(--ink)" strokeWidth={2} strokeLinecap="round" opacity={0.45} />
        {/* Soleil */}
        <circle cx={sunX} cy={sunY} r={25} fill="var(--sun)" stroke="var(--ink)" strokeWidth={2.5} />
        {/* Tour : deux tons, terminateur net (lumière à gauche) */}
        <g stroke="var(--ink)" strokeWidth={2.5} strokeLinejoin="round">
          <path d={`M${TOWER_X - 11} ${BASE_Y}L${TOWER_X - 8} ${BASE_Y - trunkH}H${TOWER_X + 8}L${TOWER_X + 11} ${BASE_Y}Z`} fill={towerLit} />
          <path d={`M${TOWER_X + 1} ${BASE_Y - 2}L${TOWER_X + 1} ${BASE_Y - trunkH + 2}H${TOWER_X + 7}L${TOWER_X + 10} ${BASE_Y - 2}Z`} fill={towerShade} stroke="none" />
          <ellipse cx={TOWER_X} cy={BASE_Y - trunkH + 6} rx={discR} ry={11} fill={towerShade} />
          <ellipse cx={TOWER_X} cy={BASE_Y - trunkH} rx={discR} ry={11} fill={towerLit} />
          <path d={`M${TOWER_X - 4} ${BASE_Y - trunkH - 7}L${TOWER_X - 1.5} ${BASE_Y - spireH}H${TOWER_X + 1.5}L${TOWER_X + 4} ${BASE_Y - trunkH - 7}Z`} fill={towerLit} />
        </g>
      </svg>
      <p className="loading__tagline enter" style={{ ['--i' as string]: 2 }}>
        {t('host.loading.tagline')}
      </p>
      <div className="loading__status enter" style={{ ['--i' as string]: 3 }}>
        <span className="loading__label">{t(labelKey)}</span>
        <span className="loading__pct t-num">{fmtPct(pct / 100, 0)}</span>
      </div>
    </div>
  )
}
