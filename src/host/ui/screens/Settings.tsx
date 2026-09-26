// Réglages (surcouche, depuis le titre, le salon ou la pause) : 4 volumes,
// qualité, plein écran, langue, daltonien, narrateur, conseils, flashs,
// tremblement, et la référence des touches. Écrit directement dans
// useSettings (src/host/settings.ts), qui persiste en localStorage.
import { useEffect, useRef, useState } from 'react'
import { t } from '../../../shared/i18n.ts'
import type { Lang } from '../../../shared/protocol.ts'
import { useSettings, type HintsMode, type NarratorMode, type QualityPreset } from '../../settings.ts'
import { Btn, HandFrame, Key, Segmented, Slider } from '../components.tsx'
import { useLang } from '../format.ts'
import { keyLabel, useKeyLayout } from '../keys.ts'
import { useNavScope } from '../nav.ts'
import { uiActions } from '../viewModel.ts'
import './overlays.css'

function useFullscreen(): boolean {
  const [fs, setFs] = useState(() => typeof document !== 'undefined' && !!document.fullscreenElement)
  useEffect(() => {
    const on = () => setFs(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', on)
    return () => document.removeEventListener('fullscreenchange', on)
  }, [])
  return fs
}

export function Settings() {
  const ref = useRef<HTMLDivElement>(null)
  useLang()
  const s = useSettings()
  const fs = useFullscreen()
  useNavScope(ref, { onBack: () => uiActions.closeSettings(), onStart: () => uiActions.closeSettings(), layer: 20 })
  const yesNo = [
    { value: true, label: t('host.yes') },
    { value: false, label: t('host.no') },
  ]
  return (
    <div className="overlay settings" ref={ref}>
      <div className="veil" />
      <HandFrame className="settings__panel enter" seed={9}>
        <div className="settings__inner">
          <header className="settings__head">
            <h2 className="settings__title t-title">{t('host.settings.title')}</h2>
            <span className="settings__help">{t('host.settings.help')}</span>
            <Btn icon="close" onClick={() => uiActions.closeSettings()} hint={<Key>{t('host.key.esc')}</Key>}>
              {t('host.close')}
            </Btn>
          </header>
          <div className="settings__cols">
            <div className="settings__col">
              <section className="settings__sec">
                <h3 className="settings__sec-title t-title">{t('host.settings.sound')}</h3>
                <Slider isDefault icon="volume" label={t('host.settings.volMaster')} value={s.volMaster} onChange={v => s.set('volMaster', v)} />
                <Slider icon="music" label={t('host.settings.volMusic')} value={s.volMusic} onChange={v => s.set('volMusic', v)} />
                <Slider icon="sfx" label={t('host.settings.volSfx')} value={s.volSfx} onChange={v => s.set('volSfx', v)} />
                <Slider icon="voice" label={t('host.settings.volVoice')} value={s.volVoice} onChange={v => s.set('volVoice', v)} />
              </section>
              <section className="settings__sec">
                <h3 className="settings__sec-title t-title">{t('host.settings.image')}</h3>
                <Segmented<QualityPreset>
                  icon="quality"
                  label={t('host.settings.quality')}
                  value={s.quality}
                  options={(['auto', 'low', 'medium', 'high'] as const).map(q => ({ value: q, label: t(`host.settings.quality.${q}`) }))}
                  onChange={v => s.set('quality', v)}
                />
                <Segmented<boolean> icon="fullscreen" label={t('host.settings.fullscreen')} value={fs} options={yesNo} onChange={v => v !== fs && uiActions.toggleFullscreen()} />
                <Segmented<boolean> icon="flash" label={t('host.settings.reduceFlashes')} value={s.reduceFlashes} options={yesNo} onChange={v => s.set('reduceFlashes', v)} />
                <Segmented<boolean> icon="shake" label={t('host.settings.screenShake')} value={s.screenShake} options={yesNo} onChange={v => s.set('screenShake', v)} />
              </section>
            </div>
            <div className="settings__col">
              <section className="settings__sec">
                <h3 className="settings__sec-title t-title">{t('host.settings.game')}</h3>
                <Segmented<Lang>
                  icon="lang"
                  label={t('host.settings.lang')}
                  value={s.lang}
                  options={[
                    { value: 'fr', label: 'Français' },
                    { value: 'en', label: 'English' },
                  ]}
                  onChange={v => s.set('lang', v)}
                />
                <Segmented<boolean> icon="colorblind" label={t('host.settings.colorblind')} value={s.colorblind} options={yesNo} onChange={v => s.set('colorblind', v)} />
                <Segmented<NarratorMode>
                  icon="voice"
                  label={t('host.settings.narrator')}
                  value={s.narrator}
                  options={(['voice', 'text', 'off'] as const).map(m => ({ value: m, label: t(`host.settings.narrator.${m}`) }))}
                  onChange={v => s.set('narrator', v)}
                />
                <Segmented<HintsMode>
                  icon="hint"
                  label={t('host.settings.hints')}
                  value={s.hints}
                  options={(['auto', 'always', 'never'] as const).map(m => ({ value: m, label: t(`host.settings.hints.${m}`) }))}
                  onChange={v => s.set('hints', v)}
                />
              </section>
              <section className="settings__sec">
                <h3 className="settings__sec-title t-title">{t('host.settings.keys')}</h3>
                <KeysReference />
              </section>
            </div>
          </div>
          <footer className="settings__foot">
            <Btn quiet icon="reconnect" onClick={() => s.reset()}>
              {t('host.settings.reset')}
            </Btn>
          </footer>
        </div>
      </HandFrame>
    </div>
  )
}

/** Référence des touches (GDD §12.2), libellés selon la disposition réelle. */
export function KeysReference() {
  const layout = useKeyLayout()
  const k = (code: string) => <Key>{keyLabel(code, layout)}</Key>
  const arrows = (
    <span className="keys__arrows">
      {/* même ordre que W A S D (haut, gauche, bas, droite) */}
      <Key>↑</Key>
      <Key>←</Key>
      <Key>↓</Key>
      <Key>→</Key>
    </span>
  )
  // Une ligne par commande, une colonne par joueur ; ce qui ne concerne qu'un joueur (flèches du
  // joueur seul) ou tout le monde (pause, plein écran) a sa propre ligne.
  return (
    <div className="keys">
      <table className="keys__table">
        <thead>
          <tr>
            <th />
            <th>{t('host.keys.p1')}</th>
            <th>{t('host.keys.p2')}</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>{t('host.keys.steer')}</td>
            <td>
              <span className="keys__group">
                {k('KeyW')}
                {k('KeyA')}
                {k('KeyS')}
                {k('KeyD')}
              </span>
            </td>
            <td>
              <span className="keys__group">
                {k('KeyI')}
                {k('KeyJ')}
                {k('KeyK')}
                {k('KeyL')}
              </span>
            </td>
          </tr>
          <tr className="keys__sub">
            <td />
            <td colSpan={2}>
              <span className="keys__or">{t('host.keys.or')}</span>
              {arrows}
              <span className="keys__or">{t('host.keys.solo')}</span>
            </td>
          </tr>
          <tr>
            <td>{t('host.keys.dive')}</td>
            <td>{k('Space')}</td>
            <td>{k('AltRight')}</td>
          </tr>
          <tr>
            <td>{t('host.keys.flap')}</td>
            <td>{k('ShiftLeft')}</td>
            <td>{k('Semicolon')}</td>
          </tr>
          <tr className="keys__all">
            <td>{t('host.keys.pause')}</td>
            <td colSpan={2}>
              <Key>{t('host.key.esc')}</Key>
            </td>
          </tr>
          <tr className="keys__all">
            <td>{t('host.keys.fullscreen')}</td>
            <td colSpan={2}>{k('KeyF')}</td>
          </tr>
        </tbody>
      </table>
      <p className="keys__note">{t('host.keys.join')} · {t('host.keys.note')}</p>
      <p className="keys__note">{t('host.keys.gamepad')}</p>
    </div>
  )
}
