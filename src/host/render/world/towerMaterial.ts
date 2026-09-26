// Matériau des tours et de leur décor (ART_BIBLE §6.6, R6-R14, R24) :
// deux tons teintés par la lumière (OKLab), terminateur net, ombres portées,
// hachures verticales (méridiens) sur le flanc à l'ombre, croisées à 90° dans les
// creux (cavité bakée), dessous des disques hachurés et rayés de rayons d'encre,
// fenêtres = trous d'encre (éclairées la nuit), côtes d'oignon, cannelures,
// fissures, jupe de sable aux couleurs du sol, fanions qui flottent.
import * as THREE from 'three'
import { NPR_FRAGMENT_PRELUDE } from '../npr/glsl/index.ts'
import { OBJ_ID } from '../npr/ids.ts'
import { NPR } from '../npr/uniforms.ts'
import { DECO } from './geoBuilder.ts'

/**
 * Dissolution près de la caméra (polish vague 2) : effacé net à moins de DISSOLVE_NEAR0 m, bande
 * de transition en trame jusqu'à DISSOLVE_NEAR1 m. La caméra de manche ne s'installe pas à moins de
 * 45 m d'une tour (src/host/camera/framingRig.ts, COVER_CLEAR) : ceci ne sert qu'aux passages.
 */
export const DISSOLVE_NEAR0 = 30
export const DISSOLVE_NEAR1 = 38

export interface TowerUniforms {
  uBaseId: { value: number }
  /** Dissolution en trame active (0 au podium). */
  uDissolve: { value: number }
}

