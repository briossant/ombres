// Réalisateur : choisit le plan selon cameraCue (mode écrit par le runner), enchaîne les plans
// (fondus de caméra ou coupes franches), pilote la dramatisation et l'état de présentation du
// monde (worldView) qui dépend du plan : fondu de nuit des résultats, illumination, bords exacts,
// ciel du podium. Impératif, sans React : <GameCamera/> l'appelle à chaque frame.
import * as THREE from 'three'
import { RULES } from '../../../../src/sim/rules.ts'
import type { SimEvent, SimState } from '../../../../src/sim/types.ts'
import { simEvents, type Emitter } from '../../../../src/host/bus.ts'
import { illuminateTerritory, worldView } from '../../../../src/host/render/worldView.ts'
import { getSettings } from '../../../../src/host/settings.ts'
import type { GameView } from '../../../../src/host/view.ts'
import { CineShot, CREDITS_LAYOUT, CREDITS_SEQUENCE, rigPose, shotFault, stormNear, TITLE_LAYOUT, TITLE_SEQUENCE, type ShotKind } from './cine.ts'
import { cameraBeats, cameraCue, cameraState, type CameraMode } from '../../../../src/host/camera/cue.ts'
import { copyRig, fitPoints, makeRig, projectRig, type FitResult, type Rig, type ScreenRect } from '../../../../src/host/camera/framing.ts'
import { FramingRig } from '../../../../src/host/camera/framingRig.ts'
import { blendPose, clamp01, copyPose, DEG, guardPosition, lerp, makePose, poseDistance, smoother, smoothstep, yawPitchQuat, type Pose } from '../../../../src/host/camera/math.ts'
import { PODIUM_CAMERA, type PodiumLayout } from '../../../../src/host/camera/podium.ts'

/** Carte des résultats : dans la partie gauche (le panneau des résultats occupe la droite). */
export const RESULTS_MAP_RECT: ScreenRect = { x0: 0.035, x1: 0.515, y0: 0.085, y1: 0.915 }

/**
 * Rectangle de la carte selon le rapport d'aspect : le panneau de l'UI fait 820 px de conception,
 * collé à 4 % du bord droit, et l'UI est zoomée par min(h / 1080, l / 1600) (src/host/ui/scale.ts).
 */
export function resultsMapRect(aspect: number, out: ScreenRect = { x0: 0, x1: 0, y0: 0, y1: 0 }): ScreenRect {
  const panel = 820 * Math.min(1 / (1080 * aspect), 1 / 1600)
  out.x0 = RESULTS_MAP_RECT.x0
  out.x1 = Math.max(0.3, 1 - 0.04 - panel - 0.02)
  out.y0 = RESULTS_MAP_RECT.y0
  out.y1 = RESULTS_MAP_RECT.y1
  return out
}
/** Pause de la nuit avant la montée (s) : le gel, 1,5 s de silence (GDD §3, §11.3). */
export const NIGHT_HOLD_SECONDS = 1.5
/** Illumination du territoire à cette fraction de la montée (vague de 0,8 s qui finit avec elle). */
const ILLUMINATE_AT = 0.42
/** Poussée très lente sur la carte une fois cadrée (fraction de distance, sur 14 s). */
const RESULTS_PUSH = 0.035
/**
 * FOV de la vue carte (polish S7) : quasi orthographique, prise de plus loin pour la même emprise.
 * À 40°, les tours du bord se couchaient en « saucisses » ; à 18°, le rayon le plus oblique (bord
 * gauche de la carte) fait au plus ≈ 15° avec la verticale en 16:9.
 */
export const MAP_FOV = 18
/** Durées des plans du titre : fraction du soleil de la démo (voir TITLE_SEQUENCE). */
const CREDITS_BLEND = 3.2

/** Une sim neuve posée moins de 0,5 s avant un changement de mode : la transition est une coupe. */
const SIM_CUT_WINDOW = 0.5

/** Partagé avec <PodiumStage/> : disposition du podium en cours (null hors podium). */
export const podiumShared: { layout: PodiumLayout | null; version: number } = { layout: null, version: 0 }

