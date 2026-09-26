// Pilote impératif des oiseaux : un rig + un animateur par slot présent dans la
// simulation, mis à jour à chaque frame depuis gameView (état interpolé), sans
// re-render React. Utilisable hors React (écran titre, podium) via update().
import { Euler, Group, Matrix4, Quaternion, Vector3, type Camera, type PerspectiveCamera } from 'three'
import { RULES } from '../../../sim/rules.ts'
import { MAX_PLAYERS, PLAYER_COLORS } from '../../../shared/players.ts'
import type { GameView } from '../../view.ts'
import { ANCHOR_STRIDE, PERCH_CROWN_LIFT_M, anchorOffset, birdAnchors, birdAnimEvents, crownLift, type WingbeatEvent } from './anchors.ts'
import { BirdAnimator, emptyFrame, frameFromStates, type AnimContext, type BirdFrame, type BirdMode } from './animator.ts'
import { CROWN_HEIGHT, CROWN_WIDTH, CrownMesh } from './crown.ts'
import type { BirdDetail } from './geometry.ts'
import { glyphIndex } from './glyphs.ts'
import { ACCENT_SCALE_FAR, BAND_FAR, HULL_WIDTH_FAR_PX, HULL_WIDTH_PX } from './material.ts'
import { clamp, clamp01, hash01, lerp, smoothstep, spring, springTo, type Spring } from './math.ts'
import { OUTLINE_ID, addBirdCaster, hexToLinear, type CasterHandle } from './npr.ts'
import { BirdRig, getBirdAsset } from './rig.ts'

export interface BirdsOptions {
  detail: BirdDetail
  /**
   * Échelle cosmétique : 'auto' = envergure ≥ 60 px à l'écran, plafonnée à RULES.birdRenderScaleMax
   * (RULES.birdRenderScaleMaxCrowded au-delà de 8 oiseaux).
   */
  renderScale: number | 'auto'
  /** Enregistre l'« âme » de chaque oiseau dans la height shadow map. */
  castShadows: boolean
}

/** Envergure visée à l'écran par l'échelle automatique (px en 1080p)… */
const AUTO_SCALE_SPAN_PX = 60
/** …et au-delà de 8 oiseaux (polish vague 2 : médiane ≥ 60 px en plan d'arène, HAUT compris). */
const AUTO_SCALE_SPAN_PX_CROWDED = 66
/** Au-delà de ce nombre d'oiseaux, le plafond de l'échelle cosmétique passe à RULES.birdRenderScaleMaxCrowded. */
const CROWDED_BIRDS = 8
/** Taille minimale de la couronne à l'écran (px en 1080p, ART_BIBLE §6.7 : ≥ 14 px). */
const CROWN_MIN_PX = 16
/** Couronne posée sur la capuche (gros plans) : largeur (m, × échelle), taille minimale (px). */
const CROWN_HOOD_W = 0.55
const CROWN_HOOD_MIN_PX = 14
/** Couronne du podium : posée au-dessus de la tête, largeur (m), taille minimale (px). */
const CROWN_PERCH_W = 1.3
const CROWN_PERCH_MIN_PX = 20
/** Envergure affichée (px 1080p) : sous FAR_FULL_PX, traitement « loin » complet (bande élargie, cape et selle agrandies, cerne fin)… */
const FAR_FULL_PX = 68
/** …qui disparaît progressivement jusqu'à FAR_NONE_PX. */
const FAR_NONE_PX = 98
/** Hystérésis du cerne des pièces colorées (px d'envergure affichée) : coupé sous OFF, rétabli au-dessus de ON. */
const ACCENT_ID_OFF_PX = 78
const ACCENT_ID_ON_PX = 86
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
  /** Pièces colorées cernées (ID propre) : coupé au loin, avec hystérésis. */
  accentOn = true
  /** Dernière envergure affichée (px 1080p). */
  spanShown = 60
  /** Dernière force transmise à l'âme de l'ombre (−1 = jamais). */
  casterStrength = -1

  constructor(readonly slot: number) {
    // Créé au niveau « far » : le caster de l'ombre garde cette géométrie légère.
    this.rig = new BirdRig(getBirdAsset('far'))
    this.animator = new BirdAnimator(slot * 7919 + 13)
    this.rig.uniforms.uId.value = OUTLINE_ID.birdBase + slot
    this.rig.riderId.value = OUTLINE_ID.riderBase + slot
  }
}

