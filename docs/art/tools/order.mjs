import { hex, dE, sim, fmt } from './lib.mjs';
import { PLAYERS } from './players.mjs';
import { KINDS } from './eval.mjs';
const n = PLAYERS.length; const H = PLAYERS.map(p => hex(p[2]));
const D = {}; for (const k of KINDS) D[k] = H.map(a => H.map(b => dE(sim(k, a), sim(k, b))));
const comb = (i, j) => Math.min(D.normal[i][j], D.deutan[i][j] * 1.6, D.protan[i][j] * 1.6, D.tritan[i][j] * 1.3); // CVD weighted up (they are always smaller)
console.log('pair matrix (min over normal / deut / prot / trit):');
console.log('         ' + PLAYERS.map(p => p[0].slice(0, 6).padEnd(7)).join(''));
for (let i = 0; i < n; i++) console.log(PLAYERS[i][0].padEnd(9) + PLAYERS.map((_, j) => i === j ? '   -   ' : Math.min(D.normal[i][j], D.deutan[i][j], D.protan[i][j], D.tritan[i][j]).toFixed(3).padEnd(7)).join(''));
// greedy farthest point from a fixed start
const start = (process.env.START ?? '0,1').split(',').map(Number);
const chosen = [...start];
while (chosen.length < n) { let best = -1, bv = -1; for (let i = 0; i < n; i++) { if (chosen.includes(i)) continue; const v = Math.min(...chosen.map(j => comb(i, j))); if (v > bv) { bv = v; best = i; } } chosen.push(best); }
console.log('order', chosen.map(i => PLAYERS[i][0]).join(' > '));
for (let m = 2; m <= n; m++) { const S = chosen.slice(0, m); const r = {}; for (const k of KINDS) { let mm = 9; for (let a = 0; a < m; a++) for (let b = a + 1; b < m; b++) mm = Math.min(mm, D[k][S[a]][S[b]]); r[k] = mm.toFixed(3); } console.log(m, JSON.stringify(r)); }
