// Animation procédurale de l'oiseau, pilotée par l'état de la simulation
// (GDD §5.4, ART_BIBLE §6.7). Entrée : un BirdFrame (état interpolé entre deux
// ticks). Sortie : une BirdPose. Tout passe par des ressorts amortis : aucune
// grandeur ne saute quand l'état change (piqué annulé, décrochage interrompu…).
//
// Les constantes de ce fichier sont cosmétiques (amplitudes, fréquences,
// raideurs) ; les grandeurs de jeu (altitudes, vitesses, durées) viennent de RULES.
import { DEG, RULES } from '../../../sim/rules.ts'
import type { BirdState, DivePhase, StunKind } from '../../../sim/types.ts'
import {
  TAU,
  bump,
  clamp,
  clamp01,
  damp,
  hash01,
  lerp,
  noise1,
  smoothstep,
  spring,
  springTo,
} from './math.ts'
import { BirdPose, type WingPose } from './pose.ts'

const SIDES = [1, -1] as const

/** État d'un oiseau à l'instant affiché (interpolé), repère de la simulation. */
export interface BirdFrame {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  heading: number
  turnRate: number
  speed: number
  dive: DivePhase
  diveTime: number
  stun: number
  stunKind: StunKind
  immune: number
  flap: number
  flapCooldown: number
  hidden: boolean
  inStorm: boolean
  towerSlide: number
}

/**
 * BirdFrame réécrit à chaque frame : une classe (forme propre, champs initialisés à des nombres),
 * pas un littéral `{ x, y, z, … }` qui partage ses transitions de forme avec tous les littéraux
 * commençant par `x` (polish vague 2, allocations par frame).
 */
class FrameState implements BirdFrame {
  x = 0
  y = 0
  z: number = RULES.altHigh
  vx = 0
  vy = 0
  vz = 0
  heading = 0
  turnRate = 0
  speed: number = RULES.speedHigh
  dive: DivePhase = 'none'
  diveTime = 0
  stun = 0
  stunKind: StunKind = 'none'
  immune = 0
  flap = 0
  flapCooldown = 0
  hidden = false
  inStorm = false
  towerSlide = 0
}

export const emptyFrame = (): BirdFrame => new FrameState()

/**
 * Interpole l'état d'un oiseau entre le tick précédent et le courant. Interpolations écrites
 * sur place (sans appels) : une frame, douze oiseaux, aucune boîte de flottant allouée.
 */
export function frameFromStates(cur: BirdState, prev: BirdState | undefined, alpha: number, out: BirdFrame): BirdFrame {
  const p = prev ?? cur
  const a = alpha < 0 ? 0 : alpha > 1 ? 1 : alpha
  out.x = p.x + (cur.x - p.x) * a
  out.y = p.y + (cur.y - p.y) * a
  out.z = p.z + (cur.z - p.z) * a
  out.vx = p.vx + (cur.vx - p.vx) * a
  out.vy = p.vy + (cur.vy - p.vy) * a
  out.vz = p.vz + (cur.vz - p.vz) * a
  // Cap par le plus court chemin (écart ramené dans ]-π, π]).
  let dh = (cur.heading - p.heading + Math.PI) % TAU
  if (dh < 0) dh += TAU
  out.heading = p.heading + (dh - Math.PI) * a
  out.turnRate = p.turnRate + (cur.turnRate - p.turnRate) * a
  out.speed = p.speed + (cur.speed - p.speed) * a
  out.dive = cur.dive
  out.diveTime = cur.diveTime
  // Un compteur qui vient de démarrer ne s'interpole pas depuis 0.
  const dt = 1 / RULES.tickHz
  out.stun = cur.stun > p.stun ? cur.stun + (1 - a) * dt : p.stun + (cur.stun - p.stun) * a
  out.stunKind = cur.stunKind
  out.immune = p.immune + (cur.immune - p.immune) * a
  out.flap = p.flap + (cur.flap - p.flap) * a
  out.flapCooldown = p.flapCooldown + (cur.flapCooldown - p.flapCooldown) * a
  out.hidden = cur.hidden
  out.inStorm = cur.inStorm
  out.towerSlide = cur.towerSlide
  return out
}

