// Pilote impératif des oiseaux : un rig + un animateur par slot présent dans la
// simulation, mis à jour à chaque frame depuis gameView (état interpolé), sans
// re-render React. Utilisable hors React (écran titre, podium) via update().
import { Euler, Group, Matrix4, Quaternion, Vector3, type Camera, type PerspectiveCamera } from 'three'
import { RULES } from '../../../sim/rules.ts'
import { MAX_PLAYERS, PLAYER_COLORS } from '../../../shared/players.ts'
import type { GameView } from '../../view.ts'
import { ANCHOR_STRIDE, anchorOffset, birdAnchors, birdAnimEvents, crownLift, type WingbeatEvent } from './anchors.ts'
import { BirdAnimator, emptyFrame, frameFromStates, type BirdFrame, type BirdMode } from './animator.ts'
import { CrownMesh } from './crown.ts'
import type { BirdDetail } from './geometry.ts'
import { glyphIndex } from './glyphs.ts'
import { clamp, clamp01, hash01, smoothstep, spring, springTo, type Spring } from './math.ts'
import { OUTLINE_ID, addBirdCaster, hexToLinear, type CasterHandle } from './npr.ts'
import { BirdRig, getBirdAsset } from './rig.ts'

export interface BirdsOptions {
  detail: BirdDetail
  /** Échelle cosmétique : 'auto' = envergure ≥ 60 px à l'écran, plafonnée à RULES.birdRenderScaleMax. */
  renderScale: number | 'auto'
  /** Enregistre l'« âme » de chaque oiseau dans la height shadow map. */
  castShadows: boolean
}

/** Envergure visée à l'écran par l'échelle automatique (px en 1080p). */
const AUTO_SCALE_SPAN_PX = 60
/** Taille minimale de la couronne à l'écran (px en 1080p, ART_BIBLE §6.7). */
const CROWN_MIN_PX = 16
/** Bascule vers le maillage détaillé au-delà de cette envergure à l'écran (px 1080p)… */
const NEAR_IN_PX = 240
/** …et retour au maillage léger en dessous de celle-ci. */
const NEAR_OUT_PX = 190

class BirdSlot {
  readonly rig: BirdRig
  readonly animator: BirdAnimator
  readonly frame: BirdFrame = emptyFrame()
  caster: CasterHandle | null = null
  readonly hidden: Spring = spring(0)
  tipFlash = 0
  prevCharge = 1
  colorIndex = -1
  seen = 0
  fresh = true

  /** Gros plan (détail « near ») ou distance de jeu (« far »). */
  near = false

  constructor(readonly slot: number) {
    // Créé au niveau « far » : le caster de l'ombre garde cette géométrie légère.
    this.rig = new BirdRig(getBirdAsset('far'))
    this.animator = new BirdAnimator(slot * 7919 + 13)
    this.rig.uniforms.uId.value = OUTLINE_ID.birdBase + slot
    this.rig.riderId.value = OUTLINE_ID.riderBase + slot
  }
}

const _v = new Vector3()
const _w = new Vector3()
const _up = new Vector3()
const _x = new Vector3()
const _z = new Vector3()
const _m = new Matrix4()
const _q = new Quaternion()
const _eul = new Euler()

export class BirdsController {
  readonly root = new Group()
  readonly crown = new CrownMesh()
  private readonly slots: (BirdSlot | undefined)[] = new Array(MAX_PLAYERS)
  private frameNo = 0
  private crownSlot = -1
  private readonly crownScale: Spring = spring(0)
  private crownTime = 0
  /** Modes de mise en scène par slot (podium). */
  readonly modes: (BirdMode | undefined)[] = new Array(MAX_PLAYERS)
  /** Événement réutilisé (pas d'allocation par battement) : les abonnés ne doivent pas le conserver. */
  private readonly beatEvent: WingbeatEvent = { type: 'wingbeat', slot: 0, amp: 0, power: false, x: 0, y: 0, z: 0 }

  constructor(public options: BirdsOptions) {
    this.root.name = 'birds'
    this.root.add(this.crown.group)
  }

  private ensure(slot: number): BirdSlot {
    let s = this.slots[slot]
    if (!s) {
      s = new BirdSlot(slot)
      this.slots[slot] = s
      this.root.add(s.rig.object)
      if (this.options.castShadows) s.caster = addBirdCaster(s.rig.mesh, slot)
    }
    return s
  }

