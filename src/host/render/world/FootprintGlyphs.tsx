// <FootprintGlyphs> : mode daltonien — glyphe du joueur à l'encre (60 %, 14 px) au
// centre de son empreinte d'ombre, si elle fait plus de 40 px à l'écran (ART_BIBLE
// §3.5). Sprites instanciés à taille écran constante, un seul draw call.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { PLAYER_COLORS } from '../../../shared/players.ts'
import { gameView } from '../../view.ts'
import { GLSL } from '../npr/glsl/index.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'
import { NPR } from '../npr/uniforms.ts'
import { GLYPH_COUNT, glyphAtlas } from './glyphAtlas.ts'

const MAX = 12

const VERT = /* glsl */ `
${GLSL.common}
${GLSL.palette}
${GLSL.fog}
attribute vec4 aCenter;      // (x, y, z three, rayon de l'empreinte en m)
attribute vec2 aGlyph;       // (index du glyphe, opacité)
varying vec2 vUv;
varying float vAlpha;
varying float vGlyph;
void main(){
  // rapproché de la caméra de 4 m : le quad (étendu en espace écran) ne passe pas sous le sol
  vec4 mvc = viewMatrix * vec4(aCenter.xyz, 1.0);
  mvc.xyz *= max(0.0, 1.0 - 4.0 / max(length(mvc.xyz), 1.0));
  vec4 c = projectionMatrix * mvc;
  // taille écran de l'empreinte (px) : on n'affiche que si elle dépasse 40 px
  float rPx = aCenter.w / c.w * projectionMatrix[1][1] * 0.5 * uResolution.y;
  float show = smoothstep(18.0 * uPx, 22.0 * uPx, rPx);
  vec2 off = position.xy * 14.0 * uPx;
  c.xy += off / uResolution * 2.0 * c.w;
  gl_Position = c;
  vUv = position.xy + 0.5;
  vAlpha = aGlyph.y * show * (1.0 - smoothstep(0.3, 0.6, fogAt(length((viewMatrix * vec4(aCenter.xyz, 1.0)).xyz))));
  vGlyph = aGlyph.x;
}
`

const FRAG = /* glsl */ `
${GLSL.mrt}
${GLSL.palette}
uniform sampler2D uAtlas;
varying vec2 vUv;
varying float vAlpha;
varying float vGlyph;
void main(){
  vec2 uv = vec2((vGlyph + vUv.x) / ${GLYPH_COUNT}.0, vUv.y);
  float a = texture2D(uAtlas, uv).a * vAlpha * 0.6;
  if (a < 0.01) discard;
  gl_FragColor = vec4(uInk, a);
  gNormalId = vec4(0.0);
}
`

export function FootprintGlyphs() {
  const { mesh, center, glyph } = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 1)
    const g = new THREE.InstancedBufferGeometry()
    g.index = quad.index
    g.setAttribute('position', quad.getAttribute('position'))
    const center = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 4), 4)
    const glyph = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2)
    center.setUsage(THREE.DynamicDrawUsage)
    glyph.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aCenter', center)
    g.setAttribute('aGlyph', glyph)
    g.instanceCount = 0
    const m = new THREE.ShaderMaterial({
      name: 'world.footprintGlyphs',
      uniforms: { ...NPR, uAtlas: { value: glyphAtlas() } },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(g, m)
    mesh.frustumCulled = false
    mesh.renderOrder = 19
    mesh.name = 'footprint-glyphs'
    return { mesh, center, glyph }
  }, [])
  useEffect(
    () => () => {
      mesh.geometry.dispose()
      ;(mesh.material as THREE.Material).dispose()
    },
    [mesh],
  )

  useNprFrame(() => {
    const sim = gameView.sim
    const g = mesh.geometry as THREE.InstancedBufferGeometry
    if (!sim || !gameView.colorblind) {
      g.instanceCount = 0
      return
    }
    let n = 0
    const a = gameView.alpha
    for (const b of sim.birds) {
      const p = gameView.prevBirds[b.slot]?.shadow ?? b.shadow
      const s = b.shadow
      const ci = gameView.players[b.slot]?.colorIndex ?? b.slot
      if (!PLAYER_COLORS[ci]) continue
      center.setXYZW(n, p.cx + (s.cx - p.cx) * a, 0.1, -(p.cy + (s.cy - p.cy) * a), s.r)
      glyph.setXY(n, ci, b.hidden ? 0 : 1)
      n++
    }
    g.instanceCount = n
    center.needsUpdate = glyph.needsUpdate = n > 0
  })

  return <primitive object={mesh} />
}
