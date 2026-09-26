// <StormCurtain> : le rideau du Simoun (ART_BIBLE §6.5, GDD §4.3), 12 m de haut au
// bord de l'ellipse. Aplat OPAQUE mix(sandShade, haze, 0,3) découpé en festons nets
// (cernés par l'encre), parcouru de traits d'encre horizontaux qui défilent
// tangentiellement à 6 m/s (les seules hachures animées du jeu). Polish W10 : plus de
// voile translucide qui salissait le cadre ; à moins de 80 m de la caméra ou devant un
// oiseau, il se dissout en trame (screen-door IGN, ID « trame » ignoré par l'encre).
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { GLSL } from '../npr/glsl/index.ts'
import { OBJ_ID } from '../npr/ids.ts'
import { NPR } from '../npr/uniforms.ts'
import { worldView } from '../worldView.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'

const HEIGHT = 12

function curtainGeometry(a: number, b: number): THREE.BufferGeometry {
  const N = 360
  const rows = 4
  const pos: number[] = []
  const uv: number[] = []
  const nrm: number[] = []
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
    // normale extérieure de l'ellipse (gradient de x²/a² + z²/b²)
    const nx = Math.cos(t) / a
    const nz = -Math.sin(t) / b
    const nl = Math.hypot(nx, nz) || 1
    for (let k = 0; k <= rows; k++) {
      const v = k / rows
      pos.push(x, v * HEIGHT, z)
      uv.push(arc, v)
      nrm.push(nx / nl, 0, nz / nl)
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
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3))
  g.setIndex(idx)
  g.computeBoundingSphere()
  return g
}

const VERT = /* glsl */ `
varying vec2 vUv;
varying vec3 vWorld;
varying float vDist;
varying vec3 vViewN;
void main(){
  vUv = uv;
  vViewN = normalize(normalMatrix * normal);
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
uniform vec3 uStormVeil, uNStormVeil;
uniform vec4 uBirdScr[12];
uniform float uBirdScrN;
varying vec2 vUv;
varying vec3 vWorld;
varying float vDist;
varying vec3 vViewN;
void main(){
  float arc = vUv.x;
  float v = vUv.y;
  float nd = nightDist(vWorld.xz);
  float nw = max(fwidth(nd), 1e-3);
  float y = vWorld.y;
  float dy = max(fwidth(y), 1e-4);
  float n = nightMask(nd, nw);
  // sommet festonné qui ondule doucement : découpe nette (pas d'alpha), l'encre cerne le feston
  float top = 0.62 + 0.22 * abs(sin(arc / 9.0 + uTime * 0.4)) + 0.1 * sin(arc / 3.7 - uTime * 0.9);
  vec3 veil = mix(uStormVeil, uNStormVeil, n);   // mix OKLab (sandShade, haze, 0,3) calculé sur le CPU (palette.ts)
  float streak = lineCov(y + 0.35 * sin(arc * 0.11 + y), 1.7, dy, 1.0 * uPx)
               * step(0.6, fract((arc - uTime * 6.0) / 19.0 + 0.37 * floor(y / 1.7)));
  float f = fogAt(vDist);
  vec3 col = mix(veil, palInk(n), 0.4 * streak * (1.0 - smoothstep(0.3, 0.6, f)));
  col = applyFog(col, f, n);
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  // dissolution en trame : près de la caméra (< 80 m) ou devant un oiseau
  float sdoor = 1.0 - smoothstep(40.0, 80.0, vDist);
  for (int i = 0; i < 12; i++) {
    if (float(i) >= uBirdScrN) break;
    vec4 B = uBirdScr[i];
    if (vDist < B.w) sdoor = max(sdoor, 1.0 - smoothstep(0.7, 1.0, length(gl_FragCoord.xy - B.xy) / B.z));
  }
  if (uVisible < 0.5 || v > top || ign(gl_FragCoord.xy) < 0.9 * sdoor) discard;
  gl_FragColor = vec4(col, 1.0);
  writeGBuffer(gl_FrontFacing ? vViewN : -vViewN, sdoor > 0.0 ? ${OBJ_ID.screenDoor}.0 : ${OBJ_ID.storm}.0);
}
`

export function StormCurtain({ arena }: { arena: { a: number; b: number } }) {
  const geometry = useMemo(() => curtainGeometry(arena.a, arena.b), [arena])
  const material = useMemo(
    () =>
      new THREE.ShaderMaterial({
        name: 'world.storm',
        uniforms: { ...NPR, uVisible: { value: 1 } },
        vertexShader: VERT,
        fragmentShader: FRAG,
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
