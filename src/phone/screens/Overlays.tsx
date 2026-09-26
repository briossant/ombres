// Surcouches : reconnexion, pause, réglages, messages courts, effets (vibrations visuelles).
import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { ControlScheme } from '../../shared/messages.ts'
import { sendAction, setAssist, setScheme } from '../link.ts'
import { fx, type FxEvent } from '../fx.ts'
import { useT } from '../format.tsx'
import { openSheet, setPrefs, usePhone } from '../store.ts'
import { canVibrate } from '../device/haptics.ts'
import { enableTilt, tiltController } from '../controls/TiltPad.tsx'
import { tiltSupport } from '../device/tilt.ts'
import { Token } from '../ui/Glyph.tsx'
import { IconClose, IconFeather, IconPlay, IconReconnect, IconRules, IconSpinFeather, IconStick, IconTilt, IconVibrate, IconWheel } from '../ui/Icons.tsx'
import { RuleCard } from '../ui/RulesCards.tsx'
import { ProfileScreen } from './ProfileScreen.tsx'

/** Délai avant d'afficher une coupure : une reconnexion éclair ne doit rien montrer. */
const TROUBLE_DELAY_MS = 900

export function ReconnectOverlay() {
  const t = useT()
  const conn = usePhone(s => s.conn)
  const hostOnline = usePhone(s => s.hostOnline)
  const everOnline = usePhone(s => s.everOnline)
  const troubleSince = usePhone(s => s.troubleSince)
  const [, tick] = useState(0)
  const selfLost = everOnline && (conn === 'reconnecting' || conn === 'connecting')
  const hostLost = conn === 'online' && !hostOnline && everOnline
  const visibleAt = troubleSince === null ? Infinity : troubleSince + TROUBLE_DELAY_MS
  useEffect(() => {
    if (!(selfLost || hostLost) || visibleAt === Infinity) return
    const wait = visibleAt - performance.now()
    if (wait <= 0) return
    const id = setTimeout(() => tick(v => v + 1), wait + 10)
    return () => clearTimeout(id)
  }, [selfLost, hostLost, visibleAt])
  if (!(selfLost || hostLost) || performance.now() < visibleAt) return null
  return (
    <div className="overlay overlay--dim" role="alert">
      <div className="case case--alert panel" style={{ display: 'grid', gap: 10, justifyItems: 'center' }}>
        <span className={selfLost ? 'feather-fall' : 'spin'}>{selfLost ? <IconSpinFeather size={44} /> : <IconReconnect size={40} />}</span>
        {/* équilibré : « Le vent t'a emporté… » ne laisse pas un mot seul sur la 2e ligne */}
        <h1 className="t-title" style={{ fontSize: 24, textAlign: 'center', textWrap: 'balance' }}>
          {selfLost ? t('phone.reconnect.title') : t('phone.hostAway.title')}
        </h1>
        <p className="lede">{selfLost ? t('phone.reconnect.body') : t('phone.hostAway.body')}</p>
      </div>
    </div>
  )
}

export function PauseOverlay() {
  const t = useT()
  const paused = usePhone(s => s.view?.paused ?? null)
  if (!paused) return null
  return (
    <div className="overlay overlay--dim">
      <div className="case case--title panel" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
        <h1 className="t-title" style={{ fontSize: 32 }}>
          {t('phone.pause.title')}
        </h1>
        <p className="lede" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {paused.by ? (
            <>
              <Token index={paused.by.color} size={26} /> {t('phone.pause.by', { name: paused.by.name })}
            </>
          ) : (
            t('phone.pause.byScreen')
          )}
        </p>
        {paused.canResume ? (
          <button type="button" className="btn btn--primary" onClick={() => sendAction('resume')}>
            <IconPlay size={22} /> {t('phone.pause.resume')}
          </button>
        ) : (
          <p className="muted">{t('phone.pause.waitResume')}</p>
        )}
      </div>
    </div>
  )
}

