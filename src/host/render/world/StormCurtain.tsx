// <StormCurtain> : le rideau du Simoun (ART_BIBLE §6.5, GDD §4.3), 12 m de haut au
// bord de l'ellipse. Aplat mix(sandShade, haze, 0,3) à 70 %, qui s'effiloche vers le
// haut en festons, parcouru de traits d'encre horizontaux qui défilent tangentiellement
// à 6 m/s (les seules hachures animées du jeu). Transparent, pas de contour.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GLSL } from '../npr/glsl/index.ts'
import { NPR } from '../npr/uniforms.ts'
import { worldView } from '../worldView.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'

const HEIGHT = 12

function curtainGeometry(a: number, b: number): THREE.BufferGeometry {
  const N = 360
  const rows = 4
  const pos: number[] = []
  const uv: number[] = []
  const idx: number[] = []
  // longueur d'arc cumulée (approximation de Ramanujan inutile : on somme les cordes)
  let arc = 0
  let px = a
  let pz = 0
  for (let i = 0; i <= N; i++) {
    const t = (i / N) * Math.PI * 2
    const x = Math.cos(t) * a * 1.005
    const z = -Math.sin(t) * b * 1.005
    if (i > 0) arc += Math.hypot(x - px, z - pz)
    px = x
    pz = z
    for (let k = 0; k <= rows; k++) {
      const v = k / rows
      pos.push(x, v * HEIGHT, z)
      uv.push(arc, v)
    }
  }
  for (let i = 0; i < N; i++)
    for (let k = 0; k < rows; k++) {
      const p = i * (rows + 1) + k
      const q = (i + 1) * (rows + 1) + k
      idx.push(p, q, q + 1, p, q + 1, p + 1)
    }
  const g = new THREE.BufferGeometry()
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3))
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying float vDist;
void main(){
  vUv = uv;
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${GLSL.mrt}
${GLSL.common}
${GLSL.oklab}
${GLSL.palette}
${GLSL.night}
${GLSL.fog}
uniform float uVisible;
varying vec2 vUv;
varying vec3 vWorld;
varying float vDist;
void main(){
  float arc = vUv.x;
  float v = vUv.y;
  float nd = nightDist(vWorld.xz);
  float nw = max(fwidth(nd), 1e-3);
  float y = vWorld.y;
  float dy = max(fwidth(y), 1e-4);
  float n = nightMask(nd, nw);
  // sommet festonné qui ondule doucement
  float top = 0.62 + 0.22 * abs(sin(arc / 9.0 + uTime * 0.4)) + 0.1 * sin(arc / 3.7 - uTime * 0.9);
  float dv = max(fwidth(v), 1e-5);
  float body = 1.0 - smoothstep(top - dv, top + dv, v);          // aplat net, bord festonné
  float edge = (1.0 - smoothstep(0.0, 1.2 * uPx, abs(v - top) * HEIGHT_M / dy)) * step(v, top + 0.02);
  vec3 veil = mixLab(mix(uSandShade, uNSandShade, n), palHaze(n), 0.3);
  float streak = lineCov(y + 0.35 * sin(arc * 0.11 + y), 1.7, dy, 1.0 * uPx)
               * step(0.6, fract((arc - uTime * 6.0) / 19.0 + 0.37 * floor(y / 1.7)));
  float f = fogAt(vDist);
  vec3 col = mix(veil, palInk(n), 0.4 * streak * (1.0 - smoothstep(0.3, 0.6, f)));
  col = mix(col, palInk(n), 0.35 * edge);
  col = applyFog(col, f, n);
  float alpha = (0.7 * body + 0.3 * edge) * uVisible;
  if (alpha < 0.01) discard;
  gl_FragColor = vec4(col, alpha);
  gNormalId = vec4(0.0);
}
`.replace(/HEIGHT_M/g, HEIGHT.toFixed(1))

export function StormCurtain({ arena }: { arena: { a: number; b: number } }) {
  const geometry = useMemo(() => curtainGeometry(arena.a, arena.b), [arena])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'world.storm',
        uniforms: { ...NPR, uVisible: { value: 1 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
      }),
    [],
  )
  useEffect(() => () => geometry.dispose(), [geometry])
  useEffect(() => () => material.dispose(), [material])
  useNprFrame(() => {
    material.uniforms.uVisible!.value = worldView.hideStorm ? 0 : 1
  })
  return <mesh geometry={geometry} material={material} renderOrder={5} name="storm" frustumCulled={false} />
}
