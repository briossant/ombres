// Racine de l'app téléphone : choisit l'écran d'après la connexion et la vue envoyée par le PC,
// et pose les surcouches (reconnexion, pause, réglages, messages, effets).
import { useEffect } from 'react'
import { displayedColor, usePhone } from './store.ts'
import { playerVars } from './format.tsx'
import { enterFullscreen, guardGestures, lockLandscape } from './device/screen.ts'
import { keepAwake } from './device/wakeLock.ts'
import { ConnectingScreen, ErrorScreen, JoinScreen, WaitingHostScreen } from './screens/StatusScreens.tsx'
import { ProfileScreen } from './screens/ProfileScreen.tsx'
import { IntroScreen, LobbyScreen, MatchEndScreen, PlayScreen, RoundEndScreen, SpectateScreen } from './screens/GameScreens.tsx'
import { FxLayer, PauseOverlay, ReconnectOverlay, SettingsSheet, Toasts } from './screens/Overlays.tsx'

/** Premier appui : plein écran (Android), écran allumé, paysage si possible. */
function useFirstGesture(): void {
  useEffect(() => {
    guardGestures()
    const onFirst = (e: PointerEvent) => {
      // Pas de plein écran quand on tape dans un champ (le clavier virtuel suit).
      const target = e.target as HTMLElement | null
      keepAwake()
      if (!target?.closest?.('input')) enterFullscreen()
    }
    document.addEventListener('pointerdown', onFirst, { capture: true })
    return () => document.removeEventListener('pointerdown', onFirst, { capture: true })
  }, [])
}

function Screen({ onJoin }: { onJoin: (code: string) => void }) {
  const room = usePhone(s => s.room)
  const conn = usePhone(s => s.conn)
  const error = usePhone(s => s.error)
  const everOnline = usePhone(s => s.everOnline)
  const view = usePhone(s => s.view)
  const pendingProfile = usePhone(s => s.pendingProfile)

  const controllerScreen = view && (view.screen === 'play' || (view.screen === 'lobby' && (view.you.profileSet || pendingProfile)))
  useEffect(() => {
    if (controllerScreen) lockLandscape()
  }, [controllerScreen])

  if (!room) return <JoinScreen onJoin={onJoin} />
  if (conn === 'error' && error) return <ErrorScreen error={error} />
  if (!everOnline) return <ConnectingScreen />
  if (!view) return <WaitingHostScreen />
  switch (view.screen) {
    case 'lobby':
      return view.you.profileSet || pendingProfile ? <LobbyScreen view={view} /> : <ProfileScreen />
    case 'intro':
      return <IntroScreen view={view} />
    case 'play':
      return <PlayScreen view={view} />
    case 'roundEnd':
      return <RoundEndScreen view={view} />
    case 'matchEnd':
      return <MatchEndScreen view={view} />
    case 'spectate':
      return <SpectateScreen view={view} />
    default:
      return <WaitingHostScreen />
  }
}

export function PhoneApp({ onJoin }: { onJoin: (code: string) => void }) {
  useFirstGesture()
  const color = usePhone(displayedColor)
  const screen = usePhone(s => s.view?.screen ?? 'none')
  return (
    <div className="app" style={playerVars(color)} data-screen={screen}>
      <Screen onJoin={onJoin} />
      <Toasts />
      <FxLayer />
      <PauseOverlay />
      <SettingsSheet />
      <ReconnectOverlay />
    </div>
  )
}
