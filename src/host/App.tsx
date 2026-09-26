// L'application du PC : le monde 3D (canvas NPR) avec les oiseaux, les FX et la mise en scène
// (agent staging : caméra, podium, repères du HUD), l'interface DOM par-dessus. Toute la logique
// vit hors React (runner, simulation) : ces composants lisent gameView / worldView / cameraCue à
// chaque frame. Ordre des useFrame : runner −10 → podium −3 → caméra −2 → repères −1,5 →
// oiseaux −1 → FX 0 → pipeline NPR 1.
import { GameCamera, HudProjector, PodiumStage, stageModes } from './camera/index.ts'
import { WorldCanvas } from './render/WorldCanvas.tsx'
import { Birds } from './render/bird/Birds.tsx'
import { Fx } from './render/fx/Fx.tsx'
import { useRenderQuality } from './render/quality.ts'
import { UiRoot } from './ui/UiRoot.tsx'
import { DEBUG_PERF } from './runner/debug.ts'
import { RunnerFrame } from './runner/RunnerFrame.tsx'
import { useStage } from './runner/stageStore.ts'

const CANVAS_STYLE = { position: 'fixed', inset: 0, width: '100vw', height: '100vh' } as const

export function App() {
  const level = useRenderQuality(s => s.level)
  const glory = useStage(s => s.glorySlot)
  return (
    <>
      <WorldCanvas style={CANVAS_STYLE} measure={DEBUG_PERF}>
        <RunnerFrame />
        <PodiumStage />
        <GameCamera />
        <HudProjector />
        <Birds quality={level} modes={stageModes} />
        <Fx quality={level} glorySlot={glory} />
      </WorldCanvas>
      <UiRoot />
    </>
  )
}
