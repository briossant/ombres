#!/usr/bin/env node
// Ombres — validation chiffrée du GDD (docs/GDD.md).
// Node 22, aucune dépendance. Les constantes ci-dessous sont celles du tableau « Constantes de tuning » du GDD.
//
// Usage :
//   node validate.mjs tables              ordres de grandeur analytiques (soleil, ombres, m²/s, traversées)
//   node validate.mjs towers              longueurs d'ombres de tours + % d'arène couverte au fil du temps (4 cartes)
//   node validate.mjs dive [n]            micro-simulation du piqué (fenêtre d'esquive)
//   node validate.mjs sim [rounds]        manches complètes de bots à politiques fixes (équilibrage, tension, fréquence des piqués)
//   node validate.mjs variants [rounds]   leviers de réglage de la fin de manche
//   node validate.mjs all                 tout (~4 min) ; résultats de référence dans results.md
//
// Sortie en Markdown pour être recopiée dans le GDD.

const DEG = Math.PI / 180;

export const RULES = {
  tickHz: 30,
  roundSunSeconds: 110,
  sunElevStartDeg: 88, sunElevEndDeg: 9, sunElevGamma: 1.6,
  sunAzStartDeg: 240, sunAzEndDeg: 270,
  phaseAfternoonAt: 15, phaseGoldenAt: 55, phaseSunsetAt: 85, greatShadowAt: 98,
  altLow: 4, altHigh: 18, strongMaxAlt: 11,
  descendRate: 22, climbRate: 8,
  speedLow: 16, speedHigh: 21, speedTau: 0.25,
  turnLowDegPerS: 140, turnHighDegPerS: 105,
  shadowRadiusLow: 5, shadowRadiusHigh: 11, stretchMax: 6.5,
  flapImpulse: 22, flapDuration: 0.3, flapCooldown: 3.0,
  diveLockDz: 6, diveLockRange: 26, diveLockConeDeg: 70,
  diveWindup: 0.2, diveHSpeed: 30, diveTurnDegPerS: 150, diveMaxTime: 1.4, diveCommitLead: 0.65, diveHitRadius: 4.0,
  stunHit: 1.5, immunityAfterStun: 2.5, trailStealSeconds: 1.5, trailStealCrownSeconds: 3.0,
  diveReboundDz: 6, missStun: 1.0, diveCooldown: 1.0,
  hideCoverFrac: 0.9,
  crownHysteresis: 2,
  spawnRingFrac: 0.45, spawnSplashRadius: 8,
  stormSoftFrom: 0.92,
};
const R = RULES;

export const ARENA_PRESETS = [
  { maxBirds: 2, a: 110, b: 76, towers: 5 },
  { maxBirds: 3, a: 128, b: 88, towers: 5 },
  { maxBirds: 4, a: 142, b: 98, towers: 6 },
  { maxBirds: 6, a: 165, b: 114, towers: 7 },
  { maxBirds: 9, a: 188, b: 130, towers: 8 },
  { maxBirds: 12, a: 210, b: 145, towers: 9 },
];
export const arenaFor = (n) => ARENA_PRESETS.find((p) => n <= p.maxBirds) ?? ARENA_PRESETS.at(-1);

// ---------------------------------------------------------------- soleil
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export function sun(t, T = R.roundSunSeconds) {
  const u = clamp(t / T, 0, 1);
  const eDeg = R.sunElevEndDeg + (R.sunElevStartDeg - R.sunElevEndDeg) * Math.pow(1 - u, R.sunElevGamma);
  const azDeg = R.sunAzEndDeg - (R.sunAzEndDeg - R.sunAzStartDeg) * (1 - u) ** 2;
  const e = eDeg * DEG, az = azDeg * DEG;
  // x = est, y = nord ; azimut depuis le nord, sens horaire ; d = direction des ombres (opposée au soleil)
  return { t, u, eDeg, azDeg, cotE: 1 / Math.tan(e), S: Math.min(1 / Math.sin(e), R.stretchMax), dx: -Math.sin(az), dy: -Math.cos(az) };
}
const alphaOf = (h) => clamp((h - R.altLow) / (R.altHigh - R.altLow), 0, 1);
const radiusOf = (h) => R.shadowRadiusLow + (R.shadowRadiusHigh - R.shadowRadiusLow) * alphaOf(h);
const speedOf = (h) => R.speedLow + (R.speedHigh - R.speedLow) * alphaOf(h);
const levelOf = (h) => (h <= R.strongMaxAlt ? 2 : 1); // 2 = FORT, 1 = PÂLE

export function birdShadow(x, y, h, s) {
  const r = radiusOf(h), off = h * s.cotE;
  return { cx: x + off * s.dx, cy: y + off * s.dy, A: r * s.S, B: r, dx: s.dx, dy: s.dy, lvl: levelOf(h) };
}

// ---------------------------------------------------------------- tours (profils lathe : segments tronconiques [z0, r0, z1, r1])
const shaft = (z0, r0, z1, r1) => [z0, r0, z1, r1];
const disc = (z, r, th = 3) => [z, r, z + th, r];
const bulb = (zc, r) => [[zc - r, r * 0.45, zc - r * 0.5, r * 0.87], [zc - r * 0.5, r * 0.87, zc, r], [zc, r, zc + r * 0.5, r * 0.87], [zc + r * 0.5, r * 0.87, zc + r, r * 0.3]];
const T = (name, x, y, parts) => ({ name, x, y, segs: parts.flatMap((p) => (Array.isArray(p[0]) ? p : [p])) });

// Cartes du preset moyen (a = 165, b = 114). Mise à l'échelle des positions par (a/165, b/114) pour les autres presets.
export const MAPS = {
  parasols: [
    T('T1 Grand Parasol', -70, 8, [shaft(0, 4, 44, 3.5), disc(44, 18, 4), shaft(48, 2, 58, 1)]),
    T('T2 Parasol ouest', -128, -42, [shaft(0, 3.5, 34, 3), disc(34, 13)]),
    T('T3 Fuseau nord-ouest', -110, 60, [shaft(0, 4, 46, 3), bulb(54, 8), shaft(62, 1.5, 70, 0.5)]),
    T('T4 Pile nord', -15, 72, [shaft(0, 3.5, 36, 3), disc(26, 10, 2), disc(33, 13)]),
    T('T5 Parasol sud', -10, -76, [shaft(0, 3, 30, 2.5), disc(30, 12)]),
    T('T6 Fuseau est', 68, 45, [shaft(0, 3.5, 26, 2.5), bulb(31, 6)]),
    T('T7 Colonne est', 88, -38, [shaft(0, 5, 24, 5), disc(24, 9)]),
    T('T8 Aiguille centre (7+ oiseaux)', 28, -18, [shaft(0, 3, 40, 1.5), bulb(44, 5)]),
    T('T9 Parasol nord-est (10+ oiseaux)', 42, 88, [shaft(0, 3, 30, 2.5), disc(30, 12)]),
  ],
  aiguilles: [
    T('A1', -120, 20, [shaft(0, 3, 52, 1.5), bulb(56, 5)]),
    T('A2', -85, -55, [shaft(0, 3, 46, 1.5), bulb(50, 4.5)]),
    T('A3', -70, 70, [shaft(0, 3, 44, 1.5), bulb(48, 4.5)]),
    T('A4', -35, 5, [shaft(0, 3, 40, 1.5), bulb(44, 5)]),
    T('A5', -15, -85, [shaft(0, 2.5, 36, 1.5), bulb(40, 4)]),
    T('A6', 10, 55, [shaft(0, 2.5, 34, 1.5), bulb(37, 4)]),
    T('A7', 45, -35, [shaft(0, 2.5, 32, 1.5), bulb(35, 4)]),
    T('A8', 80, 30, [shaft(0, 2.5, 28, 1.5), bulb(31, 3.5)]),
    T('A9', 110, -50, [shaft(0, 2.5, 26, 1.5), bulb(29, 3.5)]),
  ],
  geantes: [
    T('G1 Géante sud (hors arène)', -228, -38, [shaft(0, 10, 100, 7), bulb(108, 12)]),
    T('G2 Géante nord (hors arène)', -222, 62, [shaft(0, 9, 84, 6), bulb(91, 10)]),
    T('T1 Parasol', -95, 5, [shaft(0, 3.5, 36, 3), disc(36, 15)]),
    T('T2 Pile', -30, -65, [shaft(0, 3.5, 34, 3), disc(26, 9, 2), disc(31, 12)]),
    T('T3 Parasol', 15, 55, [shaft(0, 3, 30, 2.5), disc(30, 12)]),
    T('T4 Fuseau', 80, -20, [shaft(0, 3.5, 28, 2.5), bulb(33, 6)]),
  ],
  cadran: [
    T('C0 Gnomon', -30, 0, [shaft(0, 5, 70, 3), disc(38, 12), disc(52, 16), disc(66, 7, 4)]),
    T('C1', 55, 55, [shaft(0, 3, 28, 2.5), disc(28, 11)]),
    T('C2', 55, -55, [shaft(0, 3, 28, 2.5), disc(28, 11)]),
    T('C3', -110, 58, [shaft(0, 3, 34, 2.5), disc(34, 12)]),
    T('C4', -110, -58, [shaft(0, 3, 34, 2.5), disc(34, 12)]),
  ],
};
export function scaleMap(map, a, b) {
  // positions × (a/165, b/114) ; rayons des parties larges (> 5 m) × sqrt(a/165) ; hauteurs et fûts inchangés
  const sx = a / 165, sy = b / 114, sr = Math.sqrt(a / 165);
  return map.map((t) => ({ ...t, x: t.x * sx, y: t.y * sy, segs: t.segs.map(([z0, r0, z1, r1]) => [z0, r0 > 5 ? r0 * sr : r0, z1, r1 > 5 ? r1 * sr : r1]) }));
}

