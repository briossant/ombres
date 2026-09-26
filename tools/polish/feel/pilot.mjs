// Pilote clavier « joueur appliqué » : peint au ras du sable là où ça rapporte, remonte pour chasser
// un oiseau bas proche, pique dès que le chevron est posé (PLONGER tenu jusqu'à la résolution),
// esquive au COUP D'AILE après le clac avec un temps de réaction humain, file vers l'est à la
// Grande Ombre. La décision (cap, étage) est calculée dans la page du PC (lecture de la sim ?debug).
import { sleep } from './lib.mjs'

const KB = {
  1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', dive: 'Space', flap: 'ShiftLeft' },
  2: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', dive: 'AltRight', flap: 'Semicolon' },
}

export async function installBrain(pc) {
  await pc.evaluate(() => {
    if (window.__feelBrain) return
    const o = window.__ombres
    const mem = {}
    const threats = {}
    o.simEvents.on(e => {
      if (e.type === 'diveCommit') threats[e.target] = { w: Date.now(), hunter: e.hunter, kind: 'commit' }
      if (e.type === 'diveWindup') threats[e.target] = { w: Date.now(), hunter: e.hunter, kind: 'windup' }
    })
    const wrap = a => Math.atan2(Math.sin(a), Math.cos(a))
    window.__feelBrain = (slot, opts) => {
      const r = o.runner
      const st = r?.sim?.state
      if (!st || (r.phase !== 'round' && r.phase !== 'lobby')) return null
      const b = st.bySlot[slot]
      if (!b) return null
      const m = (mem[slot] = mem[slot] ?? { mode: 'paint', modeUntil: 0, huntTarget: -1, nextHunt: 8, lastT: 0 })
      const t = st.sun.t
      const g = st.grid
      const A = st.arena.a
      const B = st.arena.b
      const sunPhase = st.sun.phase
      const cellVal = (x, y, strong) => {
        const c = Math.floor((x - g.x0) / g.cellW)
        const rr = Math.floor((y - g.y0) / g.cellH)
        if (c < 0 || rr < 0 || c >= g.cols || rr >= g.rows) return -0.3
        const i = rr * g.cols + c
        if (!g.inArena[i]) return -0.3
        if (g.frozen[i]) return 0
        const own = g.owner[i]
        const lv = g.level[i]
        if (own === 0) return 1.2
        if (own === slot + 1) return strong && lv === 1 ? 0.35 : 0
        if (!strong && lv === 2) return 0
        return st.crownSlot === own - 1 ? 1.25 : 1.0
      }
      // ─── menace ───
      const th = threats[slot]
      let threat = null
      if (th && Date.now() - th.w < 1600) {
        const h = st.bySlot[th.hunter]
        if (h && h.diveTarget === slot && h.dive !== 'none') threat = { ...th, hx: h.x, hy: h.y }
      }
      // ─── mode (chasse / peinture) ───
      const preyOk = p => p.slot !== slot && p.stun === 0 && p.immune === 0 && !p.hidden && !p.inNight && p.z < 9
      if (m.mode === 'paint' && t > m.nextHunt && opts.hunt && sunPhase !== 'greatShadow' && b.stun === 0) {
        let best = -1
        let bd = 55
        for (const p of st.birds) {
          if (!preyOk(p)) continue
          const d = Math.hypot(p.x - b.x, p.y - b.y)
          if (d < bd) {
            bd = d
            best = p.slot
          }
        }
        if (best >= 0) {
          m.mode = 'hunt'
          m.huntTarget = best
          m.modeUntil = t + 9
        } else m.nextHunt = t + 3
      }
      if (m.mode === 'hunt') {
        const p = st.bySlot[m.huntTarget]
        if (!p || !preyOk(p) || t > m.modeUntil || sunPhase === 'greatShadow') {
          if (b.dive === 'none') {
            m.mode = 'paint'
            m.nextHunt = t + opts.huntEvery * (0.7 + Math.random() * 0.6)
          }
        }
      }
      // ─── cap ───
      let hx = Math.cos(b.heading)
      let hy = Math.sin(b.heading)
      let dive = true
      if (m.mode === 'hunt') {
        const p = st.bySlot[m.huntTarget]
        if (b.dive !== 'none') {
          dive = true // tenir PLONGER jusqu'à la résolution (relâcher = feinte)
        } else if (b.lockTarget >= 0 && b.diveCooldown === 0) {
          dive = true // chevron posé : on pique
        } else {
          dive = false // remonter pour passer au-dessus
        }
        if (p) {
          const lead = 0.6
          const tx = p.x + p.vx * lead
          const ty = p.y + p.vy * lead
          const d = Math.hypot(tx - b.x, ty - b.y) || 1
          hx = (tx - b.x) / d
          hy = (ty - b.y) / d
        }
      } else {
        const sx = b.shadow.cx
        const sy = b.shadow.cy
        const rr = Math.max(4, b.shadow.r)
        const v = Math.max(10, b.speed)
        let best = -1e9
        for (let k = 0; k < 16; k++) {
          const h = (k / 16) * Math.PI * 2
          const c = Math.cos(h)
          const s = Math.sin(h)
          let val = 0
          for (const tt of [0.6, 1.2, 1.9, 2.8, 4.0]) {
            const px = sx + c * v * tt
            const py = sy + s * v * tt
            for (const off of [-0.6, 0, 0.6]) val += cellVal(px - s * off * rr, py + c * off * rr, true) * (tt < 3 ? 1 : 0.6)
          }
          const bx = b.x + c * v * 1.8
          const by = b.y + s * v * 1.8
          const rho = (bx / A) ** 2 + (by / B) ** 2
          if (rho > 0.72) val -= 40 * (rho - 0.72)
          val -= 1.2 * Math.abs(wrap(h - b.heading))
          if (sunPhase === 'greatShadow') val += 6 * c
          if (val > best) {
            best = val
            hx = c
            hy = s
          }
        }
        dive = true
      }
      // ─── esquive : direction perpendiculaire à l'arrivée du chasseur ───
      let flapDir = null
      if (threat) {
        const dx = b.x - threat.hx
        const dy = b.y - threat.hy
        const d = Math.hypot(dx, dy) || 1
        const side = (m.side = m.side ?? (Math.random() < 0.5 ? 1 : -1))
        flapDir = { x: (-dy / d) * side, y: (dx / d) * side }
      }
      return {
        hx,
        hy,
        dive,
        mode: m.mode,
        lock: b.lockTarget,
        myDive: b.dive,
        threat: threat ? { w: threat.w, kind: threat.kind, hunter: threat.hunter } : null,
        flapDir,
        flapReady: b.flapCooldown === 0,
        t,
        z: b.z,
      }
    }
  })
}

