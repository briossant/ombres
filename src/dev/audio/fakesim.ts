// Simulation factice pour la page de dev audio : un état conforme à SimState (oiseaux qui
// volent, montent, descendent, piquent ; soleil qui se couche ; front de nuit) et les
// événements SimEvent d'une vraie manche. Déterministe (graine), pour les rendus hors ligne.
// Ce n'est PAS la simulation du jeu : juste de quoi exercer l'audio.
import { DEG, RULES } from '../../sim/rules.ts'
import type { BirdState, RoundPhase, SimConfig, SimEvent, SimMode, SimState } from '../../sim/types.ts'
import type { PlayerVisual } from '../../host/view.ts'
import { Rng } from '../../host/audio/util.ts'

export interface FakeSimOptions {
  mode?: SimMode
  birds?: number
  T?: number
  seed?: number
  /** Densité d'actions (piqués, coups d'aile…) : 1 = normal. */
  activity?: number
}

interface Brain {
  targetHeading: number
  turnTimer: number
  lowTimer: number
  wantLow: boolean
  flapCd: number
}

export class FakeSim {
  readonly state: SimState
  readonly players: PlayerVisual[]
  private rng: Rng
  private brains: Brain[] = []
  private dt = 1 / RULES.tickHz
  private nextDive = 4
  private dive: { hunter: number; target: number; stage: number; timer: number } | null = null
  private lastSlowmo = -99
  private stolen = 0
  /** Facteur de temps demandé (ralenti de touche, dernière seconde). */
  timeScale = 1
  private slowmoLeft = 0
  private lastLast = 6
  private lastCountdown = 4
  private stormTimer = 20

  constructor(readonly opts: FakeSimOptions = {}) {
    const n = opts.birds ?? 6
    const T = opts.T ?? RULES.roundSunSeconds
    this.rng = new Rng(opts.seed ?? 7)
    const mode = opts.mode ?? 'round'
    const config: SimConfig = {
      mode, seed: opts.seed ?? 7, mapId: 'parasols', birds: Array.from({ length: n }, (_, slot) => ({ slot, assist: false })),
      sunSeconds: T, countdown: mode === 'round',
    }
    const preset = RULES.arenaPresets.find(p => p.maxBirds >= n) ?? RULES.arenaPresets[RULES.arenaPresets.length - 1]!
    const birds: BirdState[] = []
    for (let slot = 0; slot < n; slot++) {
      const a = (slot / n) * Math.PI * 2
      birds.push(makeBird(slot, Math.cos(a) * preset.a * 0.45, Math.sin(a) * preset.b * 0.45, a + Math.PI))
      this.brains.push({ targetHeading: a + Math.PI, turnTimer: 1, lowTimer: 2 + slot, wantLow: slot % 2 === 0, flapCd: 3 })
    }
    const bySlot: (BirdState | undefined)[] = Array(12).fill(undefined)
    for (const b of birds) bySlot[b.slot] = b
    this.state = {
      config, tick: 0, time: 0,
      sun: { t: mode === 'round' ? -RULES.countdownSeconds : 0, u: 0, T, elevation: 88 * DEG, azimuth: 240 * DEG, shadowDirX: 0.5, shadowDirY: 0.86, cotE: 0.03, stretch: 1, paletteElevDeg: 88, phase: mode === 'round' ? 'countdown' : 'noon' },
      arena: { a: preset.a, b: preset.b, stormFrom: RULES.stormSoftFrom },
      towers: [], birds, bySlot,
      grid: {
        cols: 1, rows: 1, x0: -preset.a, y0: -preset.b, cellW: 1, cellH: 1, owner: new Uint8Array(1), level: new Uint8Array(1),
        prevOwner: new Uint8Array(1), changedAt: new Float32Array(1), frozen: new Uint8Array(1), inArena: new Uint8Array(1),
        arenaCells: 1, counts: new Int32Array(13), version: 0,
      },
      night: { active: false, dirX: 1, dirY: 0, s: -preset.a * 1.2, jag: new Float32Array(8), jagSpan: preset.b },
      crownSlot: -1, timeScaleHint: 1, stats: [], over: false,
    }
    this.players = birds.map(b => ({ slot: b.slot, colorIndex: b.slot, name: `Joueur ${b.slot + 1}`, kind: b.slot === 0 ? 'keyboard' : 'bot', assist: false }))
    this.updateSun()
  }

