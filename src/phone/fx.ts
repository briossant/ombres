// Retours d'événements sur le téléphone : vibration (GDD §12.3) + effet visuel (FxLayer).
// Sans vibration (iOS), chaque vibration devient un flash de la bordure.
import { CUE_HAPTICS, type PhoneCue } from '../shared/messages.ts'
import { vibrate } from './device/haptics.ts'

export type FxEvent =
  | { kind: 'cue'; cue: PhoneCue; n?: number; at: number }
  /** Flash de bordure (remplace une vibration). */
  | { kind: 'flash'; at: number }
  /** Retour local immédiat d'un appui (latence masquée). */
  | { kind: 'press'; button: 'dive' | 'flap'; at: number }

type Listener = (e: FxEvent) => void
const listeners = new Set<Listener>()

/** Événements qui ont déjà leur propre effet visuel fort : pas de flash de remplacement. */
const HAS_VISUAL = new Set<PhoneCue>(['windup', 'clac', 'hit', 'stunned', 'dodge', 'planted', 'crown', 'roundWin', 'countdown', 'go'])

function emit(e: FxEvent): void {
  for (const l of listeners) l(e)
}

export const fx = {
  subscribe(l: Listener): () => void {
    listeners.add(l)
    return () => void listeners.delete(l)
  },
  cue(cue: PhoneCue, n?: number): void {
    const pattern = CUE_HAPTICS[cue]
    const vibrated = pattern.length > 0 && vibrate(pattern)
    emit({ kind: 'cue', cue, n, at: performance.now() })
    if (pattern.length > 0 && !vibrated && !HAS_VISUAL.has(cue)) emit({ kind: 'flash', at: performance.now() })
  },
  flash(): void {
    emit({ kind: 'flash', at: performance.now() })
  },
  /** Appui local : vibration très brève et retour visuel, sans attendre le PC. */
  press(button: 'dive' | 'flap'): void {
    vibrate(button === 'flap' ? [12] : [6])
    emit({ kind: 'press', button, at: performance.now() })
  },
}
