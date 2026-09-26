// Fabrique de matériaux NPR « objet » : deux tons + terminateur net + teinte de
// lumière de la keyframe + ombres portées (height map) + hachures objet/UV
// optionnelles sur la face à l'ombre + brume + front de nuit + sortie MRT.
//
// Gère automatiquement InstancedMesh (USE_INSTANCING, couleur d'instance =
// albédo) et SkinnedMesh (USE_SKINNING). Une déformation de sommets maison
// (battement d'ailes…) se branche via `deform` ; la MÊME déformation doit être
// passée au caster d'ombre (shadowMap.ts) pour que l'ombre batte des ailes.
import * as THREE from 'three'
import { NPR_FRAGMENT_PRELUDE } from './glsl/index.ts'
import { hexToOklab, type Vec3 } from './oklab.ts'
import { NPR } from './uniforms.ts'

/** Déformation de sommets partagée entre le matériau visible et le caster d'ombre. */
export interface VertexDeform {
  /** Déclarations (uniforms, attributs, fonctions) insérées avant main(). */
  pars?: string
  /**
   * Corps inséré au début de main(). Variables disponibles et modifiables :
   * `vec3 transformed` (position objet, initialisée à `position`) et
   * `vec3 objectNormal` (normale objet, initialisée à `normal`).
   */
  main?: string
  /** Uniforms de la déformation (objets `{ value }` partagés avec le caster). */
  uniforms?: Record<string, THREE.IUniform>
}

export type HatchMode =
  | 'none'
  /** Méridiens autour de l'axe Y objet (fûts, dômes, bulbes). */
  | 'cylinder'
  /** Attribut `hatchUv` (x = coordonnée transverse en m, y = couche croisée). */
  | 'attribute'
  /** x objet : lignes le long de la corde (ventre d'oiseau), seulement si N.y < −0,2. */
  | 'belly'

export interface NprMaterialOptions {
  /**
   * Albédo : une couleur, ou 'vertex' pour l'attribut `albedo` (vec3 OKLab, voir
   * `albedoAttribute`), ou 'instance' pour InstancedMesh.setColorAt.
   */
  albedo?: THREE.ColorRepresentation | 'vertex' | 'instance'
  /** Famille de teinte de lumière (§2.6). Défaut 'object'. */
  family?: 'object' | 'bird'
  /** ID d'objet (0..255) pour les contours d'encre (voir ids.ts). */
  objectId: number
  /** Attribut `idOffset` (float) ajouté à l'ID : cerner une pièce d'un maillage fusionné. */
  vertexIdOffset?: boolean
  hatch?: HatchMode
  /** Rayon de référence des méridiens (mode 'cylinder'), en m. */
  hatchRadius?: number
  /** Multiplicateur d'opacité des hachures (1 = opacité de la keyframe ; oiseau ≈ 1,2). */
  hatchScale?: number
  /** Attribut `cavity` (AO bakée 0..1 par sommet) : couche croisée à 90° si < 0,35. */
  cavity?: boolean
  /** Biais de la height map : 'wall' = 0,6 + 1,5(1 − |N·L|), 'bird' = 0,8, ou un nombre. */
  shadowBias?: 'wall' | 'bird' | number
  receiveShadow?: boolean
  fog?: boolean
  /** Hachures fondues par la brume entre fog 0,25 et 0,4 (R11). */
  side?: THREE.Side
  deform?: VertexDeform
  /**
   * Accent coloré (bande d'aile, cape) : attribut `accent` (0..1) qui mélange
   * l'albédo vers `accentColor` (couleur du joueur, modifiable via setNprAccent).
   */
  accentColor?: THREE.ColorRepresentation
  defines?: Record<string, string | number | boolean>
}

export interface NprMaterialUniforms {
  uAlbedoLab: { value: THREE.Vector3 }
  uAccentLab: { value: THREE.Vector3 }
  uObjId: { value: number }
  uHatchScale: { value: number }
  uHatchRadius: { value: number }
  uShadowBias: { value: number }
  /** « Caché » (§5.3) : 0..1, mélange à 55 % vers castShadow quand 1. */
  uHidden: { value: number }
  /** Estompage global (0..1) vers la brume, pour les apparitions. */
  uFade: { value: number }
}

