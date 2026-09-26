// Échelle de l'UI proportionnelle à la hauteur de l'écran (base 1080p).
// La racine .ui-root est dimensionnée en « px de conception » et zoomée : tout
// le CSS s'écrit en px 1080p, comme dans la bible (ART_BIBLE §8).
import { useLayoutEffect, useState, type RefObject } from 'react'

export const DESIGN_HEIGHT = 1080
/** Largeur de conception minimale : en deçà (fenêtre étroite), on réduit l'échelle. */
export const DESIGN_MIN_WIDTH = 1600

export interface UiScale {
  /** Facteur viewport / conception. */
  s: number
  /** Taille de la racine en px de conception. */
  width: number
  height: number
}

export function computeScale(vw: number, vh: number): UiScale {
  const s = Math.max(0.2, Math.min(vh / DESIGN_HEIGHT, vw / DESIGN_MIN_WIDTH))
  return { s, width: vw / s, height: vh / s }
}

/** Échelle courante (lue hors React : conversion des ancres écran du runner). */
export let currentScale: UiScale = computeScale(typeof innerWidth === 'number' ? innerWidth : 1920, typeof innerHeight === 'number' ? innerHeight : 1080)

export function useUiScale(root: RefObject<HTMLElement | null>): UiScale {
  const [scale, setScale] = useState(currentScale)
  useLayoutEffect(() => {
    const apply = () => {
      const next = computeScale(window.innerWidth, window.innerHeight)
      currentScale = next
      const el = root.current
      if (el) {
        el.style.width = `${next.width}px`
        el.style.height = `${next.height}px`
        el.style.zoom = String(next.s)
      }
      setScale(prev => (prev.s === next.s && prev.width === next.width ? prev : next))
    }
    apply()
    window.addEventListener('resize', apply)
    return () => window.removeEventListener('resize', apply)
  }, [root])
  return scale
}