  /** Avance d'un tick ; renvoie les événements du tick. */
  step(): SimEvent[] {
    const s = this.state
    const ev: SimEvent[] = []
    const dt = this.dt
    s.tick++
    s.time += dt
    const sun = s.sun
    const prevPhase = sun.phase
    if (s.config.mode === 'round') {
      if (!s.over) sun.t += dt
      if (sun.t < 0) {
        const n = Math.ceil(-sun.t)
        if (n < this.lastCountdown) ev.push({ type: 'countdown', n })
        this.lastCountdown = n
      } else if (this.lastCountdown > 0) {
        this.lastCountdown = 0
        ev.push({ type: 'countdown', n: 0 })
      }
    } else sun.t += dt
    this.updateSun()
    if (sun.phase !== prevPhase) {
      ev.push({ type: 'phase', phase: sun.phase })
      if (sun.phase === 'night') ev.push({ type: 'night' })
      if (sun.phase === 'over') {
        ev.push({ type: 'over' })
        s.over = true
      }
    }
    const scale = sun.T / RULES.roundSunSeconds
    if (s.config.mode === 'round') {
      const prevT = sun.t - dt
      if (prevT < RULES.tenSecondsAt * scale && sun.t >= RULES.tenSecondsAt * scale) ev.push({ type: 'tenSeconds' })
      const left = Math.ceil(sun.T - sun.t)
      if (left <= 5 && left >= 1 && left < this.lastLast) {
        ev.push({ type: 'lastSeconds', n: left })
        this.lastLast = left
      }
      // front de nuit
      const tGS = RULES.greatShadowAt * scale
      if (sun.t >= tGS && sun.t < sun.T) {
        s.night.active = true
        const k = (sun.t - tGS) / (sun.T - tGS)
        s.night.s = -s.arena.a * 1.05 + k * s.arena.a * 2.1
      }
    }
    // ralentis (touche : 0,35× ; dernière seconde : 0,5×)
    this.slowmoLeft = Math.max(0, this.slowmoLeft - dt / Math.max(this.timeScale, 0.1))
    const lastSecond = s.config.mode === 'round' && sun.t >= sun.T - 1 && sun.t < sun.T
    this.timeScale = lastSecond ? RULES.lastSecondTimeScale : this.slowmoLeft > 0 ? RULES.hitSlowmoScale : 1
    s.timeScaleHint = this.timeScale
    if (sun.phase === 'night' || sun.phase === 'over' || sun.phase === 'countdown') return ev
    this.flyBirds(ev)
    this.actions(ev)
    return ev
  }

  private updateSun(): void {
    const sun = this.state.sun
    const T = sun.T
    const scale = T / RULES.roundSunSeconds
    sun.u = Math.min(1, Math.max(0, sun.t / T))
    const mode = this.state.config.mode
    const e = mode === 'lobby' ? RULES.lobbySunElevDeg : RULES.sunElevEndDeg + (RULES.sunElevStartDeg - RULES.sunElevEndDeg) * Math.pow(1 - sun.u, RULES.sunElevGamma)
    sun.elevation = e * DEG
    const az = RULES.sunAzEndDeg - (RULES.sunAzEndDeg - RULES.sunAzStartDeg) * Math.pow(1 - sun.u, RULES.sunAzEaseExp)
    sun.azimuth = az * DEG
    // ombre opposée au soleil (azimut depuis le nord, horaire)
    sun.shadowDirX = -Math.sin(sun.azimuth)
    sun.shadowDirY = -Math.cos(sun.azimuth)
    sun.cotE = 1 / Math.tan(sun.elevation)
    sun.stretch = Math.min(1 / Math.sin(sun.elevation), RULES.stretchMax)
    sun.paletteElevDeg = e
    let phase: RoundPhase = 'noon'
    if (mode === 'round') {
      const t = sun.t
      if (t < 0) phase = 'countdown'
      else if (t >= T + RULES.nightHoldSeconds) phase = 'over'
      else if (t >= T) phase = 'night'
      else if (t >= RULES.greatShadowAt * scale) phase = 'greatShadow'
      else if (t >= RULES.phaseSunsetAt * scale) phase = 'sunset'
      else if (t >= RULES.phaseGoldenAt * scale) phase = 'golden'
      else if (t >= RULES.phaseAfternoonAt * scale) phase = 'afternoon'
    }
    sun.phase = phase
  }

