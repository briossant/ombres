// Espace des IDs d'objet (canal A de gNormalId, 8 bits). L'InkEffect trace un
// trait d'encre à toute frontière d'ID (R3), côté objet au premier plan, sauf sur
// le ciel (0) et le sol (1). Deux pièces d'un même objet qui ne doivent PAS être
// cernées partagent le même ID ; une pièce à cerner (cape, bande d'aile, dôme) en
// prend un autre.
export const OBJ_ID = {
  sky: 0,
  ground: 1,
  /** Horizon : Falaise, mesas, Géantes lointaines (silhouettes). */
  falaise: 2,
  mesa: 3,
  horizonGiant: 4,
  storm: 5,
  /** Oiseau du slot s : bird(s) = 20 + s ; ses pièces colorées : birdAccent(s) = 60 + s. */
  birdBase: 20,
  /** Cavalier (cuir) et mât du slot s : 44 + s (cerné contre le dos de l'oiseau). */
  riderBase: 44,
  birdAccentBase: 60,
  /** Tour i : towerBase + 4 i + pièce (0 corps, 1 accent/dôme, 2 disque, 3 détail). */
  towerBase: 80,
  /** FX encrés qui veulent un contour post (rares : la plupart écrivent 0). */
  fxBase: 220,
  /** Couronne du meneur (agent birds). */
  crown: 221,
} as const

export const birdId = (slot: number): number => OBJ_ID.birdBase + slot
export const birdAccentId = (slot: number): number => OBJ_ID.birdAccentBase + slot
export const riderId = (slot: number): number => OBJ_ID.riderBase + slot
export const towerId = (index: number, part = 0): number => OBJ_ID.towerBase + ((index * 4 + part) % 136)
