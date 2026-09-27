// Page de dev : les cartons de la bande-annonce (dev/trailer.html?card=<id>), dans le style du jeu
// (papier, encre, cases de BD, Julius Sans One / Patrick Hand SC / Averia Sans Libre, logo du jeu).
// Tout est piloté par performance.now() (l'horloge virtuelle de tools/trailer/cards.mjs l'avance image par
// image) : aucune transition CSS, chaque image est une fonction du temps.
// window.__card = { id, dur, ready } ; fond transparent sauf planche « howto » (papier, cases percées).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { flushSync } from 'react-dom'
import '../../host/ui/styles/base.css'
import { preloadUiFonts } from '../../host/ui/fonts.ts'
import { Logo } from '../../host/ui/Logo.tsx'
import { Token } from '../../host/ui/glyphs.tsx'
import { PLAYER_COLORS } from '../../shared/players.ts'
import { CARDS, CREDIT_TEXT, LAYOUT, URL_TEXT, type CardPos, type CardSpec } from './cards.ts'

declare global {
  interface Window {
    __card?: { id: string; dur: number; ready: boolean }
  }
}

const Q = new URLSearchParams(location.search)
const ID = Q.get('card') ?? 'recit-noon'
const SPEC: CardSpec = CARDS[ID] ?? CARDS['recit-noon']!

const clamp01 = (x: number) => Math.min(1, Math.max(0, x))
const easeOut = (x: number) => 1 - Math.pow(1 - clamp01(x), 3)
/** Entrée (glissement de 12 px + fondu, 220 ms, bible §8.6) et sortie (160 ms) d'un élément. */
function enterExit(t: number, t0: number, dur: number, dy = 14): CSSProperties {
  const a = easeOut((t - t0) / 0.22)
  const out = clamp01((t - (dur - 0.2)) / 0.2)
  return { opacity: a * (1 - out), transform: `translateY(${((1 - a) * dy).toFixed(2)}px)` }
}
/** Essuyage d'encre de gauche à droite (récitatif, bible §8.6). */
const wipe = (t: number, t0: number, d = 0.32): CSSProperties => ({ clipPath: `inset(-20px ${(100 - easeOut((t - t0) / d) * 100).toFixed(2)}% -20px -20px)` })

function useClock(): number {
  const [t, setT] = useState(0)
  useEffect(() => {
    const t0 = performance.now()
    let raf = 0
    const loop = () => {
      raf = requestAnimationFrame(loop)
      flushSync(() => setT((performance.now() - t0) / 1000))
    }
    raf = requestAnimationFrame(loop)
    return () => cancelAnimationFrame(raf)
  }, [])
  return t
}

// ─── Récitatif ────────────────────────────────────────────────────────────
function Recit({ t, spec }: { t: number; spec: Extract<CardSpec, { kind: 'recit' }> }) {
  const parts = spec.text.split('{color}')
  const c = spec.colorIndex !== undefined ? PLAYER_COLORS[spec.colorIndex] : undefined
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 84, display: 'flex', justifyContent: 'center' }}>
      <p style={{ ...S.recit, ...enterExit(t, 0, spec.dur, 8), ...wipe(t, 0.02) }}>
        {parts[0]}
        {c && parts.length > 1 ? (
          <span style={{ color: c.text, whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 12 }}>
            <Token colorIndex={c.index} size={46} style={{ transform: 'translateY(2px)' }} />
            {spec.colorWord}
          </span>
        ) : null}
        {parts[1] ?? ''}
      </p>
    </div>
  )
}

// ─── Légende en case ──────────────────────────────────────────────────────
const POS: Record<CardPos, CSSProperties> = {
  tl: { left: 96, top: 92, alignItems: 'flex-start' },
  tr: { right: 96, top: 92, alignItems: 'flex-end' },
  bl: { left: 96, bottom: 104, alignItems: 'flex-start' },
  br: { right: 96, bottom: 104, alignItems: 'flex-end' },
  bc: { left: 0, right: 0, bottom: 110, alignItems: 'center' },
  tc: { left: 0, right: 0, top: 92, alignItems: 'center' },
}
function Caption({ t, spec }: { t: number; spec: Extract<CardSpec, { kind: 'caption' }> }) {
  return (
    <div style={{ position: 'absolute', display: 'flex', flexDirection: 'column', gap: 18, ...POS[spec.pos] }}>
      {spec.lines.map((l, i) => (
        <div key={i} className="case case--title" style={{ ...S.capBox, ...enterExit(t, l.at, spec.dur) }}>
          <span style={{ ...S.capText, ...(l.small ? { fontSize: 52 } : null), ...wipe(t, l.at + 0.05, 0.4) }}>{l.text}</span>
        </div>
      ))}
    </div>
  )
}

