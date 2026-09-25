// Copie du prototype de calibrage utilisé pour docs/research/design-drama.md (non destiné au jeu final).
// Usage : node design-drama-sim.mjs table | round | batch <manches> <nbBots>   (défauts = valeurs proposées ; surcharges env : VLOW VHIGH RHIGH PHIGH HITR WINDUP DASHV AA BB LAYOUT=1)
// Prototype de simulation des règles "Ombres" (design-drama) — calibrage des chiffres.
// node sim.mjs [mode]   mode: table | round | batch
import fs from 'node:fs';

const D2R = Math.PI / 180;
export const CFG = {
  T: 110,            // durée du coucher (s)
  E_END: 9,          // élévation finale (deg)
  GAMMA: 1.7,        // courbe e(t)
  AZ0: 235, AZ1: 270,// azimut du soleil (deg, depuis le nord, horaire)
  NIGHT_START: 98,   // début de la Grande Ombre (s)
  A: +(process.env.AA||180), B: +(process.env.BB||125),    // demi-axes de l'arène (m)
  CELL: 1.0,
  HZ: 30,
  H_MIN: 4, H_MAX: 20,
  R_LOW: 5, R_HIGH: +(process.env.RHIGH||11),   // rayon de l'ombre (m) bas/haut, avant étirement
  P_LOW: 1.0, P_HIGH: +(process.env.PHIGH||0.3),// noirceur bas/haut
  RATE: 2.0,              // encre/s à noirceur 1
  OWN_MIN: 0.1,           // seuil de possession
  V_MIN: 10, V_MAX: 20, V_MAX_LOW: +(process.env.VLOW||16), V_MAX_HIGH: +(process.env.VHIGH||21), V_DIVE: 24, V_CAP: 26,
  VZ_DOWN: -22, VZ_UP: 6,
  DASH: +(process.env.DASHV||14), DASH_TAU: 0.35, DASH_CD: 4,
  LOCK_DZ: 5, LOCK_R: 24, LOCK_ANG: 75,
  HIT_R: +(process.env.HITR||4.5), WINDUP: +(process.env.WINDUP||0.2), STALL: 1.6, IMMUNE: 2.0, DIVE_MAX: 1.5, DIVE_TURN: 110,
  SPLASH_R: 8,
};

export function sunAt(t, c = CFG) {
  const u = Math.min(1, Math.max(0, t / c.T));
  const eDeg = c.E_END + (90 - c.E_END) * Math.pow(1 - u, c.GAMMA);
  const az = c.AZ0 + (c.AZ1 - c.AZ0) * u;
  const e = eDeg * D2R;
  const azSh = (az + 180) * D2R;
  const dir = [Math.sin(azSh), Math.cos(azSh)]; // x est, y nord
  const cot = eDeg >= 89.9 ? 0 : 1 / Math.tan(e);
  return { eDeg, e, S: 1 / Math.sin(e), cot, dir, az };
}

