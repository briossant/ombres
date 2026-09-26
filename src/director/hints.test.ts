import { describe, expect, it } from 'vitest'
import { RULES } from '../sim/rules.ts'
import type { BirdInput, SimEvent } from '../sim/types.ts'
import type { HintsMode } from '../host/settings.ts'
import { createKeyValueHintMemory, createMemoryHintStore, HintsDirector, paleOnStrongFraction, type HintCue, type HintMemory } from './hints.ts'
import { hintDisplaySeconds, hintParams, hintText, hintTextParts } from './text.ts'
import { t } from '../shared/i18n.ts'
import { FakeSim } from './testing.ts'

const DT = 1 / RULES.tickHz

interface Shown {
  t: number
  cue: HintCue
}

/** Manche scriptée pour les indications. Par défaut : slot 0 humain, les autres bots. */
class Round {
  readonly sim: FakeSim
  readonly shown: Shown[] = []
  private t = -RULES.countdownSeconds
  private script: { t: number; events?: SimEvent[]; fn?: (sim: FakeSim) => void }[] = []

  constructor(
    readonly hints: HintsDirector,
    birds = 3,
    humans: number[] = [0],
    newMatch = true,
  ) {
    this.sim = new FakeSim({ birds })
    hints.setPlayers(Array.from({ length: birds }, (_, s) => ({ slot: s, key: `p${s}`, human: humans.includes(s), colorIndex: (s * 5) % 12 })))
    if (newMatch) hints.startMatch()
    hints.startRound()
    // Midi : début du vol (la vraie simulation émet cet événement à t = 0).
    this.at(0, { type: 'phase', phase: 'noon' })
  }

  at(t: number, ...events: SimEvent[]): this {
    this.script.push({ t, events })
    return this
  }

  do(t: number, fn: (sim: FakeSim) => void): this {
    this.script.push({ t, fn })
    return this
  }

  run(until: number, inputs?: (t: number) => (BirdInput | undefined)[]): this {
    this.script.sort((a, b) => a.t - b.t)
    while (this.t < until - 1e-9) {
      this.t += DT
      this.sim.setSunT(this.t)
      const events: SimEvent[] = []
      while (this.script.length && this.script[0].t <= this.t + 1e-9) {
        const s = this.script.shift()!
        s.fn?.(this.sim)
        if (s.events) events.push(...s.events)
      }
      for (const cue of this.hints.update(this.sim.state, events, inputs?.(this.t))) this.shown.push({ t: this.t, cue })
    }
    return this
  }

  ids(slot = 0): string[] {
    return this.shown.filter(s => s.cue.slot === slot).map(s => s.cue.hintId)
  }
}

const director = (mode: HintsMode = 'auto', memory: HintMemory = createMemoryHintStore()) => new HintsDirector({ memory, mode })

/** Humain qui plonge dès le départ (pas d'indication « Maintiens PLONGER »). */
const diver = (r: Round, slot = 0) => r.do(0.1, s => (s.bird(slot).targetLow = true)).do(0.5, s => (s.bird(slot).targetLow = false))

