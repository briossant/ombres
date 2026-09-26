// La manette : joystick flottant (moitié gauche), PLONGER (maintenu) et COUP D'AILE (appui),
// ou niveau à bulle en mode Inclinaison. Multi-touch simultané (Pointer Events, un pointeur
// par commande). Tout retour visuel est local et immédiat : le réseau ne ralentit jamais le pouce.
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react'
import { BTN_DIVE, BTN_FLAP } from '../../shared/messages.ts'
import { PHONE_RULES } from '../../net/phoneRules.ts'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { getClient } from '../link.ts'
import { fx } from '../fx.ts'
import { inkOn, useT } from '../format.tsx'
import { usePhone } from '../store.ts'
import { TiltPad } from './TiltPad.tsx'

const R = PHONE_RULES.joystickRadiusPx

export interface ControllerProps {
  /** Salon : indications d'apprentissage et détection locale des micro-objectifs. */
  practice?: boolean
  /** Commandes désactivées (décroché). */
  disabled?: boolean
  /** Position de repos du joystick, en fraction de la largeur de sa zone. */
  restX?: number
}

export function Controller({ practice = false, disabled = false, restX = 0.5 }: ControllerProps) {
  const scheme = usePhone(s => s.prefs.scheme)
  const style = {
    '--stick-r': `${R}px`,
    '--dive-frac': PHONE_RULES.buttonDiveHeightFrac,
    '--flap-frac': PHONE_RULES.buttonFlapHeightFrac,
  } as CSSProperties
  // Quitter l'écran (ou la page) relâche tout : l'oiseau ne reste pas bloqué en piqué.
  useEffect(() => () => getClient()?.releaseAll(), [])
  return (
    <div className={`ctl ${disabled ? 'is-stunned' : ''}`} style={style}>
      {scheme === 'tilt' ? <TiltPad /> : <Joystick relative={scheme === 'relative'} practice={practice} restX={restX} />}
      <FlapButton />
      <DiveButton practice={practice} />
    </div>
  )
}

// ─── Joystick flottant ─────────────────────────────────────────────────────