/** Modes de mise en scène (hors vol normal). */
export type BirdMode = 'fly' | 'perch'

/** Paramètres « écran » fournis par le rendu. */
export interface AnimContext {
  /** Échelle cosmétique demandée par le rendu (1 → 1,3 au dézoom maximal, 1,6 au-delà de 8 oiseaux). */
  renderScale: number
  /** Niveau de détail (0 = loin, 1 = gros plan) : mât et fanion masqués au loin. */
  detail: number
  mode: BirdMode
}

/** Pose du podium (radians) : cormoran qui sèche ses ailes, tête de profil. */
const PERCH = {
  pitch: 42 * DEG,
  shoulderFlap: 0.08,
  shoulderSweep: -0.12,
  shoulderTwist: 0.35,
  elbowFlap: -0.04,
  elbowSweep: 0.05,
  wristFlap: -0.28,
  wristSweep: 0.18,
  wristTwist: 0.12,
  fingerFlap: -0.12,
  fingerSweep: 0.1,
  neckPitch: -0.3,
  headPitch: -0.2,
  headYaw: 1.25,
  headRoll: 0.2,
  tailPitch: -0.35,
  riderPitch: 0.55,
} as const

const wingReset = (w: WingPose) => {
  w.shoulderFlap = w.shoulderSweep = w.shoulderTwist = 0
  w.elbowFlap = w.elbowSweep = 0
  w.wristFlap = w.wristSweep = w.wristTwist = 0
  w.fingerFlap = w.fingerSweep = 0
}

/** Courbe du coup d'aile (0..1) : lever rapide, abattée puissante, retour. */
function powerStroke(t: number): number {
  if (t <= 0 || t >= 1) return 0
  if (t < 0.3) return Math.sin((t / 0.3) * (Math.PI / 2)) * 1.0
  if (t < 0.72) {
    const u = (t - 0.3) / 0.42
    return 1.0 - 1.9 * (0.5 - 0.5 * Math.cos(u * Math.PI))
  }
  const u = (t - 0.72) / 0.28
  return -0.9 * (0.5 + 0.5 * Math.cos(u * Math.PI))
}

export class BirdAnimator {
  readonly pose = new BirdPose()
  /** Graine cosmétique (décale les rafales de battements d'un oiseau à l'autre). */
  private readonly seed: number = 0
  private time = 0
  // Champs numériques initialisés à un nombre (jamais `undefined`) : sinon leur représentation
  // reste « valeur quelconque » et chaque écriture d'un flottant alloue une boîte (polish vague 2).
  private phase = 0.5
  private readonly amp = spring(0.3)
  private freq = 0.6
  private readonly fold = spring(0)
  private readonly bank = spring(0)
  private readonly pitch = spring(0)
  private readonly rear = spring(0)
  private readonly glide = spring(0)
  private readonly scale = spring(1)
  private readonly neckP = spring(0)
  private readonly neckY = spring(0)
  private readonly tailP = spring(0)
  private readonly spread = spring(1)
  private readonly legs = spring(0)
  private readonly capeLift = spring(0.1)
  private readonly capeYaw = spring(0)
  private readonly penYaw = spring(0)
  private readonly riderLift = spring(0)
  private readonly pennant = spring(1)
  private flutter = 0
  private penPhase = 0
  // Rafales de battements en vol haut (battements « rares »).
  private burstLeft = 0
  private nextBurst = 0.5
  private burstIndex = 0
  // Coup d'aile et claquement.
  private powerT = -1
  private clapT = -1
  private prevFlap = 0
  private prevDive: DivePhase = 'none'
  // Décrochage (roulé-boulé).
  private stunClock = -1
  private stunDur = 1
  private stunKind: StunKind = 'none'
  private stunDir = 1
  private prevStun = 0
  private initialized = false
  private prevWarped = 0
  /**
   * Battement audible pendant cette frame (pour l'audio : bruit d'aile synchronisé
   * sur l'animation) : amplitude 0..1,2 (0 = aucun). `beatPower` = coup d'aile.
   */
  beat = 0
  beatPower = false
  /** Côté vers lequel la tête se tourne au podium (profil), stable par oiseau. */
  private readonly perchSide: number = 1

