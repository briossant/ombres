// Matériaux de l'oiseau : corps (os deux tons, ventre hachuré, couleur du joueur
// sur bande/cape/selle/fanion, cavalier en cuir hachuré, œil, visage creux de la
// capuche, bouts d'ailes « prêts »), et coque inversée d'encre (1,2 px, épaisseur
// constante à l'écran ; 0,2 px au loin). Au loin (< 70 px d'envergure), la bande
// d'aile s'élargit (52 % de la demi-aile), cape et selle doublent, ni les pièces
// colorées ni le cavalier ne sont plus cernés (le cerne mangeait la couleur) et la
// couleur d'identité garde tout son chroma. La coque porte aussi le liseré de lumière
// (contre-jour du podium, lumière rasante du soleil bas sur tous les oiseaux).
// Chunks, palette jour/nuit, ombres et brume : cadre NPR
// de l'agent world (via ./npr.ts). L'âme de l'ombre est le même SkinnedMesh
// inscrit dans la height shadow map (même squelette → même déformation).
import { BackSide, Color, ShaderMaterial, Vector2, Vector3 } from 'three'
import { GLSL_GLYPHS } from './glyphs.ts'
import { GLSL_NIGHT, GLSL_PRELUDE, GLSL_VERTEX_PRELUDE, hexToLinear, nprUniforms } from './npr.ts'
import { PART, type BirdModel } from './geometry.ts'

/** Uniforms propres à un oiseau (le reste est partagé par référence). */
export interface BirdUniforms {
  /** Couleur d'identité du joueur (RGB linéaire). */
  uPlayer: { value: Color }
  /** ID d'encre de base (20 + slot). */
  uId: { value: number }
  /** Oiseau caché (0..1) : 55 % vers l'ombre portée (35 % au soleil bas, couleur du joueur gardée). */
  uHidden: { value: number }
  /** Recharge du COUP D'AILE : 0 = vient d'être utilisé, 1 = prêt (bouts d'ailes blancs). */
  uTipCharge: { value: number }
  /** Éclair blanc des bouts d'ailes au moment où le coup d'aile est prêt. */
  uTipFlash: { value: number }
  /** Détail selon la taille à l'écran : 0 (loin) → 1 (gros plan). Hachures, reflet de l'œil, glyphe. */
  uDetail: { value: number }
  /** Glyphe du joueur (0..11) sur le fanion en mode daltonien, −1 = aucun. */
  uGlyph: { value: number }
  /** Bornes de la bande colorée (distance à l'axe, m) : normale ou élargie au loin. */
  uBand: { value: Vector2 }
  /** 1 = pièces colorées cernées (ID propre), 0 = même ID que le corps (loin : pas de cerne interne). */
  uAccentOn: { value: number }
  /** Agrandissement de la cape et de la selle (1 → 2 au loin). */
  uAccentScale: { value: number }
  /** Épaisseur de la coque d'encre (px 1080p). */
  uHullWidth: { value: number }
  /** Posture perchée (podium) 0..1 : liseré de contre-jour et remplissage de face. */
  uPerch: { value: number }
  /** Traitement « loin » (0..1, envergure affichée < 98 px) : couleur d'identité renforcée. */
  uFar: { value: number }
}

/** Épaisseur de la coque d'encre (px 1080p) : gros plans et distance moyenne… */
export const HULL_WIDTH_PX = 1.2
/** …et au loin (le post-traitement ajoute ~1 px : cerne total ≈ 1,2 px). */
export const HULL_WIDTH_FAR_PX = 0.2
/**
 * Bande d'aile élargie au loin : 52 % de la demi-aile (fractions de la demi-envergure), du coude
 * à 0,2 m des bouts d'ailes (qui gardent le signal « coup d'aile prêt »). Polish vague 2 : à 38 %,
 * à 55-65 px d'envergure, la bande ne faisait que 3 à 5 px de corde et ne se lisait pas à 1:1.
 */
export const BAND_FAR: readonly [number, number] = [0.3, 0.82]
/** Agrandissement maximal de la cape et de la selle au loin. */
export const ACCENT_SCALE_FAR = 2.0

const LEATHER = hexToLinear('#8A5A3C')
const POLE = hexToLinear('#4A3328')

