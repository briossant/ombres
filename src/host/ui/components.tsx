// Composants de base de l'UI : cases de BD, boutons, touches, sélecteurs,
// curseurs, cadre tremblé, sablier. Tout est papier + encre (ART_BIBLE §8).
import { useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react'
import { Icon, type IconName } from './icons.tsx'
import { uiSound } from './nav.ts'

// ─── Case ──────────────────────────────────────────────────────────────────

export function Case({
  cap,
  variant,
  className,
  style,
  children,
  i,
}: {
  cap?: ReactNode
  variant?: 'title' | 'alert' | 'flat' | 'sun'
  className?: string
  style?: CSSProperties
  children?: ReactNode
  /** Rang dans la cascade d'entrée (délai). */
  i?: number
}) {
  const cls = ['case', variant ? `case--${variant}` : '', i !== undefined ? 'enter' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <div className={cls} style={i !== undefined ? ({ ...style, '--i': i } as CSSProperties) : style}>
      {cap ? <div className="case__cap">{cap}</div> : null}
      {children}
    </div>
  )
}

// ─── Bouton ────────────────────────────────────────────────────────────────

export function Btn({
  icon,
  children,
  onClick,
  primary,
  quiet,
  isDefault,
  disabled,
  hint,
  className,
  style,
  title,
  i,
}: {
  icon?: IconName
  children?: ReactNode
  onClick: () => void
  primary?: boolean
  quiet?: boolean
  /** Focus initial de la portée. */
  isDefault?: boolean
  disabled?: boolean
  /** Touche rappelée à droite du libellé (ex. <Key>Entrée</Key>). */
  hint?: ReactNode
  className?: string
  style?: CSSProperties
  title?: string
  i?: number
}) {
  const cls = ['btn', primary ? 'btn--primary' : '', quiet ? 'btn--quiet' : '', !children ? 'btn--icon' : '', i !== undefined ? 'enter' : '', className ?? ''].filter(Boolean).join(' ')
  return (
    <button
      type="button"
      className={cls}
      style={i !== undefined ? ({ ...style, '--i': i } as CSSProperties) : style}
      data-nav=""
      data-nav-default={isDefault ? '' : undefined}
      disabled={disabled}
      title={title}
      aria-label={!children ? title : undefined}
      onClick={() => {
        if (!disabled) onClick()
      }}
    >
      {icon ? <Icon name={icon} size={primary ? 38 : children ? 32 : 28} stroke={primary ? 2 : 1.9} /> : null}
      {children ? <span className="btn__label">{children}</span> : null}
      {hint ? <span className="btn__hint">{hint}</span> : null}
    </button>
  )
}

// ─── Touche ────────────────────────────────────────────────────────────────

export function Key({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <kbd className="key" style={style}>
      {children}
    </kbd>
  )
}

// ─── Sélecteur segmenté (un seul arrêt de focus, ←/→ change la valeur) ────

export interface Option<T> {
  value: T
  label: ReactNode
}

export function Segmented<T extends string | number | boolean>({
  value,
  options,
  onChange,
  label,
  icon,
  isDefault,
  className,
  compact,
}: {
  value: T
  options: readonly Option<T>[]
  onChange: (v: T) => void
  label?: ReactNode
  icon?: IconName
  isDefault?: boolean
  className?: string
  compact?: boolean
}) {
  const idx = Math.max(
    0,
    options.findIndex(o => o.value === value),
  )
  // son de bascule (ajout qa) : hauteur selon la position de l'option
  const change = (v: T) => {
    if (v === value) return
    uiSound('toggle', options.findIndex(o => o.value === v) / Math.max(1, options.length - 1))
    onChange(v)
  }
  const step = (d: number) => {
    const next = options[Math.min(options.length - 1, Math.max(0, idx + d))]
    if (next && next.value !== value) change(next.value)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') {
      e.preventDefault()
      step(-1)
    } else if (e.code === 'ArrowRight') {
      e.preventDefault()
      step(1)
    }
  }
  return (
    <div
      className={['row', compact ? 'row--compact' : '', className ?? ''].filter(Boolean).join(' ')}
      tabIndex={0}
      role="radiogroup"
      data-nav=""
      data-nav-own="x"
      data-nav-default={isDefault ? '' : undefined}
      onKeyDown={onKeyDown}
      onClick={e => {
        // Entrée (clic synthétique sur la ligne) : option suivante, en boucle.
        if (e.target === e.currentTarget) change(options[(idx + 1) % options.length].value)
      }}
    >
      {label ? (
        <span className="row__label">
          {icon ? <Icon name={icon} size={30} /> : null}
          {label}
        </span>
      ) : null}
      <span className="seg">
        {options.map((o, k) => (
          <span
            key={String(o.value)}
            role="radio"
            aria-checked={k === idx}
            className={k === idx ? 'seg__opt is-on' : 'seg__opt'}
            onClick={e => {
              e.stopPropagation()
              change(o.value)
            }}
          >
            {o.label}
          </span>
        ))}
      </span>
    </div>
  )
}

