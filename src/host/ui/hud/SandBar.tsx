// Bande de sable (GDD §13.3, ART_BIBLE §8.5) : barre empilée triée par rang
// (meneur à gauche, couronne au-dessus), puis le sable neutre. Pourcentage
// (Averia) et glyphe dans les segments assez larges ; animation de 300 ms ;
// flash du segment d'un gros voleur.
import { useMemo } from 'react'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { useSettings } from '../../settings.ts'
import { fmtPct } from '../format.ts'
import { Glyph, glyphKeyForColor } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { useHud, useRoster } from '../viewModel.ts'

/** Seuils de place (px de conception) pour écrire le %, le glyphe, ou les deux. */
const LABEL_MIN_PX = 84
const LABEL_GLYPH_MIN_PX = 112
const GLYPH_MIN_PX = 26

export function SandBar({ width }: { width: number }) {
  const shares = useHud(s => s.shares)
  const arena = useHud(s => s.arenaCells)
  const crown = useHud(s => s.crownSlot)
  const flash = useHud(s => s.flash)
  const slots = useRoster(s => s.slots)
  const reduceFlashes = useSettings(s => s.reduceFlashes)
  const colorblind = useSettings(s => s.colorblind)

  const segs = useMemo(() => {
    const colorOf = new Map(slots.map(s => [s.slot, s.colorIndex]))
    return shares
      .filter(s => s.cells > 0)
      .map(s => ({ slot: s.slot, frac: s.cells / arena, colorIndex: colorOf.get(s.slot) ?? s.slot }))
      .sort((a, b) => b.frac - a.frac || a.slot - b.slot)
  }, [shares, arena, slots])

  const inner = width - 4
  const leader = segs[0]
  const leaderIsCrowned = leader && leader.slot === crown

  return (
    <div className="sandbar" style={{ width }}>
      {leader && leaderIsCrowned ? (
        <div className="sandbar__crown" style={{ width: Math.max(44, leader.frac * inner) }}>
          <span className="sandbar__crown-badge">
            <Icon name="crown" size={30} stroke={2} />
            <Glyph glyph={glyphKeyForColor(leader.colorIndex)} size={20} />
          </span>
        </div>
      ) : null}
      <div className="sandbar__track case">
        {segs.map(s => {
          const px = s.frac * inner
          const c = PLAYER_COLORS[s.colorIndex]
          const dark = (c?.oklch[0] ?? 1) < 0.6
          const flashing = flash && flash.slot === s.slot
          // Glyphe + % si la place le permet ; sinon % seul (glyphe seul en mode
          // daltonien, où le glyphe identifie le joueur), sinon glyphe seul.
          const showLabel = s.frac >= RULES.hudSegmentLabelMinFrac && px >= (colorblind ? LABEL_GLYPH_MIN_PX : LABEL_MIN_PX)
          const showGlyph = px >= GLYPH_MIN_PX && (!showLabel || px >= LABEL_GLYPH_MIN_PX)
          return (
            <div
              key={s.slot}
              className={dark ? 'sandbar__seg is-dark' : 'sandbar__seg'}
              style={{ width: px, background: c?.hex, transitionDuration: `${RULES.hudBarAnimMs}ms` }}
            >
              {flashing ? <span key={flash.id} className={reduceFlashes ? 'sandbar__flash is-soft' : 'sandbar__flash'} /> : null}
              {showGlyph ? <Glyph glyph={glyphKeyForColor(s.colorIndex)} size={18} className="sandbar__glyph" /> : null}
              {showLabel ? <span className="sandbar__pct t-num">{fmtPct(s.frac, 1)}</span> : null}
            </div>
          )
        })}
        <div className="sandbar__neutral" />
      </div>
    </div>
  )
}
