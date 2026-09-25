// Writes: proto/moebius-palettes.json (prototype format), proto/players.json, and art/palette.json (bible companion)
import fs from 'fs';
import { hex, lch, lab, okl, clampLCH, mixLab } from './lib.mjs';
import { KF, HATCH, PAINT_C } from './keyframes.mjs';
import { PLAYERS, idColor } from './players.mjs';
const keys = ['skyTop', 'skyMid', 'skyHorizon', 'sandLit', 'groundFlat', 'sandShade', 'castShadow', 'ink', 'sun', 'haze'];
const up = s => s.toUpperCase();
const L3 = c => { const x = lch(c); return [+x.l.toFixed(3), +x.c.toFixed(3), Math.round(x.h ?? 0)]; };
// derived per keyframe: hatch colour, bird lit/shade, paper-ish ui tint not needed
const derived = k => {
  const [op, toCast] = HATCH[k.id];
  const hatch = mixLab(k.ink, k.castShadow, toCast);
  const warm = Math.max(0, Math.min(1, (60 - k.elev) / 56));          // 0 by day -> 1 at sunset
  const birdLit = k.elev < -1 ? mixLab('#EDEDDF', k.sandLit, 0.55) : mixLab('#EDEDDF', mixLab(k.sun, k.sandLit, warm), 0.10 + 0.40 * warm);
  const birdShade = mixLab('#C4C6BA', k.castShadow, 0.15 + 0.45 * warm);
  return { hatch: up(hex(hatch)), hatchOpacity: op, birdLit: up(hex(birdLit)), birdShade: up(hex(birdShade)), paintChroma: PAINT_C[k.id] };
};
const protoPal = { _doc: 'ART_BIBLE keyframes (prototype format)', keyframes: KF.map(k => ({ name: k.id + ' ' + k.name, sunElevationDeg: k.elev, hex: Object.fromEntries(keys.map(n => [n, up(hex(k[n]))])) })) };
fs.writeFileSync('../prototype/moebius-palettes.json', JSON.stringify(protoPal, null, 1));
const players = PLAYERS.map((p, i) => ({ slot: i + 1, fr: p.fr, en: p.en, hex: up(hex(idColor(p))), oklch: [p.L, p.C, p.h],
  text: up(hex(clampLCH(okl(Math.min(p.L, 0.50), p.C * 0.9, p.h)))), glyph: p.glyph, glyphEn: p.glyphEn, pattern: p.pattern, terr: { dL: p.dL, cs: p.cs, h: p.h } }));
fs.writeFileSync('../prototype/players.json', JSON.stringify(players, null, 1));
const art = { _doc: 'Ombres — palette maîtresse (docs/ART_BIBLE.md §2-3). Keyframes indexées sur paletteElev (°), interpolation OKLab. Généré par docs/art/tools/.',
  keyframes: KF.map(k => ({ id: k.id, name: k.name, paletteElevDeg: k.elev, hex: Object.fromEntries(keys.map(n => [n, up(hex(k[n]))])), oklch: Object.fromEntries(keys.map(n => [n, L3(k[n])])), derived: derived(k) })),
  players, constants: { bone: '#EDEDDF', boneShade: '#C4C6BA', boneHollow: '#ACADA3', paper: '#F7F0E3', towerCream: '#EFE2C8', towerOchre: '#D9A45B', towerTerracotta: '#C8765A', domeTurquoise: '#4FB3AE', domeCobalt: '#3C5FA8', crownGold: '#FFF2C3' } };

fs.writeFileSync('../palette.json', JSON.stringify(art, null, 1));
for (const k of art.keyframes) console.log(k.id.padEnd(6), JSON.stringify(k.derived));