// ─── Curseur de volume (←/→ par pas de 10 %, glisser à la souris) ─────────

export function Slider({ value, onChange, label, icon, isDefault }: { value: number; onChange: (v: number) => void; label: ReactNode; icon?: IconName; isDefault?: boolean }) {
  const track = useRef<HTMLSpanElement>(null)
  const set = (v: number) => {
    const next = Math.round(Math.min(1, Math.max(0, v)) * 20) / 20
    if (next === value) return
    uiSound('slider', next)
    onChange(next)
  }
  const onKeyDown = (e: KeyboardEvent) => {
    if (e.code === 'ArrowLeft') {
      e.preventDefault()
      set(value - 0.1)
    } else if (e.code === 'ArrowRight') {
      e.preventDefault()
      set(value + 0.1)
    }
  }
  const fromPointer = (e: PointerEvent) => {
    const r = track.current?.getBoundingClientRect()
    if (!r) return
    set((e.clientX - r.left) / r.width)
  }
  const pct = Math.round(value * 100)
  return (
    <div className="row" tabIndex={0} role="slider" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} data-nav="" data-nav-own="x" data-nav-default={isDefault ? '' : undefined} onKeyDown={onKeyDown}>
      <span className="row__label">
        {icon ? <Icon name={icon} size={30} /> : null}
        {label}
      </span>
      <span
        className="slider"
        onPointerDown={e => {
          ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
          fromPointer(e)
        }}
        onPointerMove={e => {
          if (e.buttons & 1) fromPointer(e)
        }}
      >
        <span className="slider__track" ref={track}>
          {Array.from({ length: 11 }, (_, k) => (
            <span key={k} className={k % 5 === 0 ? 'slider__tick slider__tick--major' : 'slider__tick'} style={{ left: `${k * 10}%` }} />
          ))}
          <span className="slider__fill" style={{ width: `${pct}%` }} />
          <span className="slider__knob" style={{ left: `${pct}%` }} />
        </span>
        <span className="slider__value t-num">{pct}</span>
      </span>
    </div>
  )
}

// ─── Cadre tremblé (grands panneaux : ART_BIBLE §8.2) ──────────────────────

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 4294967296
  }
}

/** Trait d'un côté avec léger tremblé et dépassement aux coins (trait de BD). */
function wobblySide(x0: number, y0: number, x1: number, y1: number, rnd: () => number, amp: number): string {
  const len = Math.hypot(x1 - x0, y1 - y0)
  const ux = (x1 - x0) / len
  const uy = (y1 - y0) / len
  const nx = -uy
  const ny = ux
  const o0 = 2 + rnd() * 5
  const o1 = 2 + rnd() * 5
  const n = Math.max(2, Math.round(len / 70))
  const phase = rnd() * Math.PI * 2
  const pts: string[] = []
  for (let k = 0; k <= n; k++) {
    const t = k / n
    const along = -o0 + t * (len + o0 + o1)
    const off = Math.sin(phase + t * Math.PI * (1.2 + rnd() * 0.3)) * amp + (rnd() - 0.5) * amp * 0.6
    pts.push(`${(x0 + ux * along + nx * off).toFixed(1)} ${(y0 + uy * along + ny * off).toFixed(1)}`)
  }
  return 'M' + pts.join('L')
}

