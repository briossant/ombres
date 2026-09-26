// Uniforms partagés du pipeline NPR.
//
// Un seul objet `{ value }` par uniform, référencé par TOUS les matériaux : la
// palette, le soleil, la height shadow map, la brume et le front de nuit sont
// mis à jour une fois par frame (palette.ts, shadowMap.ts, NprPipeline) et
// three.js les pousse tels quels (ART_BIBLE §2.5, NPR §5).
//
// Deux « emplacements » de palette coexistent :
//   - jour : keyframes interpolées à paletteElev (KF80 → KF1) ;
//   - nuit : KF-4 → KF-15 (fondu des résultats), utilisée derrière le front de
//     la Grande Ombre (transition spatiale, ART_BIBLE §4.6).
// Les matériaux choisissent par pixel avec le masque de nuit (chunk `night`).
import * as THREE from 'three'

const color = () => ({ value: new THREE.Color() })
const vec3 = () => ({ value: new THREE.Vector3() })
const num = (v = 0) => ({ value: v })

/** Capacité de la texture du profil dentelé du front de nuit (échantillons). */
export const NIGHT_JAG_SAMPLES = 512
/** Codes propriétaires : 0 = neutre, 1..12 = slot + 1. */
export const OWNER_CODES = 13

function makeNoiseTexture(size = 256): THREE.DataTexture {
  // Texture de bruit tileable générée au démarrage (NPR §4.10) : un bruit ALU par
  // pixel coûtait ~4 ms sur le sol. R, G = warp basse fréquence ; B = moyenne ;
  // A = grain fin (papier, granulation).
  const d = new Uint8Array(size * size * 4)
  const h = (x: number, y: number, s: number) => {
    const v = Math.sin(x * 127.1 + y * 311.7 + s * 74.7) * 43758.5453
    return v - Math.floor(v)
  }
  const noise = (x: number, y: number, per: number, s: number) => {
    const X = (x * per) / size
    const Y = (y * per) / size
    const ix = Math.floor(X)
    const iy = Math.floor(Y)
    const fx = X - ix
    const fy = Y - iy
    const u = fx * fx * (3 - 2 * fx)
    const v = fy * fy * (3 - 2 * fy)
    const w = (i: number) => ((i % per) + per) % per
    const a = h(w(ix), w(iy), s)
    const b = h(w(ix + 1), w(iy), s)
    const c = h(w(ix), w(iy + 1), s)
    const e = h(w(ix + 1), w(iy + 1), s)
    return a + (b - a) * u + (c - a) * v + (a - b - c + e) * u * v
  }
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4
      d[i] = 255 * (noise(x, y, 6, 1) * 0.7 + noise(x, y, 16, 2) * 0.3)
      d[i + 1] = 255 * (noise(x, y, 6, 3) * 0.7 + noise(x, y, 16, 4) * 0.3)
      d[i + 2] = 255 * (noise(x, y, 8, 5) * 0.6 + noise(x, y, 32, 6) * 0.4)
      d[i + 3] = 255 * (noise(x, y, 128, 7) * 0.45 + noise(x, y, 256, 8) * 0.35 + noise(x, y, 32, 9) * 0.2)
    }
  }
  const t = new THREE.DataTexture(d, size, size, THREE.RGBAFormat, THREE.UnsignedByteType)
  t.wrapS = t.wrapT = THREE.RepeatWrapping
  t.minFilter = THREE.LinearMipmapLinearFilter
  t.magFilter = THREE.LinearFilter
  t.generateMipmaps = true
  t.name = 'npr.noise'
  t.needsUpdate = true
  return t
}

function makeJagTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array(NIGHT_JAG_SAMPLES), NIGHT_JAG_SAMPLES, 1, THREE.RedFormat, THREE.FloatType)
  t.minFilter = THREE.NearestFilter
  t.magFilter = THREE.NearestFilter
  t.name = 'night.jag'
  t.needsUpdate = true
  return t
}

/** Écrit le profil dentelé de la sim dans la texture partagée. */
export function setNightJag(jag: ArrayLike<number>): void {
  const t = NPR.uNightJag.value as THREE.DataTexture
  const data = t.image.data as Float32Array
  const n = Math.min(jag.length, NIGHT_JAG_SAMPLES)
  for (let i = 0; i < n; i++) data[i] = jag[i]!
  NPR.uNightJagN.value = Math.max(2, n)
  t.needsUpdate = true
}

