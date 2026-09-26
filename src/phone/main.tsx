// Point d'entrée de la manette (play.html). Le code de salle vient de l'URL (?r=CODE, depuis le
// QR code) ou de la saisie manuelle ; le client réseau se reconnecte seul.
import { createRoot } from 'react-dom/client'
import { Component, StrictMode, type ReactNode } from 'react'
import { t } from '../shared/i18n.ts'
import { PhoneClient, isRoomCode, normalizeRoomCode } from '../net/phoneClient.ts'
import { attachClient, helloFromPrefs } from './link.ts'
import { usePhone } from './store.ts'
import { PhoneApp } from './App.tsx'
import { rememberRoomInUrl } from './screens/StatusScreens.tsx'
import './phone.css'

function roomFromUrl(): string {
  const params = new URLSearchParams(location.search)
  const raw = params.get('r') ?? params.get('room') ?? location.pathname.match(/\/j\/([A-Za-z]{4})/)?.[1] ?? ''
  const code = normalizeRoomCode(raw)
  return isRoomCode(code) ? code : ''
}

let detach: (() => void) | null = null

function join(code: string): void {
  detach?.()
  rememberRoomInUrl(code)
  usePhone.setState({ room: code, view: null, status: null, everOnline: false, error: null })
  const client = new PhoneClient({ room: code, hello: helloFromPrefs })
  detach = attachClient(client)
}

const initial = roomFromUrl()
if (initial) join(initial)

/**
 * Borne d'erreur (polish G6, ajout game) : une exception de rendu affiche « Recharger » au lieu
 * d'un écran blanc ; le téléphone se reconnecte seul à la même salle (?r=CODE) après rechargement.
 */
class PhoneErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false }
  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true }
  }
  override componentDidCatch(error: unknown): void {
    console.error('[ombres] erreur d’affichage (téléphone)', error)
  }
  override render(): ReactNode {
    if (!this.state.failed) return this.props.children
    return (
      <div className="overlay overlay--dim" role="alert">
        <div className="case case--title panel" style={{ display: 'grid', gap: 12, justifyItems: 'center' }}>
          <p className="lede">{t('host.error.body')}</p>
          <button type="button" className="btn btn--primary" onClick={() => location.reload()}>
            {t('host.error.reload')}
          </button>
        </div>
      </div>
    )
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhoneErrorBoundary>
      <PhoneApp onJoin={join} />
    </PhoneErrorBoundary>
  </StrictMode>,
)