// Enveloppe convexe de deux cercles (ombre exacte d'un tronc de cône sous lumière parallèle)
function segHull(bx, by, z0, r0, z1, r1, s) {
  const C0x = bx + z0 * s.cotE * s.dx, C0y = by + z0 * s.cotE * s.dy;
  const C1x = bx + z1 * s.cotE * s.dx, C1y = by + z1 * s.cotE * s.dy;
  const L = Math.hypot(C1x - C0x, C1y - C0y);
  const h = { C0x, C0y, C1x, C1y, r0, r1, circleOnly: L <= Math.abs(r1 - r0) + 1e-9 };
  h.minX = Math.min(C0x - r0, C1x - r1); h.maxX = Math.max(C0x + r0, C1x + r1);
  h.minY = Math.min(C0y - r0, C1y - r1); h.maxY = Math.max(C0y + r0, C1y + r1);
  if (!h.circleOnly) {
    const ux = (C1x - C0x) / L, uy = (C1y - C0y) / L, nx = -uy, ny = ux;
    const sp = (r0 - r1) / L, cp = Math.sqrt(Math.max(0, 1 - sp * sp));
    h.ux = ux; h.uy = uy;
    h.mpx = ux * sp + nx * cp; h.mpy = uy * sp + ny * cp;
    h.mmx = ux * sp - nx * cp; h.mmy = uy * sp - ny * cp;
    h.cP = h.mpx * C0x + h.mpy * C0y + r0; h.cM = h.mmx * C0x + h.mmy * C0y + r0;
    h.s0 = ux * C0x + uy * C0y + r0 * sp; h.s1 = ux * C1x + uy * C1y + r1 * sp;
  }
  return h;
}
function inHull(h, px, py) {
  if (px < h.minX || px > h.maxX || py < h.minY || py > h.maxY) return false;
  if ((px - h.C0x) ** 2 + (py - h.C0y) ** 2 <= h.r0 * h.r0) return true;
  if ((px - h.C1x) ** 2 + (py - h.C1y) ** 2 <= h.r1 * h.r1) return true;
  if (h.circleOnly) return false;
  const sp = h.ux * px + h.uy * py;
  if (sp < h.s0 || sp > h.s1) return false;
  return h.mpx * px + h.mpy * py <= h.cP && h.mmx * px + h.mmy * py <= h.cM;
}
export function towerHulls(map, s) {
  const out = [];
  for (const t of map) for (const [z0, r0, z1, r1] of t.segs) out.push(segHull(t.x, t.y, z0, r0, z1, r1, s));
  return out;
}

// ---------------------------------------------------------------- grille
function makeGrid(a, b, cs, map) {
  const m = 2;
  const W = Math.ceil((2 * a + 2 * m) / cs), H = Math.ceil((2 * b + 2 * m) / cs);
  const x0 = -a - m, y0 = -b - m;
  const inArena = new Uint8Array(W * H);
  let n = 0;
  for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
    const x = x0 + (i + 0.5) * cs, y = y0 + (j + 0.5) * cs;
    let ok = (x / a) ** 2 + (y / b) ** 2 <= 1;
    if (ok && map) for (const t of map) if (Math.hypot(x - t.x, y - t.y) < t.segs[0][1]) ok = false; // pied des tours
    if (ok) { inArena[j * W + i] = 1; n++; }
  }
  return { a, b, cs, W, H, x0, y0, inArena, nCells: n };
}
function rasterHulls(g, hulls, out) {
  for (const h of hulls) {
    const i0 = Math.max(0, Math.floor((h.minX - g.x0) / g.cs)), i1 = Math.min(g.W - 1, Math.floor((h.maxX - g.x0) / g.cs));
    const j0 = Math.max(0, Math.floor((h.minY - g.y0) / g.cs)), j1 = Math.min(g.H - 1, Math.floor((h.maxY - g.y0) / g.cs));
    for (let j = j0; j <= j1; j++) {
      const y = g.y0 + (j + 0.5) * g.cs;
      for (let i = i0; i <= i1; i++) {
        const k = j * g.W + i;
        if (out[k] || !g.inArena[k]) continue;
        if (inHull(h, g.x0 + (i + 0.5) * g.cs, y)) out[k] = 1;
      }
    }
  }
}
function forEllipse(g, sh, fn) {
  const hw = Math.sqrt((sh.A * sh.dx) ** 2 + (sh.B * sh.dy) ** 2), hh = Math.sqrt((sh.A * sh.dy) ** 2 + (sh.B * sh.dx) ** 2);
  const i0 = Math.max(0, Math.floor((sh.cx - hw - g.x0) / g.cs)), i1 = Math.min(g.W - 1, Math.floor((sh.cx + hw - g.x0) / g.cs));
  const j0 = Math.max(0, Math.floor((sh.cy - hh - g.y0) / g.cs)), j1 = Math.min(g.H - 1, Math.floor((sh.cy + hh - g.y0) / g.cs));
  for (let j = j0; j <= j1; j++) {
    const ry = g.y0 + (j + 0.5) * g.cs - sh.cy;
    for (let i = i0; i <= i1; i++) {
      const rx = g.x0 + (i + 0.5) * g.cs - sh.cx;
      const pa = (rx * sh.dx + ry * sh.dy) / sh.A, pb = (-rx * sh.dy + ry * sh.dx) / sh.B;
      if (pa * pa + pb * pb <= 1) fn(j * g.W + i);
    }
  }
}
const cellAt = (g, x, y) => {
  const i = Math.floor((x - g.x0) / g.cs), j = Math.floor((y - g.y0) / g.cs);
  return i < 0 || j < 0 || i >= g.W || j >= g.H ? -1 : j * g.W + i;
};
// Front de la Grande Ombre : projection sur la direction des ombres, du bord ouest au bord est
function frontPos(g, s, t) {
  const ext = Math.sqrt((g.a * s.dx) ** 2 + (g.b * s.dy) ** 2);
  if (t < R.greatShadowAt) return -Infinity;
  const k = clamp((t - R.greatShadowAt) / (R.roundSunSeconds - R.greatShadowAt), 0, 1);
  return -ext + 2 * ext * k;
}

// ---------------------------------------------------------------- utilitaires d'affichage
const f = (v, d = 0) => (Number.isFinite(v) ? v.toLocaleString('fr-FR', { minimumFractionDigits: d, maximumFractionDigits: d }) : '∞');
const pct = (v, d = 1) => f(100 * v, d) + ' %';
const row = (cells) => '| ' + cells.join(' | ') + ' |';
const header = (cells) => row(cells) + '\n' + row(cells.map(() => '---'));

