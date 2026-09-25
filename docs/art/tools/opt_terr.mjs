import { hex, lab, lch, sim, clampLCH, fmt } from './lib.mjs';
import { KF, PAINT_C } from './keyframes.mjs';
import { KINDS } from './eval.mjs';
import { PLAYERS } from './players.mjs';
const sst = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const d = (A, B) => Math.hypot(A.l - B.l, A.a - B.a, A.b - B.b);
export function tpaint(t, G, k, strong = true) {  // t = {dL, cs, h}
  const g = lch(G);
  let Ls = 0.5 * g.l + 0.35 + t.dL;
  Ls = Ls + (Math.min(Ls, g.l - 0.05) - Ls) * sst(0.66, 0.80, g.l);
  const L = strong ? Ls : (g.l < 0.66 ? g.l + (Ls - g.l) * 0.45 : g.l - 0.03);
  return clampLCH({ mode: 'oklch', l: L, c: PAINT_C[k.id] * t.cs * (strong ? 1 : 0.55), h: t.h });
}
const shadeLab = (X, k, w = 0.3) => { const x = lab(X), s = lab(k.castShadow), r = lab(k.groundFlat); return { l: x.l * s.l / r.l, a: x.a + (s.a - x.a) * w, b: x.b + (s.b - x.b) * w }; };
export function tmetrics(T) {
  let tn = 9, tc = 9, vg = 9, vgc = 9, pg = 9, ps = 9, fz = 9;
  for (const k of KF) {
    const st = T.map(t => tpaint(t, k.groundFlat, k)); const pl = T.map(t => tpaint(t, k.groundFlat, k, false));
    const S = {}; for (const kind of KINDS) S[kind] = st.map(c => lab(sim(kind, hex(c))));
    const B = {}; for (const kind of KINDS) B[kind] = [k.groundFlat, k.castShadow].map(b => lab(sim(kind, b)));
    for (let i = 0; i < 12; i++) {
      for (let j = i + 1; j < 12; j++) { tn = Math.min(tn, d(S.normal[i], S.normal[j])); tc = Math.min(tc, d(S.deutan[i], S.deutan[j]), d(S.protan[i], S.protan[j]), 1.3 * d(S.tritan[i], S.tritan[j])); }
      for (const kind of KINDS) for (const b of B[kind]) { const v = d(S[kind][i], b); if (kind === 'normal') vg = Math.min(vg, v); else vgc = Math.min(vgc, v); }
      const P = lab(pl[i]); pg = Math.min(pg, d(P, lab(k.groundFlat))); ps = Math.min(ps, d(P, S.normal[i]));
    }
    const F = st.map(s => shadeLab(s, k)); for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) fz = Math.min(fz, d(F[i], F[j]));
  }
  return { f: tn + 0.6 * tc + 0.5 * vg + 0.3 * vgc + 0.4 * pg + 0.3 * ps + 0.4 * fz, tn, tc, vg, vgc, pg, ps, fz };
}
if ((process.argv[1] ?? '').endsWith('opt_terr.mjs')) {
  let seed = parseInt(process.env.SEED ?? '3'); const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const base = PLAYERS.map(p => ({ dL: 0.55 * (p[2].l - 0.70), cs: 1, h: p[2].h }));
  let T = base.map(t => ({ ...t })), cur = tmetrics(T);
  console.log('start', JSON.stringify(Object.fromEntries(Object.entries(cur).map(([a, b]) => [a, +b.toFixed(3)]))));
  for (let it = 0; it < 3000; it++) {
    const i = Math.floor(rnd() * 12); const U = T.map(t => ({ ...t })); const s = it < 1500 ? 1 : 0.4;
    U[i].dL = Math.min(0.08, Math.max(-0.12, U[i].dL + (rnd() - 0.5) * 0.04 * s));
    U[i].cs = Math.min(1.15, Math.max(0.9, U[i].cs + (rnd() - 0.5) * 0.12 * s));
    U[i].h = Math.min(base[i].h + 8, Math.max(base[i].h - 8, U[i].h + (rnd() - 0.5) * 6 * s));
    const m = tmetrics(U); if (m.f >= cur.f) { T = U; cur = m; }
  }
  console.log('end  ', JSON.stringify(Object.fromEntries(Object.entries(cur).map(([a, b]) => [a, +b.toFixed(3)]))));
  T.forEach((t, i) => console.log(PLAYERS[i][0].padEnd(9), JSON.stringify({ dL: +t.dL.toFixed(3), cs: +t.cs.toFixed(2), h: +((t.h + 360) % 360).toFixed(1) }), 'K0', hex(tpaint(t, KF[0].groundFlat, KF[0])), 'K16', hex(tpaint(t, KF[3].groundFlat, KF[3])), 'K3', hex(tpaint(t, KF[5].groundFlat, KF[5]))));
}