function Joystick({ relative, practice, restX }: { relative: boolean; practice: boolean; restX: number }) {
  const t = useT()
  const touched = usePhone(s => s.touchedStick)
  const zone = useRef<HTMLDivElement>(null)
  const stick = useRef<HTMLDivElement>(null)
  const knob = useRef<HTMLDivElement>(null)
  const active = useRef<{ id: number; cx: number; cy: number } | null>(null)
  const vec = useRef({ x: 0, y: 0 })
  const [rest, setRest] = useState({ x: 0, y: 0 })

  // Position de repos : au centre de la zone (affichée en fantôme).
  useLayoutEffect(() => {
    const el = zone.current
    if (!el) return
    const update = () => {
      const x = Math.max(R + 16, el.clientWidth * restX)
      const y = Math.min(el.clientHeight - R - 16, Math.max(R + 16, el.clientHeight * 0.56))
      setRest({ x, y })
    }
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [restX])

  const place = (cx: number, cy: number, kx: number, ky: number) => {
    if (stick.current) stick.current.style.transform = `translate(${cx}px, ${cy}px)`
    if (knob.current) knob.current.style.transform = `translate(${kx}px, ${ky}px)`
  }

  useLayoutEffect(() => {
    if (!active.current) place(rest.x, rest.y, 0, 0)
  }, [rest])

  // Micro-objectif « Vole » : temps cumulé hors zone morte, compté localement pour un retour immédiat.
  useEffect(() => {
    if (!practice) return
    let flown = 0
    const id = setInterval(() => {
      const s = usePhone.getState()
      if (s.localGoals.fly) return
      if (Math.hypot(vec.current.x, vec.current.y) >= PHONE_RULES.stickDeadzone) flown += 0.1
      if (flown >= PHONE_RULES.lobbyGoalFlySeconds) usePhone.setState({ localGoals: { ...s.localGoals, fly: true } })
    }, 100)
    return () => clearInterval(id)
  }, [practice])

  const send = (x: number, y: number) => {
    vec.current = { x, y }
    getClient()?.setStick(x, y)
  }

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (active.current || !zone.current) return
    e.preventDefault()
    zone.current.setPointerCapture(e.pointerId)
    const rect = zone.current.getBoundingClientRect()
    const cx = e.clientX - rect.left
    const cy = e.clientY - rect.top
    active.current = { id: e.pointerId, cx, cy }
    stick.current?.classList.remove('is-idle')
    place(cx, cy, 0, 0)
    send(0, 0)
    if (!usePhone.getState().touchedStick) usePhone.setState({ touchedStick: true })
  }

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = active.current
    if (!a || e.pointerId !== a.id || !zone.current) return
    const rect = zone.current.getBoundingClientRect()
    const px = e.clientX - rect.left
    const py = e.clientY - rect.top
    let dx = px - a.cx
    let dy = relative ? 0 : py - a.cy
    const d = Math.hypot(dx, dy)
    if (d > R) {
      // Le socle suit le pouce qui dépasse : pas besoin de revenir au centre.
      const k = (d - R) / d
      a.cx += dx * k
      if (!relative) a.cy += dy * k
      dx = px - a.cx
      dy = relative ? 0 : py - a.cy
    }
    place(a.cx, a.cy, dx, dy)
    send(dx / R, -dy / R)
  }

  const onUp = (e: React.PointerEvent<HTMLDivElement>) => {
    const a = active.current
    if (!a || e.pointerId !== a.id) return
    active.current = null
    stick.current?.classList.add('is-idle')
    place(rest.x, rest.y, 0, 0)
    send(0, 0)
  }

  return (
    <div className="stick-zone" ref={zone} onPointerDown={onDown} onPointerMove={onMove} onPointerUp={onUp} onPointerCancel={onUp} onLostPointerCapture={onUp}>
      <div className={`stick is-idle ${relative ? 'stick--relative' : ''}`} ref={stick} style={{ left: 0, top: 0 }}>
        <div className="stick__base" />
        <div className="stick__dead" />
        {relative && (
          <svg className="stick__arrows" viewBox="0 0 140 140" aria-hidden="true">
            <path d="M22 70 l14 -12 v24 z M118 70 l-14 -12 v24 z" fill="currentColor" />
          </svg>
        )}
        <div className="stick__knob" ref={knob} />
      </div>
      {practice && !touched && (
        <div className="stick-hint recitatif" style={{ left: rest.x, top: rest.y }}>
          {relative ? t('phone.relative.hint') : t('phone.lobby.thumbHere')}
        </div>
      )}
    </div>
  )
}

// ─── Boutons ───────────────────────────────────────────────────────────────

/** Capture d'un pointeur par bouton : appui immédiat, relâché sûr (y compris si le doigt glisse dehors). */
function usePressable(onChange: (down: boolean) => void) {
  const pointer = useRef<number | null>(null)
  const ref = useRef<HTMLDivElement>(null)
  const release = () => {
    if (pointer.current === null) return
    pointer.current = null
    ref.current?.classList.remove('is-down')
    onChange(false)
  }
  return {
    ref,
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (pointer.current !== null) return
      e.preventDefault()
      pointer.current = e.pointerId
      e.currentTarget.setPointerCapture(e.pointerId)
      e.currentTarget.classList.add('is-down')
      onChange(true)
    },
    onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === pointer.current) release()
    },
    onPointerCancel: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === pointer.current) release()
    },
    onLostPointerCapture: (e: React.PointerEvent<HTMLDivElement>) => {
      if (e.pointerId === pointer.current) release()
    },
  }
}

/** Étoile d'encre à 8 rayons derrière « PIQUER » (ART_BIBLE §8.7). */
function InkStar() {
  const rays = []
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4
    rays.push(
      <path
        key={i}
        d={`M${50 + Math.cos(a) * 36} ${50 + Math.sin(a) * 36} L${50 + Math.cos(a) * 49} ${50 + Math.sin(a) * 49}`}
        stroke="currentColor"
        strokeWidth={i % 2 ? 2.5 : 4}
        strokeLinecap="round"
      />,
    )
  }
  return (
    <svg className="act__star" viewBox="0 0 100 100" aria-hidden="true">
      {rays}
    </svg>
  )
}

