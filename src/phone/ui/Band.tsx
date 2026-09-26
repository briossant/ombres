// Bandeau supérieur (56 px) à la couleur du joueur : identité à gauche, infos de jeu à droite.
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { PHONE_RULES } from '../../net/phoneRules.ts'
import { sendAction } from '../link.ts'
import { fx } from '../fx.ts'
import { formatPct, splitOrdinal, useLang, useT } from '../format.tsx'
import { usePhone } from '../store.ts'
import { Glyph, Token } from './Glyph.tsx'
import { IconCrown, IconEyeOff, IconFeather, IconPause } from './Icons.tsx'
import { Num, SunArc } from './bits.tsx'
import { vibrate } from '../device/haptics.ts'

export function Band({ color, name, assist, children }: { color: number; name: string; assist?: boolean; children?: ReactNode }) {
  const colorblind = usePhone(s => s.view?.colorblind ?? false)
  const ref = useRef<HTMLDivElement>(null)
  // Flash du bandeau (remplace la vibration sur iOS) : inversion de 80 ms (ART_BIBLE §8.7).
  useEffect(
    () =>
      fx.subscribe(e => {
        if (e.kind !== 'flash' || !ref.current) return
        const el = ref.current
        el.classList.add('is-flash')
        setTimeout(() => el.classList.remove('is-flash'), 80)
      }),
    [],
  )
  return (
    <div className="band" ref={ref}>
      <div className="band__id">
        <Token index={color} size={30} />
        <span className="band__name">{name}</span>
        {assist && <IconFeather className="band__assist" size={20} />}
      </div>
      {colorblind && <Glyph index={color} size={40} color="var(--pc-on)" style={{ flex: 'none' }} />}
      <div className="band__spacer" />
      {children}
    </div>
  )
}

/** Partie droite du bandeau pendant la manche : rang, part, couronne, caché, soleil, pause. */
export function PlayBandInfo() {
  const status = usePhone(s => s.status)
  const lang = useLang()
  const t = useT()
  const [rankNum, rankSuffix] = status && status.rank > 0 ? splitOrdinal(status.rank, lang) : ['–', '']
  return (
    <>
      <div className="band__status" aria-live="off">
        {status?.hidden && <IconEyeOff size={28} aria-label={t('phone.play.hidden')} />}
      </div>
      <div className="band__chip band__score" aria-label={t('phone.band.score')}>
        {status?.crown && <IconCrown className="crown-pop" size={26} />}
        <span className="band__rank t-num">
          <Num value={rankNum} />
          {rankSuffix && <sup>{rankSuffix}</sup>}
        </span>
        <span className="band__sep" />
        <span className="band__share">
          <Num value={formatPct(Math.max(0, status?.share ?? 0), lang)} />
        </span>
      </div>
      <div className="band__sunwrap" style={{ color: 'var(--pc-on)' }}>
        <SunArc u={status?.sun ?? 0} />
      </div>
      <PauseButton />
    </>
  )
}

/**
 * Portrait : le haut de l'écran est libre au-dessus des commandes, on y met le rang, la part et
 * le soleil en grand (le bandeau, trop étroit, ne garde que le nom et la pause).
 */
export function PlayInfoPanel() {
  const status = usePhone(s => s.status)
  const lang = useLang()
  const [rankNum, rankSuffix] = status && status.rank > 0 ? splitOrdinal(status.rank, lang) : ['–', '']
  return (
    <div className="case play-info" aria-hidden="true">
      <div className="play-info__rank t-num">
        {status?.crown && <IconCrown className="crown-pop" size={34} />}
        <Num value={rankNum} />
        {rankSuffix && <sup>{rankSuffix}</sup>}
      </div>
      <div className="play-info__share t-num">
        <Num value={formatPct(Math.max(0, status?.share ?? 0), lang)} />
      </div>
      <SunArc u={status?.sun ?? 0} size={70} />
    </div>
  )
}

/** Pause par appui long (RULES.pauseLongPressSeconds) : pas de pause accidentelle. */
export function PauseButton() {
  const t = useT()
  const [holding, setHolding] = useState(false)
  const [hint, setHint] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const holdMs = PHONE_RULES.pauseLongPressSeconds * 1000
  const cancel = (showHint: boolean) => {
    if (timer.current) {
      clearTimeout(timer.current)
      timer.current = null
      if (showHint) {
        setHint(true)
        if (hintTimer.current) clearTimeout(hintTimer.current)
        hintTimer.current = setTimeout(() => setHint(false), 1600)
      }
    }
    setHolding(false)
  }
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
      if (hintTimer.current) clearTimeout(hintTimer.current)
    },
    [],
  )
  return (
    <>
      <button
        type="button"
        className={`pause-btn ${holding ? 'is-holding' : ''}`}
        style={{ ['--hold' as string]: `${holdMs}ms` }}
        aria-label={t('phone.pause.hold')}
        onPointerDown={e => {
          e.currentTarget.setPointerCapture(e.pointerId)
          setHolding(true)
          setHint(false)
          timer.current = setTimeout(() => {
            timer.current = null
            setHolding(false)
            vibrate([30])
            sendAction('pause')
          }, holdMs)
        }}
        onPointerUp={() => cancel(true)}
        onPointerCancel={() => cancel(false)}
      >
        <IconPause size={22} />
        <svg className="ring" viewBox="0 0 52 52" aria-hidden="true">
          <circle cx="26" cy="26" r="24" />
        </svg>
      </button>
      {hint && <div className="pause-hint recitatif">{t('phone.pause.hold')}</div>}
    </>
  )
}
