// Écrans de secours du PC (polish G6) : « plus jamais d'écran blanc ».
// - Pas de WebGL 2 (GPU sur liste noire, bureau à distance, accélération matérielle coupée) :
//   écran explicatif à la place du jeu, sans ouvrir de salle (un téléphone ne peut pas rejoindre
//   une partie qui ne s'affichera jamais).
// - Erreur d'affichage (exception dans le monde 3D ou dans l'interface) : la case « Recharger »
//   remplace l'écran blanc ; la sauvegarde de session reprend la partie là où elle en était.
// Même grammaire visuelle que l'UI (cases de BD, papier, encre) : base.css de l'UI, échelle 1080p.
import { Component, useEffect, useRef, useState, type ErrorInfo, type ReactNode } from 'react'
import '../ui/styles/base.css'
import { useUiScale } from '../ui/scale.ts'
import { Logo } from '../ui/Logo.tsx'
import { t } from '../../shared/i18n.ts'
import { getSettings } from '../settings.ts'

/** Le navigateur sait-il créer un contexte WebGL 2 ? (le contexte de test est libéré aussitôt) */
export function hasWebGL2(): boolean {
  try {
    const canvas = document.createElement('canvas')
    const gl = canvas.getContext('webgl2')
    if (!gl) return false
    gl.getExtension('WEBGL_lose_context')?.loseContext()
    return true
  } catch {
    return false
  }
}

const FRAME_STYLE = {
  pointerEvents: 'auto',
  zIndex: 1000,
  display: 'grid',
  placeItems: 'center',
  background: 'var(--paper)',
} as const

const PANEL_STYLE = {
  display: 'grid',
  gap: 28,
  justifyItems: 'center',
  width: 980,
  maxWidth: '86%',
  padding: '48px 64px 56px',
  textAlign: 'center',
} as const

/** Case centrée sur papier, à l'échelle de l'UI (px de conception 1080p). */
function FallbackFrame({ title, body, action }: { title: string | null; body: string; action: ReactNode }) {
  const root = useRef<HTMLDivElement>(null)
  useUiScale(root)
  // la langue des réglages est appliquée à l'import de settings.ts : on la lit pour le rendu
  const lang = getSettings().lang
  return (
    <div ref={root} className="ui-root" lang={lang} style={FRAME_STYLE} role="alert">
      <div className="case case--title" style={PANEL_STYLE}>
        <Logo animate={false} />
        {title ? (
          <h1 className="t-title" style={{ fontSize: 46, margin: 0 }}>
            {title}
          </h1>
        ) : null}
        <p style={{ fontSize: 32, lineHeight: 1.3, margin: 0, color: 'var(--ink-80)' }}>{body}</p>
        {action}
      </div>
    </div>
  )
}

function ReloadButton() {
  const btn = useRef<HTMLButtonElement>(null)
  // Entrée ou un clic suffisent : le bouton prend le focus
  useEffect(() => btn.current?.focus(), [])
  return (
    <button ref={btn} type="button" className="btn btn--primary" onClick={() => location.reload()}>
      {t('host.error.reload')}
    </button>
  )
}

/** Écran « pas de WebGL 2 » : aucune salle n'est ouverte. */
export function NoWebGL() {
  return <FallbackFrame title={t('host.webgl.title')} body={t('host.webgl.body')} action={<ReloadButton />} />
}

/** Écran d'erreur d'affichage : « Recharger » (la sauvegarde de session reprend la partie). */
export function DisplayError() {
  return <FallbackFrame title={null} body={t('host.error.body')} action={<ReloadButton />} />
}

// ─── Exception forcée (?debug uniquement) ────────────────────────────────────

type CrashTarget = 'world' | 'ui'
const crashListeners = new Set<(target: CrashTarget) => void>()

/** ?debug : fait lever une exception de rendu dans le monde 3D ou dans l'UI (test des secours). */
export function debugCrash(target: CrashTarget): void {
  for (const l of crashListeners) l(target)
}

/** Composant témoin : lève une exception au rendu quand debugCrash vise sa zone. */
export function CrashProbe({ target }: { target: CrashTarget }) {
  const [crash, setCrash] = useState(false)
  useEffect(() => {
    const l = (tg: CrashTarget) => tg === target && setCrash(true)
    crashListeners.add(l)
    return () => void crashListeners.delete(l)
  }, [target])
  if (crash) throw new Error(`[debug] exception forcée : ${target}`)
  return null
}

// ─── Bornes d'erreur ─────────────────────────────────────────────────────────

interface BoundaryProps {
  /** Zone gardée (journal). */
  label: string
  children: ReactNode
  /** Appelé une fois à la première erreur (sauvegarde immédiate, par exemple). */
  onError?: () => void
}

/**
 * Borne d'erreur React : une exception dans la zone gardée remplace la zone par l'écran
 * « Recharger » au lieu de démonter toute l'application (écran blanc).
 */
export class ErrorBoundary extends Component<BoundaryProps, { failed: boolean }> {
  override state = { failed: false }

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }

  override componentDidCatch(error: unknown, info: ErrorInfo): void {
    console.error(`[ombres] erreur d'affichage (${this.props.label})`, error, info.componentStack)
    try {
      this.props.onError?.()
    } catch {
      // la sauvegarde est un bonus : l'écran de secours s'affiche quoi qu'il arrive
    }
  }

  override render(): ReactNode {
    return this.state.failed ? <DisplayError /> : this.props.children
  }
}