export class CameraDirector {
  /** Pose de sortie (repère three). */
  readonly pose: Pose = makePose()
  private readonly desired: Pose = makePose()
  private readonly from: Pose = makePose()
  private blendT = 0
  private blendDur = 0
  private blendArc = 0
  private mode: CameraMode | '' = ''
  private version = -1
  private sim: SimState | null = null
  private first = true
  private modeTime = 0
  readonly framing = new FramingRig()
  private readonly shot = new CineShot()
  private shotIndex = -1
  private shotSeed = 1
  private lastSunT = 0
  private creditsNext = 0
  // résultats
  private readonly riseFrom: Rig = makeRig()
  private readonly riseTo: Rig = makeRig()
  private readonly rig: Rig = makeRig()
  private readonly fit: FitResult = { tx: 0, ty: 0, dist: 0, width: 0 }
  private readonly ellipse = new Float64Array(24 * 3)
  private readonly mapRect: ScreenRect = { x0: 0, x1: 0, y0: 0, y1: 0 }
  private riseStarted = false
  private illuminated = false
  private mapReady = false
  private podiumReady = false
  private podiumVersion = -1
  private aspect = 16 / 9
  private clock = 0
  private simChangedAt = -99
  private view: GameView | null = null
  private faultClock = 0
  /** Titre : le plan en cours masque le Simoun (trop proche) ; plan tout juste commencé. */
  private titleHideStorm = false
  private shotFresh = false
  private readonly unsub: () => void
  private readonly tmpV = new THREE.Vector3()
  private readonly tmpP = { x: 0, y: 0, z: 0 }

  constructor(events: Emitter<SimEvent> = simEvents) {
    this.unsub = events.on((e) => this.onEvent(e))
  }

  dispose(): void {
    this.unsub()
  }

  private onEvent(e: SimEvent): void {
    if (this.mode !== 'round') return
    if (e.type === 'diveCommit') {
      if (this.inFrame(e.hunter) && this.inFrame(e.target)) this.framing.onDiveCommit(e.hunter, e.target, this.sim)
    } else if (e.type === 'diveHit' || e.type === 'diveMiss' || e.type === 'diveCancel') {
      this.framing.onDiveEnd(e.hunter, e.type === 'diveHit')
      if (e.type === 'diveHit') {
        const seen = this.pointInFrame(e.x, e.y, e.z)
        if (seen && getSettings().screenShake) this.framing.onHit()
        // punch-in sur les touches qui comptent (polish S6) : la paire doit être dans le champ
        if (seen && this.sim && this.view && this.framing.onDiveHit(e, this.sim, this.view, this.aspect)) {
          cameraState.punchCount = this.framing.punchCount
          cameraBeats.emit({ type: 'punchIn', hunter: e.hunter, target: e.target })
        }
      }
    }
  }

  private readonly proj = new THREE.PerspectiveCamera()
  private inFrame(slot: number): boolean {
    const b = this.sim?.bySlot[slot]
    return !!b && this.pointInFrame(b.x, b.y, b.z)
  }
  private pointInFrame(x: number, y: number, z: number): boolean {
    const c = this.proj
    this.tmpV.set(x, z, -y).project(c)
    return this.tmpV.z < 1 && Math.abs(this.tmpV.x) < 0.92 && Math.abs(this.tmpV.y) < 0.92
  }

