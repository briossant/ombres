// Simulation d'équilibrage d'Ombres (voir docs/research/design-depth.md §14). Node 22, sans dépendance.
// node balance-sim.mjs <politiques séparées par des virgules | alt | hunt | six> <manches> <rayon arène> ['{"trailSteal":1.5}']
// Simulation grossière d'une manche d'Ombres (grille 1 m, 15 Hz) pour tester l'équilibrage
// des stratégies d'altitude, du piqué, des ombres de tours et de la Grande Ombre.
// Usage : node sim.mjs [matchup] [runs]
const D = Math.PI / 180
export const P = {
  hMin: 3, hMax: 22, kMax: 2.6, W0: 10, L0: 5,
  v: 20, vClimb: 14, climb: 7, sink: 1.2, turn: 100 * D, turnClimb: 130 * D,
  Rp: 2.4, sigmaMax: 6, darkExp: 1.0, tieEps: 0.04,
  T: 150, frontSpeed: 50, azSweep: 60 * D,
  keys: [[0, 85], [40, 62], [95, 28], [135, 12], [150, 8]],
  stun: 1.5, immune: 1.5, rebound: 5,
  dt: 1 / 15,
  towersFreeze: true, frontOn: true, dives: true,
  erode: 1.0, trailSteal: 1.5, fallPaint: false, maintainCost: true, missStun: 1.2, dhMax: 12,
}
const smooth = (a, b, u) => a + (b - a) * (u * u * (3 - 2 * u))
export function elev(t, keys = P.keys) {
  if (t <= keys[0][0]) return keys[0][1]
  for (let i = 1; i < keys.length; i++) if (t <= keys[i][0]) {
    const [t0, e0] = keys[i - 1], [t1, e1] = keys[i]
    const u = (t - t0) / (t1 - t0)
    return e0 + (e1 - e0) * u // linéaire par morceaux (la vitesse angulaire change par phase)
  }
  // après T : Grande Ombre, le soleil continue de 8° vers 6°
  return Math.max(5, keys[keys.length - 1][1] - 0.4 * (t - keys[keys.length - 1][0]))
}
const kOf = (h) => 1 + (P.kMax - 1) * (h - P.hMin) / (P.hMax - P.hMin)
const darkOf = (h) => Math.pow(kOf(h), -P.darkExp)

function rng(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296 } }

function makeTowers(R, rand) {
  // 1 tour centrale + anneau intérieur (3) + anneau extérieur (3-4)
  const T = []
  T.push({ x: 0, y: 0, rs: 6, H: 72, disks: [{ z: 58, r: 16 }, { z: 36, r: 10 }] })
  const n1 = 3, n2 = R >= 150 ? 5 : R >= 130 ? 4 : 3
  const a0 = rand() * 2 * Math.PI
  for (let i = 0; i < n1; i++) { const a = a0 + i * 2 * Math.PI / n1; T.push({ x: 0.45 * R * Math.cos(a), y: 0.45 * R * Math.sin(a), rs: 4.5, H: 46, disks: [{ z: 42, r: 13 }] }) }
  for (let i = 0; i < n2; i++) { const a = a0 + Math.PI / n1 + i * 2 * Math.PI / n2; T.push({ x: 0.78 * R * Math.cos(a), y: 0.78 * R * Math.sin(a), rs: 3.5, H: 34, disks: [{ z: 27, r: 7 }] }) }
  return T
}

export function makeGame(opts) {
  const o = { ...P, ...opts }
  const R = o.R
  const N = 2 * R + 2
  const off = R + 1
  const owner = new Int8Array(N * N).fill(-1)
  const inten = new Float32Array(N * N)
  const inside = new Uint8Array(N * N)
  const frozen = new Uint8Array(N * N)
  let insideCount = 0
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const x = i - off + 0.5, y = j - off + 0.5
    if (x * x + y * y <= R * R) { inside[j * N + i] = 1; insideCount++ }
  }
  const rand = rng(o.seed || 1)
  const towers = makeTowers(R, rand)
  const azSet = rand() * 2 * Math.PI
  const bestD = new Float32Array(N * N), bestP = new Int8Array(N * N).fill(-1), tie = new Uint8Array(N * N)
  const touched = []
  const lastPaint = new Int32Array(N * N).fill(-99999)
  return { lastPaint, o, R, N, off, owner, inten, inside, frozen, insideCount, towers, azSet, bestD, bestP, tie, touched, rand, t: 0 }
}