describe('déclencheurs', () => {
  it('6 s sans PLONGER → « Maintiens PLONGER »', () => {
    const r = new Round(director()).run(10)
    expect(r.ids()).toEqual(['holdDive'])
    expect(r.shown[0].t).toBeCloseTo(RULES.hintNoDiveAfter, 1)
  })

  it('pas d’indication « Maintiens PLONGER » à qui a déjà plongé', () => {
    const r = diver(new Round(director())).run(10)
    expect(r.ids()).toEqual([])
  })

  it('8 s au ras du sable → « Relâche »', () => {
    const r = new Round(director()).do(0.1, s => (s.bird(0).targetLow = true)).run(12)
    expect(r.ids()).toEqual(['releaseClimb'])
    expect(r.shown[0].t).toBeGreaterThanOrEqual(0.1 + RULES.hintLowTooLong - 0.05)
  })

  it('première cible verrouillée : la couleur de la cible, tant que le verrou tient', () => {
    const r = diver(new Round(director()))
      .do(3, s => (s.bird(0).lockTarget = 2))
      .at(3, { type: 'lock', hunter: 0, target: 2 })
      .run(5)
    expect(r.ids()).toEqual(['firstLock'])
    expect(r.shown[0].cue.colorIndex).toBe(10)
    expect(hintText(r.shown[0].cue, 'fr')).toBe('Lilas est sous toi. PLONGER pour piquer !')
    expect(hintText(r.shown[0].cue, 'en', { dive: 'Space' })).toBe('Lilac is below you. Space to strike!')
    const parts = hintTextParts(r.shown[0].cue, 'fr')
    expect(parts[0]).toEqual({ text: 'Lilas', colorIndex: 10 })
    // Pour le téléphone : clé + paramètres complets
    expect(t(r.shown[0].cue.key, hintParams(r.shown[0].cue, 'en'), 'en')).toBe('Lilac is below you. DIVE to strike!')
  })

  it('verrou perdu avant de pouvoir afficher : l’indication attend le verrou suivant', () => {
    // « Maintiens PLONGER » à 6 s bloque jusqu'à 14 s ; le verrou de 8 s est perdu à 10 s.
    const r = new Round(director())
      .do(8, s => (s.bird(0).lockTarget = 1))
      .at(8, { type: 'lock', hunter: 0, target: 1 })
      .do(10, s => (s.bird(0).lockTarget = -1))
      .do(20, s => (s.bird(0).lockTarget = 2))
      .at(20, { type: 'lock', hunter: 0, target: 2 })
      .run(22)
    expect(r.ids()).toEqual(['holdDive', 'firstLock'])
    expect(r.shown[1].t).toBeCloseTo(20, 1)
    expect(r.shown[1].cue.colorIndex).toBe(10)
  })

  it('premier piqué subi → « … COUP D’AILE ! » au clac (pas à la prise d’élan)', () => {
    const r = diver(new Round(director()))
      .do(5, s => {
        s.bird(1).dive = 'windup'
        s.bird(1).diveTarget = 0
      })
      .at(5, { type: 'diveWindup', hunter: 1, target: 0 })
      .do(5.4, s => (s.bird(1).dive = 'committed'))
      .at(5.4, { type: 'diveCommit', hunter: 1, target: 0 })
      .run(6)
    expect(r.ids()).toEqual(['dodge'])
    expect(r.shown[0].t).toBeCloseTo(5.4, 1)
    expect(hintText(r.shown[0].cue, 'fr')).toContain('COUP D’AILE')
  })

  it('feinte annulée avant le clac : rien, pas marquée vue ; au vrai clac suivant, l’indication s’affiche', () => {
    const memory = createMemoryHintStore()
    const r = diver(new Round(director('auto', memory)))
      .do(5, s => {
        s.bird(1).dive = 'windup'
        s.bird(1).diveTarget = 0
      })
      .at(5, { type: 'diveWindup', hunter: 1, target: 0 })
      // feinte : le chasseur relâche 0,4 s après la prise d'élan, avant le clac
      .do(5.4, s => {
        s.bird(1).dive = 'none'
        s.bird(1).diveTarget = -1
      })
      .at(5.4, { type: 'diveCancel', hunter: 1, target: 0, reason: 'feint' })
      .run(9)
    expect(r.ids()).toEqual([])
    expect(memory.has('p0', 'dodge')).toBe(false)
    r.do(12, s => {
      s.bird(2).dive = 'windup'
      s.bird(2).diveTarget = 0
    })
      .at(12, { type: 'diveWindup', hunter: 2, target: 0 })
      .do(12.3, s => (s.bird(2).dive = 'committed'))
      .at(12.3, { type: 'diveCommit', hunter: 2, target: 0 })
      .run(13)
    expect(r.ids()).toEqual(['dodge'])
    expect(r.shown[0].t).toBeCloseTo(12.3, 1)
    expect(memory.has('p0', 'dodge')).toBe(true)
  })

  it('pas de bulle individuelle pendant la Grande Ombre (ni juste avant) ; le bandeau reste', () => {
    const T = RULES.roundSunSeconds
    const G = RULES.greatShadowAt
    const r = diver(new Round(director()))
      .do(G - 7, s => (s.bird(0).hidden = true))
      // l'ombre s'éloigne de l'oiseau 5 s avant la nuit : l'écart de 8 s la fait attendre jusqu'à la Grande Ombre
      .do(G - 5, s => {
        s.bird(0).hidden = false
        s.bird(0).shadow.cx = s.bird(0).x + RULES.hintShadowOffsetMin + 5
      })
      .do(G + 2, s => {
        s.bird(1).dive = 'committed'
        s.bird(1).diveTarget = 0
      })
      .at(G + 2, { type: 'diveWindup', hunter: 1, target: 0 }, { type: 'crown', slot: 1, prev: -1 })
      .at(G + 2.3, { type: 'diveCommit', hunter: 1, target: 0 })
      .at(G, { type: 'phase', phase: 'greatShadow' })
      .run(T - 0.5)
    expect(r.ids()).toEqual(['towerShade', 'greatShadow'])
    const late = r.shown.filter(x => x.cue.display === 'bubble' && x.t >= G - 1.5)
    expect(late).toEqual([])
  })

  it('ombre pâle sur du sable fort adverse pendant 1,5 s (lu dans la grille)', () => {
    const r = diver(new Round(director()))
    r.do(1, s => {
      s.paint(1, -40, -40, 40, 40, RULES.levelStrong)
      const b = s.bird(0)
      b.x = b.shadow.cx = 0
      b.y = b.shadow.cy = 0
    })
    expect(paleOnStrongFraction(r.run(1.1).sim.state, r.sim.bird(0))).toBe(1)
    r.run(4)
    expect(r.ids()).toEqual(['paleOnStrong'])
    expect(r.shown[0].t).toBeGreaterThanOrEqual(1 + RULES.hintPaleOnStrongSeconds - 0.05)
  })

  it('pâle sur son propre sable fort, ou oiseau fort : rien', () => {
    const r = diver(new Round(director()))
    r.do(1, s => {
      s.paint(0, -40, -40, 40, 40, RULES.levelStrong)
      s.bird(0).shadow.cx = 0
      s.bird(0).shadow.cy = 0
    }).run(5)
    expect(r.ids()).toEqual([])
  })

  it('caché dans l’ombre d’une tour (pas dans la nuit)', () => {
    const r = diver(new Round(director()))
      .do(2, s => (s.bird(0).hidden = true))
      .run(3)
    expect(r.ids()).toEqual(['towerShade'])
    const n = diver(new Round(director()))
      .do(2, s => {
        s.bird(0).hidden = true
        s.bird(0).inNight = true
      })
      .run(3)
    expect(n.ids()).toEqual([])
  })

  it('ombre à plus de 15 m de l’oiseau → « Vise avec ton ombre », effet fil qui pulse', () => {
    const r = diver(new Round(director()))
      .do(2, s => (s.bird(0).shadow.cx = s.bird(0).x + RULES.hintShadowOffsetMin + 1))
      .run(3)
    expect(r.ids()).toEqual(['aimShadow'])
    expect(r.shown[0].cue.effect).toBe('pulseThread')
  })

  it('générales : couronne (bulle sur le couronné), heure dorée et Grande Ombre (bandeaux) pour tous les humains', () => {
    const r = diver(diver(new Round(director(), 4, [0, 2]), 2), 0)
      .at(4, { type: 'crown', slot: 3, prev: -1 })
      .at(20, { type: 'crown', slot: 1, prev: 3 })
      .at(RULES.phaseGoldenAt, { type: 'phase', phase: 'golden' })
      .at(RULES.greatShadowAt, { type: 'phase', phase: 'greatShadow' })
      .run(100)
    for (const slot of [0, 2]) expect(r.ids(slot)).toEqual(['crown', 'golden', 'greatShadow'])
    expect(r.ids(1)).toEqual([])
    const crown = r.shown.filter(s => s.cue.hintId === 'crown')
    expect(crown.every(s => s.cue.anchorSlot === 3 && s.cue.broadcast && s.cue.display === 'bubble')).toBe(true)
    const gs = r.shown.find(s => s.cue.hintId === 'greatShadow')!
    expect(gs.cue).toMatchObject({ display: 'banner', anchorSlot: -1, effect: 'arrowEast' })
    expect(hintText(gs.cue, 'fr')).toBe('La nuit fige le sable. File vers l’est →')
  })
})

