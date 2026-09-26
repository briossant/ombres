// L'application du PC : le monde 3D (canvas NPR) avec les oiseaux, les FX et la mise en scène
// (agent staging : caméra, podium, repères du HUD), l'interface DOM par-dessus. Toute la logique
// vit hors React (runner, simulation) : ces composants lisent gameView / worldView / cameraCue à
// chaque frame. Ordre des useFrame : runner −10 → podium −3 → caméra −2 → repères −1,5 →
// oiseaux −1 → FX 0 → pipeline NPR 1.
// Bornes d'erreur (polish G6) : une exception dans le monde 3D ou dans l'UI affiche « Recharger »
// au lieu d'un écran blanc ; la sauvegarde de session (écrite tout de suite) reprend la partie.
import { GameCamera, HudProjector, PodiumStage, stageModes } from './camera/index.ts'
import { WorldCanvas } from './render/WorldCanvas.tsx'
import { Birds } from './render/bird/Birds.tsx'
import { Fx } from './render/fx/Fx.tsx'
import { useRenderQuality } from './render/quality.ts'
import { UiRoot } from './ui/UiRoot.tsx'
import { DEBUG, DEBUG_PERF } from './runner/debug.ts'
import { RunnerFrame } from './runner/RunnerFrame.tsx'
import { runner } from './runner/runner.ts'
import { useStage } from './runner/stageStore.ts'
import { CrashProbe, ErrorBoundary, debugCrash } from './loading/Fallback.tsx'

const CANVAS_STYLE = { position: 'fixed', inset: 0, width: '100vw', height: '100vh' } as const

/** À la première erreur d'affichage : sauvegarde immédiate (la reprise part de cet instant). */
const saveNow = (): void => runner.save(true)

// ?debug : window.__ombresCrash('world' | 'ui') lève une exception de rendu (test des secours)
if (DEBUG && typeof window !== 'undefined') (window as unknown as { __ombresCrash?: typeof debugCrash }).__ombresCrash = debugCrash

export function App() {
  const level = useRenderQuality(s => s.level)
  const glory = useStage(s => s.glorySlot)
  return (
    <>
      <ErrorBoundary label="monde" onError={saveNow}>
        <WorldCanvas style={CANVAS_STYLE} measure={DEBUG_PERF}>
          <RunnerFrame />
          <PodiumStage />
          <GameCamera />
          <HudProjector />
          <Birds quality={level} modes={stageModes} />
          <Fx quality={level} glorySlot={glory} />
          {DEBUG ? <CrashProbe target="world" /> : null}
        </WorldCanvas>
      </ErrorBoundary>
      <ErrorBoundary label="interface" onError={saveNow}>
        <UiRoot />
        {DEBUG ? <CrashProbe target="ui" /> : null}
      </ErrorBoundary>
    </>
  )
}