  private drop(slot: number): void {
    const s = this.slots[slot]
    if (!s) return
    s.caster?.dispose()
    s.rig.dispose()
    this.slots[slot] = undefined
    birdAnchors.frame[slot] = -1
  }

  /** Nombre d'oiseaux affichés. */
  get count(): number {
    return this.slots.reduce((n, s) => n + (s ? 1 : 0), 0)
  }

  /** Accès direct au rig d'un slot (mise en scène, tests). */
  rig(slot: number): BirdRig | undefined {
    return this.slots[slot]?.rig
  }

  /**
   * Met à jour tous les oiseaux.
   * @param dtReal secondes réelles écoulées depuis la frame précédente
   * @param viewportH hauteur du buffer de rendu (px), pour la taille à l'écran
   */
  update(view: GameView, camera: Camera, dtReal: number, viewportH: number): void {
    const sim = view.sim
    this.frameNo++
    birdAnchors.counter = this.frameNo
    const dt = clamp(dtReal, 0, 0.1) * view.timeScale
    if (!sim) {
      for (let i = 0; i < MAX_PLAYERS; i++) if (this.slots[i]) this.slots[i]!.rig.object.visible = false
      this.crown.group.visible = false
      return
    }
    const cam = camera as PerspectiveCamera
    const fovY = cam.isPerspectiveCamera ? (cam.fov * Math.PI) / 180 : Math.PI / 4
    const pxPerMeterAt1 = viewportH / (2 * Math.tan(fovY / 2))
    const px1080 = viewportH / 1080
    camera.getWorldPosition(_w)

    for (const b of sim.birds) {
      const s = this.ensure(b.slot)
      s.seen = this.frameNo
      const rig = s.rig
      rig.object.visible = true
      frameFromStates(b, view.prevBirds[b.slot], view.alpha, s.frame)
      const f = s.frame

      // Taille à l'écran (envergure non mise à l'échelle), détail et échelle automatique.
      _v.set(f.x, f.z, -f.y)
      const dist = Math.max(1, _v.distanceTo(_w))
      const spanPx1 = (RULES.wingspan * pxPerMeterAt1) / dist / px1080
      const renderScale =
        this.options.renderScale === 'auto'
          ? clamp(AUTO_SCALE_SPAN_PX / Math.max(spanPx1, 1), 1, RULES.birdRenderScaleMax)
          : this.options.renderScale
      const detail = smoothstep(160, 520, spanPx1)
      // Niveau de détail du maillage, avec hystérésis (pas de clignotement au zoom).
      const wantNear = s.near ? spanPx1 > NEAR_OUT_PX : spanPx1 > NEAR_IN_PX
      if (wantNear !== s.near) {
        s.near = wantNear
        rig.setDetail(getBirdAsset(wantNear ? this.options.detail : 'far'))
      }

      if (s.fresh) {
        s.animator.snap(f)
        s.fresh = false
      }
      const pose = s.animator.update(f, dt, { renderScale, detail, mode: this.modes[b.slot] ?? 'fly' })
      rig.applyPose(pose)
      if (s.animator.beat > 0) {
        const e = this.beatEvent
        e.slot = b.slot
        e.amp = s.animator.beat
        e.power = s.animator.beatPower
        e.x = pose.px
        e.y = pose.py
        e.z = pose.pz
        birdAnimEvents.emit(e)
      }

      // Uniforms propres à l'oiseau.
      const player = view.players[b.slot]
      const ci = player?.colorIndex ?? b.slot
      const U = rig.uniforms
      if (ci !== s.colorIndex) {
        s.colorIndex = ci
        const hex = PLAYER_COLORS[ci]?.hex ?? '#888888'
        U.uPlayer.value.setRGB(...hexToLinear(hex))
      }
      U.uGlyph.value = view.colorblind ? glyphIndex(ci) : -1
      U.uHidden.value = clamp01(springTo(s.hidden, b.hidden ? 1 : 0, 9, 1, dt))
      const charge = b.flapCooldown > 0 ? clamp01(1 - f.flapCooldown / RULES.flapCooldown) : 1
      if (charge >= 1 && s.prevCharge < 1) s.tipFlash = 1
      s.prevCharge = charge
      s.tipFlash = Math.max(0, s.tipFlash - dt / 0.35)
      U.uTipCharge.value = charge
      U.uTipFlash.value = s.tipFlash * s.tipFlash
      U.uDetail.value = detail

      // Âme de l'ombre : 1,0 en BAS, 0,6 en HAUT (ART_BIBLE §5.3).
      s.caster?.setStrength(1 - 0.4 * smoothstep(RULES.strongMaxAlt - 1, RULES.strongMaxAlt + 1, f.z))
      birdAnchors.spanPx[b.slot] = spanPx1 * pose.scale
      birdAnchors.scale[b.slot] = pose.scale
    }

    // Oiseaux disparus de la simulation.
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const s = this.slots[i]
      if (s && s.seen !== this.frameNo) this.drop(i)
    }

