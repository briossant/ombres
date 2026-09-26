// Résultats de partie (GDD §11.4-11.5) : champion, podium (plaques sous les
// oiseaux perchés sur les tours 3D, au centre), titres de chacun avec leur
// chiffre, stats par joueur, revanche (votes des téléphones) et salon.
import { useLayoutEffect, useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { RULES } from '../../../sim/rules.ts'
import { Btn, Case, Key, SandTimer, SlotName } from '../components.tsx'
import { fmtPct, ordinal, titleStat } from '../format.ts'
import { Token } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions, useMatchResults, useRoster, type MatchRowVM, type SlotVM } from '../viewModel.ts'
import './results.css'

/** Positions horizontales des plaques du podium (fraction de l'écran) : 2e, 1er, 3e. */
export const PODIUM_X: readonly [number, number, number] = [0.3, 0.5, 0.7]
/** Décalage vertical des plaques (px) : la plus haute tour porte le champion. */
const PODIUM_DY = [40, 0, 70]
/** Plan pur avant l'entrée de l'UI (en accord avec la caméra du podium, S5) = --intro-ms de results.css. */
const PODIUM_INTRO_MS = 2500

export function MatchResults() {
  const ref = useRef<HTMLDivElement>(null)
  const m = useMatchResults()
  const slots = useRoster(s => s.slots)
  const bySlot = new Map(slots.map(s => [s.slot, s]))
  useNavScope(ref, { onBack: () => uiActions.quitToLobby(), onStart: () => uiActions.rematch() })
  const champs = m.rows.filter(r => r.rank === 1)
  const champ = champs[0]
  const champSlot = champ ? bySlot.get(champ.slot) : undefined
  const n = m.rows.length
  const cols = Math.min(6, Math.max(3, Math.ceil(n / Math.ceil(n / 6))))
  const podium = [m.rows.find(r => r.rank === 2) ?? m.rows[1], m.rows[0], m.rows.find(r => r.rank === 3) ?? m.rows[2]]
  const voters = m.rows.filter(r => r.votedRematch)
  // Égalité de soleils départagée au désert cumulé : on l'écrit (sinon le 2e croit à une erreur).
  const second = m.rows[1]
  const tiebreak = !m.coWinners && champ && second && second.suns === champ.suns && second.totalShare !== champ.totalShare

  // Le récitatif du champion se pose au-dessus de la grille des titres, quelle que soit sa hauteur.
  const titlesRef = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = titlesRef.current
    const root = el?.closest<HTMLElement>('.ui-root')
    if (!el || !root) return
    const apply = () => root.style.setProperty('--titles-h', `${el.offsetHeight}px`)
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    // dernier plan pur : ni cases ni récitatif pendant PODIUM_INTRO_MS (voir .match-res --intro-ms)
    root.dataset.podiumIntro = ''
    const intro = setTimeout(() => delete root.dataset.podiumIntro, PODIUM_INTRO_MS)
    return () => {
      ro.disconnect()
      clearTimeout(intro)
      delete root.dataset.podiumIntro
      root.style.removeProperty('--titles-h')
    }
  }, [])

  return (
    <div className={n > 6 ? 'screen match-res match-res--dense' : 'screen match-res'} ref={ref}>
      <div className="match-res__top">
        <Case className="champion" variant="title" i={0}>
          <div className="champion__over t-title">{t('host.match.over')}</div>
          {m.coWinners ? (
            <div className="champion__line">
              <span className="champion__tokens">
                {champs.map(c => (
                  <Token key={c.slot} colorIndex={bySlot.get(c.slot)?.colorIndex ?? c.slot} size={64} />
                ))}
              </span>
              <span className="champion__name t-title">{t('host.match.coWinners')}</span>
            </div>
          ) : champ ? (
            <div className="champion__line">
              <Token colorIndex={champSlot?.colorIndex ?? 0} size={68} />
              {/* bot : couleur en grand, caractère dessous (plus de « CARMIN · » / « GUETTEUR » coupé) */}
              <span className="champion__name t-title">
                <SlotName s={champSlot} stacked />
              </span>
              <span className="champion__wins">{t('host.match.wins')}</span>
              <span className="champion__suns t-num">
                <Icon name="sun" size={44} stroke={2} />
                {champ.suns}
              </span>
            </div>
          ) : null}
          {tiebreak ? (
            <div className="champion__tiebreak">{t('host.match.tiebreak', { a: fmtPct(champ.totalShare, 0), b: fmtPct(second.totalShare, 0) })}</div>
          ) : null}
        </Case>
        <div className="rematch enter" style={{ ['--i' as string]: 1 }}>
          <Btn primary icon="rematch" isDefault onClick={() => uiActions.rematch()} hint={<Key>{t('host.key.enter')}</Key>}>
            {t('host.match.rematch')}
          </Btn>
          <Btn icon="back" onClick={() => uiActions.quitToLobby()} hint={<Key>{t('host.key.esc')}</Key>}>
            {t('host.match.toLobby')}
          </Btn>
          {m.rematch.humans > 0 ? (
            <div className="rematch__votes">
              <span>{t('host.match.votes', { n: m.rematch.votes, total: m.rematch.humans })}</span>
              <span className="rematch__voted">
                {voters.map(v => (
                  <Token key={v.slot} colorIndex={bySlot.get(v.slot)?.colorIndex ?? v.slot} size={26} />
                ))}
              </span>
            </div>
          ) : null}
          <SandTimer deadline={m.rematch.deadline} total={RULES.rematchVoteSeconds} />
        </div>
      </div>

      <div className="podium">
        {podium.map((row, k) =>
          row ? (
            <div key={row.slot} className="podium__slot" style={{ left: `${PODIUM_X[k] * 100}%`, top: PODIUM_DY[k] }}>
              <Case className={`podium__plate podium__plate--${row.rank}`} variant="title" i={2 + k}>
                <span className="podium__rank t-num">{row.rank}</span>
                <span className="podium__who">
                  <Token colorIndex={bySlot.get(row.slot)?.colorIndex ?? row.slot} size={40} />
                  <SlotName s={bySlot.get(row.slot)} />
                </span>
                <span className="podium__suns t-num">
                  <Icon name="sun" size={30} stroke={2} />
                  {row.suns}
                </span>
              </Case>
            </div>
          ) : null,
        )}
      </div>

      <div className="titles" ref={titlesRef}>
        <div className="titles__cap t-title enter" style={{ ['--i' as string]: 4 }}>
          <span>{t('host.match.titles')}</span>
        </div>
        <div className="titles__grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {m.rows.map((row, i) => (
            <TitleCard key={row.slot} row={row} s={bySlot.get(row.slot)} i={i} stackName={cols >= 5} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TitleCard({ row, s, i, stackName }: { row: MatchRowVM; s: SlotVM | undefined; i: number; stackName: boolean }) {
  return (
    <Case className={row.rank === 1 ? 'tcard tcard--first' : 'tcard'} i={5 + i}>
      <div className="tcard__head">
        <span className="tcard__rank t-num">{ordinal(row.rank)}</span>
        <Token colorIndex={s?.colorIndex ?? row.slot} size={34} />
        <span className="tcard__name">
          {/* cartes étroites (5 colonnes et plus : 5-12 joueurs) : caractère du bot sous la couleur,
              jamais tronqué (non-régression : à 5-6 joueurs, « Carmin · … ») */}
          <SlotName s={s} stacked={stackName} />
        </span>
        <span className="tcard__suns t-num">
          <Icon name="sun" size={24} stroke={2} />
          {row.suns}
        </span>
      </div>
      {row.title ? (
        <>
          <div className="tcard__title t-title">{t(`titles.${row.title.id}.name`)}</div>
          <div className="tcard__stat">{titleStat(row.title.id, row.title.value)}</div>
          <div className="tcard__desc">{t(`titles.${row.title.id}.desc`)}</div>
        </>
      ) : (
        <div className="tcard__none">{t('host.match.noTitle')}</div>
      )}
      <div className="tcard__stats">
        <span>
          {t('host.stat.hits')} <b>{row.stats.hits}</b>
        </span>
        <span>
          {t('host.stat.dodges')} <b>{row.stats.dodges}</b>
        </span>
        <span>
          {t('host.stat.low')} <b>{fmtPct(row.stats.lowFrac, 0)}</b>
        </span>
        {/* cumul des manches : peut dépasser le territoire final, d'où la mention */}
        <span className="tcard__stat-wide">
          {t('host.stat.stolen')} <b>{fmtPct(row.stats.stolenFrac, 0)}</b>
        </span>
      </div>
    </Case>
  )
}
