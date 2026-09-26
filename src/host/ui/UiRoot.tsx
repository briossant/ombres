// Racine de l'interface du PC : monte l'écran courant (avec transition), le
// HUD, les surcouches (pause, réglages, reconnexion) et les toasts, au-dessus
// du canvas 3D. À monter une seule fois par l'App de phase 3 :
//   <><Canvas …/><UiRoot /></>
// Styles de base en premier : les styles d'écran, importés ensuite, les précisent.
import './styles/base.css'
import './styles/controls.css'
import { Fragment, useEffect, useRef, useState, type ReactNode } from 'react'
import { useSettings } from '../settings.ts'
import { useLang } from './format.ts'
import { installNav } from './nav.ts'
import { useUiScale } from './scale.ts'
import { uiActions, useUi, type ScreenId } from './viewModel.ts'
import { Loading } from './screens/Loading.tsx'
import { Title } from './screens/Title.tsx'
import { Lobby } from './screens/Lobby.tsx'
import { RulesCards } from './screens/RulesCards.tsx'
import { Hud } from './screens/Hud.tsx'
import { Pause } from './screens/Pause.tsx'
import { Settings } from './screens/Settings.tsx'
import { RoundResults } from './screens/RoundResults.tsx'
import { MatchResults } from './screens/MatchResults.tsx'
import { Credits } from './screens/Credits.tsx'
import { Reconnect } from './screens/Reconnect.tsx'
import { Toasts } from './screens/Toasts.tsx'

function renderScreen(screen: ScreenId): ReactNode {
  switch (screen) {
    case 'loading':
      return <Loading />
    case 'title':
      return <Title />
    case 'lobby':
      return <Lobby />
    case 'rules':
      return <RulesCards />
    case 'game':
      return <Hud />
    case 'roundResults':
      return <RoundResults />
    case 'matchResults':
      return <MatchResults />
    case 'credits':
      return <Credits />
  }
}

const EXIT_MS = 170

/** Garde l'écran sortant monté le temps de sa sortie (160 ms), puis le démonte. */
function Screens() {
  const screen = useUi(s => s.screen)
  const [layers, setLayers] = useState<{ id: number; screen: ScreenId; exiting: boolean }[]>(() => [{ id: 0, screen, exiting: false }])
  const nextId = useRef(1)
  useEffect(() => {
    setLayers(prev => {
      const cur = prev[prev.length - 1]
      if (cur && cur.screen === screen && !cur.exiting) return prev
      return [...prev.map(l => ({ ...l, exiting: true })), { id: nextId.current++, screen, exiting: false }]
    })
    const tm = setTimeout(() => setLayers(prev => prev.filter(l => !l.exiting)), EXIT_MS)
    return () => clearTimeout(tm)
  }, [screen])
  return (
    <>
      {layers.map(l => (
        <div key={l.id} className={l.exiting ? 'screen-layer screen--exit' : 'screen-layer'} aria-hidden={l.exiting || undefined} inert={l.exiting || undefined}>
          {renderScreen(l.screen)}
        </div>
      ))}
    </>
  )
}

export function UiRoot() {
  const root = useRef<HTMLDivElement>(null)
  useUiScale(root)
  const lang = useLang()
  const reduceMotion = useSettings(s => s.reduceFlashes)
  const paused = useUi(s => s.paused)
  const overlay = useUi(s => s.overlay)
  const screen = useUi(s => s.screen)
  const hostLink = useUi(s => s.hostLink)

  useEffect(() => {
    const el = root.current
    if (!el) return
    const off = installNav(el)
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'KeyF' && !e.repeat && !e.ctrlKey && !e.metaKey && !e.altKey) uiActions.toggleFullscreen()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      off()
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div ref={root} className={reduceMotion ? 'ui-root reduce-motion' : 'ui-root'} lang={lang} data-screen={screen}>
      <Fragment key={lang}>
        <Screens />
        {paused && screen === 'game' ? <Pause /> : null}
      </Fragment>
      {overlay === 'settings' ? <Settings /> : null}
      {screen !== 'loading' ? <Toasts /> : null}
      {hostLink !== 'ok' && screen !== 'loading' ? <Reconnect /> : null}
    </div>
  )
}