function mulberry32(a) { return function () { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

// ----- tours (profils lathe simplifiés : segments cylindriques/coniques) -----
function parasol(x, y, z, r) { return { x, y, segs: [{ r0: 3, r1: 3, z0: 0, z1: z }, { r0: r, r1: r, z0: z, z1: z + 4 }], stemR: 3 }; }
function fuseau(x, y, H, rb) { return { x, y, segs: [{ r0: 2.5, r1: 2.5, z0: 0, z1: H - 14 }, { r0: 3, r1: rb, z0: H - 14, z1: H - 6 }, { r0: rb, r1: 2, z0: H - 6, z1: H }], stemR: 2.5 }; }
function pile(x, y, H, r1, r2) { return { x, y, segs: [{ r0: 3.5, r1: 3.5, z0: 0, z1: H }, { r0: r1, r1: r1, z0: 28, z1: 30 }, { r0: r2, r1: r2, z0: H - 3, z1: H }], stemR: 3.5 }; }
export const LAYOUT_M = [
  parasol(-10, 5, 52, 20),
  parasol(-120, 50, 38, 13),
  fuseau(-95, -65, 75, 9),
  pile(-45, 78, 42, 10, 13),
  parasol(-40, -85, 34, 12),
  fuseau(60, 70, 65, 8),
  pile(85, -35, 44, 9, 12),
];

export const LAYOUT_M2 = [
  parasol(-60, 0, 46, 20),
  parasol(-130, 55, 40, 13),
  fuseau(-110, -60, 60, 9),
  pile(-20, 80, 36, 10, 13),
  parasol(-10, -85, 30, 12),
  fuseau(70, 60, 40, 8),
  pile(80, -30, 30, 9, 12),
];
export class Sim {
  constructor(nBirds, brains, seed = 1, c = CFG, layout = (process.env.LAYOUT==='1'?LAYOUT_M:LAYOUT_M2)) {
    const sc = c.A / 180; layout = layout.map(t => ({ ...t, x: t.x * sc, y: t.y * sc }));
    this.c = c; this.rng = mulberry32(seed); this.layout = layout;
    this.W = Math.round(2 * c.A / c.CELL); this.H = Math.round(2 * c.B / c.CELL);
    const N = this.W * this.H;
    this.owner = new Int8Array(N).fill(-1); this.ink = new Float32Array(N);
    this.inArena = new Uint8Array(N); this.frozen = new Uint8Array(N); this.towerSh = new Uint8Array(N);
    this.arenaCells = 0;
    for (let j = 0; j < this.H; j++) for (let i = 0; i < this.W; i++) {
      const [x, y] = this.cellXY(i, j); const n = (x / c.A) ** 2 + (y / c.B) ** 2;
      let ok = n <= 1;
      for (const t of layout) if (Math.hypot(x - t.x, y - t.y) < t.stemR + 0.5) ok = false;
      if (ok) { this.inArena[j * this.W + i] = 1; this.arenaCells++; }
    }
    this.t = 0; this.tick = 0; this.birds = [];
    for (let k = 0; k < nBirds; k++) {
      const ang = (k / nBirds) * 2 * Math.PI + 0.3;
      this.birds.push({ id: k, x: Math.cos(ang) * c.A * 0.55, y: Math.sin(ang) * c.B * 0.55, h: c.H_MAX, hd: ang + Math.PI, v: 15, vz: 0,
        dvx: 0, dvy: 0, dashCd: 0, state: 'fly', stallT: 0, immuneT: 0, diveT: 0, target: -1, prevA: false, prevB: false,
        brain: brains[k], stats: { divesTry: 0, divesHit: 0, hitBy: 0, dodges: 0, tLow: 0, tHigh: 0, hidden: 0, stolen: 0, splash: 0 } });
    }
    this.events = []; this.history = [];
  }
  cellXY(i, j) { return [-this.c.A + (i + 0.5) * this.c.CELL, -this.c.B + (j + 0.5) * this.c.CELL]; }
  idx(x, y) { const i = Math.floor((x + this.c.A) / this.c.CELL), j = Math.floor((y + this.c.B) / this.c.CELL); if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1; return j * this.W + i; }
  sun() { return sunAt(this.t, this.c); }
  nightX() { const c = this.c; if (this.t < c.NIGHT_START) return -1e9; return -c.A + 2 * c.A * Math.min(1, (this.t - c.NIGHT_START) / (c.T - c.NIGHT_START)); }

  computeFrozen() {
    const { cot, dir } = this.sun(); const W = this.W, H = this.H, c = this.c;
    this.towerSh.fill(0);
    for (const tw of this.layout) for (const s of tw.segs) {
      const x0 = tw.x + dir[0] * s.z0 * cot, y0 = tw.y + dir[1] * s.z0 * cot;
      const x1 = tw.x + dir[0] * s.z1 * cot, y1 = tw.y + dir[1] * s.z1 * cot;
      const rm = Math.max(s.r0, s.r1);
      const i0 = Math.max(0, Math.floor((Math.min(x0, x1) - rm + c.A) / c.CELL)), i1 = Math.min(W - 1, Math.ceil((Math.max(x0, x1) + rm + c.A) / c.CELL));
      const j0 = Math.max(0, Math.floor((Math.min(y0, y1) - rm + c.B) / c.CELL)), j1 = Math.min(H - 1, Math.ceil((Math.max(y0, y1) + rm + c.B) / c.CELL));
      const sx = x1 - x0, sy = y1 - y0, L2 = sx * sx + sy * sy;
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
        const x = -c.A + (i + 0.5) * c.CELL, y = -c.B + (j + 0.5) * c.CELL;
        let u = L2 > 1e-6 ? ((x - x0) * sx + (y - y0) * sy) / L2 : 0; u = Math.max(0, Math.min(1, u));
        const px = x0 + sx * u, py = y0 + sy * u; const r = s.r0 + (s.r1 - s.r0) * u;
        if ((x - px) ** 2 + (y - py) ** 2 <= r * r) this.towerSh[j * W + i] = 1;
      }
    }
    const nx = this.nightX();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i; const x = -c.A + (i + 0.5) * c.CELL;
      this.frozen[k] = (this.towerSh[k] || x < nx) ? 1 : 0;
    }
  }
  frozenAt(x, y) { const k = this.idx(x, y); return k < 0 ? 1 : this.frozen[k]; }
  shadowCenter(b, sun = this.sun()) { return [b.x + sun.dir[0] * b.h * sun.cot, b.y + sun.dir[1] * b.h * sun.cot]; }
  brushOf(b) { const c = this.c; const a = (b.h - c.H_MIN) / (c.H_MAX - c.H_MIN); return { r: c.R_LOW + (c.R_HIGH - c.R_LOW) * a, p: c.P_LOW + (c.P_HIGH - c.P_LOW) * a }; }
  hidden(b) { const [sx, sy] = this.shadowCenter(b); return this.frozenAt(sx, sy) === 1; }

  paint(b, sun) {
    const c = this.c, W = this.W, H = this.H, dt = 1 / c.HZ;
    const { r, p } = this.brushOf(b); const [cx, cy] = this.shadowCenter(b, sun);
    const [dx, dy] = sun.dir; const S = sun.S; const rr = r + 0.5;
    const ex = Math.sqrt((rr * S * dx) ** 2 + (rr * dy) ** 2), ey = Math.sqrt((rr * S * dy) ** 2 + (rr * dx) ** 2);
    const i0 = Math.max(0, Math.floor((cx - ex + c.A) / c.CELL)), i1 = Math.min(W - 1, Math.ceil((cx + ex + c.A) / c.CELL));
    const j0 = Math.max(0, Math.floor((cy - ey + c.B) / c.CELL)), j1 = Math.min(H - 1, Math.ceil((cy + ey + c.B) / c.CELL));
    let stolen = 0, painted = 0;
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const k = j * W + i; if (!this.inArena[k] || this.frozen[k]) continue;
      const x = -c.A + (i + 0.5) * c.CELL - cx, y = -c.B + (j + 0.5) * c.CELL - cy;
      const u = (x * dx + y * dy) / S, v = -x * dy + y * dx; const rho = Math.sqrt(u * u + v * v);
      const pp = p * Math.max(0, Math.min(1, rr - rho)); if (pp < 0.1) continue;
      const o = this.owner[k];
      if (o === b.id) { if (this.ink[k] < pp) this.ink[k] = Math.min(pp, this.ink[k] + c.RATE * pp * dt); }
      else if (o === -1) { this.owner[k] = b.id; this.ink[k] = c.RATE * pp * dt; painted++; }
      else if (pp > this.ink[k]) {
        const before = this.ink[k] >= c.OWN_MIN;
        this.ink[k] -= c.RATE * pp * dt;
        if (this.ink[k] < 0) { this.owner[k] = b.id; this.ink[k] = Math.min(pp, -this.ink[k]); if (before) stolen++; }
      }
    }
    b.stats.stolen += stolen; return stolen;
  }
  splash(att, vic, sun) {
    const c = this.c; const [cx, cy] = this.shadowCenter(vic, sun); const [dx, dy] = sun.dir; const S = sun.S, r = c.SPLASH_R;
    let n = 0; const ext = r * S;
    for (let y = cy - ext; y <= cy + ext; y += c.CELL) for (let x = cx - ext; x <= cx + ext; x += c.CELL) {
      const k = this.idx(x, y); if (k < 0 || !this.inArena[k] || this.frozen[k]) continue;
      const X = x - cx, Y = y - cy; const u = (X * dx + Y * dy) / S, v = -X * dy + Y * dx;
      if (u * u + v * v <= r * r) { if (this.owner[k] !== att.id) n++; this.owner[k] = att.id; this.ink[k] = 1; }
    }
    att.stats.splash += n; return n;
  }
  lockTarget(b) {
    const c = this.c; let best = -1, bd = 1e9;
    for (const o of this.birds) {
      if (o === b || o.state === 'stall' || o.immuneT > 0) continue;
      if (b.h - o.h < c.LOCK_DZ) continue; const dx = o.x - b.x, dy = o.y - b.y; const d = Math.hypot(dx, dy);
      if (d > c.LOCK_R) continue; let ang = Math.abs(angDiff(Math.atan2(dy, dx), b.hd)) / D2R; if (d > 3 && ang > c.LOCK_ANG) continue;
      if (this.hidden(o)) continue; if (d < bd) { bd = d; best = o.id; }
    }
    return best;
  }
  score() { const s = new Array(this.birds.length).fill(0); for (let k = 0; k < this.owner.length; k++) { const o = this.owner[k]; if (o >= 0 && this.ink[k] >= this.c.OWN_MIN) s[o]++; } return s.map(v => v / this.arenaCells); }
  darkShare() { const s = new Array(this.birds.length).fill(0); for (let k = 0; k < this.owner.length; k++) { const o = this.owner[k]; if (o >= 0 && this.ink[k] >= 0.8) s[o]++; } return s.map(v => v / this.arenaCells); }
  frozenShare() { let tw = 0, all = 0; for (let k = 0; k < this.owner.length; k++) if (this.inArena[k]) { if (this.towerSh[k]) tw++; if (this.frozen[k]) all++; } return { tower: tw / this.arenaCells, all: all / this.arenaCells }; }

  step() {
    const c = this.c, dt = 1 / c.HZ; const sun = this.sun();
    if (this.tick % 3 === 0) this.computeFrozen();
    const inputs = this.birds.map(b => b.brain(this, b, sun));
    for (let k = 0; k < this.birds.length; k++) this.physics(this.birds[k], inputs[k], sun, dt);
    // collisions / touches
    for (const a of this.birds) {
      if (a.vz > -10 || a.state === 'stall') continue;
      for (const v of this.birds) {
        if (v === a || v.state === 'stall' || v.immuneT > 0) continue;
        if (a.h < v.h - 1) continue;
        const d = Math.hypot(a.x - v.x, a.y - v.y, a.h - v.h);
        if (d < c.HIT_R) {
          v.state = 'stall'; v.stallT = c.STALL; v.v = 10; v.stats.hitBy++; a.stats.divesHit++;
          const n = this.splash(a, v, sun); this.events.push({ t: this.t, type: 'hit', a: a.id, v: v.id, cells: n });
          a.state = 'fly'; a.target = -1;
        }
      }
    }
    const order = this.birds.map((b, i) => i).sort(() => this.rng() - 0.5);
    for (const k of order) { const b = this.birds[k]; if (b.state !== 'stall' && !this.hidden(b)) this.paint(b, sun); }
    this.t += dt; this.tick++;
    if (this.tick % c.HZ === 0) { let nn = 0; for (const b of this.birds) { let m = 1e9; for (const o of this.birds) if (o !== b) m = Math.min(m, Math.hypot(b.x - o.x, b.y - o.y)); nn += m / this.birds.length; } this.history.push({ t: Math.round(this.t), s: this.score(), nn }); }
  }
  physics(b, inp, sun, dt) {
    const c = this.c;
    b.dashCd = Math.max(0, b.dashCd - dt); b.immuneT = Math.max(0, b.immuneT - dt);
    const st = b.stats; if (b.h < 10) st.tLow += dt; if (b.h > 19) st.tHigh += dt; if (this.hidden(b)) st.hidden += dt;
    if (b.state === 'stall') {
      b.stallT -= dt; b.vz = -25; b.hd += 4 * dt;
      if (b.stallT <= 0) { b.state = 'fly'; b.immuneT = c.IMMUNE; b.vz = 0; }
    } else {
      const mag = Math.min(1, Math.hypot(inp.sx, inp.sy));
      let desired = mag > 0.1 ? Math.atan2(inp.sy, inp.sx) : b.hd + 0.5 * dt;
      const aH = (b.h - c.H_MIN) / (c.H_MAX - c.H_MIN); const vMax = c.V_MAX_LOW + (c.V_MAX_HIGH - c.V_MAX_LOW) * aH; let vT = c.V_MIN + (vMax - c.V_MIN) * mag;
      const Aedge = inp.A && !b.prevA;
      if (Aedge && b.state === 'fly') { const tg = this.lockTarget(b); if (tg >= 0) { b.state = 'dive'; b.target = tg; b.diveT = 0; st.divesTry++; this.events.push({ t: this.t, type: 'dive', a: b.id, v: tg }); } }
      let omega;
      if (b.state === 'dive') {
        const o = this.birds[b.target]; b.diveT += dt;
        desired = Math.atan2(o.y - b.y, o.x - b.x); omega = c.DIVE_TURN; if (b.diveT < c.WINDUP) { vT = b.v; b.vz = 0; } else { vT = c.V_DIVE; const dh = Math.hypot(o.x - b.x, o.y - b.y); b.vz = -Math.max(8, Math.min(28, (b.h - o.h + 0.5) * c.V_DIVE / Math.max(1, dh))); }
        if (b.h <= c.H_MIN + 0.05 || b.diveT > c.DIVE_MAX + c.WINDUP || o.state === 'stall' || this.hidden(o)) { b.state = 'fly'; if (o.state !== 'stall') { this.events.push({ t: this.t, type: 'miss', a: b.id, v: o.id }); if (o.dashCd > c.DASH_CD - 1.2) o.stats.dodges++; } }
      } else {
        omega = 140 + (90 - 140) * Math.max(0, Math.min(1, (b.v - 10) / 10));
        if (inp.A) b.vz = b.h > c.H_MIN ? c.VZ_DOWN : 0; else b.vz = b.h < c.H_MAX ? c.VZ_UP : 0;
        if (b.vz < -1) vT = Math.min(c.V_CAP, vT + 6); else if (b.vz > 1) vT -= 3;
      }
      const dh = Math.max(-omega * D2R * dt, Math.min(omega * D2R * dt, angDiff(desired, b.hd))); b.hd += dh;
      const acc = vT > b.v ? (b.vz < -1 ? 14 : 8) : 6; b.v += Math.max(-acc * dt, Math.min(acc * dt, vT - b.v));
      if (inp.B && !b.prevB && b.dashCd <= 0) {
        const dd = mag > 0.1 ? Math.atan2(inp.sy, inp.sx) : b.hd; b.dvx = Math.cos(dd) * c.DASH; b.dvy = Math.sin(dd) * c.DASH; b.dashCd = c.DASH_CD;
        this.events.push({ t: this.t, type: 'dash', a: b.id });
      }
    }
    b.prevA = !!inp.A; b.prevB = !!inp.B;
    const f = Math.exp(-dt / c.DASH_TAU); b.dvx *= f; b.dvy *= f;
    b.x += (Math.cos(b.hd) * b.v + b.dvx) * dt; b.y += (Math.sin(b.hd) * b.v + b.dvy) * dt;
    b.h = Math.max(c.H_MIN, Math.min(c.H_MAX, b.h + b.vz * dt));
    // tempête : bord doux
    const n = Math.hypot(b.x / c.A, b.y / c.B);
    if (n > 0.92) { const inward = Math.atan2(-b.y, -b.x); b.hd += Math.max(-2 * dt, Math.min(2 * dt, angDiff(inward, b.hd))); }
    if (n > 1) { b.x /= n; b.y /= n; }
    for (const tw of this.layout) { const d = Math.hypot(b.x - tw.x, b.y - tw.y); const R = tw.stemR + 4; if (d < R) { b.x = tw.x + (b.x - tw.x) / d * R; b.y = tw.y + (b.y - tw.y) / d * R; } }
  }
  png(file) {
    const W = this.W, H = this.H; const pal = [[214, 64, 69], [58, 110, 190], [240, 170, 40], [60, 160, 110], [150, 80, 170], [40, 180, 190], [230, 120, 150], [120, 120, 40]];
    const buf = Buffer.alloc(W * H * 3);
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i, o = (H - 1 - j) * W + i; let col = [236, 214, 176];
      if (!this.inArena[k]) col = [120, 100, 80];
      else if (this.owner[k] >= 0 && this.ink[k] >= 0.1) { const pc = pal[this.owner[k] % pal.length]; const q = 0.35 + 0.65 * this.ink[k]; col = col.map((v, z) => v * (1 - q) + pc[z] * q); }
      if (this.frozen[k] && this.inArena[k]) { if ((i + j) % 4 < 2) col = col.map(v => v * 0.45); else col = col.map(v => v * 0.8); }
      buf[o * 3] = col[0]; buf[o * 3 + 1] = col[1]; buf[o * 3 + 2] = col[2];
    }
    for (const b of this.birds) { const [sx, sy] = this.shadowCenter(b); for (const [x, y, cc] of [[b.x, b.y, [0, 0, 0]], [sx, sy, [255, 255, 255]]]) { const k = this.idx(x, y); if (k < 0) continue; const i = k % W, j = Math.floor(k / W); for (let a = -2; a <= 2; a++) for (let d = -2; d <= 2; d++) { const ii = i + a, jj = H - 1 - (j + d); if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue; const o = jj * W + ii; buf[o * 3] = cc[0]; buf[o * 3 + 1] = cc[1]; buf[o * 3 + 2] = cc[2]; } } }
    fs.writeFileSync(file, Buffer.concat([Buffer.from(`P6\n${W} ${H}\n255\n`), buf]));
  }
}
export function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; }

