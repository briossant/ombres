// Rig d'un oiseau : squelette, maillage skinné, coque d'encre, caster d'ombre,
// et application d'une BirdPose aux os. Une instance par oiseau affiché ; la
// géométrie est partagée (BirdAsset).
import { Bone, Euler, Group, Matrix4, Skeleton, SkinnedMesh, Vector3, type ShaderMaterial } from 'three'
import { buildBirdModel, type BirdDetail, type BirdModel } from './geometry.ts'
import { createBirdMaterials, type BirdUniforms } from './material.ts'
import type { BirdPose, WingPose } from './pose.ts'
import { ANCHOR_NAMES, BONE_NAMES, BONE_PARENT, type AnchorName, type BoneName } from './skeleton.ts'

/** Géométrie partagée par tous les oiseaux d'un niveau de détail. */
export interface BirdAsset {
  detail: BirdDetail
  model: BirdModel
}

const assets = new Map<BirdDetail, BirdAsset>()

export function getBirdAsset(detail: BirdDetail): BirdAsset {
  let a = assets.get(detail)
  if (!a) {
    a = { detail, model: buildBirdModel(detail) }
    assets.set(detail, a)
  }
  return a
}

const IDENTITY = new Matrix4()
const _e = new Euler()
const SIDES = ['L', 'R'] as const

export class BirdRig {
  /** Racine à ajouter à la scène (identité) : contient le groupe mobile et les maillages. */
  readonly object = new Group()
  /** Transformation monde de l'oiseau (position, orientation, échelle) : porte le squelette. */
  readonly group = new Group()
  /**
   * Maillage skinné en mode « detached » à matrixWorld identité : les positions
   * skinnées sont en monde. Le proxy caster de la height map (même squelette,
   * même matrixWorld par référence) reproduit donc exactement la déformation.
   */
  readonly mesh: SkinnedMesh
  readonly hull: SkinnedMesh
  readonly skeleton: Skeleton
  readonly bones = {} as Record<BoneName, Bone>
  readonly uniforms: BirdUniforms
  readonly riderId: { value: number }
  readonly bodyMaterial: ShaderMaterial
  readonly hullMaterial: ShaderMaterial
  /** Ancres des FX : os et position locale à l'os. */
  private readonly anchorBone: Bone[] = []
  private readonly anchorLocal: Vector3[] = []
  private readonly bindPos: Record<BoneName, Vector3>
  private shownDetail: BirdDetail
  /** Os des ailes (épaule, coude, poignet, doigt) et des pattes (cuisse, tibia), par côté : pas de
   *  nom d'os construit à chaque frame (une chaîne allouée par accès, polish vague 2). */
  private readonly wingBones: Record<'L' | 'R', readonly [Bone, Bone, Bone, Bone]>
  private readonly legBones: Record<'L' | 'R', readonly [Bone, Bone]>

  constructor(readonly asset: BirdAsset) {
    const { model } = asset
    this.shownDetail = asset.detail
    this.group.name = 'bird'
    this.bindPos = {} as Record<BoneName, Vector3>
    for (const name of BONE_NAMES) {
      const b = new Bone()
      b.name = name
      this.bones[name] = b
      this.bindPos[name] = new Vector3(...model.bind[name])
    }
    for (const name of BONE_NAMES) {
      const parent = BONE_PARENT[name]
      const b = this.bones[name]
      const p = this.bindPos[name]
      if (parent) {
        b.position.copy(p).sub(this.bindPos[parent])
        this.bones[parent].add(b)
      } else b.position.copy(p)
    }
    const mats = createBirdMaterials(model)
    this.uniforms = mats.uniforms
    this.riderId = mats.riderId
    this.bodyMaterial = mats.body
    this.hullMaterial = mats.hull
    this.object.name = 'bird'
    this.group.add(this.bones.root)
    this.object.add(this.group)
    this.object.updateMatrixWorld(true)
    this.skeleton = new Skeleton(BONE_NAMES.map(n => this.bones[n]))
    const skinned = (name: string, mat: ShaderMaterial) => {
      const m = new SkinnedMesh(model.geometry, mat)
      m.name = name
      m.frustumCulled = false
      m.bindMode = 'detached'
      m.bind(this.skeleton, IDENTITY)
      m.matrixAutoUpdate = false
      m.matrix.identity()
      return m
    }
    this.mesh = skinned('birdBody', mats.body)
    this.hull = skinned('birdHull', mats.hull)
    this.object.add(this.mesh, this.hull)

    const B = this.bones
    this.wingBones = { L: [B.shoulderL, B.elbowL, B.wristL, B.fingerL], R: [B.shoulderR, B.elbowR, B.wristR, B.fingerR] }
    this.legBones = { L: [B.thighL, B.shinL], R: [B.thighR, B.shinR] }

    for (const a of ANCHOR_NAMES) {
      const def = model.anchors[a]
      this.anchorBone.push(this.bones[def.bone])
      this.anchorLocal.push(new Vector3(...def.pos).sub(this.bindPos[def.bone]))
    }
  }

