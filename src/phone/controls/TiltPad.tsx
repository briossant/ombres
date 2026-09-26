// Mode Inclinaison : niveau à bulle dans la moitié gauche, bouton Recalibrer (et, sur iOS,
// « Activer l'inclinaison » qui demande l'autorisation). Les boutons restent tactiles.
import { useEffect, useRef, useState } from 'react'
import { getClient } from '../link.ts'
import { useT } from '../format.tsx'
import { TiltController, requestTiltPermission, tiltSupport } from '../device/tilt.ts'

/** Contrôleur partagé : le calibrage survit aux changements d'écran. */
let shared: TiltController | null = null
let permission: 'unknown' | 'granted' | 'denied' = tiltSupport() === 'yes' ? 'granted' : 'unknown'
const listeners = new Set<(x: number, y: number) => void>()

export function tiltController(): TiltController {
  shared ??= new TiltController((x, y) => {
    getClient()?.setStick(x, y)
    for (const l of listeners) l(x, y)
  })
  return shared
}

/** Recalibrage (au « Prêt », aux cartes des règles, ou par le bouton). */
export function recalibrateTilt(): void {
  if (shared?.active) shared.calibrate()
}

export async function enableTilt(): Promise<boolean> {
  const ok = await requestTiltPermission()
  permission = ok ? 'granted' : 'denied'
  if (ok) tiltController().start()
  return ok
}

export function TiltPad() {
  const t = useT()
  const bubble = useRef<HTMLDivElement>(null)
  const [perm, setPerm] = useState(permission)
  const [alive, setAlive] = useState(true)
  const support = tiltSupport()

  useEffect(() => {
    if (perm !== 'granted') return
    const ctl = tiltController()
    ctl.start()
    const move = (x: number, y: number) => {
      if (bubble.current) bubble.current.style.transform = `translate(${x * 52}px, ${-y * 52}px)`
    }
    listeners.add(move)
    const check = setInterval(() => setAlive(ctl.alive), 1000)
    return () => {
      listeners.delete(move)
      clearInterval(check)
      ctl.stop()
    }
  }, [perm])

  return (
    <div className="stick-zone">
      <div className="tilt-pad" aria-label={t('phone.tilt.hint')}>
        <div className="tilt-pad__dead" />
        <div className="tilt-pad__bubble" ref={bubble} />
        {support === 'no' || (perm === 'granted' && !alive) ? (
          <div className="tilt-pad__cal recitatif">{t('phone.tilt.unavailable')}</div>
        ) : perm !== 'granted' ? (
          <button
            type="button"
            className="btn tilt-pad__cal"
            onClick={async () => {
              const ok = await enableTilt()
              setPerm(ok ? 'granted' : 'denied')
            }}
          >
            {perm === 'denied' ? t('phone.tilt.denied') : t('phone.tilt.enable')}
          </button>
        ) : (
          <button type="button" className="btn tilt-pad__cal" onClick={() => tiltController().calibrate()}>
            {t('phone.tilt.recalibrate')}
          </button>
        )}
      </div>
    </div>
  )
}
