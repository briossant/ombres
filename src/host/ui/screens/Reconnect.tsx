// Surcouche « écran en reconnexion » : le PC a perdu le serveur (réseau,
// redéploiement). La partie est figée dessous ; les téléphones restent dans la
// salle. La portée de navigation (couche 30) avale les touches de menu.
// Onglet dupliqué (hostLink 'replaced') : un autre onglet a repris la salle ; celui-ci
// ne réessaie pas seul (il volerait la salle en boucle) : texte dédié et « Reprendre ici ».
import { useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { Btn } from '../components.tsx'
import { Icon } from '../icons.tsx'
import { useNavScope } from '../nav.ts'
import { uiActions, useUi } from '../viewModel.ts'
import './overlays.css'

export function Reconnect() {
  const ref = useRef<HTMLDivElement>(null)
  const link = useUi(s => s.hostLink)
  const replaced = link === 'replaced'
  useNavScope(ref, { layer: 30, arrows: false, autoFocus: replaced, onBack: () => undefined, onStart: () => undefined })
  return (
    <div className="overlay reconnect" role="alert" ref={ref}>
      <div className="veil veil--deep" />
      <div className={replaced ? 'reconnect__case reconnect__case--replaced case case--alert enter' : 'reconnect__case case case--alert enter'}>
        <Icon name={replaced ? 'phone' : 'reconnect'} size={64} stroke={2} className={replaced ? 'reconnect__icon' : 'reconnect__icon spin'} />
        <div>
          <h2 className="reconnect__title t-title">{t(replaced ? 'host.reconnect.replaced.title' : 'host.reconnect.title')}</h2>
          <p className="reconnect__body">{t(replaced ? 'host.reconnect.replaced.body' : 'host.reconnect.body')}</p>
          {replaced ? (
            <div className="reconnect__actions">
              <Btn primary icon="enter" isDefault onClick={() => uiActions.takeOver()}>
                {t('host.reconnect.takeOver')}
              </Btn>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