/**
 * Cadre SVG « pré-tracé à la main » : fond papier, ombre décalée pleine,
 * quatre traits qui débordent légèrement aux coins. Le contenu se place dessus.
 */
export function HandFrame({ seed = 7, weight = 3, shadow = 8, fill = 'var(--paper)', className, style, children }: { seed?: number; weight?: number; shadow?: number; fill?: string; className?: string; style?: CSSProperties; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const measure = () => setSize({ w: el.offsetWidth, h: el.offsetHeight })
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const paths = useMemo(() => {
    if (!size) return null
    const { w, h } = size
    const rnd = rng(seed * 7919 + Math.round(w) * 31 + Math.round(h))
    const j = () => (rnd() - 0.5) * 2.2
    const c = [
      [j(), j()],
      [w + j(), j()],
      [w + j(), h + j()],
      [j(), h + j()],
    ] as const
    const body = `M${c[0][0]} ${c[0][1]}L${c[1][0]} ${c[1][1]}L${c[2][0]} ${c[2][1]}L${c[3][0]} ${c[3][1]}Z`
    const amp = 0.9
    const sides = [wobblySide(c[0][0], c[0][1], c[1][0], c[1][1], rnd, amp), wobblySide(c[1][0], c[1][1], c[2][0], c[2][1], rnd, amp), wobblySide(c[2][0], c[2][1], c[3][0], c[3][1], rnd, amp), wobblySide(c[3][0], c[3][1], c[0][0], c[0][1], rnd, amp)]
    return { body, sides }
  }, [size, seed])
  return (
    <div ref={ref} className={className ? `hand-frame ${className}` : 'hand-frame'} style={style}>
      {paths && size ? (
        <svg className="hand-frame__svg" width={size.w} height={size.h} aria-hidden>
          {shadow > 0 ? <path d={paths.body} transform={`translate(${shadow} ${shadow})`} fill="var(--drop)" /> : null}
          <path d={paths.body} fill={fill} />
          {paths.sides.map((d, k) => (
            <path key={k} d={d} fill="none" stroke="var(--ink)" strokeWidth={weight} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      ) : null}
      <div className="hand-frame__content">{children}</div>
    </div>
  )
}

// ─── Sablier (minuterie qui se vide) ───────────────────────────────────────

/** Barre de sable qui se vide jusqu'à `deadline` (performance.now, ms). */
export function SandTimer({ deadline, total, className }: { deadline: number | null; total: number; className?: string }) {
  const [now, setNow] = useState(() => performance.now())
  useLayoutEffect(() => {
    if (deadline === null) return
    let raf = 0
    const tick = () => {
      setNow(performance.now())
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [deadline])
  if (deadline === null) return null
  const left = Math.max(0, deadline - now)
  const frac = Math.min(1, left / (total * 1000))
  return (
    <span className={className ? `sand-timer ${className}` : 'sand-timer'}>
      <span className="sand-timer__fill" style={{ transform: `scaleX(${frac})` }} />
    </span>
  )
}

/** Secondes restantes avant `deadline`, rafraîchi 4 fois par seconde. */
export function useSecondsLeft(deadline: number | null): number | null {
  const [now, setNow] = useState(() => performance.now())
  useLayoutEffect(() => {
    if (deadline === null) return
    const id = setInterval(() => setNow(performance.now()), 250)
    return () => clearInterval(id)
  }, [deadline])
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - now) / 1000))
}