export function sunAt(g, t) {
  const e = elev(t) * D
  const az = g.azSet - g.o.azSweep * Math.max(0, 1 - t / g.o.T)
  // u = direction horizontale VERS le soleil ; les ombres partent en -u
  return { e, ux: Math.cos(az), uy: Math.sin(az), sig: Math.min(1 / Math.sin(e), g.o.sigmaMax), cot: 1 / Math.tan(e) }
}

function computeFrozen(g, sun, t) {
  const { N, off, frozen, towers } = g
  frozen.fill(0)
  if (g.o.towersFreeze) for (const tw of towers) {
    // fût : capsule du pied au sommet projeté
    const ex = tw.x - sun.ux * tw.H * sun.cot, ey = tw.y - sun.uy * tw.H * sun.cot
    stampCapsule(g, tw.x, tw.y, ex, ey, tw.rs)
    for (const d of tw.disks) {
      const cx = tw.x - sun.ux * d.z * sun.cot, cy = tw.y - sun.uy * d.z * sun.cot
      stampCapsule(g, cx, cy, cx, cy, d.r)
    }
  }
  if (g.o.frontOn && t > g.o.T) {
    // Grande Ombre : front perpendiculaire à u, part du bord côté soleil
    const pos = g.R - g.o.frontSpeed * (t - g.o.T) // coordonnée le long de u (côté soleil = +R)
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = i - off + 0.5, y = j - off + 0.5
      if (x * sun.ux + y * sun.uy > pos) frozen[j * N + i] = 1
    }
  }
}
function stampCapsule(g, ax, ay, bx, by, r) {
  const { N, off, frozen } = g
  const x0 = Math.max(0, Math.floor(Math.min(ax, bx) - r + off)), x1 = Math.min(N - 1, Math.ceil(Math.max(ax, bx) + r + off))
  const y0 = Math.max(0, Math.floor(Math.min(ay, by) - r + off)), y1 = Math.min(N - 1, Math.ceil(Math.max(ay, by) + r + off))
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const px = i - off + 0.5 - ax, py = j - off + 0.5 - ay
    let u = L2 > 0 ? (px * dx + py * dy) / L2 : 0
    u = Math.max(0, Math.min(1, u))
    const qx = px - u * dx, qy = py - u * dy
    if (qx * qx + qy * qy <= r * r) frozen[j * N + i] = 1
  }
}
export function birdHidden(g, b, sun) {
  // l'oiseau est dans l'ombre d'une tour si sa position est dans l'ombre projetée sur le plan z = b.z
  for (const tw of g.towers) {
    if (tw.H <= b.z) continue
    const L = (tw.H - b.z) * sun.cot
    if (capsuleHit(b.x, b.y, tw.x, tw.y, tw.x - sun.ux * L, tw.y - sun.uy * L, tw.rs)) return true
    for (const d of tw.disks) if (d.z > b.z) {
      const cx = tw.x - sun.ux * (d.z - b.z) * sun.cot, cy = tw.y - sun.uy * (d.z - b.z) * sun.cot
      if ((b.x - cx) ** 2 + (b.y - cy) ** 2 <= d.r * d.r) return true
    }
  }
  return false
}
function capsuleHit(px, py, ax, ay, bx, by, r) {
  const dx = bx - ax, dy = by - ay, L2 = dx * dx + dy * dy
  let u = L2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / L2 : 0
  u = Math.max(0, Math.min(1, u))
  const qx = px - ax - u * dx, qy = py - ay - u * dy
  return qx * qx + qy * qy <= r * r
}

