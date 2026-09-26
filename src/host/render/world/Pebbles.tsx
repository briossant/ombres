// <Pebbles> : cailloux et tirets d'encre du sable, avec micro-ombres qui s'allongent
// au couchant (R15, ART_BIBLE §5.3, §6.5). Deux maillages instanciés d'un même quad :
//   1. ellipse d'encre 2,2:1 à 55 %, surtout horizontale à l'écran ;
//   2. ombre étirée le long des ombres, longueur h·cot(e) PLAFONNÉE à 4 × la taille
//      (8× faisait « pluie »), castShadow, 0,7 → 0,5 sous 10° ; elle lit la height map
//      dans le vertex shader et disparaît dans l'ombre d'une tour.
// Densité : faible au centre de l'arène (zone focale), plus forte vers le bord et au-delà.
// Transparents, pas de contour (gNormalId = 0).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import type { TowerDef } from '../../../sim/types.ts'
import { GLSL } from '../npr/glsl/index.ts'
import { NPR } from '../npr/uniforms.ts'
import { duneHeight } from './terrain.ts'

function rng(seed: number): () => number {
  let s = seed >>> 0 || 1
  return () => {
    s = (s + 0x6d2b79f5) >>> 0
    let t = s
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Répartition des cailloux sur une étendue monde FIXE (±470 m, densité constante quelle
 * que soit l'arène) : plus clairsemés au centre de l'arène (zone focale). Leur taille suit
 * l'échelle de l'arène (la caméra de jeu se rapproche des petites arènes) pour rester à
 * 2-6 px de long à l'écran.
 */
function scatter(count: number, arena: { a: number; b: number }, towers: readonly TowerDef[]): Float32Array {
  const r = rng(0x5eb1e5 + Math.round(arena.a))
  const inst = new Float32Array(count * 4)
  const sizeScale = Math.sqrt(arena.a / 165)
  let n = 0
  let guard = 0
  while (n < count && guard++ < count * 20) {
    const R = Math.sqrt(r()) * 470
    const th = r() * Math.PI * 2
    const x = Math.cos(th) * R
    const z = Math.sin(th) * R
    const rho = Math.hypot(x / arena.a, z / arena.b)
    // zone focale : on éclaircit le centre de l'arène
    const keep = rho < 0.95 ? 0.25 + 0.75 * Math.pow(rho / 0.95, 2) : 1
    if (r() > keep) continue
    // pas au pied des tours
    let nearTower = false
    for (const t of towers) if (Math.hypot(x - t.x, -z - t.y) < t.trunkRadius + 3) nearTower = true
    if (nearTower) continue
    const size = (0.34 + Math.pow(r(), 2.0) * 0.75) * sizeScale // 2-6 px de long à l'écran en vue de jeu
    inst[n * 4] = x
    inst[n * 4 + 1] = duneHeight(x, z, arena)
    inst[n * 4 + 2] = z
    inst[n * 4 + 3] = size * (r() < 0.5 ? 1 : -1) // signe : sens du tiret (léger angle)
    n++
  }
  return inst.subarray(0, n * 4)
}

const VERT = /* glsl */ `
${GLSL.common}
${GLSL.palette}
${GLSL.shadow}
${GLSL.fog}
attribute vec4 inst;
uniform float uIsShadow;
varying vec2 vQ;
varying float vFade;
varying float vLit;
varying float vShadowFade;
void main(){
  float s = abs(inst.w);
  float tilt = sign(inst.w) * 0.18 * fract(inst.x * 0.137 + inst.z * 0.071);
  vec2 ax = vec2(cos(tilt), sin(tilt));
  vec2 ay = vec2(-ax.y, ax.x);
  vec3 p;
  if (uIsShadow > 0.5) {
    // ombre étirée le long des ombres, longueur plafonnée à 4 × la taille
    float h = s * 0.8;
    float len = min(h * length(uSunDir.xz) / max(uSunDir.y, 0.035), 4.0 * s);
    vec2 sd = uShadowDir;
    float along = position.z + 0.5;                    // 0..1 le long de l'ombre
    vec2 q = sd * (along * len + 0.15 * s) + vec2(-sd.y, sd.x) * position.x * s * 1.5;
    p = vec3(q.x, 0.0, q.y);
    vQ = vec2(position.x * 2.0, along * 2.0 - 1.0);
    vShadowFade = smoothstep(0.02, 0.6, len / s);      // midi : pas d'ombre visible
  } else {
    vec2 q = ax * position.x * s * 2.2 + ay * position.z * s;
    p = vec3(q.x, 0.0, q.y);
    vQ = position.xz * 2.0;
    vShadowFade = 1.0;
  }
  vec3 wp = inst.xyz + p + vec3(0.0, 0.04, 0.0);
  vLit = 1.0 - smoothstep(0.35, 0.65, sampleShadow(inst.xyz, 0.3).x);
  vec4 mv = viewMatrix * vec4(wp, 1.0);
  vFade = 1.0 - smoothstep(0.3, 0.6, fogAt(length(mv.xyz)));
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${GLSL.mrt}
${GLSL.palette}
uniform float uIsShadow;
varying vec2 vQ;
varying float vFade;
varying float vLit;
varying float vShadowFade;
void main(){
  float d = uIsShadow > 0.5 ? length(vec2(vQ.x, max(abs(vQ.y) - 0.55, 0.0) * 2.2)) : length(vQ);
  float aa = fwidth(d);
  float a = 1.0 - smoothstep(1.0 - aa, 1.0 + aa, d);
  vec3 c = uIsShadow > 0.5 ? uCastShadow : uInk;
  float alpha = a * vFade * (uIsShadow > 0.5 ? mix(0.5, 0.7, smoothstep(0.10, 0.20, uSunDir.y)) * vLit * vShadowFade : 0.55);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(c, alpha);
  gNormalId = vec4(0.0);   // alpha 0 : la normale et l'ID du sol restent intacts (pas de contour)
}
`

export interface PebblesProps {
  arena: { a: number; b: number }
  towers: readonly TowerDef[]
  count: number
  shadows: boolean
}

export function Pebbles({ arena, towers, count, shadows }: PebblesProps) {
  const meshes = useMemo(() => {
    const inst = scatter(count, arena, towers)
    const n = inst.length / 4
    const quad = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2)
    const make = (isShadow: boolean) => {
      const g = new THREE.InstancedBufferGeometry()
      g.index = quad.index
      g.setAttribute('position', quad.getAttribute('position'))
      g.setAttribute('inst', new THREE.InstancedBufferAttribute(inst, 4))
      g.instanceCount = n
      const m = new THREE.ShaderMaterial({
        name: isShadow ? 'world.pebbleShadow' : 'world.pebble',
        transparent: true,
        depthWrite: false,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
        uniforms: { ...NPR, uIsShadow: { value: isShadow ? 1 : 0 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
      })
      const mesh = new THREE.Mesh(g, m)
      mesh.frustumCulled = false
      mesh.renderOrder = isShadow ? 1 : 2
      mesh.name = m.name
      return mesh
    }
    return { pebbles: make(false), shadows: make(true), quad }
  }, [arena, towers, count])
  useEffect(
    () => () => {
      for (const m of [meshes.pebbles, meshes.shadows]) {
        m.geometry.dispose()
        ;(m.material as THREE.Material).dispose()
      }
      meshes.quad.dispose()
    },
    [meshes],
  )
  return (
    <group name="pebbles">
      {shadows && <primitive object={meshes.shadows} />}
      <primitive object={meshes.pebbles} />
    </group>
  )
}
