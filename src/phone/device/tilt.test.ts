import { describe, expect, it } from 'vitest'
import { deviceToScreen, tiltVector, upInDevice } from './tilt.ts'

const pose = (beta: number, gamma: number, angle: number) => deviceToScreen(upInDevice(beta, gamma), angle)

describe('inclinaison', () => {
  it('paysage (90°) tenu à 40° : droite et avant', () => {
    const calib = pose(0, -40, 90)
    const right = tiltVector(pose(12, -40, 90), calib)
    expect(right.x).toBeGreaterThan(0.5)
    expect(Math.abs(right.y)).toBeLessThan(0.15)
    const fwd = tiltVector(pose(0, -28, 90), calib)
    expect(fwd.y).toBeGreaterThan(0.5)
    expect(Math.abs(fwd.x)).toBeLessThan(0.15)
    const back = tiltVector(pose(0, -52, 90), calib)
    expect(back.y).toBeLessThan(-0.5)
  })
  it('portrait (0°) : zone morte puis plein effet', () => {
    const calib = pose(35, 0, 0)
    expect(tiltVector(pose(38, 0, 0), calib)).toMatchObject({ x: 0, y: 0 })
    const full = tiltVector(pose(35, 25, 0), calib)
    expect(full.x).toBeCloseTo(1, 1)
    const fwd = tiltVector(pose(20, 0, 0), calib)
    expect(fwd.y).toBeGreaterThan(0.5)
  })
  it('paysage inversé (270°)', () => {
    const calib = pose(0, 40, 270)
    const right = tiltVector(pose(-12, 40, 270), calib)
    expect(right.x).toBeGreaterThan(0.5)
    const fwd = tiltVector(pose(0, 28, 270), calib)
    expect(fwd.y).toBeGreaterThan(0.5)
  })
})