// ----- cerveau de bot simplifié (paramétrable) -----
export function makeBrain(opts) {
  const o = Object.assign({ alt: 'mixed', aggr: 0.6, dodge: 0.5, aimShadow: true, react: 0.3, speedMag: 1, lowBias: 0.5 }, opts);
  const mem = { goal: null, nextPick: 0, wantLow: false, dodgeAt: -1, dashNow: false, pressA: false };
  return function (sim, b, sun) {
    const c = sim.c; const rng = sim.rng;
    // esquive : un piqué me vise ?
    for (const a of sim.birds) if (a.state === 'dive' && a.target === b.id && mem.dodgeAt < 0) {
      const tti = Math.max(0.05, (a.h - b.h) / 22 + Math.max(0, sim.c.WINDUP - a.diveT));
      if (rng() < o.dodge && tti - 0.3 > o.react) mem.dodgeAt = sim.t + tti - 0.3; else mem.dodgeAt = 1e9;
    }
    if (!sim.birds.some(a => a.state === 'dive' && a.target === b.id)) mem.dodgeAt = -1;
    let B = false, dashDir = null;
    if (mem.dodgeAt > 0 && sim.t >= mem.dodgeAt && mem.dodgeAt < 1e8) { B = true; mem.dodgeAt = 1e9; const a = sim.birds.find(a => a.state === 'dive' && a.target === b.id); if (a) dashDir = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2; }
    // choix d'objectif
    if (sim.t >= mem.nextPick || !mem.goal) {
      mem.nextPick = sim.t + 0.8 + rng() * 0.6;
      const nx = sim.nightX(); let best = null, bv = -1e9;
      const pLow = c.P_LOW, pHigh = c.P_HIGH;
      for (let s = 0; s < 28; s++) {
        const ang = rng() * 2 * Math.PI, rad = Math.sqrt(rng());
        const gx = Math.cos(ang) * rad * c.A * 0.95, gy = Math.sin(ang) * rad * c.B * 0.95;
        const nxp = sim.t > sim.c.NIGHT_START - 4 ? -sim.c.A + 2 * sim.c.A * Math.max(0, (sim.t + 3 - sim.c.NIGHT_START) / (sim.c.T - sim.c.NIGHT_START)) : -1e9; if (gx < Math.max(nx, nxp) + 20) continue;
        let vHigh = 0, vLow = 0;
        for (let q = 0; q < 12; q++) {
          const k = sim.idx(gx + (rng() - 0.5) * 20, gy + (rng() - 0.5) * 20); if (k < 0 || !sim.inArena[k] || sim.frozen[k]) continue;
          const ow = sim.owner[k], ink = sim.ink[k];
          if (ow === b.id) { vLow += ink < 0.8 ? 0.15 : 0; continue; }
          if (ow < 0 || ink < 0.1) { vHigh += 1; vLow += 0.6; }
          else { if (ink < pHigh) vHigh += 1.2; vLow += 1.3; }
        }
        const wantLow = o.alt === 'low' || (o.alt === 'mixed' && vLow * (0.7 + o.lowBias) > vHigh * 1.2);
        let v = (o.alt === 'high' ? vHigh * 2.2 : wantLow ? vLow : vHigh * 2.2);
        v -= Math.hypot(gx - b.x, gy - b.y) * 0.02;
        if (v > bv) { bv = v; best = [gx, gy, wantLow]; }
      }
      if (best) { mem.goal = [best[0], best[1]]; mem.wantLow = best[2]; }
    }
    let tx = mem.goal[0], ty = mem.goal[1];
    if (o.aimShadow) { tx -= sun.dir[0] * b.h * sun.cot; ty -= sun.dir[1] * b.h * sun.cot; }
    let sx = tx - b.x, sy = ty - b.y; const m = Math.hypot(sx, sy) || 1; sx = sx / m * o.speedMag; sy = sy / m * o.speedMag;
    if (dashDir !== null) { sx = Math.cos(dashDir); sy = Math.sin(dashDir); }
    // piqué ?
    let A = o.alt === 'low' || (o.alt === 'mixed' && mem.wantLow);
    if (b.state === 'dive') A = true;
    if (b.h > c.H_MAX - 2 && o.aggr > 0 && b.state === 'fly') {
      const tg = sim.lockTarget(b);
      if (tg >= 0 && rng() < o.aggr / c.HZ * 3) { A = true; if (b.prevA) A = false; }
    }
    if (b.state === 'fly' && b.prevA && A && b.h <= c.H_MIN + 0.1 && o.alt === 'high') A = false;
    return { sx, sy, A, B };
  };
}

