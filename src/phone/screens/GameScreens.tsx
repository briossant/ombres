// Écrans de partie : salon jouable, cartes avant la manche, manette, entre les manches,
// fin de partie, arrivée en cours de partie.
import type { ReactNode } from 'react'
import type { PhoneView } from '../../shared/messages.ts'
import { hasKey } from '../../shared/i18n.ts'
import { colorName } from '../../shared/players.ts'
import { sendAction, sendReady } from '../link.ts'
import { formatPct, ordinal, splitOrdinal, useLang, useT, useTn } from '../format.tsx'
import { openSheet, usePhone } from '../store.ts'
import { Controller } from '../controls/Controller.tsx'
import { recalibrateTilt } from '../controls/TiltPad.tsx'
import { Band, PlayBandInfo, PlayInfoPanel } from '../ui/Band.tsx'
import { Token } from '../ui/Glyph.tsx'
import { IconCheck, IconCrown, IconEyeOff, IconGear, IconLobby, IconPlay, IconRematch, IconSun } from '../ui/Icons.tsx'
import { RuleCard, RulesCarousel } from '../ui/RulesCards.tsx'
import { Wash } from '../ui/Wash.tsx'
import { Deadline, Num } from '../ui/bits.tsx'

type V = PhoneView

/** Échéance locale (performance.now) d'un `deadlineIn` reçu avec la vue. */
function useDeadline(deadlineIn: number | null | undefined): { start: number; end: number } | null {
  const viewAt = usePhone(s => s.viewAt)
  if (deadlineIn === null || deadlineIn === undefined) return null
  return { start: viewAt, end: viewAt + deadlineIn * 1000 }
}

function Shell({ view, children, band }: { view: V; children: ReactNode; band?: ReactNode }) {
  return (
    <>
      <Wash color={view.you.color} colorblind={view.colorblind} />
      <Band color={view.you.color} name={view.you.name} assist={view.you.assist}>
        {band}
      </Band>
      {children}
    </>
  )
}

function SettingsButton() {
  const t = useT()
  return (
    <button type="button" className="icon-btn" aria-label={t('phone.settings.open')} onClick={() => openSheet('settings')}>
      <IconGear size={24} />
    </button>
  )
}

function RoomChip() {
  const t = useT()
  const room = usePhone(s => s.room)
  return (
    <div className="band__chip band__room">
      {t('phone.lobby.room')}&nbsp;<b>{room}</b>
    </div>
  )
}

// ─── Salon ─────────────────────────────────────────────────────────────────

export function LobbyScreen({ view }: { view: V }) {
  const t = useT()
  const local = usePhone(s => s.localGoals)
  const lobby = view.lobby
  const goals = {
    fly: (lobby?.goals.fly ?? false) || local.fly,
    dive: (lobby?.goals.dive ?? false) || local.dive,
    strike: lobby?.goals.strike ?? false,
  }
  const items: { key: 'fly' | 'dive' | 'strike'; done: boolean }[] = [
    { key: 'fly', done: goals.fly },
    { key: 'dive', done: goals.dive },
    { key: 'strike', done: goals.strike },
  ]
  const next = items.find(it => !it.done)
  const waiting = view.you.leader ? null : lobby?.leaderName ? t('phone.lobby.waitLeader', { name: lobby.leaderName }) : t('phone.lobby.waitScreen')
  return (
    <Shell
      view={view}
      band={
        <>
          {view.you.leader ? (
            // Dans le bandeau, loin du joystick : pas de lancement par erreur.
            <button type="button" className={`btn btn--primary band__start ${lobby?.canStart === false ? 'is-disabled' : ''}`} onClick={() => sendAction('start')}>
              <IconPlay size={20} /> <span className="label-long">{t('phone.lobby.start')}</span>
              <span className="label-short">{t('phone.lobby.startShort')}</span>
            </button>
          ) : (
            <RoomChip />
          )}
          <SettingsButton />
        </>
      }
    >
      <Controller practice restX={0.4} />
      <div className="ctl-overlay">
        <div className="case lobby-goals">
          <div className="lobby-goals__row">
            <ul className="goals" aria-label={t('phone.lobby.practice')}>
              {items.map(it => (
                <li key={it.key} className={`goal ${it.done ? 'is-done' : ''} ${next === it ? 'is-next' : ''}`}>
                  <span className="goal__box">{it.done && <IconCheck size={20} />}</span>
                  <span className="goal__label">{t(`phone.goal.${it.key}`)}</span>
                </li>
              ))}
            </ul>
          </div>
          <p className="lobby-goals__how">{next ? t(`phone.goal.${next.key}.how`) : t('phone.lobby.allDone')}</p>
        </div>
        <div className="case lobby-rules">
          <RulesCarousel />
        </div>
        {waiting && <div className="lobby-wait recitatif">{waiting}</div>}
      </div>
    </Shell>
  )
}

// ─── Les 3 cartes avant la première manche ─────────────────────────────────

