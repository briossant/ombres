// Micro-simulation du piqué : fenêtre d'esquive (grand battement) selon le moment d'appui. node dive-sim.mjs
// Piqué v3 : phase finale balistique (tgo < tCommit), esquive = grand battement (impulsion latérale+verticale)
const D = Math.PI / 180
const base = {
  vGlide: 20, vDiveH: 32, vzMax: 22, vzMin: 4, ramp: 0.2,
  turnVictim: 100 * D, turnDive: 110 * D, tCommit: 0.35,
  hitR: 4.5, hMin: 3, maxDur: 1.8, dt: 1 / 120,
  tMin: 0.6, tMax: 1.5,
  dashV: 12, dashUp: 6, dashDur: 0.3,
}
const rnd = (a, b) => a + Math.random() * (b - a)
const wrap = (a) => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a }
function intercept(A, V, va) {
  const rx = V.x - A.x, ry = V.y - A.y
  const vx = V.vx, vy = V.vy
  const a = vx * vx + vy * vy - va * va, b = 2 * (rx * vx + ry * vy), c = rx * rx + ry * ry
  const disc = b * b - 4 * a * c
  if (disc < 0) return Infinity
  const s = Math.sqrt(disc)
  const ts = [(-b - s) / (2 * a), (-b + s) / (2 * a)].filter((t) => t > 0)
  return ts.length ? Math.min(...ts) : Infinity
}
function canLock(A, V, c) {
  const dh = A.z - V.z
  if (dh < 5) return false
  const ti = intercept(A, V, c.vDiveH * 0.9)
  if (!(ti >= c.tMin && ti <= c.tMax)) return false
  if (dh / ti > c.vzMax) return false
  return Math.abs(wrap(Math.atan2(V.y - A.y, V.x - A.x) - A.th)) <= 80 * D
}
function setV(V) { V.vx = Math.cos(V.th) * V.v; V.vy = Math.sin(V.th) * V.v }
function trial(A, V, pol, c) {
  // pol: { kind: 'none'|'dash'|'juke', at: fn(tgoTrue)->bool }  on déclenche quand le temps restant estimé passe sous 'lead'
  let t = 0, committed = false, dashT = -1, dashDir = 0, jukeDir = 0, juking = false
  A.v = c.vGlide; A.vz = 0; A.vx = Math.cos(A.th) * A.v; A.vy = Math.sin(A.th) * A.v
  setV(V); V.dvx = 0; V.dvy = 0; V.dvz = 0
  const triggerAt = pol.kind === 'none' ? -1 : pol.warnReact // secondes après le début
  while (t < c.maxDur) {
    const hd = Math.hypot(V.x - A.x, V.y - A.y)
    const ti = intercept(A, V, A.v)
    const tt = Math.max(0.02, isFinite(ti) ? ti : hd / A.v)
    if (!committed) {
      if (tt < c.tCommit) committed = true
      const px = V.x + V.vx * tt, py = V.y + V.vy * tt
      const err = wrap(Math.atan2(py - A.y, px - A.x) - A.th)
      A.th += Math.sign(err) * Math.min(Math.abs(err), c.turnDive * c.dt)
      A.v = Math.min(c.vDiveH, A.v + 30 * c.dt)
      const need = (A.z - V.z - 1.0) / tt
      A.vz = -Math.max(c.vzMin, Math.min(need, c.vzMax)) * Math.min(1, t / c.ramp)
    }
    A.x += Math.cos(A.th) * A.v * c.dt; A.y += Math.sin(A.th) * A.v * c.dt; A.z = Math.max(c.hMin, A.z + A.vz * c.dt)
    // victime
    if (pol.kind !== 'none' && t >= triggerAt && dashT < 0 && !juking) {
      const ang = Math.atan2(A.y - V.y, A.x - V.x)
      const side = wrap(ang - V.th) > 0 ? -1 : 1 // s'écarter du côté opposé
      if (pol.kind === 'dash') { dashT = 0; dashDir = V.th + side * Math.PI / 2 }
      if (pol.kind === 'juke') { juking = true; jukeDir = side }
    }
    if (juking) { V.th += jukeDir * c.turnVictim * c.dt }
    if (dashT >= 0 && dashT < c.dashDur) { V.dvx = Math.cos(dashDir) * c.dashV; V.dvy = Math.sin(dashDir) * c.dashV; V.dvz = c.dashUp; dashT += c.dt; V.th += (dashDir > V.th ? 1 : -1) * 0 }
    else { V.dvx = 0; V.dvy = 0; V.dvz = 0 }
    setV(V)
    V.x += (V.vx + V.dvx) * c.dt; V.y += (V.vy + V.dvy) * c.dt; V.z += V.dvz * c.dt
    const d3 = Math.hypot(A.x - V.x, A.y - V.y, A.z - V.z)
    if (d3 <= c.hitR && A.z > V.z - 1) return { hit: true, t }
    if (A.z <= c.hMin + 0.01 && V.z > A.z + 2) return { hit: false, t }
    t += c.dt
  }
  return { hit: false, t }
}
function sample(dh, c) {
  for (;;) {
    const V = { x: 0, y: 0, z: c.hMin + rnd(0, 2), th: rnd(-Math.PI, Math.PI), v: c.vGlide }; setV(V)
    const r = rnd(0, 60), a = rnd(-Math.PI, Math.PI)
    const A = { x: r * Math.cos(a), y: r * Math.sin(a), z: V.z + dh, th: rnd(-Math.PI, Math.PI) }
    if (canLock(A, V, c)) return { A, V }
  }
}
// on mesure la P(touche) en fonction du moment d'appui exprimé en "temps avant impact" (tImpact - tAppui),
// en rejouant la même situation sans esquive pour connaître tImpact.
function study(c, kind, n = 6000) {
  const bins = new Map()
  let base = 0, tot = 0
  for (let i = 0; i < n; i++) {
    const s = sample(8 + Math.random() * 12, c)
    const clone = (o) => JSON.parse(JSON.stringify(o))
    const r0 = trial(clone(s.A), clone(s.V), { kind: 'none' }, c)
    tot++
    if (!r0.hit) continue
    base++
    const lead = Math.random() * 0.8 // appui entre 0 et 0.8 s avant l'impact
    const at = r0.t - lead
    if (at < 0) continue
    const r = trial(clone(s.A), clone(s.V), { kind, warnReact: at }, c)
    const b = Math.floor(lead / 0.1) / 10
    const e = bins.get(b) || [0, 0]; e[0] += r.hit ? 1 : 0; e[1]++; bins.set(b, e)
  }
  return { base: base / tot, bins: [...bins.entries()].sort((a, b) => a[0] - b[0]) }
}
for (const [lab, o] of [["FINAL dash18 hit4 commit0.5", { dashV: 18, hitR: 4, tCommit: 0.5 }]]) {
  const c = { ...base, ...o }
  for (const kind of ['dash']) {
    const r = study(c, kind)
    console.log(`\n[${lab}] esquive=${kind}  P(touche sans esquive)=${(100 * r.base).toFixed(0)}%`)
    console.log('  appui X s avant impact -> P(touche) : ' + r.bins.map(([b, [h, n]]) => `${b.toFixed(1)}:${(100 * h / n).toFixed(0)}%`).join('  '))
  }
}
