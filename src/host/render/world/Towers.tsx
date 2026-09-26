// <Towers> : corps (exacts, casters d'ombre) + décor des tours de la carte.
// Deux draw calls pour toutes les tours (géométries fusionnées en repère monde).
// Dissolution en trame (polish W9) : le matériau efface en trame ce qui, au-dessus de 20 m,
// passe devant un oiseau (positions écran : world/birdScreen.ts) ou frôle la caméra. Coupée
// au podium (les tours y sont des perchoirs).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { TowerDef } from '../../../sim/types.ts'
import { cameraState } from '../../camera/cue.ts'
import { gameView } from '../../view.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'
import { shadowCasters } from '../npr/shadowMap.ts'
import { buildTowerGeometries } from './towerGeometry.ts'
import { createTowerMaterial } from './towerMaterial.ts'

export function Towers({ towers }: { towers: readonly TowerDef[] }) {
  const material = useMemo(() => createTowerMaterial(), [])
  const geos = useMemo(() => buildTowerGeometries(towers), [towers])
  const meshes = useMemo(() => {
    const body = new THREE.Mesh(geos.body, material)
    body.name = 'towers.body'
    const decor = new THREE.Mesh(geos.decor, material)
    decor.name = 'towers.decor'
    return { body, decor }
  }, [geos, material])

  useEffect(() => {
    const h = shadowCasters.add(meshes.body, { owner: 0, strength: 1 })
    return () => {
      h.dispose()
      geos.body.dispose()
      geos.decor.dispose()
    }
  }, [meshes, geos])
  useEffect(() => () => material.dispose(), [material])

  useNprFrame(() => {
    // positions écran des oiseaux : NPR.uBirdScr (World, birdScreen.ts) ; coupée au podium
    material.uniforms.uDissolve.value = gameView.sim !== null && cameraState.mode !== 'podium' ? 1 : 0
  })

  return (
    <group name="towers">
      <primitive object={meshes.body} />
      <primitive object={meshes.decor} />
    </group>
  )
}