  constructor(seed = 0) {
    this.seed = seed
    this.perchSide = hash01(seed * 3 + 1) < 0.5 ? 1 : -1
    this.phase = hash01(seed * 31 + 7) * TAU
    this.nextBurst = 1 + hash01(seed * 17 + 3) * 3
  }

  /** Réinitialise les ressorts sur un état (apparition, téléportation). */
  snap(f: BirdFrame): void {
    this.initialized = false
    this.update(f, 0, { renderScale: 1, detail: 0, mode: 'fly' })
  }

  update(f: BirdFrame, dt: number, ctx: AnimContext): BirdPose {
    const P = this.pose
    this.time += dt
    const t = this.time

    // ─── Lecture de l'état ────────────────────────────────────────────────
    const high = smoothstep(RULES.strongMaxAlt - 3, RULES.altHigh - 1, f.z)
    const climb = clamp01(f.vz / RULES.climbRate)
    const descend = clamp01(-f.vz / RULES.descendRate)
    const windup = f.dive === 'windup'
    const guided = f.dive === 'guided'
    const committed = f.dive === 'committed'
    const diving = guided || committed
    const speedN = clamp01((f.speed - RULES.speedLow * 0.5) / (RULES.diveHSpeed - RULES.speedLow * 0.5))
    const perch = ctx.mode === 'perch'

    // Front montant du coup d'aile et du claquement (« clac »).
    if (f.flap > this.prevFlap + 1e-3 && f.flap > RULES.flapDuration * 0.5) this.powerT = 0
    this.prevFlap = f.flap
    if (committed && this.prevDive !== 'committed') this.clapT = 0
    this.prevDive = f.dive

    // Décrochage : horloge propre, continue même si l'état s'interrompt.
    if (f.stun > this.prevStun + 1e-3) {
      this.stunClock = 0
      this.stunDur = Math.max(0.3, f.stun)
      this.stunKind = f.stunKind === 'none' ? 'hit' : f.stunKind
      // Roule du côté où il penchait (sinon au hasard, stable par oiseau).
      this.stunDir = Math.abs(this.bank.x) > 0.05 ? Math.sign(this.bank.x) : hash01(this.seed * 5 + this.burstIndex) < 0.5 ? 1 : -1
    }
    this.prevStun = f.stun
    let stunP = -1
    if (this.stunClock >= 0) {
      this.stunClock += dt
      stunP = clamp01(this.stunClock / this.stunDur)
      if (stunP >= 1) this.stunClock = -1
    }
    const stunned = stunP >= 0

    // ─── Régime de battement ──────────────────────────────────────────────
    // Bas : lent (0,6 Hz) ; haut : plané, rafales rares ; montée : ample (2 Hz).
    if (high > 0.6 && !diving && !stunned) {
      this.nextBurst -= dt
      if (this.nextBurst <= 0 && this.burstLeft === 0) {
        this.burstIndex++
        this.burstLeft = 2 + (hash01(this.seed * 13 + this.burstIndex) < 0.35 ? 1 : 0)
        this.nextBurst = 3.2 + hash01(this.seed * 7 + this.burstIndex * 3) * 3.5
      }
    } else {
      this.burstLeft = 0
    }
    const bursting = this.burstLeft > 0
    const cruiseAmp = lerp(0.34, bursting ? 0.5 : 0.05, high)
    const cruiseFreq = lerp(0.6, bursting ? 1.2 : 0.4, high)
    const climbS = smoothstep(0.08, 0.7, climb)
    let ampT = lerp(cruiseAmp, 0.62 + 0.38 * climb, climbS)
    let freqT = lerp(cruiseFreq, 1.35 + 0.65 * climb, climbS)
    let foldT = 0.62 * smoothstep(0.12, 0.85, descend)
    ampT *= 1 - smoothstep(0.08, 0.45, descend)
    let rearT = 0
    let pitchT = climb * 12 * DEG - descend * 22 * DEG
    if (windup) {
      ampT = 0.1
      foldT = 0
      rearT = 1
    }
    if (guided) {
      ampT = 0
      foldT = 0.9
      pitchT = -30 * DEG
    }
    if (committed) {
      ampT = 0
      foldT = 1
      pitchT = -36 * DEG
    }
    if (stunned) {
      ampT = 0.75
      freqT = 3.1
      foldT = 0.3
    }
    if (perch) {
      ampT = 0
      foldT = 0
      pitchT = 0
    }
    // Rafale du Simoun : les ailes tremblent (GDD §4.3).
    const storm = f.inStorm ? 1 : 0

    const k = this.initialized ? dt : 10
    if (!this.initialized) this.initialized = true
    springTo(this.amp, ampT, 5, 1, k)
    this.freq = damp(this.freq, freqT, 4, k)
    // Repli rapide au piqué (0,15 s), déploiement plus lent (0,4 s).
    springTo(this.fold, foldT, foldT > this.fold.x ? 22 : 9, 1, k)
    springTo(this.rear, rearT, 26, 0.75, k)
    springTo(this.glide, high * (1 - climbS) * (1 - this.fold.x), 3, 1, k)

    // Phase : un battement complet par tour.
    const prevPhase = this.phase
    this.phase += TAU * this.freq * dt
    if (Math.floor(this.phase / TAU) > Math.floor(prevPhase / TAU) && this.burstLeft > 0) this.burstLeft--
    if (this.phase > TAU * 1000) this.phase -= TAU * 1000

    // Coup d'aile (0,42 s) et claquement (0,24 s) : canaux additifs à enveloppe nulle aux bords.
    let power = 0
    let powerEnv = 0
    this.beat = 0
    this.beatPower = false
    if (this.powerT >= 0) {
      const before = this.powerT
      this.powerT += dt / 0.42
      // L'abattée du coup d'aile passe à l'horizontale vers 0,5 : le « whoosh ».
      if (before < 0.5 && this.powerT >= 0.5) {
        this.beat = 1.2
        this.beatPower = true
      }
      if (this.powerT >= 1) this.powerT = -1
      else {
        power = powerStroke(this.powerT)
        powerEnv = bump(Math.min(1, this.powerT * 1.2))
      }
    }
    let clap = 0
    if (this.clapT >= 0) {
      this.clapT += dt / 0.24
      if (this.clapT >= 1) this.clapT = -1
      else clap = bump(this.clapT)
    }

    const amp = Math.max(0, this.amp.x) * (1 - powerEnv)
    const fold = clamp(this.fold.x, 0, 1.1)
    // Phase déformée : l'abattée (sin décroissant) dure plus longtemps que la remontée.
    const ph = this.phase + 0.28 * Math.sin(this.phase)
    const sinP = Math.sin(ph)
    const cosP = Math.cos(ph)
    const up = Math.max(0, cosP) // remontée : l'aile se replie légèrement
    // Battement audible : l'aile passe l'horizontale en descendant (sin φ franchit 0 vers le bas).
    if (Math.sin(this.prevWarped) > 0 && sinP <= 0 && amp > 0.12 && this.beat === 0) this.beat = amp
    this.prevWarped = ph

    // ─── Ailes ────────────────────────────────────────────────────────────
    const bankN = clamp(f.turnRate / (RULES.turnLowDegPerS * DEG), -1, 1)
    springTo(this.bank, bankN * 50 * DEG, 7, 0.85, k)
    // Inclinaison lissée (−1..1) : tout ce qui dépend du virage passe par le ressort.
    const bankS = this.bank.x / (50 * DEG)
    const glide = this.glide.x
    const rear = this.rear.x
    for (const side of SIDES) {
      const w = side > 0 ? P.wingL : P.wingR
      wingReset(w)
      // + si c'est l'aile intérieure du virage (virage à gauche = aile gauche intérieure).
      const inner = side * bankS
      const tremble = storm > 0 ? storm * 0.06 * noise1(t * 11 + side * 3, this.seed) : 0
      // Onde qui court vers la pointe, faible déphasage : l'aile reste tendue, jamais « cassée ».
      const flapBase = amp * 0.44 * sinP
      // Dièdre en « mouette » au plané : épaule relevée, main légèrement abaissée, pointe relevée.
      const gull = 0.05 + glide * 0.1
      w.shoulderFlap = flapBase + gull * (1 - fold) + rear * 0.55 + power * 0.95 + clap * 1.15 + fold * 0.06 - inner * 0.05 + tremble
      w.elbowFlap = amp * 0.14 * Math.sin(ph - 0.35) + power * 0.25 + rear * 0.12 - gull * 0.3
      w.wristFlap = amp * 0.12 * Math.sin(ph - 0.7) + power * 0.22 - gull * 0.5 + tremble
      w.fingerFlap = amp * 0.17 * Math.sin(ph - 1.0) + glide * 0.16 + power * 0.18 + rear * 0.1 + fold * 0.05
      // Flèche : repli au piqué (silhouette en flèche) + repli de la remontée.
      // Piqué : bras rabattus vers l'arrière, mains alignées sur le corps → pointe de flèche.
      const f2 = fold
      // (la main, déjà en flèche au repos, est redressée pour garder un bord d'attaque droit).
      w.shoulderSweep = f2 * 1.0 + amp * 0.06 * up - rear * 0.12 + inner * 0.06 - (1 - f2) * 0.04 * glide
      w.elbowSweep = f2 * 0.12 + amp * 0.3 * up
      w.wristSweep = -f2 * 0.2 + amp * 0.42 * up - rear * 0.1
      w.fingerSweep = -f2 * 0.12 + amp * 0.18 * up
      // Vrillage : pronation à l'abattée, supination à la remontée.
      w.shoulderTwist = -amp * 0.1 * cosP + rear * 0.15
      w.wristTwist = -amp * 0.16 * Math.cos(ph - 0.8) + fold * 0.06
    }

    // ─── Corps ────────────────────────────────────────────────────────────
    springTo(this.pitch, pitchT + power * 5 * DEG, 6, 0.9, k)
    let roll = this.bank.x
    let yawExtra = 0
    let pitchExtra = rear * 28 * DEG
    if (stunned) {
      // Roulé-boulé : un tour complet, qui se termine exactement à 2π (≡ 0).
      const e = stunP < 0.5 ? 4 * stunP ** 3 : 1 - (-2 * stunP + 2) ** 3 / 2
      roll += this.stunDir * e * TAU
      if (this.stunKind === 'hit') {
        yawExtra = Math.sin(this.stunClock * 9) * 0.35 * (1 - stunP)
        pitchExtra += Math.sin(this.stunClock * 6.5) * 0.25 * (1 - stunP)
      } else {
        pitchExtra += -0.35 * bump(stunP)
      }
    }
    const heading = f.heading
    P.yaw = heading + Math.PI / 2 + yawExtra
    P.pitch = this.pitch.x + pitchExtra
    P.roll = storm > 0 ? roll + storm * 0.05 * noise1(t * 7, this.seed + 1) : roll

    // Montée et descente du corps opposées au battement.
    P.bodyLift = -amp * 0.13 * cosP - power * 0.1
    P.bodyPitch = amp * 0.03 * sinP
    P.bodyRoll = 0

    // Position monde (three : x, z-altitude, -y).
    P.px = f.x
    // Au ras du sable, une aile inclinée plongerait dans le sol : on soulève
    // l'oiseau d'autant (cosmétique : l'empreinte de gameplay ne bouge pas).
    const halfSpan = 5.5 * (1 - 0.45 * clamp01(fold))
    P.py = Math.max(f.z, halfSpan * Math.abs(Math.sin(P.roll)) + 0.6)
    P.pz = -f.y

    // Échelle : ×1,10 en haut (ART_BIBLE §6.7) × échelle de rendu.
    springTo(this.scale, (1 + 0.1 * high) * ctx.renderScale, 4, 1, k)
    P.scale = this.scale.x

    // ─── Cou, tête ────────────────────────────────────────────────────────
    let neckPT = 0.05 * climb - 0.08 * fold + rear * 0.35
    let neckYT = bankN * 0.32
    if (stunned) {
      neckPT += -0.25 + Math.sin(this.stunClock * 7) * 0.2
      neckYT += Math.sin(this.stunClock * 5.3) * 0.4
    }
    springTo(this.neckP, neckPT, 9, 0.8, k)
    springTo(this.neckY, neckYT, 7, 0.8, k)
    P.neckPitch = this.neckP.x
    P.neckYaw = this.neckY.x
    // La tête se stabilise (contre-roulis) et regarde vers le virage.
    P.headPitch = rear * 0.3 - fold * 0.05 - this.pitch.x * 0.35
    P.headYaw = this.neckY.x * 0.4
    P.headRoll = -this.bank.x * 0.45 * (stunned ? 0 : 1)

    // ─── Queue ────────────────────────────────────────────────────────────
    springTo(this.tailP, -0.18 * climb + 0.12 * descend - rear * 0.3 + power * 0.1, 8, 0.8, k)
    const spreadT = 1 + 0.45 * Math.max(climb * 0.8, Math.abs(bankN) * 0.6, rear, powerEnv) - 0.35 * clamp01(fold)
    springTo(this.spread, perch ? 0.7 : spreadT, 10, 0.8, k)
    P.tailPitch = this.tailP.x
    P.tailYaw = -bankS * 0.12
    P.tailRoll = -this.bank.x * 0.35
    P.tailSpread = this.spread.x

    springTo(this.legs, perch ? 1 : 0, 6, 1, k)
    P.legs = this.legs.x

    // ─── Cavalier, cape, fanion ───────────────────────────────────────────
    springTo(this.riderLift, P.bodyLift * 0.6, 14, 0.5, k)
    P.riderLift = this.riderLift.x - P.bodyLift * 0.6
    P.riderPitch = 0.12 * climb + 0.42 * fold - rear * 0.2 + (stunned ? 0.3 : 0)
    P.riderRoll = -this.bank.x * 0.22

    // Cape : portée par le vent relatif, plaquée en piqué, balancée par les virages.
    const wind = 0.35 + 0.65 * speedN
    this.flutter += dt * (6.5 + 7 * wind)
    this.penPhase += dt * (8 + 8 * wind)
    const liftT = -0.08 + 0.18 * wind + 0.18 * climb - 0.2 * descend + power * 0.3 - fold * 0.15 + (stunned ? 0.5 : 0)
    springTo(this.capeLift, liftT, 6, 0.35, k)
    springTo(this.capeYaw, -bankN * 0.35 + (stunned ? Math.sin(this.stunClock * 8) * 0.6 : 0), 4.5, 0.3, k)
    const flutA = (0.05 + 0.07 * wind) * (1 - 0.6 * fold)
    P.cape1Pitch = this.capeLift.x + flutA * Math.sin(this.flutter) + this.pitch.x * 0.4
    P.cape1Yaw = this.capeYaw.x + flutA * 0.7 * Math.sin(this.flutter * 0.73 + 1.1)
    P.cape2Pitch = this.capeLift.x * 0.6 + flutA * 2.1 * Math.sin(this.flutter - 1.3)
    P.cape2Yaw = this.capeYaw.x * 0.8 + flutA * 1.6 * Math.sin(this.flutter * 0.81 - 0.6)

    springTo(this.pennant, ctx.detail > 0.35 ? 1 : 0, 6, 1, k)
    P.pennant = this.pennant.x
    springTo(this.penYaw, -bankN * 0.4, 5, 0.35, k)
    const penA = 0.14 + 0.1 * wind
    P.pen1Yaw = this.penYaw.x + penA * Math.sin(this.penPhase)
    P.pen2Yaw = this.penYaw.x * 0.6 + penA * 1.9 * Math.sin(this.penPhase - 1.4)
    // Le fanion suit le vent relatif, pas le corps : il compense le tangage.
    P.pen1Pitch = this.pitch.x + 0.04 * Math.sin(this.penPhase * 0.5)
    P.pen2Pitch = 0.08 * Math.sin(this.penPhase * 0.7 - 0.9)

    if (perch) this.applyPerch(P)
    return P
  }