// Empreinte d'ombre : ellipse (a = demi-envergure, b = demi-longueur) orientée selon le cap,
// étirée de sigma le long de u, translatée de -z*cot(e)*u.
export function footprint(b, sun) {
  const k = kOf(b.z)
  const a = P.W0 * k / 2, bb = P.L0 * k / 2
  const cx = b.x - sun.ux * b.z * sun.cot, cy = b.y - sun.uy * b.z * sun.cot
  return { cx, cy, a, b: bb, th: b.th, d: darkOf(b.z), k }
}
function rasterFootprint(g, fp, sun, painter, dmod = 1) {
  const { N, off, bestD, bestP, tie, touched, inside, frozen } = g
  const hx = Math.cos(fp.th), hy = Math.sin(fp.th) // avant
  const sx = -hy, sy = hx // côté (envergure)
  // vecteurs axes transformés
  const T = (vx, vy) => { const pu = vx * sun.ux + vy * sun.uy; return [vx + (sun.sig - 1) * pu * sun.ux, vy + (sun.sig - 1) * pu * sun.uy] }
  const A1 = T(sx * fp.a, sy * fp.a), A2 = T(hx * fp.b, hy * fp.b)
  const ex = Math.sqrt(A1[0] ** 2 + A2[0] ** 2), ey = Math.sqrt(A1[1] ** 2 + A2[1] ** 2)
  const x0 = Math.max(0, Math.floor(fp.cx - ex + off)), x1 = Math.min(N - 1, Math.ceil(fp.cx + ex + off))
  const y0 = Math.max(0, Math.floor(fp.cy - ey + off)), y1 = Math.min(N - 1, Math.ceil(fp.cy + ey + off))
  const d = fp.d * dmod
  for (let j = y0; j <= y1; j++) for (let i = x0; i <= x1; i++) {
    const idx = j * N + i
    if (!inside[idx] || frozen[idx]) continue
    let qx = i - off + 0.5 - fp.cx, qy = j - off + 0.5 - fp.cy
    const pu = qx * sun.ux + qy * sun.uy
    const k = (1 / sun.sig - 1) * pu
    qx += k * sun.ux; qy += k * sun.uy
    const f = (qx * hx + qy * hy) / fp.b, s = (qx * sx + qy * sy) / fp.a
    if (f * f + s * s > 1) continue
    if (bestP[idx] === -1) { bestP[idx] = painter; bestD[idx] = d; tie[idx] = 0; touched.push(idx) }
    else if (bestP[idx] !== painter) {
      if (d > bestD[idx] + P.tieEps) { bestP[idx] = painter; bestD[idx] = d; tie[idx] = 0 }
      else if (Math.abs(d - bestD[idx]) <= P.tieEps) tie[idx] = 1
    } else if (d > bestD[idx]) bestD[idx] = d
  }
}
function applyPaint(g, stats) {
  const { owner, inten, bestD, bestP, tie, touched } = g
  const dt = g.o.dt
  const tick = Math.round(g.t / dt)
  for (const idx of touched) {
    const p = bestP[idx], d = bestD[idx]
    if (!tie[idx]) {
      if (g.lastPaint) { g.lastPaint[idx] = tick; }
      const q = g.o.Rp * d * dt
      const ow = owner[idx]
      if (ow === p) { if (inten[idx] < d) inten[idx] = Math.min(d, inten[idx] + q) }
      else if (ow === -1) { owner[idx] = p; inten[idx] = Math.min(q, d); stats.newCells[p]++ }
      else {
        inten[idx] -= q * g.o.erode
        if (inten[idx] < 0) { owner[idx] = p; inten[idx] = Math.min(-inten[idx] / g.o.erode, d); stats.flips[p]++; stats.lost[ow]++ }
      }
    }
    bestP[idx] = -1; bestD[idx] = 0; tie[idx] = 0
  }
  touched.length = 0
}

// ---------- Oiseaux & politiques ----------
export const POLICIES = {
  low: { alt: () => 3, dives: true },
  mid: { alt: () => 12, dives: true },
  high: { alt: () => 22, dives: true },
  adapt: { alt: (g, b, t) => (t < 95 ? 4 : 22), dives: true },
  adaptInv: { alt: (g, b, t) => (t < 95 ? 20 : 4), dives: false },
  hunter: { alt: () => 20, dives: true },
  adaptHunter: { alt: (g, b, t) => (t < 95 ? 5 : 20), dives: true },
  // contextuel : bas au-dessus du territoire ennemi fort, haut au-dessus du neutre
  context: { alt: (g, b, t) => b.ctxAlt ?? 12, dives: true },
}