const PARTS_GLSL = /* glsl */ `
#define P_BODY ${PART.body}
#define P_WING ${PART.wing}
#define P_LEATHER ${PART.leather}
#define P_CAPE ${PART.cape}
#define P_SADDLE ${PART.saddle}
#define P_FLAG ${PART.flag}
#define P_POLE ${PART.pole}
#define P_CREST ${PART.crest}
#define P_BEAK ${PART.beak}
`

// Au loin, cape et selle grossissent autour de la selle (espace de liaison, avant le
// skinning : les poids restent valables). Même déformation pour le corps et la coque.
const ACCENT_GLSL = /* glsl */ `
uniform float uAccentScale;
uniform vec3 uAccentPivot;
vec3 accentDeform(vec3 p, float part){
  float k = uAccentScale - 1.0;
  if (k > 0.001 && (abs(part - float(P_CAPE)) < 0.5 || abs(part - float(P_SADDLE)) < 0.5)) {
    // Surtout en plan (lisible vu de dessus), un peu en hauteur.
    return uAccentPivot + (p - uAccentPivot) * vec3(1.0 + k, 1.0 + 0.35 * k, 1.0 + k);
  }
  return p;
}
`

// Le SkinnedMesh est en mode « detached » à matrixWorld identité : `transformed`
// skinné est déjà en monde (modelMatrix = identité).
const VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
${PARTS_GLSL}
${ACCENT_GLSL}
attribute float aPart;
attribute vec2 aCoord;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying vec3 vBind;
varying float vPart;
varying vec2 vCoord;
varying float vDist;
void main(){
  #include <skinbase_vertex>
  #include <begin_vertex>
  transformed = accentDeform(transformed, aPart);
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vWorld = wp.xyz;
  vNormalW = normalize(mat3(modelMatrix) * objectNormal);
  vViewN = normalize(normalMatrix * objectNormal);
  vBind = position;
  vPart = aPart;
  vCoord = aCoord;
  vec4 mv = viewMatrix * wp;
  vDist = length(mv.xyz);
  gl_Position = projectionMatrix * mv;
}
`

/** ID d'encre d'un fragment (partagé par le corps et la coque) : la bande et les pièces colorées sont cernées. */
const ID_GLSL = /* glsl */ `
float partId(int part, float ax, float fw){
  float band = part == P_WING ? smoothstep(uBand.x - fw, uBand.x + fw, ax) * (1.0 - smoothstep(uBand.y - fw, uBand.y + fw, ax)) : 0.0;
  bool colored = part == P_CAPE || part == P_SADDLE || part == P_FLAG || band > 0.5;
  bool rider = part == P_LEATHER || part == P_POLE;
  // Au loin (uAccentOn = 0), ni les pièces colorées ni le cavalier n'ont de cerne propre :
  // le double trait d'encre mangeait la couleur et faisait un nœud noir au milieu de l'oiseau.
  return uAccentOn < 0.5 ? uId : colored ? uId + 40.0 : rider ? uRiderId : uId;
}
`

const FRAG = /* glsl */ `
${GLSL_PRELUDE}
${PARTS_GLSL}
uniform vec3 uPlayer;
uniform float uId, uRiderId, uHidden, uTipCharge, uTipFlash, uDetail, uGlyph, uAccentOn, uPerch, uFar;
uniform vec2 uBand;
uniform vec3 uEye;
uniform vec4 uFace;
uniform vec3 uLeather, uPole;
varying vec3 vWorld;
varying vec3 vNormalW;
varying vec3 vViewN;
varying vec3 vBind;
varying float vPart;
varying vec2 vCoord;
varying float vDist;
${GLSL_GLYPHS}
${ID_GLSL}