export function Toasts() {
  const t = useT()
  const toasts = usePhone(s => s.toasts)
  if (!toasts.length) return null
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(item => (
        <div key={item.id} className={`recitatif toast toast--${item.tone}`}>
          {/* {dive} / {flap} des indications : les libellés des boutons du téléphone, sauf si le PC les fournit. */}
          {t(item.key, { dive: t('phone.btn.dive').toUpperCase(), flap: t('phone.btn.flap').toUpperCase(), ...item.params })}
        </div>
      ))}
    </div>
  )
}

/** Effets visuels des événements : bordure rouge, flash blanc, tampons, compte à rebours. */
export function FxLayer() {
  const t = useT()
  const [border, setBorder] = useState(0)
  const [alert, setAlert] = useState(0)
  const [white, setWhite] = useState(0)
  const [stamp, setStamp] = useState<{ id: number; text: string; tone: 'good' | 'bad' | 'plain' } | null>(null)
  const [count, setCount] = useState<{ id: number; text: string; go: boolean } | null>(null)
  const seq = useRef(0)
  const shakeTarget = useRef<HTMLElement | null>(null)
  const screen = usePhone(s => s.view?.screen)

  // Changement d'écran : les effets de l'écran précédent (compte à rebours, tampon) disparaissent.
  useEffect(() => {
    setStamp(null)
    setCount(null)
    setAlert(0)
  }, [screen])

  useEffect(() => {
    shakeTarget.current = document.querySelector('.app')
    const clear = (setter: (v: null) => void, ms: number) => setTimeout(() => setter(null), ms)
    const onFx = (e: FxEvent) => {
      const id = ++seq.current
      if (e.kind === 'flash') {
        setBorder(id)
        return
      }
      if (e.kind !== 'cue') return
      const showStamp = (key: string, tone: 'good' | 'bad' | 'plain') => {
        setStamp({ id, text: t(key), tone })
        clear(setStamp, 950)
      }
      switch (e.cue) {
        case 'windup':
          setAlert(id)
          break
        case 'clac':
          setWhite(id)
          break
        case 'hit':
          showStamp('phone.fx.hit', 'good')
          break
        case 'stunned':
          showStamp('phone.fx.stunned', 'bad')
          shake(shakeTarget.current)
          break
        case 'dodge':
          showStamp('phone.fx.dodge', 'good')
          break
        case 'planted':
          showStamp('phone.fx.planted', 'bad')
          shake(shakeTarget.current)
          break
        case 'crown':
          showStamp('phone.fx.crown', 'good')
          break
        case 'roundWin':
          showStamp('phone.fx.win', 'good')
          break
        case 'bump':
          shake(shakeTarget.current)
          break
        case 'countdown':
          setCount({ id, text: String(e.n ?? ''), go: false })
          clear(setCount, 950)
          break
        case 'go':
          setCount({ id, text: t('phone.play.go'), go: true })
          clear(setCount, 950)
          break
        default:
          break
      }
    }
    return fx.subscribe(onFx)
    // t change avec la langue ; les effets en cours gardent leur texte.
  }, [t])

  return (
    <div className="fx" aria-hidden="true">
      <div key={`b${border}`} className={`fx__border ${border ? 'is-on' : ''}`} />
      <div key={`a${alert}`} className={`fx__alert ${alert ? 'is-on' : ''}`} />
      {alert > 0 && <Bang key={`g${alert}`} />}
      <div key={`w${white}`} className={`fx__white ${white ? 'is-on' : ''}`} />
      {stamp && (
        <div key={stamp.id} className={`fx__stamp fx__stamp--${stamp.tone}`}>
          {stamp.text}
        </div>
      )}
      {count && (
        <div key={count.id} className={`fx__count ${count.go ? 'fx__count--go' : ''}`}>
          {count.text}
        </div>
      )}
    </div>
  )
}

/** « ! » de la prise d'élan : disparaît seul après l'animation. */
function Bang() {
  const [on, setOn] = useState(true)
  useEffect(() => {
    const id = setTimeout(() => setOn(false), 620)
    return () => clearTimeout(id)
  }, [])
  return on ? <div className="fx__bang">!</div> : null
}

function shake(el: HTMLElement | null): void {
  if (!el) return
  el.classList.remove('shake')
  void el.offsetWidth
  el.classList.add('shake')
}

// ─── Réglages ──────────────────────────────────────────────────────────────

