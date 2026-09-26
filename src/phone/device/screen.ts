// Plein écran, orientation, et verrouillage des gestes du navigateur (zoom, sélection, défilement,
// menu contextuel) : la page doit se comporter comme une manette, pas comme un site.

export const isIOS = (): boolean =>
  typeof navigator !== 'undefined' &&
  (/iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1))

/** Plein écran (Android ; iOS n'a pas de plein écran pour les pages sur iPhone). Depuis un geste. */
export function enterFullscreen(): void {
  const el = document.documentElement as HTMLElement & { webkitRequestFullscreen?: () => void }
  if (document.fullscreenElement) return
  try {
    if (el.requestFullscreen) void el.requestFullscreen({ navigationUI: 'hide' }).then(lockLandscape, () => undefined)
    else el.webkitRequestFullscreen?.()
  } catch {
    // refusé : sans gravité
  }
}

/** Paysage préféré. N'aboutit qu'en plein écran (Android) ; ailleurs la mise en page portrait prend le relais. */
export function lockLandscape(): void {
  const o = screen.orientation as ScreenOrientation & { lock?: (o: string) => Promise<void> }
  if (!o?.lock) return
  o.lock('landscape').catch(() => undefined)
}

export function unlockOrientation(): void {
  try {
    screen.orientation?.unlock?.()
  } catch {
    // ignoré
  }
}

/** Orientation de l'écran en degrés (0, 90, 180, 270), pour l'inclinaison. */
export function screenAngle(): number {
  const a = screen.orientation?.angle ?? (window as Window & { orientation?: number }).orientation ?? 0
  return ((a % 360) + 360) % 360
}

let guarded = false

/** Empêche zoom au pincement / double appui, sélection, menu contextuel et défilement élastique. */
export function guardGestures(): void {
  if (guarded) return
  guarded = true
  const prevent = (e: Event) => e.preventDefault()
  // iOS : pincement (gesturestart est propre à Safari).
  document.addEventListener('gesturestart', prevent, { passive: false })
  document.addEventListener('gesturechange', prevent, { passive: false })
  document.addEventListener('dblclick', prevent, { passive: false })
  document.addEventListener('contextmenu', prevent)
  document.addEventListener('selectstart', e => {
    const t = e.target as HTMLElement | null
    if (!t?.closest?.('input, textarea')) e.preventDefault()
  })
  // Défilement : seules les zones marquées .scrollable défilent.
  document.addEventListener(
    'touchmove',
    e => {
      const t = e.target as HTMLElement | null
      if (e.touches.length > 1 || !t?.closest?.('.scrollable')) e.preventDefault()
    },
    { passive: false },
  )
}