  private flyBirds(ev: SimEvent[]): void {
    const s = this.state
    const r = this.rng
    const dt = this.dt
    const sun = s.sun
    for (const b of s.birds) {
      const br = this.brains[b.slot]!
      br.turnTimer -= dt
      br.lowTimer -= dt
      br.flapCd -= dt
      b.stun = Math.max(0, b.stun - dt)
      b.immune = Math.max(0, b.immune - dt)
      if (br.turnTimer <= 0) {
        br.turnTimer = r.range(0.8, 2.5)
        // reste dans l'arène : vise vers le centre quand on s'en éloigne
        const d = Math.hypot(b.x / s.arena.a, b.y / s.arena.b)
        const toC = Math.atan2(-b.y, -b.x)
        br.targetHeading = d > 0.7 ? toC + r.range(-0.6, 0.6) : b.heading + r.range(-1.4, 1.4)
      }
      if (br.lowTimer <= 0) {
        br.lowTimer = r.range(2, 7)
        br.wantLow = !br.wantLow
      }
      if (b.dive === 'none' && b.stun <= 0) {
        let dh = br.targetHeading - b.heading
        dh = Math.atan2(Math.sin(dh), Math.cos(dh))
        const maxTurn = (b.targetLow ? RULES.turnLowDegPerS : RULES.turnHighDegPerS) * DEG * dt
        const turn = Math.max(-maxTurn, Math.min(maxTurn, dh))
        b.heading += turn
        b.turnRate = turn / dt
        b.targetLow = br.wantLow
      }
      const prevStrong = b.strong
      const targetZ = b.stun > 0 ? RULES.altLow : b.targetLow ? RULES.altLow : RULES.altHigh
      const vz = b.stun > 0 ? -RULES.descendRate : targetZ > b.z ? Math.min(RULES.climbRate, (targetZ - b.z) * 3) : Math.max(-RULES.descendRate, (targetZ - b.z) * 3)
      b.vz = b.flap > 0 ? RULES.flapImpulse * 0.3 : vz
      b.z = Math.max(RULES.altLow, Math.min(RULES.altHigh + 2, b.z + b.vz * dt))
      b.flap = Math.max(0, b.flap - dt)
      const speed = b.stun > 0 ? RULES.stunDriftSpeed : b.dive !== 'none' ? RULES.diveHSpeed : b.targetLow ? RULES.speedLow : RULES.speedHigh
      b.speed += (speed - b.speed) * (1 - Math.exp(-dt / RULES.speedTau))
      b.vx = Math.cos(b.heading) * b.speed
      b.vy = Math.sin(b.heading) * b.speed
      b.x += b.vx * dt
      b.y += b.vy * dt
      b.strong = b.z <= RULES.strongMaxAlt
      if (b.strong !== prevStrong) ev.push({ type: 'altitude', slot: b.slot, strong: b.strong })
      // ombre
      const h = Math.min(1, Math.max(0, (b.z - RULES.altLow) / (RULES.altHigh - RULES.altLow)))
      const rr = RULES.shadowRadiusLow + (RULES.shadowRadiusHigh - RULES.shadowRadiusLow) * h
      b.shadow.r = rr
      b.shadow.rAlong = rr * sun.stretch
      b.shadow.cx = b.x + sun.shadowDirX * b.z * sun.cotE
      b.shadow.cy = b.y + sun.shadowDirY * b.z * sun.cotE
      b.shadow.strong = b.strong
      b.shadow.paints = b.stun <= 0
      // Simoun
      const d = Math.hypot(b.x / s.arena.a, b.y / s.arena.b)
      const inStorm = d > RULES.stormSoftFrom
      if (inStorm !== b.inStorm) ev.push({ type: 'storm', slot: b.slot, inside: inStorm })
      b.inStorm = inStorm
      if (b.stun > 0 && b.stun <= dt) ev.push({ type: 'stunEnd', slot: b.slot })
      if (br.flapCd <= 0 && r.chance(0.004 * (this.opts.activity ?? 1))) {
        br.flapCd = RULES.flapCooldown
        b.flap = RULES.flapDuration
        ev.push({ type: 'flap', slot: b.slot })
      }
      if (br.flapCd > -1 && br.flapCd <= 0 && br.flapCd > -dt) ev.push({ type: 'flapReady', slot: b.slot })
    }
  }

