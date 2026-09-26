// Éléments ancrés au monde : étiquettes de nom sous les oiseaux, jetons (mode
// daltonien, humains au-delà de 6 oiseaux), bulles d'indication, flèches hors
// champ, « +x % », et au salon le mannequin (anneau-cible + étiquette).
//
// Les positions (hudAnchors, px CSS du viewport) sont écrites par le runner à
// chaque frame ; on les applique ici dans une boucle rAF, sans re-rendu React.
//
// Passe d'évitement (à chaque frame, lectures DOM d'abord, écritures ensuite) :
// - rectangles d'exclusion lus du DOM (cadran, bande de sable et onglet de
//   couronne, bannière, récitatif, compte à rebours, toasts ; au salon, les cases) ;
// - bulles (≤ 2, voir viewModel.showHint) triées en y : au-dessus de l'oiseau,
//   sinon dessous (pointe vers le haut), sinon décalées ; masquées si rien ne tient ;
// - étiquettes : masquées si une bulle les couvre, décalées vers le bas (avec un
//   trait de rappel vers l'oiseau) quand elles se touchent, masquées au-delà.
//
// Les traits de rappel vivent dans leur propre couche (.world__leads), avant toutes
// les ancres : chaque .anchor est un contexte d'empilement (transform), donc un trait
// rangé dans son ancre passait sur l'étiquette d'une ancre précédente, quel que soit
// le z-index. Le trait reprend la chaîne de transform de son ancre (aucune allocation
// de plus) ; classe et longueur ne sont écrites que quand elles changent.
import { useEffect, useRef, type CSSProperties, type Ref } from 'react'
import { t } from '../../../shared/i18n.ts'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { useSettings } from '../../settings.ts'
import { fmtPct, slotDisplayName } from '../format.ts'
import { Glyph, glyphKeyForColor, Token } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { currentScale } from '../scale.ts'
import { hudAnchors, useHud, useRoster, type HintVM, type SlotVM } from '../viewModel.ts'

/** Marge des flèches hors champ et des bulles : 3 % du cadre (ART_BIBLE §8.4). */
const EDGE_FRAC = 0.03
/** Un oiseau est « hors champ » quand son ancre sort du cadre moins cette marge (px de conception). */
const OFF_MARGIN = 24
/** Bulle au-dessus : distance de l'ancre (sous l'oiseau) au bas de la bulle. */
const BUBBLE_ABOVE = 96
/** Bulle au-dessous : distance de l'ancre au haut de la bulle (la pointe remonte à l'ancre). */
const BUBBLE_BELOW = 24
/** Hauteur de la pointe de bulle. */
const TAIL = 21
/** Étiquette : haut sous l'ancre, pas de décalage vertical, nombre de crans. */
const TAG_TOP = 6
const TAG_STEP = 38
const TAG_STEPS = 3
/** Frames pendant lesquelles un cran plus haut doit rester libre avant d'y remonter (évite le va-et-vient). */
const TAG_SETTLE_FRAMES = 12
/** Marge autour des rectangles d'exclusion. */
const EXCL_PAD = 8
/** Index du mannequin du salon dans les tableaux de la boucle (après les 12 slots). */
const DUMMY = 12
/** Étiquette du mannequin : sous son anneau-cible. */
const DUMMY_TAG_TOP = 32
/** Au-delà de ce nombre d'oiseaux, jeton permanent sous chaque humain (on ne se retrouve plus). */
const CROWDED_BIRDS = 6

const EXCLUDE_ROUND =
  '.dial, .dial__round, .dial__phase, .sandbar__track, .sandbar__crown-badge, .sandbar__pct-tag, .banner, .recitatif, .countdown__disc, .countdown__go, .last-seconds__disc, .toast'
const EXCLUDE_LOBBY = '.lobby .case, .lobby .start, .toast'

interface Rect {
  x0: number
  y0: number
  x1: number
  y1: number
}
const hit = (a: Rect, b: Rect) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const hitAny = (a: Rect, list: readonly Rect[]) => list.some(b => hit(a, b))