    // Matrices monde puis ancres des FX.
    this.root.updateMatrixWorld(true)
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const s = this.slots[i]
      if (!s) continue
      s.rig.writeAnchors(birdAnchors.data, i * ANCHOR_STRIDE, _v)
      birdAnchors.frame[i] = this.frameNo
    }

    this.updateCrown(sim.crownSlot, dt, pxPerMeterAt1 / px1080, camera)
  }

  /** @param pxPerMeter1080 pixels (1080p) par mètre à 1 m de la caméra */
  private updateCrown(slot: number, dt: number, pxPerMeter1080: number, camera: Camera): void {
    const C = this.crown.group
    this.crownTime += dt
    const has = slot >= 0 && this.slots[slot] !== undefined
    if (slot !== this.crownSlot) {
      // Changement de meneur : la couronne disparaît puis réapparaît sur le nouveau.
      if (this.crownScale.x < 0.05 || this.crownSlot < 0 || !this.slots[this.crownSlot]) {
        this.crownSlot = slot
        this.crownScale.x = 0
        this.crownScale.v = 0
      }
    }
    const target = has && slot === this.crownSlot ? 1 : 0
    springTo(this.crownScale, target, target > 0 ? 11 : 16, target > 0 ? 0.45 : 1, dt)
    const k = Math.max(0, this.crownScale.x)
    if (this.crownSlot < 0 || !this.slots[this.crownSlot] || k < 0.01) {
      C.visible = false
      return
    }
    const s = this.crownSlot
    const o = anchorOffset(s, 'riderTop')
    const d = birdAnchors.data
    const scale = birdAnchors.scale[s]!
    const bob = 0.25 * Math.sin(this.crownTime * Math.PI) // 0,5 Hz
    // « Au-dessus » = vers le haut de l'écran (lisible en plongée comme en plan bas).
    _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    _z.setFromMatrixColumn(camera.matrixWorld, 2)
    const lift = crownLift(_z.y) * scale + bob
    _v.set(d[o]! + _up.x * lift, d[o + 1]! + _up.y * lift, d[o + 2]! + _up.z * lift)
    C.position.copy(_v)
    const dist = Math.max(1, _v.distanceTo(_w))
    // Taille écran minimale (largeur ≈ 2,4 m) : lisible à toutes les distances.
    const minScale = CROWN_MIN_PX / Math.max(1e-3, (2.4 * pxPerMeter1080) / dist)
    const sc = Math.max(scale, minScale) * k
    C.scale.setScalar(sc)
    // Toujours présentée de face à la caméra (silhouette à 3 pointes lisible même
    // en plongée), légèrement basculée vers elle, avec un balancement.
    _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    _z.copy(_w).sub(_v)
    _z.addScaledVector(_up, -_z.dot(_up)).normalize()
    _x.crossVectors(_up, _z)
    _m.makeBasis(_x, _up, _z)
    C.quaternion.setFromRotationMatrix(_m)
    _q.setFromEuler(_eul.set(0.28, Math.sin(this.crownTime * 0.9 + hash01(s) * 6) * 0.25, Math.sin(this.crownTime * 1.3) * 0.1))
    C.quaternion.multiply(_q)
    C.visible = true
  }

  /**
   * Libère les ressources GPU. Le contrôleur reste utilisable (les oiseaux sont
   * recréés à la frame suivante, three.js ré-uploade la couronne) : robuste au
   * double montage des effets React (StrictMode). La racine reste attachée : c'est
   * au propriétaire de la retirer de la scène.
   */
  dispose(): void {
    for (let i = 0; i < MAX_PLAYERS; i++) this.drop(i)
    this.crown.dispose()
  }
}
