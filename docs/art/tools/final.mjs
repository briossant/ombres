import fs from 'fs';
import { hex, lab, lch, dE, sim, clampLCH, mixLab, okl, fmt } from './lib.mjs';
import { KF, HATCH, PAINT_C } from './keyframes.mjs';
import { KINDS } from './eval.mjs';
import { PLAYERS, idColor } from './players.mjs';
import { tpaint, tmetrics } from './opt_terr.mjs';
import { wash, shadeOnPaint, nightDim, display, dist, lchOf, toLab as toLabG, paintCMax, paintCapDark } from './game.mjs';
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
// Lavis et ombres TELS QUE RENDUS EN JEU (polish world, game.mjs) : garde pâle / sol (W8), chroma des
// forts plafonnée à 0,12 à l'heure dorée (W12), ombre sur peinture refroidie en OKLCH (W4, amende
// §4.5 / §5.1), côté nuit de la Grande Ombre assombri et désaturé (W6, amende §4.6).
const G_ = { paleVsGround: 9, paleVsStrong: 9, strongPair: 9, frozenPair: 9, frozenPairWho: '', frozenVsFree: 9, shadowC: 9, shadowCdisplay: 9, olive: [], rust: [], nightPair: 9, nightPairWho: '' };
for (const k of KF) {
  const G = toLabG(k.groundFlat), cast = toLabG(k.castShadow), cm = paintCMax(k.elev), dk = paintCapDark(k.elev);
  const S = T.map(t => wash(t, G, k.id, 1, cm, dk)), P = T.map(t => wash(t, G, k.id, 0, cm, dk));
  const Sd = S.map(display), Pd = P.map(display);
  G_.paleVsGround = Math.min(G_.paleVsGround, ...Pd.map(x => dist(x, G)));
  G_.paleVsStrong = Math.min(G_.paleVsStrong, ...Pd.map((x, i) => dist(x, Sd[i])));
  for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) G_.strongPair = Math.min(G_.strongPair, dist(Sd[i], Sd[j]));
  if (k.elev > 0) {   // ombres portées : seulement côté jour
    const F = S.map((w, i) => shadeOnPaint(w, cast, G, k.elev, T[i].h)), FP = P.map((w, i) => shadeOnPaint(w, cast, G, k.elev, T[i].h));
    const Fd = F.map(display);
    for (let i = 0; i < 12; i++) { G_.frozenVsFree = Math.min(G_.frozenVsFree, dist(Fd[i], Sd[i])); for (let j = i + 1; j < 12; j++) { const v = dist(Fd[i], Fd[j]); if (v < G_.frozenPair) { G_.frozenPair = v; G_.frozenPairWho = `${k.id} ${PLAYERS[i].fr}/${PLAYERS[j].fr}`; } } }
    // polish 2 : en fin de journée, aucune ombre rouille / brune / olive sur la peinture (glacis violet)
    if (k.elev < 30) [...F, ...FP].map(display).forEach((f, i) => { const [L, C, h] = lchOf(f); if (h > 25 && h < 110 && L < 0.62 && C > 0.045) G_.rust.push(`${k.id} ${PLAYERS[i % 12].fr}${i < 12 ? '' : ' pâle'}`); });
    G_.shadowC = Math.min(G_.shadowC, ...F.map(f => lchOf(f)[1]));
    G_.shadowCdisplay = Math.min(G_.shadowCdisplay, ...Fd.map(f => lchOf(f)[1]));
    [...F, ...FP].map(display).forEach((f, i) => { const [L, , h] = lchOf(f); if (h > 60 && h < 110 && L < 0.55) G_.olive.push(`${k.id} ${PLAYERS[i % 12].fr}${i < 12 ? '' : ' pâle'}`); });
  } else if (k.id === 'KF-4') {   // côté nuit pendant la Grande Ombre (aux résultats, l'illumination rallume tout)
    const N = S.map((w, i) => display(nightDim(w, T[i].h)));
    for (let i = 0; i < 12; i++) for (let j = i + 1; j < 12; j++) { const v = dist(N[i], N[j]); if (v < G_.nightPair) { G_.nightPair = v; G_.nightPairWho = `${k.id} ${PLAYERS[i].fr}/${PLAYERS[j].fr}`; } }
  }
}
R.game = G_;
// QA gates (ART_BIBLE §7.7 ; portes « game* » : polish world)
const gates = { first6: Math.min(...KINDS.map(k => prefix[k][4].min)) >= 0.15, terrNormal: R.kf.every(r => r.normal.min >= 0.085), midChroma: R.midChroma.every(m => m.ratio >= 0.6),
  gamePaleVsGround: G_.paleVsGround >= 0.05, gameStrongPair: G_.strongPair >= 0.085, gameShadowChroma: G_.shadowC >= 0.06, gameNoOliveShadow: G_.olive.length === 0, gameNoRustShadow: G_.rust.length === 0,
  gameFrozenPair: G_.frozenPair >= 0.059, gameNightPair: G_.nightPair >= 0.05 };
R.gates = gates;
fs.writeFileSync('final-metrics.json', JSON.stringify(R, null, 1));
console.log('GAME', JSON.stringify(G_, (k, v) => (typeof v === 'number' ? +v.toFixed(3) : v)));
console.log('GATES', JSON.stringify(gates), 'worstMid', JSON.stringify(R.midChroma.reduce((a, b) => (b.ratio < a.ratio ? b : a))), 'frozen', JSON.stringify(R.frozen));
if (!Object.values(gates).every(Boolean)) process.exitCode = 1;
PLAYERS.forEach((p, i) => console.log(String(i + 1).padStart(2), p.fr.padEnd(9), p.en.padEnd(8), fmt(ID[i])));
for (const k of KINDS) console.log(k.padEnd(7), prefix[k].map(x => x.n + ':' + x.min).join(' '), '| worst12', prefix[k][10].pair);
console.log('terr', JSON.stringify(Object.fromEntries(Object.entries(R.terr).map(([a, b]) => [a, +b.toFixed(3)]))));
for (const r of R.kf) console.log(r.id.padEnd(6), KINDS.map(k => `${k[0]}:${r[k].min}(${r[k].pair}) g${r[k].vsGround}`).join(' '), 'pale/g', r.paleVsGround, 'pale/s', r.paleVsStrong);
console.log(JSON.stringify(R.identityVs));
