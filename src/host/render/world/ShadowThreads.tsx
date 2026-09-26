// <ShadowThreads> : fil d'ombre (ART_BIBLE §5.3, GDD §6.1) — pointillé à la variante
// « texte » de la couleur du joueur, points de 2 px tous les 8 px, opacité 0,8, de
// l'oiseau au centre de son empreinte, dès que le soleil passe sous ~32° et que le
// décalage dépasse RULES.shadowThreadMinOffset. Ce n'est pas un trait d'encre (on ne
// le confond pas avec le décor) ; il s'estompe avec la brume. Un seul draw call.
import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { RULES } from '../../../sim/rules.ts'
import { gameView, lerpBird } from '../../view.ts'
import { GLSL } from '../npr/glsl/index.ts'
import { useNprFrame } from '../npr/NprPipeline.tsx'
import { NPR } from '../npr/uniforms.ts'

const MAX = 12
const DEG = Math.PI / 180

const VERT = /* glsl */ `
${GLSL.common}
${GLSL.palette}
${GLSL.fog}
attribute vec3 aFrom;
attribute vec3 aTo;
attribute vec2 aInfo;        // (code propriétaire, opacité)
varying vec4 vSeg;           // extrémités à l'écran (px)
varying float vAlpha;
varying float vCode;
varying float vFog;
vec2 toPx(vec4 c){ return (c.xy / c.w * 0.5 + 0.5) * uResolution; }
void main(){
  // extrémités rapprochées de la caméra (le quad étendu à l'écran ne doit pas passer sous le sol)
  vec4 ma = viewMatrix * vec4(aFrom, 1.0);
  vec4 mb = viewMatrix * vec4(aTo, 1.0);
  ma.xyz *= max(0.0, 1.0 - 2.0 / max(length(ma.xyz), 1.0));
  mb.xyz *= max(0.0, 1.0 - 3.0 / max(length(mb.xyz), 1.0));
  vec4 ca = projectionMatrix * ma;
  vec4 cb = projectionMatrix * mb;
  vec2 sa = toPx(ca);
  vec2 sb = toPx(cb);
  vec2 d = sb - sa;
  float len = max(length(d), 1e-3);
  vec2 dir = d / len;
  vec2 perp = vec2(-dir.y, dir.x);
  // quad en espace écran : position.x = t (0..1), position.y = côté (−1..1)
  vec4 c = mix(ca, cb, position.x);
  vec2 offPx = perp * position.y * 3.0 * uPx + dir * (position.x - 0.5) * 6.0 * uPx;
  c.xy += offPx / uResolution * 2.0 * c.w;
  gl_Position = c;
  vSeg = vec4(sa, sb);
  vAlpha = aInfo.y;
  vCode = aInfo.x;
  vFog = fogAt(length((viewMatrix * vec4(mix(aFrom, aTo, 0.5), 1.0)).xyz));
}
`

const FRAG = /* glsl */ `
${GLSL.mrt}
${GLSL.palette}
uniform vec3 uOwnerText[13];
varying vec4 vSeg;
varying float vAlpha;
varying float vCode;
varying float vFog;
void main(){
  vec2 p = gl_FragCoord.xy;
  vec2 d = vSeg.zw - vSeg.xy;
  float len = max(length(d), 1e-3);
  vec2 dir = d / len;
  float along = dot(p - vSeg.xy, dir);
  float across = abs(dot(p - vSeg.xy, vec2(-dir.y, dir.x)));
  float step8 = 8.0 * uPx;
  float k = floor(along / step8 + 0.5);
  float dd = length(vec2(along - k * step8, across));
  float dotA = 1.0 - smoothstep(1.0 * uPx - 0.5, 1.0 * uPx + 0.5, dd);
  // pas sur le corps de l'oiseau (premiers 14 px) ni au-delà du centre de l'empreinte
  dotA *= step(14.0 * uPx, along) * step(along, len + 0.5);
  float a = dotA * vAlpha * 0.8 * (1.0 - smoothstep(0.3, 0.6, vFog));
  if (a < 0.01) discard;
  gl_FragColor = vec4(uOwnerText[int(vCode + 0.5)], a);
  gNormalId = vec4(0.0);
}
`

export function ShadowThreads() {
  const { mesh, from, to, info } = useMemo(() => {
    const quad = new THREE.PlaneGeometry(1, 2, 1, 1).translate(0.5, 0, 0)
    const g = new THREE.InstancedBufferGeometry()
    g.index = quad.index
    g.setAttribute('position', quad.getAttribute('position'))
    const from = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
    const to = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 3), 3)
    const info = new THREE.InstancedBufferAttribute(new Float32Array(MAX * 2), 2)
    for (const a of [from, to, info]) a.setUsage(THREE.DynamicDrawUsage)
    g.setAttribute('aFrom', from)
    g.setAttribute('aTo', to)
    g.setAttribute('aInfo', info)
    g.instanceCount = 0
    const m = new THREE.ShaderMaterial({
      name: 'world.threads',
      uniforms: { ...NPR },
      vertexShader: VERT,
      fragmentShader: FRAG,
      transparent: true,
      depthWrite: false,
    })
    const mesh = new THREE.Mesh(g, m)
    mesh.frustumCulled = false
    mesh.renderOrder = 20
    mesh.name = 'shadow-threads'
    return { mesh, from, to, info }
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
    if (!sim) {
      g.instanceCount = 0
      return
    }
    const e = sim.sun.elevation
    const show = 1 - THREE.MathUtils.smoothstep(e, 30 * DEG, 34 * DEG)
    let n = 0
    if (show > 0.01) {
      for (const b of sim.birds) {
        const p = gameView.prevBirds[b.slot]?.shadow ?? b.shadow
        const s = b.shadow
        const a = gameView.alpha
        const cx = p.cx + (s.cx - p.cx) * a
        const cy = p.cy + (s.cy - p.cy) * a
        const x = lerpBird(b.slot, 'x')
        const y = lerpBird(b.slot, 'y')
        const z = lerpBird(b.slot, 'z')
        const off = Math.hypot(cx - x, cy - y)
        const vis = show * THREE.MathUtils.smoothstep(off, RULES.shadowThreadMinOffset, RULES.shadowThreadMinOffset + 4) * (b.hidden ? 0.4 : 1)
        if (vis < 0.01) continue
        from.setXYZ(n, x, z, -y)
        to.setXYZ(n, cx, 0.08, -cy)
        info.setXY(n, b.slot + 1, vis)
        n++
      }
    }
    g.instanceCount = n
    from.needsUpdate = to.needsUpdate = info.needsUpdate = n > 0
  })

  return <primitive object={mesh} />
}