  /** Une frame : `dt` en secondes réelles. Écrit `pose`, cameraState, worldView. */
  update(dt: number, view: GameView, aspect: number): Pose {
    this.aspect = aspect
    dt = Math.min(dt, 0.1)
    const sim = view.sim
    const cue = cameraCue
    const simChanged = sim !== this.sim
    this.view = view
    this.clock += dt
    if (simChanged) this.simChangedAt = this.clock
    if (cue.version !== this.version || simChanged || this.first) {
      const modeChanged = cue.mode !== this.mode
      // une sim neuve posée juste avant (ou juste après) le changement de mode : c'est une coupe
      const recentSim = this.clock - this.simChangedAt < SIM_CUT_WINDOW
      if (modeChanged || simChanged || this.first || cue.cut) this.enter(cue.mode, view, cue.cut || simChanged || recentSim || this.first)
      this.version = cue.version
      cue.cut = false
      this.first = false
    }
    this.sim = sim
    this.modeTime += dt
    this.compute(dt, view)
    // fondu de caméra entre deux plans
    if (this.blendT < this.blendDur) {
      this.blendT += dt
      const k = smoother(this.blendT / this.blendDur)
      blendPose(this.pose, this.from, this.desired, k, this.blendArc)
    } else copyPose(this.pose, this.desired)
    guardPosition(this.pose.pos, sim?.towers ?? null, sim?.arena ?? null)
    this.applyWorldView()
    cameraState.mode = this.mode || 'loading'
    cameraState.modeTime = this.modeTime
    const p = this.proj
    p.fov = this.pose.fov
    p.aspect = aspect
    p.near = 1
    p.far = 9000
    p.position.copy(this.pose.pos)
    p.quaternion.copy(this.pose.quat)
    p.updateProjectionMatrix()
    p.updateMatrixWorld(true)
    if (this.mode === 'round' && sim) this.arenaOnScreen(sim)
    return this.pose
  }

  /** Boîte écran de l'ellipse de l'arène (cameraState.arena) : sable vide en bas, débordements. */
  private arenaOnScreen(sim: SimState): void {
    const o = cameraState.arena
    o.x0 = o.y0 = Infinity
    o.x1 = o.y1 = -Infinity
    for (let i = 0; i < 24; i++) {
      const th = (i / 24) * Math.PI * 2
      this.tmpV.set(Math.cos(th) * sim.arena.a, 0, -Math.sin(th) * sim.arena.b).project(this.proj)
      const x = (this.tmpV.x + 1) / 2
      const y = (1 - this.tmpV.y) / 2
      if (x < o.x0) o.x0 = x
      if (x > o.x1) o.x1 = x
      if (y < o.y0) o.y0 = y
      if (y > o.y1) o.y1 = y
    }
  }

  private enter(mode: CameraMode, view: GameView, cut: boolean): void {
    const prev = this.mode
    this.mode = mode
    this.modeTime = 0
    const sim = view.sim
    this.riseStarted = this.illuminated = this.mapReady = false
    this.podiumReady = false
    cameraState.rise = 0
    cameraState.mapReady = false
    cameraState.podiumReady = false
    if (mode === 'round' || mode === 'lobby' || mode === 'rules') {
      // cadrage recalé sur le nouveau mode ; sans coupe, le fondu de caméra fait la transition
      this.framing.reset(mode)
      if (sim) this.framing.snap(sim, view, this.aspect)
    }
    if (mode === 'roundResults' && prev === 'round' && !cut) {
      // la montée part du cadrage de jeu courant : aucun fondu
      copyRig(this.riseFrom, this.framing.rig)
    } else if (mode === 'roundResults' && sim) {
      this.framing.reset('round')
      copyRig(this.riseFrom, this.framing.snap(sim, view, this.aspect))
    }
    if (mode === 'title' || mode === 'credits' || mode === 'loading') {
      this.shotIndex = -1
      this.creditsNext = 0
      this.lastSunT = sim?.sun.t ?? 0
    }
    if (mode === 'podium') this.podiumVersion = -1
    if (cut) {
      this.blendT = this.blendDur = 0
      if (prev !== '') cameraBeats.emit({ type: 'cut', mode })
    } else {
      copyPose(this.from, this.pose)
      this.blendT = 0
      this.blendDur = mode === 'roundResults' ? 0 : mode === 'credits' || mode === 'title' ? 2.6 : 2.2
      this.blendArc = 0
    }
  }

  /** Démarre un plan de cinéma ; `blend` > 0 = fondu depuis la pose courante, 0 = coupe, < 0 = garde le fondu en cours. */
  private startShot(kind: ShotKind, dur: number, blend: number, credits: boolean): void {
    this.shotSeed++
    this.shot.start(kind, dur, this.shotSeed, credits ? CREDITS_LAYOUT : TITLE_LAYOUT)
    this.shotFresh = true
    if (blend < 0) {
      // garde le fondu en cours (entrée dans le mode)
    } else if (blend > 0) {
      copyPose(this.from, this.pose)
      this.blendT = 0
      this.blendDur = blend
      this.blendArc = Math.min(40, poseDistance(this.from, this.pose) * 0.08)
    } else {
      this.blendT = this.blendDur = 0
      cameraBeats.emit({ type: 'cut', mode: this.mode || 'loading' })
    }
    cameraState.shot = kind
  }

