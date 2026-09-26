// Constantes de gameplay dont la manette a besoin, extraites de RULES (source unique : src/sim/rules.ts).
// src/phone n'importe jamais src/sim directement (tools/check-boundaries.mjs) : il passe par ce
// sous-ensemble, qui garde le bundle téléphone indépendant de la simulation.
import { RULES } from '../sim/rules.ts'

export const PHONE_RULES = {
  joystickRadiusPx: RULES.joystickRadiusPx,
  stickDeadzone: RULES.stickDeadzone,
  buttonDiveHeightFrac: RULES.buttonDiveHeightFrac,
  buttonFlapHeightFrac: RULES.buttonFlapHeightFrac,
  pauseLongPressSeconds: RULES.pauseLongPressSeconds,
  tiltDeadzoneDeg: RULES.tiltDeadzoneDeg,
  tiltMaxDeg: RULES.tiltMaxDeg,
  inputSendHz: RULES.inputSendHz,
  flapCooldown: RULES.flapCooldown,
  // Altitudes et vitesses verticales : animation locale (instantanée) de l'icône de PLONGER.
  altLow: RULES.altLow,
  altHigh: RULES.altHigh,
  descendRate: RULES.descendRate,
  climbRate: RULES.climbRate,
  lobbyGoalFlySeconds: RULES.lobbyGoalFlySeconds,
  lobbyGoalDiveHoldSeconds: RULES.lobbyGoalDiveHoldSeconds,
  rulesCardsSeconds: RULES.rulesCardsSeconds,
  interludeMaxSeconds: RULES.interludeMaxSeconds,
  rematchVoteSeconds: RULES.rematchVoteSeconds,
} as const
