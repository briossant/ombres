// Routeur d'entrées : slot → source (téléphone, joueur local clavier/manette, bot, rien).
// À chaque tick, `collect()` produit un BirdInput par slot ; la simulation ne sait pas qui pilote.
//
// Compteurs d'appuis continus : chaque slot garde ses propres compteurs de sortie, qui avancent
// des augmentations de la source courante. Changer de source (téléphone → bot remplaçant → retour
// du téléphone) ne produit donc jamais de faux appui, et une simulation restaurée (rafraîchissement
// du PC) resynchronise ses compteurs sans appui fantôme (la sim ne compte que les augmentations).
//
// Aucune allocation par tick : objets de travail réutilisés.
import type { Bot } from '../bots/index.ts'
import type { PhoneHub } from '../net/phoneHub.ts'
import type { BirdInput, SimEvent, SimState } from '../sim/types.ts'
import { GamepadSource } from './gamepad.ts'
import { KeyboardSource } from './keyboard.ts'
import { newInput, type LocalGroup, type LocalState } from './types.ts'

export type InputSource =
  | { kind: 'none' }
  | { kind: 'phone'; phoneId: string }
  | { kind: 'local'; group: LocalGroup }
  | { kind: 'bot'; bot: Bot }

const NONE: InputSource = Object.freeze({ kind: 'none' })
const SLOTS = 12

/** Clavier + manettes du PC, lus par groupe. */
export class LocalInput {
  readonly keyboard = new KeyboardSource()
  readonly pads = new GamepadSource()
  private readonly scratch: LocalState = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }

  read(group: LocalGroup, out: BirdInput): BirdInput {
    this.pads.poll(performance.now())
    const s = this.keyboard.read(group, this.scratch)
    this.pads.merge(group, s)
    out.dirX = s.dirX
    out.dirY = s.dirY
    out.dive = s.dive
    out.divePresses = s.divePresses
    out.flapPresses = s.flapPresses
    return out
  }
}

interface Track {
  /** Derniers compteurs bruts de la source courante (-1 = première lecture : sert de base). */
  rawD: number
  rawF: number
  outD: number
  outF: number
}

export class InputRouter {
  private readonly sources: InputSource[] = Array.from({ length: SLOTS }, () => NONE)
  private readonly raw: BirdInput[] = Array.from({ length: SLOTS }, newInput)
  private readonly out: BirdInput[] = Array.from({ length: SLOTS }, newInput)
  private readonly tracks: Track[] = Array.from({ length: SLOTS }, () => ({ rawD: -1, rawF: -1, outD: 0, outF: 0 }))
  /** Entrées du dernier tick, par slot (undefined = neutre / pas d'oiseau). Tableau réutilisé. */
  readonly inputs: (BirdInput | undefined)[] = new Array(SLOTS).fill(undefined)

  constructor(
    readonly local: LocalInput,
    private hub: PhoneHub | null = null,
  ) {}

  setHub(hub: PhoneHub | null): void {
    this.hub = hub
  }

  set(slot: number, source: InputSource): void {
    if (slot < 0 || slot >= SLOTS) return
    const cur = this.sources[slot]!
    if (sameSource(cur, source)) return
    this.sources[slot] = source
    const t = this.tracks[slot]!
    t.rawD = t.rawF = -1
  }

  get(slot: number): InputSource {
    return this.sources[slot] ?? NONE
  }

  /**
   * Nouvelle simulation : plus aucune source, compteurs de sortie remis à zéro (une simulation
   * neuve part de 0 ; une simulation restaurée se resynchronise sans appui fantôme).
   */
  reset(): void {
    for (let s = 0; s < SLOTS; s++) {
      this.sources[s] = NONE
      const t = this.tracks[s]!
      t.rawD = t.rawF = -1
      t.outD = t.outF = 0
      this.inputs[s] = undefined
    }
  }

  /** Nouvel oiseau sur ce slot (même simulation) : ses compteurs repartent de zéro. */
  resetSlot(slot: number): void {
    const t = this.tracks[slot]
    if (!t) return
    t.rawD = t.rawF = -1
    t.outD = t.outF = 0
  }

  /**
   * Entrées de ce tick. `lastEvents` = retour du step() précédent (pour les bots).
   * Les bots pensent même quand leur entrée n'est pas lue (coordinateur partagé).
   */
  collect(state: SimState, lastEvents: readonly SimEvent[]): (BirdInput | undefined)[] {
    for (let slot = 0; slot < SLOTS; slot++) {
      const src = this.sources[slot]!
      const bird = state.bySlot[slot]
      if (!bird || src.kind === 'none') {
        this.inputs[slot] = undefined
        continue
      }
      let raw: BirdInput
      switch (src.kind) {
        case 'phone':
          raw = this.hub ? this.hub.input(src.phoneId, bird.heading, this.raw[slot]) : neutral(this.raw[slot]!)
          break
        case 'local':
          raw = this.local.read(src.group, this.raw[slot]!)
          break
        case 'bot':
          raw = src.bot.think(state, lastEvents)
          break
      }
      this.inputs[slot] = this.normalize(slot, raw)
    }
    return this.inputs
  }

  /** Recopie dans l'entrée de sortie du slot avec des compteurs continus. */
  private normalize(slot: number, raw: BirdInput): BirdInput {
    const o = this.out[slot]!
    const t = this.tracks[slot]!
    o.dirX = raw.dirX
    o.dirY = raw.dirY
    o.dive = raw.dive
    if (t.rawD < 0) {
      t.rawD = raw.divePresses
      t.rawF = raw.flapPresses
    } else {
      if (raw.divePresses > t.rawD) t.outD += Math.min(4, raw.divePresses - t.rawD)
      if (raw.flapPresses > t.rawF) t.outF += Math.min(4, raw.flapPresses - t.rawF)
      t.rawD = raw.divePresses
      t.rawF = raw.flapPresses
    }
    o.divePresses = t.outD
    o.flapPresses = t.outF
    return o
  }
}

function neutral(o: BirdInput): BirdInput {
  o.dirX = o.dirY = 0
  o.dive = false
  return o
}

function sameSource(a: InputSource, b: InputSource): boolean {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'none':
      return true
    case 'phone':
      return a.phoneId === (b as typeof a).phoneId
    case 'local':
      return a.group === (b as typeof a).group
    case 'bot':
      return a.bot === (b as typeof a).bot
  }
}