export function makeBird(g, i, n, policy, skill = { react: 0.35, dodge: true }) {
  const a = (i / n) * 2 * Math.PI + 0.3
  const r = 0.6 * g.R
  return { id: i, x: r * Math.cos(a), y: r * Math.sin(a), z: 10, th: a + Math.PI, v: P.v, vz: 0, policy, pol: POLICIES[policy], skill,
    stun: 0, immune: 0, stunBy: -1, diveCd: 0, dive: null, tgt: null, retarget: 0, hidden: false, ctxAlt: 12,
    st: { hits: 0, dives: 0, hitBy: 0, dodges: 0, highT: 0, lowT: 0 } }
}

function valueAt(g, x, y, me, dMine, passQ) {
  const i = Math.floor(x + g.off), j = Math.floor(y + g.off)
  if (i < 0 || j < 0 || i >= g.N || j >= g.N) return -1
  const idx = j * g.N + i
  if (!g.inside[idx]) return -1
  if (g.frozen[idx]) return 0
  const ow = g.owner[idx]
  if (ow === -1) return 1
  if (ow === me) return g.inten[idx] < dMine * 0.6 ? 0.25 : 0
  return g.inten[idx] <= passQ ? 1.15 : 0.45
}

function chooseTarget(g, b, sun) {
  const k = kOf(b.z), d = darkOf(b.z)
  const passQ = P.Rp * d * (P.L0 * k / P.v)
  const offx = -sun.ux * b.z * sun.cot, offy = -sun.uy * b.z * sun.cot
  const rad = P.W0 * k * 0.5 * Math.max(1, sun.sig * 0.6)
  let best = null, bestS = -1e9, bestCtx = 12
  for (let c = 0; c < 28; c++) {
    let px, py
    if (c < 8) { const a = b.th + (c - 3.5) * 0.35; const dist = 25 + g.rand() * 45; px = b.x + offx + Math.cos(a) * dist; py = b.y + offy + Math.sin(a) * dist }
    else { const a = g.rand() * 2 * Math.PI, r = Math.sqrt(g.rand()) * g.R * 0.95; px = r * Math.cos(a); py = r * Math.sin(a) }
    let v = 0, strongEnemy = 0, neutral = 0
    for (let s = 0; s < 9; s++) {
      const ang = s * 2 * Math.PI / 8, rr = s === 0 ? 0 : rad
      const val = valueAt(g, px + Math.cos(ang) * rr, py + Math.sin(ang) * rr, b.id, d, passQ)
      v += val
      if (val === 0.45) strongEnemy++
      if (val === 1) neutral++
    }
    const bx = px - offx, by = py - offy
    const dist = Math.hypot(bx - b.x, by - b.y)
    const dang = Math.abs(((Math.atan2(by - b.y, bx - b.x) - b.th + 3 * Math.PI) % (2 * Math.PI)) - Math.PI)
    // pénalité si la position oiseau requise est hors arène
    const outPen = Math.hypot(bx, by) > g.R - 10 ? 3 : 0
    const sc = v / (1 + dist / 60) - dang * 0.4 - outPen
    if (sc > bestS) { bestS = sc; best = { x: bx, y: by }; bestCtx = strongEnemy >= 3 ? 3 : neutral >= 5 ? 20 : 11 }
  }
  b.ctxAlt = bestCtx
  return best
}

const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }

function lockable(g, a, v, sun) {
  if (v.id === a.id || v.stun > 0 || v.immune > 0 || v.hidden) return false
  const dh = a.z - v.z
  if (dh < 5 || dh > g.o.dhMax) return false
  const dist = Math.hypot(v.x - a.x, v.y - a.y)
  const tgo = dist / 30 // approx
  if (tgo < 0.6 || tgo > 1.5) return false
  if (dh / Math.max(tgo, 0.6) > 22) return false
  return Math.abs(wrap(Math.atan2(v.y - a.y, v.x - a.x) - a.th)) < 80 * D
}
// P(touche) selon réaction (issue de dive3b.mjs, commit 0.5 s)
function hitProb(react) {
  const tbl = [[0.2, 0.08], [0.3, 0.16], [0.4, 0.65], [0.5, 0.94], [9, 0.78]]
  if (react <= 0.2) return 0.08
  for (let i = 1; i < tbl.length; i++) if (react <= tbl[i][0]) {
    const [r0, p0] = tbl[i - 1], [r1, p1] = tbl[i]
    if (r1 === 9) return p0
    return p0 + (p1 - p0) * (react - r0) / (r1 - r0)
  }
  return 0.78
}

