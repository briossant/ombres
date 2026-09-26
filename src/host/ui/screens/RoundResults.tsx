// Résultats de manche (GDD §11.3) : la carte « illuminée » reste visible à
// gauche (la caméra de phase 3 la cadre dans les 2/3 gauches). À droite, une
// case : décompte des parts (3 s), vainqueur, soleils qui volent vers les
// noms, un fait marquant, puis la manche suivante.
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { t } from '../../../shared/i18n.ts'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { Btn, HandFrame, Key, SandTimer } from '../components.tsx'
import { fmtNum, fmtPct, ordinal, slotDisplayName } from '../format.ts'
import { Token } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { useNavScope } from '../nav.ts'
import { currentScale } from '../scale.ts'
import { uiActions, useRoster, useRoundResults, type RoundFactVM, type SlotVM } from '../viewModel.ts'
import { withColor } from '../hud/Announce.tsx'
import './results.css'

/** Durée du décompte des parts (GDD §11.3 : 3 s). */
const COUNT_MS = 3000
const REVEAL_MS = COUNT_MS + 250
const SUNS_START_MS = REVEAL_MS + 500
const SUN_STAGGER_MS = 240
const SUN_FLIGHT_MS = 720
/** Durée pleine du sablier : l'entracte dure au plus RULES.interludeMaxSeconds. */
const AUTO_TOTAL_S = RULES.interludeMaxSeconds

const easeOut = (x: number) => 1 - Math.pow(1 - x, 3)