/**
 * Icône de PLONGER : l'oiseau et son ombre. Bas = petite ombre dense, haut = grande ombre pâle
 * (la règle 2 dessinée dans le bouton). Animée localement à la vitesse de montée / descente.
 */
function AltitudeIcon({ low }: { low: boolean }) {
  const span = PHONE_RULES.altHigh - PHONE_RULES.altLow
  const dur = low ? span / PHONE_RULES.descendRate : span / PHONE_RULES.climbRate
  const tr = `${dur.toFixed(2)}s cubic-bezier(.3,.1,.3,1)`
  return (
    <svg className="act__icon" viewBox="0 0 60 44" aria-hidden="true" style={{ overflow: 'visible' }}>
      <ellipse
        cx="30"
        cy="38"
        rx={low ? 9 : 19}
        ry={low ? 3.2 : 5.2}
        fill="#A18EA1"
        opacity={low ? 0.9 : 0.42}
        style={{ transition: `rx ${tr}, ry ${tr}, opacity ${tr}` }}
      />
      <g style={{ transform: `translateY(${low ? 18 : 0}px)`, transition: `transform ${tr}` }}>
        <path
          d="M30 8 C26 3 18 1 8 4 C16 6 22 9 26 13 L30 16 L34 13 C38 9 44 6 52 4 C42 1 34 3 30 8 Z"
          fill="#EDEDDF"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path d="M30 8 L30 16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </g>
    </svg>
  )
}

function DiveButton({ practice }: { practice: boolean }) {
  const t = useT()
  const target = usePhone(s => s.status?.target ?? -1)
  const diving = usePhone(s => s.status?.diving ?? false)
  const [held, setHeld] = useState(false)
  const holdTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const press = usePressable(down => {
    getClient()?.setButton(BTN_DIVE, down)
    setHeld(down)
    if (down) fx.press('dive')
    // Micro-objectif « Plonge » : PLONGER maintenu d'affilée.
    if (holdTimer.current) clearTimeout(holdTimer.current)
    holdTimer.current = null
    if (down && practice)
      holdTimer.current = setTimeout(() => {
        const s = usePhone.getState()
        if (!s.localGoals.dive) usePhone.setState({ localGoals: { ...s.localGoals, dive: true } })
      }, PHONE_RULES.lobbyGoalDiveHoldSeconds * 1000)
  })
  useEffect(() => () => void (holdTimer.current && clearTimeout(holdTimer.current)), [])
  const targetColor = target >= 0 ? PLAYER_COLORS[target] : undefined
  const style = targetColor ? ({ '--target': targetColor.hex, '--target-on': inkOn(targetColor.index) } as CSSProperties) : undefined
  const label = targetColor ? t('phone.btn.strike') : diving ? t('phone.btn.diving') : t('phone.btn.dive')
  return (
    <div
      className={`act act--dive ${targetColor ? 'is-target' : ''} ${diving ? 'is-diving' : ''}`}
      role="button"
      aria-label={label}
      style={style}
      {...press}
    >
      {targetColor ? <InkStar /> : <AltitudeIcon low={held} />}
      <span className="act__label">{label}</span>
    </div>
  )
}

