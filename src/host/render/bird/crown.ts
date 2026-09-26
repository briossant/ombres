// Couronne du meneur (ART_BIBLE §6.7) : silhouette plate à 3 pointes plus larges
// que hautes (perles aux pointes), présentée de face, remplie d'or pâle #FFF2C3 en
// aplat NON éclairé (un signe, jamais grisé par le contre-jour ni par la nuit) et
// cernée d'encre (coque inversée de 1,5 px + ID d'encre propre). Le contrôleur la
// pose au-dessus du cavalier (jeu), sur sa capuche (gros plans) ou 1 m au-dessus
// (podium). Largeur de référence : 2,4 m ; origine au milieu de la base.
import { BackSide, ExtrudeGeometry, Group, Mesh, ShaderMaterial, Shape, type BufferGeometry } from 'three'
import { GLSL_PRELUDE, GLSL_VERTEX_PRELUDE, OUTLINE_ID, nprUniforms } from './npr.ts'

/** Largeur de référence de la couronne (m, échelle 1). */
export const CROWN_WIDTH = 2.4
/** Hauteur totale (m, perles comprises). */
export const CROWN_HEIGHT = 1.3

function crownGeometry(): BufferGeometry {
  // Bandeau + trois pointes (celle du milieu plus haute), tracé dans le plan XY, y vers le haut.
  const s = new Shape()
  s.moveTo(-1.0, 0)
  s.lineTo(1.0, 0)
  s.lineTo(1.02, 0.36)
  s.lineTo(1.2, 1.0)
  s.lineTo(0.52, 0.6)
  s.lineTo(0, 1.12)
  s.lineTo(-0.52, 0.6)
  s.lineTo(-1.2, 1.0)
  s.lineTo(-1.02, 0.36)
  s.closePath()
  const pearl = (x: number, y: number, r: number): Shape => {
    const p = new Shape()
    p.absarc(x, y, r, 0, Math.PI * 2, false)
    return p
  }
  const shapes = [s, pearl(-1.2, 1.03, 0.14), pearl(0, 1.16, 0.14), pearl(1.2, 1.03, 0.14)]
  const g = new ExtrudeGeometry(shapes, { depth: 0.22, bevelEnabled: false, curveSegments: 10 })
  g.translate(0, 0, -0.11)
  g.computeBoundingSphere()
  return g
}

const VERT = /* glsl */ `
varying vec3 vViewN;
varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vViewN = normalize(normalMatrix * normal);
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${GLSL_PRELUDE}
varying vec3 vViewN;
varying float vDist;
void main(){
  // Aplat d'or pâle, à peine brumé au loin (le signe reste lisible).
  vec3 col = mix(uCrownGold, fogColor(fogAt(vDist), 0.0), fogAt(vDist) * 0.3);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  writeGBuffer(vViewN, ${OUTLINE_ID.crown}.0);
}
`

const HULL_VERT = /* glsl */ `
${GLSL_VERTEX_PRELUDE}
uniform float uWidth;
varying vec3 vViewN;
varying float vDist;
void main(){
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec4 clip = projectionMatrix * mv;
  vec3 nV = normalize(normalMatrix * normal);
  vec2 nc = (projectionMatrix * vec4(nV, 0.0)).xy;
  float l = length(nc);
  clip.xy += (l > 1e-5 ? nc / l : vec2(0.0)) * uWidth * uPx * 2.0 / uResolution * clip.w;
  vViewN = nV;
  vDist = length(mv.xyz);
  gl_Position = clip;
}
`

const HULL_FRAG = /* glsl */ `
${GLSL_PRELUDE}
varying vec3 vViewN;
varying float vDist;
void main(){
  float f = fogAt(vDist);
  gl_FragColor = vec4(mix(uInk, fogColor(f, 0.0), f * 0.5), 1.0);
  #include <colorspace_fragment>
  writeGBuffer(vViewN, ${OUTLINE_ID.crown}.0);
}
`

export class CrownMesh {
  readonly group = new Group()
  private readonly geometry = crownGeometry()
  private readonly material = new ShaderMaterial({
    name: 'Crown',
    uniforms: { ...nprUniforms },
    vertexShader: VERT,
    fragmentShader: FRAG,
  })
  private readonly hullMaterial = new ShaderMaterial({
    name: 'CrownHull',
    side: BackSide,
    uniforms: { ...nprUniforms, uWidth: { value: 1.5 } },
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
  })

  constructor() {
    const m = new Mesh(this.geometry, this.material)
    const h = new Mesh(this.geometry, this.hullMaterial)
    m.frustumCulled = false
    h.frustumCulled = false
    m.name = 'crown'
    this.group.add(m, h)
    this.group.visible = false
  }

  dispose(): void {
    this.geometry.dispose()
    this.material.dispose()
    this.hullMaterial.dispose()
  }
}
