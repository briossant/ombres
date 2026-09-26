// <Ground> : la toile de l'arène, les dunes hors arène et l'anneau lointain, avec
// le matériau du sol (territoire, ombres, nuit, Simoun). Lit gameView à chaque
// frame (texture de territoire par rectangle sale, ≤ 20 Hz).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { TowerDef } from '../../../sim/types.ts'
import { simEvents } from '../../bus.ts'
import { gameView } from '../../view.ts'
import { OBJ_ID } from '../npr/ids.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'
import { worldView } from '../worldView.ts'
import { createGroundMaterial, createGroundUniforms, MAX_SPLASHES } from './groundMaterial.ts'
import { duneAt, type TerrainShape } from './terrain.ts'
import { TerritoryTexture } from './territoryTexture.ts'

const GROUND_SIZE = 1800
const FAR_INNER = 880

function buildGroundGeometry(shape: TerrainShape, segments: number): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(GROUND_SIZE, GROUND_SIZE, segments, segments).rotateX(-Math.PI / 2)
  const pos = g.attributes.position as THREE.BufferAttribute
  const crest = new Float32Array(pos.count * 2)
  const s = { h: 0, phase: 0, amp: 0 }
  for (let i = 0; i < pos.count; i++) {
    duneAt(pos.getX(i), pos.getZ(i), shape, s)
    pos.setY(i, s.h)
    crest[i * 2] = s.phase
    crest[i * 2 + 1] = s.amp
  }
  g.setAttribute('crest', new THREE.BufferAttribute(crest, 2))
  g.computeVertexNormals()
  // la toile de l'arène est parfaitement plate : normales exactes (pas de moyenne parasite)
  const nrm = g.attributes.normal as THREE.BufferAttribute
  for (let i = 0; i < pos.count; i++) if (pos.getY(i) === 0 && crest[i * 2 + 1] === 0) nrm.setXYZ(i, 0, 1, 0)
  return g
}

function buildFarGeometry(): THREE.BufferGeometry {
  const g = new THREE.RingGeometry(FAR_INNER, 9000, 96, 1).rotateX(-Math.PI / 2)
  g.setAttribute('crest', new THREE.BufferAttribute(new Float32Array(g.attributes.position!.count * 2), 2))
  return g
}

interface Splash {
  x: number
  z: number
  dx: number
  dz: number
  code: number
  start: number
}

/**
 * Emplacement de la cuvette de sol craquelé (une par carte) : côté est, vers 70 % du rayon
 * elliptique (hors de l'anneau d'apparition à 45 %), à 30 m au moins des tours.
 */
function crackSpot(arena: { a: number; b: number }, towers: readonly TowerDef[], seed: number): [number, number, number] | null {
  let s = seed >>> 0 || 1
  const rnd = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296)
  for (let k = 0; k < 40; k++) {
    const th = (-0.9 + rnd() * 1.8) + (rnd() < 0.3 ? Math.PI : 0)
    const rho = 0.62 + rnd() * 0.16
    const x = Math.cos(th) * rho * arena.a
    const y = Math.sin(th) * rho * arena.b
    const R = 18 + rnd() * 8
    if (towers.every((t) => Math.hypot(t.x - x, t.y - y) > R + t.trunkRadius + 12)) return [x, -y, R]
  }
  return null
}

export interface GroundProps {
  arena: { a: number; b: number }
  towers: readonly TowerDef[]
  segments: number
  /** Classification bilinéaire 4 taps (preset bas) au lieu de la B-spline 3×3. */
  bilinear?: boolean
}

export function Ground({ arena, towers, segments, bilinear = false }: GroundProps) {
  const territory = useMemo(() => new TerritoryTexture(), [])
  const uniforms = useMemo(() => createGroundUniforms(territory.texture), [territory])
  const material = useMemo(() => createGroundMaterial(uniforms, { bilinear }), [uniforms, bilinear])
  const geometry = useMemo(() => buildGroundGeometry(arena, segments), [arena, segments])
  const far = useMemo(() => buildFarGeometry(), [])

  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useEffect(() => {
    const spot = crackSpot(arena, towers, (towers[0]?.seed ?? 7) ^ 0xc4ac)
    if (spot) uniforms.uCrack.value.set(spot[0], spot[1], spot[2], 1)
    else uniforms.uCrack.value.set(0, 0, 0, 0)
  }, [arena, towers, uniforms])
  useEffect(
    () => () => {
      far.dispose()
      territory.dispose()
    },
    [far, territory],
  )

  // taches de piqué : sur l'événement diveHit, dans la direction du piqué
  const splashes = useMemo<Splash[]>(() => [], [])
  useEffect(
    () =>
      simEvents.on((e) => {
        if (e.type !== 'diveHit') return
        const sim = gameView.sim
        const h = sim?.bySlot[e.hunter]
        let dx = 1
        let dz = 0
        if (h) {
          dx = Math.cos(h.heading)
          dz = -Math.sin(h.heading)
        }
        if (splashes.length >= MAX_SPLASHES) splashes.shift()
        splashes.push({ x: e.x, z: -e.y, dx, dz, code: e.hunter + 1, start: sim?.time ?? 0 })
      }),
    [splashes],
  )

  useNprFrame((state) => {
    const sim = gameView.sim
    const u = uniforms
    u.uArena.value.set(arena.a, arena.b, sim?.arena.stormFrom ?? 0.92, worldView.hideStorm ? 0 : 1)
    u.uTerrWarp.value = worldView.exactBorders ? 0.5 * (sim ? sim.grid.cellW : 0.65) : 2.2
    if (!sim) return
    const g = sim.grid
    // temps de sim interpolé (animations du lavis au rythme de la sim, ralentis compris)
    const now = sim.time + (gameView.alpha - 1) / 30
    territory.update(state.gl, g, sim.time)
    u.uTerrGrid.value.set(g.x0, g.y0, 1 / g.cellW, 1 / g.cellH)
    u.uTerrSize.value.set(g.cols, g.rows)
    u.uTerrClock.value = TerritoryTexture.clock(now)
    // taches de piqué
    let n = 0
    for (let i = splashes.length - 1; i >= 0; i--) {
      const s = splashes[i]!
      const age = now - s.start
      if (age > 0.8 || age < -1) {
        splashes.splice(i, 1)
        continue
      }
    }
    for (const s of splashes) {
      u.uSplash.value[n]!.set(s.x, s.z, Math.max(0, now - s.start), s.code)
      u.uSplashDir.value[n]!.set(s.dx, s.dz)
      n++
    }
    for (let i = n; i < MAX_SPLASHES; i++) u.uSplash.value[i]!.w = 0
    u.uSplashCount.value = n
    // illumination des résultats
    const il = worldView.illumination
    if (il.start >= 0) {
      const t = gameView.realTime - il.start
      const span = 2 * arena.a + 40
      u.uIllum.value.set(-arena.a - 20 + span * Math.min(1, t / 0.8), 1, il.winnerSlot + 1, Math.max(0, t - 0.8))
    } else u.uIllum.value.set(-1e4, 0, 0, 99)
  }, -50)

  // renderOrder 900 : le sol (le shader le plus lourd) passe APRÈS tous les opaques (tours,
  // oiseaux, horizon) — le test de profondeur précoce élimine les pixels qu'ils couvrent —
  // et avant le ciel (1000, dessiné en dernier).
  return (
    <group name="ground">
      <mesh geometry={geometry} material={material} renderOrder={900} userData={{ objId: OBJ_ID.ground }} />
      <mesh geometry={far} material={material} position={[0, -0.05, 0]} renderOrder={900} />
    </group>
  )
}
