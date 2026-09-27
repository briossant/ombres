// <WorldCanvas> : le Canvas R3F du jeu, réglé pour le pipeline NPR (ART_BIBLE §7.3) :
// `flat` (pas de tone mapping), pas d'AA natif (MSAA incompatible avec la passe MRT : les
// traits sont antialiasés par l'InkEffect, puis SMAA selon le preset) ni de stencil, dpr
// plafonné par le preset (Low 720p, Medium et High 1080p natif, Ultra jusqu'à 2160p et
// suréchantillonné sur un écran 1080p), FOV 40°, near 1 / far 9 000 m, profondeur standard
// (l'encre suppose une profondeur perspective, jamais logarithmique ni inversée).
// La caméra de jeu est ajoutée par l'intégration (enfant avec makeDefault).
import { Canvas } from '@react-three/fiber'
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { NprPipeline } from './npr/NprPipeline.tsx'
import { DEBUG_RENDER, PerfOverlay } from './PerfOverlay.tsx'
import { presetDpr, QUALITY_PRESETS, useRenderQuality, type QualityLevel } from './quality.ts'
import { World } from './World.tsx'

/**
 * Hauteur CSS du canvas et dpr natif, suivis par ResizeObserver et `resize` (zoom, changement
 * d'écran). Le dpr plafonné est passé en PROP au <Canvas> : R3F rappelle configure() à chaque
 * rendu du Canvas et remettrait sinon la prop par-dessus un setDpr (plafond perdu après le
 * premier podium, polish W1).
 */
function useCanvasMetrics(canvas: { current: HTMLCanvasElement | null }): { height: number; deviceDpr: number } {
  const read = () => ({
    height: canvas.current?.parentElement?.clientHeight || (typeof window !== 'undefined' ? window.innerHeight : 1080),
    deviceDpr: typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1,
  })
  const [m, setM] = useState(read)
  useEffect(() => {
    const update = () =>
      setM((prev) => {
        const next = read()
        return next.height === prev.height && next.deviceDpr === prev.deviceDpr ? prev : next
      })
    update()
    window.addEventListener('resize', update)
    const box = canvas.current?.parentElement
    const ro = box && typeof ResizeObserver !== 'undefined' ? new ResizeObserver(update) : null
    if (box) ro?.observe(box)
    return () => {
      window.removeEventListener('resize', update)
      ro?.disconnect()
    }
  }, [])
  return m
}

export interface WorldCanvasProps {
  children?: ReactNode
  /** Niveau imposé ; défaut : store useRenderQuality (réglages + banc auto). */
  quality?: QualityLevel
  /** Mesures GPU par passe (window.__timings) + overlay ; défaut : présence de ?debug dans l'URL. */
  measure?: boolean
  /** Mode debug de l'encre (0 normal, 1 traits, 2 normales, 3 profondeur, 4 IDs). */
  inkDebug?: number
  className?: string
  style?: CSSProperties
  /** Monter le monde (sol, tours, ciel…) ; false pour un canvas NPR nu. */
  world?: boolean
}

export function WorldCanvas({ children, quality, measure = DEBUG_RENDER, inkDebug = 0, className, style, world = true }: WorldCanvasProps) {
  const storeLevel = useRenderQuality((s) => s.level)
  const level = quality ?? storeLevel
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const { height, deviceDpr } = useCanvasMetrics(canvasRef)
  // dpr plafonné par le preset (720p / 1080p / 1080p ; Ultra : natif jusqu'en 2160p, SSAA 4× sur un écran 1080p)
  const dpr = presetDpr(QUALITY_PRESETS[level], height, deviceDpr)
  return (
    <>
      <Canvas
        ref={canvasRef}
        className={className}
        style={style}
        flat
        dpr={dpr}
        frameloop="always"
        gl={{ antialias: false, stencil: false, depth: true, alpha: false, powerPreference: 'high-performance', logarithmicDepthBuffer: false, reversedDepthBuffer: false }}
        camera={{ fov: 40, near: 1, far: 9000, position: [0, 260, 230] }}
      >
        <NprPipeline quality={level} measure={measure} inkDebug={inkDebug} />
        {world && <World quality={level} />}
        {children}
      </Canvas>
      {measure && <PerfOverlay />}
    </>
  )
}
