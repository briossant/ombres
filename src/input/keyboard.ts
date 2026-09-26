// Clavier du PC (GDD §12.2) : positions physiques (KeyboardEvent.code), deux groupes.
//
//   Groupe 1 : KeyW/A/S/D (+ flèches tant que le groupe 2 n'a pas rejoint), PLONGER = Space,
//              COUP D'AILE = ShiftLeft (+ ShiftRight en solo).
//   Groupe 2 : KeyI/J/K/L ou Numpad8/4/5/6, PLONGER = AltRight (AltGr) ou Numpad0,
//              COUP D'AILE = Semicolon (M en AZERTY) ou NumpadEnter.
//
// Directions en 8 secteurs (aucune touche = on garde le cap). Toutes ces touches appellent
// preventDefault. Sous Windows, AltGr émet aussi ControlLeft : ignoré tant que AltRight est
// enfoncé. Échap / Start ne sont PAS gérés ici (l'UI s'en charge : pause).
// Les événements synthétiques (manette → flèches de navigation de l'UI) sont ignorés.
import type { LocalGroup, LocalState } from './types.ts'

interface GroupKeys {
  up: readonly string[]
  down: readonly string[]
  left: readonly string[]
  right: readonly string[]
  dive: readonly string[]
  flap: readonly string[]
}

const G1: GroupKeys = { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dive: ['Space'], flap: ['ShiftLeft'] }
/** Touches « solo » du groupe 1, retirées dès qu'un deuxième joueur partage le clavier. */
const G1_SOLO: GroupKeys = { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'], dive: [], flap: ['ShiftRight'] }
const G2: GroupKeys = {
  up: ['KeyI', 'Numpad8'],
  down: ['KeyK', 'Numpad5', 'Numpad2'],
  left: ['KeyJ', 'Numpad4'],
  right: ['KeyL', 'Numpad6'],
  dive: ['AltRight', 'Numpad0'],
  flap: ['Semicolon', 'NumpadEnter'],
}

const ALL_CODES = new Set<string>()
for (const g of [G1, G1_SOLO, G2]) for (const list of Object.values(g) as string[][]) for (const c of list) ALL_CODES.add(c)

const SQRT1_2 = Math.SQRT1_2

export type KeyboardJoinHandler = (group: LocalGroup) => void

export class KeyboardSource {
  private readonly down = new Set<string>()
  private readonly presses = [
    { dive: 0, flap: 0 },
    { dive: 0, flap: 0 },
  ]
  private readonly held = [
    { dive: false, flap: false },
    { dive: false, flap: false },
  ]
  /** Le groupe 2 joue : le groupe 1 perd les flèches et Maj droite. */
  private shared = false
  /** Capture active (touches de jeu : preventDefault). Faux sur les écrans de menu. */
  capture = true
  /** Appelé au premier appui de PLONGER d'un groupe (rejoindre le salon). */
  onDivePress: KeyboardJoinHandler | null = null
  /** Empêche NumpadEnter d'atteindre la navigation de l'UI (COUP D'AILE du joueur 2 au pavé). */
  swallowNumpadEnter = false
  private installed = false

  install(target: Window = window): () => void {
    if (this.installed) return () => undefined
    this.installed = true
    const kd = (e: KeyboardEvent) => this.onKey(e, true)
    const ku = (e: KeyboardEvent) => this.onKey(e, false)
    const blur = () => this.releaseAll()
    // Phase de capture : avant la navigation de l'UI (écouteurs en bulle sur window).
    target.addEventListener('keydown', kd, true)
    target.addEventListener('keyup', ku, true)
    target.addEventListener('blur', blur)
    const doc = typeof document !== 'undefined' ? document : null
    const vis = () => doc?.visibilityState !== 'visible' && this.releaseAll()
    doc?.addEventListener('visibilitychange', vis)
    return () => {
      this.installed = false
      target.removeEventListener('keydown', kd, true)
      target.removeEventListener('keyup', ku, true)
      target.removeEventListener('blur', blur)
      doc?.removeEventListener('visibilitychange', vis)
    }
  }

  private onKey(e: KeyboardEvent, isDown: boolean): void {
    if (!e.isTrusted) return
    const code = e.code
    // AltGr sous Windows : ControlLeft fantôme.
    if (code === 'ControlLeft' && this.down.has('AltRight')) {
      e.preventDefault()
      return
    }
    if (!ALL_CODES.has(code)) return
    if (this.capture) {
      e.preventDefault()
      if (code === 'NumpadEnter' && this.swallowNumpadEnter) e.stopImmediatePropagation()
    }
    if (isDown) {
      if (this.down.has(code)) return // répétition automatique
      this.down.add(code)
    } else {
      this.down.delete(code)
    }
    this.refreshButtons(isDown ? code : null)
  }

  private keys(group: LocalGroup, part: keyof GroupKeys, fn: (code: string) => boolean): boolean {
    const main = group === 1 ? G1 : G2
    for (const c of main[part]) if (fn(c)) return true
    if (group === 1 && !this.shared) for (const c of G1_SOLO[part]) if (fn(c)) return true
    return false
  }

  private isDown = (code: string): boolean => this.down.has(code)

  /** Recalcule les boutons maintenus ; compte les appuis sur front montant. */
  private refreshButtons(pressed: string | null): void {
    for (const group of [1, 2] as const) {
      const h = this.held[group - 1]!
      const p = this.presses[group - 1]!
      const dive = this.keys(group, 'dive', this.isDown)
      const flap = this.keys(group, 'flap', this.isDown)
      if (dive && !h.dive) {
        p.dive++
        if (pressed !== null) this.onDivePress?.(group)
      }
      if (flap && !h.flap) p.flap++
      h.dive = dive
      h.flap = flap
    }
  }

  /** Clavier partagé (groupe 2 présent) : le groupe 1 garde ZQSD/WASD, Espace et Maj gauche. */
  setShared(shared: boolean): void {
    if (shared === this.shared) return
    this.shared = shared
    this.refreshButtons(null)
  }

  releaseAll(): void {
    this.down.clear()
    this.refreshButtons(null)
  }

  /** État du groupe (direction en 8 secteurs, repère monde : +y = nord = haut de l'écran). */
  read(group: LocalGroup, out: LocalState): LocalState {
    const up = this.keys(group, 'up', this.isDown)
    const down = this.keys(group, 'down', this.isDown)
    const left = this.keys(group, 'left', this.isDown)
    const right = this.keys(group, 'right', this.isDown)
    const dx = (right ? 1 : 0) - (left ? 1 : 0)
    const dy = (up ? 1 : 0) - (down ? 1 : 0)
    const k = dx !== 0 && dy !== 0 ? SQRT1_2 : 1
    out.dirX = dx * k
    out.dirY = dy * k
    const h = this.held[group - 1]!
    const p = this.presses[group - 1]!
    out.dive = h.dive
    out.divePresses = p.dive
    out.flapPresses = p.flap
    return out
  }

  /** Une touche du groupe est-elle enfoncée (activité) ? */
  active(group: LocalGroup): boolean {
    for (const part of ['up', 'down', 'left', 'right', 'dive', 'flap'] as const) if (this.keys(group, part, this.isDown)) return true
    return false
  }
}