// ================================================================ 1. TABLES ANALYTIQUES
function tables() {
  const ar = arenaFor(6), area = Math.PI * ar.a * ar.b;
  console.log(`\n### A. Soleil, ombres d'oiseaux et débit de peinture (arène 5-6 oiseaux, ${f(area)} m²)\n`);
  console.log('Débit = largeur balayée × vitesse. « Travers » : vol perpendiculaire aux ombres (largeur = longueur de l\'ombre). « Axe » : vol le long des ombres (largeur = 2r).\n');
  console.log(header(['t (s)', 'phase', 'e', 'azimut', 'S = 1/sin e', 'décalage BAS / HAUT', 'longueur ombre BAS / HAUT', 'm²/s BAS travers / axe', 'm²/s HAUT travers / axe', '% arène/s BAS / HAUT (travers)']));
  const phases = [[0, 'Midi'], [15, 'Après-midi'], [30, ''], [45, ''], [55, 'Heure dorée'], [70, ''], [85, 'Couchant'], [92, ''], [98, 'Grande Ombre'], [104, ''], [110, 'Nuit']];
  for (const [t, ph] of phases) {
    const s = sun(t);
    const offL = R.altLow * s.cotE, offH = R.altHigh * s.cotE;
    const lenL = 2 * R.shadowRadiusLow * s.S, lenH = 2 * R.shadowRadiusHigh * s.S;
    const aLx = lenL * R.speedLow, aLa = 2 * R.shadowRadiusLow * R.speedLow;
    const aHx = lenH * R.speedHigh, aHa = 2 * R.shadowRadiusHigh * R.speedHigh;
    console.log(row([t, ph, f(s.eDeg, 1) + '°', f(s.azDeg, 0) + '°', f(s.S, 2), `${f(offL, 1)} / ${f(offH, 0)} m`, `${f(lenL, 0)} / ${f(lenH, 0)} m`, `${f(aLx)} / ${f(aLa)}`, `${f(aHx)} / ${f(aHa)}`, `${f(100 * aLx / area, 2)} / ${f(100 * aHx / area, 2)}`]));
  }
  // vitesse de glissement de l'ombre (soleil qui descend, oiseau immobile) et coup de fouet
  console.log('\nGlissement propre de l\'ombre (oiseau à cap constant, dû au seul soleil) et « coup de fouet » (vitesse de l\'ombre pendant une descente à 22 m/s ou une montée à 8 m/s) :\n');
  console.log(header(['t (s)', 'glissement HAUT (m/s)', 'fouet en descente (m/s)', 'fouet en montée (m/s)']));
  for (const t of [30, 55, 85, 98, 108]) {
    const dt = 0.5, s0 = sun(t - dt), s1 = sun(t + dt);
    const slide = Math.hypot(R.altHigh * (s1.cotE * s1.dx - s0.cotE * s0.dx), R.altHigh * (s1.cotE * s1.dy - s0.cotE * s0.dy)) / (2 * dt);
    const s = sun(t);
    console.log(row([t, f(slide, 1), f(R.descendRate * s.cotE, 0), f(R.climbRate * s.cotE, 0)]));
  }
  // potentiel de peinture par phase (intégrale de S, vol en travers)
  console.log('\nPotentiel de peinture par phase (∫ S dt, vol en travers, normalisé sur la manche) :\n');
  const edges = [0, R.phaseAfternoonAt, R.phaseGoldenAt, R.phaseSunsetAt, R.greatShadowAt, R.roundSunSeconds];
  const names = ['Midi', 'Après-midi', 'Heure dorée', 'Couchant', 'Grande Ombre*'];
  let tot = 0; const parts = [];
  for (let p = 0; p < 5; p++) { let acc = 0; for (let t = edges[p]; t < edges[p + 1]; t += 0.05) acc += sun(t + 0.025).S * 0.05; parts.push(acc); tot += acc; }
  console.log(header(['phase', 'durée', 'S moyen', 'part du potentiel']));
  for (let p = 0; p < 5; p++) console.log(row([names[p], `${edges[p]}-${edges[p + 1]} s`, f(parts[p] / (edges[p + 1] - edges[p]), 2), pct(parts[p] / tot)]));
  console.log('\n* avant réduction par le front de nuit (la zone jouable passe de 100 % à 0 % pendant cette phase).');

  console.log('\n### B. Arènes : taille, traversées, lisibilité\n');
  console.log(header(['oiseaux', 'demi-axes a × b', 'surface', 'm²/oiseau (N max)', 'grille (cellule)', 'traversée E-O HAUT / BAS', 'traversée N-S HAUT', 'largeur cadrée max', 'oiseau 11 m à 1080p', 'front de nuit']));
  for (const p of ARENA_PRESETS) {
    const areaP = Math.PI * p.a * p.b, rows = Math.round((512 * p.b / p.a) / 8) * 8;
    const vw = 2 * p.a * 1.1;
    console.log(row([`≤ ${p.maxBirds}`, `${p.a} × ${p.b} m`, f(areaP) + ' m²', f(areaP / p.maxBirds), `512 × ${rows} (${f(2 * p.a / 512, 2)} m)`, `${f(2 * p.a / R.speedHigh, 1)} / ${f(2 * p.a / R.speedLow, 1)} s`, `${f(2 * p.b / R.speedHigh, 1)} s`, f(vw) + ' m', f(11 * 1920 / vw) + ' px', f(2 * p.a / (R.roundSunSeconds - R.greatShadowAt), 1) + ' m/s']));
  }
}

// ================================================================ 2. TOURS
function towers() {
  console.log('\n### C. Longueur de l\'ombre d\'une tour (pointe, depuis le pied) et vitesse de la pointe\n');
  const hs = [28, 36, 46, 58, 70, 108];
  console.log(header(['t (s)', 'e', ...hs.map((h) => `H = ${h} m`), 'vitesse pointe (H = 46 m)']));
  for (const t of [0, 15, 30, 55, 70, 85, 98, 104, 110]) {
    const s = sun(t), s2 = sun(Math.min(110, t + 0.5)), s1 = sun(Math.max(0, t - 0.5));
    const v = Math.abs(46 * (s2.cotE - s1.cotE)) / ((Math.min(110, t + 0.5) - Math.max(0, t - 0.5)) || 1);
    console.log(row([t, f(s.eDeg, 1) + '°', ...hs.map((h) => f(h * s.cotE) + ' m'), f(v, 1) + ' m/s']));
  }
  console.log('\n### D. Part de l\'arène sous l\'ombre des tours (grille 0,5 m, arène 5-6 oiseaux 165 × 114 m)\n');
  const ts = [0, 15, 30, 45, 55, 70, 85, 92, 98];
  console.log(header(['carte', ...ts.map((t) => `${t} s`), 'dont Grande Ombre à 104 s']));
  const res = {};
  for (const [name, full] of Object.entries(MAPS)) {
    const map = full.slice(0, name === 'parasols' ? arenaFor(6).towers : full.length); // T8-T9 réservées aux grandes arènes
    const g = makeGrid(165, 114, 0.5, map);
    const cells = [];
    for (const t of [...ts, 104]) {
      const s = sun(t), mask = new Uint8Array(g.W * g.H);
      rasterHulls(g, towerHulls(map, s), mask);
      let c = 0, cn = 0; const fp = frontPos(g, s, t);
      for (let k = 0; k < mask.length; k++) if (g.inArena[k]) {
        const x = g.x0 + ((k % g.W) + 0.5) * g.cs, y = g.y0 + (Math.floor(k / g.W) + 0.5) * g.cs;
        const night = x * s.dx + y * s.dy < fp;
        if (mask[k]) c++;
        if (mask[k] || night) cn++;
      }
      cells.push(t === 104 ? `${pct(c / g.nCells)} (+nuit : ${pct(cn / g.nCells, 0)})` : pct(c / g.nCells));
    }
    res[name] = cells;
    console.log(row([name, ...cells]));
  }
  // cachettes : part des positions d'oiseau où l'on est caché (≥ 90 % de son ombre dans l'ombre des tours)
  console.log('\nCachettes (carte Les Parasols) : part des positions de l\'arène où un oiseau serait caché (≥ 90 % de son ombre sous l\'ombre d\'une tour) :\n');
  console.log(header(['t (s)', 'oiseau BAS (4 m)', 'oiseau HAUT (18 m)']));
  {
    const map = MAPS.parasols.slice(0, arenaFor(6).towers), g = makeGrid(165, 114, 0.5, map);
    for (const t of [0, 30, 55, 85, 98]) {
      const s = sun(t), mask = new Uint8Array(g.W * g.H); rasterHulls(g, towerHulls(map, s), mask);
      const shade = (x, y) => { const k = cellAt(g, x, y); return k >= 0 && mask[k] === 1; };
      const res = [R.altLow, R.altHigh].map((h) => {
        let hid = 0, tot = 0;
        for (let y = -g.b; y <= g.b; y += 2) for (let x = -g.a; x <= g.a; x += 2) {
          if ((x / g.a) ** 2 + (y / g.b) ** 2 > 1) continue; tot++;
          const sh = birdShadow(x, y, h, s); let n = 0, m = 0;
          for (let u = -1; u <= 1.001; u += 0.25) for (let v = -1; v <= 1.001; v += 0.25) { if (u * u + v * v > 1) continue; m++; if (shade(sh.cx + u * sh.A * sh.dx - v * sh.B * sh.dy, sh.cy + u * sh.A * sh.dy + v * sh.B * sh.dx)) n++; }
          if (n / m >= R.hideCoverFrac) hid++;
        }
        return pct(hid / tot, 2);
      });
      console.log(row([t, ...res]));
    }
  }
  // variation avec la taille d'arène (carte Parasols mise à l'échelle)
  console.log('\nCarte « Les Parasols » mise à l\'échelle selon le preset (positions × a/165, b/114 ; hauteurs inchangées) :\n');
  console.log(header(['preset', '0 s', '55 s', '85 s', '98 s']));
  for (const p of ARENA_PRESETS) {
    const map = scaleMap(MAPS.parasols, p.a, p.b).slice(0, p.towers);
    const g = makeGrid(p.a, p.b, 0.6, map);
    const vals = [0, 55, 85, 98].map((t) => { const m = new Uint8Array(g.W * g.H); rasterHulls(g, towerHulls(map, sun(t)), m); let c = 0; for (let k = 0; k < m.length; k++) if (m[k] && g.inArena[k]) c++; return pct(c / g.nCells); });
    console.log(row([`≤ ${p.maxBirds} (${map.length} tours)`, ...vals]));
  }
  return res;
}

