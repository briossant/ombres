// Derived colour functions shared by sheets + final JSON (mirror of the shader maths in ART_BIBLE §4-5)
import { hex, lab, lch, clampLCH, mixLab, okl } from './lib.mjs';
import { tpaint } from './opt_terr.mjs';
export const addL = (X, dl) => { const x = lab(X); return clampLCH({ mode: 'oklab', l: x.l + dl, a: x.a, b: x.b }); };
export function underShadow(X, k, w) { // OKLab: L scaled by castShadow/groundFlat, ab pulled w towards the shadow colour
  const x = lab(X), s = lab(k.castShadow), r = lab(k.groundFlat);
  return clampLCH({ mode: 'oklab', l: x.l * s.l / r.l, a: x.a + (s.a - x.a) * w, b: x.b + (s.b - x.b) * w });
}
export function tintedShadow(k, h, C = 0.06) { const s = lch(k.castShadow); return clampLCH(okl(s.l, C, h)); }
export function underBirdShadow(X, k, h, w) { const x = lab(X), s = lab(tintedShadow(k, h)), r = lab(k.groundFlat);
  return clampLCH({ mode: 'oklab', l: x.l * s.l / r.l, a: x.a + (s.a - x.a) * w, b: x.b + (s.b - x.b) * w }); }
export function territory(p, k) {
  const t = { dL: p.dL, cs: p.cs, h: p.h };
  const strong = tpaint(t, k.groundFlat, k), pale = tpaint(t, k.groundFlat, k, false);
  return { strong, rim: addL(strong, -0.10), pale, paleRim: addL(pale, -0.04), line: addL(strong, -0.16), paleLine: addL(pale, -0.10) };
}
