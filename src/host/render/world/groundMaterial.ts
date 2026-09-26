// Matériau du sol (ART_BIBLE §4, §5, §6.5) : la toile plate de l'arène, les dunes
// hors arène, le territoire en lavis d'aquarelle, les ombres portées (tours, âmes
// et empreintes des oiseaux), le front de nuit, le Simoun au sol, les rides et
// les crêtes. Tout dans un seul shader, sans boucle par oiseau.
import * as THREE from 'three'
import { NPR_FRAGMENT_PRELUDE } from '../npr/glsl/index.ts'
import { NPR } from '../npr/uniforms.ts'
import { TERR_OLD, TERR_STAMP_HZ, TERR_STAMP_MOD } from './territoryTexture.ts'

export const MAX_SPLASHES = 4

export function createGroundUniforms(territory: THREE.Texture) {
  return {
    uTerr: { value: territory },
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
uniform sampler2D uTerr;
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
  if (du < 0.3) territoryBS(xz, owner, strength, m, prevOwner, stamp);
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
// Lg : L OKLab du sol ; q : 0 pâle -> 1 fort ; rim : liseré 0..1 ; gran : granulation.
vec3 washLab(int o, float Lg, float q, float rim, float gran, float paintC){
  vec4 T = uOwnerTerr[o];
  float Ls = 0.5 * Lg + 0.35 + T.z;
  Ls = mix(Ls, min(Ls, Lg - 0.05), smoothstep(0.66, 0.80, Lg));   // de jour, un lavis n'éclaircit jamais le papier
  float Lp = Lg < 0.66 ? mix(Lg, Ls, 0.45) : Lg - 0.03;
  float L = mix(Lp - 0.04 * rim, Ls - 0.10 * rim, q) + gran;
  vec2 ab = T.xy * paintC * T.w * mix(0.55, 1.0, q);
  return vec3(L, ab);
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
  vec4 nzf = texture2D(uNoise, xz * (1.0 / 24.0));                 // rg : warp fin des bords (1-4 m) ; a : granulation
  vec4 nzm = texture2D(uNoise, xz * (1.0 / 80.0) + 0.37);          // r : front mouillé (grandes taches) ; b : lavis inégal
  float wetNoise = nzm.r;
  float wetW = max(fwidth(wetNoise), 1e-4);
  float granN = nzf.a;
  float washN = nzm.b;
  float rho = length(xz / uArena.xy);
  float rhoW = max(fwidth(rho), 1e-5);
  vec3 N = normalize(vNormalW);
  float ndl = dot(N, uSunDir);
  float slope = ndl - uSunDir.y;
  float fsl = fwidth(slope) + 1e-4;
  float nd = nightDist(xz);
  float nw = max(fwidth(nd), 1e-3);
  float n = nightMask(nd, nw);
  float owner, strength, m, prevOwner, stamp;
  territory(xz + (nz.rg - 0.5) * 2.0 * uTerrWarp + (nzf.rg - 0.5) * 0.5 * uTerrWarp, du, owner, strength, m, prevOwner, stamp);
  float mw = max(fwidth(m), 1e-4);
  float borderPx = m / mw;
  // près de la caméra (plans bas), contour d'ombre lissé ; au loin, 4 taps suffisent
  vec4 sh = vDist < 170.0 ? sampleShadowSmooth(vWorld, 0.2) : sampleShadow(vWorld, 0.2);
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
  vec3 litC = oklab2lin(mix(mix(uLabGround, uLabSandLit, mix(0.3, 1.0, farDune)), uNLabSandLit, n));
  vec3 shadeC = mix(uSandShade, uNSandShade, n);
  vec3 shadeDune = mix(mix(flatC, shadeC, 0.45), shadeC, farDune);
  vec3 col = mix(flatC, litC, smoothstep(0.06 - fsl, 0.06 + fsl, slope));
  col = mix(col, shadeDune, smoothstep(0.06 - fsl, 0.06 + fsl, -slope));
  vec3 lab = lin2oklab(col);
  float Lg = lab.x;

  // ── 2. territoire : lavis OKLab, liseré de pigment, granulation, transitions ──
  float paint = 0.0;
  if (owner > 0.5) {
    int o = int(owner);
    int po = int(prevOwner);
    float age = stamp >= TERR_OLD - 0.5 ? 99.0 : mod(uTerrClock - stamp + TERR_MOD, TERR_MOD) / TERR_HZ;
    float q = smoothstep(0.45, 0.65, strength);
    float paintC = palPaintC(n);
    // encre fraîche (peinte sur du neutre) : L + 0,08 et C × 1,4 qui se posent en 0,4 s, liseré 6 -> 3 px
    float fresh = (po == 0) ? 1.0 - easeOut(age / 0.4) : 0.0;
    // pâle -> fort du même joueur : granulation et liseré montent en 0,25 s
    float rise = (po == o) ? smoothstep(0.0, 0.25, age) : 1.0;
    // vol : front mouillé (la couleur précédente se dissout selon un seuil de bruit monde) en 0,35 s
    float stealing = (po != 0 && po != o && age < 0.35) ? 1.0 : 0.0;
    float thr = mix(0.18, 0.86, clamp(age / 0.35, 0.0, 1.0));
    float showPrev = stealing * step(thr, wetNoise);
    float frontRim = stealing * (1.0 - showPrev) * (1.0 - smoothstep(3.0 * uPx - 0.5, 3.0 * uPx + 0.5, (thr - wetNoise) / wetW));
    float flash = (po != 0 && po != o) ? 0.05 * (1.0 - smoothstep(0.0, 0.15, age)) : 0.0;
    // illumination des résultats (vague d'ouest en est) et ré-impression du gagnant
    float lit = uIllum.y * step(xz.x, uIllum.x);
    float winFresh = (uIllum.y > 0.5 && abs(owner - uIllum.z) < 0.5) ? 1.0 - easeOut(uIllum.w / 0.5) : 0.0;
    fresh = max(fresh, winFresh);

    float rimW = (3.0 + 3.0 * fresh) * uPx;
    float rim = 1.0 - smoothstep(rimW - 0.5, rimW + 0.5, borderPx);
    rim = max(rim * mix(0.4, 1.0, q * rise + (1.0 - q)), frontRim);
    // aquarelle : granulation (grain de pigment), pigment qui s'accumule vers le bord
    // (dégradé doux sous le liseré net) et lavis légèrement inégal (bruit monde basse fréquence)
    float qq = q * rise;
    float gran = (granN - 0.5) * 0.04 * max(mix(0.45, 1.0, qq), n) * uQuality.y;
    float pool = exp(-borderPx / (9.0 * uPx)) * (1.0 - rim);
    float mottle = (washN - 0.5);
    int wo = showPrev > 0.5 ? po : o;
    vec3 w = washLab(wo, Lg, qq, rim * (1.0 - showPrev), gran, paintC);
    w.x += -0.035 * pool * mix(0.5, 1.0, qq) + 0.03 * mottle;
    w.yz *= 1.0 + 0.10 * mottle + 0.08 * pool;
    w.x += 0.08 * fresh + flash + 0.04 * lit;
    w.yz *= 1.0 + 0.4 * fresh + 0.25 * lit;
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
    for (int i = 0; i < MAX_SPLASHES; i++) {
      vec4 S = uSplash[i];
      if (S.w < 0.5 || S.z > 0.75) continue;
      vec2 d = xz - S.xy;
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
      vec3 w = washLab(int(S.w + 0.5), Lg, 1.0, srim, 0.0, palPaintC(n));
      w.x += 0.06 * (1.0 - smoothstep(0.0, 0.3, t));
      col = mix(col, oklab2lin(w), inside * dissolve);
      paint = max(paint, inside * dissolve);
    }
    lab = lin2oklab(col);
  }

  // ── 4. Simoun au sol : voile de sable étroit au bord, festonné côté arène, traits qui défilent ──
  float stormAmt = 0.0;
  if (uArena.w > 0.5 && rho > 0.9 && rho < 1.8) {   // branche dynamique : aucune dérivée dedans
    float ang = atan(xz.y * uArena.x, xz.x * uArena.y);
    float perim = 3.1416 * (uArena.x + uArena.y);
    float arc = ang * perim / 6.2832;                         // abscisse curviligne (m)
    float scal = abs(sin(arc / 13.0 * 3.1416));
    float mR = 0.5 * (uArena.x + uArena.y);                   // mètres par unité de rayon elliptique
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
  vec3 shaded = vec3(lab.x * shLab.x / max(groundL, 0.05), mix(lab.yz, shLab.yz, mix(1.0, 0.35, paint)));
  col = mix(col, oklab2lin(shaded), amount);
  float towerSh = cov * (1.0 - isBird);
  // liseré d'empreinte : couleur d'identité, 2,5 px, continu (fort) ou pointillé (pâle)
  float edgePx = (sh.x - 0.5) / fs;
  vec2 sd = uShadowDir;
  float along = dot(xz, sd), across = dot(xz, vec2(-sd.y, sd.x));
  float dash = sh.z > 0.5 ? 1.0 : abs(step(0.5, fract(along / 2.4)) - step(0.5, fract(across / 2.4)));
  float rimFp = (1.0 - smoothstep(2.5 * uPx - 0.5, 2.5 * uPx + 0.5, edgePx)) * step(0.0, edgePx) * isFp * isBird * (1.0 - idle) * dash;
  col = mix(col, uOwnerCol[code].rgb, rimFp);

  // ── 6. front de nuit : lèvre de dernière lumière (3 px, côté jour, hors ombre) ──
  float lipPx = -nd / nw;
  float lip = uNightOn * (1.0 - uNightAll) * step(0.0, lipPx) * (1.0 - smoothstep(3.0 * uPx - 0.5, 3.0 * uPx + 0.5, lipPx)) * (1.0 - cov);
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
  float ripple = lineCov(rip, 4.5, drip, 0.9 * uPx) * (1.0 - smoothstep(80.0, 160.0, vDist)) * step(0.6, nz.a) * 0.35 * uQuality.z * (1.0 - paint);
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