export function IntroScreen({ view }: { view: V }) {
  const t = useT()
  const tn = useTn()
  const intro = view.intro
  const pendingReady = usePhone(s => s.pendingReady)
  const ready = pendingReady ?? view.you.ready
  const deadline = useDeadline(intro?.deadlineIn)
  return (
    <Shell view={view}>
      <div className="screen screen--band intro">
        <div className="intro__head">
          <h1 className="t-title">
            {intro ? tn('phone.intro.round', { n: intro.round, total: intro.rounds }) : ''}
            {intro && <span className="intro__map"> · {t(`phone.map.${intro.map}`)}</span>}
          </h1>
          {intro?.double && <div className="recitatif intro__double">{t('phone.intro.double')}</div>}
        </div>
        <div className="intro__cards">
          {[0, 1, 2].map(i => (
            <div key={i} className="case intro__card">
              <RuleCard index={i} />
            </div>
          ))}
        </div>
        <div className="intro__foot">
          <button
            type="button"
            className={`btn btn--primary ${ready ? 'is-voted' : ''}`}
            onClick={() => {
              recalibrateTilt()
              sendReady(true)
            }}
            disabled={ready}
          >
            {ready ? <IconCheck size={24} /> : null}
            {ready ? t('phone.ready.done') : t('phone.intro.ok')}
          </button>
          {intro && <span className="intro__count">{tn('phone.intro.waiting', { ok: intro.ok, total: intro.total })}</span>}
          {deadline && (
            <div className="intro__deadline">
              <Deadline startAt={deadline.start} endAt={deadline.end} />
            </div>
          )}
        </div>
      </div>
    </Shell>
  )
}

// ─── Manette ───────────────────────────────────────────────────────────────

export function PlayScreen({ view }: { view: V }) {
  const t = useT()
  const status = usePhone(s => s.status)
  const stunned = (status?.stun ?? 0) > 0
  return (
    <Shell view={view} band={<PlayBandInfo />}>
      <PlayInfoPanel />
      <Controller disabled={stunned} />
      <div className="play-state">
        {stunned && <div className="recitatif recitatif--ink">{t('phone.play.stunned')}</div>}
        {!stunned && status?.hidden && (
          <div className="recitatif">
            <IconEyeOff size={22} /> {t('phone.play.hidden')}
          </div>
        )}
        {status?.night && <div className="recitatif recitatif--ink">{t('phone.play.night')}</div>}
        {!stunned && status?.immune && <div className="recitatif">{t('phone.play.immune')}</div>}
      </div>
    </Shell>
  )
}

// ─── Entre les manches ─────────────────────────────────────────────────────

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </>
  )
}

