// Les 3 cartes des règles (GDD §2) : illustrations en ligne claire, animées en
// boucle de 2,5 s (CSS). Vue de dessus, soleil haut, sable KF80.
//  1. Un oiseau passe ; son ombre laisse une bande de sa couleur.
//  2. Un oiseau bas (petite ombre forte) mord sur du pâle ; la grande ombre
//     pâle d'un oiseau haut glisse sur du fort sans l'entamer (petits ✕).
//  3. Un oiseau haut replie ses ailes et fond sur un oiseau bas : sa traînée
//     change de couleur. Puis le couchant, et la nuit qui avance.
import type { ReactNode } from 'react'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { mixHex } from './color.ts'
import './styles/ruleart.css'

const SAND = '#F1DABE'
const SAND_WARM = '#F2B27A'
const CAST = '#A18EA1'
const BONE = '#EDEDDF'
const INK = '#2B1D23'

const CORAIL = PLAYER_COLORS[0].hex
const LAGON = PLAYER_COLORS[1].hex
const INDIGO = PLAYER_COLORS[2].hex

/** Lavis de territoire : fort (couleur à ~62 % sur le sable) ou pâle (~28 %). */
const wash = (hex: string, strong: boolean) => mixHex(SAND, hex, strong ? 0.62 : 0.3)
const edge = (hex: string) => mixHex(hex, INK, 0.25)
const shadowTint = (hex: string) => mixHex(CAST, hex, 0.22)

// Aile droite (vers y négatif), ligne claire : bord d'attaque droit, bout arrondi.
// Oiseau tourné vers +x ; envergure ≈ 92, corde à l'emplanture ≈ 19.
const WING = 'M6 -4L-5 -44Q-8.5 -49 -11.5 -44Q-13.5 -24 -13 -4Z'
const leX = (y: number) => 6 - (11 * (-y - 4)) / 40
const WING_BAND = `M${leX(-29)} -29L${leX(-36)} -36L-12.6 -36L-12.9 -29Z`
const WING_ROOT = `M${leX(-8)} -8L${leX(-12)} -12L-13 -12L-13 -8Z`

/** Oiseau vu de dessus, tourné vers +x, centré sur (0,0). `folded` : ailes repliées (piqué). */
function Bird({ color, folded = false }: { color: string; folded?: boolean }) {
  const wings = (
    <>
      <path d={WING} />
      <path d={WING} transform="scale(1 -1)" />
    </>
  )
  return (
    <g stroke={INK} strokeWidth={1.7} strokeLinejoin="round" strokeLinecap="round">
      <g fill={BONE} transform={folded ? 'scale(1 0.36) skewX(-30)' : undefined}>
        {wings}
        <g fill={color} stroke="none">
          <path d={WING_BAND} />
          <path d={WING_BAND} transform="scale(1 -1)" />
          <path d={WING_ROOT} />
          <path d={WING_ROOT} transform="scale(1 -1)" />
        </g>
        <g fill="none">{wings}</g>
      </g>
      <path d="M-12 0L-24 -6L-21 0L-24 6Z" fill={BONE} />
      <ellipse cx={-2} cy={0} rx={13.5} ry={6.6} fill={BONE} />
      <circle cx={14} cy={0} r={5} fill={BONE} />
      <path d="M18.4 -1.6L25.5 0L18.4 1.6Z" fill={BONE} />
      <circle cx={-2.5} cy={0} r={4.4} fill={color} />
    </g>
  )
}

function Pebbles() {
  const pts: [number, number][] = [
    [34, 26],
    [118, 204],
    [196, 30],
    [270, 196],
    [356, 38],
    [382, 170],
    [60, 120],
    [300, 112],
  ]
  return (
    <g stroke={INK} strokeWidth={1.6} strokeLinecap="round" opacity={0.4}>
      {pts.map(([x, y], k) => (
        <path key={k} d={`M${x} ${y}h4`} />
      ))}
    </g>
  )
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <svg className="rule-art" viewBox="0 0 400 230" width={400} height={230} aria-hidden>
      <rect width={400} height={230} fill={SAND} />
      <Pebbles />
      {children}
    </svg>
  )
}

/** Carte 1 : l'ombre peint. Oiseau bas : ombre forte, à peu près de son envergure. */
function Card1() {
  const r = 25
  return (
    <Frame>
      <g className="ra-fade">
        {/* bande peinte, qui suit l'ombre */}
        <g transform="translate(40 142)">
          <rect className="ra1-band" x={-r} y={-r} width={330} height={2 * r} rx={r} fill={wash(CORAIL, true)} stroke={edge(CORAIL)} strokeWidth={2} strokeOpacity={0.35} />
        </g>
        <g className="ra1-bird">
          <ellipse cx={12} cy={142} rx={r} ry={r} fill={shadowTint(CORAIL)} opacity={0.85} />
          <g transform="translate(0 122) scale(0.66)">
            <Bird color={CORAIL} />
          </g>
        </g>
      </g>
    </Frame>
  )
}

