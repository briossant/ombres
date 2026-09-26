// Bande de sable (GDD §13.3, ART_BIBLE §8.5) : barre empilée triée par rang
// (meneur à gauche, couronne au-dessus), puis le sable neutre. Pourcentage
// (Averia) et glyphe dans les segments assez larges ; animation de 300 ms ;
// flash du segment d'un gros voleur. Au-delà de 8 oiseaux, le % des humains dont
// le segment est trop étroit passe dans une étiquette sous la bande.
import { useMemo } from 'react'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { useSettings } from '../../settings.ts'
import { fmtPct } from '../format.ts'
import { Glyph, Token, glyphKeyForColor } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { useHud, useRoster } from '../viewModel.ts'

/** Seuils de place (px de conception) pour écrire le %, le glyphe, ou les deux. */
const LABEL_MIN_PX = 84
const LABEL_GLYPH_MIN_PX = 112
const GLYPH_MIN_PX = 26
/** Au-delà de ce nombre d'oiseaux, le % des humains passe dans une étiquette sous leur segment. */
const PCT_TAGS_ABOVE = 8
/** Largeur réservée à une étiquette de % sous la bande (jeton + « 12,3 % »). */
const PCT_TAG_W = 104

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
  const labelMin = colorblind ? LABEL_GLYPH_MIN_PX : LABEL_MIN_PX
  const hasLabel = (frac: number) => frac >= RULES.hudSegmentLabelMinFrac && frac * inner >= labelMin

  // À 9-12 oiseaux, les segments des humains sont souvent trop étroits pour leur % :
  // étiquette sous le segment, écartées de gauche à droite pour ne pas se toucher.
  const pctTags = useMemo(() => {
    if (shares.length <= PCT_TAGS_ABOVE) return []
    const humans = new Set(slots.filter(s => s.kind !== 'bot' || s.substitute).map(s => s.slot))
    const out: { slot: number; colorIndex: number; frac: number; x: number; row: number }[] = []
    let acc = 0
    for (const s of segs) {
      const px = s.frac * inner
      if (humans.has(s.slot) && !hasLabel(s.frac)) out.push({ slot: s.slot, colorIndex: s.colorIndex, frac: s.frac, x: 2 + acc + px / 2, row: 0 })
      acc += px
    }
    // Deux rangées au besoin (12 humains aux segments étroits) : chaque étiquette prend la rangée
    // où elle se décale le moins ; puis on ramène dans la largeur de la bande, de droite à gauche.
    const rows = out.length * PCT_TAG_W > width ? 2 : 1
    const last = [-Infinity, -Infinity]
    for (const o of out) {
      let best = 0
      let bestX = Infinity
      for (let r = 0; r < rows; r++) {
        const x = Math.max(o.x, last[r]! + PCT_TAG_W, PCT_TAG_W / 2)
        if (x < bestX) {
          bestX = x
          best = r
        }
      }
      o.x = bestX
      o.row = best
      last[best] = bestX
    }
    for (let r = 0; r < rows; r++) {
      let next = width - PCT_TAG_W / 2
      for (let i = out.length - 1; i >= 0; i--) {
        const o = out[i]!
        if (o.row !== r) continue
        o.x = Math.max(PCT_TAG_W / 2, Math.min(o.x, next))
        next = o.x - PCT_TAG_W
      }
    }
    return out
    // hasLabel ne dépend que de inner et labelMin
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segs, slots, shares.length, inner, labelMin, width])

  return (
    <div className="sandbar" style={{ width }}>
      {leader && leaderIsCrowned ? (
        <div className="sandbar__crown" style={{ width: Math.max(44, leader.frac * inner) }}>
          <span className="sandbar__crown-badge">
            <Icon name="crown" size={30} stroke={2} />
            <Token colorIndex={leader.colorIndex} size={24} />
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
          const showLabel = hasLabel(s.frac)
          const showGlyph = px >= GLYPH_MIN_PX && (!showLabel || px >= LABEL_GLYPH_MIN_PX)
          return (
            <div
              key={s.slot}
              className={dark ? 'sandbar__seg is-dark' : 'sandbar__seg'}
              style={{ width: px, background: c?.hex, transitionDuration: `${RULES.hudBarAnimMs}ms` }}
            >
              {flashing ? <span key={flash.id} className={reduceFlashes ? 'sandbar__flash is-soft' : 'sandbar__flash'} /> : null}
              {/* glyphe en pastille : nu, la croix de Corail se lisait « + 33 % » (un gain) */}
              {showGlyph ? (
                <span className="sandbar__chip">
                  <Glyph glyph={glyphKeyForColor(s.colorIndex)} size={15} />
                </span>
              ) : null}
              {showLabel ? <span className="sandbar__pct t-num">{fmtPct(s.frac, 1)}</span> : null}
            </div>
          )
        })}
        <div className="sandbar__neutral" />
      </div>
      {pctTags.map(p => (
        <span key={p.slot} className="sandbar__pct-tag" style={{ left: p.x, top: `calc(100% + ${5 + p.row * 34}px)` }}>
          <Token colorIndex={p.colorIndex} size={20} />
          <span className="t-num">{fmtPct(p.frac, 1)}</span>
        </span>
      ))}
    </div>
  )
}