  private setWing(side: 'L' | 'R', w: WingPose): void {
    const s = side === 'L' ? 1 : -1
    const wb = this.wingBones[side]
    // Ordre YZX : vrillage (X) puis battement (Z) puis flèche (Y), dans le repère parent.
    wb[0].quaternion.setFromEuler(_e.set(-w.shoulderTwist, s * w.shoulderSweep, s * w.shoulderFlap, 'YZX'))
    wb[1].quaternion.setFromEuler(_e.set(0, s * w.elbowSweep, s * w.elbowFlap, 'YZX'))
    wb[2].quaternion.setFromEuler(_e.set(-w.wristTwist, s * w.wristSweep, s * w.wristFlap, 'YZX'))
    wb[3].quaternion.setFromEuler(_e.set(0, s * w.fingerSweep, s * w.fingerFlap, 'YZX'))
  }

  /** Applique une pose complète (transformation du groupe et rotations des os). */
  applyPose(p: BirdPose): void {
    const g = this.group
    g.position.set(p.px, p.py, p.pz)
    g.rotation.set(-p.pitch, p.yaw, -p.roll, 'YXZ')
    g.scale.setScalar(p.scale)
    const B = this.bones
    B.root.position.set(this.bindPos.root.x, this.bindPos.root.y + p.bodyLift, this.bindPos.root.z)
    // Tangage + = nez en haut : rotation autour de +X négative (Z avant, Y haut).
    B.root.quaternion.setFromEuler(_e.set(-p.bodyPitch, 0, -p.bodyRoll, 'YXZ'))
    this.setWing('L', p.wingL)
    this.setWing('R', p.wingR)
    const np = -p.neckPitch / 3
    const ny = p.neckYaw / 3
    B.neck1.quaternion.setFromEuler(_e.set(np, ny, 0))
    B.neck2.quaternion.setFromEuler(_e.set(np, ny, 0))
    B.neck3.quaternion.setFromEuler(_e.set(np, ny, 0))
    B.head.quaternion.setFromEuler(_e.set(-p.headPitch, p.headYaw, p.headRoll, 'YXZ'))
    // Queue : + tangage = bout de queue vers le haut.
    B.tail1.quaternion.setFromEuler(_e.set(p.tailPitch * 0.5, p.tailYaw * 0.5, p.tailRoll * 0.5, 'YXZ'))
    B.tail2.quaternion.setFromEuler(_e.set(p.tailPitch * 0.5, p.tailYaw * 0.5, p.tailRoll * 0.5, 'YXZ'))
    B.tail2.scale.set(p.tailSpread, 1, 1)
    // Pattes : repliées vers l'arrière → sorties vers le bas (perché).
    // En vol, les pattes sont rentrées sous le ventre (réduites, plaquées).
    for (const s of SIDES) {
      const lb = this.legBones[s]
      lb[0].quaternion.setFromEuler(_e.set(0.22 - p.legs * 1.45, 0, 0))
      lb[0].scale.setScalar(0.55 + 0.45 * p.legs)
      lb[1].quaternion.setFromEuler(_e.set(0.15 + p.legs * 0.25, 0, 0))
    }
    B.rider.position.set(this.bindPos.rider.x, this.bindPos.rider.y + p.riderLift, this.bindPos.rider.z).sub(this.bindPos.chest)
    B.rider.quaternion.setFromEuler(_e.set(p.riderPitch, 0, p.riderRoll, 'YXZ'))
    B.cape1.quaternion.setFromEuler(_e.set(p.cape1Pitch, p.cape1Yaw, 0, 'YXZ'))
    B.cape2.quaternion.setFromEuler(_e.set(p.cape2Pitch, p.cape2Yaw, 0, 'YXZ'))
    const ps = Math.max(1e-3, p.pennant)
    B.pole.scale.setScalar(ps)
    B.pen1.quaternion.setFromEuler(_e.set(p.pen1Pitch, p.pen1Yaw, 0, 'YXZ'))
    B.pen2.quaternion.setFromEuler(_e.set(p.pen2Pitch, p.pen2Yaw, 0, 'YXZ'))
  }

  /** Niveau de détail affiché (géométrie partagée ; squelette, poids et ancres identiques). */
  get detail(): BirdDetail {
    return this.shownDetail
  }

  setDetail(asset: BirdAsset): void {
    if (asset.detail === this.shownDetail) return
    this.shownDetail = asset.detail
    this.mesh.geometry = asset.model.geometry
    this.hull.geometry = asset.model.geometry
  }

  /** Position monde d'une ancre (après updateMatrixWorld). */
  anchor(name: AnchorName, out: Vector3): Vector3 {
    const i = ANCHOR_NAMES.indexOf(name)
    return out.copy(this.anchorLocal[i]!).applyMatrix4(this.anchorBone[i]!.matrixWorld)
  }

  /** Écrit toutes les ancres (x, y, z three) dans `out` à partir de `offset`. */
  writeAnchors(out: Float32Array, offset: number, tmp: Vector3): void {
    for (let i = 0; i < ANCHOR_NAMES.length; i++) {
      tmp.copy(this.anchorLocal[i]!).applyMatrix4(this.anchorBone[i]!.matrixWorld)
      out[offset + i * 3] = tmp.x
      out[offset + i * 3 + 1] = tmp.y
      out[offset + i * 3 + 2] = tmp.z
    }
  }

  dispose(): void {
    this.bodyMaterial.dispose()
    this.hullMaterial.dispose()
    this.skeleton.dispose()
    this.object.removeFromParent()
  }
}
