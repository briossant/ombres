// Éléments ancrés au monde : étiquettes de nom sous les oiseaux, jetons du
// mode daltonien, bulles d'indication, flèches hors champ, « +x % ».
// Les positions (hudAnchors, px CSS du viewport) sont écrites par le runner à
// chaque frame ; on les applique ici dans une boucle rAF, sans re-rendu React.
import { useEffect, useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { useSettings } from '../../settings.ts'
import { fmtPct, slotDisplayName } from '../format.ts'
import { Glyph, glyphKeyForColor, Token } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { currentScale } from '../scale.ts'
import { hudAnchors, useHud, useRoster, type HintVM, type SlotVM } from '../viewModel.ts'

/** Marge des flèches hors champ : 3 % du cadre (ART_BIBLE §8.4). */
const EDGE_FRAC = 0.03
/** Un oiseau est « hors champ » quand son ancre sort du cadre moins cette marge (px de conception). */
const OFF_MARGIN = 24

export function WorldLayer() {
  const slots = useRoster(s => s.slots)
  const hints = useHud(s => s.hints)
  const cb = useSettings(s => s.colorblind)
  const crown = useHud(s => s.crownSlot)
  const els = useRef<(HTMLDivElement | null)[]>([])

  useEffect(() => {
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      const { s, width, height } = currentScale
      const now = performance.now()
      const tagsUntil = useHud.getState().tagsUntil
      const hintSlots = useHud.getState().hints
      for (let slot = 0; slot < 12; slot++) {
        const el = els.current[slot]
        if (!el) continue
        const a = hudAnchors.birds[slot]
        if (!a.active) {
          if (el.dataset.mode !== 'none') el.dataset.mode = 'none'
          continue
        }
        const x = a.x / s
        const y = a.y / s
        const off = a.behind || x < -OFF_MARGIN || y < -OFF_MARGIN || x > width + OFF_MARGIN || y > height + OFF_MARGIN
        if (off) {
          // Flèche collée au bord, orientée vers l'oiseau (depuis le centre du cadre).
          const cx = width / 2
          const cy = height / 2
          let dx = x - cx
          let dy = y - cy
          if (a.behind) {
            dx = -dx
            dy = -dy
          }
          const mx = width * (0.5 - EDGE_FRAC) - 30
          const my = height * (0.5 - EDGE_FRAC) - 30
          const k = Math.min(mx / Math.max(1e-3, Math.abs(dx)), my / Math.max(1e-3, Math.abs(dy)))
          const ax = cx + dx * k
          const ay = cy + dy * k
          const ang = Math.atan2(dy, dx)
          el.dataset.mode = 'arrow'
          el.style.transform = `translate(${ax.toFixed(1)}px, ${ay.toFixed(1)}px)`
          el.style.setProperty('--ang', `${ang.toFixed(3)}rad`)
        } else {
          el.dataset.mode = 'tag'
          el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`
          const shown = now < tagsUntil[slot] || hintSlots.some(h => h.slot === slot)
          el.classList.toggle('is-shown', shown)
          el.classList.toggle('is-hidden-bird', a.hidden)
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className={cb ? 'world world--cb' : 'world'} aria-hidden>
      {slots.map(s => (
        <div key={s.slot} className="anchor" data-mode="none" ref={el => void (els.current[s.slot] = el)}>
          <NameTag s={s} crown={crown === s.slot} />
          <span className="anchor__token">
            <Token colorIndex={s.colorIndex} size={26} variant="paper" />
          </span>
          <OffArrow colorIndex={s.colorIndex} />
          {hints.filter(h => h.slot === s.slot).map(h => (
            <HintBubble key={h.id} h={h} colorIndex={s.colorIndex} />
          ))}
        </div>
      ))}
      <Gains />
    </div>
  )
}

function NameTag({ s, crown }: { s: SlotVM; crown: boolean }) {
  return (
    <span className="tag">
      <Token colorIndex={s.colorIndex} size={24} />
      <span className="tag__name">{slotDisplayName(s)}</span>
      {s.assist ? <Icon name="feather" size={20} /> : null}
      {crown ? <Icon name="crown" size={20} className="tag__crown" /> : null}
    </span>
  )
}

function OffArrow({ colorIndex }: { colorIndex: number }) {
  const c = PLAYER_COLORS[colorIndex]
  return (
    <span className="offarrow">
      <svg width={60} height={60} viewBox="-30 -30 60 60">
        <g className="offarrow__rot">
          <path d="M27 0L4 -14.4A15.2 15.2 0 1 0 4 14.4Z" fill={c?.hex} stroke="var(--ink)" strokeWidth={3} strokeLinejoin="round" />
        </g>
      </svg>
      {/* Glyphe « en papier » dans la pointe ; à l'encre sur les couleurs claires. */}
      <span className="offarrow__glyph" style={{ color: (c?.oklch[0] ?? 1) < 0.7 ? 'var(--paper)' : 'var(--ink)' }}>
        <Glyph glyph={glyphKeyForColor(colorIndex)} size={20} />
      </span>
    </span>
  )
}

function HintBubble({ h, colorIndex }: { h: HintVM; colorIndex: number }) {
  const c = PLAYER_COLORS[colorIndex]
  return (
    <span className="hint enter" style={{ borderColor: c?.hex }}>
      <span className="hint__text">{t(h.key, h.params)}</span>
      <svg className="hint__tail" width={34} height={22} viewBox="0 0 34 22" aria-hidden>
        <path d="M2 0L17 19L32 0" fill="var(--paper)" stroke={c?.hex} strokeWidth={4} strokeLinejoin="round" />
        <path d="M4 -2H30" stroke="var(--paper)" strokeWidth={5} />
      </svg>
    </span>
  )
}

function Gains() {
  const gains = useHud(s => s.gains)
  const slots = useRoster(s => s.slots)
  const { s } = currentScale
  return (
    <>
      {gains.map(g => {
        const colorIndex = slots.find(x => x.slot === g.slot)?.colorIndex ?? g.slot
        return (
          <span key={g.id} className="gain t-num" style={{ left: g.x / s, top: g.y / s, color: PLAYER_COLORS[colorIndex]?.text }}>
            +{fmtPct(g.frac, 1)}
          </span>
        )
      })}
    </>
  )
}