  private compute(dt: number, view: GameView): void {
    const sim = view.sim
    const out = this.desired
    switch (this.mode) {
      case 'round':
      case 'lobby':
      case 'rules': {
        if (!sim) return this.cine(dt, view, 'still')
        rigPose(this.framing.update(dt, sim, view, this.aspect), out)
        cameraState.punch = this.framing.punchLevel
        cameraState.towerCover = this.framing.towerCover
        const sh = this.framing.shake
        if (sh.x !== 0 || sh.y !== 0) {
          this.tmpV.set(sh.x, sh.y, 0).applyQuaternion(out.quat)
          out.pos.add(this.tmpV)
        }
        return
      }
      case 'roundResults':
        return this.results(dt, view)
      case 'podium':
        return this.podium(dt, view)
      case 'title':
        return this.title(dt, view)
      case 'credits':
        return this.credits(dt, view)
      default:
        return this.cine(dt, view, 'still')
    }
  }

  private cine(dt: number, view: GameView, kind: ShotKind): void {
    if (this.shot.kind !== kind || this.shotIndex !== -2) {
      this.shotIndex = -2
      this.shot.start(kind, 1e9, 1, TITLE_LAYOUT)
    }
    this.shot.update(dt, view.sim, view, this.aspect, this.desired)
  }

  /** Titre : plans calés sur le soleil de la démo ; coupe franche à chaque plan et au rebouclage. */
  private title(dt: number, view: GameView): void {
    const sim = view.sim
    if (!sim) return this.cine(dt, view, 'still')
    const u = clamp01(sim.sun.t / sim.sun.T)
    const looped = sim.sun.t < this.lastSunT - 1
    this.lastSunT = sim.sun.t
    let idx = 0
    for (let i = 0; i < TITLE_SEQUENCE.length; i++) if (u >= TITLE_SEQUENCE[i]!.at) idx = i
    if (looped) idx = 0
    if (idx !== this.shotIndex || looped) {
      const next = TITLE_SEQUENCE[idx + 1]?.at ?? 1.1
      const dur = (next - TITLE_SEQUENCE[idx]!.at) * sim.sun.T
      // premier plan : on garde le fondu (ou la coupe) de l'entrée dans le mode
      const firstShot = this.shotIndex === -1
      this.shotIndex = idx
      this.startShot(TITLE_SEQUENCE[idx]!.kind, dur, firstShot ? -1 : 0, false)
    }
    const recuts = this.shot.recuts
    this.shot.update(dt, sim, view, this.aspect, this.desired)
    // rideau du Simoun trop proche (< 120 m dans le champ) : masqué pour tout le plan, décidé à la
    // coupe (jamais au milieu d'un plan : pas de saut)
    if (this.shotFresh || this.shot.recuts !== recuts) this.titleHideStorm = stormNear(sim, this.desired, this.aspect)
    this.shotFresh = false
    // défaut de composition de l'image montrée (4 Hz ; debug et scripts de vérification)
    this.faultClock -= dt
    if (this.faultClock <= 0) {
      this.faultClock = 0.25
      cameraState.shotFault = shotFault(sim, this.desired, this.aspect, TITLE_LAYOUT, this.titleHideStorm, this.shot.subjectDistance(sim, this.desired))
    }
  }

  /** Crédits : longue suite de plans lents enchaînés par fondus de caméra. */
  private credits(dt: number, view: GameView): void {
    const sim = view.sim
    if (!sim) return this.cine(dt, view, 'still')
    if (this.shotIndex < 0 || this.modeTime >= this.creditsNext) {
      this.shotIndex = (this.shotIndex + 1) % CREDITS_SEQUENCE.length
      const e = CREDITS_SEQUENCE[this.shotIndex]!
      this.creditsNext = this.modeTime + e.at
      this.startShot(e.kind, e.at + CREDITS_BLEND, this.shotIndex === 0 && this.modeTime < 0.2 ? -1 : CREDITS_BLEND, true)
    }
    this.shot.update(dt, sim, view, this.aspect, this.desired)
  }