// ----- modes -----
const mode = process.argv[2] || 'table';
if (mode === 'table') {
  const c = CFG; const rows = [];
  for (const t of [0, 10, 20, 30, 40, 50, 60, 70, 80, 85, 90, 95, 98, 100, 105, 110]) {
    const s = sunAt(t); const off = h => (h * s.cot).toFixed(0);
    const lowL = 2 * c.R_LOW * s.S, highL = 2 * c.R_HIGH * s.S;
    // aire/s en vol perpendiculaire à l'ombre (largeur = longueur étirée) et parallèle (largeur = diamètre)
    const v = 20;
    rows.push({ t, e: s.eDeg.toFixed(1), az: s.az.toFixed(0), S: s.S.toFixed(2), 'off5': off(5), 'off24': off(24),
      'Lbas': lowL.toFixed(0), 'Lhaut': highL.toFixed(0),
      'bas_perp': (lowL * v).toFixed(0), 'haut_perp': (highL * v).toFixed(0), 'bas_par': (2 * c.R_LOW * v).toFixed(0), 'haut_par': (2 * c.R_HIGH * v).toFixed(0),
      'dwell_bas_par': (lowL / v).toFixed(2), 'crown52_off': (52 * s.cot).toFixed(0) });
  }
  console.table(rows);
}
if (mode === 'round' || mode === 'batch') {
  const nRounds = mode === 'batch' ? +(process.argv[3] || 12) : 1;
  const nB = +(process.argv[4] || 4);
  const presets = [
    { name: 'haut', alt: 'high', aggr: 0.9, dodge: 0.5 },
    { name: 'bas', alt: 'low', aggr: 0, dodge: 0.5 },
    { name: 'mixte', alt: 'mixed', aggr: 0.5, dodge: 0.5 },
    { name: 'mixte-agr', alt: 'mixed', aggr: 1.2, dodge: 0.6, lowBias: 0.3 },
    { name: 'mixte-naif', alt: 'mixed', aggr: 0.3, dodge: 0.1, aimShadow: false },
    { name: 'mixte2', alt: 'mixed', aggr: 0.6, dodge: 0.5, lowBias: 0.8 },
  ].slice(0, nB);
  const agg = presets.map(() => ({ wins: 0, share: 0, dark: 0, hits: 0, hitBy: 0, tries: 0, tLow: 0, tHigh: 0, hidden: 0 }));
  let leadWins = { 60: 0, 80: 0, 90: 0, 98: 0, 104: 0 }; let marg98 = 0, margEnd = 0, painted = 0, lchg = 0, p50 = 0, nnMid = 0, dodges = 0, tries = 0; let churnLast12 = 0, churnMid = 0, frozen = {}, splashTot = 0, hitsTot = 0;
  for (let r = 0; r < nRounds; r++) {
    // rotation des sièges pour éviter le biais de position
    const perm = presets.map((_, i) => (i + r) % presets.length);
    const sim = new Sim(presets.length, perm.map(i => makeBrain(presets[i])), 1000 + r);
    let snap98 = null, snap60 = null, snap72 = null;
    const T = sim.c.T; const fz = [];
    while (sim.t < T) {
      sim.step();
      const ti = sim.tick / sim.c.HZ;
      if (Math.abs(ti - 60) < 1e-6) snap60 = Int8Array.from(sim.owner.map((o, k) => sim.ink[k] >= 0.1 ? o : -1));
      if (Math.abs(ti - 72) < 1e-6) snap72 = Int8Array.from(sim.owner.map((o, k) => sim.ink[k] >= 0.1 ? o : -1));
      if (Math.abs(ti - 98) < 1e-6) snap98 = Int8Array.from(sim.owner.map((o, k) => sim.ink[k] >= 0.1 ? o : -1));
      if (sim.tick % (sim.c.HZ * 10) === 0) fz.push([Math.round(ti), sim.frozenShare()]);
      if (mode === 'round' && [15, 45, 75, 95, 104, 109].some(x => Math.abs(ti - x) < 1e-6)) sim.png(`snap_${Math.round(ti)}.ppm`);
    }
    const fin = sim.score(); const dark = sim.darkShare();
    const winnerSeat = fin.indexOf(Math.max(...fin));
    for (const T0 of Object.keys(leadWins)) { const h = sim.history.find(x => x.t === +T0); const l = h.s.indexOf(Math.max(...h.s)); if (l === winnerSeat) leadWins[T0]++; }
    { const h98 = sim.history.find(x => x.t === 98).s.slice().sort((a,b)=>b-a); const fe = fin.slice().sort((a,b)=>b-a); marg98 += (h98[0]-h98[1])/nRounds; p50 += sim.history.find(x=>x.t===50).s.reduce((a,b)=>a+b,0)/nRounds; nnMid += sim.history.filter(x=>x.t>=30&&x.t<=90).reduce((a,x)=>a+x.nn,0)/61/nRounds; dodges += sim.birds.reduce((a,b)=>a+b.stats.dodges,0); tries += sim.birds.reduce((a,b)=>a+b.stats.divesTry,0); margEnd += (fe[0]-fe[1])/nRounds; painted += fin.reduce((a,b)=>a+b,0)/nRounds;
      let prev=-1; for (const h of sim.history) { if (h.t<20) continue; const l=h.s.indexOf(Math.max(...h.s)); if (prev>=0 && l!==prev) lchg++; prev=l; } }
    const cur = sim.owner.map((o, k) => sim.ink[k] >= 0.1 ? o : -1);
    let ch = 0, chm = 0; for (let k = 0; k < cur.length; k++) { if (cur[k] !== snap98[k]) ch++; if (snap72[k] !== snap60[k]) chm++; }
    churnLast12 += ch / sim.arenaCells; churnMid += chm / sim.arenaCells;
    for (const [t, f] of fz) { frozen[t] = frozen[t] || { tower: 0, all: 0 }; frozen[t].tower += f.tower / nRounds; frozen[t].all += f.all / nRounds; }
    for (let seat = 0; seat < presets.length; seat++) {
      const pi = perm[seat]; const a = agg[pi]; const st = sim.birds[seat].stats;
      a.share += fin[seat] / nRounds; a.dark += dark[seat] / nRounds; if (seat === winnerSeat) a.wins++;
      a.hits += st.divesHit; a.hitBy += st.hitBy; a.tries += st.divesTry; a.tLow += st.tLow / nRounds; a.tHigh += st.tHigh / nRounds; a.hidden += st.hidden / nRounds;
      splashTot += st.splash; hitsTot += st.divesHit;
    }
    if (mode === 'round') {
      console.log('final', fin.map(x => (100 * x).toFixed(1)), 'neutral', (100 * (1 - fin.reduce((a, b) => a + b, 0))).toFixed(1));
      console.log('history', sim.history.filter(h => h.t % 10 === 0 || h.t > 95).map(h => h.t + ':' + h.s.map(x => (100 * x).toFixed(0)).join('/')).join('  '));
      console.log('events', sim.events.filter(e => e.type !== 'dash').length, 'hits', sim.events.filter(e => e.type === 'hit').map(e => `${e.t.toFixed(0)}s ${e.a}->${e.v} +${e.cells}`).join(', '));
    }
  }
  console.log('policy', presets.map((p, i) => `${p.name}: win ${agg[i].wins}/${nRounds} share ${(100 * agg[i].share).toFixed(1)}% dark ${(100 * agg[i].dark).toFixed(1)}% tries ${agg[i].tries} hits ${agg[i].hits} hitBy ${agg[i].hitBy} tLow ${agg[i].tLow.toFixed(0)} tHigh ${agg[i].tHigh.toFixed(0)} hid ${agg[i].hidden.toFixed(0)}`).join('\n'));
  console.log('leader@t wins', Object.fromEntries(Object.entries(leadWins).map(([k, v]) => [k, `${v}/${nRounds}`])));
  console.log('margin98', (100*marg98).toFixed(1), 'marginEnd', (100*margEnd).toFixed(1), 'painted', (100*painted).toFixed(0)+'%', 'leadChanges/round', (lchg/nRounds).toFixed(1), 'painted@50', (100*p50).toFixed(0)+'%', 'nearest-bird dist 30-90s', nnMid.toFixed(0)+'m', 'dodges/tries', dodges+'/'+tries);
  console.log('churn 60-72s', (100 * churnMid / nRounds).toFixed(1) + '%', ' churn last 12s', (100 * churnLast12 / nRounds).toFixed(1) + '%', ' splash cells/hit', (splashTot / Math.max(1, hitsTot)).toFixed(0));
  console.log('frozen', Object.entries(frozen).map(([t, f]) => `${t}s tower ${(100 * f.tower).toFixed(0)}% all ${(100 * f.all).toFixed(0)}%`).join(' | '));
}
