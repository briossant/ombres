// Matériau des tours et de leur décor (ART_BIBLE §6.6, R6-R14, R24) :
// deux tons teintés par la lumière (OKLab), terminateur net, ombres portées,
// hachures verticales (méridiens) sur le flanc à l'ombre, croisées à 90° dans les
// creux (cavité bakée), dessous des disques hachurés et rayés de rayons d'encre,
// fenêtres = trous d'encre (éclairées la nuit), côtes d'oignon, cannelures,
// fissures, jupe de sable aux couleurs du sol, fanions qui flottent.
import * as THREE from 'three'
import type { TowerDef } from '../../../sim/types.ts'
import { cameraState } from '../../camera/cue.ts'
import { foregroundHats, HAT_NEAR0, HAT_NEAR1, hatCutBase, towerHats, type Hat } from '../../camera/towerCover.ts'
import { gameView } from '../../view.ts'
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
/**
 * Chapeaux (disques des parasols, des piles, du gnomon, des colonnes) effacés EN ENTIER (polish
 * vague 3) : un disque que le cercle de dégagement d'un oiseau entamait était tranché net en son
 * milieu (« vue en coupe » au centre de l'image, verify2-eyes §3.1). Quand ce cercle (ou la bande de
 * proximité de la caméra) atteint un chapeau, la tour disparaît maintenant tout entière AU-DESSUS du
 * point le plus bas où le cercle touche son axe (ou du bas du chapeau) : ni disque coupé, ni bout de
 * fût ou lanterne qui flotte ; il reste un fût net qui s'arrête sous l'oiseau. À la Grande Ombre de la
 * manche, un chapeau à moins de HAT_NEAR0-1 m de la caméra (premier plan, camera/towerCover.ts) s'efface de même : la
 * caméra de manche compte avec (même règle dans son estimation d'encombrement). Transition : décision
 * binaire avec hystérésis, puis la même trame fixe à l'écran pendant CUT_FADE s.
 */
export const DISC_WHOLE = true
/** Tours suivies par le matériau (les cartes en ont au plus 11). */
const MAX_TOWERS = 16

export interface TowerUniforms {
  uBaseId: { value: number }
  /** Dissolution en trame active (0 au podium). */
  uDissolve: { value: number }
  /** Par tour : (altitude de la coupe (m), part effacée au-dessus (0..1)) ; voir DISC_WHOLE. */
  uTowerCut: { value: THREE.Vector2[] }
}

/** Caméra vue par towerCut : position (repère three), projection en NDC, taille du tampon (px), px par unité de tan (h / 2 tan(fov/2)). */
export interface HatView {
  pos: { x: number; y: number; z: number }
  project: (x: number, y: number, z: number, out: { x: number; y: number; z: number }) => void
  w: number
  h: number
  k: number
}

/** Oiseau à l'écran, comme NPR.uBirdScr : x, y (px, origine en bas à gauche), z rayon de dégagement (px), w distance (m). */
export type BirdScr = { x: number; y: number; z: number; w: number }

const _c = { x: 0, y: 0, z: 0 }

/** Point de l'axe d'une tour à l'altitude z (inclinaison du gnomon comprise), repère sim. */
function axisAt(t: TowerDef, z: number, out: { x: number; y: number }): number {
  let r = t.trunkRadius
  out.x = t.x
  out.y = t.y
  for (const g of t.segments) {
    if (z < g.z0 || z > g.z1) continue
    const k = g.z1 > g.z0 ? (z - g.z0) / (g.z1 - g.z0) : 0
    out.x = t.x + (g.ox0 ?? 0) + ((g.ox1 ?? 0) - (g.ox0 ?? 0)) * k
    out.y = t.y + (g.oy0 ?? 0) + ((g.oy1 ?? 0) - (g.oy0 ?? 0)) * k
    r = g.r0 + (g.r1 - g.r0) * k
    break
  }
  return r
}
const _ax = { x: 0, y: 0 }

/**
 * Coupe d'une tour (DISC_WHOLE) : part effacée (0..1) et altitude au-dessus de laquelle elle l'est.
 * Un chapeau est « atteint » quand le cercle de dégagement d'un oiseau qu'il cache touche son ellipse à
 * l'écran (la bande 0,9-1,12 × rayon du cercle donne la transition), ou qu'il passe à moins de
 * DISSOLVE_NEAR0-1 m de la caméra. La coupe descend alors le long de l'axe tant que l'axe reste dans le
 * cercle (le fût ne reprend pas au-dessus de l'oiseau). 0 sans chapeau atteint : règle par fragment.
 */
