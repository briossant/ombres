// Point d'entrée du PC (index.html) : démarre le runner (salle réseau, entrées, démo de l'écran
// titre qui tourne déjà derrière le chargement), monte l'application, lance le chargement.
// Sans WebGL 2, rien ne démarre (aucune salle ouverte) : écran explicatif à la place (polish G6).
import './threeConsole.ts'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { bootGame } from './loading/loader.ts'
import { NoWebGL, hasWebGL2 } from './loading/Fallback.tsx'
import { runner } from './runner/runner.ts'

const root = createRoot(document.getElementById('root')!)
if (hasWebGL2()) {
  runner.start()
  root.render(<App />)
  void bootGame()
} else {
  console.warn('[ombres] WebGL 2 indisponible : écran explicatif, aucune salle ouverte')
  root.render(<NoWebGL />)
}
