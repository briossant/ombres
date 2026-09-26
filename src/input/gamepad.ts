// Manettes (Gamepad API, GDD §12.2 « bonus ») : stick gauche (ou croix), A / gâchette droite =
// PLONGER, B / RB = COUP D'AILE. Start = pause : géré par l'UI (nav.ts), pas ici.
// La manette k (0, 1) double le groupe clavier k + 1 : un joueur local peut passer de l'un à
// l'autre sans rien régler. Sondage à chaque tick (l'API n'émet pas d'événements de boutons).
import type { LocalGroup, LocalState } from './types.ts'

/** Mapping « standard » (W3C) : A 0, B 1, RB 5, RT 7, croix 12..15. */
const BTN_A = 0
const BTN_B = 1
const BTN_RB = 5
const BTN_RT = 7
const DPAD_UP = 12
const DPAD_DOWN = 13
const DPAD_LEFT = 14
const DPAD_RIGHT = 15
/** Zone morte radiale du stick (les manettes dérivent) ; la sim applique la sienne ensuite. */
const STICK_DEAD = 0.18
const TRIGGER_ON = 0.45

interface PadTrack {
  connected: boolean
  dive: boolean
  flap: boolean
  divePresses: number
  flapPresses: number
  x: number
  y: number
}

const newTrack = (): PadTrack => ({ connected: false, dive: false, flap: false, divePresses: 0, flapPresses: 0, x: 0, y: 0 })

export class GamepadSource {
  private readonly pads: PadTrack[] = [newTrack(), newTrack()]
  /** Appelé sur un appui de PLONGER (rejoindre le salon). */
  onDivePress: ((group: LocalGroup) => void) | null = null
  private lastPoll = -1

  /** Sonde les manettes (appelé au plus une fois par frame). */
  poll(now: number): void {
    if (now === this.lastPoll) return
    this.lastPoll = now
    const list = typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function' ? navigator.getGamepads() : []
    for (let i = 0; i < this.pads.length; i++) {
      const t = this.pads[i]!
      const pad = list[i]
      if (!pad || !pad.connected) {
        t.connected = false
        t.dive = t.flap = false
        t.x = t.y = 0
        continue
      }
      t.connected = true
      const b = pad.buttons
      const pressed = (k: number) => !!b[k] && (b[k]!.pressed || b[k]!.value > TRIGGER_ON)
      const dive = pressed(BTN_A) || pressed(BTN_RT)
      const flap = pressed(BTN_B) || pressed(BTN_RB)
      if (dive && !t.dive) {
        t.divePresses++
        this.onDivePress?.((i + 1) as LocalGroup)
      }
      if (flap && !t.flap) t.flapPresses++
      t.dive = dive
      t.flap = flap
      let x = pad.axes[0] ?? 0
      let y = -(pad.axes[1] ?? 0) // axe Y du stick vers le bas → nord vers le haut
      const m = Math.hypot(x, y)
      if (m < STICK_DEAD) x = y = 0
      else {
        const k = Math.min(1, (m - STICK_DEAD) / (1 - STICK_DEAD)) / m
        x *= k
        y *= k
      }
      const dx = (pressed(DPAD_RIGHT) ? 1 : 0) - (pressed(DPAD_LEFT) ? 1 : 0)
      const dy = (pressed(DPAD_UP) ? 1 : 0) - (pressed(DPAD_DOWN) ? 1 : 0)
      if (dx || dy) {
        const k = dx && dy ? Math.SQRT1_2 : 1
        x = dx * k
        y = dy * k
      }
      t.x = x
      t.y = y
    }
  }

  connected(group: LocalGroup): boolean {
    return this.pads[group - 1]?.connected ?? false
  }

  /** Mêle l'état de la manette du groupe à `out` (déjà rempli par le clavier). */
  merge(group: LocalGroup, out: LocalState): LocalState {
    const t = this.pads[group - 1]
    if (!t || !t.connected) return out
    if (out.dirX === 0 && out.dirY === 0) {
      out.dirX = t.x
      out.dirY = t.y
    }
    out.dive = out.dive || t.dive
    out.divePresses += t.divePresses
    out.flapPresses += t.flapPresses
    return out
  }
}
