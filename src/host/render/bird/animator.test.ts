// Continuité de l'animation : quels que soient les changements d'état brusques
// (piqué, décrochage, coup d'aile, virage inversé…), aucune grandeur de la pose
// ne doit sauter d'une frame à l'autre.
import { describe, expect, it } from 'vitest'
import { RULES } from '../../../sim/rules.ts'
import { BirdAnimator, emptyFrame, type BirdFrame } from './animator.ts'
import type { BirdPose, WingPose } from './pose.ts'
import { wrapAngle } from './math.ts'

const CTX = { renderScale: 1, detail: 1, mode: 'fly' as const }

function flatten(p: BirdPose): number[] {
  const w = (x: WingPose) => [x.shoulderFlap, x.shoulderSweep, x.shoulderTwist, x.elbowFlap, x.elbowSweep, x.wristFlap, x.wristSweep, x.wristTwist, x.fingerFlap, x.fingerSweep]
  return [
    p.pitch,
    p.scale,
    p.bodyLift,
    ...w(p.wingL),
    ...w(p.wingR),
    p.neckPitch,
    p.neckYaw,
    p.headPitch,
    p.tailPitch,
    p.tailSpread,
    p.cape1Pitch,
    p.cape2Pitch,
    p.pen1Yaw,
    p.pen2Yaw,
  ]
}

/** Joue un scénario frame par frame et renvoie le plus grand saut (par frame à 60 Hz) observé. */
function maxJump(script: (t: number, f: BirdFrame) => void, seconds = 6): { jump: number; rollJump: number } {
  const a = new BirdAnimator(3)
  const f = emptyFrame()
  const dt = 1 / 60
  script(0, f)
  a.snap(f)
  let prev = flatten(a.update(f, dt, CTX))
  let prevRoll = a.pose.roll
  let jump = 0
  let rollJump = 0
  for (let t = dt; t < seconds; t += dt) {
    script(t, f)
    const cur = flatten(a.update(f, dt, CTX))
    for (let i = 0; i < cur.length; i++) jump = Math.max(jump, Math.abs(cur[i]! - prev[i]!))
    rollJump = Math.max(rollJump, Math.abs(wrapAngle(a.pose.roll - prevRoll)))
    prevRoll = a.pose.roll
    prev = cur
  }
  return { jump, rollJump }
}

describe('BirdAnimator', () => {
  it('reste continu quand le piqué démarre, claque et s’annule', () => {
    const { jump } = maxJump((t, f) => {
      const c = t % 2
      f.dive = c < 0.2 ? 'windup' : c < 0.8 ? 'guided' : c < 1.3 ? 'committed' : 'none'
      f.vz = f.dive === 'guided' || f.dive === 'committed' ? -15 : 0
      f.z = 12
    })
    // Le claquement d'ailes est volontairement rapide (0,24 s), mais jamais instantané.
    expect(jump).toBeLessThan(0.25)
  })

  it('reste continu au décrochage : le roulé-boulé finit à 2π', () => {
    const { jump, rollJump } = maxJump((t, f) => {
      const c = t % 3
      f.stun = c < RULES.stunHit ? RULES.stunHit - c : 0
      f.stunKind = f.stun > 0 ? 'hit' : 'none'
      f.z = RULES.altLow
    })
    expect(jump).toBeLessThan(0.25)
    expect(rollJump).toBeLessThan(0.3)
  })

  it('reste continu au coup d’aile et aux inversions de virage', () => {
    const { jump, rollJump } = maxJump((t, f) => {
      f.flap = t % 1.5 < RULES.flapDuration ? RULES.flapDuration - (t % 1.5) : 0
      f.turnRate = (Math.floor(t) % 2 ? 1 : -1) * RULES.turnLowDegPerS * (Math.PI / 180)
      f.z = 8
    })
    // L'abattée du coup d'aile est le geste le plus vif (≈ 15 rad/s) : rapide, pas discontinu.
    expect(jump).toBeLessThan(0.32)
    expect(rollJump).toBeLessThan(0.1)
  })

  it('incline vers l’intérieur du virage, au plus 50°', () => {
    const a = new BirdAnimator(1)
    const f = emptyFrame()
    f.turnRate = 2 * RULES.turnLowDegPerS * (Math.PI / 180) // au-delà du maximum : bridé
    a.snap(f)
    for (let i = 0; i < 240; i++) a.update(f, 1 / 60, CTX)
    expect(a.pose.roll).toBeGreaterThan(0)
    expect(a.pose.roll).toBeLessThanOrEqual((50 * Math.PI) / 180 + 1e-3)
  })

  it('replie les ailes en flèche en piqué', () => {
    const a = new BirdAnimator(1)
    const f = emptyFrame()
    a.snap(f)
    for (let i = 0; i < 30; i++) a.update(f, 1 / 60, CTX)
    const open = a.pose.wingL.shoulderSweep
    f.dive = 'guided'
    f.vz = -15
    for (let i = 0; i < 30; i++) a.update(f, 1 / 60, CTX)
    expect(a.pose.wingL.shoulderSweep).toBeGreaterThan(open + 0.6)
  })
})