export class SmartKeyboardPilot {
  constructor(pc, group, getSlot, { reactMs = [220, 320], hunt = true, huntEvery = 14, log = null } = {}) {
    this.pc = pc
    this.k = KB[group]
    this.getSlot = getSlot
    this.reactMs = reactMs
    this.hunt = hunt
    this.huntEvery = huntEvery
    this.on = false
    this.held = new Set()
    this.handled = new Set()
    this.stats = { dives: 0, flaps: 0, flapLate: [], huntModes: 0 }
    this.log = log ?? (() => {})
  }
  async start() {
    this.on = true
    this.loop = this.run().catch(e => console.log(`[smart pilot] ${e.stack}`))
  }
  async stop() {
    this.on = false
    await this.loop
  }
  async set(code, down) {
    if (down && !this.held.has(code)) {
      this.held.add(code)
      await this.pc.keyboard.down(code)
    } else if (!down && this.held.has(code)) {
      this.held.delete(code)
      await this.pc.keyboard.up(code)
    }
  }
  async steerTo(x, y) {
    await this.set(this.k.right, x > 0.38)
    await this.set(this.k.left, x < -0.38)
    await this.set(this.k.up, y > 0.38)
    await this.set(this.k.down, y < -0.38)
  }
  async run() {
    let prevMode = 'paint'
    let prevDive = false
    while (this.on) {
      const d = await this.pc.evaluate(([s, o]) => window.__feelBrain?.(s, o) ?? null, [this.getSlot(), { hunt: this.hunt, huntEvery: this.huntEvery }]).catch(() => null)
      if (!d) {
        for (const c of [...this.held]) await this.set(c, false)
        await sleep(200)
        continue
      }
      if (d.mode !== prevMode && d.mode === 'hunt') this.stats.huntModes++
      prevMode = d.mode
      // esquive au clac, avec un temps de réaction humain
      if (d.threat && d.threat.kind === 'commit' && !this.handled.has(d.threat.w)) {
        this.handled.add(d.threat.w)
        const react = this.reactMs[0] + Math.random() * (this.reactMs[1] - this.reactMs[0])
        const wait = react - (Date.now() - d.threat.w)
        if (wait > 0) await sleep(wait)
        if (d.flapDir) await this.steerTo(d.flapDir.x, d.flapDir.y)
        await this.pc.keyboard.press(this.k.flap)
        this.stats.flaps++
        this.stats.flapLate.push(Date.now() - d.threat.w)
        await sleep(90)
        continue
      }
      await this.steerTo(d.hx, d.hy)
      if (d.dive && !prevDive && d.mode === 'hunt') this.stats.dives++
      prevDive = d.dive
      await this.set(this.k.dive, d.dive)
      await sleep(45)
    }
    for (const c of [...this.held]) await this.set(c, false)
  }
}
