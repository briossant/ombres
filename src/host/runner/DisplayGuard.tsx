// Garde de l'image (dans le <Canvas>) : écoute la perte et le retour du contexte WebGL du jeu.
// three.js appelle déjà preventDefault() sur 'webglcontextlost' (le navigateur peut donc rendre le
// contexte) et recrée ses ressources GPU au retour ; le runner, lui, met la manche en pause et
// affiche « L'image s'est interrompue » tant que l'image manque (polish tech, vague 2).
// ?debug : window.__ombres.gl = le WebGLRenderer (renderer.info : objets GPU vivants, mesures de fuite).
import { useThree } from '@react-three/fiber'
import { useEffect } from 'react'
import { DEBUG } from './debug.ts'
import { runner } from './runner.ts'

export function DisplayGuard() {
  const gl = useThree(s => s.gl)
  useEffect(() => {
    const canvas = gl.domElement
    const onLost = () => runner.onDisplayLost()
    const onRestored = () => runner.onDisplayRestored()
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)
    // contexte déjà perdu au montage (perte pendant le chargement)
    if (gl.getContext().isContextLost()) onLost()
    const dbg = DEBUG ? (window as unknown as { __ombres?: Record<string, unknown> }).__ombres : undefined
    if (dbg) dbg.gl = gl
    return () => {
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      if (dbg && dbg.gl === gl) delete dbg.gl
    }
  }, [gl])
  return null
}
