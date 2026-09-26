// InkEffect : l'unique passe de dessin en post (NPR §4.1, ART_BIBLE §7).
// Contours = dérivée seconde de 1/z (nulle sur tout plan : aucun faux contour sur
// le sable rasant) + plis de normales (> 40°) + frontières d'ID ; trait posé côté
// objet proche, épaisseur × (1 → 0,5) avec la distance, fondu par la brume « à la
// Sable », tremblé ancré dans le MONDE (ne nage pas), encre de nuit derrière le
// front. Puis grain de papier statique (4 %), vignette ≤ 5 % et flash « planche ».
import * as THREE from 'three'
import { BlendFunction, Effect, EffectAttribute } from 'postprocessing'
import { night as nightChunk } from './glsl/night.ts'
import { NPR } from './uniforms.ts'

const FRAG = /* glsl */ `
uniform sampler2D tColor;
uniform sampler2D tNormal;
uniform highp sampler2D tDepth;
uniform sampler2D uNoise;
uniform mat4 uInvProj;
uniform mat4 uCamWorld;
uniform vec3 uInk, uNInk, uHaze, uNHaze, uSkyHorizon, uNSkyHorizon;
uniform float uFogK, uFogStart;
uniform vec2 uThickRange;
uniform float uThick, uWobble, uPaper, uDepthK, uNormalK, uFlash, uVignette;
uniform int uDebug;
${nightChunk}
float linZ(vec2 uv){ return -perspectiveDepthToViewZ(texture2D(tDepth, uv).r, cameraNear, cameraFar); }
vec3 nrm(vec4 t){ return t.xyz * 2.0 - 1.0; }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  float s = resolution.y / 1080.0;
  vec3 base = texture2D(tColor, uv).rgb;                 // couleur MRT (pas inputBuffer)
  float d0 = texture2D(tDepth, uv).r;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  vec3 wpos = (uCamWorld * vp).xyz;
  float dist = length(vp.xyz);
  float fog = 1.0 - exp(-max(dist - uFogStart, 0.0) * uFogK);
  // R5 : tremblé basse fréquence ANCRÉ DANS LE MONDE
  vec2 wob = texture2D(uNoise, wpos.xz * (1.0 / 37.0) + wpos.y * (1.0 / 53.0)).rg - 0.5;
  vec2 c = uv + wob * 2.0 * uWobble * s * texelSize;
  // R2 : plus épais devant, plus fin au loin (< 1 px -> opacité)
  float wgt = uThick * s * mix(1.0, 0.5, smoothstep(uThickRange.x, uThickRange.y, dist));
  vec2 o = texelSize * max(wgt, 1.0);
  float z0 = linZ(c);
  float w0 = 1.0 / z0;
  float wl = 1.0 / linZ(c - vec2(o.x, 0.0)), wr = 1.0 / linZ(c + vec2(o.x, 0.0));
  float wd = 1.0 / linZ(c - vec2(0.0, o.y)), wu = 1.0 / linZ(c + vec2(0.0, o.y));
  float lap = min(wl + wr, wd + wu) - 2.0 * w0;           // le plus négatif = centre devant ses voisins
  float eDepth = smoothstep(uDepthK, 2.0 * uDepthK, -lap / w0) * min(wgt, 1.0);
  // plis (normales, anneau de 1 px) + frontières d'ID (R3)
  vec2 o1 = texelSize * max(s, 1.0);
  vec4 t0 = texture2D(tNormal, c);
  vec4 tl = texture2D(tNormal, c - vec2(o1.x, 0.0)), tr = texture2D(tNormal, c + vec2(o1.x, 0.0));
  vec4 td = texture2D(tNormal, c - vec2(0.0, o1.y)), tu = texture2D(tNormal, c + vec2(0.0, o1.y));
  vec3 n0 = nrm(t0);
  float dn = max(max(1.0 - dot(n0, nrm(tl)), 1.0 - dot(n0, nrm(tr))), max(1.0 - dot(n0, nrm(td)), 1.0 - dot(n0, nrm(tu))));
  float eNormal = smoothstep(uNormalK, 1.8 * uNormalK, dn) * step(1.5 / 255.0, t0.a);
  float eId = step(0.5 / 255.0, max(max(abs(tl.a - t0.a), abs(tr.a - t0.a)), max(abs(td.a - t0.a), abs(tu.a - t0.a))))
            * step(1.5 / 255.0, t0.a);                   // pas sur le sol (1) ni le ciel (0)
  float interior = max(eNormal, eId) * 0.85 * (1.0 - smoothstep(0.4, 0.5, fog));   // R4 : plus de traits internes au-delà de 0,5
  float isSky = step(t0.a, 0.5 / 255.0) * step(cameraFar * 0.5, z0);
  float edge = max(eDepth, interior) * (1.0 - isSky) * (1.0 - smoothstep(0.35, 0.85, fog));   // R4 : fondu « Sable »
  // encre : jour/nuit selon le front, se brume au loin (R1)
  float nd = nightDist(wpos.xz);
  float n = max(uNightAll, step(0.0, nd));
  vec3 haze = mix(mix(uHaze, uNHaze, n), mix(uSkyHorizon, uNSkyHorizon, n), smoothstep(0.5, 0.9, fog));
  vec3 ink = mix(mix(uInk, uNInk, n), haze, fog * 0.8);
  // flash « planche » : la couleur recule vers le papier, les traits restent (crayonné)
  base = mix(base, vec3(0.930, 0.871, 0.776), 0.7 * uFlash);
  vec3 col = mix(base, ink, edge);
  col *= 1.0 - uPaper * (texture2D(uNoise, uv * resolution / (256.0 * s)).a - 0.4);   // R21 : grain statique
  vec2 vv = uv - 0.5;
  col *= 1.0 - uVignette * dot(vv, vv);                   // R22 : vignette ≤ 5 %
  if (uDebug == 1) col = vec3(1.0 - edge);
  if (uDebug == 2) col = t0.xyz;
  if (uDebug == 3) col = vec3(fract(z0 / 50.0));
  if (uDebug == 4) col = vec3(fract(t0.a * 255.0 / 7.0), fract(t0.a * 255.0 / 3.0), t0.a * 2.0);
  outputColor = vec4(col, 1.0);
}
`