// Couleur d'identité : garde au moins minK × le chroma de l'albédo du joueur (OKLab),
// quelle que soit la lumière (couchant qui tire tout vers l'orange, oiseau caché, nuit) ;
// teinte à mi-chemin entre la teinte éclairée et celle de l'albédo (hueK = 0), ou ramenée
// jusqu'à celle de l'albédo (hueK = 1) ; luminance ramenée de lPull vers celle de l'albédo
// (la lumière chaude délavait les bandes en pastel).
vec3 keepChroma(vec3 c, vec3 ref, float minK, float lPull, float hueK){
  vec3 a = lin2oklab(max(c, vec3(0.0)));
  vec3 r = lin2oklab(max(ref, vec3(0.0)));
  float ca = length(a.yz);
  float cr = length(r.yz);
  if (cr < 1e-4) return c;
  vec2 hr = r.yz / cr;
  vec2 h = ca > 1e-4 ? normalize(a.yz / ca * (1.0 - hueK) + hr) : hr;
  return oklab2lin(vec3(mix(a.x, min(a.x, r.x), lPull), h * max(ca, minK * cr)));
}

void main(){
  int part = int(vPart + 0.5);
  vec3 N = normalize(vNormalW);
  // ── dérivées et masques, hors branches ──
  float nd = nightDist(vWorld.xz);
  float nw = max(fwidth(nd), 1e-3);
  float n = nightMask(nd, nw);
  float ndl = dot(N, uSunDir);
  float fl = max(fwidth(ndl), 1e-4);
  float lit = nprTerminator(ndl, fl);
  vec4 sh = sampleShadow(vWorld, 0.8);
  float light = lit * (1.0 - smoothstep(0.35, 0.65, sh.x) * step(sh.w, 1.5));
  float ax = abs(vBind.x);
  float fw = max(fwidth(ax), 1e-4);
  float duX = length(vec2(dFdx(vBind.x), dFdy(vBind.x)));
  float uL = (vBind.y + vBind.z) * 0.7071;
  float duL = length(vec2(dFdx(uL), dFdy(uL)));
  float fwc = max(fwidth(vCoord.x), 1e-4);
  float fwq = max(fwidth(vCoord.y), 1e-4);
  // Glyphe du fanion (mode daltonien), côté miroir corrigé.
  vec2 gp = vec2((vCoord.x - 0.2) * 18.0 * sign(vBind.x), vCoord.y * 1.7);
  float g = uGlyph >= 0.0 ? glyphSdf(int(uGlyph + 0.5), gp * 1.15) : 1.0;
  float gw = max(fwidth(g), 1e-3);

  vec3 boneLit = mix(uBirdLit, uNBirdLit, n);
  vec3 boneShade = mix(uBirdShade, uNBirdShade, n);
  vec3 ink = palInk(n);
  vec3 litC = boneLit;
  vec3 shadeC = boneShade;
  float hatchK = 0.0;
  float hatchU0 = vBind.x;
  float hatchDu = duX;
  // Part de la couleur du joueur dans le fragment (bande, cape, selle, fanion).
  float accent = 0.0;

  if (part == P_WING) {
    float band = smoothstep(uBand.x - fw, uBand.x + fw, ax) * (1.0 - smoothstep(uBand.y - fw, uBand.y + fw, ax));
    accent = band;
    litC = mix(litC, birdLitOf(uPlayer, n), band);
    shadeC = mix(shadeC, birdShadeOf(uPlayer, n), band);
    // Bouts d'ailes : ombrés pendant la recharge du COUP D'AILE, blancs quand il est prêt.
    float tipStart = mix(4.72, 5.6, uTipCharge);
    float tip = smoothstep(tipStart - fw * 1.5, tipStart + fw * 1.5, ax) * step(uTipCharge, 0.999);
    vec3 castCol = palCast(n); // (« cast » est un mot réservé GLSL)
    litC = mix(litC, mix(boneShade, castCol, 0.45), tip * 0.8);
    shadeC = mix(shadeC, mix(boneShade, castCol, 0.7), tip * 0.8);
    float white = uTipFlash * smoothstep(4.6, 4.9, ax);
    litC = mix(litC, uCream, white);
    shadeC = mix(shadeC, uCream, white * 0.7);
    hatchK = (1.0 - band) * (1.0 - smoothstep(-0.45, -0.25, N.y)) * (1.0 - smoothstep(1.6, 2.6, ax));
  } else if (part == P_BODY || part == P_CREST || part == P_BEAK) {
    hatchK = 1.0 - smoothstep(-0.5, -0.3, N.y);
    if (part == P_BEAK) litC = mix(litC, boneShade, 0.2);
  } else if (part == P_LEATHER) {
    litC = birdLitOf(uLeather, n);
    shadeC = birdShadeOf(uLeather, n);
    hatchK = 1.0;
    hatchU0 = uL;
    hatchDu = duL;
  } else if (part == P_POLE) {
    litC = birdLitOf(uPole, n);
    shadeC = mix(litC, ink, 0.5);
  } else {
    litC = birdLitOf(uPlayer, n);
    shadeC = birdShadeOf(uPlayer, n);
    accent = 1.0;
  }

  vec3 col = mix(shadeC, litC, light);
  // Podium (contre-jour) : 25 % de remplissage de la face à l'ombre, pour lire volumes et couleurs.
  col = mix(col, litC, 0.25 * uPerch * (1.0 - light));

  // Hachures d'encre dans l'ombre (espace objet, densité écran constante), gros plans.
  float hatch = hatchU(hatchU0, hatchDu, 6.5 * uPx, 1.0 * uPx) * hatchK * (1.0 - light) * uQuality.x;
  float hatchOp = part == P_LEATHER ? 0.5 : 0.4;
  col = mix(col, palHatch(n), hatch * hatchOp * smoothstep(0.15, 0.6, uDetail));

  // Gros plans : pli d'encre le long du bras de l'aile (os du bord d'attaque), de
  // l'emplanture au poignet, sur l'extrados seulement (« plis internes », bible §6.7).
  float spar = (1.0 - smoothstep(0.7, 1.7, abs(vCoord.y - 0.2) / fwq)) * step(0.0, N.y)
             * smoothstep(0.5, 0.9, ax) * (1.0 - smoothstep(2.6, 3.0, ax)) * (part == P_WING ? 1.0 : 0.0);
  col = mix(col, ink, spar * 0.55 * smoothstep(0.45, 0.8, uDetail));

  // Œil : point d'encre, reflet papier en gros plan.
  vec3 eq = vec3(ax, vBind.y, vBind.z) - uEye;
  float eye = (1.0 - smoothstep(0.039, 0.051, length(eq))) * (part == P_BODY ? 1.0 : 0.0);
  col = mix(col, ink, eye);
  float glint = 1.0 - smoothstep(0.011, 0.017, length(eq - vec3(-0.004, 0.016, 0.012)));
  col = mix(col, uPaper, glint * eye * step(0.6, uDetail));

  // Capuche : ouverture du visage (le visage reste invisible : un creux d'encre).
  if (part == P_LEATHER && vCoord.x > 2.0) {
    vec2 fq = (vBind.xy - uFace.xy) / vec2(0.056, 0.064);
    float face = (1.0 - smoothstep(0.85, 1.0, length(fq))) * step(uFace.z, vBind.z);
    col = mix(col, mix(ink, shadeC, 0.25), face);
  }
  // Fanion : glyphe du joueur à l'encre (mode daltonien, gros plans).
  if (part == P_FLAG) {
    float gk = (1.0 - smoothstep(-gw, gw, g)) * 0.9 * smoothstep(0.3, 0.6, uDetail);
    col = mix(col, ink, gk);
    accent *= 1.0 - gk;
  }
  // Cape : ourlet plus sombre en bas (pli de tissu).
  if (part == P_CAPE) {
    float hem = smoothstep(0.86 - fwc, 0.86 + fwc, vCoord.x) * (1.0 - smoothstep(0.93 - fwc, 0.93 + fwc, vCoord.x));
    col = mix(col, birdShadeOf(uPlayer, n), hem * 0.7 * smoothstep(0.2, 0.5, uDetail));
  }

  // Les pièces colorées gardent le chroma du joueur, éclairées, à l'ombre ou cachées : 80 % de
  // jour de près, 100 % au soleil bas (paletteElev < 10 → 16) et au loin, +12 % au loin (une petite
  // tache de couleur paraît plus terne qu'un aplat : effet de petit champ), 85 % dans la nuit
  // (polish vague 2 : à la Grande Ombre, les bandes des oiseaux côté nuit tombaient à C ≈ 0,05).
  float lowSun = 1.0 - smoothstep(10.0, 16.0, uPaletteElev);
  float minC = mix(mix(0.8, 1.0, max(lowSun, uFar)) * (1.0 + 0.12 * uFar), 0.85, n);
  // Au soleil bas et au loin, la teinte revient vers celle du joueur (le corail tirait Lilas vers le rose).
  float hueK = 0.7 * max(lowSun, uFar);
  if (accent > 0.001) col = mix(col, keepChroma(col, uPlayer, minC, 0.5 * (1.0 - n), hueK), accent);
  // Oiseau caché : 55 % vers l'ombre portée (ART_BIBLE §5.3), 35 % au soleil bas
  // (paletteElev < 10) — polish B5 : au couchant, la moitié des oiseaux est cachée. L'os
  // s'assombrit (lecture « à l'ombre ») ; les pièces colorées gardent leur chroma.
  if (uHidden > 0.001) {
    col = mix(col, palCast(n), uHidden * mix(0.35, 0.55, smoothstep(9.0, 12.0, uPaletteElev)));
    if (accent > 0.001) col = mix(col, keepChroma(col, uPlayer, minC, 0.0, hueK), accent);
  }
  // Brume : 60 % de moins sur les pièces colorées (l'identité reste lisible au fond de l'arène).
  col = applyFog(col, fogAt(vDist) * (1.0 - 0.6 * accent), n);
  gl_FragColor = vec4(col, 1.0);
  #include <colorspace_fragment>
  writeGBuffer(vViewN, partId(part, ax, fw));
}
`

// Coque d'encre. Côté soleil, elle s'élargit et prend la couleur de la lumière : sous le
// trait d'encre du post-traitement (≈ 1 px, sur le bord extérieur de la coque) reste un
// liseré clair de 1,5 à 2 px (contre-jour du podium, oiseau caché au soleil bas).
const HULL_VERT = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>
${GLSL_VERTEX_PRELUDE}
${GLSL_NIGHT}
${PARTS_GLSL}
${ACCENT_GLSL}
uniform float uHullWidth, uHidden, uPerch;
attribute float aPart;
varying vec3 vViewN;
varying float vDist;
varying vec3 vBind;
varying float vPart;
varying vec3 vWorld;
varying float vRim;
void main(){
  #include <skinbase_vertex>
  #include <begin_vertex>
  transformed = accentDeform(transformed, aPart);
  #include <beginnormal_vertex>
  #include <skinnormal_vertex>
  #include <skinning_vertex>
  vec4 wp = modelMatrix * vec4(transformed, 1.0);
  vec4 mv = viewMatrix * wp;
  vec4 clip = projectionMatrix * mv;
  vec3 nV = normalize(normalMatrix * objectNormal);
  vec2 nc = (projectionMatrix * vec4(nV, 0.0)).xy;
  float l = length(nc);
  vec2 dir = l > 1e-5 ? nc / l : vec2(0.0);
  // Liseré : podium (contre-jour, 2 px), ou lumière rasante du soleil bas hors de la nuit
  // (1,5 px, tous les oiseaux : polish vague 2, au couchant en plan large les oiseaux n'étaient
  // plus que des silhouettes grises ; caché ou non, le bord côté soleil s'allume).
  float lowSun = 1.0 - smoothstep(10.0, 16.0, uPaletteElev);
  float day = nightDist(wp.xz) > 0.0 ? 0.0 : 1.0;
  float rimK = max(uPerch, lowSun * day);
  vec3 sunV = (viewMatrix * vec4(uSunDir, 0.0)).xyz;
  float sl = length(sunV.xy);
  // Côté soleil à l'écran ; soleil derrière le sujet (contre-jour) : tout le contour s'allume, le haut d'abord.
  // En vol (ni caché, ni perché), seul le bord franchement tourné vers le soleil s'allume : un
  // liseré tout autour de l'oiseau se lisait comme un contour orange (confusion avec Corail).
  float sd = sl > 1e-3 ? dot(dir, sunV.xy / sl) : -1.0;
  float wide = max(uPerch, uHidden);
  float side = mix(smoothstep(0.3, 0.8, sd), smoothstep(-0.1, 0.45, sd), wide);
  side = max(side, wide * smoothstep(0.2, 0.8, -sunV.z) * (0.55 + 0.45 * smoothstep(-0.6, 0.4, dir.y)));
  vRim = rimK * side;
  // Le trait d'encre du post-traitement couvre ~1,5 px du bord extérieur : 2,6 px → liseré de
  // ≈ 1 px (vol), 3 px → 1,5 px (caché), 4 px → 2,5 px (podium).
  float w = max(uHullWidth, mix(uHullWidth, mix(mix(2.6, 3.0, uHidden), 4.0, uPerch), vRim));
  // Épaisseur constante en pixels ; nulle là où la normale fait face à la caméra.
  clip.xy += dir * w * uPx * 2.0 / uResolution * clip.w;
  vViewN = nV;
  vDist = length(mv.xyz);
  vBind = position;
  vPart = aPart;
  vWorld = wp.xyz;
  gl_Position = clip;
}
`

