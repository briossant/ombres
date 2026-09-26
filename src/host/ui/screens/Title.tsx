// Écran titre (ART_BIBLE §8.8) : la manche de démo des bots joue derrière (plan
// bas, heure dorée). Logo en haut à gauche, pitch, menu en cases à droite.
// D'abord « appuie sur une touche » ; n'importe quelle touche, clic ou bouton
// de manette ouvre le menu.
import { useEffect, useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { Btn, Key } from '../components.tsx'
import { Logo } from '../Logo.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions, useUi } from '../viewModel.ts'
import './title.css'

export function Title() {
  const menuOpen = useUi(s => s.titleMenuOpen)
  return (
    <div className="screen title">
      <div className="title__logo enter">
        <Logo />
      </div>
      <p className="title__pitch enter" style={{ ['--i' as string]: 1 }}>
        {t('game.pitch')}
      </p>
      {menuOpen ? <TitleMenu /> : <PressAnyKey />}
      <div className="title__foot enter" style={{ ['--i' as string]: 3 }}>
        <span>{t('host.title.players')}</span>
        <span className="title__fs">
          <Key>F</Key> {t('host.keys.fullscreen')}
        </span>
      </div>
    </div>
  )
}

function PressAnyKey() {
  useEffect(() => {
    const open = () => useUi.setState({ titleMenuOpen: true })
    const onKey = (e: KeyboardEvent) => {
      if (e.repeat || e.code === 'KeyF') return
      e.preventDefault()
      open()
    }
    // La souris ouvre aussi le menu ; la manette (bouton quelconque) via un sondage léger.
    let raf = 0
    const poll = () => {
      raf = requestAnimationFrame(poll)
      for (const pad of navigator.getGamepads?.() ?? []) if (pad?.buttons.some(b => b.pressed)) open()
    }
    raf = requestAnimationFrame(poll)
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', open)
    return () => {
      cancelAnimationFrame(raf)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', open)
    }
  }, [])
  return (
    <div className="title__press enter" style={{ ['--i' as string]: 2 }}>
      <span className="title__press-text">{t('host.title.pressAny')}</span>
    </div>
  )
}

function TitleMenu() {
  const ref = useRef<HTMLDivElement>(null)
  useNavScope(ref, {})
  return (
    <nav className="title__menu" ref={ref}>
      <Btn primary icon="resume" isDefault onClick={() => uiActions.play()} hint={<Key>{t('host.key.enter')}</Key>} i={0}>
        {t('host.title.play')}
      </Btn>
      <Btn icon="settings" onClick={() => uiActions.openSettings()} i={1}>
        {t('host.title.settings')}
      </Btn>
      <Btn icon="quill" onClick={() => uiActions.openCredits()} i={2}>
        {t('host.title.credits')}
      </Btn>
    </nav>
  )
}
