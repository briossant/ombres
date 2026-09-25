import { okl, hex, lab, lch, dE, sim, mixLab, clampLCH, fmt } from './lib.mjs';
import { KF, PAINT_C } from './keyframes.mjs';
export const KINDS = ['normal', 'deutan', 'protan', 'tritan'];
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
export const TERR = { kL: parseFloat(process.env.KL ?? '0.55'), paleC: 0.55, capDay: 0.05 };
// territory wash of player colour P over ground tone G at keyframe k; q = 1 strong, 0.4 pale
export function paint(P, G, k, q = 1, kL = TERR.kL) {
  const p = lch(P), g = lch(G);
  let Ls = 0.5 * g.l + 0.35 + kL * (p.l - 0.70);
  Ls = Ls + (Math.min(Ls, g.l - TERR.capDay) - Ls) * sst(0.66, 0.80, g.l);     // by day a wash is never lighter than the paper
  const Lp = g.l < 0.66 ? g.l + (Ls - g.l) * 0.45 : g.l - 0.03;                    // pale: diluted wash
  const L = q >= 1 ? Ls : Lp;
  const C = PAINT_C[k.id] * (p.scale ?? 1) * (q >= 1 ? 1 : TERR.paleC);
  return clampLCH({ mode: 'oklch', l: L, c: C, h: p.h });
}
export function shade(X, k, w = 0.3, strength = 1) {
  const x = lab(X), s = lab(k.castShadow), ref = lab(k.groundFlat);
  const t = { mode: 'oklab', l: x.l * s.l / ref.l, a: x.a + (s.a - x.a) * w, b: x.b + (s.b - x.b) * w };
  return mixLab(X, t, strength);
}
export function pairMin(cols, kind, n = cols.length) {
  let m = 9, pair = null; const S = cols.slice(0, n).map(c => sim(kind, hex(c)));
  for (let i = 0; i < S.length; i++) for (let j = i + 1; j < S.length; j++) { const d = dE(S[i], S[j]); if (d < m) { m = d; pair = [i, j]; } }
  return { m, pair };
}
export function evaluate(P) {
  const out = { identity: {}, terr: {}, vsGround: {}, pale: {}, frozen: {} };
  for (const kind of KINDS) out.identity[kind] = pairMin(P, kind);
  for (const k of KF) {
    const strong = P.map(p => paint(p, k.groundFlat, k));
    const pale = P.map(p => paint(p, k.groundFlat, k, 0.4));
    out.terr[k.id] = Object.fromEntries(KINDS.map(kind => [kind, pairMin(strong, kind)]));
    const bare = ['groundFlat', 'castShadow'].map(t => k[t]);
    out.vsGround[k.id] = Object.fromEntries(KINDS.map(kind => {
      let m = 9, who = null;
      strong.forEach((s, i) => bare.forEach((b, j) => { const d = dE(sim(kind, hex(s)), sim(kind, b)); if (d < m) { m = d; who = [i, ['flat','cast'][j]]; } }));
      return [kind, { m, who }];
    }));
    const pv = pale.map(s => dE(s, k.groundFlat)), ps = pale.map((s, i) => dE(s, strong[i]));
    out.pale[k.id] = { vsGround: Math.min(...pv), vsGroundArg: pv.indexOf(Math.min(...pv)), vsStrong: Math.min(...ps), vsStrongArg: ps.indexOf(Math.min(...ps)) };
    out.frozen[k.id] = pairMin(strong.map(s => shade(s, k, 0.3)), 'normal');
    out.frozenVsFree = Math.min(out.frozenVsFree ?? 9, ...strong.map(s => dE(s, shade(s, k, 0.3))));
  }
  return out;
}
