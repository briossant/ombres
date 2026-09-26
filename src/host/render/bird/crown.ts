// Couronne du meneur (ART_BIBLE §6.7) : petite couronne à 3 pointes, remplie
// d'or pâle #FFF2C3, cernée d'encre (coque inversée), qui flotte au-dessus du
// cavalier. Maillage procédural (bande évasée à profil biseauté).
import { BackSide, BufferGeometry, Float32BufferAttribute, Group, Mesh, ShaderMaterial, Uint16BufferAttribute } from 'three'
import { GLSL_PRELUDE, GLSL_VERTEX_PRELUDE, OUTLINE_ID, nprUniforms } from './npr.ts'

/** Hauteur totale de la couronne (m) ; son diamètre est ~2,4 m. */
export const CROWN_HEIGHT = 1.15

function crownGeometry(): BufferGeometry {
  const N = 96
  const pos: number[] = []
  const idx: number[] = []
  const R = 0.95
  const T = 0.11
  const b = 0.035
  const top = (th: number): number => {
    let pk = 0
    for (let k = 0; k < 3; k++) {
      let d = Math.abs(th - (k * Math.PI * 2) / 3)
      d = Math.min(d, Math.PI * 2 - d)
      pk = Math.max(pk, Math.max(0, 1 - d / (Math.PI / 3)) ** 1.35)
    }
    return 0.42 + 0.73 * pk
  }
  // Profil (dans le demi-plan r, y) : extérieur bas → extérieur haut → intérieur haut → intérieur bas, biseautés.
  const prof = (th: number): Array<[number, number]> => {
    const yt = top(th)
    const fl = (y: number) => 0.12 * y
    return [
      [R + b, 0],
      [R + b + fl(b), b],
      [R + b + fl(yt - b), yt - b],
      [R + fl(yt), yt],
      [R - T + fl(yt), yt],
      [R - T - b + fl(yt - b), yt - b],
      [R - T - b + fl(b), b],
      [R - T, 0],
    ]
  }
  const M = 8
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2
    const c = Math.cos(th)
    const s = Math.sin(th)
    for (const [r, y] of prof(th)) pos.push(r * s, y, r * c)
  }
  for (let i = 0; i < N; i++) {
    const i2 = (i + 1) % N
    for (let j = 0; j < M; j++) {
      const j2 = (j + 1) % M
      const a = i * M + j
      const bb = i * M + j2
      const cc = i2 * M + j
      const d = i2 * M + j2
      idx.push(a, cc, bb, bb, cc, d)
    }
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new Float32BufferAttribute(pos, 3))
  g.setIndex(new Uint16BufferAttribute(idx, 1))
  g.computeVertexNormals()
  return g
}

const VERT = /* glsl */ `
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec3 vObj;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewN = normalize(normalMatrix * normal);
  vObj = position;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${GLSL_PRELUDE}
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec3 vObj;
void main(){
  float nd = nightDist(vWorld.xz);
  float n = nightMask(nd, max(fwidth(nd), 1e-3));
  vec3 N = normalize(vNormalW);
  float ndl = dot(N, uSunDir);
  float lit = nprTerminator(ndl, max(fwidth(ndl), 1e-4));
  // L'or reste lumineux (c'est un signe), à peine teinté par la lumière.
  vec3 litC = mix(uCrownGold, birdLitOf(uCrownGold, n), 0.5);
  vec3 l = lin2oklab(litC), s = lin2oklab(palCast(n));
  vec3 shadeC = oklab2lin(vec3(l.x * 0.82, mix(l.yz, s.yz, 0.3)));
  vec3 col = mix(shadeC, litC, lit);
  col = applyFog(col, fogAt(vDist), n);
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
varying vec3 vWorld;
void main(){
  vWorld = (modelMatrix * vec4(position, 1.0)).xyz;
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
varying vec3 vWorld;
void main(){
  float nd = nightDist(vWorld.xz);
  float n = nightMask(nd, max(fwidth(nd), 1e-3));
  float f = fogAt(vDist);
  gl_FragColor = vec4(mix(palInk(n), fogColor(f, n), f * 0.8), 1.0);
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
