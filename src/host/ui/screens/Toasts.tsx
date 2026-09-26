// Toasts d'événements de session (arrivées, déconnexions, remplaçants…), en
// haut à droite. Alerte = inversion encre/papier (jamais de rouge : ART_BIBLE §8.3).
import { t } from '../../../shared/i18n.ts'
import { Token } from '../glyphs.tsx'
import { Icon } from '../icons.tsx'
import { useHud, useRoster } from '../viewModel.ts'
import './toasts.css'

export function Toasts() {
  const toasts = useHud(s => s.toasts)
  const slots = useRoster(s => s.slots)
  if (toasts.length === 0) return null
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map(to => {
        const s = slots.find(x => x.slot === to.slot)
        return (
          <div key={to.id} className={to.tone === 'alert' ? 'toast toast--alert' : 'toast'}>
            {s ? <Token colorIndex={s.colorIndex} size={30} /> : <Icon name={to.tone === 'alert' ? 'wifiOff' : 'hint'} size={28} />}
            <span>{t(to.key, to.params)}</span>
          </div>
        )
      })}
    </div>
  )
}
