// Surcouche « L'image s'est interrompue » : le contexte WebGL est perdu (pilote graphique
// réinitialisé, GPU saturé, mise en veille). Papier opaque par-dessus le canvas vide ; la manche
// est en pause dessous (runner.onDisplayLost). Si le navigateur rend l'image, la surcouche
// disparaît et la partie reprend seule en « 3, 2, 1 ». Sinon, au bout de STUCK_MS, « Recharger » :
// la sauvegarde de session reprend la partie à l'instant de la coupure.
// Portée de navigation de couche 40 (au-dessus de la pause, des réglages et de la reconnexion).
import { useEffect, useRef, useState } from 'react'
import { t } from '../../../shared/i18n.ts'
import { Btn, HandFrame } from '../components.tsx'
import { Icon } from '../icons.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions } from '../viewModel.ts'
import './overlays.css'

/** Sans retour de l'image après ce délai, on propose de recharger. */
export const DISPLAY_STUCK_MS = 3000

export function DisplayLost() {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const tm = setTimeout(() => setStuck(true), DISPLAY_STUCK_MS)
    return () => clearTimeout(tm)
  }, [])
  return (
    <div className="overlay display-lost" role="alert" aria-live="assertive">
      <DisplayLostPanel stuck={stuck} key={stuck ? 'stuck' : 'wait'} />
    </div>
  )
}

function DisplayLostPanel({ stuck }: { stuck: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useNavScope(ref, { layer: 40, arrows: false, autoFocus: stuck, onBack: () => undefined, onStart: () => undefined })
  return (
    <div ref={ref} className="display-lost__wrap">
      <HandFrame className="display-lost__panel" seed={11}>
        <div className="display-lost__inner">
          <Icon name={stuck ? 'flag' : 'sun'} size={72} stroke={2} className={stuck ? 'display-lost__icon' : 'display-lost__icon display-lost__icon--wait'} />
          <h2 className="display-lost__title t-title">{t('host.display.title')}</h2>
          <p className="display-lost__body">{t(stuck ? 'host.display.stuck' : 'host.display.wait')}</p>
          {stuck ? (
            <Btn primary icon="reconnect" isDefault onClick={() => uiActions.reloadPage()}>
              {t('host.error.reload')}
            </Btn>
          ) : null}
        </div>
      </HandFrame>
    </div>
  )
}