/** Icône du COUP D'AILE : l'oiseau vu de face, ailes levées en plein battement, traits de vitesse. */
function FlapIcon() {
  const wing = 'M28 25 C22 17 14 10 3 7 C6 11 7 13 9 14 C8 14.5 8 15 11 17 C10 17.5 11 18.5 14 20 C13 20.8 15 21.8 18 22.5 C18 23.5 21 24.5 24 26 Z'
  return (
    <svg className="act__icon" viewBox="0 0 60 44" aria-hidden="true" style={{ overflow: 'visible' }}>
      <path d={wing} fill="#EDEDDF" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path d={wing} transform="translate(60 0) scale(-1 1)" fill="#EDEDDF" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <ellipse cx="30" cy="27" rx="3.6" ry="7" fill="#EDEDDF" stroke="currentColor" strokeWidth="2" />
      <path d="M8 31 q5 5 12 4 M52 31 q-5 5 -12 4 M17 38 q5 3 9 2 M43 38 q-5 3 -9 2" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

const RING_R = 50
const RING_C = 2 * Math.PI * RING_R

function FlapButton() {
  const t = useT()
  const ringRef = useRef<SVGCircleElement>(null)
  const readyAt = useRef(0)
  const [charging, setCharging] = useState(false)
  const [urgent, setUrgent] = useState(false)
  const [callout, setCallout] = useState(false)
  const btn = useRef<HTMLDivElement | null>(null)
  const raf = useRef(0)
  const cdMs = PHONE_RULES.flapCooldown * 1000

  const animate = () => {
    cancelAnimationFrame(raf.current)
    const step = () => {
      const left = readyAt.current - performance.now()
      const k = left <= 0 ? 1 : 1 - left / cdMs
      if (ringRef.current) ringRef.current.style.strokeDashoffset = String(RING_C * (1 - Math.max(0, Math.min(1, k))))
      if (left > 0) raf.current = requestAnimationFrame(step)
      else {
        setCharging(false)
        const el = btn.current
        if (el) {
          el.classList.remove('is-ready-pop')
          void el.offsetWidth
          el.classList.add('is-ready-pop')
        }
      }
    }
    step()
  }

  // Correction par le PC : la recharge réelle (flapCd) l'emporte, sauf juste après un appui local
  // que le PC n'a pas encore vu.
  useEffect(
    () =>
      usePhone.subscribe((s, prev) => {
        if (s.status === prev.status || !s.status) return
        const hostReadyAt = s.statusAt + s.status.flapCd * 1000
        const recentLocal = performance.now() - s.flapPressedAt < 350
        if (s.status.flapCd > 0 || !recentLocal) {
          if (Math.abs(hostReadyAt - readyAt.current) > 120) {
            readyAt.current = hostReadyAt
            const isCharging = hostReadyAt > performance.now()
            setCharging(isCharging)
            animate()
          }
        }
      }),
    [],
  )

  useEffect(() => {
    let urgentTimer: ReturnType<typeof setTimeout> | null = null
    let calloutTimer: ReturnType<typeof setTimeout> | null = null
    const off = fx.subscribe(e => {
      if (e.kind !== 'cue') return
      if (e.cue === 'windup' || e.cue === 'clac') {
        setUrgent(true)
        if (urgentTimer) clearTimeout(urgentTimer)
        urgentTimer = setTimeout(() => setUrgent(false), e.cue === 'windup' ? 1400 : 700)
      }
      if (e.cue === 'clac') {
        setCallout(true)
        if (calloutTimer) clearTimeout(calloutTimer)
        calloutTimer = setTimeout(() => setCallout(false), 800)
      }
      if (e.cue === 'dodge' || e.cue === 'stunned') {
        setUrgent(false)
        setCallout(false)
      }
    })
    return () => {
      off()
      if (urgentTimer) clearTimeout(urgentTimer)
      if (calloutTimer) clearTimeout(calloutTimer)
      cancelAnimationFrame(raf.current)
    }
  }, [])

  const press = usePressable(down => {
    getClient()?.setButton(BTN_FLAP, down)
    if (!down) return
    const now = performance.now()
    if (readyAt.current <= now) {
      // Prédiction locale : la recharge démarre sous le pouce, sans attendre le PC.
      fx.press('flap')
      readyAt.current = now + cdMs
      usePhone.setState({ flapPressedAt: now })
      setCharging(true)
      setUrgent(false)
      animate()
    }
  })

  return (
    <>
      <div
        className={`act act--flap ${charging ? 'is-charging' : ''} ${urgent && !charging ? 'is-urgent' : ''}`}
        role="button"
        aria-label={t('phone.btn.flap')}
        {...press}
        ref={el => {
          btn.current = el
          press.ref.current = el
        }}
      >
        <svg className="act__ring" viewBox="0 0 112 112" aria-hidden="true">
          <circle className="track" cx="56" cy="56" r={RING_R} />
          <circle ref={ringRef} className="fill" cx="56" cy="56" r={RING_R} strokeDasharray={RING_C} strokeDashoffset={0} />
        </svg>
        <FlapIcon />
        <span className="act__label">{t('phone.btn.flapShort')}</span>
      </div>
      {callout && <div className="act-callout recitatif">{t('phone.play.clac')}</div>}
    </>
  )
}