// ─── Planche « comment jouer » ────────────────────────────────────────────
/** Papier plein, percé de trous (les images passent dessous) : masque SVG. */
function PaperWithHoles({ holes, children }: { holes: { x: number; y: number; w: number; h: number; r: number }[]; children?: ReactNode }) {
  return (
    <svg width={1920} height={1080} style={{ position: 'absolute', inset: 0 }}>
      <defs>
        <mask id="holes">
          <rect width={1920} height={1080} fill="#fff" />
          {holes.map((h, i) => (
            <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={h.r} fill="#000" />
          ))}
        </mask>
        <filter id="grain" x="0" y="0" width="100%" height="100%">
          <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves={2} seed={4} result="n" />
          <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.17  0 0 0 0 0.11  0 0 0 0 0.14  0 0 0 0.05 0" />
        </filter>
      </defs>
      <g mask="url(#holes)">
        <rect width={1920} height={1080} fill="#F7F0E3" />
        <rect width={1920} height={1080} filter="url(#grain)" />
        {children}
      </g>
    </svg>
  )
}

function Howto({ t, spec }: { t: number; spec: Extract<CardSpec, { kind: 'howto' }> }) {
  const { tv, phone } = LAYOUT.howto
  const panel = (r: { x: number; y: number; w: number; h: number }, k: number): CSSProperties => ({
    position: 'absolute',
    left: r.x - 3,
    top: r.y - 3,
    width: r.w,
    height: r.h,
    border: '3px solid var(--ink)',
    boxShadow: `${7}px ${7}px 0 var(--drop)`,
    borderRadius: 3,
    opacity: easeOut((t - k * 0.12) / 0.25),
  })
  const tags: { text: string; at: number; style: CSSProperties }[] = [
    { text: 'Scan the QR code', at: 0.5, style: { left: tv.x + 26, top: tv.y - 58 } },
    { text: 'Join in seconds', at: 1.4, style: { left: phone.x + 20, top: phone.y - 58 } },
  ]
  const big: { text: string; at: number; num?: string }[] = [
    { text: 'Your phone is the controller', at: 2.2 },
    { num: '1–12', text: 'players', at: 3.0 },
    { text: 'No app, no install', at: 3.7 },
    { text: 'Free in your browser', at: 4.4 },
  ]
  return (
    <>
      <PaperWithHoles holes={[{ ...tv, r: 3 }, { ...phone, r: 3 }]} />
      <div className="case__cap" style={{ ...S.pageTitle, opacity: easeOut(t / 0.3) }}>
        Grab your phones
      </div>
      <div style={panel(tv, 0)} />
      <div style={panel(phone, 1)} />
      {tags.map((g, i) => (
        <div key={i} className="case__cap" style={{ ...S.tag, ...g.style, ...enterExit(t, g.at, spec.dur, 8) }}>
          {g.text}
        </div>
      ))}
      <div style={{ position: 'absolute', left: phone.x - 3, top: phone.y + phone.h + 56, width: phone.w + 6, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 20 }}>
        {big.map((b, i) => (
          <div key={i} className="case" style={{ ...S.fact, ...enterExit(t, b.at, spec.dur) }}>
            <span style={wipe(t, b.at + 0.05, 0.35)}>
              {b.num ? <span style={S.factNum}>{b.num} </span> : null}
              {b.text}
            </span>
          </div>
        ))}
      </div>
    </>
  )
}

// ─── Carton final ─────────────────────────────────────────────────────────
function Final({ t, spec }: { t: number; spec: Extract<CardSpec, { kind: 'final' }> }) {
  return (
    <>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 118, display: 'flex', justifyContent: 'center', ...enterExit(t, 0, 99, 16) }}>
        <div style={{ transform: 'scale(1.12)', transformOrigin: '50% 0' }}>
          <Logo />
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 560, display: 'flex', justifyContent: 'center', ...enterExit(t, 0.5, 99) }}>
        <div className="case" style={S.pitch}>
          <span style={wipe(t, 0.55, 0.45)}>A party game for 1–12 players · your phone is the controller</span>
        </div>
      </div>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 700, display: 'flex', justifyContent: 'center', ...enterExit(t, 1.1, 99) }}>
        <div className="case case--title case--sun" style={S.urlBox}>
          <span style={S.urlLead}>Play free in your browser</span>
          <span style={{ ...S.url, ...wipe(t, 1.2, 0.5) }}>{URL_TEXT}</span>
        </div>
      </div>
      {spec.credit ? (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 58, display: 'flex', justifyContent: 'center', ...enterExit(t, 1.9, 99, 8) }}>
          <div className="case case--flat" style={S.credit}>
            {CREDIT_TEXT}
          </div>
        </div>
      ) : null}
    </>
  )
}

