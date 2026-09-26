// Écran toujours allumé pendant la partie.
// API Screen Wake Lock (Chrome Android, Safari ≥ 16.4) ; repli : une minuscule vidéo muette
// lue en boucle (technique « NoSleep »), qui empêche la mise en veille sur les anciens iOS.
// Le verrou est perdu quand la page passe en arrière-plan : on le redemande au retour.
import nosleepUrl from './nosleep.mp4?url'

interface WakeLockSentinelLike {
  released: boolean
  release(): Promise<void>
  addEventListener(type: 'release', fn: () => void): void
}

let sentinel: WakeLockSentinelLike | null = null
let video: HTMLVideoElement | null = null
let wanted = false
let listening = false

async function requestNative(): Promise<boolean> {
  const wl = (navigator as Navigator & { wakeLock?: { request(type: 'screen'): Promise<WakeLockSentinelLike> } }).wakeLock
  if (!wl) return false
  try {
    sentinel = await wl.request('screen')
    sentinel.addEventListener('release', () => {
      sentinel = null
    })
    return true
  } catch {
    return false
  }
}

function startVideo(): void {
  if (!video) {
    video = document.createElement('video')
    video.setAttribute('playsinline', '')
    video.setAttribute('muted', '')
    video.muted = true
    video.loop = true
    video.src = nosleepUrl
    Object.assign(video.style, { position: 'fixed', width: '1px', height: '1px', opacity: '0.01', pointerEvents: 'none', left: '0', top: '0' })
    document.body.appendChild(video)
  }
  void video.play().catch(() => {
    // Lecture refusée hors geste utilisateur : on réessaiera au prochain appui.
  })
}

async function acquire(): Promise<void> {
  if (!wanted || document.visibilityState !== 'visible') return
  if (sentinel && !sentinel.released) return
  if (await requestNative()) return
  startVideo()
}

/** À appeler depuis un geste utilisateur (premier appui) : garde l'écran allumé. */
export function keepAwake(): void {
  wanted = true
  if (!listening) {
    listening = true
    document.addEventListener('visibilitychange', () => void acquire())
  }
  void acquire()
}

export function releaseAwake(): void {
  wanted = false
  void sentinel?.release().catch(() => undefined)
  sentinel = null
  video?.pause()
}

export function isAwakeLocked(): boolean {
  return (!!sentinel && !sentinel.released) || (!!video && !video.paused)
}