export function RoundEndScreen({ view }: { view: V }) {
  const t = useT()
  const tn = useTn()
  const lang = useLang()
  const r = view.roundEnd
  const pendingReady = usePhone(s => s.pendingReady)
  const ready = pendingReady ?? view.you.ready
  const deadline = useDeadline(r?.deadlineIn)
  if (!r) return <Shell view={view}>{null}</Shell>
  const [rn, rs] = splitOrdinal(r.rank, lang)
  const youWin = r.rank === 1
  const suns = r.suns === 0 ? t('phone.roundEnd.suns.zero') : r.suns === 1 ? tn('phone.roundEnd.suns.one', { n: 1 }) : tn('phone.roundEnd.suns.other', { n: r.suns })
  return (
    <Shell view={view} band={<SettingsButton />}>
      <div className="screen screen--band">
        <div className="two-col">
          <div className="case case--title panel result">
            <h1 className="t-title">{tn('phone.roundEnd.title', { n: r.round })}</h1>
            <div className="result__main">
              <div className="big-rank t-num">
                {rn}
                <sup>{rs}</sup>
              </div>
              <div>
                <div className="result__share t-num">{formatPct(r.share, lang)}</div>
                <div className="muted">
                  {t('phone.roundEnd.ofDesert')} · {tn('phone.roundEnd.rankOf', { n: r.of })}
                </div>
              </div>
            </div>
            <div className="suns">
              <IconSun size={26} /> <b>{suns}</b>
              <span className="muted">· {tn('phone.roundEnd.total', { n: r.total })}</span>
            </div>
            <p className="result__winner">
              {youWin ? (
                <b>{t('phone.roundEnd.youWin')}</b>
              ) : r.winner ? (
                <>
                  <Token index={r.winner.color} size={24} /> {t('phone.roundEnd.winner', { name: r.winner.name })}
                </>
              ) : null}
            </p>
          </div>
          <div className="case panel result">
            <dl className="stats">
              <Stat label={t('phone.stat.hits')} value={String(r.stats.hits)} />
              <Stat label={t('phone.stat.gotHit')} value={String(r.stats.gotHit)} />
              <Stat label={t('phone.stat.dodges')} value={String(r.stats.dodges)} />
              <Stat label={t('phone.stat.stolen')} value={formatPct(r.stats.stolen, lang)} />
              <Stat label={t('phone.stat.lowFrac')} value={formatPct(r.stats.lowFrac, lang, 0)} />
            </dl>
            {r.mention && <p className="recitatif result__mention">{t(r.mention.key, r.mention.params)}</p>}
            {r.nextDouble && <p className="result__double">{t('phone.roundEnd.nextDouble')}</p>}
            <div className="result__ready">
              <button type="button" className={`btn btn--primary ${ready ? 'is-voted' : ''}`} onClick={() => sendReady(true)} disabled={ready}>
                {ready && <IconCheck size={24} />}
                {ready ? t('phone.ready.done') : t('phone.ready')}
              </button>
              <span className="muted">{tn('phone.ready.count', { n: r.readyCount, total: r.readyTotal })}</span>
            </div>
            {deadline && <Deadline startAt={deadline.start} endAt={deadline.end} />}
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ─── Fin de partie ─────────────────────────────────────────────────────────

export function MatchEndScreen({ view }: { view: V }) {
  const t = useT()
  const tn = useTn()
  const lang = useLang()
  const m = view.matchEnd
  const pendingVote = usePhone(s => s.pendingVote)
  const deadline = useDeadline(m?.vote.deadlineIn)
  if (!m) return <Shell view={view}>{null}</Shell>
  const mine = pendingVote ?? m.vote.mine
  const youWin = m.winners.some(w => w.color === view.you.color)
  const headline =
    m.winners.length > 1 ? t('phone.matchEnd.tie') : youWin ? t('phone.matchEnd.youWin') : m.winners[0] ? t('phone.matchEnd.winner', { name: m.winners[0].name }) : ''
  const sunsLabel = (n: number) => (n === 1 ? tn('phone.matchEnd.suns.one', { n }) : tn('phone.matchEnd.suns.other', { n }))
  return (
    <Shell view={view} band={<SettingsButton />}>
      <div className="screen screen--band">
        <div className="two-col">
          <div className="case case--title panel result">
            <h1 className="t-title">{t('phone.matchEnd.title')}</h1>
            <p className="result__headline">
              {youWin && <IconCrown size={28} />} {headline}
            </p>
            <div className="result__main">
              <div className="big-rank t-num">
                {splitOrdinal(m.rank, lang)[0]}
                <sup>{splitOrdinal(m.rank, lang)[1]}</sup>
              </div>
              <div className="suns">
                <IconSun size={26} /> <b>{sunsLabel(m.suns)}</b>
              </div>
            </div>
            <div className="recitatif title-card">
              <div className="muted">{t('phone.matchEnd.yourTitle')}</div>
              {m.title ? (
                <>
                  <div className="t-title">{hasKey(m.title.key) ? t(m.title.key) : (m.title.label ?? t(m.title.key))}</div>
                  {m.title.value && <div className="t-num">{m.title.value}</div>}
                </>
              ) : (
                <div>{t('phone.matchEnd.noTitle')}</div>
              )}
            </div>
          </div>
          <div className="case panel result">
            <ol className="podium">
              {m.podium.map((p, i) => (
                <li key={`${p.color}-${i}`}>
                  <span className="t-num">{ordinal(i + 1, lang)}</span>
                  <Token index={p.color} size={26} />
                  <span className="podium__name">{p.name}</span>
                  <span className="t-num podium__suns">
                    <Num value={String(p.suns)} /> <IconSun size={20} />
                  </span>
                </li>
              ))}
            </ol>
            <div className="vote-row">
              <button type="button" className={`btn ${mine === 'rematch' ? 'is-voted' : ''}`} onClick={() => sendAction('rematch')}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconRematch size={24} /> {t('phone.matchEnd.rematch')}
                </span>
                <small>{t('phone.matchEnd.votes', { n: m.vote.rematch, total: m.vote.humans })}</small>
              </button>
              <button type="button" className={`btn ${mine === 'toLobby' ? 'is-voted' : ''}`} onClick={() => sendAction('toLobby')}>
                <span style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <IconLobby size={24} /> {t('phone.matchEnd.lobby')}
                </span>
                <small>{t('phone.matchEnd.votes', { n: m.vote.toLobby, total: m.vote.humans })}</small>
              </button>
            </div>
            {deadline && <Deadline startAt={deadline.start} endAt={deadline.end} />}
          </div>
        </div>
      </div>
    </Shell>
  )
}

// ─── Arrivé en cours de partie ─────────────────────────────────────────────

export function SpectateScreen({ view }: { view: V }) {
  const t = useT()
  const tn = useTn()
  const lang = useLang()
  return (
    <Shell view={view} band={<SettingsButton />}>
      <div className="screen screen--band">
        <div className="two-col">
          <div className="case case--title panel result">
            <h1 className="t-title">{t('phone.spectate.title')}</h1>
            {view.spectate && <p className="muted">{tn('phone.spectate.round', { n: view.spectate.round, total: view.spectate.rounds })}</p>}
            <p className="lede">{t('phone.spectate.body')}</p>
            <p className="result__winner">
              <Token index={view.you.color} size={24} /> {colorName(view.you.color, lang)}
            </p>
          </div>
          <div className="case panel">
            <RulesCarousel interactive />
          </div>
        </div>
      </div>
    </Shell>
  )
}
