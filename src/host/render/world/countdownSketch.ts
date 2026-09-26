// « Du crayonné à la couleur » (polish W13) : pendant le compte à rebours d'une manche (« 3, 2, 1 »),
// la scène est un crayonné (la couleur recule vers le papier, les traits d'encre restent : même
// mélange que le flash « planche ») ; à « Envol ! », la couleur coule d'ouest en est en 0,8 s
// (le masque du front de nuit à l'envers). Lit gameView, écrit NPR.uSketch* (InkEffect). Désactivé
// par « Réduire les flashs ». Hors compte à rebours : uSketch = 0, la branche du shader est sautée.
import { getSettings } from '../../settings.ts'
import type { GameView } from '../../view.ts'
import { NPR } from '../npr/uniforms.ts'

/** Crayonné tenu pendant le compte à rebours (fraction du flash « planche »). */
export const SKETCH_HOLD = 0.62
/** Durée de la coulée de couleur d'ouest en est (s réelles). */
export const SKETCH_FLOW_S = 0.8
/** Marge (m) au-delà de l'arène : la coulée part hors cadre et finit hors cadre. */
const SPAN_MARGIN = 40

let wasCountdown = false
let flowStart = -1
let lastSim: unknown = null

const easeInOut = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - 2 * (1 - t) * (1 - t))

export function updateCountdownSketch(view: GameView): void {
  const sim = view.sim
  const span = (sim?.arena.a ?? 165) + SPAN_MARGIN
  NPR.uSketchSpan.value = span
  if (!sim || sim.config.mode !== 'round' || getSettings().reduceFlashes) {
    wasCountdown = false
    flowStart = -1
    lastSim = sim
    NPR.uSketch.value = 0
    return
  }
  if (sim !== lastSim) {
    // nouvelle manche (ou reprise) : on ne rejoue pas la coulée d'une manche déjà partie
    lastSim = sim
    wasCountdown = sim.sun.t < 0
    flowStart = -1
  }
  const countdown = sim.sun.t < 0
  if (countdown) {
    wasCountdown = true
    flowStart = -1
    NPR.uSketch.value = SKETCH_HOLD
    NPR.uSketchFront.value = -span
    return
  }
  if (wasCountdown) {
    wasCountdown = false
    flowStart = view.realTime
  }
  if (flowStart < 0) {
    NPR.uSketch.value = 0
    return
  }
  const k = (view.realTime - flowStart) / SKETCH_FLOW_S
  if (k >= 1) {
    flowStart = -1
    NPR.uSketch.value = 0
    return
  }
  NPR.uSketch.value = SKETCH_HOLD
  NPR.uSketchFront.value = -span + 2 * span * easeInOut(Math.max(0, k))
}
