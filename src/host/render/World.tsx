// <World> : tout le décor du jeu, piloté par gameView (sim) et worldView
// (présentation). À placer dans un <WorldCanvas> (ou un Canvas avec <NprPipeline>).
//   sol + territoire + ombres + nuit + Simoun, tours, horizon (Falaise, mesas,
//   Géantes lointaines, dunes), ciel, cailloux, fils d'ombre, empreintes, glyphes.
// Les éléments « statiques » (arène, tours, Falaise) sont relus quand la sim change
// de carte ; tout le reste est mis à jour par frame, sans re-render React.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { SimState, TowerDef } from '../../sim/types.ts'
import { gameView } from '../view.ts'
import { BirdFootprints } from './npr/footprints.ts'
import { NPR } from './npr/uniforms.ts'
import { useNprFrame } from './npr/NprPipeline.tsx'
import { QUALITY_PRESETS, type QualityLevel } from './quality.ts'
import { updateBirdScreen } from './world/birdScreen.ts'
import { updateCountdownSketch } from './world/countdownSketch.ts'
import { applyWorldFrame, type WorldFrameResult } from './world/frame.ts'
import { Ground } from './world/Ground.tsx'
import { Horizon } from './world/Horizon.tsx'
import { Pebbles } from './world/Pebbles.tsx'
import { ShadowThreads } from './world/ShadowThreads.tsx'
import { Sky } from './world/Sky.tsx'
import { StormCurtain } from './world/StormCurtain.tsx'
import { FootprintGlyphs } from './world/FootprintGlyphs.tsx'
import { Towers } from './world/Towers.tsx'
import { worldView } from './worldView.ts'

interface MapConfig {
  key: string
  arena: { a: number; b: number }
  towers: readonly TowerDef[]
}

const EMPTY: MapConfig = { key: '', arena: { a: 165, b: 114 }, towers: [] }

function mapKey(sim: SimState | null): string {
  if (!sim) return ''
  return `${sim.config.mapId}|${sim.config.mirror ? 1 : 0}|${sim.arena.a}|${sim.arena.b}|${sim.towers.length}|${sim.towers[0]?.seed ?? 0}`
}

export interface WorldProps {
  quality: QualityLevel
}

export function World({ quality }: WorldProps) {
  const preset = QUALITY_PRESETS[quality]
  const [map, setMap] = useState<MapConfig>(EMPTY)
  const frame = useRef<WorldFrameResult | null>(null)
  const footprints = useMemo(() => new BirdFootprints(), [])
  useEffect(() => () => footprints.dispose(), [footprints])

  const lastTowers = useRef<readonly TowerDef[] | null>(null)
  // même arène (a, b) d'une carte à l'autre (démo du titre : 6 oiseaux, 4 cartes) : même objet,
  // pour que sol, rideau et cailloux ne reconstruisent pas une géométrie identique (polish tech, vague 2)
  const lastArena = useRef(EMPTY.arena)
  useNprFrame((state) => {
    const sim = gameView.sim
    // la carte ne change qu'entre deux manches : on ne reconstruit la clé que si les tours changent
    if (sim && sim.towers !== lastTowers.current) {
      lastTowers.current = sim.towers
      const key = mapKey(sim)
      if (key !== map.key) {
        const prev = lastArena.current
        const arena = prev.a === sim.arena.a && prev.b === sim.arena.b ? prev : { a: sim.arena.a, b: sim.arena.b }
        lastArena.current = arena
        setMap({ key, arena, towers: sim.towers })
      }
    }
    frame.current = applyWorldFrame(gameView, worldView, state.camera)
    updateBirdScreen(gameView, state.camera, NPR.uResolution.value.x, NPR.uResolution.value.y)
    updateCountdownSketch(gameView)
    if (sim) footprints.updateFromSim(sim, gameView.prevBirds, gameView.alpha)
    else footprints.update([], 0, 1, 0)
  }, -100)

  if (!map.key) return <Sky clouds={preset.clouds} frame={frame} />
  return (
    <>
      <Ground arena={map.arena} towers={map.towers} segments={preset.groundSegments} bilinear={quality === 'low'} />
      <Towers towers={map.towers} />
      <Horizon arena={map.arena} />
      <StormCurtain arena={map.arena} />
      <Pebbles arena={map.arena} towers={map.towers} count={preset.pebbles} shadows={preset.pebbleShadows} />
      <ShadowThreads />
      <FootprintGlyphs />
      <Sky clouds={preset.clouds} frame={frame} />
    </>
  )
}