// ─── Version verticale ────────────────────────────────────────────────────
function Vertical({ t, spec }: { t: number; spec: Extract<CardSpec, { kind: 'vertical' }> }) {
  const L = LAYOUT.vertical
  const beat = [...spec.beats].reverse().find((b) => t >= b.at) ?? spec.beats[0]!
  const next = spec.beats[spec.beats.indexOf(beat) + 1]
  const end = next ? next.at : spec.dur
  const showPhone = !!beat.phone
  const holes = [{ ...L.main, r: 3 }, ...(showPhone ? [{ ...L.phoneScreen, r: LAYOUT.phone.screenRadius }] : [])]
  return (
    <div style={{ position: 'absolute', left: 0, top: 0, width: L.w, height: L.h }}>
      <svg width={L.w} height={L.h} style={{ position: 'absolute', inset: 0 }}>
        <defs>
          <mask id="vholes">
            <rect width={L.w} height={L.h} fill="#fff" />
            {holes.map((h, i) => (
              <rect key={i} x={h.x} y={h.y} width={h.w} height={h.h} rx={h.r} fill="#000" />
            ))}
          </mask>
        </defs>
        <g mask="url(#vholes)">
          <rect width={L.w} height={L.h} fill="#F7F0E3" />
        </g>
      </svg>
      <div style={{ position: 'absolute', left: 0, right: 0, top: 36, display: 'flex', justifyContent: 'center' }}>
        <div style={{ transform: 'scale(0.86)', transformOrigin: '50% 0' }}>
          <Logo />
        </div>
      </div>
      <div style={{ position: 'absolute', left: L.main.x - 3, top: L.main.y - 3, width: L.main.w, height: L.main.h, border: '3px solid var(--ink)', borderRadius: 3, boxShadow: '8px 8px 0 var(--drop)' }} />
      {showPhone ? (
        <div style={{ position: 'absolute', left: L.phoneBody.x, top: L.phoneBody.y, ...enterExit(t, beat.at, end, 10) }}>
          <PhoneFrame />
        </div>
      ) : null}
      <div style={{ position: 'absolute', left: 0, right: 0, top: showPhone ? 1180 : 1230, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
        {beat.lines.map((l, i) => (
          <div key={`${beat.at}-${i}`} className="case case--title" style={{ ...S.capBox, ...enterExit(t, beat.at + 0.1 + i * 0.35, end - beat.at + beat.at, 10) }}>
            <span style={{ ...S.capText, fontSize: 60, ...wipe(t, beat.at + 0.15 + i * 0.35, 0.4) }}>{l}</span>
          </div>
        ))}
      </div>
      {beat.final ? (
        <div style={{ position: 'absolute', left: 0, right: 0, top: 1210, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 34 }}>
          <div className="case" style={{ ...S.pitch, fontSize: 46, ...enterExit(t, beat.at, 99) }}>1–12 players · your phone is the controller</div>
          <div className="case case--title case--sun" style={{ ...S.urlBox, padding: '20px 40px 22px', ...enterExit(t, beat.at + 0.4, 99) }}>
            <span style={S.urlLead}>Play free in your browser</span>
            <span style={{ ...S.url, fontSize: 60, ...wipe(t, beat.at + 0.5, 0.5) }}>{URL_TEXT}</span>
          </div>
        </div>
      ) : (
        <div style={{ position: 'absolute', left: 0, right: 0, bottom: 64, display: 'flex', justifyContent: 'center' }}>
          <div className="case case--sun" style={{ fontFamily: 'var(--f-num)', fontWeight: 700, fontSize: 40, padding: '8px 26px 6px' }}>
            {URL_TEXT}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Cadre de téléphone ───────────────────────────────────────────────────
function PhoneFrame() {
  const { screen, body, radius, screenRadius } = LAYOUT.phone
  return (
    <svg width={body.w + 16} height={body.h + 16} style={{ position: 'absolute', left: 0, top: 0 }}>
      <defs>
        <mask id="screen">
          <rect width={body.w + 16} height={body.h + 16} fill="#fff" />
          <rect x={screen.x} y={screen.y} width={screen.w} height={screen.h} rx={screenRadius} fill="#000" />
        </mask>
      </defs>
      {/* ombre décalée pleine, aucun flou */}
      <rect x={9} y={9} width={body.w - 4} height={body.h - 4} rx={radius} fill="rgb(161 142 161 / 0.6)" mask="url(#screen)" />
      <rect x={2} y={2} width={body.w - 4} height={body.h - 4} rx={radius} fill="#F7F0E3" stroke="#2B1D23" strokeWidth={4} mask="url(#screen)" />
      <rect x={screen.x} y={screen.y} width={screen.w} height={screen.h} rx={screenRadius} fill="none" stroke="#2B1D23" strokeWidth={3} />
      {/* haut-parleur et bouton, à l'encre */}
      <circle cx={13} cy={body.h / 2} r={4} fill="#2B1D23" />
      <rect x={body.w - 12} y={body.h / 2 - 34} width={5} height={68} rx={2.5} fill="#2B1D23" />
    </svg>
  )
}

function Card() {
  const t = useClock()
  switch (SPEC.kind) {
    case 'recit':
      return <Recit t={t} spec={SPEC} />
    case 'caption':
      return <Caption t={t} spec={SPEC} />
    case 'howto':
      return <Howto t={t} spec={SPEC} />
    case 'final':
      return <Final t={t} spec={SPEC} />
    case 'phone':
      return <PhoneFrame />
    case 'vertical':
      return <Vertical t={t} spec={SPEC} />
  }
}

const S: Record<string, CSSProperties> = {
  root: { position: 'fixed', left: 0, top: 0, width: 1920, height: 1080, overflow: 'hidden', background: 'transparent', color: 'var(--ink)', fontFamily: 'var(--f-ui)' },
  recit: { margin: 0, fontSize: 50, padding: '13px 36px 11px', background: 'var(--paper)', border: '3px solid var(--ink)', borderRadius: 3, boxShadow: '7px 7px 0 var(--drop)', maxWidth: 1500, lineHeight: 1.2, textAlign: 'center' },
  capBox: { padding: '16px 34px 12px' },
  capText: { display: 'inline-block', fontFamily: 'var(--f-title)', fontSize: 70, lineHeight: 1.05, letterSpacing: '0.06em', textTransform: 'uppercase', whiteSpace: 'nowrap' },
  pageTitle: { left: 72, top: 96, transform: 'none', fontFamily: 'var(--f-title)', fontSize: 58, letterSpacing: '0.06em', textTransform: 'uppercase', padding: '10px 30px 6px', borderWidth: 3, background: 'var(--paper)', boxShadow: '7px 7px 0 var(--drop)' },
  tag: { transform: 'none', fontSize: 34, padding: '4px 18px 2px', background: 'var(--sun)' },
  fact: { fontSize: 42, padding: '8px 22px 5px', lineHeight: 1.1, whiteSpace: 'nowrap' },
  factNum: { fontFamily: 'var(--f-num)', fontWeight: 700, fontSize: 46 },
  pitch: { fontSize: 44, padding: '10px 32px 7px', whiteSpace: 'nowrap' },
  urlBox: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, padding: '16px 56px 18px' },
  urlLead: { fontFamily: 'var(--f-title)', fontSize: 36, letterSpacing: '0.08em', textTransform: 'uppercase' },
  url: { fontFamily: 'var(--f-num)', fontWeight: 700, fontSize: 66, letterSpacing: '0.01em' },
  credit: { fontSize: 32, padding: '6px 24px 4px', background: 'var(--paper)', whiteSpace: 'nowrap' },
}

function App() {
  const [ready, setReady] = useState(false)
  useEffect(() => {
    void preloadUiFonts().then(async () => {
      await document.fonts.ready
      setReady(true)
    })
  }, [])
  useEffect(() => {
    window.__card = { id: ID, dur: SPEC.dur, ready }
  }, [ready])
  return (
    <div className="ui-root" style={SPEC.kind === 'vertical' ? { ...S.root, width: LAYOUT.vertical.w, height: LAYOUT.vertical.h } : S.root}>
      {ready ? <Card /> : null}
    </div>
  )
}

createRoot(document.getElementById('root')!).render(<App />)
