// Point d'entrée de la manette (play.html). Le code de salle vient de l'URL (?r=CODE, depuis le
// QR code) ou de la saisie manuelle ; le client réseau se reconnecte seul.
import { createRoot } from 'react-dom/client'
import { StrictMode } from 'react'
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

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <PhoneApp onJoin={join} />
  </StrictMode>,
)
