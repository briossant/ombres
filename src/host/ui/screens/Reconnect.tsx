// Surcouche « écran en reconnexion » : le PC a perdu le serveur (réseau,
// redéploiement). La partie est figée dessous ; les téléphones restent dans la
// salle. La portée de navigation (couche 30) avale les touches de menu.
import { useRef } from 'react'
import { t } from '../../../shared/i18n.ts'
import { Icon } from '../icons.tsx'
import { useNavScope } from '../nav.ts'
import { useUi } from '../viewModel.ts'
import './overlays.css'

export function Reconnect() {
  const ref = useRef<HTMLDivElement>(null)
  const link = useUi(s => s.hostLink)
  useNavScope(ref, { layer: 30, arrows: false, autoFocus: false, onBack: () => undefined, onStart: () => undefined })
  return (
    <div className="overlay reconnect" role="alert" ref={ref}>
      <div className="veil veil--deep" />
      <div className="reconnect__case case case--alert enter">
        <Icon name={link === 'lost' ? 'wifiOff' : 'reconnect'} size={64} stroke={2} className={link === 'lost' ? 'reconnect__icon' : 'reconnect__icon spin'} />
        <div>
          <h2 className="reconnect__title t-title">{t('host.reconnect.title')}</h2>
          <p className="reconnect__body">{t(link === 'lost' ? 'host.reconnect.lost' : 'host.reconnect.body')}</p>
        </div>
      </div>
    </div>
  )
}