  /** Résultats de manche : pause de nuit, montée à la verticale, carte à gauche. */
  private results(dt: number, view: GameView): void {
    const sim = view.sim
    if (!sim) return this.cine(dt, view, 'still')
    const t = this.modeTime
    const rise = RULES.camNightRiseSeconds
    // pendant la pause, le cadrage de jeu continue (les oiseaux planent) ; la montée part de là
    if (t < NIGHT_HOLD_SECONDS) {
      this.framing.kind = 'round'
      copyRig(this.riseFrom, this.framing.update(dt, sim, view, this.aspect))
      rigPose(this.riseFrom, this.desired)
      cameraState.rise = 0
      return
    }
    if (!this.riseStarted) {
      this.riseStarted = true
      this.computeMapRig(sim)
      cameraBeats.emit({ type: 'riseStart' })
    }
    const k = clamp01((t - NIGHT_HOLD_SECONDS) / rise)
    const e = smoother(k)
    const r = this.rig
    const a = this.riseFrom
    const b = this.riseTo
    // la cible file vers la carte un peu plus tôt que la caméra ne monte : pas de balayage latéral
    const ek = smoother(Math.min(1, k * 1.15))
    r.tx = lerp(a.tx, b.tx, ek)
    r.ty = lerp(a.ty, b.ty, ek)
    r.tz = 0
    r.yaw = 0
    r.pitch = lerp(a.pitch, b.pitch, e)
    // la focale se resserre pendant la montée (même emprise : la distance croît d'autant)
    r.fov = lerp(a.fov, b.fov, e)
    const tanA = Math.tan((a.fov * DEG) / 2)
    const tanF = Math.tan((r.fov * DEG) / 2)
    const tanB = Math.tan((b.fov * DEG) / 2)
    // distance interpolée en « largeur cadrée » (log), convertie à la focale courante
    const wLog = lerp(Math.log(a.dist * tanA), Math.log(b.dist * tanB), smoothstep(0, 1, k))
    r.dist = Math.exp(wLog) / tanF
    if (k >= 1) r.dist *= 1 - RESULTS_PUSH * smoother((t - NIGHT_HOLD_SECONDS - rise) / 14)
    rigPose(r, this.desired)
    cameraState.rise = k
    if (k >= 1) this.mapOnScreen(sim, r)
    if (!this.illuminated && k >= ILLUMINATE_AT) {
      this.illuminated = true
      const w = cameraCue.winnerSlot
      illuminateTerritory(w, this.realTime(view))
      cameraBeats.emit({ type: 'illuminate', winnerSlot: w })
    }
    if (!this.mapReady && k >= 1) {
      this.mapReady = true
      cameraState.mapReady = true
      const m = cameraState.mapRect
      cameraBeats.emit({ type: 'mapReady', rect: { x0: m.x0, x1: m.x1, y0: m.y0, y1: m.y1 } })
    }
  }

  private realTime(view: GameView): number {
    return view.realTime
  }

