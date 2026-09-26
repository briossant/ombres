// <WorldCanvas> : le Canvas R3F du jeu, réglé pour le pipeline NPR (ART_BIBLE §7.3) :
// `flat` (pas de tone mapping), pas d'AA natif ni de stencil, dpr plafonné par le
// preset (720p / 900p / 1080p), FOV 40°, near 1 / far 9 000 m, profondeur standard
// (l'encre suppose une profondeur perspective, jamais logarithmique ni inversée).
// La caméra de jeu est ajoutée par l'intégration (enfant avec makeDefault).
import { Canvas } from '@react-three/fiber'
import type { CSSProperties, ReactNode } from 'react'
import { NprPipeline } from './npr/NprPipeline.tsx'
import { DEBUG_RENDER, PerfOverlay } from './PerfOverlay.tsx'
import { useRenderQuality, type QualityLevel } from './quality.ts'
import { World } from './World.tsx'

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
  return (
    <>
      <Canvas
        className={className}
        style={style}
        flat
        dpr={1}
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