export function towerCut(
  t: TowerDef,
  hats: readonly Hat[],
  view: HatView,
  birds: readonly BirdScr[],
  nBirds: number,
  out: { z: number; amount: number },
  near0 = DISSOLVE_NEAR0,
  near1 = DISSOLVE_NEAR1,
): void {
  out.z = 1e4
  out.amount = 0
  for (const hat of hats) {
    const zm = (hat.z0 + hat.z1) / 2
    // repère three : (x, altitude, −y)
    const dh = Math.hypot(hat.x - view.pos.x, -hat.y - view.pos.z)
    const dv = view.pos.y - zm
    const near = Math.hypot(Math.max(0, dh - hat.r), Math.max(0, Math.abs(dv) - (hat.z1 - hat.z0) / 2))
    const aNear = 1 - smoothstep(near0, near1, near)
    const base = hatCutBase(hat)
    if (aNear > 0) {
      out.amount = Math.max(out.amount, aNear)
      out.z = Math.min(out.z, base)
    }
    view.project(hat.x, zm, -hat.y, _c)
    if (_c.z > 1) continue
    const d = Math.max(1, Math.hypot(dh, dv))
    // ellipse du disque à l'écran (px, origine en bas à gauche) : demi-axes r·k/d et r·sin(dépression)·k/d + épaisseur
    const px = ((_c.x + 1) / 2) * view.w
    const py = ((_c.y + 1) / 2) * view.h
    const ax = Math.max((hat.r * view.k) / d, 1e-3)
    const sinD = Math.min(1, Math.abs(dv) / d)
    const ay = Math.max(ax * sinD + (((hat.z1 - hat.z0) / 2) * Math.sqrt(1 - sinD * sinD) * view.k) / d, 1e-3)
    for (let i = 0; i < nBirds; i++) {
      const B = birds[i]!
      if (B.w <= d) continue
      // écart (px) entre le centre de l'oiseau et le bord de l'ellipse (négatif dedans), sur 24 points du bord
      const ux = (B.x - px) / ax
      const uy = (B.y - py) / ay
      let gap = -1
      if (ux * ux + uy * uy > 1) {
        gap = Infinity
        for (let k = 0; k < 24; k++) {
          const th = (k / 24) * Math.PI * 2
          gap = Math.min(gap, Math.hypot(B.x - px - Math.cos(th) * ax, B.y - py - Math.sin(th) * ay))
        }
      }
      const a = 1 - smoothstep(0.9 * B.z, 1.12 * B.z, gap)
      if (a <= 0) continue
      out.amount = Math.max(out.amount, a)
      // descente le long de l'axe, sous le chapeau (et ses lanternes pendues), tant qu'il reste dans le cercle (fût compris)
      let zc = base
      for (let z = base - 1.5; z > 3; z -= 1.5) {
        const r = axisAt(t, z, _ax)
        view.project(_ax.x, z, -_ax.y, _c)
        const dz = Math.max(1, Math.hypot(_ax.x - view.pos.x, z - view.pos.y, -_ax.y - view.pos.z))
        if (_c.z > 1 || dz >= B.w) break
        const sx = ((_c.x + 1) / 2) * view.w
        const sy = ((_c.y + 1) / 2) * view.h
        if (Math.hypot(sx - B.x, sy - B.y) - (r * view.k) / dz > 1.12 * B.z) break
        zc = z
      }
      out.z = Math.min(out.z, zc)
    }
  }
}