export function step(g, birds, stats) {
  const dt = g.o.dt, t = g.t
  const sun = sunAt(g, t)
  if (Math.round(t / dt) % 7 === 0 || t > g.o.T) computeFrozen(g, sun, t)
  for (const b of birds) {
    b.hidden = birdHidden(g, b, sun)
    if (b.stun > 0) {
      b.stun -= dt
      b.z = Math.max(P.hMin, b.z - 12 * dt); b.v = Math.max(8, b.v - 10 * dt)
      if (b.stun <= 0) { b.immune = b.stunBy >= 0 ? P.immune : 0; b.v = P.v }
    } else if (b.dive) {
      const v = birds[b.dive.tgt]
      b.dive.t += dt
      const tt = Math.max(0.05, b.dive.T - b.dive.t)
      b.th = Math.atan2(v.y - b.y, v.x - b.x)
      b.v = Math.min(32, b.v + 30 * dt)
      b.z = Math.max(P.hMin, b.z - Math.max(0, (b.z - v.z - 1)) / tt * dt)
      if (b.dive.t >= b.dive.T) {
        if (b.dive.hit && !v.hidden && v.stun <= 0 && v.immune <= 0) {
          v.stun = P.stun; v.stunBy = b.id; v.st.hitBy++; b.st.hits++; b.z = Math.min(P.hMax, b.z + P.rebound); stats.hits++
          if (g.o.trailSteal > 0) {
            const tick = Math.round(g.t / g.o.dt), win = Math.round(g.o.trailSteal / g.o.dt)
            let n = 0
            for (let idx = 0; idx < g.owner.length; idx++) if (g.owner[idx] === v.id && !g.frozen[idx] && tick - g.lastPaint[idx] <= win) { g.owner[idx] = b.id; n++ }
            stats.stolen = (stats.stolen || 0) + n
          }
        } else { v.st.dodges += 1; b.v = 12; if (g.o.missStun > 0) { b.stun = g.o.missStun; b.stunBy = -1; b.st.crash = (b.st.crash || 0) + 1; stats.crash = (stats.crash || 0) + 1 } }
        b.dive = null; b.diveCd = 1.0
      }
    } else {
      if (b.immune > 0) b.immune -= dt
      if (b.diveCd > 0) b.diveCd -= dt
      // cible de peinture
      b.retarget -= dt
      if (b.retarget <= 0 || !b.tgt) { b.tgt = chooseTarget(g, b, sun); b.retarget = 0.5 }
      let want = Math.atan2(b.tgt.y - b.y, b.tgt.x - b.x)
      // évitement des tours
      for (const tw of g.towers) {
        const dx = b.x - tw.x, dy = b.y - tw.y, dd = Math.hypot(dx, dy)
        if (dd < tw.rs + 14) { const away = Math.atan2(dy, dx); want = want + wrap(away - want) * 0.6 }
      }
      const rr = Math.hypot(b.x, b.y)
      if (rr > g.R - 12) want = Math.atan2(-b.y, -b.x)
      // altitude
      const altT = b.pol.alt(g, b, t)
      const climbing = b.z < altT - 1
      const turnMax = climbing ? P.turnClimb : P.turn
      const err = wrap(want - b.th)
      b.th += Math.sign(err) * Math.min(Math.abs(err), turnMax * dt)
      const maintaining = !climbing && b.z > P.hMin + 1 && g.o.maintainCost
      const vt = climbing ? P.vClimb : maintaining ? P.v - (P.v - P.vClimb) * P.sink / (P.climb + P.sink) : P.v
      b.v += Math.sign(vt - b.v) * Math.min(Math.abs(vt - b.v), 12 * dt)
      if (climbing) b.z = Math.min(P.hMax, b.z + P.climb * dt)
      else if (b.z > altT + 1) b.z = Math.max(P.hMin, b.z - Math.max(P.sink, 6) * dt) // descente volontaire (piqué libre court)
      else b.z = Math.max(P.hMin, b.z - P.sink * dt * (b.z > altT - 1 ? 0 : 1))
      if (b.z < altT + 1 && b.z > altT - 1) { /* maintien : petits battements */ }
      // piqué
      if (g.o.dives && b.pol.dives && b.diveCd <= 0) {
        for (const v of birds) if (lockable(g, b, v, sun)) {
          const dist = Math.hypot(v.x - b.x, v.y - b.y)
          const T = Math.max(0.6, dist / 30)
          const react = v.skill.dodge ? v.skill.react + 0.06 * gaussian(g) + 0.05 : 9
          const hit = g.rand() < hitProb(react)
          b.dive = { tgt: v.id, t: 0, T, hit }; b.st.dives++; stats.dives++
          break
        }
      }
    }
    b.x += Math.cos(b.th) * b.v * dt; b.y += Math.sin(b.th) * b.v * dt
    // collisions tours
    for (const tw of g.towers) {
      const dx = b.x - tw.x, dy = b.y - tw.y, dd = Math.hypot(dx, dy)
      if (dd < tw.rs + 2) { b.x = tw.x + dx / dd * (tw.rs + 2); b.y = tw.y + dy / dd * (tw.rs + 2) }
    }
    const rr = Math.hypot(b.x, b.y)
    if (rr > g.R + 4) { b.x *= (g.R + 4) / rr; b.y *= (g.R + 4) / rr }
    if (b.z >= 17) b.st.highT += dt
    if (b.z <= 6) b.st.lowT += dt
  }
  // peinture
  for (const b of birds) {
    if (b.hidden) continue
    const fp = footprint(b, sun)
    if (b.stun > 0 && (!g.o.fallPaint || b.stunBy < 0)) continue
    const painter = b.stun > 0 ? b.stunBy : b.id
    rasterFootprint(g, fp, sun, painter)
  }
  applyPaint(g, stats)
  g.t += dt
}
function gaussian(g) { let u = 0, v = 0; while (!u) u = g.rand(); while (!v) v = g.rand(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v) }