// ================================================================ 3. PIQUÉ (micro-simulation cinématique)
function mulberry32(a) { return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };

function diveTrial(rng, opt) {
  const P = { ...R, ...opt.params };
  const dt = 1 / 240;
  const D = 8 + rng() * (P.diveLockRange - 8);
  const bearing = (rng() * 2 - 1) * P.diveLockConeDeg * DEG;
  const A = { x: 0, y: 0, h: P.altHigh, hd: 0, v: P.speedHigh };
  const Tg = { x: D * Math.cos(bearing), y: D * Math.sin(bearing), h: P.altLow, hd: rng() * 2 * Math.PI, v: P.speedLow };
  const side = rng() < 0.5 ? -1 : 1;
  let t = 0, committed = false, cvx = 0, cvy = 0, vz = 0, tCommit = null, flapT = null, minD = Infinity, hitAt = null;
  const turnT = opt.jink ? (rng() < 0.5 ? -1 : 1) : 0;
  while (t < P.diveWindup + P.diveMaxTime) {
    // cible : vol droit (ou crochet permanent si jink), + coup d'aile éventuel
    if (opt.pressAt != null && flapT == null && t >= opt.pressAt) flapT = t;
    if (opt.pressAfterCommit != null && flapT == null && tCommit != null && t >= tCommit + opt.pressAfterCommit) flapT = t;
    Tg.om = 0;
    if (opt.jink && t > P.diveWindup) { Tg.om = turnT * P.turnLowDegPerS * DEG; Tg.hd += Tg.om * dt; }
    if (opt.reverse && t > P.diveWindup) { Tg.om = (tCommit != null && t > tCommit + opt.reverse ? -1 : 1) * P.turnLowDegPerS * DEG; Tg.hd += Tg.om * dt; }
    let tvx = Tg.v * Math.cos(Tg.hd), tvy = Tg.v * Math.sin(Tg.hd);
    if (flapT != null && t - flapT < P.flapDuration) {
      // esquive latérale : perpendiculaire à l'approche de l'attaquant
      const ax = Tg.x - A.x, ay = Tg.y - A.y, L = Math.hypot(ax, ay) || 1;
      tvx += side * (-ay / L) * P.flapImpulse; tvy += side * (ax / L) * P.flapImpulse;
    }
    Tg.x += tvx * dt; Tg.y += tvy * dt;
    // attaquant
    if (t < P.diveWindup) {
      // prise d'élan : l'oiseau se cabre et s'oriente vers sa cible (pose visible), sans avancer vers elle plus vite
      A.hd = Math.atan2(Tg.y - A.y, Tg.x - A.x);
      A.x += A.v * 0.5 * Math.cos(A.hd) * dt; A.y += A.v * 0.5 * Math.sin(A.hd) * dt;
    } else if (!committed) {
      // interception à vitesse horizontale diveHSpeed ; la cible est extrapolée sur un arc
      // à vitesse et taux de virage constants (ceux qu'elle a à cet instant)
      const pred = (tt) => {
        const om = Tg.om || 0;
        if (Math.abs(om) < 1e-3) return [Tg.x + Tg.v * Math.cos(Tg.hd) * tt, Tg.y + Tg.v * Math.sin(Tg.hd) * tt];
        return [Tg.x + (Tg.v / om) * (Math.sin(Tg.hd + om * tt) - Math.sin(Tg.hd)), Tg.y + (Tg.v / om) * (-Math.cos(Tg.hd + om * tt) + Math.cos(Tg.hd))];
      };
      let tau = Math.hypot(Tg.x - A.x, Tg.y - A.y) / P.diveHSpeed;
      for (let it = 0; it < 6; it++) { const [qx, qy] = pred(tau); tau = Math.hypot(qx - A.x, qy - A.y) / P.diveHSpeed; }
      const [px, py] = pred(tau);
      const want = Math.atan2(py - A.y, px - A.x);
      const d = angDiff(want, A.hd), mx = P.diveTurnDegPerS * DEG * dt;
      A.hd += clamp(d, -mx, mx);
      vz = -(A.h - Tg.h) / Math.max(tau, 0.05);
      A.x += P.diveHSpeed * Math.cos(A.hd) * dt; A.y += P.diveHSpeed * Math.sin(A.hd) * dt; A.h += vz * dt;
      if (tau <= P.diveCommitLead) {
        // engagement (« clac ») : trajectoire balistique rectiligne vers le point d'interception prévu,
        // qui dure toujours au moins diveCommitLead (l'attaquant ralentit si la cible est tout près)
        committed = true; tCommit = t;
        const tc = Math.max(tau, P.diveCommitLead);
        const [qx, qy] = pred(tc);
        cvx = (qx - A.x) / tc; cvy = (qy - A.y) / tc; vz = -(A.h - Tg.h) / tc;
      }
    } else { A.x += cvx * dt; A.y += cvy * dt; A.h += vz * dt; }
    const d3 = Math.hypot(A.x - Tg.x, A.y - Tg.y, A.h - Tg.h);
    if (d3 < minD) minD = d3;
    if (t > P.diveWindup && d3 <= P.diveHitRadius && A.h >= Tg.h - 1) { hitAt = t; break; }
    if (A.h < Tg.h - 1.5) break;
    t += dt;
  }
  return { hit: hitAt != null, hitAt, tCommit, minD };
}
function dive(n = 4000) {
  const rng = mulberry32(7);
  console.log('\n### E. Piqué : micro-simulation (cible à 4 m en vol droit, attaquant à 18 m, distance 8-26 m dans le cône ±70°)\n');
  // temps d'impact de référence
  let base = 0, sumT = 0, sumC = 0, nC = 0, jinkHits = 0;
  for (let i = 0; i < n; i++) { const r = diveTrial(mulberry32(1000 + i), {}); if (r.hit) { base++; sumT += r.hitAt; } if (r.tCommit != null) { sumC += r.hitAt ?? 0; nC++; } }
  for (let i = 0; i < n; i++) if (diveTrial(mulberry32(1000 + i), { jink: true }).hit) jinkHits++;
  console.log(`- Sans esquive : ${pct(base / n)} de touches ; durée moyenne du piqué (prise d'élan comprise) : ${f(sumT / Math.max(1, base), 2)} s.`);
  console.log(`- Crochet permanent au virage max (140°/s) sans coup d'aile : ${pct(jinkHits / n)} de touches.`);
  for (const rv of [0.1, 0.2, 0.3]) { let h = 0; for (let i = 0; i < n; i++) if (diveTrial(mulberry32(1000 + i), { reverse: rv }).hit) h++; console.log(`- Virage max puis contre-virage ${f(rv, 1)} s après le clac, sans coup d'aile : ${pct(h / n)} de touches.`); }
  { const gaps = []; for (let i = 0; i < n; i++) { const r = diveTrial(mulberry32(1000 + i), {}); if (r.hit && r.tCommit != null) gaps.push(r.hitAt - r.tCommit); } gaps.sort((a, b) => a - b);
    console.log(`- Intervalle « clac » → contact : médiane ${f(gaps[gaps.length >> 1], 2)} s (10 % : ${f(gaps[Math.floor(gaps.length * 0.1)], 2)} s, 90 % : ${f(gaps[Math.floor(gaps.length * 0.9)], 2)} s).`); }
  // P(touche) selon le moment de l'appui, relatif à l'impact de référence
  const buckets = [0.05, 0.15, 0.25, 0.35, 0.45, 0.55, 0.7, 0.9];
  const line = [];
  for (const X of buckets) {
    let hits = 0, cnt = 0;
    for (let i = 0; i < n; i++) {
      const ref = diveTrial(mulberry32(1000 + i), {});
      if (!ref.hit) continue;
      const pressAt = ref.hitAt - X;
      if (pressAt < 0) continue;
      cnt++; if (diveTrial(mulberry32(1000 + i), { pressAt }).hit) hits++;
    }
    line.push(cnt ? pct(hits / cnt, 0) : '—');
  }
  console.log('\nP(touche) selon le moment du coup d\'aile (secondes avant l\'impact prévu) :\n');
  console.log(header(['appui X s avant l\'impact', ...buckets.map((b) => f(b, 2))]));
  console.log(row(['P(touche)', ...line]));
  // réaction au « clac » (engagement)
  const rts = [0.1, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5];
  const l2 = rts.map((rt) => { let h = 0; for (let i = 0; i < n; i++) if (diveTrial(mulberry32(1000 + i), { pressAfterCommit: rt }).hit) h++; return pct(h / n, 0); });
  console.log('\nP(touche) quand la cible réagit au « clac » (engagement, ' + R.diveCommitLead + ' s avant l\'impact) avec un temps de réaction donné (latence réseau comprise) :\n');
  console.log(header(['réaction après le clac', ...rts.map((r) => f(r, 2) + ' s')]));
  console.log(row(['P(touche)', ...l2]));
  // variantes de réglage
  console.log('\nSensibilité (P(touche) selon la réaction au clac / sans esquive) :\n');
  console.log(header(['réglage', 'réaction 0,2 s', 'réaction 0,3 s', 'réaction 0,4 s', 'sans esquive']));
  for (const params of [{}, { flapImpulse: 18 }, { flapImpulse: 26 }, { diveCommitLead: 0.6 }, { diveCommitLead: 0.7 }, { diveCommitLead: 0.75 }, { diveHitRadius: 4.5 }, { diveHitRadius: 3.5 }]) {
    const m = 1500; const hs = [0.2, 0.3, 0.4].map((rt) => { let h = 0; for (let i = 0; i < m; i++) if (diveTrial(mulberry32(1000 + i), { params, pressAfterCommit: rt }).hit) h++; return pct(h / m, 0); });
    let h0 = 0; for (let i = 0; i < m; i++) if (diveTrial(mulberry32(1000 + i), { params }).hit) h0++;
    console.log(row([Object.keys(params).length ? JSON.stringify(params) : 'valeurs du GDD', ...hs, pct(h0 / m, 0)]));
  }
}