export type NprMaterial = THREE.ShaderMaterial & { uniforms: NprMaterialUniforms & Record<string, THREE.IUniform> }

const labOf = (c: THREE.ColorRepresentation): Vec3 => hexToOklab('#' + new THREE.Color(c).getHexString())

/** Convertit des couleurs sRGB en attribut `albedo` OKLab (pour albedo: 'vertex'). */
export function albedoAttribute(colors: ArrayLike<THREE.ColorRepresentation>): THREE.BufferAttribute {
  const arr = new Float32Array(colors.length * 3)
  for (let i = 0; i < colors.length; i++) arr.set(labOf(colors[i]!), i * 3)
  return new THREE.BufferAttribute(arr, 3)
}

/** Remplit un attribut `albedo` (OKLab) d'une seule couleur, pour `count` sommets. */
export function fillAlbedo(out: Float32Array, start: number, count: number, color: THREE.ColorRepresentation): void {
  const lab = labOf(color)
  for (let i = 0; i < count; i++) out.set(lab, (start + i) * 3)
}

export const NPR_VERTEX_HEADER = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
`

/** Bloc standard « objet → monde » (après la déformation et le skinning). */
export const NPR_VERTEX_TRANSFORM = /* glsl */ `
  #include <skinbase_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 nprLocal = vec4(transformed, 1.0);
  vec3 nprObjN = objectNormal;
  #ifdef USE_INSTANCING
    nprLocal = instanceMatrix * nprLocal;
    nprObjN = mat3(instanceMatrix) * nprObjN;
  #endif
  vec4 nprWorld = modelMatrix * nprLocal;
`

function vertexShader(opts: NprMaterialOptions): string {
  const d = opts.deform ?? {}
  return /* glsl */ `
${NPR_VERTEX_HEADER}
${d.pars ?? ''}
#ifdef NPR_VERTEX_ALBEDO
attribute vec3 albedo;
#endif
#ifdef NPR_ID_OFFSET
attribute float idOffset;
varying float vIdOffset;
#endif
#ifdef NPR_CAVITY
attribute float cavity;
varying float vCavity;
#endif
#ifdef NPR_HATCH_ATTRIBUTE
attribute vec2 hatchUv;
varying vec2 vHatchUv;
#endif
#ifdef NPR_ACCENT
attribute float accent;
varying float vAccent;
#endif
varying vec3 vAlbedoLab;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
uniform vec3 uAlbedoLab;
${/* conversion OKLab côté sommet pour la couleur d'instance */ ''}
vec3 nprLin2Lab(vec3 c){
  vec3 lms = mat3(0.4122214708, 0.2119034982, 0.0883024619, 0.5363325363, 0.6806995451, 0.2817188376, 0.0514459929, 0.1073969566, 0.6299787005) * c;
  lms = pow(max(lms, vec3(0.0)), vec3(1.0 / 3.0));
  return mat3(0.2104542553, 1.9779984951, 0.0259040371, 0.7936177850, -2.4285922050, 0.7827717662, -0.0040720468, 0.4505937099, -0.8086757660) * lms;
}
void main(){
  vec3 transformed = vec3(position);
  vec3 objectNormal = vec3(normal);
  ${d.main ?? ''}
  ${NPR_VERTEX_TRANSFORM}
  vObj = transformed;
  vWorld = nprWorld.xyz;
  vNormalW = normalize(mat3(modelMatrix) * nprObjN);
  vViewN = normalize((viewMatrix * vec4(vNormalW, 0.0)).xyz);
  vec4 mv = viewMatrix * nprWorld;
  vDist = length(mv.xyz);
  #if defined(NPR_VERTEX_ALBEDO)
    vAlbedoLab = albedo;
  #elif defined(USE_INSTANCING_COLOR)
    vAlbedoLab = nprLin2Lab(instanceColor);
  #else
    vAlbedoLab = uAlbedoLab;
  #endif
  #ifdef NPR_ID_OFFSET
    vIdOffset = idOffset;
  #endif
  #ifdef NPR_CAVITY
    vCavity = cavity;
  #endif
  #ifdef NPR_HATCH_ATTRIBUTE
    vHatchUv = hatchUv;
  #endif
  #ifdef NPR_ACCENT
    vAccent = accent;
  #endif
  gl_Position = projectionMatrix * mv;
}
`
}

function fragmentShader(): string {
  return /* glsl */ `