/** Texture d'ombre vide (tant qu'aucune height map n'est rendue : rien n'est à l'ombre). */
function emptyShadowTexture(): THREE.DataTexture {
  const t = new THREE.DataTexture(new Float32Array(4), 1, 1, THREE.RGBAFormat, THREE.FloatType)
  t.needsUpdate = true
  return t
}

export const NPR = {
  // ── palette « jour » (couleurs en RGB linéaire) ──
  uSkyTop: color(),
  uSkyMid: color(),
  uSkyHorizon: color(),
  uSun: color(),
  uHaze: color(),
  uSandLit: color(),
  uGroundFlat: color(),
  uSandShade: color(),
  uCastShadow: color(),
  uInk: color(),
  uHatchCol: color(),
  uHatchOpacity: num(0.3),
  uPaintC: num(0.105),
  uBirdLit: color(),
  uBirdShade: color(),
  /** 0 de jour → 1 au coucher (ART_BIBLE §2.6). */
  uWarm: num(0),
  uPaletteElev: num(80),
  // mêmes couleurs en OKLab (évite des conversions par pixel)
  uLabGround: vec3(),
  uLabSandLit: vec3(),
  uLabCast: vec3(),
  /** Lumière des oiseaux : mix(sun, sandLit, warm) en OKLab. */
  uLabBirdLight: vec3(),
  /** (k éclairé objets, ratio de L ombré objets, k éclairé oiseaux, k ombré oiseaux). */
  uTintK: { value: new THREE.Vector4(0.12, 0.8, 0.1, 0.15) },

  // ── palette « nuit » (KF-4 → KF-15), derrière le front ──
  uNGroundFlat: color(),
  uNSandShade: color(),
  uNCastShadow: color(),
  uNInk: color(),
  uNHaze: color(),
  uNHatchCol: color(),
  uNHatchOpacity: num(0.25),
  uNPaintC: num(0.13),
  uNBirdLit: color(),
  uNBirdShade: color(),
  uNLabGround: vec3(),
  uNLabSandLit: vec3(),
  uNLabCast: vec3(),
  uNLabBirdLight: vec3(),
  uNTintK: { value: new THREE.Vector4(0.6, 0.7, 0.55, 0.6) },
  uNSkyTop: color(),
  uNSkyMid: color(),
  uNSkyHorizon: color(),
  uNSun: color(),
  /** Lèvre de dernière lumière : sandLit de KF1 (corail). */
  uLipColor: color(),
  /** Même couleur en OKLab (bande de lumière rasante devant le front, polish W6). */
  uLipLab: vec3(),
  /** Plafond de chroma du lavis fort (0,12 à l'heure dorée, sans plafond sinon ; polish W12). */
  uPaintCMax: num(1),

  // ── soleil (repère three.js : Y en haut) ──
  /** Direction unitaire VERS le soleil, élévation de gameplay (bornée à 2° pour la projection). */
  uSunDir: { value: new THREE.Vector3(0, 1, 0) },
  /** Direction du soleil dessiné dans le ciel (peut plonger derrière la Falaise à la nuit). */
  uSunDiscDir: { value: new THREE.Vector3(0, 1, 0) },
  /** Direction horizontale des ombres (xz three), unitaire. */
  uShadowDir: { value: new THREE.Vector2(1, 0) },

  // ── height shadow map (deux cascades) ──
  uShadowMap: { value: emptyShadowTexture() as THREE.Texture },
  /** (centre x, centre z, demi-taille, plage de hauteur) en mètres. */
  uShadowArea: { value: new THREE.Vector4(0, 0, 270, 400) },
  uShadowRes: num(2048),
  uShadowMapFar: { value: emptyShadowTexture() as THREE.Texture },
  uShadowAreaFar: { value: new THREE.Vector4(0, 0, 1000, 400) },
  uShadowResFar: num(1024),
  /** Cascade « focus » des plans bas : (cx, cz, demi-taille, active 0/1). */
  uShadowMapFocus: { value: emptyShadowTexture() as THREE.Texture },
  uShadowAreaFocus: { value: new THREE.Vector4(0, 0, 80, 0) },
  uShadowResFocus: num(2048),
  /** Lissage B-spline des bords d'ombre quand un texel couvre plus d'un pixel (1 ; 0 = mesure A/B). */
  uShadowSmooth: num(1),

  // ── brume (ART_BIBLE §6.4) ──
  uFogK: num(0.0011),
  uFogStart: num(0),

  // ── front de nuit (sim NightState converti en xz three) ──
  uNightOn: num(0),
  uNightDir: { value: new THREE.Vector2(1, 0) },
  uNightPerp: { value: new THREE.Vector2(0, 1) },
  uNightS: num(-1e5),
  /** Profil dentelé (m) en texture R32F 1 × N, lu en texelFetch + interpolation. */
  uNightJag: { value: makeJagTexture() as THREE.Texture },
  /** Nombre d'échantillons utiles du profil. */
  uNightJagN: num(2),
  uNightSpan: num(1),
  /** Palette de nuit forcée partout (0..1) : fin de manche, résultats. */
  uNightAll: num(0),
  /** Vitesse d'avance du front (m/s de temps de sim) : âge du passage de la lèvre (polish W6). */
  uNightSpeed: num(30),

  // ── joueurs, indexés par code propriétaire (0 neutre, slot + 1) ──
  /** (cos h, sin h, dL, cs) du lavis de territoire. */
  uOwnerTerr: { value: Array.from({ length: OWNER_CODES }, () => new THREE.Vector4(0, 0, 0, 1)) },
  /** Couleur d'identité (RGB linéaire) + index de motif daltonien en w. */
  uOwnerCol: { value: Array.from({ length: OWNER_CODES }, () => new THREE.Vector4(0, 0, 0, 0)) },
  /** Variante « texte » (fil d'ombre). */
  uOwnerText: { value: Array.from({ length: OWNER_CODES }, () => new THREE.Color()) },
  uColorblind: num(0),
  /**
   * Ellipse d'empreinte par code propriétaire (x, z three du centre, demi-axe le long des
   * ombres, demi-axe en travers) : tirets du liseré pâle (polish W11).
   */
  uFpEllipse: { value: Array.from({ length: OWNER_CODES }, () => new THREE.Vector4(0, 0, 1, 1)) },
  /** Axe « le long des ombres » des empreintes (xz three, unitaire). */
  uFpDir: { value: new THREE.Vector2(1, 0) },
  /**
   * Oiseaux projetés à l'écran (x, y en px du tampon, origine en bas à gauche ; rayon de dégagement
   * en px ; distance à la caméra en m) : dissolution en trame des tours et du Simoun (polish W9, W10).
   */
  uBirdScr: { value: Array.from({ length: 12 }, () => new THREE.Vector4(0, 0, 1, 0)) },
  uBirdScrN: num(0),

  // ── divers ──
  /** Hauteur du buffer / 1080 : tous les px de la bible se multiplient par uPx. */
  uPx: num(1),
  /** Taille du buffer de rendu (px). */
  uResolution: { value: new THREE.Vector2(1920, 1080) },
  uTime: num(0),
  /** (hachures, granulation/pointillé, rides, tremblé) : 0/1 selon le preset. */
  uQuality: { value: new THREE.Vector4(1, 1, 1, 1) },
  uNoise: { value: makeNoiseTexture() as THREE.Texture },
  /** Flash « planche » (0..1), lu par l'InkEffect. */
  uFlash: num(0),
  /**
   * Crayonné du compte à rebours (polish W13, 0 = off) : même mélange vers le papier que le flash,
   * à l'EST de `uSketchFront` (x monde, m) ; la coulée de couleur d'ouest en est le fait avancer.
   */
  uSketch: num(0),
  uSketchFront: num(-1e4),
  /** Demi-largeur (m) de la coulée ; les x monde (ciel compris) y sont ramenés. */
  uSketchSpan: num(200),
}

export type NprUniforms = typeof NPR
export type NprUniformName = keyof NprUniforms

/**
 * Sous-ensemble d'uniforms partagés à passer à un ShaderMaterial maison :
 * `uniforms: { ...nprUniforms(), uMine: { value: 1 } }`. Les objets `{ value }`
 * sont partagés (mêmes références), jamais copiés.
 */
export function nprUniforms(): { [K in NprUniformName]: NprUniforms[K] } {
  return { ...NPR }
}