describe('règles', () => {
  it('au plus une indication toutes les 8 s par joueur ; l’attente ne perd pas celles qui tiennent', () => {
    // À 6 s : holdDive. Caché dès 7 s (reste caché) : towerShade attend 14 s.
    const r = new Round(director()).do(7, s => (s.bird(0).hidden = true)).run(16)
    expect(r.ids()).toEqual(['holdDive', 'towerShade'])
    expect(r.shown[1].t - r.shown[0].t).toBeGreaterThanOrEqual(RULES.hintMinGap - 1e-6)
  })

  it('les plus urgentes passent devant (piqué subi avant « Vise avec ton ombre »)', () => {
    const r = new Round(director())
      .do(5, s => (s.bird(0).shadow.cx = 100))
      .do(5, s => {
        s.bird(1).dive = 'guided'
        s.bird(1).diveTarget = 0
      })
      .at(5, { type: 'diveWindup', hunter: 1, target: 0 })
      .at(5.3, { type: 'diveCommit', hunter: 1, target: 0 })
      .run(7)
    expect(r.ids()).toEqual(['dodge'])
  })

  it('bots : jamais d’indication', () => {
    const r = new Round(director(), 3, []).run(12)
    expect(r.shown).toEqual([])
  })

  it('auto : une seule fois par joueur, d’une partie à l’autre (mémoire injectée)', () => {
    const memory = createMemoryHintStore()
    const d = director('auto', memory)
    expect(new Round(d).run(8).ids()).toEqual(['holdDive'])
    expect(new Round(d).run(8).ids()).toEqual([])
    expect(memory.has('p0', 'holdDive')).toBe(true)
  })

  it('always : toutes, une fois par partie, même déjà vues', () => {
    const memory = createMemoryHintStore()
    memory.add('p0', 'holdDive')
    const d = director('always', memory)
    expect(new Round(d).run(8).ids()).toEqual(['holdDive'])
    expect(new Round(d, 3, [0], false).run(8).ids()).toEqual([]) // même partie, manche suivante
    expect(new Round(d).run(8).ids()).toEqual(['holdDive']) // nouvelle partie
  })

  it('never : rien', () => {
    const r = new Round(director('never')).at(RULES.phaseGoldenAt, { type: 'phase', phase: 'golden' }).run(60)
    expect(r.shown).toEqual([])
  })

  it('rien pendant le compte à rebours ni la nuit', () => {
    const d = director()
    const r = new Round(d).at(-2, { type: 'crown', slot: 1, prev: -1 })
    r.run(-0.5)
    expect(r.shown).toEqual([])
  })

  it('mémoire clé-valeur : persistée en JSON, tolère un stockage cassé', () => {
    const data = new Map<string, string>()
    const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) }
    createKeyValueHintMemory(store).add('phone-abc', 'crown')
    expect(JSON.parse(data.get('ombres.hints.v1.phone-abc')!)).toEqual(['crown'])
    expect(createKeyValueHintMemory(store).has('phone-abc', 'crown')).toBe(true)
    const broken = {
      getItem: () => {
        throw new Error('SecurityError')
      },
      setItem: () => {
        throw new Error('QuotaExceeded')
      },
    }
    const m = createKeyValueHintMemory(broken)
    expect(m.has('x', 'crown')).toBe(false)
    m.add('x', 'crown')
    expect(m.has('x', 'crown')).toBe(true)
  })

  it('durée d’affichage bornée sous l’écart entre deux indications', () => {
    expect(hintDisplaySeconds('Vise avec ton ombre.')).toBeGreaterThanOrEqual(2.5)
    expect(hintDisplaySeconds('x'.repeat(300))).toBeLessThan(RULES.hintMinGap)
  })
})
