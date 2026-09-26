// Couche d'entrée : clavier (8 secteurs, compteurs, AltGr, touches partagées) et routeur
// (compteurs d'appuis continus quand la source d'un slot change).
import { describe, expect, it } from 'vitest'
import type { Bot } from '../bots/index.ts'
import type { BirdInput, SimState } from '../sim/types.ts'
import { KeyboardSource } from './keyboard.ts'
import { InputRouter, LocalInput } from './router.ts'
import { newInput } from './types.ts'

type Handler = (e: unknown) => void
function fakeWindow() {
  const h: Record<string, Handler[]> = {}
  const target = {
    addEventListener: (t: string, fn: Handler) => void (h[t] ??= []).push(fn),
    removeEventListener: () => undefined,
  }
  const key = (type: 'keydown' | 'keyup', code: string, trusted = true) => {
    const e = { code, isTrusted: trusted, defaultPrevented: false, preventDefault() { this.defaultPrevented = true }, stopImmediatePropagation() {} }
    for (const fn of h[type] ?? []) fn(e)
    return e
  }
  return { target: target as unknown as Window, key }
}

describe('clavier', () => {
  it('8 secteurs, compteurs sur front montant, événements synthétiques ignorés', () => {
    const kb = new KeyboardSource()
    const w = fakeWindow()
    kb.install(w.target)
    const s = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    w.key('keydown', 'KeyW')
    w.key('keydown', 'KeyD')
    kb.read(1, s)
    expect(s.dirX).toBeCloseTo(Math.SQRT1_2)
    expect(s.dirY).toBeCloseTo(Math.SQRT1_2)
    w.key('keydown', 'Space')
    w.key('keydown', 'Space') // répétition : ignorée
    w.key('keyup', 'Space')
    w.key('keydown', 'Space')
    kb.read(1, s)
    expect(s.divePresses).toBe(2)
    expect(s.dive).toBe(true)
    w.key('keydown', 'ShiftLeft', false) // synthétique
    kb.read(1, s)
    expect(s.flapPresses).toBe(0)
    const e = w.key('keydown', 'ArrowLeft')
    expect(e.defaultPrevented).toBe(true)
  })

  it('groupe 2 (AltGr, IJKL) ; ControlLeft fantôme ignoré ; flèches retirées au groupe 1 en partage', () => {
    const kb = new KeyboardSource()
    const w = fakeWindow()
    kb.install(w.target)
    const joins: number[] = []
    kb.onDivePress = g => joins.push(g)
    const s = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    w.key('keydown', 'AltRight')
    const ctrl = w.key('keydown', 'ControlLeft')
    expect(ctrl.defaultPrevented).toBe(true)
    w.key('keydown', 'KeyJ')
    kb.read(2, s)
    expect(joins).toEqual([2])
    expect(s.dive).toBe(true)
    expect(s.dirX).toBe(-1)
    w.key('keydown', 'ArrowUp')
    kb.read(1, s)
    expect(s.dirY).toBe(1)
    kb.setShared(true)
    kb.read(1, s)
    expect(s.dirY).toBe(0)
  })
})

function fakeBot(slot: number, presses: { d: number; f: number }): Bot {
  const input = newInput()
  return {
    slot,
    personality: 'ploughman',
    level: 1,
    substitute: false,
    intent: { kind: 'idle', target: -1, x: NaN, y: NaN, low: false, blunder: null },
    think: () => {
      input.divePresses = presses.d
      input.flapPresses = presses.f
      return input
    },
    reset: () => undefined,
  }
}

describe('routeur', () => {
  const state = { bySlot: [{ heading: 0 }] } as unknown as SimState
  it('compteurs continus quand la source change (pas d’appui fantôme)', () => {
    const r = new InputRouter(new LocalInput())
    const a = { d: 10, f: 4 }
    r.set(0, { kind: 'bot', bot: fakeBot(0, a) })
    let inp = r.collect(state, [])[0] as BirdInput
    expect(inp.divePresses).toBe(0) // première lecture = base
    a.d = 12
    inp = r.collect(state, [])[0] as BirdInput
    expect(inp.divePresses).toBe(2)
    const b = { d: 80, f: 50 }
    r.set(0, { kind: 'bot', bot: fakeBot(0, b) })
    inp = r.collect(state, [])[0] as BirdInput
    expect(inp.divePresses).toBe(2)
    expect(inp.flapPresses).toBe(0)
    b.f = 51
    inp = r.collect(state, [])[0] as BirdInput
    expect(inp.flapPresses).toBe(1)
    r.reset()
    r.set(0, { kind: 'bot', bot: fakeBot(0, b) })
    inp = r.collect(state, [])[0] as BirdInput
    expect(inp.divePresses).toBe(0)
    expect(inp.flapPresses).toBe(0)
  })
  it('pas d’oiseau ou pas de source : entrée neutre (undefined)', () => {
    const r = new InputRouter(new LocalInput())
    expect(r.collect(state, [])[0]).toBeUndefined()
    r.set(3, { kind: 'bot', bot: fakeBot(3, { d: 0, f: 0 }) })
    expect(r.collect(state, [])[3]).toBeUndefined()
  })
})
