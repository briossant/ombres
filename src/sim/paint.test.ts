import { describe, expect, it, vi } from 'vitest'
import { RULES } from './rules.ts'
import { cellAtPoint, controlledSim, holdInput, placeBird, setCells } from './testkit.ts'
import type { SimEvent } from './types.ts'

// manches complètes : la machine peut être chargée, on laisse de la marge
vi.setConfig({ testTimeout: 120_000 })

const STRONG = RULES.levelStrong
const PALE = RULES.levelPale
const X = 40
const Y = -30

/**
 * Un oiseau (slot 0, code 1) passe sur une tache préparée (propriétaire, niveau) ;
 * on lit la cellule au centre de son empreinte après un tick.
 */
function paintCase(before: { owner: number; level: number }, shadow: 'strong' | 'pale'): { owner: number; level: number; events: SimEvent[] } {
  const sim = controlledSim(2, { a: 110, b: 76 })
  const z = shadow === 'strong' ? RULES.altLow : RULES.altHigh
  placeBird(sim, 0, X, Y, z, Math.PI / 2)
  placeBird(sim, 1, -80, 40, RULES.altHigh)
  setCells(sim, X, Y, 12, 0, 0)
  setCells(sim, X, Y, 3, before.owner, before.level)
  const ev = sim.step([holdInput(sim, 0), holdInput(sim, 1)])
  const fp = sim.state.bySlot[0]!.shadow
  const c = cellAtPoint(sim, fp.cx, fp.cy)
  return { owner: c.owner, level: c.level, events: ev }
}

describe('table de peinture (GDD §6.2)', () => {
  const me = 1
  const foe = 2
  it.each([
    ['neutre + fort → à moi fort', { owner: 0, level: 0 }, 'strong', { owner: me, level: STRONG }],
    ['neutre + pâle → à moi pâle', { owner: 0, level: 0 }, 'pale', { owner: me, level: PALE }],
    ['à moi pâle + fort → fort', { owner: me, level: PALE }, 'strong', { owner: me, level: STRONG }],
    ['à moi pâle + pâle → inchangé', { owner: me, level: PALE }, 'pale', { owner: me, level: PALE }],
    ['à moi fort + fort → inchangé', { owner: me, level: STRONG }, 'strong', { owner: me, level: STRONG }],
    ['à moi fort + pâle → inchangé (jamais affaibli)', { owner: me, level: STRONG }, 'pale', { owner: me, level: STRONG }],
    ['adverse pâle + fort → à moi fort', { owner: foe, level: PALE }, 'strong', { owner: me, level: STRONG }],
    ['adverse pâle + pâle → à moi pâle', { owner: foe, level: PALE }, 'pale', { owner: me, level: PALE }],
    ['adverse fort + fort → à moi fort', { owner: foe, level: STRONG }, 'strong', { owner: me, level: STRONG }],
    ['adverse fort + pâle → aucun effet', { owner: foe, level: STRONG }, 'pale', { owner: foe, level: STRONG }],
  ] as const)('%s', (_name, before, shadow, after) => {
    const r = paintCase(before, shadow)
    expect({ owner: r.owner, level: r.level }).toEqual(after)
  })

  it('« tsk » : une ombre pâle sur du fort adverse émet paleOnStrong, limité en fréquence', () => {
    const sim = controlledSim(2, { a: 110, b: 76 })
    placeBird(sim, 0, X, Y, RULES.altHigh, 0)
    placeBird(sim, 1, -80, 40, RULES.altHigh)
    setCells(sim, X + 10, Y, 30, 2, STRONG)
    let tsk = 0
    const ticks = 30
    for (let i = 0; i < ticks; i++) for (const e of sim.step([holdInput(sim, 0), holdInput(sim, 1)])) if (e.type === 'paleOnStrong' && e.slot === 0) tsk++
    expect(tsk).toBeGreaterThanOrEqual(2)
    expect(tsk).toBeLessThanOrEqual(Math.ceil(ticks / RULES.tickHz / RULES.paleOnStrongEventGap) + 1)
    expect(sim.state.bySlot[0]!.paleOnStrong).toBeGreaterThan(0.5)
  })

  it('plusieurs ombres : la forte gagne ; à niveau égal, le centre le plus proche', () => {
    const sim = controlledSim(2, { a: 110, b: 76 })
    // même point : 0 bas (fort), 1 haut (pâle) → fort
    placeBird(sim, 0, X, Y, RULES.altLow, Math.PI / 2)
    placeBird(sim, 1, X, Y, RULES.altHigh, Math.PI / 2)
    sim.step([holdInput(sim, 0), holdInput(sim, 1)])
    const fp = sim.state.bySlot[0]!.shadow
    expect(cellAtPoint(sim, fp.cx, fp.cy)).toMatchObject({ owner: 1, level: STRONG })

    const sim2 = controlledSim(2, { a: 110, b: 76 })
    placeBird(sim2, 0, X, Y, RULES.altHigh, Math.PI / 2)
    placeBird(sim2, 1, X + 8, Y, RULES.altHigh, Math.PI / 2)
    sim2.step([holdInput(sim2, 0), holdInput(sim2, 1)])
    const f0 = sim2.state.bySlot[0]!.shadow
    const f1 = sim2.state.bySlot[1]!.shadow
    // cellule plus proche du centre de 1 (à 2 m de lui, à 6 m de 0) → 1
    const mx = f1.cx - 2
    expect(cellAtPoint(sim2, mx, f1.cy).owner).toBe(2)
    expect(cellAtPoint(sim2, f0.cx + 2, f0.cy).owner).toBe(1)
  })

  it('sous-pas : un coup de fouet au couchant ne saute aucune cellule', () => {
    const sim = controlledSim(2, { a: 210, b: 145 })
    // soleil de fin de manche : décalage de h·cot e énorme, descente à 22 m/s
    const st = sim.state
    const T = RULES.roundSunSeconds
    const ticks = Math.round(107 * RULES.tickHz)
    // avance rapide du temps sans peindre : on déplace les oiseaux hors de l'arène utile
    for (let i = 0; i < ticks; i++) sim.step([undefined, undefined])
    expect(st.sun.t).toBeGreaterThan(106)
    expect(st.sun.t).toBeLessThan(T)
    placeBird(sim, 0, 60, 60, RULES.altHigh, Math.PI / 2)
    placeBird(sim, 1, 150, -100, RULES.altHigh)
    setCells(sim, 60, 0, 400, 0, 0)
    sim.step([{ dirX: 0, dirY: 1, dive: false, divePresses: 0, flapPresses: 0 }, holdInput(sim, 1)])
    const before = st.bySlot[0]!.shadow.cx
    // plongeon : l'ombre recule vers l'oiseau à ~130 m/s
    for (let i = 0; i < 10; i++) sim.step([{ dirX: 0, dirY: 1, dive: true, divePresses: 0, flapPresses: 0 }, holdInput(sim, 1)])
    const after = st.bySlot[0]!.shadow.cx
    expect(before - after).toBeGreaterThan(40)
    // la bande balayée le long de y = 60 + parcours est continue (pas de trou)
    const y = st.bySlot[0]!.y
    let holes = 0
    for (let x = after + 2; x < Math.min(before - 5, 205); x += 0.5) {
      const c = cellAtPoint(sim, x, y - 3)
      if (c.frozen) continue
      if (c.owner !== 1) holes++
    }
    expect(holes).toBe(0)
  })
})