export interface InkSettings {
  /** Épaisseur de silhouette (≈ px à 1080p) : 1,0 / 1,25 / 1,5 selon le preset. */
  thick: number
  /** Tremblé (px à 1080p), 0 = off. */
  wobble: number
  /** Grain de papier (multiply), 0,04 = 4 %. */
  paper: number
}

export class InkEffect extends Effect {
  constructor(gbuffer: THREE.WebGLRenderTarget, camera: THREE.PerspectiveCamera, settings: InkSettings) {
    const U = (v: unknown) => new THREE.Uniform(v)
    super('InkEffect', FRAG, {
      blendFunction: BlendFunction.SRC,
      attributes: EffectAttribute.CONVOLUTION,
      // Objets { value } partagés : pmndrs les référence tels quels (pas de copie).
      uniforms: new Map<string, THREE.IUniform>([
        ['tColor', U(gbuffer.textures[0])],
        ['tNormal', U(gbuffer.textures[1])],
        ['tDepth', U(gbuffer.depthTexture)],
        ['uNoise', NPR.uNoise],
        ['uInvProj', U(camera.projectionMatrixInverse)],
        ['uCamWorld', U(camera.matrixWorld)],
        ['uInk', NPR.uInk],
        ['uNInk', NPR.uNInk],
        ['uHaze', NPR.uHaze],
        ['uNHaze', NPR.uNHaze],
        ['uSkyHorizon', NPR.uSkyHorizon],
        ['uNSkyHorizon', NPR.uNSkyHorizon],
        ['uFogK', NPR.uFogK],
        ['uFogStart', NPR.uFogStart],
        ['uThickRange', U(new THREE.Vector2(120, 900))],
        ['uThick', U(settings.thick)],
        ['uWobble', U(settings.wobble)],
        ['uPaper', U(settings.paper)],
        ['uDepthK', U(0.025)],
        ['uNormalK', U(0.23)],
        ['uFlash', NPR.uFlash],
        ['uVignette', U(0.1)],
        ['uDebug', U(0)],
        ['uNightOn', NPR.uNightOn],
        ['uNightS', NPR.uNightS],
        ['uNightSpan', NPR.uNightSpan],
        ['uNightAll', NPR.uNightAll],
        ['uNightDir', NPR.uNightDir],
        ['uNightPerp', NPR.uNightPerp],
        ['uNightJag', NPR.uNightJag],
        ['uNightJagN', NPR.uNightJagN],
      ]) as Map<string, THREE.Uniform>,
    })
  }

  private u<T>(name: string): THREE.IUniform<T> {
    return this.uniforms.get(name) as THREE.IUniform<T>
  }

  setCamera(camera: THREE.PerspectiveCamera): void {
    this.u<THREE.Matrix4>('uInvProj').value = camera.projectionMatrixInverse
    this.u<THREE.Matrix4>('uCamWorld').value = camera.matrixWorld
  }

  setGBuffer(gbuffer: THREE.WebGLRenderTarget): void {
    this.u<THREE.Texture>('tColor').value = gbuffer.textures[0]!
    this.u<THREE.Texture>('tNormal').value = gbuffer.textures[1]!
    this.u<THREE.Texture | null>('tDepth').value = gbuffer.depthTexture
  }

  apply(settings: InkSettings): void {
    this.u<number>('uThick').value = settings.thick
    this.u<number>('uWobble').value = settings.wobble
    this.u<number>('uPaper').value = settings.paper
  }

  /** 0 normal, 1 traits seuls, 2 normales, 3 profondeur, 4 IDs. */
  set debug(mode: number) {
    this.u<number>('uDebug').value = mode
  }
}