const HULL_FRAG = /* glsl */ `
${GLSL_PRELUDE}
${PARTS_GLSL}
uniform float uId, uRiderId, uAccentOn, uPerch;
uniform vec2 uBand;
varying vec3 vViewN;
varying float vDist;
varying vec3 vBind;
varying float vPart;
varying vec3 vWorld;
varying float vRim;
${ID_GLSL}
void main(){
  float nd = nightDist(vWorld.xz);
  float n = nightMask(nd, max(fwidth(nd), 1e-3));
  float ax = abs(vBind.x);
  float fw = max(fwidth(ax), 1e-4);
  float f = fogAt(vDist);
  // Liseré de lumière : dernière lumière (sandLit KF1) éclaircie vers la crème, plus claire au podium.
  vec3 rimC = mix(uLipColor, uCream, 0.4 + 0.15 * uPerch);
  vec3 c = mix(palInk(n), rimC, smoothstep(0.25, 0.6, vRim) * (1.0 - n));
  gl_FragColor = vec4(mix(c, fogColor(f, n), f * 0.8), 1.0);
  #include <colorspace_fragment>
  writeGBuffer(vViewN, partId(int(vPart + 0.5), ax, fw));
}
`

export interface BirdMaterials {
  body: ShaderMaterial
  hull: ShaderMaterial
  uniforms: BirdUniforms
  /** ID d'encre du cavalier (réglé par le rig selon le slot). */
  riderId: { value: number }
}

