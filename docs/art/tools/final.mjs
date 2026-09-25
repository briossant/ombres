import fs from 'fs';
import { hex, lab, lch, dE, sim, clampLCH, mixLab, okl, fmt } from './lib.mjs';
import { KF, HATCH, PAINT_C } from './keyframes.mjs';
import { KINDS } from './eval.mjs';
import { PLAYERS, idColor } from './players.mjs';
import { tpaint, tmetrics } from './opt_terr.mjs';
const T = PLAYERS.map(p => ({ dL: p.dL, cs: p.cs, h: p.h }));
const ID = PLAYERS.map(idColor);
const R = {};
// identity metrics
const D = {}; for (const k of KINDS) D[k] = ID.map(a => ID.map(b => dE(sim(k, hex(a)), sim(k, hex(b)))));
const prefix = {}; for (const k of KINDS) prefix[k] = [];
for (let m = 2; m <= 12; m++) for (const k of KINDS) { let mm = 9, pr = null; for (let i = 0; i < m; i++) for (let j = i + 1; j < m; j++) if (D[k][i][j] < mm) { mm = D[k][i][j]; pr = [i, j]; } prefix[k].push({ n: m, min: +mm.toFixed(3), pair: pr.map(i => PLAYERS[i].fr).join('/') }); }
R.identityPrefix = prefix;
R.identityVs = PLAYERS.map((p, i) => ({ name: p.fr, vsBone: +dE(ID[i], '#EDEDDF').toFixed(3), vsPaper: +dE(ID[i], '#F7F0E3').toFixed(3), vsSandK0: +dE(ID[i], KF[0].sandLit).toFixed(3), vsGroundK3: +dE(ID[i], KF[5].groundFlat).toFixed(3) }));
R.terr = tmetrics(T);
// per-keyframe territory table (strong/pale hex) + pairwise mins per KF
R.kf = KF.map(k => {
  const st = T.map(t => tpaint(t, k.groundFlat, k)), pl = T.map(t => tpaint(t, k.groundFlat, k, false));
  const row = { id: k.id, strong: st.map(hex), pale: pl.map(hex) };
  for (const kind of KINDS) { let m = 9, pr = null; const S = st.map(s => sim(kind, hex(s))); for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const v = dE(S[i], S[j]); if (v < m) { m = v; pr = [i, j]; } } row[kind] = { min: +m.toFixed(3), pair: pr.map(i => PLAYERS[i].fr).join('/') };
    let g = 9, gw = null; S.forEach((s, i) => [k.groundFlat, k.castShadow].forEach((b, j) => { const v = dE(s, sim(kind, b)); if (v < g) { g = v; gw = PLAYERS[i].fr + '/' + ['sol', 'ombre'][j]; } })); row[kind].vsGround = +g.toFixed(3); row[kind].vsGroundWho = gw; }
  row.paleVsGround = +Math.min(...pl.map(s => dE(s, k.groundFlat))).toFixed(3);
  row.paleVsStrong = +Math.min(...pl.map((s, i) => dE(s, st[i]))).toFixed(3);
  return row;
});
// anti-mud: chroma at the middle of each in-round keyframe segment >= 60 % of the weaker end (groundFlat, skyMid, skyHorizon)
const KS = [...KF].sort((a, b) => b.elev - a.elev); R.midChroma = [];
for (let i = 0; i < KS.length - 2; i++) for (const key of ['groundFlat', 'skyMid', 'skyHorizon']) {
  const a = KS[i], b = KS[i + 1]; const r = lch(mixLab(a[key], b[key], 0.5)).c / Math.min(lch(a[key]).c, lch(b[key]).c);
  R.midChroma.push({ seg: a.id + '->' + b.id, key, ratio: +r.toFixed(2) }); }
// frozen territory (tower shadow over paint, hue pulled 35 % towards castShadow)
R.frozen = { minPair: 9, minVsFree: 9 };
for (const k of KF) { const st = T.map(t => tpaint(t, k.groundFlat, k)); const x = lab(k.castShadow), g = lab(k.groundFlat);
  const F = st.map(s => { const q = lab(s); return { mode: 'oklab', l: q.l * x.l / g.l, a: q.a + (x.a - q.a) * 0.35, b: q.b + (x.b - q.b) * 0.35 }; });
  for (let i = 0; i < 12; i++) { R.frozen.minVsFree = Math.min(R.frozen.minVsFree, dE(F[i], st[i])); for (let j = i + 1; j < 12; j++) R.frozen.minPair = Math.min(R.frozen.minPair, dE(F[i], F[j])); } }
// QA gates (ART_BIBLE §7.7)
const gates = { first6: Math.min(...KINDS.map(k => prefix[k][4].min)) >= 0.15, terrNormal: R.kf.every(r => r.normal.min >= 0.085), midChroma: R.midChroma.every(m => m.ratio >= 0.6) };
R.gates = gates;
fs.writeFileSync('final-metrics.json', JSON.stringify(R, null, 1));
console.log('GATES', JSON.stringify(gates), 'worstMid', JSON.stringify(R.midChroma.reduce((a, b) => (b.ratio < a.ratio ? b : a))), 'frozen', JSON.stringify(R.frozen));
if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
PLAYERS.forEach((p, i) => console.log(String(i + 1).padStart(2), p.fr.padEnd(9), p.en.padEnd(8), fmt(ID[i])));
for (const k of KINDS) console.log(k.padEnd(7), prefix[k].map(x => x.n + ':' + x.min).join(' '), '| worst12', prefix[k][10].pair);
console.log('terr', JSON.stringify(Object.fromEntries(Object.entries(R.terr).map(([a, b]) => [a, +b.toFixed(3)]))));
for (const r of R.kf) console.log(r.id.padEnd(6), KINDS.map(k => `${k[0]}:${r[k].min}(${r[k].pair}) g${r[k].vsGround}`).join(' '), 'pale/g', r.paleVsGround, 'pale/s', r.paleVsStrong);
console.log(JSON.stringify(R.identityVs));