// ================================================================ 4. MANCHES COMPLÈTES (bots à politiques fixes)
class Round {
  constructor(policies, seed, opts = {}) {
    this.rng = mulberry32(seed);
    const p = opts.arena ?? arenaFor(policies.length);
    this.map = opts.towers === false ? [] : scaleMap(MAPS[opts.map ?? 'parasols'], p.a, p.b).slice(0, Math.min(p.towers, MAPS[opts.map ?? 'parasols'].length));
    this.g = makeGrid(p.a, p.b, opts.cell ?? 1.0, this.map);
    const N = this.g.W * this.g.H;
    this.owner = new Int8Array(N).fill(-1); this.level = new Uint8Array(N); this.frozen = new Uint8Array(N);
    this.dt = 1 / 15; this.t = -0.0; this.opts = opts;
    const n = policies.length, rot = this.rng() * 2 * Math.PI;
    this.birds = policies.map((pol, i) => {
      const ang = rot + (2 * Math.PI * i) / n;
      const x = p.a * R.spawnRingFrac * Math.cos(ang), y = p.b * R.spawnRingFrac * Math.sin(ang);
      return { id: i, pol, x, y, h: R.altHigh, hd: ang + Math.PI / 2, v: R.speedHigh, want: ang + Math.PI / 2, wantLow: pol === 'low', stun: 0, immune: 0, cd: 0, dive: null, trail: [], nextDecision: this.rng() * 0.5, hidden: false, lock: null, lockPrev: null,
        st: { locks: 0, lockTime: 0, dives: 0, hits: 0, hitsTaken: 0, stolen: 0, lowTime: 0, highTime: 0 } };
    });
    for (const b of this.birds) forEllipse(this.g, { cx: b.x, cy: b.y, A: R.spawnSplashRadius, B: R.spawnSplashRadius, dx: 1, dy: 0 }, (k) => { if (this.g.inArena[k]) { this.owner[k] = b.id; this.level[k] = 2; } });
    this.crown = -1; this.crownCand = -1; this.crownCandT = 0;
    this.log = { leaderAt: {}, neutralAt: {}, shares: [], changes: 0, lastChange: 0, snap98: null, nnDist: [], coverage: {} };
  }
  counts() { const c = new Array(this.birds.length).fill(0); let neutral = 0; for (let k = 0; k < this.owner.length; k++) if (this.g.inArena[k]) { const o = this.owner[k]; if (o < 0) neutral++; else c[o]++; } return { c, neutral }; }
  updateFrozen(s) {
    this.frozen.fill(0);
    rasterHulls(this.g, towerHulls(this.map, s), this.frozen);
    const fp = frontPos(this.g, s, this.t);
    if (fp > -Infinity) { const g = this.g; for (let j = 0; j < g.H; j++) { const y = g.y0 + (j + 0.5) * g.cs; for (let i = 0; i < g.W; i++) { const x = g.x0 + (i + 0.5) * g.cs; if (x * s.dx + y * s.dy < fp) this.frozen[j * g.W + i] = 1; } } }
  }
  shadeAt(x, y) { const k = cellAt(this.g, x, y); return k >= 0 && this.frozen[k] === 1; }
  isHidden(b, s) {
    const sh = birdShadow(b.x, b.y, b.h, s);
    let n = 0, tot = 0;
    const pts = [[0, 0]]; for (let q = 0; q < 6; q++) { const a = (q * Math.PI) / 3; pts.push([0.5 * Math.cos(a), 0.5 * Math.sin(a)], [0.95 * Math.cos(a + 0.5), 0.95 * Math.sin(a + 0.5)]); }
    for (const [u, v] of pts) { tot++; const x = sh.cx + u * sh.A * sh.dx - v * sh.B * sh.dy, y = sh.cy + u * sh.A * sh.dy + v * sh.B * sh.dx; if (this.shadeAt(x, y)) n++; }
    return n / tot >= R.hideCoverFrac;
  }
  cellValue(k, id, lvl) {
    if (k < 0 || !this.g.inArena[k] || this.frozen[k]) return 0;
    const o = this.owner[k], l = this.level[k];
    if (o === id) return lvl === 2 && l === 1 ? 0.35 : 0;
    if (o < 0) return 1.2;
    if (lvl >= l) return o === this.crown ? 1.25 : 1.0;
    return 0;
  }
  footprintValue(id, x, y, h, s) {
    const sh = birdShadow(x, y, h, s); let v = 0;
    const pts = [[0, 0], [0.6, 0], [-0.6, 0], [0, 0.6], [0, -0.6], [0.45, 0.45], [-0.45, -0.45]];
    for (const [u, w] of pts) v += this.cellValue(cellAt(this.g, sh.cx + u * sh.A * sh.dx - w * sh.B * sh.dy, sh.cy + u * sh.A * sh.dy + w * sh.B * sh.dx), id, sh.lvl);
    return v / pts.length;
  }
  // statistiques par blocs de 8 m (recalculées chaque seconde) : sert au choix d'un cap lointain
  updateBlocks() {
    const g = this.g, BS = 8, bw = Math.ceil((g.W * g.cs) / BS), bh = Math.ceil((g.H * g.cs) / BS), n = this.birds.length;
    if (!this.blk) this.blk = { BS, bw, bh, neutral: new Float32Array(bw * bh), pale: new Float32Array(bw * bh * n), strong: new Float32Array(bw * bh * n), tot: new Float32Array(bw * bh) };
    const B = this.blk; B.neutral.fill(0); B.pale.fill(0); B.strong.fill(0); B.tot.fill(0);
    for (let j = 0; j < g.H; j++) for (let i = 0; i < g.W; i++) {
      const k = j * g.W + i; if (!g.inArena[k]) continue;
      const bi = Math.floor((j * g.cs) / BS) * bw + Math.floor((i * g.cs) / BS);
      B.tot[bi]++;
      if (this.frozen[k]) continue;
      const o = this.owner[k];
      if (o < 0) B.neutral[bi]++; else if (this.level[k] === 2) B.strong[bi * n + o]++; else B.pale[bi * n + o]++;
    }
  }
  blockValueAt(id, lvl, x, y) {
    const B = this.blk, g = this.g, n = this.birds.length;
    const bx = Math.floor((x - g.x0) / B.BS), by = Math.floor((y - g.y0) / B.BS);
    if (bx < 0 || by < 0 || bx >= B.bw || by >= B.bh) return 0;
    const bi = by * B.bw + bx; if (!B.tot[bi]) return 0;
    let v = 1.2 * B.neutral[bi];
    for (let o = 0; o < n; o++) {
      if (o === id) { if (lvl === 2) v += 0.35 * B.pale[bi * n + o]; continue; }
      const w = o === this.crown ? 1.25 : 1.0;
      v += w * (B.pale[bi * n + o] + (lvl === 2 ? B.strong[bi * n + o] : 0));
    }
    return v / (B.BS * B.BS / (g.cs * g.cs));
  }
  bestHeading(b, h, s) {
    let best = b.hd, bestV = -Infinity; const v = speedOf(h), g = this.g, r = radiusOf(h), lvl = levelOf(h);
    const shAng = Math.atan2(s.dy, s.dx), off = h * s.cotE;
    for (let q = 0; q < 16; q++) {
      const a = (q * Math.PI) / 8;
      const sweep = 2 * r * v * (1 + (s.S - 1) * Math.abs(Math.sin(a - shAng))); // m²/s balayés dans ce cap
      let near = 0;
      for (const tt of [0.7, 1.4, 2.1]) near += this.footprintValue(b.id, b.x + Math.cos(a) * v * tt, b.y + Math.sin(a) * v * tt, h, s) / 3;
      let far = 0;
      for (const [d, w] of [[25, 0.45], [50, 0.3], [80, 0.2], [120, 0.12]]) far += w * this.blockValueAt(b.id, lvl, b.x + Math.cos(a) * d + off * s.dx, b.y + Math.sin(a) * d + off * s.dy);
      let val = sweep * (near + far);
      for (const d of [15, 30, 45]) { const x = b.x + Math.cos(a) * d, y = b.y + Math.sin(a) * d, rho = Math.hypot(x / g.a, y / g.b); if (rho > 0.9) val -= 3000 * (rho - 0.9) * (60 / d); }
      val -= Math.abs(angDiff(a, b.hd)) * 20;
      if (val > bestV) { bestV = val; best = a; }
    }
    return { hd: best, val: bestV };
  }
  computeLock(A, s) {
    if (A.stun > 0 || A.dive || A.cd > 0) return null;
    let best = null, bestScore = Infinity;
    for (const B of this.birds) {
      if (B === A || B.stun > 0 || B.immune > 0 || B.hidden || B.dive) continue;
      if (A.h - B.h < R.diveLockDz) continue;
      const dx = B.x - A.x, dy = B.y - A.y, d = Math.hypot(dx, dy);
      if (d > R.diveLockRange) continue;
      const ang = Math.abs(angDiff(Math.atan2(dy, dx), A.hd));
      if (d > 3 && ang > R.diveLockConeDeg * DEG) continue;
      const sc = d * (1 + ang / (R.diveLockConeDeg * DEG));
      if (sc < bestScore) { bestScore = sc; best = B; }
    }
    return best;
  }
  paintBird(b, s, prev) {
    // sous-pas : l'ombre ne se déplace jamais de plus de 1 m entre deux empreintes
    const sh1 = birdShadow(b.x, b.y, b.h, s);
    const sh0 = prev ?? sh1;
    const n = Math.max(1, Math.ceil(Math.hypot(sh1.cx - sh0.cx, sh1.cy - sh0.cy) / 1.0));
    const g = this.g;
    for (let q = 1; q <= n; q++) {
      const k = q / n;
      const sh = { ...sh1, cx: sh0.cx + (sh1.cx - sh0.cx) * k, cy: sh0.cy + (sh1.cy - sh0.cy) * k };
      forEllipse(g, sh, (c) => {
        if (!g.inArena[c] || this.frozen[c]) return;
        const o = this.owner[c], l = this.level[c];
        if (o === b.id) { if (sh.lvl > l) this.level[c] = sh.lvl; }
        else if (o < 0 || sh.lvl >= l) { this.owner[c] = b.id; this.level[c] = sh.lvl; }
      });
    }
    b.trail.push({ t: this.t, sh: sh1, sh0 });
    while (b.trail.length && b.trail[0].t < this.t - R.trailStealCrownSeconds) b.trail.shift();
    return sh1;
  }
  stealTrail(victim, att) {
    const dur = victim.id === this.crown ? R.trailStealCrownSeconds : R.trailStealSeconds;
    let n = 0;
    for (const fp of victim.trail) {
      if (fp.t < this.t - dur) continue;
      const steps = Math.max(1, Math.ceil(Math.hypot(fp.sh.cx - fp.sh0.cx, fp.sh.cy - fp.sh0.cy)));
      for (let q = 1; q <= steps; q++) {
        const k = q / steps; const sh = { ...fp.sh, cx: fp.sh0.cx + (fp.sh.cx - fp.sh0.cx) * k, cy: fp.sh0.cy + (fp.sh.cy - fp.sh0.cy) * k };
        forEllipse(this.g, sh, (c) => { if (this.owner[c] === victim.id && !this.frozen[c]) { this.owner[c] = att.id; n++; } });
      }
    }
    return n * this.g.cs * this.g.cs;
  }
  run() {
    const T_END = R.roundSunSeconds; const dt = this.dt; let frozenClock = 0; const prevSh = new Map();
    let s = sun(0); this.updateFrozen(s); this.updateBlocks();
    const logTimes = new Set([20, 45, 60, 90, 98, 110]);
    for (let step = 0; this.t < T_END - 1e-9; step++) {
      this.t = step * dt; s = sun(this.t);
      frozenClock -= dt; if (frozenClock <= 0) { this.updateFrozen(s); frozenClock = 0.2; }
      if (step % 15 === 0) this.updateBlocks();
      // états
      for (const b of this.birds) b.hidden = b.stun <= 0 && this.isHidden(b, s);
      for (const A of this.birds) {
        A.lock = this.computeLock(A, s);
        if (A.lock) { A.st.lockTime += dt; if (!A.lockPrev || A.lockPrev !== A.lock) A.st.locks++; }
        A.lockPrev = A.lock;
      }
      // décisions des bots
      for (const b of this.birds) {
        b.nextDecision -= dt;
        if (b.stun > 0 || b.dive) continue;
        if (b.nextDecision <= 0) {
          b.nextDecision = 0.45 + this.rng() * 0.2;
          let wantLow = b.pol === 'low';
          if (b.pol === 'adapt') wantLow = this.t >= R.phaseGoldenAt;
          const hi = this.bestHeading(b, R.altHigh, s), lo = this.bestHeading(b, R.altLow, s);
          if (b.pol === 'mixed') {
            const threatened = this.birds.some((o) => o.lock === b);
            wantLow = 1.6 * lo.val > hi.val && !(threatened && this.rng() < 0.6);
          }
          b.wantLow = wantLow;
          let hd = (wantLow ? lo : hi).hd;
          if (b.pol === 'hunter' && b.h > 12) {
            let prey = null, pd = 110;
            for (const o of this.birds) if (o !== b && o.h < 12 && o.immune <= 0 && o.stun <= 0 && !o.hidden) { const d = Math.hypot(o.x - b.x, o.y - b.y); if (d < pd) { pd = d; prey = o; } }
            if (prey) hd = Math.atan2(prey.y + Math.sin(prey.hd) * prey.v * 0.6 - b.y, prey.x + Math.cos(prey.hd) * prey.v * 0.6 - b.x);
          }
          b.want = hd + (this.rng() * 2 - 1) * 8 * DEG;
        }
        // piqué opportuniste (toutes les politiques sauf « low »)
        if (b.pol !== 'low' && b.lock && this.rng() < 0.35) {
          const d = Math.hypot(b.lock.x - b.x, b.lock.y - b.y);
          b.dive = { target: b.lock, t: 0, dur: R.diveWindup + clamp(d / R.diveHSpeed + 0.15, 0.35, R.diveMaxTime), h0: b.h, x0: b.x, y0: b.y };
          b.st.dives++;
        }
      }
      // mouvement
      for (const b of this.birds) {
        b.immune = Math.max(0, b.immune - dt); b.cd = Math.max(0, b.cd - dt);
        if (b.stun > 0) {
          b.stun -= dt; b.h = Math.max(R.altLow, b.h - R.descendRate * dt);
          b.x += Math.cos(b.hd) * 8 * dt; b.y += Math.sin(b.hd) * 8 * dt;
          if (b.stun <= 0 && b.wasHit) { b.immune = R.immunityAfterStun; b.wasHit = false; }
          this.keepIn(b); continue;
        }
        if (b.dive) {
          const D = b.dive; D.t += dt; const T = D.target;
          if (D.t > R.diveWindup) {
            const k = clamp((D.t - R.diveWindup) / (D.dur - R.diveWindup), 0, 1);
            const tx = T.x, ty = T.y; const ddx = tx - b.x, ddy = ty - b.y, dd = Math.hypot(ddx, ddy);
            const stepL = Math.min(dd, R.diveHSpeed * dt); if (dd > 1e-6) { b.x += (ddx / dd) * stepL; b.y += (ddy / dd) * stepL; b.hd = Math.atan2(ddy, ddx); }
            b.h = D.h0 + (T.h - D.h0) * k;
          } else { b.x += Math.cos(b.hd) * b.v * dt; b.y += Math.sin(b.hd) * b.v * dt; }
          if (D.t >= D.dur) {
            b.dive = null; b.cd = R.diveCooldown;
            if (T.hidden || T.immune > 0 || T.stun > 0) { b.h = Math.max(b.h, R.altLow); }
            else {
              const pDodge = T.pol === 'low' ? 0.35 : 0.45; // les « low » ne regardent pas le ciel
              const hit = this.rng() < (1 - pDodge) * 0.92 + pDodge * 0.08;
              if (hit) {
                b.st.hits++; T.st.hitsTaken++;
                const m2 = this.stealTrail(T, b); b.st.stolen += m2;
                T.stun = R.stunHit; T.wasHit = true; b.h = Math.min(R.altHigh, T.h + R.diveReboundDz);
              } else { b.stun = R.missStun; b.h = R.altLow; }
            }
          }
          this.keepIn(b); continue;
        }
        const hT = b.wantLow ? R.altLow : R.altHigh;
        if (b.h > hT) b.h = Math.max(hT, b.h - R.descendRate * dt); else b.h = Math.min(hT, b.h + R.climbRate * dt);
        const turn = (R.turnLowDegPerS + (R.turnHighDegPerS - R.turnLowDegPerS) * alphaOf(b.h)) * DEG * dt;
        let want = b.want; const rho = Math.hypot(b.x / this.g.a, b.y / this.g.b);
        if (rho > R.stormSoftFrom) want = Math.atan2(-b.y, -b.x);
        b.hd += clamp(angDiff(want, b.hd), -turn, turn);
        const vT = speedOf(b.h); b.v += (vT - b.v) * (1 - Math.exp(-dt / R.speedTau));
        b.x += Math.cos(b.hd) * b.v * dt; b.y += Math.sin(b.hd) * b.v * dt; this.keepIn(b);
        if (b.h <= R.strongMaxAlt) b.st.lowTime += dt; else b.st.highTime += dt;
      }
      // peinture : FORT d'abord, puis PÂLE (un pâle ne recouvre jamais un fort : l'ordre ne change que les égalités)
      const order = [...this.birds].sort((p, q) => levelOf(q.h) - levelOf(p.h) || this.rng() - 0.5);
      for (const b of order) {
        if (b.stun > 0) { prevSh.delete(b.id); continue; }
        prevSh.set(b.id, this.paintBird(b, s, prevSh.get(b.id)));
      }
      // couronne
      if (step % 5 === 0) {
        const { c, neutral } = this.counts();
        let lead = 0; for (let i = 1; i < c.length; i++) if (c[i] > c[lead]) lead = i;
        if (lead !== this.crownCand) { this.crownCand = lead; this.crownCandT = this.t; }
        if (this.t - this.crownCandT >= R.crownHysteresis && this.crown !== lead) { if (this.crown >= 0) { this.log.changes++; this.log.lastChange = this.t; if (this.t >= 90) this.log.late = (this.log.late ?? 0) + 1; } this.crown = lead; }
        const tt = Math.round(this.t * 15) / 15;
        for (const L of logTimes) if (Math.abs(tt - L) < 1e-6 || (L === 110 && false)) { this.log.leaderAt[L] = lead; this.log.neutralAt[L] = neutral / this.g.nCells; }
        if (this.t >= 30 && this.t <= 90) {
          let sum = 0; for (const b of this.birds) { let m = Infinity; for (const o of this.birds) if (o !== b) m = Math.min(m, Math.hypot(o.x - b.x, o.y - b.y)); sum += m; }
          this.log.nnDist.push(sum / this.birds.length);
        }
      }
      if (Math.abs(this.t - R.greatShadowAt) < dt / 2) this.log.snap98 = Int8Array.from(this.owner);
      if (Math.abs(this.t - 60) < dt / 2) this.log.snap60 = Int8Array.from(this.owner);
    }
    const { c, neutral } = this.counts();
    this.log.shares = c.map((v) => v / this.g.nCells); this.log.neutralAt[110] = neutral / this.g.nCells;
    let changed = 0, stolen = 0; for (let k = 0; k < this.owner.length; k++) if (this.g.inArena[k] && this.log.snap98 && this.owner[k] !== this.log.snap98[k]) { changed++; if (this.log.snap98[k] >= 0) stolen++; }
    this.log.changedLast12 = changed / this.g.nCells; this.log.stolenLast12 = stolen / this.g.nCells;
    let kept = 0, owned = 0; for (let k = 0; k < this.owner.length; k++) if (this.g.inArena[k] && this.owner[k] >= 0) { owned++; if (this.log.snap60 && this.log.snap60[k] === this.owner[k]) kept++; }
    this.log.kept60 = kept / Math.max(1, owned);
    return this;
  }
  keepIn(b) { const rho = Math.hypot(b.x / this.g.a, b.y / this.g.b); if (rho > 1) { b.x /= rho; b.y /= rho; } }
}

