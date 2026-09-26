// Résultats de manche : la carte vue d'en haut devient une planche imprimée
// (polish H14, idée W2 de la revue art). DOM + SVG seulement, par-dessus la 3D :
// marge papier autour de la carte, cadre d'encre tremblé, cartouche « Les
// Parasols — manche 1 », rose des vents, échelle en mètres, tampon à la couleur
// du vainqueur.
//
// Géométrie : la caméra des résultats cadre l'ellipse de l'arène (a, b × 1,02),
// vue verticale, nord en haut, dans `resultsMapRect(aspect)` (camera/director.ts).
// À la verticale, l'échelle est uniforme : px/m = min(largeur / 2a', hauteur / 2b').
import { useMemo } from 'react'
import { t } from '../../../shared/i18n.ts'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { resultsMapRect } from '../../camera/director.ts'
import { gameView } from '../../view.ts'
import { rng, wobblySide } from '../components.tsx'
import { Glyph, glyphKeyForColor } from '../glyphs.tsx'
import { currentScale } from '../scale.ts'

/** Même marge que la caméra autour de l'ellipse (computeMapRig). */
const ELLIPSE_PAD = 1.02
/** Espace entre l'arène et le filet intérieur, largeur de la marge papier (px de conception). */
const GAP = 22
const MARGIN = 26
/** Panneau des résultats (RoundResults) : 820 px de conception à 4 % du bord droit ; la planche s'arrête avant. */
const PANEL_W = 820
const PANEL_GAP = 18
/** Longueurs d'échelle possibles (m) : on garde celle qui fait 90-200 px. */
const SCALE_STEPS = [20, 25, 50, 100]

export interface MapPlateProps {
  mapName: string
  round: number
  /** Couleur du vainqueur (index PLAYER_COLORS) ; null = égalité. */
  winnerColor: number | null
  /** Le tampon tombe avec l'annonce du vainqueur. */
  stamped: boolean
}

export function MapPlate({ mapName, round, winnerColor, stamped }: MapPlateProps) {
  const { width: W, height: H } = currentScale
  const geo = useMemo(() => {
    const arena = gameView.sim?.arena ?? RULES.arenaPresets[3]!
    const r = resultsMapRect(W / H)
    const rx0 = r.x0 * W
    const rx1 = r.x1 * W
    const ry0 = r.y0 * H
    const ry1 = r.y1 * H
    const a = arena.a * ELLIPSE_PAD
    const b = arena.b * ELLIPSE_PAD
    const k = Math.min((rx1 - rx0) / (2 * a), (ry1 - ry0) / (2 * b))
    const cx = (rx0 + rx1) / 2
    const cy = (ry0 + ry1) / 2
    // boîte de l'arène à l'écran, puis filet intérieur et bord extérieur de la planche (dans l'écran)
    const ix0 = Math.max(8 + MARGIN, cx - a * k - GAP)
    const ix1 = Math.min(W * 0.96 - PANEL_W - PANEL_GAP - MARGIN, cx + a * k + GAP)
    const iy0 = Math.max(8 + MARGIN, cy - b * k - GAP)
    const iy1 = Math.min(H - 8 - MARGIN, cy + b * k + GAP)
    const ox0 = ix0 - MARGIN
    const ox1 = ix1 + MARGIN
    const oy0 = iy0 - MARGIN
    const oy1 = iy1 + MARGIN
    const meters = SCALE_STEPS.find(m => m * k >= 90) ?? SCALE_STEPS[SCALE_STEPS.length - 1]!
    const rnd = rng(round * 131 + 17)
    const border = [wobblySide(ox0, oy0, ox1, oy0, rnd, 1.1), wobblySide(ox1, oy0, ox1, oy1, rnd, 1.1), wobblySide(ox1, oy1, ox0, oy1, rnd, 1.1), wobblySide(ox0, oy1, ox0, oy0, rnd, 1.1)]
    return { ix0, ix1, iy0, iy1, ox0, ox1, oy0, oy1, k, meters, border }
  }, [W, H, round])

  const { ix0, ix1, iy0, iy1, ox0, ox1, oy0, oy1, k, meters, border } = geo
  const band = `M${ox0} ${oy0}H${ox1}V${oy1}H${ox0}Z M${ix0} ${iy0}V${iy1}H${ix1}V${iy0}Z`
  const barPx = meters * k
  const c = winnerColor !== null ? PLAYER_COLORS[winnerColor] : undefined
  return (
    <div className="map-plate" aria-hidden>
      <svg className="map-plate__svg" width={W} height={H} viewBox={`0 0 ${W} ${H}`}>
        {/* marge papier (évidée sur la carte) et son ombre portée */}
        <path d={band} transform="translate(7 7)" fill="var(--drop)" fillRule="evenodd" />
        <path d={band} fill="var(--paper)" fillRule="evenodd" />
        {/* filet intérieur double, comme une gravure */}
        <rect x={ix0} y={iy0} width={ix1 - ix0} height={iy1 - iy0} fill="none" stroke="var(--ink)" strokeWidth={2} />
        <rect x={ix0 - 6} y={iy0 - 6} width={ix1 - ix0 + 12} height={iy1 - iy0 + 12} fill="none" stroke="var(--ink)" strokeWidth={0.8} opacity={0.6} />
        {/* cadre d'encre tremblé */}
        {border.map((d, i) => (
          <path key={i} d={d} fill="none" stroke="var(--ink)" strokeWidth={3} strokeLinecap="round" />
        ))}
        {/* graduations de la marge (tous les 10 m) */}
        <Ticks x0={ix0} x1={ix1} y0={iy0} y1={iy1} step={10 * k} />
        {/* échelle en mètres, en bas à droite de la marge */}
        <g transform={`translate(${ix1 - barPx - 10} ${oy1 - 11})`}>
          <rect x={0} y={-5} width={barPx / 2} height={6} fill="var(--ink)" />
          <rect x={barPx / 2} y={-5} width={barPx / 2} height={6} fill="var(--paper)" stroke="var(--ink)" strokeWidth={1.5} />
          <rect x={0} y={-5} width={barPx} height={6} fill="none" stroke="var(--ink)" strokeWidth={1.5} />
        </g>
        {/* rose des vents, coin haut droit */}
        <Compass x={ix1 - 46} y={iy0 + 50} />
      </svg>
      <span className="map-plate__scale t-num" style={{ left: ix1 - 10, top: oy1 - 34 }}>
        {t('host.plate.meters', { n: meters })}
      </span>
      <span className="map-plate__north t-title" style={{ left: ix1 - 46, top: iy0 + 2 }}>
        {t('host.plate.north')}
      </span>
      {/* cartouche de la planche */}
      <div className="map-plate__cartouche" style={{ left: ix0 + 18, top: oy1 - 20 }}>
        <span className="map-plate__map t-title">{mapName}</span>
        <span className="map-plate__round">{t('host.plate.round', { n: round })}</span>
      </div>
      {/* tampon du vainqueur */}
      {stamped ? (
      <div className={c ? 'map-plate__stamp' : 'map-plate__stamp is-tie'} style={{ left: Math.max(10, ox0 - 30), top: Math.max(10, oy0 - 34), color: c?.text ?? c?.hex }}>
        <svg width={112} height={112} viewBox="-56 -56 112 112">
          {/* tampon posé sur le coin de la planche : papier dessous, lisible sur la carte de nuit */}
          <circle r={52} fill="var(--paper)" opacity={0.94} />
          <circle r={50} fill="none" stroke="currentColor" strokeWidth={5} />
          <circle r={41} fill="none" stroke="currentColor" strokeWidth={2} strokeDasharray="3 4" />
          <path id="plate-arc" d="M-33 0A33 33 0 0 1 33 0" fill="none" />
          <text className="map-plate__stamp-text" fill="currentColor" fontSize={13} letterSpacing={2}>
            <textPath href="#plate-arc" startOffset="50%" textAnchor="middle">
              {t(c ? 'host.plate.winner' : 'host.plate.tie')}
            </textPath>
          </text>
        </svg>
        {winnerColor !== null ? (
          <span className="map-plate__stamp-glyph">
            <Glyph glyph={glyphKeyForColor(winnerColor)} size={34} />
          </span>
        ) : null}
      </div>
      ) : null}
    </div>
  )
}

