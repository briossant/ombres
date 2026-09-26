// Résultats de partie (GDD §11.4-11.5) : champion, podium (plaques sous les
// oiseaux perchés sur les tours 3D, au centre), titres de chacun avec leur
// chiffre, stats par joueur, revanche (votes des téléphones) et salon.
import { useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { RULES } from '../../../sim/rules.ts'
import { Btn, Case, Key, SandTimer } from '../components.tsx'
import { fmtPct, ordinal, slotDisplayName, slotShortName, titleStat } from '../format.ts'
import { Token } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions, useMatchResults, useRoster, type MatchRowVM, type SlotVM } from '../viewModel.ts'
import './results.css'

/** Positions horizontales des plaques du podium (fraction de l'écran) : 2e, 1er, 3e. */
export const PODIUM_X: readonly [number, number, number] = [0.3, 0.5, 0.7]
/** Décalage vertical des plaques (px) : la plus haute tour porte le champion. */
const PODIUM_DY = [40, 0, 70]

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
              <Token colorIndex={champSlot?.colorIndex ?? 0} size={78} />
              <span className="champion__name t-title">{slotDisplayName(champSlot)}</span>
              <span className="champion__wins">{t('host.match.wins')}</span>
              <span className="champion__suns t-num">
                <Icon name="sun" size={48} stroke={2} />
                {champ.suns}
              </span>
            </div>
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
                  <span>{slotShortName(bySlot.get(row.slot))}</span>
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

      <div className="titles">
        <div className="titles__cap t-title">
          <span>{t('host.match.titles')}</span>
        </div>
        <div className="titles__grid" style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}>
          {m.rows.map((row, i) => (
            <TitleCard key={row.slot} row={row} s={bySlot.get(row.slot)} i={i} />
          ))}
        </div>
      </div>
    </div>
  )
}

function TitleCard({ row, s, i }: { row: MatchRowVM; s: SlotVM | undefined; i: number }) {
  return (
    <Case className={row.rank === 1 ? 'tcard tcard--first' : 'tcard'} i={5 + i}>
      <div className="tcard__head">
        <span className="tcard__rank t-num">{ordinal(row.rank)}</span>
        <Token colorIndex={s?.colorIndex ?? row.slot} size={34} />
        <span className="tcard__name">{slotShortName(s)}</span>
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
          {t('host.stat.hits')}
          <b>{row.stats.hits}</b>
        </span>
        <span>
          {t('host.stat.dodges')}
          <b>{row.stats.dodges}</b>
        </span>
        <span>
          {t('host.stat.stolen')}
          <b>{fmtPct(row.stats.stolenFrac, 0)}</b>
        </span>
        <span>
          {t('host.stat.low')}
          <b>{fmtPct(row.stats.lowFrac, 0)}</b>
        </span>
      </div>
    </Case>
  )
}
