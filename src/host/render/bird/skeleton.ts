// Squelette de l'oiseau et de son cavalier.
// Repère modèle : X = gauche de l'oiseau, Y = haut, Z = avant (mètres).
// Pose de liaison : toutes les rotations sont nulles ; chaque os est placé à son
// articulation. Les rotations de pose sont donc exprimées dans ce repère.

export const BONE_NAMES = [
  'root',
  'pelvis',
  'tail1',
  'tail2',
  'thighL',
  'shinL',
  'thighR',
  'shinR',
  'chest',
  'neck1',
  'neck2',
  'neck3',
  'head',
  'shoulderL',
  'elbowL',
  'wristL',
  'fingerL',
  'shoulderR',
  'elbowR',
  'wristR',
  'fingerR',
  'rider',
  'cape1',
  'cape2',
  'pole',
  'pen1',
  'pen2',
] as const

export type BoneName = (typeof BONE_NAMES)[number]

export const BONE_INDEX: Readonly<Record<BoneName, number>> = Object.fromEntries(
  BONE_NAMES.map((n, i) => [n, i]),
) as Record<BoneName, number>

export const BONE_PARENT: Readonly<Record<BoneName, BoneName | null>> = {
  root: null,
  pelvis: 'root',
  tail1: 'pelvis',
  tail2: 'tail1',
  thighL: 'pelvis',
  shinL: 'thighL',
  thighR: 'pelvis',
  shinR: 'thighR',
  chest: 'root',
  neck1: 'chest',
  neck2: 'neck1',
  neck3: 'neck2',
  head: 'neck3',
  shoulderL: 'chest',
  elbowL: 'shoulderL',
  wristL: 'elbowL',
  fingerL: 'wristL',
  shoulderR: 'chest',
  elbowR: 'shoulderR',
  wristR: 'elbowR',
  fingerR: 'wristR',
  rider: 'chest',
  cape1: 'rider',
  cape2: 'cape1',
  pole: 'rider',
  pen1: 'pole',
  pen2: 'pen1',
}

export type Vec3Tuple = [number, number, number]

/** Positions de liaison (repère modèle) de chaque os. */
export type BindPositions = Record<BoneName, Vec3Tuple>

/** Points d'ancrage des FX, exprimés dans le repère d'un os (pose de liaison). */
export interface AnchorDef {
  bone: BoneName
  /** Position de liaison dans le repère modèle ; convertie en local à l'os par le rig. */
  pos: Vec3Tuple
}

export const ANCHOR_NAMES = ['tail', 'tipL', 'tipR', 'head', 'beak', 'riderTop', 'chest'] as const
export type AnchorName = (typeof ANCHOR_NAMES)[number]
