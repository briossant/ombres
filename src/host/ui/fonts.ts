// Préchargement des trois polices de l'UI (à inclure dans le manifeste de
// chargement de phase 3 : l'écran titre ne doit jamais apparaître en police de secours).
import './styles/base.css'

export const UI_FONTS: readonly string[] = ['400 48px "Julius Sans One"', '400 24px "Patrick Hand SC"', '700 32px "Averia Sans Libre"']

/** Résout quand les trois polices sont prêtes (ou après 4 s, pour ne jamais bloquer). */
export async function preloadUiFonts(onProgress?: (done: number, total: number) => void): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  let done = 0
  const total = UI_FONTS.length
  const loads = UI_FONTS.map(f =>
    document.fonts.load(f, 'OMBRES éàç 0123456789 %').then(
      () => onProgress?.(++done, total),
      () => onProgress?.(++done, total),
    ),
  )
  await Promise.race([Promise.all(loads), new Promise(r => setTimeout(r, 4000))])
}