  /** Vue verticale : l'ellipse de l'arène dans le rectangle gauche de l'écran, nord en haut. */
  private computeMapRig(sim: SimState): void {
    const E = this.ellipse
    const n = 24
    const a = sim.arena.a * 1.02
    const b = sim.arena.b * 1.02
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2
      E[i * 3] = Math.cos(th) * a
      E[i * 3 + 1] = Math.sin(th) * b
      E[i * 3 + 2] = 0
    }
    const pitch = 89.99 * DEG
    fitPoints(E, n, 0, pitch, MAP_FOV, this.aspect, resultsMapRect(this.aspect, this.mapRect), 50, 20000, this.fit)
    const r = this.riseTo
    r.tx = this.fit.tx
    r.ty = this.fit.ty
    r.tz = 0
    r.yaw = 0
    r.pitch = pitch
    r.dist = this.fit.dist
    r.fov = MAP_FOV
  }

  /**
   * Rectangle écran de la carte (cameraState.mapRect, fractions, origine en haut à gauche) : boîte
   * de l'ellipse de l'arène vue par le rig courant (suit la poussée lente). Pour la planche imprimée
   * de l'UI (H14).
   */
  private mapOnScreen(sim: SimState, r: Rig): void {
    const o = cameraState.mapRect
    o.x0 = o.y0 = Infinity
    o.x1 = o.y1 = -Infinity
    for (let i = 0; i < 32; i++) {
      const th = (i / 32) * Math.PI * 2
      projectRig(r, this.aspect, Math.cos(th) * sim.arena.a, Math.sin(th) * sim.arena.b, 0, this.tmpP)
      if (this.tmpP.x < o.x0) o.x0 = this.tmpP.x
      if (this.tmpP.x > o.x1) o.x1 = this.tmpP.x
      if (this.tmpP.y < o.y0) o.y0 = this.tmpP.y
      if (this.tmpP.y > o.y1) o.y1 = this.tmpP.y
    }
  }

  /** Podium : la disposition vient de <PodiumStage/> (tours alignées sur les plaques de l'UI). */
  private podium(dt: number, view: GameView): void {
    const L = podiumShared.layout
    if (!L) return this.cine(dt, view, 'still')
    if (this.podiumVersion !== podiumShared.version) {
      // nouvelle scène (ou redimensionnement) : coupe
      this.podiumVersion = podiumShared.version
      this.blendT = this.blendDur = 0
    }
    const t = this.modeTime
    const C = PODIUM_CAMERA
    // arrivée (plan pur, avant l'UI) : poussée lente sur le vainqueur — la focale se resserre et la
    // caméra s'élève jusqu'à sa place, où les perchoirs tombent au-dessus des plaques
    const rise = 1 - smoother(t / C.introSeconds)
    // puis respiration lente (± 2 % de focale, centrée : le vainqueur reste au-dessus de sa plaque,
    // les deux autres bougent de quelques px) et léger balancement vertical
    const settled = smoothstep(C.introSeconds, C.introSeconds + 2, t)
    const breathe = 1 + C.driftFov * settled * Math.sin(((t - C.introSeconds) * 2 * Math.PI) / C.driftPeriod)
    const sway = Math.sin(t * 0.5) * 0.12 * settled
    const out = this.desired
    out.pos.set(L.cam.x + rise * 4, L.cam.z - rise * 1.6 + sway, -L.cam.y)
    yawPitchQuat(out.quat, L.cam.yaw, L.cam.pitch - rise * 2 * DEG)
    out.fov = L.cam.fov * (1 + (C.introFovScale - 1) * rise) * breathe
    if (!this.podiumReady && t >= 2.2) {
      this.podiumReady = true
      cameraState.podiumReady = true
      cameraBeats.emit({ type: 'podiumReady' })
    }
  }

  /** worldView selon le plan (la caméra le possède : voir docs/agent-notes/staging.md §2). */
  private applyWorldView(): void {
    const wv = worldView
    const m = this.mode
    if (m === 'roundResults') {
      const k = this.riseStarted ? cameraState.rise : 0
      wv.resultsFade = smoothstep(0, 1, k)
      wv.exactBorders = this.riseStarted
    } else {
      wv.resultsFade = 0
      wv.exactBorders = false
      if (wv.illumination.start >= 0) {
        wv.illumination.start = -1
        wv.illumination.winnerSlot = -1
      }
    }
    if (m === 'podium') {
      wv.sunOverride = { elevDeg: PODIUM_CAMERA.sunElevDeg, azDeg: PODIUM_CAMERA.sunAzDeg }
      wv.paletteElevOverride = PODIUM_CAMERA.paletteElev
      wv.nightAll = 0
      wv.hideStorm = true
    } else if (wv.sunOverride || wv.paletteElevOverride !== null || wv.nightAll !== null || wv.hideStorm) {
      wv.sunOverride = null
      wv.paletteElevOverride = null
      wv.nightAll = null
      wv.hideStorm = false
    }
    // titre : un plan qui passerait près du rideau du Simoun le masque (polish S4)
    if (m === 'title' && this.titleHideStorm) wv.hideStorm = true
    else if (m !== 'podium' && wv.hideStorm) wv.hideStorm = false
    if (m !== 'title') this.titleHideStorm = false
  }
}