type Side = 'above' | 'below'

interface BubbleMem {
  side: Side
  w: number
  h: number
}

export function WorldLayer({ mode = 'round' }: { mode?: 'round' | 'lobby' }) {
  const slots = useRoster(s => s.slots)
  const hints = useHud(s => s.hints)
  const cb = useSettings(s => s.colorblind)
  const crown = useHud(s => s.crownSlot)
  const rootRef = useRef<HTMLDivElement>(null)
  const els = useRef<(HTMLDivElement | null)[]>([])
  const leadEls = useRef<(HTMLSpanElement | null)[]>([])
  const bubbleEls = useRef(new Map<number, HTMLDivElement>())
  const dummyRef = useRef<HTMLDivElement>(null)
  const slotsRef = useRef(slots)
  slotsRef.current = slots
  const lobby = mode === 'lobby'
  const crowded = !lobby && slots.length > CROWDED_BIRDS

  useEffect(() => {
    let raf = 0
    // Mémoire entre frames : tailles mesurées, décalage des étiquettes, côté des bulles.
    // index 0..11 : slots ; DUMMY : le mannequin du salon
    const tagW = new Array<number>(13).fill(0)
    const tagH = new Array<number>(13).fill(34)
    const tagDy = new Array<number>(13).fill(0)
    const tagSettle = new Array<number>(13).fill(0)
    const tagShown = new Array<boolean>(13).fill(false)
    // Ancre à laquelle tagDy se rapporte : une ancre remontée (slot retiré puis repris) repart à --tag-dy 0,
    // sinon étiquette et trait pourraient garder deux longueurs différentes.
    const tagNode = new Array<HTMLElement | null>(12).fill(null)
    const bubbles = new Map<number, BubbleMem>()

    const loop = () => {
      raf = requestAnimationFrame(loop)
      const root = rootRef.current
      if (!root) return
      const { s: scale, width, height } = currentScale
      const now = performance.now()
      const hud = useHud.getState()
      const roster = slotsRef.current

      // ── 1. Lectures DOM (avant toute écriture : une seule mise en page par frame)
      const rr = root.getBoundingClientRect()
      const k = rr.width > 0 ? rr.width / width : scale
      const excl: Rect[] = []
      for (const el of (root.closest('.ui-root') ?? document).querySelectorAll(lobby ? EXCLUDE_LOBBY : EXCLUDE_ROUND)) {
        const r = el.getBoundingClientRect()
        if (r.width <= 0 || r.height <= 0) continue
        excl.push({
          x0: (r.left - rr.left) / k - EXCL_PAD,
          y0: (r.top - rr.top) / k - EXCL_PAD,
          x1: (r.right - rr.left) / k + EXCL_PAD,
          y1: (r.bottom - rr.top) / k + EXCL_PAD,
        })
      }
      for (let i = 0; i <= DUMMY; i++) {
        if (!tagShown[i]) continue
        const tag = (i === DUMMY ? dummyRef.current : els.current[i])?.querySelector<HTMLElement>('.tag')
        if (tag && tag.offsetWidth > 0) {
          tagW[i] = tag.offsetWidth
          tagH[i] = tag.offsetHeight
        }
      }
      for (const [id, el] of bubbleEls.current) {
        const hint = el.firstElementChild as HTMLElement | null
        if (!hint || hint.offsetWidth <= 0) continue
        const m = bubbles.get(id)
        if (m) {
          m.w = hint.offsetWidth
          m.h = hint.offsetHeight
        } else bubbles.set(id, { side: 'above', w: hint.offsetWidth, h: hint.offsetHeight })
      }

      // ── 2. Ancres : dans le cadre (étiquette) ou hors champ (flèche)
      const onScreen = new Array<boolean>(12).fill(false)
      const ax = new Array<number>(12).fill(0)
      const ay = new Array<number>(12).fill(0)
      for (let slot = 0; slot < 12; slot++) {
        const a = hudAnchors.birds[slot]!
        if (!a.active) continue
        ax[slot] = a.x / scale
        ay[slot] = a.y / scale
        onScreen[slot] = !(a.behind || ax[slot] < -OFF_MARGIN || ay[slot] < -OFF_MARGIN || ax[slot] > width + OFF_MARGIN || ay[slot] > height + OFF_MARGIN)
      }

      // ── 3. Bulles, de haut en bas
      const mx = width * EDGE_FRAC
      const placed: Rect[] = []
      const bubbleOut = new Map<number, { side: Side | 'hidden'; dx: number; y: number; x: number; ay: number }>()
      const live = hud.hints.filter(h => bubbleEls.current.has(h.id)).sort((a, b) => ay[a.slot]! - ay[b.slot]!)
      for (const h of live) {
        const m = bubbles.get(h.id)
        // pas de bulle pendant « 3, 2, 1, Envol ! » : le tampon occupe le centre
        if (!m || !onScreen[h.slot] || !hudAnchors.birds[h.slot]!.active || hud.countdown !== null) {
          bubbleOut.set(h.id, { side: 'hidden', dx: 0, y: 0, x: 0, ay: 0 })
          continue
        }
        const x = ax[h.slot]!
        const y = ay[h.slot]!
        const half = m.w / 2
        const clampDx = (want: number) => {
          let dx = want
          if (x - half + dx < mx) dx = mx - (x - half)
          else if (x + half + dx > width - mx) dx = width - mx - (x + half)
          return Math.max(-half + 34, Math.min(half - 34, dx))
        }
        const rectOf = (side: Side, dx: number): Rect => {
          const x0 = x - half + dx
          return side === 'above'
            ? { x0, x1: x0 + m.w, y0: y - BUBBLE_ABOVE - m.h, y1: y - BUBBLE_ABOVE + TAIL }
            : { x0, x1: x0 + m.w, y0: y + BUBBLE_BELOW - TAIL, y1: y + BUBBLE_BELOW + m.h }
        }
        const other: Side = m.side === 'above' ? 'below' : 'above'
        const cands: [Side, number][] = [
          [m.side, 0],
          [other, 0],
          [m.side, -0.6],
          [m.side, 0.6],
          [other, -0.6],
          [other, 0.6],
        ]
        let best: { side: Side; dx: number; r: Rect } | null = null
        for (const [side, sh] of cands) {
          const dx = clampDx(sh * m.w)
          const r = rectOf(side, dx)
          if (r.y0 < 8 || r.y1 > height - 8) continue
          if (hitAny(r, excl) || hitAny(r, placed)) continue
          best = { side, dx, r }
          break
        }
        if (!best) {
          bubbleOut.set(h.id, { side: 'hidden', dx: 0, y: 0, x, ay: y })
          continue
        }
        m.side = best.side
        placed.push(best.r)
        bubbleOut.set(h.id, { side: best.side, dx: best.dx, y: best.side === 'above' ? -(BUBBLE_ABOVE + m.h) : BUBBLE_BELOW, x, ay: y })
      }

      // ── 4. Étiquettes : bulle d'abord, puis humains, puis bots ; chacun de haut en bas
      const human = new Array<boolean>(12).fill(false)
      const inRoster = new Array<boolean>(12).fill(false)
      const pulseLobby = new Array<boolean>(12).fill(false)
      for (const s of roster) {
        inRoster[s.slot] = true
        human[s.slot] = s.kind !== 'bot' || s.substitute
        pulseLobby[s.slot] = lobby && s.kind !== 'bot' && !s.substitute && s.connected && !s.goals.fly
      }
      // Mannequin du salon : l'oiseau actif qui n'est pas un joueur (index DUMMY dans les tableaux).
      let ds = -1
      if (lobby) for (let slot = 11; slot >= 0; slot--) if (hudAnchors.birds[slot]!.active && !inRoster[slot] && onScreen[slot]) ds = slot
      const bubbleSlot = new Set(live.map(h => h.slot))
      const want: number[] = []
      for (let slot = 0; slot < 12; slot++) {
        if (!inRoster[slot] || !onScreen[slot]) continue
        if (lobby || now < hud.tagsUntil[slot]! || bubbleSlot.has(slot) || now < hud.tagPulseUntil[slot]!) want.push(slot)
      }
      // ordre : porteurs de bulle, humains, mannequin, bots ; chacun de haut en bas
      const rank = (i: number) => (i === DUMMY ? 2 : bubbleSlot.has(i) ? 0 : human[i] ? 1 : 3)
      if (ds >= 0) want.push(DUMMY)
      const yOf = (i: number) => ay[i === DUMMY ? ds : i]!
      want.sort((a, b) => rank(a) - rank(b) || yOf(a) - yOf(b))
      const tagOut = new Array<number>(13).fill(-1) // décalage retenu, -1 = masquée
      const tagsPlaced: Rect[] = []
      for (const i of want) {
        const slot = i === DUMMY ? ds : i
        const w = tagW[i] || 40 + 11 * (i === DUMMY ? 9 : slotDisplayName(roster.find(s => s.slot === slot)).length)
        const h = tagH[i]!
        const x = ax[slot]!
        const y = ay[slot]!
        const top = i === DUMMY ? DUMMY_TAG_TOP : TAG_TOP
        const rectAt = (dy: number): Rect => ({ x0: x - w / 2, x1: x + w / 2, y0: y + top + dy, y1: y + top + dy + h })
        const free = (dy: number) => {
          const r = rectAt(dy)
          return r.y1 < height - 4 && !hitAny(r, excl) && !hitAny(r, placed) && !hitAny(r, tagsPlaced)
        }
        // bulle posée sur l'ancre : l'étiquette s'efface (la bulle porte le jeton)
        const anchorPt: Rect = { x0: x - 6, x1: x + 6, y0: y - 4, y1: y + TAG_TOP + 10 }
        if (hitAny(anchorPt, placed)) continue
        let lowest = -1
        for (let k = 0; k <= TAG_STEPS; k++) {
          if (free(k * TAG_STEP)) {
            lowest = k * TAG_STEP
            break
          }
        }
        if (lowest < 0) continue
        // Un cran plus haut s'est libéré : on n'y remonte que s'il le reste un moment.
        const prev = tagDy[i]!
        let dy = lowest
        if (tagShown[i] && lowest < prev && free(prev) && ++tagSettle[i]! < TAG_SETTLE_FRAMES) dy = prev
        else tagSettle[i] = 0
        tagOut[i] = dy
        tagsPlaced.push(rectAt(dy))
        // l'anneau du mannequin écarte aussi les étiquettes des bots
        if (i === DUMMY) tagsPlaced.push({ x0: x - 62, x1: x + 62, y0: y - 22, y1: y + 28 })
      }

      // ── 5. Écritures
      for (let slot = 0; slot < 12; slot++) {
        const el = els.current[slot]
        const lead = leadEls.current[slot]
        if (!el) {
          lead?.classList.toggle('is-on', false)
          continue
        }
        if (tagNode[slot] !== el) {
          tagNode[slot] = el
          tagDy[slot] = 0
        }
        const a = hudAnchors.birds[slot]!
        if (!a.active || !inRoster[slot]) {
          if (el.dataset.mode !== 'none') el.dataset.mode = 'none'
          tagShown[slot] = false
          lead?.classList.toggle('is-on', false)
          continue
        }
        if (!onScreen[slot]) {
          // Flèche collée au bord, orientée vers l'oiseau (depuis le centre du cadre).
          tagShown[slot] = false
          lead?.classList.toggle('is-on', false)
          if (lobby) {
            el.dataset.mode = 'none'
            continue
          }
          const cx = width / 2
          const cy = height / 2
          let dx = ax[slot]! - cx
          let dy = ay[slot]! - cy
          if (a.behind) {
            dx = -dx
            dy = -dy
          }
          const hx = width * (0.5 - EDGE_FRAC) - 30
          const hy = height * (0.5 - EDGE_FRAC) - 30
          const kk = Math.min(hx / Math.max(1e-3, Math.abs(dx)), hy / Math.max(1e-3, Math.abs(dy)))
          el.dataset.mode = 'arrow'
          el.style.transform = `translate(${(cx + dx * kk).toFixed(1)}px, ${(cy + dy * kk).toFixed(1)}px)`
          el.style.setProperty('--ang', `${Math.atan2(dy, dx).toFixed(3)}rad`)
          continue
        }
        el.dataset.mode = 'tag'
        const tr = `translate(${ax[slot]!.toFixed(1)}px, ${ay[slot]!.toFixed(1)}px)`
        el.style.transform = tr
        const dy = tagOut[slot]!
        const shown = dy >= 0
        if (shown && dy !== tagDy[slot]) {
          tagDy[slot] = dy
          const v = `${dy}px`
          el.style.setProperty('--tag-dy', v)
          lead?.style.setProperty('--tag-dy', v)
        }
        tagShown[slot] = shown
        el.classList.toggle('is-shown', shown)
        // Trait de rappel (couche sous les étiquettes) : suit l'ancre seulement quand il est visible.
        if (lead) {
          const on = shown && dy > 0
          if (on) lead.style.transform = tr
          lead.classList.toggle('is-on', on)
        }
        el.classList.toggle('is-hidden-bird', a.hidden)
        el.classList.toggle('is-pulse', shown && (pulseLobby[slot]! || now < hud.tagPulseUntil[slot]!))
        el.classList.toggle('is-human', human[slot]!)
      }
      for (const [id, el] of bubbleEls.current) {
        const o = bubbleOut.get(id)
        const m = bubbles.get(id)
        if (!m) {
          // pas encore mesurée : invisible, mais dans la mise en page
          el.dataset.side = 'measure'
          continue
        }
        if (!o || o.side === 'hidden') {
          el.dataset.side = 'hidden'
          continue
        }
        el.dataset.side = o.side
        el.style.transform = `translate(${o.x.toFixed(1)}px, ${o.ay.toFixed(1)}px)`
        el.style.setProperty('--hint-dx', `${o.dx.toFixed(0)}px`)
        el.style.setProperty('--hint-y', `${o.y.toFixed(0)}px`)
      }
      for (const id of bubbles.keys()) if (!bubbleEls.current.has(id)) bubbles.delete(id)

      const dummy = dummyRef.current
      if (dummy) {
        const dy = tagOut[DUMMY]!
        if (ds < 0) {
          dummy.dataset.mode = 'none'
          tagShown[DUMMY] = false
        } else {
          dummy.dataset.mode = 'tag'
          dummy.style.transform = `translate(${ax[ds]!.toFixed(1)}px, ${ay[ds]!.toFixed(1)}px)`
          const ring: Rect = { x0: ax[ds]! - 62, x1: ax[ds]! + 62, y0: ay[ds]! - 22, y1: ay[ds]! + 28 }
          dummy.classList.toggle('is-covered', hitAny(ring, excl))
          const shown = dy >= 0
          if (shown && dy !== tagDy[DUMMY]) {
            tagDy[DUMMY] = dy
            dummy.style.setProperty('--tag-dy', `${dy}px`)
          }
          tagShown[DUMMY] = shown
          dummy.classList.toggle('is-shown', shown)
        }
      }
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [lobby])

  const cls = ['world', cb ? 'world--cb' : '', crowded ? 'world--crowded' : '', lobby ? 'world--lobby' : ''].filter(Boolean).join(' ')
  return (
    <div className={cls} aria-hidden ref={rootRef}>
      {/* les traits de rappel d'abord, dans leur couche : SOUS toutes les étiquettes (et l'anneau du mannequin) */}
      <div className="world__leads">
        {slots.map(s => (
          <span key={s.slot} className="world__lead" ref={el => void (leadEls.current[s.slot] = el)} />
        ))}
      </div>
      {/* le mannequin ensuite : son anneau au sol passe SOUS les étiquettes des joueurs (il en masquait une) */}
      {lobby ? <DummyMark ref={dummyRef} /> : null}
      {slots.map(s => (
        <div key={s.slot} className="anchor" data-mode="none" ref={el => void (els.current[s.slot] = el)}>
          <NameTag s={s} crown={crown === s.slot} />
          <span className="anchor__token">
            <Token colorIndex={s.colorIndex} size={26} variant="paper" />
          </span>
          <span className="anchor__human">
            <Token colorIndex={s.colorIndex} size={18} />
          </span>
          <OffArrow colorIndex={s.colorIndex} />
        </div>
      ))}
      {hints.map(h => (
        <HintBubble
          key={h.id}
          h={h}
          slots={slots}
          ref={el => {
            if (el) bubbleEls.current.set(h.id, el)
            else bubbleEls.current.delete(h.id)
          }}
        />
      ))}
      {/* « +x % » : parts de l'arène d'une manche (au salon, l'arène n'est pas mesurée par hudFromSim) */}
      {lobby ? null : <Gains />}
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

/** Mannequin du salon : anneau-cible pointillé « au sol » sous l'oiseau et étiquette. */
function DummyMark({ ref }: { ref: Ref<HTMLDivElement> }) {
  return (
    <div className="anchor dummy" data-mode="none" ref={ref}>
      <svg className="dummy__ring" width={132} height={54} viewBox="-66 -27 132 54" aria-hidden>
        <ellipse rx={60} ry={21} fill="none" stroke="var(--paper)" strokeWidth={7} />
        <ellipse rx={60} ry={21} fill="none" stroke="var(--ink)" strokeWidth={3} strokeDasharray="9 7" strokeLinecap="round" />
        <ellipse rx={26} ry={9} fill="none" stroke="var(--paper)" strokeWidth={6} />
        <ellipse rx={26} ry={9} fill="none" stroke="var(--ink)" strokeWidth={2.5} />
      </svg>
      <span className="tag dummy__tag">
        <svg width={24} height={24} viewBox="0 0 24 24" aria-hidden>
          <circle cx={12} cy={12} r={9.5} fill="none" stroke="var(--ink)" strokeWidth={2} />
          <circle cx={12} cy={12} r={4.5} fill="none" stroke="var(--ink)" strokeWidth={2} />
          <circle cx={12} cy={12} r={1.2} fill="var(--ink)" />
        </svg>
        <span className="tag__name">{t('host.lobby.dummy')}</span>
      </span>
    </div>
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

/**
 * Bulle d'indication : bord et pointe à la couleur du joueur, jeton(s) des joueurs
 * concernés. Placée par la boucle (au-dessus ou au-dessous de l'oiseau).
 */
function HintBubble({ h, slots, ref }: { h: HintVM; slots: SlotVM[]; ref: Ref<HTMLDivElement> }) {
  const colorOf = (slot: number) => slots.find(s => s.slot === slot)?.colorIndex ?? slot
  const c = PLAYER_COLORS[colorOf(h.slot)]
  return (
    <div className="bubble" data-side="measure" ref={ref}>
      <span className="hint enter" style={{ borderColor: c?.hex } as CSSProperties}>
        <span className="hint__tokens">
          {h.slots.map(s => (
            <Token key={s} colorIndex={colorOf(s)} size={28} />
          ))}
        </span>
        <span className="hint__text">{t(h.key, h.params)}</span>
        <svg className="hint__tail" width={34} height={22} viewBox="0 0 34 22" aria-hidden>
          <path d="M2 0L17 19L32 0" fill="var(--paper)" stroke={c?.hex} strokeWidth={4} strokeLinejoin="round" />
          <path d="M4 -2H30" stroke="var(--paper)" strokeWidth={5} />
        </svg>
      </span>
    </div>
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