  /**
   * Posture perchée (podium) : le cormoran qui sèche ses ailes (polish B3). Corps
   * redressé, ailes grandes ouvertes à l'horizontale, surface tournée vers la caméra
   * (bande de couleur lisible), mains légèrement tombantes qui « respirent », pattes
   * sorties, cou dressé et tête de profil (bec lisible). Le V héraldique d'avant se
   * lisait comme un artichaut à contre-jour.
   */
  private applyPerch(P: BirdPose): void {
    const k = this.legs.x
    if (k <= 1e-3) return
    const breathe = Math.sin(this.time * 1.7) * 0.05
    for (const side of SIDES) {
      const w = side > 0 ? P.wingL : P.wingR
      w.shoulderFlap = lerp(w.shoulderFlap, PERCH.shoulderFlap + breathe, k)
      w.shoulderSweep = lerp(w.shoulderSweep, PERCH.shoulderSweep, k)
      w.shoulderTwist = lerp(w.shoulderTwist, PERCH.shoulderTwist, k)
      w.elbowFlap = lerp(w.elbowFlap, PERCH.elbowFlap, k)
      w.elbowSweep = lerp(w.elbowSweep, PERCH.elbowSweep, k)
      w.wristFlap = lerp(w.wristFlap, PERCH.wristFlap - breathe * 0.6, k)
      w.wristSweep = lerp(w.wristSweep, PERCH.wristSweep, k)
      w.wristTwist = lerp(w.wristTwist, PERCH.wristTwist, k)
      w.fingerFlap = lerp(w.fingerFlap, PERCH.fingerFlap + breathe * 0.5, k)
      w.fingerSweep = lerp(w.fingerSweep, PERCH.fingerSweep, k)
    }
    P.pitch = lerp(P.pitch, PERCH.pitch, k)
    P.roll = lerp(P.roll, 0, k)
    P.neckPitch = lerp(P.neckPitch, PERCH.neckPitch, k)
    P.neckYaw = lerp(P.neckYaw, 0, k)
    P.headPitch = lerp(P.headPitch, PERCH.headPitch, k)
    P.headYaw = lerp(P.headYaw, PERCH.headYaw * this.perchSide, k)
    P.headRoll = lerp(P.headRoll, PERCH.headRoll * this.perchSide, k)
    P.tailPitch = lerp(P.tailPitch, PERCH.tailPitch, k)
    P.riderPitch = lerp(P.riderPitch, PERCH.riderPitch, k)
    P.riderRoll = lerp(P.riderRoll, 0, k)
  }
}