function useElapsed(running: boolean): number {
  const [ms, setMs] = useState(0)
  useEffect(() => {
    if (!running) return
    const t0 = performance.now()
    let raf = 0
    const tick = () => {
      const e = performance.now() - t0
      setMs(e)
      if (e < SUNS_START_MS + 12 * SUN_STAGGER_MS + SUN_FLIGHT_MS + 200) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [running])
  return ms
}

export function RoundResults() {
  const ref = useRef<HTMLDivElement>(null)
  const r = useRoundResults()
  const slots = useRoster(s => s.slots)
  const bySlot = new Map(slots.map(s => [s.slot, s]))
  const elapsed = useElapsed(true)
  const k = easeOut(Math.min(1, elapsed / COUNT_MS))
  const revealed = elapsed >= REVEAL_MS
  const last = r.nextMapId === null
  useNavScope(ref, { onStart: () => uiActions.continueResults() })

  const winners = r.rows.filter(x => x.rank === 1)
  const maxShare = Math.max(0.0001, ...r.rows.map(x => x.share))
  const dense = r.rows.length > 7

  // ─── Soleils qui volent vers les noms ───
  const panelRef = useRef<HTMLDivElement>(null)
  const sunRef = useRef<HTMLSpanElement>(null)
  const totalRefs = useRef<(HTMLSpanElement | null)[]>([])
  const [flights, setFlights] = useState<{ id: number; x0: number; y0: number; x1: number; y1: number; delay: number }[]>([])
  useLayoutEffect(() => {
    const timer = setTimeout(() => {
      const panel = panelRef.current?.getBoundingClientRect()
      const src = sunRef.current?.getBoundingClientRect()
      if (!panel || !src) return
      const s = currentScale.s
      const list: typeof flights = []
      r.rows.forEach((row, i) => {
        const dst = totalRefs.current[i]?.getBoundingClientRect()
        if (!dst || row.suns <= 0) return
        const n = Math.min(4, row.suns)
        for (let j = 0; j < n; j++)
          list.push({
            id: i * 10 + j,
            x0: (src.left + src.width / 2 - panel.left) / s,
            y0: (src.top + src.height / 2 - panel.top) / s,
            x1: (dst.left + dst.width / 2 - panel.left) / s,
            y1: (dst.top + dst.height / 2 - panel.top) / s,
            delay: (r.rows.length - 1 - i) * SUN_STAGGER_MS + j * 70,
          })
      })
      setFlights(list)
    }, SUNS_START_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r.rows])

  const sunsArrived = (i: number) => elapsed >= SUNS_START_MS + (r.rows.length - 1 - i) * SUN_STAGGER_MS + SUN_FLIGHT_MS

  return (
    <div className="screen round" ref={ref}>
      <HandFrame className={dense ? 'round__panel round__panel--dense enter' : 'round__panel enter'} seed={21}>
        <div className="round__inner" ref={panelRef}>
          <header className="round__head">
            <h1 className="round__title t-title">{t('host.round.title', { n: r.round })}</h1>
            <span className="round__of">{t('host.round.of', { total: r.rounds })}</span>
            <span className="round__map">{t(`host.map.${r.mapId}`)}</span>
            {r.double ? <span className="round__double">×2 · {t('host.round.double')}</span> : null}
          </header>

          <div className={revealed ? 'round__winner is-on' : 'round__winner'}>
            {r.tie ? (
              <p className="round__tie">
                <span className="round__tokens">
                  {winners.map(w => (
                    <Token key={w.slot} colorIndex={bySlot.get(w.slot)?.colorIndex ?? w.slot} size={46} />
                  ))}
                </span>
                {t('host.round.tie')}
              </p>
            ) : winners[0] ? (
              <>
                <span className="round__winner-pre">{t('host.round.winner')}</span>
                <span className="round__winner-name">
                  <Token colorIndex={bySlot.get(winners[0].slot)?.colorIndex ?? 0} size={58} />
                  <span className="t-title">{slotDisplayName(bySlot.get(winners[0].slot))}</span>
                </span>
              </>
            ) : null}
          </div>

          <div className="round__table">
            <div className="round__thead">
              <span />
              <span />
              <span className="round__th-suns">
                <span className="round__sun-src" ref={sunRef}>
                  <Icon name="sun" size={34} stroke={2} />
                </span>
                {t('host.round.suns')}
              </span>
            </div>
            {r.rows.map((row, i) => {
              const s = bySlot.get(row.slot)
              const arrived = sunsArrived(i)
              return (
                <div key={row.slot} className={row.rank === 1 && revealed ? 'rrow is-first' : 'rrow'} style={{ ['--i' as string]: i }}>
                  <span className="rrow__rank t-num">{ordinal(row.rank)}</span>
                  <span className="rrow__who">
                    <Token colorIndex={s?.colorIndex ?? row.slot} size={dense ? 32 : 40} />
                    <span className="rrow__name">{slotDisplayName(s)}</span>
                    <span className="rrow__bar">
                      <span className="rrow__fill" style={{ width: `${(row.share / maxShare) * 100 * k}%`, background: PLAYER_COLORS[s?.colorIndex ?? 0]?.hex }} />
                    </span>
                    <span className="rrow__pct t-num">{fmtPct(row.share * k, 1)}</span>
                  </span>
                  <span className="rrow__suns">
                    <span className={arrived && row.suns > 0 ? 'rrow__gain t-num is-on' : 'rrow__gain t-num'}>+{row.suns}</span>
                    <span className="rrow__total t-num" ref={el => void (totalRefs.current[i] = el)}>
                      {arrived ? row.totalSuns : row.totalSuns - row.suns}
                    </span>
                  </span>
                </div>
              )
            })}
          </div>

          {r.fact ? <Fact fact={r.fact} s={bySlot.get(r.fact.slot)} show={revealed} /> : null}

          <footer className="round__foot">
            <div className="round__next">
              <span>{last ? t('host.round.toMatch') : t(r.round + 1 === r.rounds ? 'host.round.nextLast' : 'host.round.next', { map: t(`host.map.${r.nextMapId}`) })}</span>
              <span className="round__ready">
                {r.humanCount > 0 ? t('host.round.ready', { n: r.readyCount, total: r.humanCount }) : null}
              </span>
            </div>
            <SandTimer deadline={r.deadline} total={AUTO_TOTAL_S} />
            <Btn icon="arrowRight" isDefault onClick={() => uiActions.continueResults()} hint={<Key>{t('host.key.enter')}</Key>} className="round__continue">
              {t('host.round.continue')}
            </Btn>
          </footer>
        </div>
        {flights.map(f => (
          <FlyingSun key={f.id} {...f} />
        ))}
      </HandFrame>
    </div>
  )
}

function Fact({ fact, s, show }: { fact: RoundFactVM; s: SlotVM | undefined; show: boolean }) {
  const value = fact.kind === 'hunter' || fact.kind === 'dodger' ? fmtNum(fact.value) : fmtPct(fact.value, 1)
  const text = t(`host.fact.${fact.kind}`, { name: '{color}', value })
  return <p className={show ? 'round__fact recitatif wipe' : 'round__fact recitatif is-off'}>{withColor(text, s ? s.colorIndex : null, slotDisplayName(s))}</p>
}

function FlyingSun({ x0, y0, x1, y1, delay }: { x0: number; y0: number; x1: number; y1: number; delay: number }) {
  const ref = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const mx = (x0 + x1) / 2 - 90
    const my = Math.min(y0, y1) - 60
    const anim = el.animate(
      [
        { transform: `translate(${x0}px, ${y0}px) scale(0.6)`, opacity: 0 },
        { transform: `translate(${mx}px, ${my}px) scale(1.25)`, opacity: 1, offset: 0.45 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 1, offset: 0.95 },
        { transform: `translate(${x1}px, ${y1}px) scale(0.7)`, opacity: 0 },
      ],
      { duration: SUN_FLIGHT_MS, delay, easing: 'cubic-bezier(.45,.05,.4,1)', fill: 'both' },
    )
    return () => anim.cancel()
  }, [x0, y0, x1, y1, delay])
  return (
    <span className="flying-sun" ref={ref} aria-hidden>
      <Icon name="sun" size={30} stroke={2} />
    </span>
  )
}
