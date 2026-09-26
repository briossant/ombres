// Hook R3F : inscrit un maillage comme caster de la height shadow map tant qu'il
// est monté. Les options dynamiques (force, propriétaire) passent par le handle.
import { useEffect, useRef, type RefObject } from 'react'
import type * as THREE from 'three'
import { shadowCasters, type CasterHandle, type CasterOptions } from './shadowMap.ts'

/**
 * @example
 *   const mesh = useRef<THREE.Mesh>(null)
 *   const caster = useShadowCaster(mesh, { owner: slot + 1, strength: 1, deform: flightDeform })
 *   useFrame(() => caster.current?.setStrength(bird.strong ? 1 : 0.6))
 */
export function useShadowCaster(
  ref: RefObject<THREE.Mesh | THREE.SkinnedMesh | THREE.InstancedMesh | null>,
  opts: CasterOptions & { followVisibility?: boolean } = {},
  deps: unknown[] = [],
): RefObject<CasterHandle | null> {
  const handle = useRef<CasterHandle | null>(null)
  useEffect(() => {
    const mesh = ref.current
    if (!mesh) return
    const h = shadowCasters.add(mesh, opts)
    handle.current = h
    return () => {
      h.dispose()
      handle.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, ...deps])
  return handle
}
