// Matériau du sol (ART_BIBLE §4, §5, §6.5) : la toile plate de l'arène, les dunes
// hors arène, le territoire en lavis d'aquarelle, les ombres portées (tours, âmes
// et empreintes des oiseaux), le front de nuit, le Simoun au sol, les rides et
// les crêtes. Tout dans un seul shader, sans boucle par oiseau.
import * as THREE from 'three'
import { NPR_FRAGMENT_PRELUDE } from '../npr/glsl/index.ts'
import { NPR } from '../npr/uniforms.ts'
import { EDGE_BLOCK, EDGE_MAX, TERR_OLD, TERR_STAMP_HZ, TERR_STAMP_MOD } from './territoryTexture.ts'

export const MAX_SPLASHES = 4

export function createGroundUniforms(territory: THREE.Texture, edges: THREE.Texture) {
  return {
    uTerr: { value: territory },
    /** Distance aux bords de territoire (TerritoryTexture.edgeTexture, polish 2). */
    uTerrEdge: { value: edges },
    /** (x0, y0) coin sud-ouest de la grille (repère sim), (1/cellW, 1/cellH). */
    uTerrGrid: { value: new THREE.Vector4(-165, -114, 512 / 330, 352 / 228) },
    uTerrSize: { value: new THREE.Vector2(512, 352) },
    uTerrClock: { value: 0 },
    /** Amplitude du domain warp des bords (m) : 3 en jeu, 0,5 cellule au décompte. */
    uTerrWarp: { value: 2.2 },
    /** (a, b, début du Simoun en rayon elliptique, Simoun visible 0/1). */
    uArena: { value: new THREE.Vector4(165, 114, 0.92, 1) },
    uColorblind: NPR.uColorblind,
    /** Taches de piqué : (x, z three, âge s, code propriétaire ; 0 = inactive) + direction du piqué. */
    uSplash: { value: Array.from({ length: MAX_SPLASHES }, () => new THREE.Vector4(0, 0, 99, 0)) },
    uSplashDir: { value: Array.from({ length: MAX_SPLASHES }, () => new THREE.Vector2(1, 0)) },
    uSplashCount: { value: 0 },
    /** Illumination des résultats : (x du front de vague, actif 0/1, code gagnant, âge de la ré-impression). */
    uIllum: { value: new THREE.Vector4(-1e4, 0, 0, 99) },
    /** Cuvette de sol craquelé (bible §6.5, optionnelle) : (x, z three, rayon m, active 0/1). */
    uCrack: { value: new THREE.Vector4(0, 0, 0, 0) },
  }
}

export type GroundUniforms = ReturnType<typeof createGroundUniforms>