export function shares(g, n) {
  const c = new Array(n).fill(0)
  let strong = new Array(n).fill(0)
  for (let idx = 0; idx < g.owner.length; idx++) if (g.inside[idx] && g.owner[idx] >= 0) { c[g.owner[idx]]++; if (g.inten[idx] >= 0.5) strong[g.owner[idx]]++ }
  return { share: c.map((x) => x / g.insideCount), strong: strong.map((x) => x / g.insideCount) }
}

export function runRound(policies, opts = {}, trace = false) {
  const g = makeGame({ R: opts.R || 130, seed: opts.seed || 1, ...opts })
  const n = policies.length
  const birds = policies.map((p, i) => makeBird(g, i, n, p, opts.skills?.[i]))
  const stats = { newCells: new Array(n).fill(0), flips: new Array(n).fill(0), lost: new Array(n).fill(0), hits: 0, dives: 0 }
  const tl = []
  let leader = -1, leadChanges = 0, lastLeadChange = 0
  const end = g.o.T + (2 * g.R) / g.o.frontSpeed + 0.5
  let at120 = null
  while (g.t < end) {
    step(g, birds, stats)
    if (Math.round(g.t / g.o.dt) % 15 === 0) {
      const s = shares(g, n)
      const lead = s.share.indexOf(Math.max(...s.share))
      if (lead !== leader) { if (leader !== -1) { leadChanges++; lastLeadChange = g.t } leader = lead }
      let frozenC = 0, neutral = 0
      for (let idx = 0; idx < g.owner.length; idx++) if (g.inside[idx]) { if (g.frozen[idx]) frozenC++; if (g.owner[idx] === -1) neutral++ }
      if (trace && Math.round(g.t) % 10 === 0) tl.push({ t: Math.round(g.t), frozen: frozenC / g.insideCount, neutral: neutral / g.insideCount, share: s.share.map((x) => +x.toFixed(3)) })
      if (at120 === null && g.t >= 120) at120 = s.share
    }
  }
  const fin = shares(g, n)
  const argmax = (a) => a.indexOf(Math.max(...a))
  return { final: fin.share, strong: fin.strong, stats, birds, leadChanges, lastLeadChange, tl, at120, lead120kept: argmax(at120) === argmax(fin.share), margin: (() => { const s = [...fin.share].sort((a, b) => b - a); return s[0] - s[1] })() }
}