export function createBirdMaterials(model: BirdModel): BirdMaterials {
  const own: BirdUniforms = {
    uPlayer: { value: new Color(1, 0.5, 0.3) },
    uId: { value: 20 },
    uHidden: { value: 0 },
    uTipCharge: { value: 1 },
    uTipFlash: { value: 0 },
    uDetail: { value: 0 },
    uGlyph: { value: -1 },
    uBand: { value: new Vector2(...model.band) },
    uAccentOn: { value: 1 },
    uAccentScale: { value: 1 },
    uHullWidth: { value: HULL_WIDTH_PX },
    uPerch: { value: 0 },
    uFar: { value: 0 },
  }
  const riderId = { value: 44 }
  const uAccentPivot = { value: new Vector3(...model.bind.rider) }
  const body = new ShaderMaterial({
    name: 'BirdBody',
    uniforms: {
      ...nprUniforms,
      ...own,
      uRiderId: riderId,
      uAccentPivot,
      uEye: { value: new Vector3(...model.eye) },
      uFace: { value: model.face },
      uLeather: { value: new Color().setRGB(...LEATHER) },
      uPole: { value: new Color().setRGB(...POLE) },
    },
    vertexShader: VERT,
    fragmentShader: FRAG,
  })
  const hull = new ShaderMaterial({
    name: 'BirdHull',
    side: BackSide,
    uniforms: {
      ...nprUniforms,
      uId: own.uId,
      uRiderId: riderId,
      uBand: own.uBand,
      uAccentOn: own.uAccentOn,
      uAccentScale: own.uAccentScale,
      uAccentPivot,
      uHullWidth: own.uHullWidth,
      uHidden: own.uHidden,
      uPerch: own.uPerch,
    },
    vertexShader: HULL_VERT,
    fragmentShader: HULL_FRAG,
  })
  return { body, hull, uniforms: own, riderId }
}

export { PART }
