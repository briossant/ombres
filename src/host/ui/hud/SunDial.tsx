// Cadran solaire (GDD §13.3, ART_BIBLE §8.5) : le SEUL chronomètre de la manche.
// Quart d'arc du zénith à la crête de la Falaise ; le disque le parcourt
// linéairement en temps (u). Graduations aux phases, segment de la Grande
// Ombre hachuré, vignette de ciel à la couleur de la keyframe courante.
// Aucun chiffre : le nom de la phase s'affiche 3 s à chaque changement, sous le
// cadran, seulement si aucune bannière ne l'écrit déjà.
import { useEffect, useState } from 'react'
import { t } from '../../../shared/i18n.ts'
import { RULES } from '../../../sim/rules.ts'
import { paletteColor } from '../color.ts'
import { useHud } from '../viewModel.ts'

const SIZE = Math.round(RULES.hudDialHeightFrac * 1080)
// Géométrie (unités = px de conception).
const PAD = 16
const CX = SIZE - PAD - 18
const HORIZON = SIZE - PAD - 26
const R = CX - PAD - 6
const CLIFF_H = 20
/** Angle (depuis le zénith) où le disque touche la crête de la Falaise. */
const THETA_MAX = Math.PI / 2 - Math.asin(Math.min(1, CLIFF_H / R))

const PHASE_MARKS = [RULES.phaseAfternoonAt, RULES.phaseGoldenAt, RULES.phaseSunsetAt, RULES.greatShadowAt].map(s => s / RULES.roundSunSeconds)
const GREAT_U = RULES.greatShadowAt / RULES.roundSunSeconds

const pt = (theta: number, r = R): [number, number] => [CX - r * Math.sin(theta), HORIZON - r * Math.cos(theta)]
const thetaAt = (u: number) => Math.min(1, Math.max(0, u)) * THETA_MAX

export function SunDial() {
  const u = useHud(s => s.sunU)
  const elev = useHud(s => s.paletteElevDeg)
  const phase = useHud(s => s.phase)
  const round = useHud(s => s.round)
  const rounds = useHud(s => s.rounds)
  const double = useHud(s => s.doubleRound)
  // Le nom de phase n'est écrit qu'une fois : pas d'onglet tant qu'une bannière est affichée.
  const bannerShown = useHud(s => s.banner !== null)
  const [label, setLabel] = useState<{ phase: string; id: number } | null>(null)

  // Nom de phase pendant RULES.phaseBannerSeconds à chaque changement.
  useEffect(() => {
    if (phase === 'countdown' || phase === 'over') return
    setLabel({ phase, id: performance.now() })
    const id = setTimeout(() => setLabel(null), RULES.phaseBannerSeconds * 1000)
    return () => clearTimeout(id)
  }, [phase])

  const night = phase === 'night' || phase === 'over'
  const skyTop = paletteColor('skyTop', night ? -15 : elev)
  const skyHorizon = paletteColor('skyHorizon', night ? -4 : elev)
  const ground = paletteColor('groundFlat', night ? -4 : elev)
  const sunCol = night ? '#E3F0FE' : paletteColor('sun', elev)
  const [sx, sy] = pt(thetaAt(u))
  const [zx, zy] = pt(0)
  const [ex, ey] = pt(THETA_MAX)
  const [gx, gy] = pt(thetaAt(GREAT_U))
  const [gxo, gyo] = pt(thetaAt(GREAT_U), R + 9)
  const [exo, eyo] = pt(THETA_MAX, R + 9)

  return (
    <div className="dial case" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
        <defs>
          <linearGradient id="dial-sky" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={skyTop} />
            <stop offset="1" stopColor={skyHorizon} />
          </linearGradient>
          <pattern id="dial-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <path d="M0 0V5" stroke="var(--ink)" strokeWidth="1.6" />
          </pattern>
          <clipPath id="dial-clip">
            <path d={`M${CX} ${HORIZON}L${zx} ${zy}A${R} ${R} 0 0 0 ${CX - R} ${HORIZON}Z`} />
          </clipPath>
        </defs>
        {/* Vignette de ciel (quart de disque) */}
        <path d={`M${CX} ${HORIZON}L${zx} ${zy}A${R} ${R} 0 0 0 ${CX - R} ${HORIZON}Z`} fill="url(#dial-sky)" />
        {/* Segment de la Grande Ombre : secteur hachuré */}
        <path d={`M${CX} ${HORIZON}L${gx} ${gy}A${R} ${R} 0 0 0 ${CX - R} ${HORIZON}Z`} fill="url(#dial-hatch)" opacity={0.55} clipPath="url(#dial-clip)" />
        {/* Sol et Falaise */}
        <rect x={PAD - 6} y={HORIZON} width={SIZE - 2 * PAD + 12} height={SIZE - HORIZON - PAD + 6} fill={ground} />
        <path
          d={`M${CX - R - 14} ${HORIZON}L${CX - R - 10} ${HORIZON - CLIFF_H + 3}L${CX - R - 4} ${HORIZON - CLIFF_H}L${CX - R + 26} ${HORIZON - CLIFF_H - 1}L${CX - R + 31} ${HORIZON - CLIFF_H + 5}L${CX - R + 40} ${HORIZON}Z`}
          fill={night ? '#45455D' : paletteColor('castShadow', elev)}
          stroke="var(--ink)"
          strokeWidth={2}
          strokeLinejoin="round"
        />
        <path d={`M${PAD - 6} ${HORIZON}H${SIZE - PAD + 6}`} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        {/* Arc et rayon du zénith */}
        <path d={`M${zx} ${zy}A${R} ${R} 0 0 0 ${ex} ${ey}`} fill="none" stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        <path d={`M${CX} ${HORIZON}V${zy}`} stroke="var(--ink)" strokeWidth={1.5} strokeDasharray="2 5" strokeLinecap="round" opacity={0.6} />
        {/* Graduations des phases */}
        {PHASE_MARKS.map((m, k) => {
          const [ax, ay] = pt(thetaAt(m), R - 7)
          const [bx, by] = pt(thetaAt(m), R + 7)
          return <path key={k} d={`M${ax} ${ay}L${bx} ${by}`} stroke="var(--ink)" strokeWidth={2.5} strokeLinecap="round" />
        })}
        {/* Épaississement du segment de nuit sur l'arc */}
        <path d={`M${gxo} ${gyo}A${R + 9} ${R + 9} 0 0 0 ${exo} ${eyo}`} fill="none" stroke="var(--ink)" strokeWidth={4} strokeLinecap="round" />
        {/* Soleil */}
        <circle cx={sx} cy={sy} r={14} fill={sunCol} stroke="var(--ink)" strokeWidth={2.5} />
      </svg>
      <div className="dial__round">
        {t('host.hud.round')}{' '}
        <span className="t-num">
          {round}/{rounds}
        </span>
        {double ? <span className="dial__double t-num">×2</span> : null}
      </div>
      {label && !bannerShown ? (
        <div className="dial__phase wipe" key={label.id}>
          {t(`host.phase.${label.phase}`)}
        </div>
      ) : null}
    </div>
  )
}
