import { describe, expect, it } from 'vitest'
import { createSimulation } from '../../sim/simulation.ts'
import { RULES } from '../../sim/rules.ts'
import { worldView } from '../render/worldView.ts'
import type { GameView } from '../view.ts'
import { cameraBeats, cameraCue, cameraState, cueCamera, type CameraBeat } from './cue.ts'
import { CameraDirector, NIGHT_HOLD_SECONDS } from './director.ts'
import { buildPodiumView, podiumLayout } from './podium.ts'
import { Emitter } from '../bus.ts'
import type { SimEvent } from '../../sim/types.ts'

function roundSim(t: number) {
  const sim = createSimulation({ mode: 'round', seed: 3, mapId: 'parasols', birds: Array.from({ length: 6 }, (_, slot) => ({ slot, assist: false })), sunSeconds: RULES.roundSunSeconds, countdown: false })
  while (sim.state.sun.t < t) sim.step([])
  return sim
}

function view(sim: ReturnType<typeof roundSim>): GameView {
  return { sim: sim.state, prevBirds: [], alpha: 1, realTime: 0, timeScale: 1, players: [], colorblind: false }
}

describe('CameraDirector', () => {
  it('manche : pas de ciel, pose finie, lacet nord', () => {
    const sim = roundSim(40)
    const v = view(sim)
    const d = new CameraDirector(new Emitter<SimEvent>())
    cueCamera('round', { cut: true })
    for (let i = 0; i < 60; i++) d.update(1 / 60, v, 16 / 9)
    const p = d.pose
    expect(Number.isFinite(p.pos.x) && Number.isFinite(p.pos.y) && Number.isFinite(p.pos.z)).toBe(true)
    expect(p.pos.y).toBeGreaterThan(60)
    // regard vers le bas d'au moins 42° − demi-FOV : le haut du cadre reste sous l'horizon
    const f = { x: 0, y: 0, z: -1 }
    const q = p.quat
    // direction avant = q · (0,0,−1)
    const ix = q.w * f.x + q.y * f.z - q.z * f.y
    const iy = q.w * f.y + q.z * f.x - q.x * f.z
    const iz = q.w * f.z + q.x * f.y - q.y * f.x
    const iw = -q.x * f.x - q.y * f.y - q.z * f.z
    const fy = iy * q.w + iw * -q.y + iz * -q.x - ix * -q.z
    expect(Math.asin(-fy) * (180 / Math.PI)).toBeGreaterThan(RULES.camPitchEndDeg - 1)
    d.dispose()
  })

  it('résultats : pause de nuit, montée, illumination, carte prête ; worldView rendu en sortie', () => {
    const sim = roundSim(RULES.roundSunSeconds + 0.1)
    const v = view(sim)
    const d = new CameraDirector(new Emitter<SimEvent>())
    cueCamera('round', { cut: true })
    for (let i = 0; i < 30; i++) d.update(1 / 60, v, 16 / 9)
    const beats: [string, number][] = []
    const off = cameraBeats.on((b: CameraBeat) => beats.push([b.type, cameraState.modeTime]))
    cueCamera('roundResults', { winnerSlot: 2 })
    for (let i = 0; i < 60 * 6; i++) {
      v.realTime += 1 / 60
      d.update(1 / 60, v, 16 / 9)
    }
    off()
    const at = (t: string) => beats.find((b) => b[0] === t)?.[1] ?? -1
    expect(at('riseStart')).toBeCloseTo(NIGHT_HOLD_SECONDS, 1)
    expect(at('mapReady')).toBeCloseTo(NIGHT_HOLD_SECONDS + RULES.camNightRiseSeconds, 1)
    expect(at('illuminate')).toBeGreaterThan(at('riseStart'))
    expect(worldView.resultsFade).toBe(1)
    expect(worldView.exactBorders).toBe(true)
    expect(worldView.illumination.winnerSlot).toBe(2)
    expect(cameraState.mapReady).toBe(true)
    // vue verticale : la caméra est au-dessus de la carte
    expect(d.pose.pos.y).toBeGreaterThan(300)
    cueCamera('round', { cut: true })
    d.update(1 / 60, v, 16 / 9)
    expect(worldView.resultsFade).toBe(0)
    expect(worldView.exactBorders).toBe(false)
    expect(worldView.illumination.start).toBe(-1)
    d.dispose()
  })

  it('podium : tours sous les plaques, oiseaux perchés, vainqueur couronné', () => {
    const sim = roundSim(RULES.roundSunSeconds + 2.5)
    const pv = buildPodiumView(sim.state, [4, 1, 5])
    expect(pv.sim.towers.length).toBe(3)
    expect(pv.modes[4]).toBe('perch')
    expect(pv.sim.bySlot[4]!.crown).toBe(true)
    expect(pv.sim.crownSlot).toBe(4)
    // le vainqueur (colonne centrale) est au centre, plus haut que les deux autres
    const L = podiumLayout(sim.state.arena, 16 / 9, false)
    expect(Math.abs(L.spots[0]!.y)).toBeLessThan(0.5)
    expect(L.spots[0]!.top).toBeGreaterThan(L.spots[1]!.top)
    expect(L.spots[1]!.top).toBeGreaterThan(L.spots[2]!.top)
    // 2e à gauche de l'écran (face à l'ouest : gauche = sud), 3e à droite
    expect(L.spots[1]!.y).toBeLessThan(0)
    expect(L.spots[2]!.y).toBeGreaterThan(0)
    // les autres oiseaux volent ; l'état source n'est pas modifié
    expect(pv.sim.birds.length).toBe(6)
    expect(sim.state.towers.length).toBeGreaterThan(3)
  })

  it('coupe au changement de sim, fondu sinon', () => {
    const a = roundSim(10)
    const v = view(a)
    const d = new CameraDirector(new Emitter<SimEvent>())
    const cuts: string[] = []
    const off = cameraBeats.on((b) => b.type === 'cut' && cuts.push(b.mode))
    cueCamera('lobby', { cut: true })
    for (let i = 0; i < 60; i++) d.update(1 / 60, v, 16 / 9)
    cueCamera('rules')
    d.update(1 / 60, v, 16 / 9)
    expect(cuts).not.toContain('rules')
    const b = roundSim(5)
    v.sim = b.state
    cueCamera('round')
    d.update(1 / 60, v, 16 / 9)
    expect(cuts).toContain('round')
    off()
    expect(cameraCue.cut).toBe(false)
    d.dispose()
  })
})