const VERT = /* glsl */ `
attribute vec4 tloc;
attribute vec3 albedo;
attribute vec4 tdeco;
attribute vec2 tzone;
uniform float uTime;
varying vec3 vWorld;
varying vec4 vLoc;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec3 vAlbedo;
varying vec4 vDeco;
varying vec2 vZone;
void main(){
  vec3 p = position;
  vec3 nrm = normal;
  if (abs(tdeco.y - ${DECO.flag}.0) < 0.5) {
    // fanion : ondulation qui croît vers la pointe (u = tzone.x)
    float u = tzone.x;
    float w = (sin(uTime * 6.0 - u * 5.0 + tdeco.z * 40.0) * 0.28 + sin(uTime * 2.7 - u * 2.0) * 0.12) * u;
    p += nrm * w;
  }
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vLoc = tloc;
  vNormalW = normalize(mat3(modelMatrix) * nrm);
  vViewN = normalize((viewMatrix * vec4(vNormalW, 0.0)).xyz);
  vAlbedo = albedo;
  vDeco = tdeco;
  vZone = tzone;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

const FRAG = /* glsl */ `
${NPR_FRAGMENT_PRELUDE}
#define M_WINDOWS ${DECO.windows}.0
#define M_RIBS ${DECO.ribs}.0
#define M_FLUTES ${DECO.flutes}.0
#define M_UNDER ${DECO.underside}.0
#define M_SKIRT ${DECO.skirt}.0
#define M_FLAG ${DECO.flag}.0
#define M_INK ${DECO.ink}.0
#define M_BANDS ${DECO.bands}.0
#define M_PANELS ${DECO.panels}.0
#define SCREEN_DOOR_ID ${OBJ_ID.screenDoor}.0
uniform float uBaseId;
// dissolution en trame (polish W9) : oiseaux à l'écran (x, y px du tampon, rayon px, distance m)
uniform vec4 uBirdScr[12];
uniform float uBirdScrN;
uniform float uDissolve;
varying vec3 vWorld;
varying vec4 vLoc;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec3 vAlbedo;
varying vec4 vDeco;
varying vec2 vZone;
bool isMode(float m){ return abs(vDeco.y - m) < 0.5; }
void main(){
  vec3 N = normalize(vNormalW);
  float ndl = dot(N, uSunDir);
  float fl = fwidth(ndl);
  float nd = nightDist(vWorld.xz);
  float nw = max(fwidth(nd), 1e-3);
  // coordonnées de surface (hors branches) : angle autour de l'axe, hauteur, arc
  vec2 sd = normalize(uSunDir.xz + vec2(1e-5, 0.0));
  float ang = atan(-vLoc.z, vLoc.x);                       // angle « trigo » autour de l'axe
  float hu = hatchCylU(vLoc.xyz, uSunDir.xz, 3.0);          // méridiens, couture côté soleil
  float hdu = length(vec2(dFdx(hu), dFdy(hu)));
  float hv = vLoc.y;
  float hdv = length(vec2(dFdx(hv), dFdy(hv)));
  float px_ = vLoc.x;
  float dpx = length(vec2(dFdx(px_), dFdy(px_)));
  float arcR = max(vLoc.w, 0.5);
  float arc = ang * arcR;
  // dérivées d'angle sans la couture d'atan (±π) : on prend la variante tournée de π
  float angB = atan(vLoc.z, -vLoc.x);
  float dang = max(min(fwidth(ang), fwidth(angB)), 1e-5);
  float darc = max(dang * arcR, 1e-4);
  float dz = max(fwidth(vLoc.y), 1e-5);
  float n = nightMask(nd, nw);
  float mode = vDeco.y;

  // ── deux tons + ombre portée ──
  float lit = nprTerminator(ndl, fl);
  float bias = 0.6 + 1.5 * (1.0 - abs(ndl));
  vec4 sh = sampleShadow(vWorld, bias);
  float castSh = smoothstep(0.35, 0.65, sh.x) * step(sh.w, 1.5) * mix(1.0, sh.z, step(0.5, sh.y));
  float light = lit * (1.0 - castSh * (1.0 - n));
  vec3 alb = vAlbedo;
  if (isMode(M_SKIRT)) alb = mix(uLabGround, uLabSandLit, 0.35);           // sable accumulé : couleur du sol
  if (isMode(M_INK)) alb = lin2oklab(palInk(n)) + vec3(0.06, 0.0, 0.0);
  // dessus des disques : panneaux d'ombrelle alternés (deux tons de la même famille)
  float rLoc = length(vLoc.xz);
  float nSect = vZone.x > 12.0 ? 16.0 : 12.0;
  float sector = floor((ang + 3.14159) / 6.28318 * nSect);
  if (isMode(M_PANELS)) alb = mix(alb, vec3(0.93, 0.005, 0.03), 0.34 * mod(sector, 2.0));
  vec3 litLab = nprLitLab(alb, 0.0, n);
  vec3 shadeLab = nprShadeLab(litLab, alb, 0.0, n);
  if (isMode(M_SKIRT)) {
    // sable accumulé au pied : ton du sol, à peine plus clair côté soleil (jamais un anneau corail)
    vec3 g = mix(uLabGround, uNLabGround, n);
    litLab = mix(g, mix(uLabSandLit, uNLabSandLit, n), 0.3);
    shadeLab = mix(g, lin2oklab(mix(uSandShade, uNSandShade, n)), 0.6);
  }
  vec3 col = oklab2lin(mix(shadeLab, litLab, light));
  vec3 ink = palInk(n);
  float fog = fogAt(vDist);
  float lineFade = 1.0 - smoothstep(0.3, 0.55, fog);

  // ── hachures (polish W7) : des traits d'encre, pas du papier millimétré ──
  // Méridiens dont l'épaisseur suit un ton (principe de hatchTone : les traits naissent en
  // épaississant) qui ne vit que dans une bande le long de la silhouette et du terminateur,
  // plus en remplissage ; couche croisée seulement dans les vrais creux (cavité < 0,25, anneaux
  // exacts 2 et 6 m sous les surplombs) ; pas de 8,5 px et opacité × 0,6 quand le fût dépasse
  // ~150 px de large ; à contre-jour, aplat ombré sans hachures et filet de lumière côté soleil.
  float shade = 1.0 - light;
  float hatchOn = uQuality.x * (1.0 - smoothstep(0.25, 0.4, fog));
  float cav = vDeco.w;
  float vert = step(abs(N.y), 0.8);
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = dot(N, V);
  vec2 vh = -V.xz / max(length(V.xz), 1e-4);
  float backlit = smoothstep(0.3, 0.7, dot(vh, sd)) * smoothstep(0.0, 0.08, 1.0 - abs(V.y));
  float tone = shade * max(1.0 - smoothstep(0.05, 0.5, abs(ndv)), 1.0 - smoothstep(0.0, 0.3, -ndl));
  float widePx = 2.0 * arcR / max(hdv, 1e-4);
  float wide = smoothstep(120.0, 180.0, widePx);
  float spacing = mix(6.0, 8.5, wide) * uPx;
  float h1 = hatchU(hu, hdu, spacing, clamp((tone - 0.15) * 3.0, 0.0, 1.0) * 1.1 * uPx) * vert;
  float h2 = hatchU(hv, hdv, spacing, 1.0 * uPx) * (1.0 - smoothstep(0.2, 0.25, cav)) * vert * shade;
  // dessous (faces vers le bas) : lignes parallèles
  float h3 = hatchU(px_, dpx, spacing, 1.0 * uPx) * step(N.y, -0.5) * shade;
  float noHatch = max(max(float(isMode(M_SKIRT)), float(isMode(M_FLAG))), float(isMode(M_INK)));
  float hatch = max(max(h1, h2), h3) * (1.0 - noHatch) * (1.0 - backlit);
  col = mix(col, palHatch(n), hatch * palHatchOpacity(n) * hatchOn * mix(1.0, 0.6, wide));
  // filet de contre-jour : 1,5 px de lumière rasante (sandLit) sur la silhouette, côté soleil, tant que
  // le disque du soleil est au-dessus de l'horizon (il plonge derrière la Falaise à la Grande Ombre)
  // Juste à l'intérieur du trait de silhouette de l'encre (~1,5 px, posé côté objet) : distance
  // écran à la silhouette calculée sur le solide de révolution (rayon de profil, angle entre le
  // rayon local et la visée), N·V interpolé étant trop grossier sur un 48-gone ; filet entre 1,5 et
  // 3 px du bord. Côté soleil = bord du côté où le soleil déborde à l'écran (composante du soleil
  // perpendiculaire à la visée) ; soleil à moins de ~7° derrière la tour : les deux bords.
  vec2 sPerp = sd - vh * dot(sd, vh);
  vec2 ur = vLoc.xz / max(length(vLoc.xz), 1e-4);
  float silPx = arcR * (1.0 - abs(ur.x * vh.y - ur.y * vh.x)) / max(hdv, 1e-4);
  float rimSun = backlit * smoothstep(1.2 * uPx, 1.7 * uPx, silPx) * (1.0 - smoothstep(2.8 * uPx, 3.3 * uPx, silPx))
               * step(-0.12, dot(ur, sPerp)) * vert * (1.0 - noHatch) * smoothstep(-0.01, 0.03, uSunDiscDir.y);
  col = mix(col, oklab2lin(uLabSandLit), rimSun * lineFade);

  // ── fenêtres : trous d'encre 0,8 × 1,4 m, par étages ; certaines s'allument la nuit ──
  if (isMode(M_WINDOWS) && vLoc.y > vZone.x && vLoc.y < vZone.y) {
    float floorH = 4.6;
    float ncol = max(4.0, floor(6.2832 * arcR / 3.6));
    float cu = ang / 6.2832 * ncol;
    float cellU = floor(cu);
    float fz = (vLoc.y - vZone.x) / floorH;
    float cellZ = floor(fz);
    float hsh = hash12(vec2(cellU + vDeco.z * 131.0, cellZ + 7.0));
    vec2 q = vec2((fract(cu) - 0.5) * 6.2832 * arcR / ncol / 0.4, (fract(fz) - 0.45) * floorH / 0.7);
    float dq = length(q);
    float wAA = max(fwidth(dq), 1e-4);
    float win = (1.0 - smoothstep(1.0 - wAA, 1.0 + wAA, dq)) * step(hsh, 0.42) * step(vLoc.y + 0.8, vZone.y);
    float glow = step(hsh, 0.16) * smoothstep(0.4, 0.9, n);
    vec3 warm = oklab2lin(vec3(0.86, 0.035, 0.09));
    col = mix(col, mix(ink, warm, glow), win * lineFade);
  }
  // ── côtes de l'oignon : 6 méridiens d'encre ──
  if (isMode(M_RIBS)) {
    float rib = lineCov(ang, 6.2832 / 6.0, dang, 1.2 * uPx);
    col = mix(col, ink, rib * 0.75 * lineFade);
  }
  // ── cannelures de la colonne : 18 lignes fines ──
  if (isMode(M_FLUTES)) {
    float fluteL = lineCov(ang, 6.2832 / 18.0, dang, 0.9 * uPx);
    col = mix(col, ink, fluteL * 0.4 * lineFade);
  }
  // ── mât incliné du gnomon : bandes d'encre régulières ──
  if (isMode(M_BANDS)) {
    float band = lineCov(vLoc.y, 6.0, dz, 1.0 * uPx);
    col = mix(col, ink, band * 0.5 * lineFade);
  }
  // ── dessus des disques : coutures des panneaux et cercle intérieur à l'encre ──
  if (isMode(M_PANELS)) {
    float seam = lineCov(ang + 3.14159, 6.28318 / nSect, dang, 1.0 * uPx) * smoothstep(1.5, 3.0, rLoc);
    float drl = max(fwidth(rLoc), 1e-4);
    float ringL = (1.0 - smoothstep(0.5 * uPx, 1.5 * uPx, abs(rLoc - 0.78 * vZone.x) / drl)) * step(6.0, vZone.x);
    col = mix(col, ink, max(seam * 0.4, ringL * 0.5) * lineFade);
  }
  // ── dessous des disques : rayons d'ombrelle ──
  if (isMode(M_UNDER)) {
    float spokes = lineCov(ang, 6.2832 / 16.0, dang, 1.0 * uPx) * smoothstep(1.0, 4.0, length(vLoc.xz));
    col = mix(col, ink, spokes * 0.45 * lineFade);
  }
  // ── fissures : 2-3 traits d'encre fins depuis le pied des fûts ──
  if ((isMode(M_WINDOWS) || isMode(M_FLUTES)) && vLoc.y < 12.0) {
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float hk = hash12(vec2(vDeco.z * 97.0, fk * 3.7));
      float zMax = 3.0 + hk * 7.0;
      float a0 = (hash12(vec2(fk, vDeco.z * 53.0)) - 0.5) * 3.2 - 1.57;   // plutôt côté caméra (sud)
      float ca = a0 * arcR + 0.35 * sin(vLoc.y * 1.3 + fk * 2.0) + 0.14 * sin(vLoc.y * 4.1 + fk);
      float crack = (1.0 - smoothstep(0.5, 1.2, abs(arc - ca) / darc)) * (1.0 - smoothstep(zMax * 0.7, zMax, vLoc.y)) * step(0.3, vLoc.y);
      col = mix(col, ink, crack * 0.8 * lineFade * step(hk, 0.8));
    }
  }

  col = applyFog(col, fog, n);
  col += (ign(gl_FragCoord.xy) - 0.5) / 255.0;

  // ── dissolution (polish W9, vague 2 ; bible §6.8) : ce qui est à moins de NEAR0 m de la caméra
  // (au-dessus de 20 m) ou passe devant un oiseau (au-dessus de 3 m) est effacé NET, sans trame
  // (la trame à 72 % donnait un voile moiré sur 40 % du cadre quand la caméra rasait les tours).
  // Seule une bande étroite fait la transition en trame IGN, fixe à l'écran : NEAR0 → NEAR1 m, et
  // 90 → 112 % du rayon du disque de dégagement de l'oiseau (BIRD_CLEAR_R : le cœur net couvre
  // l'envergure à l'échelle cosmétique maximale, × 1,6 au-delà de 8 oiseaux). Jamais de fondu alpha (il griserait
  // l'aplat). Les pixels gardés de la bande portent l'ID « trame » : l'encre ne les cerne pas
  // (sinon chaque point de la trame deviendrait un point noir). Après toutes les dérivées : le
  // discard ne les perturbe pas.
  float sdoor = 0.0;
  if (uDissolve > 0.5 && vWorld.y > 3.0) {
    sdoor = (1.0 - smoothstep(${DISSOLVE_NEAR0.toFixed(1)}, ${DISSOLVE_NEAR1.toFixed(1)}, vDist)) * step(20.0, vWorld.y);
    for (int i = 0; i < 12; i++) {
      if (float(i) >= uBirdScrN) break;
      vec4 B = uBirdScr[i];
      if (vDist < B.w) sdoor = max(sdoor, 1.0 - smoothstep(0.9, 1.12, length(gl_FragCoord.xy - B.xy) / B.z));
    }
    if (ign(gl_FragCoord.xy) < sdoor) discard;
  }
  gl_FragColor = vec4(col, 1.0);
  writeGBuffer(vViewN, sdoor > 0.0 ? SCREEN_DOOR_ID : uBaseId + vDeco.x);
}
`

export function createTowerMaterial(): THREE.ShaderMaterial & { uniforms: TowerUniforms } {
  const own: TowerUniforms = { uBaseId: { value: 0 }, uDissolve: { value: 0 } }
  return new THREE.ShaderMaterial({
    name: 'world.tower',
    uniforms: { ...NPR, ...own },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  }) as THREE.ShaderMaterial & { uniforms: TowerUniforms }
}
