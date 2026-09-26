// Salon (GDD §15.2, ART_BIBLE §8.8) : le désert du salon est jouable derrière
// (KF50). À gauche : rejoindre (QR, code, URL) et les règles qui tournent. En
// bas au centre : réglages de partie. À droite : les oiseaux (slots) et Lancer.
// Le centre haut reste libre : les joueurs y voient voler leur oiseau.
import { Fragment, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from 'react'
import { getLang, t } from '../../../shared/i18n.ts'
import { colorName } from '../../../shared/players.ts'
import { RULES } from '../../../sim/rules.ts'
import { Btn, Case, Key, Segmented, SlotName } from '../components.tsx'
import { botLevelName, sentenceLines, slotDisplayName, useLang } from '../format.ts'
import { Token } from '../glyphs.tsx'
import { WorldLayer } from '../hud/WorldLayer.tsx'
import { Icon } from '../icons.tsx'
import { keyLabel, useKeyLayout } from '../keys.ts'
import { useNavScope } from '../nav.ts'
import { QrCode } from '../QrCode.tsx'
import { RuleArt } from '../RuleArt.tsx'
import {
  BOT_LEVELS,
  BOT_PERSONALITIES,
  uiActions,
  useLobby,
  useRoster,
  type BotLevel,
  type MatchSettingsVM,
  type RoundsOption,
  type SlotVM,
} from '../viewModel.ts'
import './lobby.css'

export function Lobby() {
  const ref = useRef<HTMLDivElement>(null)
  const keyboardJoined = useLobby(s => s.keyboardJoined)
  const count = useRoster(s => s.slots.length)
  useNavScope(ref, {
    onBack: () => uiActions.back(),
    onStart: () => count > 0 && uiActions.startMatch(),
    // Un joueur au clavier pilote son oiseau avec les flèches : l'UI s'en passe.
    arrows: !keyboardJoined,
  })
  return (
    <div className="screen lobby" ref={ref}>
      {/* Étiquettes permanentes des oiseaux et du mannequin, sous les cases. */}
      <WorldLayer mode="lobby" />
      <div className="lobby__left">
        <JoinCase />
        <RulesCarousel />
      </div>
      <div className="lobby__center">
        <MatchSettingsCase />
      </div>
      <div className="lobby__right">
        <Roster />
        <StartButton />
      </div>
    </div>
  )
}

// ─── Rejoindre ─────────────────────────────────────────────────────────────

function shortUrl(url: string): string {
  try {
    const u = new URL(url)
    return `${u.host}${u.pathname === '/' ? '' : u.pathname}`
  } catch {
    return url
  }
}

function JoinCase() {
  const code = useLobby(s => s.roomCode)
  const url = useLobby(s => s.joinUrl)
  const connection = useLobby(s => s.connection)
  const ready = connection === 'online' && code && url
  return (
    <Case className="join" variant="title" cap={t('host.lobby.join')} i={0}>
      <div className="join__qr">
        {ready ? (
          <QrCode text={url} size={320} />
        ) : (
          <div className="join__pending">
            <Icon name={connection === 'offline' ? 'wifiOff' : 'reconnect'} size={56} className={connection === 'offline' ? '' : 'spin'} />
            <span>{t(connection === 'offline' ? 'host.lobby.offline' : 'host.lobby.connecting')}</span>
          </div>
        )}
      </div>
      <div className="join__scan">{t('host.lobby.scan')}</div>
      <div className="join__code" aria-label={t('host.lobby.code')}>
        {(code ?? '····').split('').map((ch, k) => (
          <span key={k} className="join__letter t-num">
            {ch}
          </span>
        ))}
      </div>
      {url ? <JoinUrl url={url} /> : <div className="join__url" />}
    </Case>
  )
}

/** Taille de l'adresse : 22 px si elle tient, réduite jusqu'à 14 px sinon. */
const URL_PX_MAX = 22
const URL_PX_MIN = 14
/** letter-spacing de .join__url b (em). */
const URL_LETTER_SPACING = 0.01
let canvas: HTMLCanvasElement | null = null
const measureCanvas = () => (canvas ??= document.createElement('canvas'))

/**
 * « ou ouvre <hôte>/play » dans une boîte de hauteur fixe : sur une ligne si tout
 * tient, sinon le libellé au-dessus et l'adresse (sans schéma) à la taille qui
 * remplit la largeur ; au pire, coupure aux points (<wbr>), jamais au milieu d'un mot.
 */
function JoinUrl({ url }: { url: string }) {
  const lang = useLang()
  const host = shortUrl(url)
  const boxRef = useRef<HTMLDivElement>(null)
  const labelRef = useRef<HTMLSpanElement>(null)
  const urlRef = useRef<HTMLElement>(null)
  const [fit, setFit] = useState<{ px: number; stacked: boolean }>({ px: URL_PX_MAX, stacked: false })
  useLayoutEffect(() => {
    const box = boxRef.current
    const u = urlRef.current
    const label = labelRef.current
    if (!box || !u || !label) return
    const measure = () => {
      // largeur naturelle de l'adresse à la taille maximale, sur une ligne (police réelle de <b>)
      const cs = getComputedStyle(u)
      const ctx = measureCanvas().getContext('2d')
      if (!ctx) return
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${URL_PX_MAX}px ${cs.fontFamily}`
      const natural = ctx.measureText(host).width + host.length * URL_PX_MAX * URL_LETTER_SPACING
      const bs = getComputedStyle(box)
      const avail = box.clientWidth - parseFloat(bs.paddingLeft) - parseFloat(bs.paddingRight) - 4
      const inline = label.offsetWidth + parseFloat(bs.columnGap || '8') + natural
      if (inline <= avail) setFit({ px: URL_PX_MAX, stacked: false })
      else setFit({ px: Math.max(URL_PX_MIN, Math.min(URL_PX_MAX, Math.floor((URL_PX_MAX * avail * 10) / natural) / 10)), stacked: true })
    }
    measure()
    // les polices peuvent finir de charger après le premier rendu
    void document.fonts?.ready.then(measure)
  }, [host, lang])
  const parts = host.split('.')
  return (
    <div className={fit.stacked ? 'join__url is-stacked' : 'join__url'} ref={boxRef}>
      <span className="join__url-label" ref={labelRef}>
        {t('host.lobby.orVisit')}
      </span>
      <b ref={urlRef} style={{ fontSize: fit.px }}>
        {parts.map((p, k) => (
          <Fragment key={k}>
            {p}
            {k < parts.length - 1 ? (
              <>
                .<wbr />
              </>
            ) : null}
          </Fragment>
        ))}
      </b>
    </div>
  )
}

/** Touches physiques de chaque groupe du clavier partagé (src/input/keyboard.ts). */
const KB_KEYS = {
  1: { steer: ['KeyW', 'KeyA', 'KeyS', 'KeyD'], dive: 'Space', flap: 'ShiftLeft' },
  2: { steer: ['KeyI', 'KeyJ', 'KeyK', 'KeyL'], dive: 'AltRight', flap: 'Semicolon' },
} as const

/**
 * Pied de la liste des oiseaux, côté clavier : avant d'entrer, la touche pour
 * rejoindre (Espace = PLONGER du groupe 1, puis AltGr pour le groupe 2) ; une fois
 * entré, la carte des touches du groupe, son prochain objectif et « Échap : quitter ».
 */
function KeyboardJoinHint({ full }: { full: boolean }) {
  const layout = useKeyLayout()
  const slots = useRoster(s => s.slots)
  const players = slots.filter(x => x.kind === 'keyboard' && !x.substitute)
  const groups = new Set(players.map(p => p.keyboardGroup ?? 1))
  const nextGroup = !groups.has(1) ? 1 : !groups.has(2) ? 2 : null
  return (
    <div className="kbd-join">
      {players.map(p => (
        <KeyboardCard key={p.slot} s={p} layout={layout} />
      ))}
      {nextGroup && !full ? (
        <div className="kbd-join__next">
          <Key>{keyLabel(KB_KEYS[nextGroup].dive, layout)}</Key>
          <span>{t(nextGroup === 1 ? 'host.lobby.keyboardJoin' : 'host.lobby.keyboardJoin2')}</span>
        </div>
      ) : null}
    </div>
  )
}

function KeyboardCard({ s, layout }: { s: SlotVM; layout: ReturnType<typeof useKeyLayout> }) {
  const g = KB_KEYS[s.keyboardGroup ?? 1]
  const k = (code: string) => <Key>{keyLabel(code, layout)}</Key>
  const goal = !s.goals.fly ? 'fly' : !s.goals.dive ? 'dive' : !s.goals.strike ? 'strike' : 'done'
  return (
    <div className="kbd-card">
      <div className="kbd-card__head">
        <Token colorIndex={s.colorIndex} size={26} />
        <span className="kbd-card__who">{t('host.lobby.kind.keyboard', { n: s.keyboardGroup ?? 1 })}</span>
        <span className="kbd-card__goal">
          {t(`host.lobby.kbGoal.${goal}`, { dive: keyLabel(g.dive, layout) })}
        </span>
      </div>
      <div className="kbd-card__keys">
        <span>
          <span className="kbd-card__caps">{g.steer.map(c => <Fragment key={c}>{k(c)}</Fragment>)}</span> {t('host.lobby.kbSteer')}
        </span>
        <span>
          {k(g.dive)} {t('host.lobby.kbDive')}
        </span>
        <span>
          {k(g.flap)} {t('host.lobby.kbFlap')}
        </span>
        <span>
          <Key>{t('host.key.esc')}</Key> {t('host.lobby.kbQuit')}
        </span>
      </div>
    </div>
  )
}

// ─── Règles qui tournent ───────────────────────────────────────────────────

const CARD_MS = 5000

export function RulesCarousel() {
  // La carte suivante s'essuie à l'encre par-dessus la précédente : la case n'est jamais vide.
  const [{ card, prev }, setCards] = useState<{ card: 1 | 2 | 3; prev: 1 | 2 | 3 | null }>({ card: 1, prev: null })
  useEffect(() => {
    const id = setInterval(() => setCards(c => ({ card: ((c.card % 3) + 1) as 1 | 2 | 3, prev: c.card })), CARD_MS)
    return () => clearInterval(id)
  }, [])
  return (
    <Case className="carousel" cap={t('host.lobby.rules')} i={1}>
      <div className="carousel__art">
        {prev ? (
          <div className="carousel__layer" key={`p${prev}-${card}`}>
            <RuleArt card={prev} />
          </div>
        ) : null}
        <div className={prev ? 'carousel__layer carousel__layer--in' : 'carousel__layer'} key={card}>
          <RuleArt card={card} />
        </div>
      </div>
      <p className="carousel__text" key={`t${card}`}>
        {sentenceLines(t(`host.rules.${card}`)).map((line, j) => (
          <span key={j}>
            {j === 0 ? <span className="carousel__num t-num">{card}</span> : null}
            {line}
          </span>
        ))}
      </p>
    </Case>
  )
}

// ─── Réglages de partie ────────────────────────────────────────────────────

function MatchSettingsCase() {
  const match = useLobby(s => s.match)
  useLang()
  const set = <K extends keyof MatchSettingsVM>(k: K, v: MatchSettingsVM[K]) => uiActions.setMatchSetting(k, v)
  return (
    <Case className="match" cap={t('host.match.settings')} i={2}>
      <div className="match__grid">
        <Segmented<RoundsOption>
          compact
          label={t('host.match.rounds')}
          icon="flag"
          value={match.rounds}
          options={RULES.roundsOptions.map(r => ({ value: r, label: <span className="t-num">{r}</span> }))}
          onChange={v => set('rounds', v)}
        />
        <Segmented
          compact
          label={t('host.match.length')}
          icon="sun"
          value={match.length}
          options={(['short', 'normal', 'long'] as const).map(l => ({ value: l, label: t(`host.match.length.${l}`) }))}
          onChange={v => set('length', v)}
        />
        <Segmented<BotLevel>
          compact
          label={
            <>
              {t('host.match.botLevel')}
              <span className="match__sub">{botLevelName(match.botLevel)}</span>
            </>
          }
          icon="bot"
          value={match.botLevel}
          options={BOT_LEVELS.map(l => ({ value: l, label: <LevelPips level={l} /> }))}
          onChange={v => set('botLevel', v)}
        />
        <Segmented<boolean>
          compact
          label={t('host.match.lastDouble')}
          icon="moon"
          value={match.lastRoundDouble}
          options={[
            { value: true, label: t('host.yes') },
            { value: false, label: t('host.no') },
          ]}
          onChange={v => set('lastRoundDouble', v)}
        />
      </div>
    </Case>
  )
}

function LevelPips({ level }: { level: BotLevel }) {
  return (
    <span className="pips" aria-label={botLevelName(level)}>
      {[0, 1, 2].map(k => (
        <span key={k} className={k <= level ? 'pip is-on' : 'pip'} />
      ))}
    </span>
  )
}

// ─── Les oiseaux ───────────────────────────────────────────────────────────

function Roster() {
  const slots = useRoster(s => s.slots)
  const botLevel = useLobby(s => s.match.botLevel)
  useLang()
  const dense = slots.length > 8
  return (
    <Case className={dense ? 'roster roster--dense' : 'roster'} variant="title" cap={t('host.lobby.players')} i={1}>
      {slots.length === 0 ? (
        <div className="roster__empty">
          <p className="roster__empty-title">{t('host.lobby.waiting')}</p>
          <p className="roster__empty-sub">{t('host.lobby.waitingSub')}</p>
          <div className="roster__ghosts" aria-hidden>
            {[0, 1, 2, 3].map(k => (
              <span key={k} className="roster__ghost" />
            ))}
          </div>
        </div>
      ) : (
        <>
          <div className="roster__head" aria-hidden>
            <span />
            <span className="roster__goals-head">
              <span>{t('host.goal.fly')}</span>
              <span>{t('host.goal.dive')}</span>
              <span>{t('host.goal.strike')}</span>
            </span>
          </div>
          <ul className="roster__list">
            {slots.map((s, k) => (
              <SlotRow key={s.slot} s={s} index={k} />
            ))}
          </ul>
        </>
      )}
      {slots.length < RULES.arenaPresets[RULES.arenaPresets.length - 1].maxBirds ? (
        <Btn className="roster__add" icon="add" quiet onClick={() => uiActions.addBot(null, botLevel)}>
          {t('host.lobby.addBot')}
        </Btn>
      ) : (
        <div className="roster__full">{t('host.lobby.full')}</div>
      )}
      <KeyboardJoinHint full={slots.length >= RULES.arenaPresets[RULES.arenaPresets.length - 1].maxBirds} />
    </Case>
  )
}

function SlotRow({ s, index }: { s: SlotVM; index: number }) {
  const style = { '--i': index } as CSSProperties
  if (s.kind === 'bot' && s.bot && !s.substitute) return <BotRow s={s} style={style} />
  const goals = [s.goals.fly, s.goals.dive, s.goals.strike]
  const trained = goals.every(Boolean)
  return (
    <li className={s.connected ? 'slot enter' : 'slot enter slot--off'} style={style}>
      <Token colorIndex={s.colorIndex} size={42} />
      <span className="slot__main">
        <span className="slot__name">
          {slotDisplayName(s)}
          {s.assist ? <Icon name="feather" size={24} className="slot__assist" title={t('host.lobby.assist')} /> : null}
          {!s.connected ? <Icon name="wifiOff" size={22} className="slot__off-dense" title={t('host.lobby.disconnected')} /> : null}
        </span>
        <span className="slot__meta">
          <Icon name={s.substitute ? 'bot' : s.kind === 'keyboard' ? 'keyboard' : 'phone'} size={22} />
          {s.substitute ? (
            <span>
              {colorName(s.colorIndex, getLang())} · {t('host.lobby.substitute')}
            </span>
          ) : s.kind === 'keyboard' ? (
            <span>{t('host.lobby.kind.keyboard', { n: s.keyboardGroup ?? 1 })}</span>
          ) : (
            <span>{colorName(s.colorIndex, getLang())}</span>
          )}
          {!s.connected ? (
            <span className="slot__off">
              <Icon name="wifiOff" size={20} /> {t('host.lobby.disconnected')}
            </span>
          ) : null}
        </span>
      </span>
      {s.substitute ? (
        <span className="slot__goals" />
      ) : trained ? (
        <span className="slot__trained" title={t('host.lobby.trained')}>
          <Icon name="check" size={30} stroke={2.6} />
        </span>
      ) : (
        <span className="slot__goals" aria-label={t('host.lobby.trained')}>
          {goals.map((g, k) => (
            <span key={k} className={g ? 'goal is-done' : 'goal'}>
              {g ? <Icon name="check" size={16} stroke={3} /> : null}
            </span>
          ))}
        </span>
      )}
    </li>
  )
}

function BotRow({ s, style }: { s: SlotVM; style: CSSProperties }) {
  const bot = s.bot!
  const cyclePersonality = () => {
    const pool = BOT_PERSONALITIES.filter(p => p !== 'watchmaker' || bot.level > 0)
    const next = pool[(pool.indexOf(bot.personality) + 1) % pool.length]
    uiActions.setBotPersonality(s.slot, next)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
      e.preventDefault()
      const lv = Math.min(2, Math.max(0, bot.level + (e.code === 'ArrowLeft' ? -1 : 1))) as BotLevel
      if (lv !== bot.level) uiActions.setBotLevel(s.slot, lv)
    }
  }
  return (
    <li className="slot slot--bot enter" style={style}>
      <Token colorIndex={s.colorIndex} size={42} />
      <span
        className="slot__main slot__main--bot"
        tabIndex={0}
        role="button"
        data-nav=""
        data-nav-own="x"
        title={t('host.lobby.changeBot')}
        onClick={cyclePersonality}
        onKeyDown={onKeyDown}
      >
        {/* « Azur · Faucon » : même nom qu'au-dessus de l'oiseau, aux résultats et au podium */}
        <span className="slot__name">
          <SlotName s={s} />
        </span>
        <span className="slot__meta slot__meta--bot">
          <Icon name="bot" size={22} />
          <span>{t(`host.botDesc.${bot.personality}`)}</span>
        </span>
      </span>
      <span className="slot__level" title={`${t('host.lobby.botLevel')} : ${botLevelName(bot.level)}`}>
        {BOT_LEVELS.map(l => (
          <span key={l} className={l <= bot.level ? 'pip is-on' : 'pip'} onClick={() => uiActions.setBotLevel(s.slot, l)} />
        ))}
      </span>
      <Btn className="slot__remove" icon="close" title={t('host.lobby.removeBot')} onClick={() => uiActions.removeBot(s.slot)} />
    </li>
  )
}

// ─── Lancer ────────────────────────────────────────────────────────────────

function StartButton() {
  const count = useRoster(s => s.slots.length)
  const humans = useRoster(s => s.slots.filter(x => x.kind !== 'bot' || x.substitute).length)
  const disabled = count === 0 || humans === 0
  // Ajout runner : quand le premier joueur arrive, Lancer devient l'action par défaut (Entrée).
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!disabled) ref.current?.querySelector<HTMLElement>('[data-nav]')?.focus({ preventScroll: true })
  }, [disabled])
  return (
    <div className="start enter" style={{ ['--i' as string]: 3 }} ref={ref}>
      <Btn primary icon="resume" isDefault={!disabled} disabled={disabled} onClick={() => uiActions.startMatch()} hint={<Key>{t('host.key.enter')}</Key>}>
        {t('host.lobby.start')}
      </Btn>
      {disabled ? <p className="start__why">{t('host.lobby.needPlayer')}</p> : null}
    </div>
  )
}