// ---------- CLI ----------
if (import.meta.url === `file://${process.argv[1]}`) {
  const which = process.argv[2] || 'alt'
  const runs = +(process.argv[3] || 16)
  const R = +(process.argv[4] || 130)
  const matchups = {
    alt: ['low', 'mid', 'high', 'adapt'],
    altNoDive: ['low', 'mid', 'high', 'adapt'],
    hunt: ['low', 'mid', 'hunter', 'adaptHunter'],
    ctx: ['context', 'low', 'high', 'adaptHunter'],
    inv: ['adapt', 'adaptInv', 'mid', 'low'],
    two: ['adaptHunter', 'low'],
    two2: ['high', 'low'],
    two3: ['hunter', 'low'],
    six: ['low', 'mid', 'high', 'adapt', 'hunter', 'context'],
    mirror4: ['context', 'context', 'context', 'context'],
  }
  const pols = matchups[which] || which.split(',')
  const n = pols.length
  const agg = pols.map(() => ({ s: 0, w: 0, strong: 0, s120: 0 }))
  let lc = 0, llc = 0, hits = 0, dives = 0
  let lastTl = null
  const t0 = Date.now()
  for (let r = 0; r < runs; r++) {
    // rotation des positions de départ
    const rot = pols.map((_, i) => pols[(i + r) % n])
    const extra = process.argv[5] ? JSON.parse(process.argv[5]) : {}
    if (extra.P) Object.assign(P, extra.P)
    const res = runRound(rot, { R, seed: 1000 + r, dives: which !== 'altNoDive', ...extra }, r === 0)
    if (r === 0) lastTl = res.tl
    const best = Math.max(...res.final)
    rot.forEach((p, i) => {
      const cnt = pols.filter((x) => x === p).length
      const a = agg[pols.indexOf(p)]
      a.s += res.final[i] / cnt; a.strong += res.strong[i] / cnt; a.s120 += res.at120[i] / cnt
      if (res.final[i] === best) a.w++
    })
    globalThis.__stolen = (globalThis.__stolen || 0) + (res.stats.stolen || 0)
    globalThis.__k120 = (globalThis.__k120 || 0) + (res.lead120kept ? 1 : 0); globalThis.__margin = (globalThis.__margin || []); globalThis.__margin.push(res.margin)
    globalThis.__crash = (globalThis.__crash || 0) + (res.stats.crash || 0)
    lc += res.leadChanges; llc += res.lastLeadChange; hits += res.stats.hits; dives += res.stats.dives
  }
  console.log(`matchup=${which} runs=${runs} R=${R} (${((Date.now() - t0) / 1000).toFixed(1)} s)`)
  pols.forEach((p, i) => pols.indexOf(p) === i && console.log(`${p.padEnd(12)} part moy=${(100 * agg[i].s / runs).toFixed(1)}%  (à t=120: ${(100 * agg[i].s120 / runs).toFixed(1)}%)  forte(I>=.5)=${(100 * agg[i].strong / runs).toFixed(1)}%  victoires=${agg[i].w}`))
  console.log(`dernier changement de leader moyen t=${(llc/runs).toFixed(0)}s ; volé/manche=${((globalThis.__stolen||0) / runs).toFixed(0)} cellules ; changements de leader/manche=${(lc / runs).toFixed(1)}  dernier changement moyen à t=${(llc / runs).toFixed(0)}s  piqués/manche=${(dives / runs).toFixed(1)} touches=${(hits / runs).toFixed(1)} crashs=${((globalThis.__crash||0)/runs).toFixed(1)}`)
  { const m = globalThis.__margin.sort((a,b)=>a-b); console.log(`leader à t=120 gagne: ${(100*globalThis.__k120/runs).toFixed(0)}% ; écart 1er-2e médian=${(100*m[Math.floor(m.length/2)]).toFixed(1)} pts, <2 pts dans ${(100*m.filter(x=>x<0.02).length/m.length).toFixed(0)}% des manches`) }
  if (lastTl) for (const e of lastTl) console.log(`  t=${e.t} gelé=${(100 * e.frozen).toFixed(0)}% neutre=${(100 * e.neutral).toFixed(0)}% parts=${e.share.map((x) => (100 * x).toFixed(0)).join('/')}`)
}
