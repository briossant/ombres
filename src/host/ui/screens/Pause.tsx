// Pause (par-dessus le HUD figé) : reprendre, réglages, retour au salon (en
// deux temps, pour ne pas perdre une partie sur une fausse manip).
import { useRef, useState } from 'react'
import { t } from '../../../shared/i18n.ts'
import { Btn, HandFrame, Key } from '../components.tsx'
import { slotDisplayName } from '../format.ts'
import { Token } from '../glyphs.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions, useHud, useRoster, useUi } from '../viewModel.ts'
import './overlays.css'

export function Pause() {
  const ref = useRef<HTMLDivElement>(null)
  const by = useUi(s => s.pausedBy)
  const overlay = useUi(s => s.overlay)
  const who = useRoster(s => s.slots.find(x => x.slot === by))
  const round = useHud(s => s.round)
  const phase = useHud(s => s.phase)
  const [confirm, setConfirm] = useState(false)
  useNavScope(ref, {
    onBack: () => (confirm ? setConfirm(false) : uiActions.resume()),
    onStart: () => uiActions.resume(),
    layer: 10,
  })
  return (
    <div className="overlay pause" ref={ref} inert={overlay === 'settings' || undefined}>
      <div className="veil" />
      <HandFrame className="pause__panel enter" seed={3}>
        <div className="pause__inner">
          <div className="pause__head">
            <h2 className="pause__title t-title">{t('host.pause.title')}</h2>
            <p className="pause__by">
              {who ? (
                <>
                  <Token colorIndex={who.colorIndex} size={30} />
                  {t('host.pause.by', { name: slotDisplayName(who) })}
                </>
              ) : (
                t('host.pause.byPc')
              )}
            </p>
            <p className="pause__where">{t('host.pause.standings', { n: round, phase: t(`host.phase.${phase}`) })}</p>
          </div>
          <div className="pause__menu">
            <Btn primary icon="resume" isDefault onClick={() => uiActions.resume()} hint={<Key>{t('host.key.esc')}</Key>}>
              {t('host.pause.resume')}
            </Btn>
            <Btn icon="settings" onClick={() => uiActions.openSettings()}>
              {t('host.pause.settings')}
            </Btn>
            {confirm ? (
              <Btn icon="quit" className="btn--danger" onClick={() => uiActions.quitToLobby()}>
                {t('host.pause.confirm')}
              </Btn>
            ) : (
              <Btn icon="quit" onClick={() => setConfirm(true)}>
                {t('host.pause.toLobby')}
              </Btn>
            )}
          </div>
        </div>
      </HandFrame>
    </div>
  )
}
