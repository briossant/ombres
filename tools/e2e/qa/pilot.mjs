// Pilotes « humains » scriptés pour les scénarios de QA : un téléphone (touches CDP multi-points)
// ou un groupe du clavier du PC. Ils lisent l'état de la simulation sur la page du PC (?debug)
// et jouent grossièrement : errance dans l'arène, alternance haut/bas, PIQUER quand une cible
// est verrouillée, COUP D'AILE au clac quand on les pique.
import { sleep, center } from './lib.mjs'

const birdState = (pc, slot) =>
  pc.evaluate(slot => {
    const r = window.__ombres?.runner
    const st = r?.sim?.state
    if (!st || r.phase !== 'round' && r.phase !== 'lobby') return null
    const b = st.bySlot[slot]
    if (!b) return null
    const threat = st.birds.find(o => o.diveTarget === slot && (o.dive === 'committed' || o.dive === 'guided'))
    return { x: b.x, y: b.y, z: b.z, lock: b.lockTarget, dive: b.dive, cd: b.diveCooldown, threat: !!threat, stun: b.stun, a: st.arena.a, b: st.arena.b, t: st.sun.t, T: st.sun.T, phase: st.sun.phase, mode: st.config.mode }
  }, slot)

class Wander {
  constructor(seed) {
    this.s = seed
    this.tx = 0
    this.ty = 0
    this.until = 0
    this.lowUntil = 0
    this.low = false
  }
  rnd() {
    this.s = (this.s * 1103515245 + 12345) & 0x7fffffff
    return this.s / 0x7fffffff
  }
  /** Cap (unité, repère monde) et PLONGER voulu. */
  decide(b, now) {
    if (now > this.until || Math.hypot(this.tx - b.x, this.ty - b.y) < 12) {
      this.tx = (this.rnd() * 2 - 1) * b.a * 0.65
      this.ty = (this.rnd() * 2 - 1) * b.b * 0.65
      // Grande Ombre : filer vers l'est
      if (b.phase === 'greatShadow') this.tx = b.a * (0.5 + 0.4 * this.rnd())
      this.until = now + 2500 + this.rnd() * 3000
    }
    if (now > this.lowUntil) {
      this.low = !this.low
      this.lowUntil = now + (this.low ? 3000 + this.rnd() * 4000 : 2000 + this.rnd() * 3000)
    }
    const dx = this.tx - b.x
    const dy = this.ty - b.y
    const d = Math.hypot(dx, dy) || 1
    return { dx: dx / d, dy: dy / d, dive: this.low || (b.lock >= 0 && b.cd === 0) }
  }
}

const tp = (id, x, y) => ({ x, y, id, radiusX: 6, radiusY: 6, force: 1 })

/** Pilote d'un téléphone : garde le pouce sur le joystick, appuie PLONGER / COUP D'AILE. */
export class PhonePilot {
  constructor(ph, pc, getSlot, seed = 7) {
    this.ph = ph
    this.pc = pc
    this.getSlot = getSlot
    this.w = new Wander(seed)
    this.on = false
    this.stats = { dives: 0, flaps: 0, ticks: 0 }
  }
  async start() {
    this.on = true
    this.loop = this.run().catch(e => console.log(`[pilot ${this.ph.tag}] ${e.message}`))
  }
  async stop() {
    this.on = false
    await this.loop
  }
  async run() {
    const cdp = this.ph.cdp
    let pts = new Map()
    let lastFlap = 0
    // CDP : touchEnd ne porte aucun point (relâche tout) ; relâcher UN doigt = touchMove sans lui.
    const send = type => {
      if (type === 'touchEnd' && pts.size) type = 'touchMove'
      return cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [...pts.values()] })
    }
    while (this.on) {
      const b = await birdState(this.pc, this.getSlot()).catch(() => null)
      const zone = await this.ph.page.locator('.stick-zone').first().boundingBox().catch(() => null)
      if (!b || !zone) {
        if (pts.size) {
          pts.clear()
          await send('touchEnd').catch(() => {})
        }
        await sleep(300)
        continue
      }
      const now = Date.now()
      const d = this.w.decide(b, now)
      const sx = zone.x + zone.width * 0.45
      const sy = zone.y + zone.height * 0.55
      const R = 60
      if (!pts.has(1)) {
        pts.set(1, tp(1, sx, sy))
        await send('touchStart')
        await sleep(30)
      }
      pts.set(1, tp(1, sx + d.dx * R, sy - d.dy * R))
      await send('touchMove')
      const diving = pts.has(2)
      if (d.dive && !diving) {
        const c = await center(this.ph.page, '.act--dive').catch(() => null)
        if (c) {
          pts.set(2, tp(2, c.x, c.y))
          await send('touchStart')
          this.stats.dives++
        }
      } else if (!d.dive && diving) {
        pts.delete(2)
        await send('touchEnd')
      }
      if (b.threat && now - lastFlap > 1500) {
        const c = await center(this.ph.page, '.act--flap').catch(() => null)
        if (c) {
          lastFlap = now
          pts.set(3, tp(3, c.x, c.y))
          await send('touchStart')
          await sleep(50)
          pts.delete(3)
          await send('touchEnd')
          this.stats.flaps++
        }
      }
      this.stats.ticks++
      await sleep(120)
    }
    if (pts.size) {
      pts.clear()
      await send('touchEnd').catch(() => {})
    }
  }
}

const KB = {
  1: { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', dive: 'Space', flap: 'ShiftLeft' },
  2: { up: 'KeyI', down: 'KeyK', left: 'KeyJ', right: 'KeyL', dive: 'AltRight', flap: 'Semicolon' },
}

/** Pilote d'un groupe du clavier du PC (8 secteurs). */
export class KeyboardPilot {
  constructor(pc, group, getSlot, seed = 11) {
    this.pc = pc
    this.k = KB[group]
    this.getSlot = getSlot
    this.w = new Wander(seed)
    this.on = false
    this.held = new Set()
  }
  async start() {
    this.on = true
    this.loop = this.run().catch(e => console.log(`[kb pilot] ${e.message}`))
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
  async run() {
    let lastFlap = 0
    while (this.on) {
      const b = await birdState(this.pc, this.getSlot()).catch(() => null)
      if (!b) {
        for (const c of [...this.held]) await this.set(c, false)
        await sleep(300)
        continue
      }
      const d = this.w.decide(b, Date.now())
      await this.set(this.k.right, d.dx > 0.38)
      await this.set(this.k.left, d.dx < -0.38)
      await this.set(this.k.up, d.dy > 0.38)
      await this.set(this.k.down, d.dy < -0.38)
      await this.set(this.k.dive, d.dive)
      if (b.threat && Date.now() - lastFlap > 1500) {
        lastFlap = Date.now()
        await this.pc.keyboard.press(this.k.flap)
      }
      await sleep(120)
    }
    for (const c of [...this.held]) await this.set(c, false)
  }
}
