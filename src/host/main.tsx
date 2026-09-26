// Point d'entrée du PC (index.html) : démarre le runner (salle réseau, entrées, démo de l'écran
// titre qui tourne déjà derrière le chargement), monte l'application, lance le chargement.
import './threeConsole.ts'
import { createRoot } from 'react-dom/client'
import { App } from './App.tsx'
import { bootGame } from './loading/loader.ts'
import { runner } from './runner/runner.ts'

runner.start()
createRoot(document.getElementById('root')!).render(<App />)
void bootGame()