const VERT = /* glsl */ `
attribute vec2 crest;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec2 vCrest;
void main(){
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  vViewN = normalize(normalMatrix * normal);
  vCrest = crest;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${NPR_FRAGMENT_PRELUDE}
#define TERR_OLD ${TERR_OLD}.0
#define TERR_HZ ${TERR_STAMP_HZ}.0
#define TERR_MOD ${TERR_STAMP_MOD}.0
#define MAX_SPLASHES ${MAX_SPLASHES}
uniform sampler2D uTerr, uTerrEdge;
#define EDGE_M ${(EDGE_MAX * EDGE_BLOCK).toFixed(1)}
uniform vec4 uTerrGrid;
uniform vec2 uTerrSize;
uniform float uTerrClock, uTerrWarp;
uniform vec4 uArena;
uniform vec4 uOwnerTerr[13];
uniform vec4 uOwnerCol[13];
uniform float uColorblind;
uniform vec4 uSplash[MAX_SPLASHES];
uniform vec2 uSplashDir[MAX_SPLASHES];
uniform int uSplashCount;
uniform vec4 uIllum;
uniform vec4 uCrack;
uniform vec4 uFpEllipse[13];
uniform vec2 uFpDir;
uniform float uNightSpeed, uPaintCMax, uShadowCool, uLook2, uPaintCapDark, uTerrSmoothDu;
uniform vec3 uLipLab;
#define PALE_DE2 0.0036
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec2 vCrest;

// ── territoire : classification par B-spline quadratique 3×3 (marching squares « lissé ») ──
// Pour chacun des 4 candidats (bloc bilinéaire), somme des poids B-spline des 9 texels qui
// portent cet ID ; le gagnant est l'argmax, m = poids(gagnant) − poids(second) vaut 0 sur la
// frontière. La B-spline arrondit l'escalier des cellules de la sim (le bilinéaire le laissait
// visible en gros plan). prev/stamp : texel du bloc le plus proche qui porte le gagnant.
vec4 terrTexel(ivec2 p, ivec2 mx){ return texelFetch(uTerr, clamp(p, ivec2(0), mx), 0); }
float terrId(vec4 t){ return floor(t.r * 255.0 + 0.5); }
// classification bilinéaire 4 taps (NPR §4.6) : preset bas, et pixels lointains
void territoryBL(vec2 xz, out float owner, out float strength, out float m, out float prevOwner, out float stamp){
  vec2 sp = vec2(xz.x, -xz.y);
  vec2 tc = (sp - uTerrGrid.xy) * uTerrGrid.zw - 0.5;
  ivec2 i0 = ivec2(floor(tc));
  vec2 f = fract(tc);
  ivec2 mx = ivec2(uTerrSize) - 1;
  vec4 t0 = terrTexel(i0, mx), t1 = terrTexel(i0 + ivec2(1, 0), mx), t2 = terrTexel(i0 + ivec2(0, 1), mx), t3 = terrTexel(i0 + ivec2(1, 1), mx);
  vec4 id = vec4(terrId(t0), terrId(t1), terrId(t2), terrId(t3));
  vec4 w = vec4((1.0 - f.x) * (1.0 - f.y), f.x * (1.0 - f.y), (1.0 - f.x) * f.y, f.x * f.y);
  vec4 acc = vec4(dot(w, vec4(equal(id, id.xxxx))), dot(w, vec4(equal(id, id.yyyy))), dot(w, vec4(equal(id, id.zzzz))), dot(w, vec4(equal(id, id.wwww))));
  float best = max(max(acc.x, acc.y), max(acc.z, acc.w));
  owner = acc.x == best ? id.x : acc.y == best ? id.y : acc.z == best ? id.z : id.w;
  vec4 same = vec4(equal(id, vec4(owner)));
  vec4 other = 1.0 - same;
  m = best - max(max(acc.x * other.x, acc.y * other.y), max(acc.z * other.z, acc.w * other.w));
  strength = dot(w * same, vec4(t0.g, t1.g, t2.g, t3.g)) / max(best, 1e-4);
  vec4 ws = w * same;
  float wb = max(max(ws.x, ws.y), max(ws.z, ws.w));
  vec4 tb = ws.x == wb ? t0 : ws.y == wb ? t1 : ws.z == wb ? t2 : t3;
  prevOwner = floor(tb.a * 255.0 + 0.5);
  stamp = floor(tb.b * 255.0 + 0.5);
  vec2 uv = (tc + 0.5) / uTerrSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { owner = 0.0; m = 1.0; prevOwner = 0.0; stamp = TERR_OLD; }
}
void territoryBS(vec2 xz, out float owner, out float strength, out float m, out float prevOwner, out float stamp){
  vec2 sp = vec2(xz.x, -xz.y);
  vec2 g = (sp - uTerrGrid.xy) * uTerrGrid.zw;
  vec2 c = floor(g);
  vec2 f = g - c - 0.5;                           // décalage au centre du texel, [−0,5 ; 0,5]
  ivec2 ic = ivec2(c);
  ivec2 mx = ivec2(uTerrSize) - 1;
  vec3 wx = vec3(0.5 * (0.5 - f.x) * (0.5 - f.x), 0.75 - f.x * f.x, 0.5 * (0.5 + f.x) * (0.5 + f.x));
  vec3 wy = vec3(0.5 * (0.5 - f.y) * (0.5 - f.y), 0.75 - f.y * f.y, 0.5 * (0.5 + f.y) * (0.5 + f.y));
  vec4 a0 = terrTexel(ic + ivec2(-1, -1), mx), a1 = terrTexel(ic + ivec2(0, -1), mx), a2 = terrTexel(ic + ivec2(1, -1), mx);
  vec4 b0 = terrTexel(ic + ivec2(-1, 0), mx),  b1 = terrTexel(ic, mx),                b2 = terrTexel(ic + ivec2(1, 0), mx);
  vec4 c0 = terrTexel(ic + ivec2(-1, 1), mx),  c1 = terrTexel(ic + ivec2(0, 1), mx),  c2 = terrTexel(ic + ivec2(1, 1), mx);
  vec3 idA = vec3(terrId(a0), terrId(a1), terrId(a2));
  vec3 idB = vec3(terrId(b0), terrId(b1), terrId(b2));
  vec3 idC = vec3(terrId(c0), terrId(c1), terrId(c2));
  vec3 wA = wx * wy.x, wB = wx * wy.y, wC = wx * wy.z;
  // candidats : le texel central et ses voisins du côté de f (bloc bilinéaire)
  int sx = f.x < 0.0 ? 0 : 2;
  int sy = f.y < 0.0 ? 0 : 2;
  float cand0 = idB.y;
  float cand1 = sx == 0 ? idB.x : idB.z;
  float cand2 = sy == 0 ? idA.y : idC.y;
  float cand3 = sy == 0 ? (sx == 0 ? idA.x : idA.z) : (sx == 0 ? idC.x : idC.z);
  vec4 cand = vec4(cand0, cand1, cand2, cand3);
  vec4 acc;
  for (int k = 0; k < 4; k++) {
    float ck = cand[k];
    acc[k] = dot(wA, vec3(equal(idA, vec3(ck)))) + dot(wB, vec3(equal(idB, vec3(ck)))) + dot(wC, vec3(equal(idC, vec3(ck))));
  }
  float best = max(max(acc.x, acc.y), max(acc.z, acc.w));
  owner = acc.x == best ? cand.x : acc.y == best ? cand.y : acc.z == best ? cand.z : cand.w;
  vec4 other = 1.0 - vec4(equal(cand, vec4(owner)));
  m = best - max(max(acc.x * other.x, acc.y * other.y), max(acc.z * other.z, acc.w * other.w));
  vec3 sA = vec3(equal(idA, vec3(owner))), sB = vec3(equal(idB, vec3(owner))), sC = vec3(equal(idC, vec3(owner)));
  strength = (dot(wA * sA, vec3(a0.g, a1.g, a2.g)) + dot(wB * sB, vec3(b0.g, b1.g, b2.g)) + dot(wC * sC, vec3(c0.g, c1.g, c2.g))) / max(best, 1e-4);
  // texel qui porte le gagnant, le plus proche : centre, sinon voisins du bloc
  vec4 tb = b1;
  if (idB.y != owner) {
    vec4 tx = sx == 0 ? b0 : b2;
    vec4 ty = sy == 0 ? a1 : c1;
    vec4 txy = sy == 0 ? (sx == 0 ? a0 : a2) : (sx == 0 ? c0 : c2);
    tb = terrId(tx) == owner ? tx : terrId(ty) == owner ? ty : txy;
  }
  prevOwner = floor(tb.a * 255.0 + 0.5);
  stamp = floor(tb.b * 255.0 + 0.5);
  vec2 uv = g / uTerrSize;
  if (any(lessThan(uv, vec2(0.0))) || any(greaterThan(uv, vec2(1.0)))) { owner = 0.0; m = 1.0; prevOwner = 0.0; stamp = TERR_OLD; }
}

// B-spline seulement quand une cellule couvre plusieurs pixels (plans rapprochés) : en vue de
// jeu (≥ 0,3 m/px, cellule ≈ 1,5 px) l'escalier est sous le pixel et 4 taps suffisent.
// Branche dynamique sans dérivée dedans : fwidth(m) est pris après, pour tous les pixels.
void territory(vec2 xz, float du, out float owner, out float strength, out float m, out float prevOwner, out float stamp){
#ifdef TERR_BILINEAR
  territoryBL(xz, owner, strength, m, prevOwner, stamp);
#else
  if (du < uTerrSmoothDu) territoryBS(xz, owner, strength, m, prevOwner, stamp);
  else territoryBL(xz, owner, strength, m, prevOwner, stamp);
#endif
}

// ── motifs du mode daltonien (ART_BIBLE §3.5) : ancrés monde, densité écran constante ──
float LN(float u, float lw, float aa){ return 1.0 - smoothstep(lw * 0.5 - aa, lw * 0.5 + aa, abs(fract(u + 0.5) - 0.5)); }
float cbCov(int k, vec2 q, float aa){
  float lw = 0.15;
  if (k == 0) return LN((q.x + q.y) * 0.7071, lw, aa);
  if (k == 1) return LN(q.y, lw, aa);
  if (k == 2) return 1.0 - smoothstep(0.16 - aa, 0.16 + aa, length(fract(q) - 0.5));
  if (k == 3) return LN(q.x, lw, aa);
  if (k == 4) return LN((q.x - q.y) * 0.7071, lw, aa);
  if (k == 5) return max(LN(q.x, lw, aa), LN(q.y, lw, aa));
  if (k == 6) return max(LN((q.x + q.y) * 0.7071, lw, aa), LN((q.x - q.y) * 0.7071, lw, aa));
  if (k == 7) return LN(q.y + 0.25 * sin(q.x * 3.1416), lw, aa * 1.3);
  if (k == 8) return LN(q.y, lw, aa) * step(fract(q.x * 0.8), 0.55);
  if (k == 9) return 1.0 - smoothstep(0.07 - aa, 0.07 + aa, abs(length(fract(q * 0.75) - 0.5) - 0.28));
  if (k == 10) return LN(q.x + 0.45 * abs(fract(q.y * 0.75) - 0.5) * 2.0, lw, aa * 1.3);
  return LN(q.x, lw, aa) * step(fract(q.y * 0.8), 0.55);
}
float cbPattern(int k, vec2 xz, float du, float px){
  float lod = log2(9.0 * px * du);
  float l0 = floor(lod);
  float t = lod - l0;
  float s = exp2(l0);
  return mix(cbCov(k, xz / s, du / s), cbCov(k, xz / (2.0 * s), du / (2.0 * s)), t);
}

// ── lavis d'un propriétaire sur le sol local (ART_BIBLE §4.1) ──
// Lg, abG : sol local (OKLab) ; q : 0 pâle -> 1 fort ; rim : liseré 0..1 ; gran : granulation.
// Chroma du fort plafonnée par uPaintCMax (0,12 à l'heure dorée, polish W12).
// Garde pâle / sol (polish W8) : le pâle reste à ΔE ≥ 0,06 du sol local, par la luminosité
// d'abord (du côté du fort, jusqu'à 0,05 d'écart), puis par la chroma (≤ 0,85 × celle du fort).
vec3 washLab(int o, float Lg, vec2 abG, float q, float rim, float gran, float paintC){
  vec4 T = uOwnerTerr[o];
  float Ls = 0.5 * Lg + 0.35 + T.z;
  Ls = mix(Ls, min(Ls, Lg - 0.05), smoothstep(0.66, 0.80, Lg));   // de jour, un lavis n'éclaircit jamais le papier
  float Lp = Lg < 0.66 ? mix(Lg, Ls, 0.45) : Lg - 0.03;
  // plafond de chroma (W12) ; au couchant (uPaintCapDark → 1), seulement pour les lavis clairs (polish 2)
  float capK = mix(1.0, smoothstep(0.60, 0.68, Ls), uPaintCapDark);
  float C0 = min(paintC * T.w, mix(1.0, uPaintCMax, capK));
  float Cp = 0.55 * C0;
  float dl = Lp - Lg;
  vec2 dab = T.xy * Cp - abG;
  float dd = dot(dab, dab);
  if (dl * dl + dd < PALE_DE2) {
    float sgn = abs(Ls - Lg) > 0.01 ? sign(Ls - Lg) : -1.0;
    float adl = abs(dl);
    dl = sgn * min(max(sqrt(max(PALE_DE2 - dd, 0.0)), adl), max(adl, 0.05));
    float rem2 = PALE_DE2 - dl * dl;
    if (rem2 > dd) {
      float pd = dot(T.xy, abG);
      Cp = min(max(Cp, pd + sqrt(max(pd * pd - dot(abG, abG) + rem2, 0.0))), 0.85 * C0);
    }
    Lp = Lg + dl;
  }
  float L = mix(Lp - 0.04 * rim, Ls - 0.10 * rim, q) + gran;
  return vec3(L, T.xy * mix(Cp, C0, q));
}

// Ombre portée sur la peinture (polish W4, amende la bible §4.5 / §5.1) : en OKLCH, chroma × 0,85
// et teinte tournée vers le violet des ombres (290°) par le chemin court, d'une fraction de l'écart
// (0,22 côté rouge, 0,15 côté vert, au plus 40°) : l'ombre refroidit sans griser (fin de la boue
// olive sur Safran) et deux joueurs gelés restent à ΔE ≥ 0,059. La luminosité (ratio) est à part.
// Les teintes par couleur sont calculées sur le CPU (palette.ts) : plus d'atan / cos / sin par pixel.
// Même rotation pour le côté nuit de la Grande Ombre (W6), par couleur (uOwnerNight, palette.ts) :
// tout y est dans l'ombre de la Falaise ; un Safran assombri sans rotation virait au kaki, avec la
// rotation W4 à l'ocre brun (polish 2 : mauve 325°, L + 0,06). Chroma × 0,52 (et non 0,6) : la chroma
// AFFICHÉE des forts clairs (Safran) est bornée par le gamut côté jour ; à 0,52 le côté nuit reste
// ≤ 0,6 × le côté jour mesuré, et deux joueurs y restent à ΔE ≥ 0,05 (final.mjs, gameNightPair).
// L − 0,10 (ordre : − 0,12) : à − 0,12 la médiane de L de la Grande Ombre tombait à 0,495, sous le
// seuil high-key du couchant (0,50, bible §7.7) ; l'écart jour / nuit d'un même joueur reste ≥ 0,10.
#define NIGHT_DIM_L 0.10
// Ombre portée sur le lavis d'un propriétaire (polish 2) : direction ab, facteur de chroma et de L
// calculés par couleur sur le CPU (palette.ts, updateOwnerShade). De jour, la rotation W4 ; en fin
// de journée (uShadowCool 0 -> 1 de 40° à 22° de l'horloge de palette), un GLACIS VIOLET : teinte
// tournée vers 300° (Safran -> mauve 340°, Corail 40° -> ~347°, au lieu de 54° et 16° : fin de la
// rouille et de la brique), chroma gardée, puis 30 % vers l'ombre neutre : les bandes des tours se
// lisent comme une même couche violette posée sur la mosaïque. Sous l'ombre, un lavis plus sombre
// que le sol l'est × 1,5 (un lavis plus clair garde le ratio, sinon ses ombres au couchant tournaient
// au rose clair) : c'est ce qui garde deux joueurs gelés à ΔE ≥ 0,059 (docs/art/tools/final.mjs).
// Au-delà d'un glacis de 0,3, Rose / Lilas et Sarcelle / Jade se confondent à l'ombre (12 joueurs).
uniform vec4 uOwnerShade[13];
uniform vec4 uOwnerNight[13];
vec2 shadowPaintAB(vec2 ab, int code, vec2 castAB){
  vec4 S = uOwnerShade[code];
  return mix(S.xy * (length(ab) * S.z), castAB, 0.3 * uShadowCool);
}
float shadowPaintL(float L, float Lg, int code){ return (L + min(L - Lg, 0.0) * 0.5 * uShadowCool) * uOwnerShade[code].w; }

// Liseré pointillé des empreintes pâles (polish W11, bible §5.3) : tirets de ~1,8 m le long du
// bord (rapport 50 %), paramétrés par la longueur d'arc de l'ellipse de gameplay, en nombre entier
// (aucun raccord). Quadrature à 6 points, évaluée seulement sur les pixels du liseré.
float ellArc(float t, float A, float B){   // ∫₀ᵗ √(A² sin² + B² cos²), 0 ≤ t ≤ π/2
  float acc = 0.0;
  for (int i = 0; i < 6; i++) {
    float u = (float(i) + 0.5) / 6.0 * t;
    float su = sin(u), cu = cos(u);
    acc += sqrt(A * A * su * su + B * B * cu * cu);
  }
  return acc * t / 6.0;
}
float footprintDash(vec2 xz, int code){
  vec4 E = uFpEllipse[code];
  vec2 d = xz - E.xy;
  float A = max(E.z, 0.5), B = max(E.w, 0.5);
  float t = atan(dot(d, vec2(-uFpDir.y, uFpDir.x)) / B, dot(d, uFpDir) / A);
  float at = abs(t);
  float Q = ellArc(1.5707963, A, B);
  float arc = at <= 1.5707963 ? ellArc(at, A, B) : 2.0 * Q - ellArc(3.1415927 - at, A, B);
  float P = 4.0 * Q;
  float nDash = max(4.0, floor(P / 3.6 + 0.5));
  return step(0.5, fract((sign(t) * arc + 2.0 * Q) / P * nDash));
}

// Réseau de fissures polygonal (Voronoï, distance au bord de cellule F2 − F1), en mètres.
float crackDist(vec2 p){
  vec2 c = floor(p);
  vec2 f = p - c;
  float d1 = 8.0, d2 = 8.0;
  for (int j = -1; j <= 1; j++)
    for (int i = -1; i <= 1; i++) {
      vec2 o = vec2(float(i), float(j));
      vec2 h = vec2(hash12(c + o), hash12(c + o + 17.3));
      vec2 q = o + 0.15 + 0.7 * h - f;
      float d = dot(q, q);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) d2 = d;
    }
  return 0.5 * (sqrt(d2) - sqrt(d1));
}

float easeOut(float t){ t = clamp(t, 0.0, 1.0); return 1.0 - (1.0 - t) * (1.0 - t); }

void main(){
  #ifdef GROUND_DEBUG_FLAT
    gl_FragColor = vec4(uGroundFlat, 1.0);
    writeGBuffer(vViewN, 1.0);
    return;
  #endif
  vec2 xz = vWorld.xz;
  // ── dérivées et lectures de texture en tête (hors branches) ──
  vec2 dxz = dFdx(xz), dyz = dFdy(xz);
  float du = max(length(dxz), length(dyz));                      // mètres par pixel
  // trois lectures de bruit (texture 256², NPR §4.10) : un bruit ALU par pixel coûterait des ms
  vec4 nz = texture2D(uNoise, xz * (1.0 / 240.0));                 // warp large, rides
  // grain, warp fin, front mouillé et lavis inégal ne servent que dans l'arène (territoire, taches de
  // piqué jusqu'à ~20 m du bord) : hors de l'arène (30 à 50 % du cadre de jeu), deux lectures en moins
  // (polish 2, W3). Gradients explicites : lecture sûre dans une branche ; les fwidth ci-dessous restent
  // hors branche (seule la couronne ρ ≈ 1,18, sans peinture, voit un écart entre voisins)
  vec4 nzf = vec4(0.5), nzm = vec4(0.5);
  float rho0 = length(xz / uArena.xy);
  if (rho0 < 1.18) {
    nzf = textureGrad(uNoise, xz * (1.0 / 24.0), dxz * (1.0 / 24.0), dyz * (1.0 / 24.0));        // rg : warp fin des bords (1-4 m) ; a : granulation
    nzm = textureGrad(uNoise, xz * (1.0 / 80.0) + 0.37, dxz * (1.0 / 80.0), dyz * (1.0 / 80.0)); // r : front mouillé (grandes taches) ; b : lavis inégal
  }
  float wetNoise = nzm.r;
  float wetW = max(fwidth(wetNoise), 1e-4);
  float granN = nzf.a;
  float washN = nzm.b;
  float washW = max(fwidth(washN), 1e-4);
  float rho = rho0;
  float rhoW = max(fwidth(rho), 1e-5);
  vec3 N = normalize(vNormalW);
  float ndl = dot(N, uSunDir);
  float slope = ndl - uSunDir.y;
  float fsl = fwidth(slope) + 1e-4;
  float nd = nightDist(xz);
  float nw = max(fwidth(nd), 1e-3);
  float n = nightMask(nd, nw);
  float owner = 0.0, strength = 0.0, m = 1.0, prevOwner = 0.0, stamp = TERR_OLD;
  // hors de l'arène (dunes, anneau lointain : 30 à 50 % du cadre de jeu), aucune lecture de la grille
  // (polish W3) ; la marge couvre le warp des bords (≤ 3 m)
  vec2 xzW = xz + (nz.rg - 0.5) * 2.0 * uTerrWarp + (nzf.rg - 0.5) * 0.5 * uTerrWarp;
  if (rho < 1.06) territory(xzW, du, owner, strength, m, prevOwner, stamp);
  float mw = max(fwidth(m), 1e-4);
  float borderPx = m / mw;
  // contour d'ombre lissé dès qu'un texel couvre plus d'un pixel (polish W5), 4 taps sinon
  vec2 p0 = shadowProject(vWorld);
  float dp0 = max(length(dFdx(p0)), length(dFdy(p0)));
  // derrière le front de nuit, plus d'ombres portées : aucune lecture (polish W3 : la Grande Ombre
  // était la phase la plus chère) ; la lecture reste faite sur la bande antialiasée du front
  vec4 sh = vec4(0.0);
  if (n < 0.999) sh = sampleShadowAuto(vWorld, 0.2, dp0);
  float fs = max(fwidth(sh.x), 1e-4);
  float fog = fogAt(vDist);
  float cp = vCrest.x;
  float dcp = max(fwidth(cp), 1e-5);
  vec2 rn = vec2(0.40, -0.92);
  float rip = dot(xz, rn) + 16.0 * nz.b;
  float drip = length(vec2(dot(dxz, rn), dot(dyz, rn)));

  // ── 1. sol : trois aplats relatifs au sol plat (NPR §4.3) ──
  vec3 flatC = palGround(n);
  // près de l'arène (bord du cadre de jeu), les pentes restent discrètes : une pente
  // corail au couchant se lirait comme du territoire (ART_BIBLE §6.5) ; au large, trois aplats francs
  float farDune = smoothstep(2.6, 4.2, rho);
  vec3 shadeC = mix(uSandShade, uNSandShade, n);
  vec3 col = flatC;
  // sol plat (l'arène entière, la plupart des pixels) : l'aplat et son OKLab sont connus, aucune
  // conversion (polish W3) ; pentes : trois aplats comme avant
  vec3 lab = mix(uLabGround, uNLabGround, n);
  float tLit = smoothstep(0.06 - fsl, 0.06 + fsl, slope);
  float tShade = smoothstep(0.06 - fsl, 0.06 + fsl, -slope);
  if (tLit + tShade > 0.0) {
    vec3 litC = oklab2lin(mix(mix(uLabGround, uLabSandLit, mix(0.3, 1.0, farDune)), uNLabSandLit, n));
    vec3 shadeDune = mix(mix(flatC, shadeC, 0.45), shadeC, farDune);
    col = mix(flatC, litC, tLit);
    col = mix(col, shadeDune, tShade);
    lab = lin2oklab(col);
  } else if (n > 0.0 && n < 1.0) lab = lin2oklab(col);   // bande antialiasée du front de nuit
  float Lg = lab.x;

  // ── 2. territoire : lavis OKLab, liseré de pigment, granulation, transitions ──
  float paint = 0.0;
  int paintOwner = 0;   // propriétaire dont le lavis est affiché (ombre portée, polish 2)
  if (owner > 0.5) {
    int o = int(owner);
    int po = int(prevOwner);
    float q = smoothstep(0.45, 0.65, strength);
    float paintC = palPaintC(n);
    // transitions (polish 2, W3 : calculées seulement sur les cellules changées depuis < 1,2 s ; ailleurs
    // l'horodatage est « ancien » et toutes valent leur repos)
    float fresh = 0.0, rise = 1.0, showPrev = 0.0, frontRim = 0.0, flash = 0.0;
    if (stamp < TERR_OLD - 0.5) {
      float age = mod(uTerrClock - stamp + TERR_MOD, TERR_MOD) / TERR_HZ;
      // encre fraîche (peinte sur du neutre) : L + 0,08 et C × 1,4 qui se posent en 0,4 s, liseré 6 -> 3 px
      fresh = (po == 0) ? 1.0 - easeOut(age / 0.4) : 0.0;
      // pâle -> fort du même joueur : granulation et liseré montent en 0,25 s
      rise = (po == o) ? smoothstep(0.0, 0.25, age) : 1.0;
      // vol : front mouillé (la couleur précédente se dissout selon un seuil de bruit monde) en 0,35 s
      float stealing = (po != 0 && po != o && age < 0.35) ? 1.0 : 0.0;
      float thr = mix(0.18, 0.86, clamp(age / 0.35, 0.0, 1.0));
      showPrev = stealing * step(thr, wetNoise);
      frontRim = stealing * (1.0 - showPrev) * (1.0 - smoothstep(3.0 * uPx - 0.5, 3.0 * uPx + 0.5, (thr - wetNoise) / wetW));
      flash = (po != 0 && po != o) ? 0.05 * (1.0 - smoothstep(0.0, 0.15, age)) : 0.0;
    }
    // illumination des résultats (vague d'ouest en est) et ré-impression du gagnant
    float lit = 0.0;
    if (uIllum.y > 0.5) {
      lit = step(xz.x, uIllum.x);
      if (abs(owner - uIllum.z) < 0.5) fresh = max(fresh, 1.0 - easeOut(uIllum.w / 0.5));
    }
    // côté nuit (polish W6) : le territoire gelé s'éteint (L − 0,10, C × 0,52, granulation « sec »)
    // en 0,3 s après le passage de la lèvre, avec un liseré papier qui s'éteint ; l'illumination
    // des résultats (§4.7) le rallume
    float dim = 0.0, paperWave = 0.0;
    if (n > 0.0) {
      float ageN = uNightOn > 0.5 ? nd / max(uNightSpeed, 1.0) : 99.0;
      float a3 = smoothstep(0.0, 0.3, ageN);
      dim = n * (1.0 - lit) * a3;
      paperWave = n * (1.0 - lit) * (1.0 - a3);
    }

    // liseré : 3 px (6 px d'encre fraîche), et au moins 0,8 m au sol (plans rapprochés, W12)
    float rimW = max((3.0 + 3.0 * fresh) * uPx, min(0.8 / max(du, 1e-4), 12.0 * uPx));
    float rim = 1.0 - smoothstep(rimW - 0.5, rimW + 0.5, borderPx);
    rim = max(rim * mix(0.4, 1.0, q * rise + (1.0 - q)), frontRim);
    // aquarelle : granulation (grain de pigment), pigment qui s'accumule vers le bord
    // (dégradé doux sous le liseré net) et lavis inégal : bruit monde de ~10 m (± 1,5 % de L)
    // et de ~30 m (± 3,5 %, W12 : les grandes zones restent vivantes à mi-distance)
    float qq = q * rise;
    float gran = (granN - 0.5) * 0.04 * max(mix(0.45, 1.0, qq), n) * (1.0 + dim) * uQuality.y;
    float pool = exp(-borderPx / (9.0 * rimW)) * (1.0 - rim);
    float mottle = (washN - 0.5);
    int wo = showPrev > 0.5 ? po : o;
    paintOwner = wo;
    vec3 w = washLab(wo, Lg, lab.yz, qq, rim * (1.0 - showPrev), gran, paintC);
    w.x += -0.035 * pool * mix(0.5, 1.0, qq) + 0.03 * mottle + 0.12 * (nz.b - 0.5);
    w.yz *= 1.0 + 0.10 * mottle + 0.08 * pool;
    // aquarelle lisible à distance de jeu (polish 2) : DENSITÉ de pigment, qui écarte le lavis du
    // papier (L et chroma) sans changer sa teinte : lavis inégal (~30 m), grain (~1-2 m, 3-5 px en vue
    // de jeu), et « fleurs » d'aquarelle : ligne de marée d'un pixel là où le lavis inégal franchit
    // un seuil, intérieur de la fleur un peu pâli (bord dur typique d'un lavis qui sèche).
    float tide = (1.0 - smoothstep(0.3, 1.0, abs(washN - 0.69) / washW)) * uQuality.y * qq;
    float dens = 1.0 + uLook2 * (0.26 * mottle + 0.16 * (granN - 0.5) * uQuality.y + 0.14 * tide - 0.08 * smoothstep(0.69, 0.76, washN));
    dens = mix(max(dens, 1.0), dens, qq);   // pâle : jamais plus près du sol (garde pâle / sol, W8)
    // bande de pigment au bord du lavis (polish 2) : le pigment migre vers le bord en séchant ;
    // ~5 m (12 à 15 px en vue de jeu) plus denses, l'intérieur des grands aplats un peu plus clair.
    // Champ de distance aux bords au quart de la grille (TerritoryTexture.edgeTexture), en mètres.
    vec2 eg = (vec2(xzW.x, -xzW.y) - uTerrGrid.xy) * uTerrGrid.zw / uTerrSize;
    float edgeM = textureLod(uTerrEdge, eg, 0.0).r * EDGE_M / uTerrGrid.z;
    float band = 1.0 - smoothstep(0.5, 5.5, edgeM);
    float inner = smoothstep(6.0, 14.0, edgeM);
    // Le champ est grossier (2,6 m par texel, chanfrein) : en gros plan (titre, punch-in), ses
    // marches de 25 à 50 px dessinaient un damier en losanges dans les aplats (verify2-eyes).
    // La bande est faite pour la distance de jeu (≥ 0,3 m/px) : estompée sous ~0,2 m/px.
    float edgeK = uLook2 * smoothstep(0.1, 0.22, du);
    dens *= 1.0 + edgeK * (mix(0.08, 0.16, qq) * band - 0.07 * qq * inner);
    w.x = Lg + (w.x - Lg) * dens;
    w.yz *= dens;
    // couchant : le liseré devient un plomb de vitrail (plus sombre, pigment plus dense)
    float sunsetK = smoothstep(0.85, 1.0, uWarm) * uLook2;
    w.x -= 0.035 * sunsetK * rim * mix(0.4, 1.0, qq);
    w.yz *= 1.0 + 0.12 * sunsetK * rim;
    w.x += 0.08 * fresh + flash + 0.04 * lit;
    w.yz *= 1.0 + 0.4 * fresh + 0.25 * lit;
    if (n > 0.0) {   // côté nuit seulement ; teinte éteinte par couleur (palette.ts, uOwnerNight)
      vec4 NO = uOwnerNight[wo];
      w.x -= (NIGHT_DIM_L - NO.w) * dim;
      w.yz = mix(w.yz, NO.xy * (length(w.yz) * NO.z), dim);
      w.x += 0.22 * rim * paperWave;
      w.yz *= 1.0 - 0.7 * rim * paperWave;
    }
    // mode daltonien : trame par joueur, lavis assombri (L − 0,16), opacité 1 fort / 0,55 pâle
    if (uColorblind > 0.5) {
      float cov = cbPattern(int(uOwnerCol[wo].w + 0.5), xz, du, uPx) * mix(0.55, 1.0, q);
      w.x -= 0.16 * cov * (1.0 - smoothstep(0.35, 0.6, fog));
    }
    col = oklab2lin(w);
    lab = w;
    paint = 1.0;
  }

  // ── 3. taches de piqué (éclaboussure en 3 temps, couleur de l'attaquant) ──
  if (uSplashCount > 0) {
    bool splashed = false;
    for (int i = 0; i < MAX_SPLASHES; i++) {
      vec4 S = uSplash[i];
      if (S.w < 0.5 || S.z > 0.75) continue;
      vec2 d = xz - S.xy;
      // hors du disque d'influence (tache ≤ 6,5 m + gouttelettes ≤ ~19 m) : rien à faire (polish 2, W3 :
      // sinon atan, sinus et 8 gouttelettes par tache sur TOUT le sol pendant 0,75 s à chaque piqué)
      if (dot(d, d) > 420.0) continue;
      vec2 dir = uSplashDir[i];
      vec2 perp = vec2(-dir.y, dir.x);
      float t = S.z;
      float e1 = min(t / 0.18, 1.0) - 1.0;
      float grow = 1.0 + 2.70158 * e1 * e1 * e1 + 1.70158 * e1 * e1;   // ease-out back
      float ang = atan(d.y, d.x);
      float R = 5.0 * grow * (1.0 + 0.10 * sin(ang * 7.0 + S.x) + 0.06 * sin(ang * 13.0 + S.y));
      float dd = length(d) - R;
      for (int k = 0; k < 8; k++) {
        float fk = float(k);
        float h = fract(sin(fk * 12.9898 + S.x * 0.37 + S.y * 0.11) * 43758.5453);
        vec2 c = dir * (R + 1.2 + fk * 1.1 * grow) + perp * (h - 0.5) * (3.0 + fk * 0.6);
        float rr = (0.5 + 1.0 * fract(h * 7.3)) * min(1.0, t / 0.12);
        dd = min(dd, length(d - c) - rr);
      }
      float px = dd / max(du, 1e-4);
      float inside = 1.0 - smoothstep(-0.5, 0.5, px);
      float dissolve = step(smoothstep(0.5, 0.75, t), wetNoise * 0.9 + 0.05);
      float srimW = mix(6.0, 3.0, smoothstep(0.0, 0.5, t)) * uPx;
      float srim = (1.0 - smoothstep(srimW - 0.5, srimW + 0.5, -px)) * inside;
      vec3 w = washLab(int(S.w + 0.5), Lg, lab.yz, 1.0, srim, 0.0, palPaintC(n));
      w.x += 0.06 * (1.0 - smoothstep(0.0, 0.3, t));
      col = mix(col, oklab2lin(w), inside * dissolve);
      if (inside * dissolve > 0.5) paintOwner = int(S.w + 0.5);
      paint = max(paint, inside * dissolve);
      splashed = splashed || inside * dissolve > 0.0;
    }
    if (splashed) lab = lin2oklab(col);
  }

  // ── 4. Simoun au sol : voile de sable étroit au bord, festonné côté arène, traits qui défilent ──
  float stormAmt = 0.0;
  // bande utile seulement (polish 2, W3) : du feston intérieur (≥ −5 m du bord) à la fin du voile
  // (≤ 24 m) ; l'ancienne garde ρ 0,9-1,8 faisait tourner la branche sur ~25 % du cadre à 12 oiseaux
  float mR = 0.5 * (uArena.x + uArena.y);                     // mètres par unité de rayon elliptique
  if (uArena.w > 0.5 && rho > 1.0 - 6.0 / mR && rho < 1.0 + 25.0 / mR) {   // branche dynamique : aucune dérivée dedans
    float ang = atan(xz.y * uArena.x, xz.x * uArena.y);
    float perim = 3.1416 * (uArena.x + uArena.y);
    float arc = ang * perim / 6.2832;                         // abscisse curviligne (m)
    float scal = abs(sin(arc / 13.0 * 3.1416));
    float radial = (rho - 1.0) * mR;                          // m depuis le bord (négatif dedans)
    float drad = rhoW * mR;
    float edgeM = -2.2 - 2.6 * sqrt(scal);                    // bord intérieur festonné (m)
    float inner = smoothstep(edgeM - drad, edgeM + drad, radial);
    float outer = 1.0 - smoothstep(4.0, 16.0 + 8.0 * nz.b, radial);
    stormAmt = inner * outer;
    vec3 veil = mix(shadeC, palHaze(n), 0.3);
    float streak = lineCov(radial + 0.8 * sin(arc * 0.17 + nz.g * 6.0), 3.1, drad, 1.0 * uPx)
                 * step(0.72, fract((arc - uTime * 6.0) / 23.0 + 0.41 * floor(radial / 3.1)))
                 * (1.0 - smoothstep(2.0, 16.0, radial));
    float lf = 1.0 - smoothstep(0.3, 0.6, fog);
    col = mix(col, veil, 0.7 * stormAmt);
    col = mix(col, palInk(n), 0.4 * streak * stormAmt * lf);
    // festons : liseré d'encre fin sur le bord intérieur
    float fe = (1.0 - smoothstep(0.0, 1.0 * uPx, abs(radial - edgeM) / drad)) * step(radial, 2.0);
    col = mix(col, palInk(n), 0.4 * fe * lf);
    lab = lin2oklab(col);
  }

  // ── 5. ombres portées : aplat OKLab, bord net, jamais de contour (§5.1) ──
  // derrière le front de nuit tout est déjà dans l'ombre de la Falaise : plus d'ombres portées
  float cov = smoothstep(0.5 - fs, 0.5 + fs, sh.x) * (1.0 - n);
  float isBird = step(0.5, sh.y);
  float isFp = step(1.5, sh.w);
  float idle = step(2.5, sh.w);
  float amount = cov * mix(1.0, sh.z, isBird);
  int code = int(sh.y + 0.5);
  vec3 castLab = mix(uLabCast, uNLabCast, n);
  vec2 tintAB = uOwnerTerr[code].xy * 0.06;
  vec3 shLab = vec3(castLab.x, mix(castLab.yz, tintAB, isBird * (1.0 - idle)));
  float groundL = mix(uLabGround.x, uNLabGround.x, n);
  // luminosité : ratio de l'ombre au sol partout ; teinte : 100 % vers l'ombre sur le sable nu,
  // OKLCH refroidi sur la peinture (shadowPaintAB, W4)
  if (amount > 0.0) {   // branche : la rotation OKLCH n'est calculée que sous une ombre
    float Lsh = mix(lab.x, shadowPaintL(lab.x, Lg, paintOwner), paint);
    vec3 shaded = vec3(Lsh * shLab.x / max(groundL, 0.05), mix(shLab.yz, shadowPaintAB(lab.yz, paintOwner, castLab.yz), paint));
    col = mix(col, oklab2lin(shaded), amount);
  }
  // liseré d'empreinte : couleur d'identité, 2,5 px, continu (fort) ou en tirets (pâle, W11)
  float edgePx = (sh.x - 0.5) / fs;
  float rimFp = (1.0 - smoothstep(2.5 * uPx - 0.5, 2.5 * uPx + 0.5, edgePx)) * step(0.0, edgePx) * isFp * isBird * (1.0 - idle);
  if (rimFp > 0.0 && sh.z <= 0.5) rimFp *= footprintDash(xz, code);
  col = mix(col, uOwnerCol[code].rgb, rimFp);

  // ── 6. front de nuit (W6) : bande de lumière rasante de 6 à 12 m devant le front (sol et
  // peinture tirés vers le sandLit de KF1, L + 0,06), puis lèvre de dernière lumière (4 px) ──
  float lipPx = -nd / nw;
  float dayFront = uNightOn * (1.0 - uNightAll) * step(0.0, lipPx) * (1.0 - cov);
  float band = dayFront * (1.0 - smoothstep(0.0, 6.0 + 6.0 * nz.g, -nd));
  if (band > 0.0) {
    vec3 bl = lin2oklab(col);
    bl.x += 0.06 * band;
    bl.yz = mix(bl.yz, uLipLab.yz, 0.35 * band);
    col = oklab2lin(bl);
  }
  float lip = dayFront * (1.0 - smoothstep(4.0 * uPx - 0.5, 4.0 * uPx + 0.5, lipPx));
  col = mix(col, uLipColor, lip);

  // ── 6 bis. cuvette de sol craquelé : fissures d'encre à 30 % (15 % sous la peinture) ──
  if (uCrack.w > 0.5) {
    float dc = length(xz - uCrack.xy) / uCrack.z;
    if (dc < 1.0) {
      float cellM = 4.2;                                           // taille des polygones (m)
      float e = crackDist(xz / cellM + nz.rg * 0.6) * cellM;       // distance au bord (m)
      float ePx = e / max(du, 1e-4);
      float crack = (1.0 - smoothstep(0.5 * uPx, 1.2 * uPx, ePx)) * (1.0 - smoothstep(0.65, 1.0, dc + (nz.b - 0.5) * 0.25));
      col = mix(col, palInk(n), crack * mix(0.3, 0.15, paint) * (1.0 - smoothstep(0.3, 0.6, fog)));
    }
  }

  // ── 7. rides de vent (près de la caméra) et crêtes de dunes (R16) ──
  // rides : coupées au-delà de 160 m (branche : rien n'est calculé au loin, polish W3)
  float ripple = 0.0;
  if (vDist < 160.0 && uQuality.z > 0.5 && paint < 0.5 && nz.a > 0.6) ripple = lineCov(rip, 4.5, drip, 0.9 * uPx) * (1.0 - smoothstep(80.0, 160.0, vDist)) * 0.35;
  float crestLine = lineCov(cp, 1.0, dcp, 1.0 * uPx) * smoothstep(1.5, 3.0, vCrest.y) * 0.55 * (1.0 - smoothstep(0.35, 0.6, fog));
  col = mix(col, palInk(n), max(ripple, crestLine));

  // le sol lointain garde un soupçon de sa couleur : la ligne d'horizon se lit dans les plans bas
  // (sinon mesas et Géantes flotteraient dans une brume uniforme)
  col = applyFog(col, min(fog, 0.86), n);
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;
  gl_FragColor = vec4(col, 1.0);
  writeGBuffer(vViewN, 1.0);
}
`

export function createGroundMaterial(uniforms: GroundUniforms, opts: { bilinear?: boolean } = {}): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    name: 'world.ground',
    uniforms: { ...NPR, ...uniforms },
    defines: opts.bilinear ? { TERR_BILINEAR: '' } : {},
    vertexShader: VERT,
    fragmentShader: FRAG,
  })
}
