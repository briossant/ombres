// Écrans sans partie : rejoindre (saisie du code), connexion, attente de l'écran, erreurs.
import { useState } from 'react'
import { ROOM_CODE_LENGTH } from '../../shared/protocol.ts'
import { isRoomCode, normalizeRoomCode, type PhoneFatal } from '../../net/phoneClient.ts'
import { retryConnection } from '../link.ts'
import { useT } from '../format.tsx'
import { usePhone } from '../store.ts'
import { IconReconnect, IconSpinFeather } from '../ui/Icons.tsx'

/** Change l'URL (?r=CODE) sans recharger : un rafraîchissement retombe dans la même salle. */
export function rememberRoomInUrl(code: string): void {
  try {
    const url = new URL(location.href)
    url.searchParams.set('r', code)
    history.replaceState(null, '', url)
  } catch {
    // ignoré
  }
}

function CodeForm({ initial, onSubmit, submitLabel }: { initial: string; onSubmit: (code: string) => void; submitLabel: string }) {
  const t = useT()
  const [code, setCode] = useState(initial)
  const valid = isRoomCode(code)
  return (
    <form
      style={{ display: 'grid', gap: 14, width: '100%' }}
      onSubmit={e => {
        e.preventDefault()
        if (valid) onSubmit(code)
      }}
    >
      <input
        className="code-input"
        value={code}
        placeholder={t('phone.join.placeholder')}
        inputMode="text"
        autoCapitalize="characters"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="go"
        maxLength={ROOM_CODE_LENGTH + 2}
        aria-label={t('phone.join.prompt')}
        onChange={e => setCode(normalizeRoomCode(e.target.value))}
      />
      <button type="submit" className={`btn btn--primary ${valid ? '' : 'is-disabled'}`} disabled={!valid}>
        {submitLabel}
      </button>
    </form>
  )
}

export function JoinScreen({ onJoin }: { onJoin: (code: string) => void }) {
  const t = useT()
  return (
    <div className="screen">
      <div className="case case--title panel" style={{ maxWidth: 420, display: 'grid', gap: 12, justifyItems: 'center', textAlign: 'center' }}>
        <h1 className="logo">OMBRES</h1>
        <p className="lede">{t('phone.join.prompt')}</p>
        <CodeForm initial="" submitLabel={t('phone.join.go')} onSubmit={onJoin} />
      </div>
    </div>
  )
}

export function ConnectingScreen() {
  const t = useT()
  const room = usePhone(s => s.room)
  return (
    <div className="screen">
      <div className="case panel" style={{ maxWidth: 380, textAlign: 'center', display: 'grid', gap: 10, justifyItems: 'center' }}>
        <span className="spin">
          <IconReconnect size={34} />
        </span>
        <p className="lede">{t('phone.connecting')}</p>
        <p className="t-num" style={{ fontSize: 40, letterSpacing: '0.2em', margin: 0 }}>
          {room}
        </p>
      </div>
    </div>
  )
}

export function WaitingHostScreen() {
  const t = useT()
  return (
    <div className="screen">
      <div className="case panel" style={{ maxWidth: 420, textAlign: 'center', display: 'grid', gap: 10, justifyItems: 'center' }}>
        <span className="feather-fall">
          <IconSpinFeather size={40} />
        </span>
        <h1 className="t-title" style={{ fontSize: 24 }}>
          {t('phone.waitingHost')}
        </h1>
        <p className="lede muted">{t('phone.waitingHost.body')}</p>
      </div>
    </div>
  )
}

export function ErrorScreen({ error }: { error: PhoneFatal }) {
  const t = useT()
  const room = usePhone(s => s.room)
  const retry = (code?: string) => {
    if (code) rememberRoomInUrl(code)
    retryConnection(code)
  }
  return (
    <div className="screen">
      <div className="case case--alert panel" style={{ maxWidth: 440, display: 'grid', gap: 12, textAlign: 'center' }}>
        <h1 className="t-title" style={{ fontSize: 24 }}>
          {t(`phone.error.${error}.title`)}
        </h1>
        <p className="lede">{t(`phone.error.${error}.body`)}</p>
        {error === 'room-not-found' ? (
          <CodeForm initial={room} submitLabel={t('phone.join.go')} onSubmit={code => retry(code)} />
        ) : error === 'kicked' ? (
          <button type="button" className="btn" onClick={() => retry()}>
            {t('phone.error.rejoin')}
          </button>
        ) : error === 'replaced' ? (
          <button type="button" className="btn" onClick={() => retry()}>
            {t('phone.error.takeBack')}
          </button>
        ) : (
          <button type="button" className="btn" onClick={() => retry()}>
            {t('phone.error.retry')}
          </button>
        )}
      </div>
    </div>
  )
}
