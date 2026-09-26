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
export function wash(t, G, kfId, q, cmax = 1) {
  const Lg = G[0];
  let Ls = 0.5 * Lg + 0.35 + t.dL; Ls = Ls + (Math.min(Ls, Lg - 0.05) - Ls) * sst(0.66, 0.80, Lg);
  let Lp = Lg < 0.66 ? Lg + (Ls - Lg) * 0.45 : Lg - 0.03;
  const h = t.h * Math.PI / 180, dir = [Math.cos(h), Math.sin(h)];
  const C0 = Math.min(PAINT_C[kfId] * t.cs, cmax);
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
export function shadeOnPaint(w, cast, ground) { const ab = coolAB(w, 0.85); return [w[0] * cast[0] / ground[0], ab[0], ab[1]]; }
/** Côté nuit de la Grande Ombre (W6) : L − 0,12, C × 0,52, même rotation. */
export function nightDim(w) { const ab = coolAB(w, 0.52); return [w[0] - 0.12, ab[0], ab[1]]; }
/** Plafond de chroma des forts à l'horloge de palette pe (W12, palette.ts : PAINT_C_GOLDEN_MAX). */
export const PAINT_C_GOLDEN_MAX = 0.125;
export function paintCMax(pe) { const g = sst(34, 25, pe) * (1 - sst(9, 5, pe)); return PAINT_C_GOLDEN_MAX + (1 - g) * (1 - PAINT_C_GOLDEN_MAX); }