${NPR_FRAGMENT_PRELUDE}
uniform vec3 uAccentLab;
uniform float uObjId, uHatchScale, uHatchRadius, uShadowBias, uHidden, uFade;
varying vec3 vAlbedoLab;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
#ifdef NPR_ID_OFFSET
varying float vIdOffset;
#endif
#ifdef NPR_CAVITY
varying float vCavity;
#endif
#ifdef NPR_HATCH_ATTRIBUTE
varying vec2 vHatchUv;
#endif
#ifdef NPR_ACCENT
varying float vAccent;
#endif
void main(){
  // ── dérivées en tête, hors de toute branche ──
  vec3 N = normalize(vNormalW);
  #ifdef DOUBLE_SIDED
    N = gl_FrontFacing ? N : -N;
  #endif
  float ndl = dot(N, uSunDir);
  float fl = fwidth(ndl);
  float nd = nightDist(vWorld.xz);
  float nw = max(fwidth(nd), 1e-3);
  #if defined(NPR_HATCH_CYLINDER)
    float hu = hatchCylU(vObj, uSunDir.xz, uHatchRadius);
    float hv = vObj.y;
  #elif defined(NPR_HATCH_ATTRIBUTE)
    float hu = vHatchUv.x;
    float hv = vHatchUv.y;
  #elif defined(NPR_HATCH_BELLY)
    float hu = vObj.x;
    float hv = vObj.z;
  #else
    float hu = 0.0;
    float hv = 0.0;
  #endif
  float hdu = length(vec2(dFdx(hu), dFdy(hu)));
  float hdv = length(vec2(dFdx(hv), dFdy(hv)));

  float n = nightMask(nd, nw);
  float lit = nprTerminator(ndl, fl);
  #ifdef NPR_RECEIVE_SHADOW
    float bias = uShadowBias >= 0.0 ? uShadowBias : 0.6 + 1.5 * (1.0 - abs(ndl));
    vec4 sh = sampleShadow(vWorld, bias);
    float castSh = smoothstep(0.35, 0.65, sh.x) * step(sh.w, 1.5);   // les empreintes (hauteur factice) n'ombrent que le sable
    lit *= 1.0 - castSh * mix(1.0, sh.z, step(0.5, sh.y)) * (1.0 - n);   // âme haute : ombre plus légère ; nuit : plus d'ombre portée
  #endif

  vec3 albedo = vAlbedoLab;
  #ifdef NPR_ACCENT
    albedo = mix(albedo, uAccentLab, vAccent);
  #endif
  float family = NPR_FAMILY;
  vec3 litLab = nprLitLab(albedo, family, n);
  vec3 shadeLab = nprShadeLab(litLab, albedo, family, n);
  vec3 col = oklab2lin(mix(shadeLab, litLab, lit));

  float f = 0.0;
  #ifdef NPR_FOG
    f = fogAt(vDist);
  #endif

  // ── hachures sur la face à l'ombre (R11-R13), fondues par la brume ──
  #if defined(NPR_HATCH_CYLINDER) || defined(NPR_HATCH_ATTRIBUTE) || defined(NPR_HATCH_BELLY)
    float cav = 1.0;
    #ifdef NPR_CAVITY
      cav = vCavity;
    #endif
    float shade = 1.0 - lit;
    #if defined(NPR_HATCH_CYLINDER)
      shade *= step(abs(N.y), 0.75);
    #elif defined(NPR_HATCH_BELLY)
      shade *= step(N.y, -0.2);
    #endif
    float hc = hatchShade(hu, hdu, hv, hdv, shade, cav, uPx);
    float hFade = (1.0 - smoothstep(0.25, 0.4, f)) * uQuality.x;
    col = mix(col, palHatch(n), hc * palHatchOpacity(n) * uHatchScale * hFade);
  #endif

  col = mix(col, palCast(n), uHidden * 0.55);
  #ifdef NPR_FOG
    col = applyFog(col, f, n);
  #endif
  col = mix(col, fogColor(1.0, n), uFade);
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  float id = uObjId;
  #ifdef NPR_ID_OFFSET
    id += floor(vIdOffset + 0.5);
  #endif
  writeGBuffer(vViewN, id);
}
`
}

/** Crée un matériau NPR objet. Les uniforms partagés (NPR) sont référencés, jamais copiés. */
export function createNprMaterial(opts: NprMaterialOptions): NprMaterial {
  const defines: Record<string, string | number | boolean> = { ...(opts.defines ?? {}) }
  defines.NPR_FAMILY = opts.family === 'bird' ? '1.0' : '0.0'
  if (opts.albedo === 'vertex') defines.NPR_VERTEX_ALBEDO = ''
  if (opts.vertexIdOffset) defines.NPR_ID_OFFSET = ''
  if (opts.cavity) defines.NPR_CAVITY = ''
  if (opts.receiveShadow !== false) defines.NPR_RECEIVE_SHADOW = ''
  if (opts.fog !== false) defines.NPR_FOG = ''
  if (opts.accentColor !== undefined) defines.NPR_ACCENT = ''
  const hatch = opts.hatch ?? 'none'
  if (hatch === 'cylinder') defines.NPR_HATCH_CYLINDER = ''
  if (hatch === 'attribute') defines.NPR_HATCH_ATTRIBUTE = ''
  if (hatch === 'belly') defines.NPR_HATCH_BELLY = ''
  if (opts.side === THREE.DoubleSide) defines.DOUBLE_SIDED = ''

  const albedoLab = typeof opts.albedo === 'string' && (opts.albedo === 'vertex' || opts.albedo === 'instance') ? ([0.9, 0, 0] as Vec3) : labOf(opts.albedo ?? '#EFE2C8')
  const accentLab = opts.accentColor !== undefined ? labOf(opts.accentColor) : ([0.7, 0, 0] as Vec3)
  const bias = opts.shadowBias ?? 'wall'
  const own: NprMaterialUniforms = {
    uAlbedoLab: { value: new THREE.Vector3(...albedoLab) },
    uAccentLab: { value: new THREE.Vector3(...accentLab) },
    uObjId: { value: opts.objectId },
    uHatchScale: { value: opts.hatchScale ?? 1 },
    uHatchRadius: { value: opts.hatchRadius ?? 3 },
    uShadowBias: { value: bias === 'wall' ? -1 : bias === 'bird' ? 0.8 : bias },
    uHidden: { value: 0 },
    uFade: { value: 0 },
  }
  const mat = new THREE.ShaderMaterial({
    name: 'npr.object',
    uniforms: { ...NPR, ...(opts.deform?.uniforms ?? {}), ...own },
    defines,
    vertexShader: vertexShader(opts),
    fragmentShader: fragmentShader(),
    side: opts.side ?? THREE.FrontSide,
  }) as NprMaterial
  return mat
}

/** Change la couleur d'accent (couleur du joueur) d'un matériau NPR. */
export function setNprAccent(mat: NprMaterial, color: THREE.ColorRepresentation): void {
  const lab = labOf(color)
  mat.uniforms.uAccentLab.value.set(lab[0], lab[1], lab[2])
}

/** Change l'albédo uniforme d'un matériau NPR. */
export function setNprAlbedo(mat: NprMaterial, color: THREE.ColorRepresentation): void {
  const lab = labOf(color)
  mat.uniforms.uAlbedoLab.value.set(lab[0], lab[1], lab[2])
}
