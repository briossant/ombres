// Formules du lavis et des ombres TELLES QUE RENDUES EN JEU (src/host/render/world/groundMaterial.ts),
// pour les portes de final.mjs (polish world W4, W6, W8). Tout en OKLab [L, a, b].
import { lab, clampLCH } from './lib.mjs';
import { PAINT_C } from './keyframes.mjs';
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const toLab = h => { const q = lab(h); return [q.l, q.a, q.b]; };
/** Couleur affichable (chroma ramenée dans le gamut sRGB). */
export const display = w => { const q = lab(clampLCH({ mode: 'oklab', l: w[0], a: w[1], b: w[2] })); return [q.l, q.a, q.b]; };
export const dist = (A, B) => Math.hypot(A[0] - B[0], A[1] - B[1], A[2] - B[2]);
export const lchOf = w => { let h = Math.atan2(w[2], w[1]) * 180 / Math.PI; if (h < 0) h += 360; return [w[0], Math.hypot(w[1], w[2]), h]; };
const PALE_DE = 0.06;
/**
 * Lavis d'un joueur t = {dL, cs, h} sur le sol G (OKLab), q = 1 fort / 0 pâle, plafond de chroma cmax
 * (0,125 à l'heure dorée). Garde pâle / sol (W8) : ΔE ≥ 0,06 par L (≤ 0,05 d'écart, côté fort) puis C.
 */
export function wash(t, G, kfId, q, cmax = 1, dark = 0) {
  const Lg = G[0];
  let Ls = 0.5 * Lg + 0.35 + t.dL; Ls = Ls + (Math.min(Ls, Lg - 0.05) - Ls) * sst(0.66, 0.80, Lg);
  let Lp = Lg < 0.66 ? Lg + (Ls - Lg) * 0.45 : Lg - 0.03;
  const h = t.h * Math.PI / 180, dir = [Math.cos(h), Math.sin(h)];
  // plafond de chroma (W12 + polish 2) : au couchant (dark → 1), seuls les lavis plus clairs que ~0,64 le
  // subissent (les néons) ; Corail, Carmin, Indigo… gardent leur chroma (plafonné, un orange à L 0,59 vire au brun)
  const capK = 1 + (sst(0.60, 0.68, Ls) - 1) * dark;
  const C0 = Math.min(PAINT_C[kfId] * t.cs, 1 + (cmax - 1) * capK);
  let Cp = 0.55 * C0;
  let dl = Lp - Lg; const dab = [dir[0] * Cp - G[1], dir[1] * Cp - G[2]]; const dd = dab[0] ** 2 + dab[1] ** 2;
  if (dl * dl + dd < PALE_DE ** 2) {
    const s = Math.abs(Ls - Lg) > 0.01 ? Math.sign(Ls - Lg) : -1, adl = Math.abs(dl);
    dl = s * Math.min(Math.max(Math.sqrt(Math.max(PALE_DE ** 2 - dd, 0)), adl), Math.max(adl, 0.05));
    const rem2 = PALE_DE ** 2 - dl * dl;
    if (rem2 > dd) { const pd = dir[0] * G[1] + dir[1] * G[2], gg = G[1] ** 2 + G[2] ** 2; Cp = Math.min(Math.max(Cp, pd + Math.sqrt(Math.max(pd * pd - gg + rem2, 0))), 0.85 * C0); }
    Lp = Lg + dl;
  }
  const L = Lp + (Ls - Lp) * q, C = Cp + (C0 - Cp) * q;
  return [L, dir[0] * C, dir[1] * C];
}
/** Rotation OKLCH vers le violet des ombres (290°, chemin court) : 0,22 de l'écart côté rouge, 0,15 côté vert, ≤ 40°. */
export function coolAB(w, cf) {
  const C = Math.hypot(w[1], w[2]); if (C < 1e-4) return [w[1], w[2]];
  let h = Math.atan2(w[2], w[1]); let dh = 290 * Math.PI / 180 - h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
  h += Math.sign(dh) * Math.min(Math.abs(dh) * (dh < 0 ? 0.22 : 0.15), 40 * Math.PI / 180);
  return [cf * C * Math.cos(h), cf * C * Math.sin(h)];
}
/** Ombre portée sur la peinture (W4) : ratio de L de l'ombre au sol, C × 0,85, teinte refroidie. */
export function shadeOnPaintDay(w, cast, ground) { const ab = coolAB(w, 0.85); return [w[0] * cast[0] / ground[0], ab[0], ab[1]]; }
/** Poids du glacis de fin de journée (polish 2) : 0 à 40° de l'horloge de palette, 1 à 22° (palette.ts, uShadowCool). */
export const shadowCool = pe => sst(40, 22, pe);
const D = Math.PI / 180;
const hueDelta = (h, t) => { const d = (t - h) * D; return Math.atan2(Math.sin(d), Math.cos(d)); };
const shadeRot = (h, t, fr, fg, mx) => { const dh = hueDelta(h, t); return Math.sign(dh) * Math.min(Math.abs(dh) * (dh < 0 ? fr : fg), mx); };
/** Cibles propres à une couleur (palette.ts, SHADE_OVERRIDE) : Safran -> mauve 340°, chroma × 0,75, L × 1,16. */
export const SHADE_OVERRIDE = { 89: { h: 340, cf: 0.75, kL: 1.16 } };
/**
 * Ombre portée sur la peinture TELLE QUE RENDUE (palette.ts updateOwnerShade + groundMaterial.ts
 * shadowPaintAB / shadowPaintL), pour un lavis de teinte d'identité hDeg : de jour, W4 (rotation vers
 * 290°, chroma × 0,85) ; en fin de journée (s → 1), glacis violet : rotation vers 300° de 0,45 ×
 * l'écart côté rouge (≤ 90°) ou cible propre, chroma × 1, puis 30 % vers l'ombre neutre ; un lavis
 * plus sombre que le sol l'est × 1,5.
 */