function Toggle({ on, onChange, icon, label, desc }: { on: boolean; onChange: (v: boolean) => void; icon: ReactNode; label: string; desc?: string }) {
  return (
    <div className="setting">
      <button type="button" role="switch" aria-checked={on} className={`toggle ${on ? 'is-on' : ''}`} onClick={() => onChange(!on)}>
        <span style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          {icon}
          {label}
        </span>
        <span className="toggle__sw" />
      </button>
      {desc && <p className="setting__desc">{desc}</p>}
    </div>
  )
}

export function SettingsSheet() {
  const t = useT()
  const sheet = usePhone(s => s.sheet)
  const prefs = usePhone(s => s.prefs)
  const view = usePhone(s => s.view)
  const [ruleIndex, setRuleIndex] = useState<number | null>(null)
  if (sheet === 'profile') return <ProfileScreen asSheet onDone={() => openSheet(null)} />
  if (sheet !== 'settings') return null
  const schemes: { id: ControlScheme; icon: ReactNode }[] = [
    { id: 'absolute', icon: <IconStick size={28} /> },
    { id: 'relative', icon: <IconWheel size={28} /> },
    { id: 'tilt', icon: <IconTilt size={28} /> },
  ]
  const tiltOk = tiltSupport() !== 'no'
  const chooseScheme = async (id: ControlScheme) => {
    if (id === 'tilt' && tiltSupport() === 'needs-permission') {
      // iOS : l'autorisation doit être demandée pendant ce geste.
      if (!(await enableTilt())) return
    }
    setScheme(id)
    if (id === 'tilt') tiltController().calibrate()
  }
  return (
    <div className="sheet" onPointerDown={e => e.target === e.currentTarget && openSheet(null)}>
      <div className="case case--title sheet__panel">
        <div className="sheet__head">
          <h1 className="t-title" style={{ fontSize: 22, margin: 0 }}>
            {t('phone.settings.title')}
          </h1>
          <button type="button" className="icon-btn" aria-label={t('phone.settings.close')} onClick={() => openSheet(null)}>
            <IconClose size={22} />
          </button>
        </div>
        <div className="sheet__body scrollable">
          {view && (view.screen === 'lobby' || view.screen === 'spectate') && (
            <button type="button" className="btn" style={{ justifyContent: 'flex-start' }} onClick={() => openSheet('profile')}>
              <Token index={view.you.color} size={30} /> {view.you.name} · {t('phone.settings.profile')}
            </button>
          )}
          <div className="setting">
            <h2 className="t-title" style={{ margin: 0 }}>
              {t('phone.settings.controls')}
            </h2>
            <div className="segmented" role="radiogroup">
              {schemes.map(s => (
                <button
                  key={s.id}
                  type="button"
                  role="radio"
                  aria-checked={prefs.scheme === s.id}
                  className={`btn ${prefs.scheme === s.id ? 'is-on' : ''} ${s.id === 'tilt' && !tiltOk ? 'is-disabled' : ''}`}
                  disabled={s.id === 'tilt' && !tiltOk}
                  onClick={() => void chooseScheme(s.id)}
                >
                  {s.icon}
                  {t(`phone.scheme.${s.id}`)}
                </button>
              ))}
            </div>
            <p className="setting__desc">{t(`phone.scheme.${prefs.scheme}.desc`)}</p>
          </div>
          <Toggle on={prefs.assist} onChange={setAssist} icon={<IconFeather size={26} />} label={t('phone.settings.assist')} desc={t('phone.settings.assist.desc')} />
          {canVibrate() && <Toggle on={prefs.haptics} onChange={v => setPrefs({ haptics: v })} icon={<IconVibrate size={26} />} label={t('phone.settings.haptics')} />}
          <div className="setting">
            <h2 className="t-title" style={{ margin: 0, display: 'flex', gap: 8, alignItems: 'center' }}>
              <IconRules size={22} /> {t('phone.settings.rules')}
            </h2>
            <div className="rules-grid">
              {[0, 1, 2].map(i => (
                <button key={i} type="button" className="rules-grid__item" onClick={() => setRuleIndex(ruleIndex === i ? null : i)}>
                  <RuleCard index={i} />
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
