// Pose de l'oiseau : de simples nombres, produits par l'animateur et appliqués
// aux os par le rig. Séparer les deux permet de tester l'animation sans three.

export interface WingPose {
  /** Battement (rad, + = aile vers le haut). */
  shoulderFlap: number
  /** Flèche (rad, + = vers l'arrière). */
  shoulderSweep: number
  /** Vrillage (rad, + = bord d'attaque vers le haut). */
  shoulderTwist: number
  elbowFlap: number
  elbowSweep: number
  wristFlap: number
  wristSweep: number
  wristTwist: number
  fingerFlap: number
  fingerSweep: number
}

const wing = (): WingPose => ({
  shoulderFlap: 0,
  shoulderSweep: 0,
  shoulderTwist: 0,
  elbowFlap: 0,
  elbowSweep: 0,
  wristFlap: 0,
  wristSweep: 0,
  wristTwist: 0,
  fingerFlap: 0,
  fingerSweep: 0,
})

export class BirdPose {
  // Transformation globale (appliquée au groupe de l'oiseau).
  /** Position three (m). */
  px = 0
  py = 0
  pz = 0
  /** Lacet three (rad), tangage (+ = nez en haut), roulis (+ = aile gauche en bas). */
  yaw = 0
  pitch = 0
  roll = 0
  /** Échelle cosmétique. */
  scale = 1

  // Corps (os racine).
  bodyLift = 0
  bodyPitch = 0
  bodyRoll = 0

  readonly wingL: WingPose = wing()
  readonly wingR: WingPose = wing()

  /** Cou : tangage réparti sur les 3 os (+ = relève), lacet (+ = vers la gauche). */
  neckPitch = 0
  neckYaw = 0
  headPitch = 0
  headYaw = 0
  headRoll = 0

  tailPitch = 0
  tailYaw = 0
  tailRoll = 0
  /** Écartement de l'éventail (échelle X de la queue). */
  tailSpread = 1

  /** Pattes : 0 = repliées, 1 = sorties (perché). */
  legs = 0

  riderPitch = 0
  riderRoll = 0
  riderLift = 0

  cape1Pitch = 0
  cape1Yaw = 0
  cape2Pitch = 0
  cape2Yaw = 0

  /** Visibilité du mât et du fanion (0 = masqués, niveau de détail). */
  pennant = 1
  pen1Yaw = 0
  pen1Pitch = 0
  pen2Yaw = 0
  pen2Pitch = 0
}