/** Graduations d'imprimeur sur le filet intérieur. */
function Ticks({ x0, x1, y0, y1, step }: { x0: number; x1: number; y0: number; y1: number; step: number }) {
  if (step < 6) return null
  const d: string[] = []
  for (let x = x0 + step, i = 1; x < x1 - 2; x += step, i++) {
    const l = i % 5 === 0 ? 9 : 5
    d.push(`M${x.toFixed(1)} ${y0}v${-l}M${x.toFixed(1)} ${y1}v${l}`)
  }
  for (let y = y0 + step, i = 1; y < y1 - 2; y += step, i++) {
    const l = i % 5 === 0 ? 9 : 5
    d.push(`M${x0} ${y.toFixed(1)}h${-l}M${x1} ${y.toFixed(1)}h${l}`)
  }
  return <path d={d.join('')} stroke="var(--ink)" strokeWidth={1.2} opacity={0.7} />
}

/** Rose des vents à huit branches, nord en haut (la carte des résultats est orientée nord en haut). */
function Compass({ x, y }: { x: number; y: number }) {
  const long = 30
  const short = 15
  const pts = (ang: number, len: number, w: number) => {
    const s = Math.sin(ang)
    const co = Math.cos(ang)
    return `M0 0L${(-w * co).toFixed(1)} ${(-w * s).toFixed(1)}L${(len * s).toFixed(1)} ${(-len * co).toFixed(1)}Z`
  }
  return (
    <g transform={`translate(${x} ${y})`} stroke="var(--ink)" strokeWidth={1.4} strokeLinejoin="round">
      <circle r={22} fill="none" strokeWidth={1.2} opacity={0.7} />
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <path d={pts((i * Math.PI) / 2 + Math.PI / 4, short, 4)} fill="var(--paper)" />
          <path d={pts((i * Math.PI) / 2 + Math.PI / 4, short, -4)} fill="var(--ink)" />
        </g>
      ))}
      {[0, 1, 2, 3].map(i => (
        <g key={i}>
          <path d={pts((i * Math.PI) / 2, long, 6)} fill="var(--paper)" />
          <path d={pts((i * Math.PI) / 2, long, -6)} fill={i === 0 ? 'var(--ink)' : 'var(--ink-60)'} />
        </g>
      ))}
    </g>
  )
}