const PROBE_ANCHORS = ['bandL', 'bandR', 'chest'] as const
const _v = new Vector3()
const _w = new Vector3()
const _up = new Vector3()
const _x = new Vector3()
const _z = new Vector3()
const _dir = new Vector3()
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
  /** Contexte d'animation réutilisé (pas d'objet alloué par oiseau et par frame). */
  private readonly animCtx: AnimContext = { renderScale: 1, detail: 0, mode: 'fly' }
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
      birdAnchors.crown.slot = -1
      return
    }
    const cam = camera as PerspectiveCamera
    const fovY = cam.isPerspectiveCamera ? (cam.fov * Math.PI) / 180 : Math.PI / 4
    const pxPerMeterAt1 = viewportH / (2 * Math.tan(fovY / 2))
    const px1080 = viewportH / 1080
    camera.getWorldPosition(_w)
    // Beaucoup d'oiseaux : plafond cosmétique relevé (polish B1, on retrouve le sien à 9-12).
    const crowded = sim.birds.length > CROWDED_BIRDS
    const scaleMax = crowded ? RULES.birdRenderScaleMaxCrowded : RULES.birdRenderScaleMax
    const spanTarget = crowded ? AUTO_SCALE_SPAN_PX_CROWDED : AUTO_SCALE_SPAN_PX

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
          ? clamp(spanTarget / Math.max(spanPx1, 1), 1, scaleMax)
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
      const mode = this.modes[b.slot] ?? 'fly'
      const actx = this.animCtx
      actx.renderScale = renderScale
      actx.detail = detail
      actx.mode = mode
      const pose = s.animator.update(f, dt, actx)
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
      // Uniforms scalaires : écrits seulement quand leur valeur (quantifiée au 1/1024) change. Un
      // nombre flottant rangé dans un objet { value } est mis en boîte à chaque écriture : écrire
      // sans condition allouait ~10 boîtes par oiseau et par frame (polish vague 2).
      const glyph = view.colorblind ? glyphIndex(ci) : -1
      if (U.uGlyph.value !== glyph) U.uGlyph.value = glyph
      springTo(s.hidden, b.hidden ? 1 : 0, 9, 1, dt)
      const hidden = Math.round(clamp01(s.hidden.x) * 1024) / 1024
      if (U.uHidden.value !== hidden) U.uHidden.value = hidden
      const charge = b.flapCooldown > 0 ? clamp01(1 - f.flapCooldown / RULES.flapCooldown) : 1
      if (charge >= 1 && s.prevCharge < 1) s.tipFlash = 1
      s.prevCharge = charge
      s.tipFlash = Math.max(0, s.tipFlash - dt / 0.35)
      const chargeQ = Math.round(charge * 1024) / 1024
      if (U.uTipCharge.value !== chargeQ) U.uTipCharge.value = chargeQ
      const flash = Math.round(s.tipFlash * s.tipFlash * 1024) / 1024
      if (U.uTipFlash.value !== flash) U.uTipFlash.value = flash
      const detailQ = Math.round(detail * 1024) / 1024
      if (U.uDetail.value !== detailQ) U.uDetail.value = detailQ
      const perch = mode === 'perch' ? 1 : 0
      if (U.uPerch.value !== perch) U.uPerch.value = perch

      // Loin (< 70 px d'envergure affichée) : bande d'aile élargie, cape et selle agrandies,
      // cerne réduit (coque fine, pièces colorées sans cerne interne) — polish B1.
      const spanShown = spanPx1 * pose.scale
      s.spanShown = spanShown
      const farK = Math.round((1 - smoothstep(FAR_FULL_PX, FAR_NONE_PX, spanShown)) * 1024) / 1024
      if (U.uFar.value !== farK) {
        const band = rig.asset.model.band
        const tipX = rig.asset.model.wingTipX
        U.uBand.value.set(lerp(band[0], BAND_FAR[0] * tipX, farK), lerp(band[1], BAND_FAR[1] * tipX, farK))
        U.uAccentScale.value = 1 + (ACCENT_SCALE_FAR - 1) * farK
        U.uFar.value = farK
        U.uHullWidth.value = lerp(HULL_WIDTH_PX, HULL_WIDTH_FAR_PX, farK)
      }
      if (s.accentOn ? spanShown < ACCENT_ID_OFF_PX : spanShown > ACCENT_ID_ON_PX) s.accentOn = !s.accentOn
      const accentOn = s.accentOn ? 1 : 0
      if (U.uAccentOn.value !== accentOn) U.uAccentOn.value = accentOn

      // Âme de l'ombre : 1,0 en BAS, 0,6 en HAUT (ART_BIBLE §5.3).
      const strength = Math.round((1 - 0.4 * smoothstep(RULES.strongMaxAlt - 1, RULES.strongMaxAlt + 1, f.z)) * 1024) / 1024
      if (strength !== s.casterStrength) {
        s.casterStrength = strength
        s.caster?.setStrength(strength)
      }
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
    if (birdAnchors.screen) this.probeScreen(birdAnchors.screen, camera)

    this.updateCrown(sim.crownSlot, dt, pxPerMeterAt1 / px1080, camera)
  }

  /** Sonde des outils (?debug) : NDC des milieux de bandes et de la poitrine, par slot. */
  private probeScreen(out: Float32Array, camera: Camera): void {
    const d = birdAnchors.data
    birdAnchors.probeCamera = camera
    birdAnchors.probeRoot = this.root
    for (let i = 0; i < MAX_PLAYERS; i++) {
      if (!this.slots[i]) continue
      const names = PROBE_ANCHORS
      for (let k = 0; k < names.length; k++) {
        const o = anchorOffset(i, names[k]!)
        _v.set(d[o]!, d[o + 1]!, d[o + 2]!).project(camera)
        out[i * 6 + k * 2] = _v.x
        out[i * 6 + k * 2 + 1] = _v.y
      }
    }
  }

  /**
   * Couronne du meneur (ART_BIBLE §6.7, polish B3/B4). Trois poses, fondues selon la
   * taille de l'oiseau à l'écran :
   *  - en jeu : ≈ 3 m au-dessus du cavalier le long du « haut » de l'écran (crownLift),
   *    jamais multipliée par l'échelle cosmétique, ≥ 16 px ;
   *  - gros plan (envergure > 200 px) : posée sur la capuche, à la taille du cavalier ;
   *  - podium (mode perch) : ancrée sur la tête de l'oiseau (le cavalier est caché
   *    derrière le cou dressé), juste au-dessus, droite : elle doit rester sous le
   *    bandeau du podium.
   * @param pxPerMeter1080 pixels (1080p) par mètre à 1 m de la caméra
   */
  private updateCrown(slot: number, dt: number, pxPerMeter1080: number, camera: Camera): void {
    const C = this.crown.group
    const rec = birdAnchors.crown
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
    const bird = this.crownSlot >= 0 ? this.slots[this.crownSlot] : undefined
    if (!bird || k < 0.01) {
      C.visible = false
      rec.slot = -1
      return
    }
    const s = this.crownSlot
    const perch = this.modes[s] === 'perch' ? 1 : 0
    const o = anchorOffset(s, perch ? 'head' : 'riderTop')
    const d = birdAnchors.data
    const scale = birdAnchors.scale[s]!
    const hood = perch ? 0 : smoothstep(170, 230, bird.spanShown)
    // Axes : « haut » de l'écran (jeu), haut du cavalier (capuche), vertical (podium).
    _up.setFromMatrixColumn(camera.matrixWorld, 1).normalize()
    _z.setFromMatrixColumn(camera.matrixWorld, 2)
    _x.setFromMatrixColumn(bird.rig.bones.rider.matrixWorld, 1).normalize()
    if (perch) _x.set(0, 1, 0)
    const dir = _dir.copy(_up).lerp(_x, perch ? 1 : hood).normalize()
    const lift = perch
      ? PERCH_CROWN_LIFT_M * scale + 0.05 * Math.sin(this.crownTime * 1.4)
      : lerp(crownLift(_z.y) * Math.min(1, scale) + 0.15 * Math.sin(this.crownTime * Math.PI), -0.12 * scale, hood)
    _v.set(d[o]! + dir.x * lift, d[o + 1]! + dir.y * lift, d[o + 2]! + dir.z * lift)
    C.position.copy(_v)
    const dist = Math.max(1, _v.distanceTo(_w))
    const pxPerM = pxPerMeter1080 / dist
    // Taille : icône lisible au loin (≥ 16 px), taille du cavalier en gros plan, 1,6 m au podium.
    const farSc = Math.max(1, CROWN_MIN_PX / (CROWN_WIDTH * pxPerM))
    const hoodSc = Math.max((CROWN_HOOD_W * scale) / CROWN_WIDTH, CROWN_HOOD_MIN_PX / (CROWN_WIDTH * pxPerM))
    const perchSc = Math.max((CROWN_PERCH_W * scale) / CROWN_WIDTH, CROWN_PERCH_MIN_PX / (CROWN_WIDTH * pxPerM))
    const sc = (perch ? perchSc : lerp(farSc, hoodSc, hood)) * k
    C.scale.setScalar(sc)
    // Présentée de face à la caméra, droite le long de `dir`, légère bascule vers la caméra et balancement.
    _z.copy(_w).sub(_v)
    _z.addScaledVector(dir, -_z.dot(dir)).normalize()
    _x.crossVectors(dir, _z)
    _m.makeBasis(_x, dir, _z)
    C.quaternion.setFromRotationMatrix(_m)
    const sway = perch ? 0.08 : 0.16 * (1 - hood)
    _q.setFromEuler(_eul.set(0.12, Math.sin(this.crownTime * 0.9 + hash01(s) * 6) * sway, Math.sin(this.crownTime * 1.3) * 0.06))
    C.quaternion.multiply(_q)
    C.visible = true
    // Pour les FX (anneau « couronne gagnée », pile d'icônes au-dessus).
    const h = CROWN_HEIGHT * sc
    rec.slot = s
    rec.frame = this.frameNo
    rec.cx = _v.x + dir.x * h * 0.5
    rec.cy = _v.y + dir.y * h * 0.5
    rec.cz = _v.z + dir.z * h * 0.5
    rec.tx = _v.x + dir.x * h
    rec.ty = _v.y + dir.y * h
    rec.tz = _v.z + dir.z * h
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