export function shadeOnPaint(w, cast, ground, pe = 80, hDeg) {
  const s = shadowCool(pe);
  const C = Math.hypot(w[1], w[2]);
  const h = hDeg ?? Math.atan2(w[2], w[1]) / D;
  const day = shadeRot(h, 290, 0.22, 0.15, 40 * D);
  const ov = SHADE_OVERRIDE[Math.round(h)];
  const eve = ov ? hueDelta(h, ov.h) : shadeRot(h, 300, 0.45, 0.15, 90 * D);
  const a = h * D + day + (eve - day) * s;
  const cf = 0.85 + ((ov ? ov.cf : 1) - 0.85) * s, kL = 1 + ((ov ? ov.kL : 1) - 1) * s;
  const L = (w[0] + Math.min(w[0] - ground[0], 0) * 0.5 * s) * kL * cast[0] / ground[0];
  const g = 0.3 * s;
  return [L, cf * C * Math.cos(a) * (1 - g) + cast[1] * g, cf * C * Math.sin(a) * (1 - g) + cast[2] * g];
}
/** Côté nuit de la Grande Ombre (W6) : L − 0,12, C × 0,52, même rotation ; polish 2 : Safran mauve 325°, L + 0,06, C × 0,5 ; Corail 0°, L + 0,04. */
export const NIGHT_OVERRIDE = { 89: { h: 325, cf: 0.5, dL: 0.06 }, 40: { h: 0, cf: 0.52, dL: 0.04 } };
export function nightDim(w, hDeg) {
  const ov = hDeg === undefined ? undefined : NIGHT_OVERRIDE[Math.round(hDeg)];
  if (!ov) { const ab = coolAB(w, 0.52); return [w[0] - 0.12, ab[0], ab[1]]; }
  const C = Math.hypot(w[1], w[2]) * ov.cf;
  return [w[0] - 0.12 + ov.dL, C * Math.cos(ov.h * D), C * Math.sin(ov.h * D)];
}
/** Plafond de chroma des forts à l'horloge de palette pe (W12 et polish 2, palette.ts : PAINT_C_GOLDEN_MAX, PAINT_C_SUNSET_MAX). */
export const PAINT_C_GOLDEN_MAX = 0.125;
export const PAINT_C_SUNSET_MAX = 0.12;
/** Poids « couchant » du plafond : 0 à l'heure dorée (plafond pour tous), 1 à KF5 → KF1 (lavis clairs seulement). */
export function paintCapDark(pe) { return sst(9, 5, pe); }
export function paintCMax(pe) { const late = sst(34, 25, pe); const cap = PAINT_C_GOLDEN_MAX + (PAINT_C_SUNSET_MAX - PAINT_C_GOLDEN_MAX) * sst(9, 5, pe); return cap * late + (1 - late); }