  private actions(ev: SimEvent[]): void {
    const s = this.state
    const r = this.rng
    const dt = this.dt
    const act = this.opts.activity ?? 1
    // piqué scénarisé : verrou → prise d'élan → clac → touche / raté
    this.nextDive -= dt * act
    if (!this.dive && this.nextDive <= 0 && s.birds.length >= 2) {
      this.nextDive = r.range(4, 9)
      const hunter = r.int(0, s.birds.length - 1)
      let target = r.int(0, s.birds.length - 2)
      if (target >= hunter) target++
      this.dive = { hunter, target, stage: 0, timer: 0.5 }
      ev.push({ type: 'lock', hunter, target })
    }
    const d = this.dive
    if (d) {
      d.timer -= dt
      const hb = s.bySlot[d.hunter]!
      const tb = s.bySlot[d.target]!
      if (d.timer <= 0) {
        if (d.stage === 0) {
          ev.push({ type: 'diveWindup', hunter: d.hunter, target: d.target })
          hb.dive = 'windup'
          d.stage = 1
          d.timer = RULES.diveWindup
        } else if (d.stage === 1) {
          if (r.chance(0.12)) {
            ev.push({ type: 'diveCancel', hunter: d.hunter, target: d.target, reason: 'feint' })
            hb.dive = 'none'
            this.dive = null
          } else {
            hb.dive = 'guided'
            d.stage = 2
            d.timer = r.range(0.25, 0.5)
          }
        } else if (d.stage === 2) {
          ev.push({ type: 'diveCommit', hunter: d.hunter, target: d.target })
          hb.dive = 'committed'
          d.stage = 3
          d.timer = r.range(0.35, 0.6)
        } else {
          hb.dive = 'none'
          hb.diveTime = 0
          const x = (hb.x + tb.x) / 2, y = (hb.y + tb.y) / 2
          if (r.chance(0.6)) {
            const crown = s.crownSlot === d.target
            ev.push({ type: 'diveHit', hunter: d.hunter, target: d.target, x, y, z: tb.z, stolenCells: 400, crown })
            tb.stun = RULES.stunHit
            if (s.time - this.lastSlowmo > RULES.hitSlowmoMinGap && s.sun.t < s.sun.T - RULES.noSlowmoLastSeconds) {
              this.lastSlowmo = s.time
              this.slowmoLeft = RULES.hitSlowmoSeconds
            }
          } else {
            const dodged = r.chance(0.5)
            if (dodged) ev.push({ type: 'flap', slot: d.target })
            ev.push({ type: 'diveMiss', hunter: d.hunter, target: d.target, dodged, x, y })
            hb.stun = RULES.missStun
          }
          this.dive = null
        }
      }
      if (hb.dive !== 'none') hb.diveTime += dt
    }
    // autres événements, au hasard
    if (r.chance(0.02 * act)) {
      const b = r.pick(s.birds)
      ev.push({ type: 'paleOnStrong', slot: b.slot, x: b.shadow.cx, y: b.shadow.cy })
    }
    if (r.chance(0.004 * act)) {
      const a = r.int(0, s.birds.length - 1)
      const b = (a + 1) % s.birds.length
      const A = s.birds[a]!
      ev.push({ type: 'bump', a, b, x: A.x, y: A.y, z: A.z })
    }
    if (r.chance(0.002 * act)) ev.push({ type: 'towerBump', slot: r.pick(s.birds).slot, tower: 0 })
    if (r.chance(0.003 * act)) {
      const b = r.pick(s.birds)
      b.hidden = !b.hidden
      ev.push({ type: 'hidden', slot: b.slot, hidden: b.hidden })
    }
    // couronne : change de temps en temps
    if (s.sun.t > 3 && r.chance(0.006 * act)) {
      const prev = s.crownSlot
      const slot = r.pick(s.birds).slot
      if (slot !== prev) {
        s.crownSlot = slot
        for (const b of s.birds) b.crown = b.slot === slot
        ev.push({ type: 'crown', slot, prev })
      }
    }
    if (r.chance(0.0025 * act * (0.5 + s.sun.u * 2))) {
      this.stolen++
      ev.push({ type: 'bigSteal', slot: r.pick(s.birds).slot, frac: 0.04, victim: r.pick(s.birds).slot })
    }
    // une incursion dans le Simoun de temps en temps : un oiseau file vers le bord
    this.stormTimer -= dt
    if (this.stormTimer <= 0) {
      this.stormTimer = r.range(15, 30)
      const b = r.pick(s.birds)
      this.brains[b.slot]!.targetHeading = Math.atan2(b.y, b.x)
      this.brains[b.slot]!.turnTimer = 4
    }
  }
}

function makeBird(slot: number, x: number, y: number, heading: number): BirdState {
  return {
    slot, x, y, z: RULES.altHigh, vx: 0, vy: 0, vz: 0, heading, turnRate: 0, speed: RULES.speedHigh, targetLow: false, strong: false,
    shadow: { cx: x, cy: y, r: RULES.shadowRadiusHigh, rAlong: RULES.shadowRadiusHigh, strong: false, paints: true },
    dive: 'none', diveTarget: -1, diveTime: 0, lockTarget: -1, lockedBy: -1, stun: 0, stunKind: 'none', immune: 0,
    flap: 0, flapCooldown: 0, diveCooldown: 0, hidden: false, inNight: false, inStorm: false, crown: false, assist: false, towerSlide: 0,
  }
}