function batch(policies, rounds, opts = {}) {
  const n = policies.length, sums = new Array(n).fill(0), wins = new Array(n).fill(0);
  const agg = { leadWin: { 60: 0, 90: 0, 98: 0 }, neutral45: 0, neutral110: 0, changed: 0, stolenLast: 0, kept60: 0, gap: 0, changes: 0, late: 0, nn: 0, locksPerMinHigh: 0, lockFrac: 0, dives: 0, hits: 0, stolen: 0, stolenN: 0 };
  for (let r = 0; r < rounds; r++) {
    // rotation des politiques sur les points d'apparition
    const perm = policies.map((_, i) => policies[(i + r) % n]);
    const run = new Round(perm, 100 + r * 7919, opts).run();
    const sh = run.log.shares; const idx = sh.map((v, i) => i).sort((a, b) => sh[b] - sh[a]);
    const winner = idx[0];
    for (let i = 0; i < n; i++) { const pi = (i + r) % n; sums[pi] += sh[i]; if (i === winner) wins[pi]++; }
    for (const L of [60, 90, 98]) if (run.log.leaderAt[L] === winner) agg.leadWin[L]++;
    agg.neutral45 += run.log.neutralAt[45] ?? 0; agg.neutral110 += run.log.neutralAt[110] ?? 0;
    agg.changed += run.log.changedLast12; agg.stolenLast += run.log.stolenLast12; agg.kept60 += run.log.kept60; agg.gap += sh[idx[0]] - sh[idx[1]]; agg.changes += run.log.changes; agg.late += run.log.late ? 1 : 0;
    agg.nn += run.log.nnDist.reduce((a, b) => a + b, 0) / Math.max(1, run.log.nnDist.length);
    for (const b of run.birds) {
      if (b.pol !== 'low') { const hiT = Math.max(1, b.st.highTime); agg.locksPerMinHigh += (b.st.locks / hiT) * 60; agg.lockFrac += b.st.lockTime / R.roundSunSeconds; }
      agg.dives += b.st.dives; agg.hits += b.st.hits; agg.stolen += b.st.stolen; agg.stolenN += b.st.hits;
    }
  }
  const nonLow = policies.filter((p) => p !== 'low').length || 1;
  return {
    share: sums.map((v) => v / rounds), win: wins.map((v) => v / rounds),
    leadWin: Object.fromEntries(Object.entries(agg.leadWin).map(([k, v]) => [k, v / rounds])),
    neutral45: agg.neutral45 / rounds, neutral110: agg.neutral110 / rounds, changed: agg.changed / rounds, stolenLast: agg.stolenLast / rounds, kept60: agg.kept60 / rounds, gap: agg.gap / rounds,
    changes: agg.changes / rounds, late: agg.late / rounds, nn: agg.nn / rounds,
    locksPerMinHigh: agg.locksPerMinHigh / (rounds * nonLow), lockFrac: agg.lockFrac / (rounds * nonLow),
    divesPerRound: agg.dives / rounds, hitRate: agg.hits / Math.max(1, agg.dives), stolenAvg: agg.stolen / Math.max(1, agg.stolenN),
    arena: opts.arena ?? arenaFor(n),
  };
}