/** Carte 2 : bas = fort, haut = grand ; le fort gagne. */
function Card2() {
  return (
    <Frame>
      {/* zone pâle Lagon (haut), zone forte Corail (bas) */}
      <path d="M18 16Q120 6 230 14T384 20L380 102Q260 112 150 104T20 108Z" fill={wash(LAGON, false)} stroke={edge(LAGON)} strokeOpacity={0.3} strokeWidth={2} />
      <path d="M16 128Q140 118 250 124T386 126L382 214Q250 222 140 216T18 218Z" fill={wash(CORAIL, true)} stroke={edge(CORAIL)} strokeOpacity={0.35} strokeWidth={2} />
      <g className="ra-fade">
        {/* oiseau BAS : petite ombre forte qui repeint le pâle */}
        <g transform="translate(26 68)">
          <rect className="ra2-band" x={-15} y={-15} width={330} height={30} rx={15} fill={wash(CORAIL, true)} stroke={edge(CORAIL)} strokeOpacity={0.4} strokeWidth={1.6} />
        </g>
        <g className="ra2-low">
          <circle cx={6} cy={68} r={15} fill={shadowTint(CORAIL)} opacity={0.9} />
          <g transform="translate(0 58) scale(0.5)">
            <Bird color={CORAIL} />
          </g>
        </g>
        {/* oiseau HAUT : grande ombre pâle, sans effet sur le fort */}
        <g className="ra2-high">
          <ellipse cx={26} cy={180} rx={34} ry={34} fill={shadowTint(LAGON)} opacity={0.42} />
          <g className="ra2-sparks" stroke={INK} strokeWidth={2.2} strokeLinecap="round">
            <path d="M58 160l7 7m0 -7l-7 7" />
            <path d="M60 192l6 6m0 -6l-6 6" />
            <path d="M40 212l5 5m0 -5l-5 5" />
          </g>
          <g transform="translate(0 146) scale(0.8)">
            <Bird color={LAGON} />
          </g>
        </g>
      </g>
    </Frame>
  )
}

/** Carte 3 : piquer d'en haut vole la traînée ; puis la nuit tombe. */
function Card3() {
  return (
    <Frame>
      <rect className="ra3-warm" width={400} height={230} fill={SAND_WARM} />
      {/* traînée Corail, puis vague Indigo qui la remonte */}
      <g transform="translate(40 160)">
        <rect x={-14} y={-14} width={232} height={28} rx={14} fill={wash(CORAIL, true)} stroke={edge(CORAIL)} strokeOpacity={0.35} strokeWidth={1.8} />
        <rect className="ra3-steal" x={-14} y={-14} width={232} height={28} rx={14} fill={wash(INDIGO, true)} stroke={edge(INDIGO)} strokeOpacity={0.35} strokeWidth={1.8} />
      </g>
      {/* victime (oiseau bas) */}
      <g className="ra3-victim">
        <circle cx={5} cy={10} r={14} fill={shadowTint(CORAIL)} opacity={0.85} />
        <g transform="scale(0.5)">
          <Bird color={CORAIL} />
        </g>
      </g>
      {/* chasseur (oiseau haut) : grande ombre pâle, puis piqué ailes repliées */}
      <g className="ra3-hunter-shadow">
        <ellipse cx={0} cy={0} rx={30} ry={30} fill={shadowTint(INDIGO)} opacity={0.42} />
      </g>
      <g className="ra3-hunter">
        <g className="ra3-open">
          <Bird color={INDIGO} />
        </g>
        <g className="ra3-folded">
          <Bird color={INDIGO} folded />
        </g>
      </g>
      {/* éclaboussure d'encre à l'impact */}
      <g transform="translate(290 154)">
        <g className="ra3-splash">
          <path d="M0 -20L5 -7L18 -12L9 -1L21 6L7 7L9 21L0 10L-9 20L-7 7L-21 5L-9 -2L-17 -13L-5 -7Z" fill={INK} />
        </g>
      </g>
      {/* la nuit descend de la falaise (ouest → est) */}
      <g className="ra3-night">
        <path d="M-420 0H0L-6 22L4 44L-5 70L6 98L-4 126L5 154L-6 182L3 206L-2 230H-420Z" fill="#575568" />
        <g fill="#F7F0E3">
          <circle cx={-60} cy={40} r={1.8} />
          <circle cx={-150} cy={90} r={1.4} />
          <circle cx={-250} cy={30} r={1.6} />
          <circle cx={-320} cy={150} r={1.8} />
          <circle cx={-110} cy={190} r={1.3} />
        </g>
      </g>
    </Frame>
  )
}

export function RuleArt({ card }: { card: 1 | 2 | 3 }) {
  return card === 1 ? <Card1 /> : card === 2 ? <Card2 /> : <Card3 />
}