function smoothstep(a: number, b: number, x: number): number {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

const _v = new THREE.Vector3()
const _vp = new THREE.Matrix4()
const _cut = { z: 0, amount: 0 }
const _hatView: HatView = {
  pos: { x: 0, y: 0, z: 0 },
  project: (x, y, z, out) => {
    _v.set(x, y, z).applyMatrix4(_vp)
    out.x = _v.x
    out.y = _v.y
    out.z = _v.z
  },
  w: 1,
  h: 1,
  k: 1,
}

/**
 * Coupe franche dans le temps (pas de trame qui dure) : la décision est binaire, avec hystérésis
 * (on coupe au-delà de CUT_ON de la part brute, on rend sous CUT_OFF), puis la trame fixe à l'écran
 * fait la transition en CUT_FADE s. Un oiseau qui reste au bord du cercle ne laisse plus un chapeau
 * à moitié tramé.
 */
const CUT_ON = 0.35
const CUT_OFF = 0.02
const CUT_FADE = 0.22
interface CutState {
  towers: readonly TowerDef[] | null
  on: Uint8Array
  amount: Float32Array
  z: Float32Array
  frame: number
  time: number
}
function newCutState(): CutState {
  return { towers: null, on: new Uint8Array(MAX_TOWERS), amount: new Float32Array(MAX_TOWERS), z: new Float32Array(MAX_TOWERS).fill(1e4), frame: -1, time: 0 }
}

/** Met à jour uTowerCut pour la caméra du rendu (une fois par image ; ~11 tours × 12 oiseaux). */
function updateTowerCuts(u: TowerUniforms, st: CutState, frame: number, camera: THREE.Camera): void {
  if (frame === st.frame) return
  st.frame = frame
  const now = performance.now() / 1000
  const dt = Math.min(0.1, Math.max(0, now - st.time))
  st.time = now
  const cuts = u.uTowerCut.value
  const towers = gameView.sim?.towers ?? null
  const cam = camera as THREE.PerspectiveCamera
  if (!towers || u.uDissolve.value < 0.5 || !cam.isPerspectiveCamera || towers !== st.towers) {
    // nouvelle carte, podium, titre sans manche : aucune coupe en cours
    st.towers = towers
    st.on.fill(0)
    st.amount.fill(0)
    st.z.fill(1e4)
    for (const c of cuts) c.set(1e4, 0)
    if (!towers || u.uDissolve.value < 0.5 || !cam.isPerspectiveCamera) return
  }
  const hats = towerHats(towers)
  // chapeaux de premier plan effacés à la Grande Ombre de la manche seulement (le titre choisit ses plans sans tour proche)
  const round = cameraState.mode === 'round' && foregroundHats(gameView.sim)
  _vp.multiplyMatrices(cam.projectionMatrix, cam.matrixWorldInverse)
  cam.getWorldPosition(_v)
  _hatView.pos.x = _v.x
  _hatView.pos.y = _v.y
  _hatView.pos.z = _v.z
  _hatView.w = NPR.uResolution.value.x
  _hatView.h = NPR.uResolution.value.y
  _hatView.k = _hatView.h / (2 * Math.tan((cam.fov * Math.PI) / 360))
  for (let i = 0; i < Math.min(MAX_TOWERS, towers.length); i++) {
    if (!hats[i]!.length) continue
    towerCut(towers[i]!, hats[i]!, _hatView, NPR.uBirdScr.value, NPR.uBirdScrN.value, _cut, round ? HAT_NEAR0 : DISSOLVE_NEAR0, round ? HAT_NEAR1 : DISSOLVE_NEAR1)
    if (_cut.amount >= CUT_ON) st.on[i] = 1
    else if (_cut.amount <= CUT_OFF) st.on[i] = 0
    // la coupe suit l'oiseau tant qu'elle est active ; en s'effaçant, elle garde sa dernière hauteur
    if (st.on[i]) st.z[i] = st.amount[i]! > 0.01 ? Math.min(_cut.z, st.z[i]! + 6 * dt) : _cut.z
    st.amount[i] = st.on[i] ? Math.min(1, st.amount[i]! + dt / CUT_FADE) : Math.max(0, st.amount[i]! - dt / CUT_FADE)
    cuts[i]!.set(st.amount[i]! > 0 ? st.z[i]! : 1e4, st.amount[i]!)
  }
}

const VERT = /* glsl */ `
attribute vec4 tloc;
attribute vec3 albedo;
attribute vec4 tdeco;
attribute vec2 tzone;
uniform float uTime;
// coupe des tours à chapeau (polish vague 3, DISC_WHOLE) : par tour, (altitude, part effacée au-dessus)
uniform vec2 uTowerCut[${MAX_TOWERS}];
varying vec3 vWorld;
varying vec4 vLoc;
varying vec3 vNormalW;
varying vec3 vViewN;
varying float vDist;
varying vec3 vAlbedo;
varying vec4 vDeco;
varying vec2 vZone;
varying vec2 vCut;
void main(){
  // tour du sommet : ID = towerBase + 4 × tour + pièce (npr/ids.ts)
  float ti = floor((tdeco.x - ${OBJ_ID.towerBase}.0) / 4.0 + 0.01);
  vCut = ti >= 0.0 && ti < ${MAX_TOWERS}.0 ? uTowerCut[int(ti)] : vec2(1e4, 0.0);
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
varying vec2 vCut;
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
    // (vague 3) tour à chapeau atteint : effacée en entier au-dessus de la coupe (DISC_WHOLE)
    sdoor = max(sdoor, vCut.y * smoothstep(vCut.x - 2.0, vCut.x, vWorld.y));
    if (ign(gl_FragCoord.xy) < sdoor) discard;
  }
  gl_FragColor = vec4(col, 1.0);
  writeGBuffer(vViewN, sdoor > 0.0 ? SCREEN_DOOR_ID : uBaseId + vDeco.x);
}
`

export function createTowerMaterial(): THREE.ShaderMaterial & { uniforms: TowerUniforms } {
  const own: TowerUniforms = { uBaseId: { value: 0 }, uDissolve: { value: 0 }, uTowerCut: { value: Array.from({ length: MAX_TOWERS }, () => new THREE.Vector2(1e4, 0)) } }
  const mat = new THREE.ShaderMaterial({
    name: 'world.tower',
    uniforms: { ...NPR, ...own },
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.FrontSide,
  }) as THREE.ShaderMaterial & { uniforms: TowerUniforms }
  // coupe des tours à chapeau (vague 3) : décidée pour la caméra de CE rendu (les oiseaux à l'écran viennent de birdScreen.ts)
  const cutState = newCutState()
  mat.onBeforeRender = (renderer, _scene, camera) => updateTowerCuts(own, cutState, renderer.info.render.frame, camera)
  return mat
}
