import fs from 'fs';
import { hex, sim, lch, mixLab, okl, clampLCH } from './lib.mjs';
import { KF } from './keyframes.mjs';
import { KINDS } from './eval.mjs';
import { PLAYERS, idColor } from './players.mjs';
import { territory, underShadow, tintedShadow, underBirdShadow, addL } from './colors.mjs';
const V = c => Object.fromEntries(KINDS.map(k => [k, hex(sim(k, hex(c)))]));
const data = { players: PLAYERS.map(p => ({ ...p, id: V(idColor(p)), idText: V(clampLCH(okl(Math.min(p.L, 0.5), p.C * 0.9, p.h))) })), kf: [] };
for (const k of KF) {
  const row = { id: k.id, name: k.name, elev: k.elev, ground: V(k.groundFlat), cast: V(k.castShadow), ink: V(k.ink), sky: [V(k.skyTop), V(k.skyMid), V(k.skyHorizon)], sun: V(k.sun), haze: V(k.haze), sandLit: V(k.sandLit), sandShade: V(k.sandShade), p: [] };
  for (const p of PLAYERS) {
    const t = territory(p, k);
    const e = {}; for (const [n, c] of Object.entries(t)) { e[n] = V(c); e[n + 'Sh'] = V(underShadow(c, k, 0.35)); }
    e.bShadow = V(tintedShadow(k, p.h));                    // bird shadow over bare sand (strong)
    e.bShadowPale = V(mixLab(k.groundFlat, tintedShadow(k, p.h), 0.45));
    e.bRim = V(clampLCH(okl(Math.min(Math.max(p.L, 0.62), 0.78), Math.max(p.C, 0.12), p.h)));
    row.p.push(e);
  }
  // bird shadow of player 0 over the territory of every player (strong / pale)
  row.over = PLAYERS.map(q => { const t = territory(q, k); return { s: V(underBirdShadow(t.strong, k, PLAYERS[0].h, 0.5)), pale: V(mixLab(t.strong, underBirdShadow(t.strong, k, PLAYERS[0].h, 0.5), 0.45)) }; });
  data.kf.push(row);
}
fs.writeFileSync('sheet-data.js', 'window.DATA = ' + JSON.stringify(data) + ';');
console.log('ok', data.kf.length);
