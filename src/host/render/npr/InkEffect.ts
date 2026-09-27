// InkEffect : l'unique passe de dessin en post (NPR §4.1, ART_BIBLE §7).
// Contours = dérivée seconde de 1/z (nulle sur tout plan : aucun faux contour sur
// le sable rasant) + plis de normales (> 40°) + frontières d'ID ; trait posé côté
// objet proche, épaisseur × (1 → 0,5) avec la distance, fondu par la brume « à la
// Sable », tremblé ancré dans le MONDE (ne nage pas), encre de nuit derrière le
// front. Puis grain de papier statique (4 %), vignette ≤ 5 % et flash « planche ».
// Antialiasing des traits (correcteur AA, docs/polish/fix-antialiasing.md) : plus de
// décision binaire. Près d'un bord, la frontière est lissée sur le 3×3 (filtre boîte
// + gradient : un escalier du tampon devient une frontière qui glisse d'une marche à
// l'autre), et chaque pixel prend la COUVERTURE du trait (largeur continue, rampe de
// 1 px) ; le pixel de fond voisin reçoit la part qui déborde. Le reste de l'image ne
// paie que la détection (4 + 4 lectures, comme avant).
// Ultra (INK_WIDE, vérificateur AA, docs/polish/verify-antialiasing.md) : à 2160p (s = 2) les traits font 2 à
// 3,8 px ; détection jusqu'à 4 pas et anneaux intermédiaires, sinon ils plafonnaient à 2 px (plus fins que High).
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
uniform float uThick, uWobble, uPaper, uDepthK, uNormalK, uFlash, uVignette, uSketch, uSketchFront, uSketchSpan;
uniform int uDebug;
uniform vec2 uGSize;                                     // taille du G-buffer (px) ; < resolution en Medium
${nightChunk}
// 1/z de vue, affine dans la profondeur perspective [0, 1]
float wOf(float d){ return (cameraFar - (cameraFar - cameraNear) * d) / (cameraNear * cameraFar); }
vec3 nrm(vec4 t){ return t.xyz * 2.0 - 1.0; }
float fogOf(float dist){ return 1.0 - exp(-max(dist - uFogStart, 0.0) * uFogK); }
float sum4(vec4 v){ return dot(v, vec4(1.0)); }
float max4(vec4 v){ return max(max(v.x, v.y), max(v.z, v.w)); }
// Distance (px) du centre du pixel à la frontière LISSÉE, d'après le masque 3×3 des voisins « de l'autre
// côté » (a : gauche, droite, bas, haut ; b : bas-gauche, haut-droite, bas-droite, haut-gauche ; centre = 0).
// Filtre boîte : F = part du 3×3 de l'autre côté ; normale = gradient ; pour une frontière droite à la
// distance d, F = 0,5 − d·L(n)/9 avec L = 3 / max(|nx|, |ny|) (corde du carré 3×3). Frontière droite du
// tampon : 0,5 ; un escalier donne une frontière qui glisse d'une marche à l'autre (couverture sous-pixel).
// Retour : (d, normale unitaire vers l'autre côté).
vec3 edgeFit(vec4 a, vec4 b){
  float F = (sum4(a) + sum4(b)) * (1.0 / 9.0);
  vec2 g = vec2(a.y - a.x + b.y - b.x + b.z - b.w, a.w - a.z + b.y - b.x + b.w - b.z);
  vec2 n = g / max(length(g), 1e-4);
  return vec3(3.0 * (0.5 - F) * max(max(abs(n.x), abs(n.y)), 0.7071), n);
}
// Couleur du G-buffer : au texel près en natif ; Catmull-Rom (5 lectures bilinéaires) s'il est plus petit que
// l'écran (INK_SCALED, Medium) : reconstruction nette, pas le flou d'un agrandissement bilinéaire
vec3 gColor(vec2 uv, ivec2 ip){
#ifndef INK_SCALED
  return texelFetch(tColor, ip, 0).rgb;
#else
  vec2 p = uv * uGSize;
  vec2 t1 = floor(p - 0.5) + 0.5;
  vec2 f = p - t1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 q0 = (t1 - 1.0) / uGSize, q3 = (t1 + 2.0) / uGSize, q12 = (t1 + w2 / w12) / uGSize;
  vec3 c = texture2D(tColor, vec2(q12.x, q0.y)).rgb * (w12.x * w0.y)
         + texture2D(tColor, vec2(q0.x, q12.y)).rgb * (w0.x * w12.y)
         + texture2D(tColor, q12).rgb * (w12.x * w12.y)
         + texture2D(tColor, vec2(q3.x, q12.y)).rgb * (w3.x * w12.y)
         + texture2D(tColor, vec2(q12.x, q3.y)).rgb * (w12.x * w3.y);
  float ws = w12.x * w0.y + w0.x * w12.y + w12.x * w12.y + w3.x * w12.y + w12.x * w3.y;
  return max(c / ws, 0.0);
#endif
}
// Part de l'empreinte du pixel [−0,5 ; 0,5] (le long de la normale) couverte par le trait [lo ; hi] :
// rampe linéaire sur 1 px à chaque bord du trait.
float span(float lo, float hi){ return clamp(min(0.5, hi) - max(-0.5, lo), 0.0, 1.0); }
// Trait de largeur W posé côté intérieur d'une frontière à d px : sous 1 px, trait d'un pixel en opacité W
// (un trait plus fin qu'un pixel, lissé, s'étalerait en gris sur deux pixels selon sa phase : pointillés)
float band(float d, float W){ return min(W, 1.0) * span(d - max(W, 1.0), d); }
float spill(float d, float W){ return min(W, 1.0) * span(d, d + max(W, 1.0)); }
// R2 : plus épais devant, plus fin au loin (< 1 px -> couverture partielle)
float thickAt(float dist, float s){ return uThick * s * mix(1.0, 0.5, smoothstep(uThickRange.x, uThickRange.y, dist)); }
void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor){
  float s = resolution.y / 1080.0;                       // px de la bible → px de l'écran
  // G-buffer plus petit que l'écran (Medium, INK_SCALED) : texel lu, décalage sous-texel du pixel d'écran (fo),
  // échelle ks (px du G-buffer par px d'écran) ; les distances aux bords sont ramenées en px d'écran. En natif :
  // ks = 1, décalage nul (constantes à la compilation).
#ifdef INK_SCALED
  vec2 kk = uGSize / resolution;
  float ks = kk.y;
  vec2 gp = gl_FragCoord.xy * kk;
  ivec2 ip = ivec2(gp);
  vec2 fo = gp - (vec2(ip) + 0.5);
#else
  const float ks = 1.0;
  ivec2 ip = ivec2(gl_FragCoord.xy);
  const vec2 fo = vec2(0.0);
#endif
  ivec2 hi = ivec2(uGSize) - 1;
  vec3 base = gColor(uv, ip);                            // couleur MRT (pas inputBuffer)
  #define DEP(o) wOf(texelFetch(tDepth, clamp(ip + (o), ivec2(0), hi), 0).r)
  #define NID(o) texelFetch(tNormal, clamp(ip + (o), ivec2(0), hi), 0)
  float d0 = texelFetch(tDepth, ip, 0).r;
  vec4 vp = uInvProj * vec4(uv * 2.0 - 1.0, d0 * 2.0 - 1.0, 1.0);
  vp /= vp.w;
  float dist = length(vp.xyz);
  float z0 = -vp.z;
  float fog = fogOf(dist);
  float w0 = wOf(d0);
  float W = thickAt(dist, s);                             // largeur des silhouettes (px, continue ; × tremblé plus bas)
  vec4 t0 = texelFetch(tNormal, ip, 0);
  vec3 n0 = nrm(t0);
  float obj0 = step(1.5 / 255.0, t0.a);                  // objet (ni sol 1, ni ciel 0)
  float sdC = step(253.5 / 255.0, t0.a);                 // trame de dissolution (ID 254, polish W9)
  // ── 1. Détection (tous les pixels, comme avant) : 1/z à k pas sur les axes (k = 2 si le trait dépasse
  // un pixel, sinon 1) ; normale + ID des 4 voisins directs.
#ifdef INK_WIDE
  // Ultra (vérificateur AA) : canevas > 1080p, s jusqu'à 2 : un trait de silhouette y fait jusqu'à 3,8 px ; il
  // faut voir le bord jusqu'à ceil(W max) pas (4 au plus), sinon le trait plafonne à 2 px (plus fin que High)
  int kr = int(clamp(ceil(W * (1.0 + 0.4 * uWobble) * ks), 1.0, 4.0));
#else
  int kr = W * (1.0 + 0.4 * uWobble) * ks > 1.0 ? 2 : 1;
#endif
  vec4 wr = vec4(DEP(ivec2(-kr, 0)), DEP(ivec2(kr, 0)), DEP(ivec2(0, -kr)), DEP(ivec2(0, kr)));
  vec2 lr = vec2(wr.x + wr.y, wr.z + wr.w) - 2.0 * w0;    // dérivée seconde de 1/z (nulle sur tout plan)
  float ringN = max(-lr.x, -lr.y) / w0;                   // > 0 : centre devant ses voisins
  float ringF = max(lr.x / max(wr.x, wr.y), lr.y / max(wr.z, wr.w));   // > 0 : centre derrière
  // frontières vues du centre (M) et « le voisin est un objet qui pose sa propre bande » (O) : objet → ID vers
  // tout voisin + plis vers un objet ; sol / ciel → ID vers un objet ; jamais vers une trame (ID 254)
  vec4 ma, mb, oa, ob;
  #define SEAM(o, M, O, kN) { vec4 t = NID(o); float keep = 1.0 - step(253.5 / 255.0, t.a); float isO = step(1.5 / 255.0, t.a); float idd = step(0.5 / 255.0, abs(t.a - t0.a)); float cr = smoothstep(kN, 1.8 * kN, 1.0 - dot(n0, nrm(t))) * isO * obj0; M = keep * max(idd * max(obj0, isO), cr); O = keep * isO * max(idd, cr); }
  SEAM(ivec2(-1, 0), ma.x, oa.x, uNormalK) SEAM(ivec2(1, 0), ma.y, oa.y, uNormalK)
  SEAM(ivec2(0, -1), ma.z, oa.z, uNormalK) SEAM(ivec2(0, 1), ma.w, oa.w, uNormalK)
  float eDepth = 0.0, eOver = 0.0, eInt = 0.0;
  float fogN = fog;
  float near = 0.0;
  vec3 wpos = (uCamWorld * vp).xyz;
  // R5 : tremblé ANCRÉ DANS LE MONDE, en variation de pression du trait (±28 % à 0,7) : le bord du trait reste
  // collé à la forme (un décalage de la lecture ferait des marches d'un pixel entier). Lecture hors branche
  // (dérivées implicites du mipmap).
  float wob = 1.0 + (texture2D(uNoise, wpos.xz * (1.0 / 37.0) + wpos.y * (1.0 / 53.0)).r - 0.5) * 0.8 * uWobble;
  W *= wob;
  float Wi = max(s, 1.0) * wob;                           // bande d'un objet le long d'un pli ou d'un ID
  // ── 2. Près d'un bord seulement (branches : le reste de l'image ne paie que la détection) : 3×3 complet,
  // frontière lissée, couverture sous-pixel.
  if (max(ringN, ringF) > uDepthK) {
    near = 1.0;
    vec4 wa = kr == 1 ? wr : vec4(DEP(ivec2(-1, 0)), DEP(ivec2(1, 0)), DEP(ivec2(0, -1)), DEP(ivec2(0, 1)));
    vec4 wb = vec4(DEP(ivec2(-1, -1)), DEP(ivec2(1, 1)), DEP(ivec2(1, -1)), DEP(ivec2(-1, 1)));
    vec4 sa = wa + wa.yxwz, sb = wb + wb.yxwz;          // paires opposées (dupliquées)
    // Silhouette, côté objet proche (centre devant) : masque = voisin le plus loin de chaque paire ; bande [0 ; W]
    if (ringN > uDepthK) {
      vec4 ja = smoothstep(uDepthK, 2.0 * uDepthK, (2.0 * w0 - sa) / w0);
      vec4 jb = smoothstep(uDepthK, 2.0 * uDepthK, (2.0 * w0 - sb) / w0);
      float e0 = max(max4(ja), max4(jb));
      if (e0 > 0.0) {
        vec3 e = edgeFit(ja * step(wa, wa.yxwz) / e0, jb * step(wb, wb.yxwz) / e0);
        float d = (e.x - dot(fo, e.yz)) / ks;            // px d'écran, depuis le centre du pixel d'écran
        eDepth = e0 * band(d, W);
      }
#ifdef INK_WIDE
      // pixels à j + 0,5 px du bord (j ≥ 1, hors du 3×3 : e0 nul) : premier anneau k = j + 1 qui voit le fond ;
      // le pixel du bord (j = 0) garde sa couverture lissée (bord extérieur antialiasé)
      if (kr >= 2 && e0 <= 0.0) {
        float kj = float(kr);
        for (int k = 2; k < 4; k++) {
          if (k >= kr) break;
          vec4 wk = vec4(DEP(ivec2(-k, 0)), DEP(ivec2(k, 0)), DEP(ivec2(0, -k)), DEP(ivec2(0, k)));
          vec2 lk = vec2(wk.x + wk.y, wk.z + wk.w) - 2.0 * w0;
          if (max(-lk.x, -lk.y) / w0 > uDepthK) { kj = float(k); break; }
        }
        eDepth = max(eDepth, smoothstep(uDepthK, 2.0 * uDepthK, ringN) * band((kj - 0.5) / ks, W));
      }
#else
      // à 2 pas (trait > 1 px) : frontière non lissée
      if (kr == 2) {
#ifdef INK_SCALED
        // Medium (vérificateur AA) : distance ramenée au centre du pixel d'ÉCRAN le long de la normale de l'anneau ;
        // les pixels d'écran du 2e texel sont entre 1,2 et 2,4 px du bord : avec 1,8 px pour tous, le trait perdait
        // jusqu'à ½ px une fois toutes les 5 texels quand le tremblé l'épaissit (épaisseur qui bat ; coût ≈ 0)
        vec2 gr = vec2(wr.x - wr.y, wr.z - wr.w);
        float dk = (1.5 - dot(fo, gr / max(length(gr), 1e-6))) / ks;
#else
        const float dk = 1.5;
#endif
        eDepth = max(eDepth, smoothstep(uDepthK, 2.0 * uDepthK, ringN) * band(dk, W));
      }
#endif
    }
    // Pixel de fond (centre derrière) : la part de la bande de l'objet voisin qui déborde chez lui (marches
    // d'escalier) ; épaisseur et brume de cet objet (le plus proche du 3×3)
    if (ringF > uDepthK) {
      float kz = w0 / max(w0, max(max4(wa), max4(wb)));  // z_proche / z0
      fogN = fogOf(dist * kz);
      vec4 ja = smoothstep(uDepthK, 2.0 * uDepthK, (sa - 2.0 * w0) / max(wa, wa.yxwz));
      vec4 jb = smoothstep(uDepthK, 2.0 * uDepthK, (sb - 2.0 * w0) / max(wb, wb.yxwz));
      float e0 = max(max4(ja), max4(jb));
      if (e0 > 0.0) {
        vec3 e = edgeFit(ja * step(wa.yxwz, wa) / e0, jb * step(wb.yxwz, wb) / e0);
        float d = (e.x - dot(fo, e.yz)) / ks;
        eOver = e0 * spill(d, thickAt(dist * kz, s) * wob);
      }
    }
  }
  // Plis + ID : diagonales (pli au double du seuil : voisin à √2 px), frontière lissée
  if (max4(ma) > 0.0) {
    near = 1.0;
    SEAM(ivec2(-1, -1), mb.x, ob.x, 2.0 * uNormalK) SEAM(ivec2(1, 1), mb.y, ob.y, 2.0 * uNormalK)
    SEAM(ivec2(1, -1), mb.z, ob.z, 2.0 * uNormalK) SEAM(ivec2(-1, 1), mb.w, ob.w, 2.0 * uNormalK)
    float eS = max(max4(ma), max4(mb));
    vec3 e = edgeFit(ma / eS, mb / eS);
    float d = (e.x - dot(fo, e.yz)) / ks;
    float other = step(0.5 * eS, max(max4(oa), max4(ob)));
    // objet : sa bande [d − Wi ; d] (+ celle de l'objet d'en face qui déborde) ; sol / ciel : le débord seul
    eInt = eS * (obj0 > 0.5 ? min(1.0, band(d, Wi) + other * spill(d, Wi)) : spill(d, Wi));
  }
#ifdef INK_WIDE
  // Ultra : bande d'un objet de plus d'un pixel (Wi = 2 px à 2160p) : pixel d'objet à 1,5 px d'un pli ou d'un ID
  // (anneau à 2 pas, seuil de pli du 1080p : même écart dans le monde)
  else if (obj0 > 0.5 && Wi > 1.0) {
    vec4 m2, o2;
    SEAM(ivec2(-2, 0), m2.x, o2.x, uNormalK) SEAM(ivec2(2, 0), m2.y, o2.y, uNormalK)
    SEAM(ivec2(0, -2), m2.z, o2.z, uNormalK) SEAM(ivec2(0, 2), m2.w, o2.w, uNormalK)
    float e2 = max4(m2);
    if (e2 > 0.0) {
      near = 1.0;
      eInt = e2 * band(1.5 / ks, Wi);
    }
  }
#endif
  // brume : trait d'un objet → sa propre brume ; débord sur un fond (ou sur le sol) → brume de l'objet voisin
  float interior = eInt * 0.85 * (1.0 - smoothstep(0.4, 0.5, obj0 > 0.5 ? fog : fogN));   // R4 : plus de traits internes au-delà de 0,5
  float isSky = step(t0.a, 0.5 / 255.0) * step(cameraFar * 0.5, z0);
  float eNear = max(eDepth * (1.0 - isSky), obj0 * interior) * (1.0 - smoothstep(0.35, 0.85, fog));
  float eFar = max(eOver, (1.0 - obj0) * interior) * (1.0 - smoothstep(0.35, 0.85, fogN));
  float edge = max(eNear, eFar) * (1.0 - sdC);            // R4 : fondu « Sable »
  float fogE = eFar > eNear ? fogN : fog;
  // encre : jour/nuit selon le front, se brume au loin (R1) ; calculée sur les pixels encrés seulement
  vec3 ink = uInk;
  if (edge > 0.0) {
    float n = max(uNightAll, step(0.0, nightDist(wpos.xz)));
    vec3 haze = mix(mix(uHaze, uNHaze, n), mix(uSkyHorizon, uNSkyHorizon, n), smoothstep(0.5, 0.9, fogE));
    ink = mix(mix(uInk, uNInk, n), haze, fogE * 0.8);
  }
  // flash « planche » : la couleur recule vers le papier, les traits restent (crayonné) ; au compte
  // à rebours, crayonné tenu à l'est du front de couleur qui coule d'ouest en est (W13)
  float sketch = 0.0;
  if (uSketch > 0.0) sketch = uSketch * smoothstep(uSketchFront - 8.0, uSketchFront + 8.0, clamp(wpos.x, -uSketchSpan, uSketchSpan));
  base = mix(base, vec3(0.930, 0.871, 0.776), 0.7 * max(uFlash, sketch));
  vec3 col = mix(base, ink, edge);
  col *= 1.0 - uPaper * (texture2D(uNoise, uv * resolution / (256.0 * s)).a - 0.4);   // R21 : grain statique
  vec2 vv = uv - 0.5;
  col *= 1.0 - uVignette * dot(vv, vv);                   // R22 : vignette ≤ 5 %
  if (uDebug == 1) col = vec3(1.0 - edge);
  if (uDebug == 2) col = t0.xyz;
  if (uDebug == 3) col = vec3(fract(z0 / 50.0));
  if (uDebug == 4) col = vec3(fract(t0.a * 255.0 / 7.0), fract(t0.a * 255.0 / 3.0), t0.a * 2.0);
  if (uDebug == 5) col = mix(vec3(1.0 - edge), vec3(1.0, 0.3, 0.2), 0.5 * near);   // pixels du 3×3 complet
  outputColor = vec4(col, 1.0);
}
`

export interface InkSettings {
  /** Échelle du G-buffer / canevas (< 1 : reconstruction à la taille de l'écran, variante INK_SCALED). */
  gbufferScale?: number
  /**
   * Hauteur de rendu visée du preset (> 1080 : Ultra, variante INK_WIDE : traits de plus de 2 px vus jusqu'à 4 pas,
   * sinon ils plafonnent à 2 px à 2160p, soit 1 px de 1080p ; compilée à part, Low / Medium / High n'en paient rien).
   */
  targetHeight?: number
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
    const scaled = (settings.gbufferScale ?? 1) < 0.999
    const wide = (settings.targetHeight ?? 1080) > 1080
    super('InkEffect', (scaled ? '#define INK_SCALED\n' : '') + (wide ? '#define INK_WIDE\n' : '') + FRAG, {
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
        ['uSketch', NPR.uSketch],
        ['uSketchFront', NPR.uSketchFront],
        ['uSketchSpan', NPR.uSketchSpan],
        ['uVignette', U(0.1)],
        ['uDebug', U(0)],
        ['uGSize', U(new THREE.Vector2(1920, 1080))],
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

  /** Taille du G-buffer (px) : plus petite que le canevas en Medium (preset.gbufferScale). */
  setGBufferSize(width: number, height: number): void {
    this.u<THREE.Vector2>('uGSize').value.set(width, height)
  }

  /** 0 normal, 1 traits seuls, 2 normales, 3 profondeur, 4 IDs, 5 traits + pixels du 3×3 complet (coût). */
  set debug(mode: number) {
    this.u<number>('uDebug').value = mode
  }
}