function sim(rounds = 16) {
  console.log(`\n### F. Manches complètes de bots (${rounds} manches par ligne, politiques tournantes, carte Les Parasols)\n`);
  console.log('Politiques : `low` toujours au ras du sable, ne pique jamais ; `high` toujours haut, pique dès qu\'une cible est verrouillée ; `mixed` choisit l\'étage selon le terrain devant lui (et remonte quand il est visé) ; `hunter` haut, chasse les oiseaux bas ; `adapt` haut avant l\'heure dorée, bas après. Esquive des bots : 35-45 %.\n');
  const configs = [
    ['6 oiseaux, une politique chacun', ['low', 'high', 'mixed', 'hunter', 'adapt', 'mixed']],
    ['4 oiseaux : low / high / mixed / hunter', ['low', 'high', 'mixed', 'hunter']],
    ['4 oiseaux : 3 high + 1 low', ['high', 'high', 'high', 'low']],
    ['4 oiseaux : 3 low + 1 high', ['low', 'low', 'low', 'high']],
    ['4 oiseaux : 3 low + 1 hunter', ['low', 'low', 'low', 'hunter']],
    ['Duel low / high', ['low', 'high']],
    ['Duel low / mixed', ['low', 'mixed']],
    ['Duel high / mixed', ['high', 'mixed']],
    ['Duel mixed / hunter', ['mixed', 'hunter']],
    ['Duel low / hunter', ['low', 'hunter']],
  ];
  console.log(header(['composition', 'part moyenne finale par politique', 'victoires par politique']));
  const results = [];
  for (const [name, pols] of configs) {
    const r = batch(pols, rounds); results.push([name, pols, r]);
    console.log(row([name, pols.map((p, i) => `${p} ${pct(r.share[i])}`).join(' · '), pols.map((p, i) => `${p} ${pct(r.win[i], 0)}`).join(' · ')]));
  }
  console.log('\nTension, contact et piqués (manches symétriques : tous `mixed` sauf un `hunter`) :\n');
  console.log(header(['configuration', 'neutre à 45 s', 'neutre final', 'meneur à 60 / 90 / 98 s vainqueur', 'désert qui change de propriétaire pendant la Grande Ombre (98-110 s) : total / dont volé à un joueur', 'écart final 1er-2e', 'changements de meneur / manche', 'manches avec changement après 90 s', 'plus proche voisin (30-90 s)', 'nouvelles cibles verrouillées / min passée en haut', 'part du temps avec une cible', 'piqués / manche', 'touches', 'traînée volée par touche']));
  const sym = [
    ['6 oiseaux (5 mixed + 1 hunter)', ['mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'hunter'], {}],
    ['4 oiseaux (3 mixed + 1 hunter)', ['mixed', 'mixed', 'mixed', 'hunter'], {}],
    ['2 oiseaux (mixed / mixed)', ['mixed', 'mixed'], {}],
    ['4 oiseaux (3 low + 1 hunter) : borne haute des piqués', ['low', 'low', 'low', 'hunter'], {}],
    ['6 oiseaux, sans tours', ['mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'hunter'], { towers: false }],
    ['6 oiseaux, carte Le Cadran', ['mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'hunter'], { map: 'cadran' }],
    ['12 oiseaux', Array.from({ length: 12 }, (_, i) => (i % 4 === 3 ? 'hunter' : 'mixed')), {}],
  ];
  for (const [name, pols, opts] of sym) {
    const r = batch(pols, rounds, opts);
    console.log(row([name, pct(r.neutral45, 0), pct(r.neutral110, 0), `${pct(r.leadWin[60], 0)} / ${pct(r.leadWin[90], 0)} / ${pct(r.leadWin[98], 0)}`, `${pct(r.changed)} / ${pct(r.stolenLast)}`, f(100 * r.gap, 1) + ' pt', f(r.changes, 1), pct(r.late, 0), f(r.nn, 0) + ' m', f(r.locksPerMinHigh, 1), pct(r.lockFrac, 1), f(r.divesPerRound, 1), pct(r.hitRate, 0), f(r.stolenAvg) + ' m²']));
  }
}

function variants(rounds = 10) {
  console.log(`\n### G. Leviers de réglage de la fin de manche (6 oiseaux : 5 mixed + 1 hunter, ${rounds} manches par ligne)\n`);
  console.log(header(['variante', 'meneur à 60 / 90 / 98 s vainqueur', 'volé à un joueur pendant 98-110 s', 'territoire final déjà à son propriétaire à 60 s', 'écart 1er-2e', 'changements de meneur après 90 s']));
  const pols = ['mixed', 'mixed', 'mixed', 'mixed', 'mixed', 'hunter'];
  const base = { ...R };
  const vs = [
    ['GDD (fin à 9°, Grande Ombre 12 s, Parasols)', {}, {}],
    ['fin à 12° (S max 4,8)', { sunElevEndDeg: 12 }, {}],
    ['Grande Ombre de 6 s (104-110 s)', { greatShadowAt: 104 }, {}],
    ['Grande Ombre de 18 s (92-110 s)', { greatShadowAt: 92 }, {}],
    ['carte Les Géantes (24 % figé au couchant)', {}, { map: 'geantes' }],
    ['traînée volée 3 s', { trailStealSeconds: 3 }, {}],
    ['sans tours', {}, { towers: false }],
  ];
  for (const [name, over, opts] of vs) {
    Object.assign(R, base, over);
    const r = batch(pols, rounds, opts);
    console.log(row([name, `${pct(r.leadWin[60], 0)} / ${pct(r.leadWin[90], 0)} / ${pct(r.leadWin[98], 0)}`, pct(r.stolenLast), pct(r.kept60, 0), f(100 * r.gap, 1) + ' pt', pct(r.late, 0)]));
  }
  Object.assign(R, base);
}

// ---------------------------------------------------------------- CLI
const [, , mode = 'all', a1] = process.argv;
if (import.meta.url === `file://${process.argv[1]}`) {
  const t0 = Date.now();
  if (mode === 'tables' || mode === 'all') tables();
  if (mode === 'towers' || mode === 'all') towers();
  if (mode === 'dive' || mode === 'all') dive(mode === 'dive' && a1 ? +a1 : 2000);
  if (mode === 'sim' || mode === 'all') sim(mode === 'sim' && a1 ? +a1 : 12);
  if (mode === 'variants' || mode === 'all') variants(mode === 'variants' && a1 ? +a1 : 12);
  console.error(`\n(${((Date.now() - t0) / 1000).toFixed(1)} s)`);
}
