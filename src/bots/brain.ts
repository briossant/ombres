// Cerveau d'un bot : la mécanique commune à tous les caractères.
//
// Chaque tick (30 Hz) :
//   1. perception : événements du dernier step, historique retardé (temps de réaction) ;
//   2. couche menace : coup d'aile au clac (réaction ~ N(moyenne, écart type), oublis),
//      panique au cri, contre-virage, coups d'aile gratuits ;
//   3. couche piqué : cible verrouillée tenue assez longtemps → juger, piquer, feinter ;
//   4. à l'intervalle de décision du niveau : erreurs volontaires, réaction au chevron,
//      Grande Ombre, puis le plan du caractère (src/bots/styles.ts) ;
//   5. motricité : le plan devient un cap voulu (+ bruit du niveau) et un étage, écrits
//      dans le BirdInput comme le ferait un joueur (joystick, PLONGER, COUP D'AILE).
//
// Aucune triche : les autres oiseaux sont vus avec le retard du niveau et seulement par
// ce que l'écran montre (src/bots/perception.ts) ; le désert, les ombres des tours et la
// nuit sont lus tels qu'affichés. Aucun élastique : le niveau ne dépend jamais du score.

import { RULES, DEG } from '../sim/rules.ts'
import type { BirdInput, BirdState, SimEvent, SimState, SunState } from '../sim/types.ts'
import { angDiff, clamp } from '../sim/math.ts'
import { ellipticRadius } from '../sim/arena.ts'
import { cruiseSpeed, shadowRadius } from '../sim/footprint.ts'
import { frontPosition, ellipseSupport } from '../sim/night.ts'
import { phaseScale, updateRoundSun } from '../sim/sun.ts'
import { predictInterception, wouldBeHidden } from '../sim/query.ts'
import type { Bot, BotIntent, BotLevel, BotOptions, BotPersonality, BlunderKind, IntentKind } from './types.ts'
import { Rng } from './random.ts'
import { levelParams, type LevelParams } from './levels.ts'
import { TRAITS, type Traits } from './traits.ts'
import { coordinatorFor, type BotCoordinator } from './coordinator.ts'
import { isTargetableSeen, makeSeen, type Seen } from './perception.ts'
import { evaluateHeadings, headingOf, HEADINGS, type EvalInput } from './evaluate.ts'
import type { HideSpot } from './shade.ts'
import { decideStyle } from './styles.ts'

const DT = 1 / RULES.tickHz
const TAU = Math.PI * 2
/**
 * Après une touche (vrille 1,5 s + immunité 2,5 s), les bots laissent la victime
 * tranquille encore quelques secondes : c'est ce que ferait un joueur fair-play, et le
 * GDD §18 veut qu'aucun oiseau ne soit touché plus de 5 fois par manche.
 */
const MERCY_SECONDS = 8
/**
 * Esquive attendue d'une cible dont le coup d'aile est prêt, selon ce que le salon affiche :
 * humain (niveau inconnu : on suppose un joueur moyen), Oisillon, Voyageur, Seigneur (GDD §14.3).
 */
const DODGE_BY_LEVEL = [0.5, 0.15, 0.45, 0.75] as const
/** Démo de l'écran titre (GDD §15.1) : goût du piqué en plus, pour le spectacle. */
const DEMO_FLAIR = 0.35
/** Erreurs typiques du débutant (GDD §14.3 : tempête, hésitation, oubli). */
const BEGINNER_BLUNDERS: readonly (readonly [BlunderKind, number])[] = [
  ['storm', 1],
  ['hesitate', 1.5],
  ['wander', 1.5],
]

/** Plan en cours : une seule structure réutilisée (aucune allocation par tick). */
export interface Plan {
  kind: IntentKind
  /** Cap voulu (plans à cap fixe : peinture, balayage, fuite). */
  heading: number
  /** Point visé (raid, cachette, scellage…), NaN sinon. */
  x: number
  y: number
  /** Oiseau visé, −1 sinon. */
  target: number
  since: number
  until: number
  low: boolean
  /** Sens de rotation (cercles, looping) : +1 à gauche, −1 à droite. */
  turn: number
  /** Raid : coup d'aile d'entrée déjà donné. */
  flapped: boolean
  // sillons (Laboureur)
  cx: number
  cy: number
  ax: number
  ay: number
  lane: number
  lanes: number
  laneStep: number
  lanesDone: number
  spacing: number
  halfLen: number
  dir: number
  // looping, zigzag
  turned: number
  lastHeading: number
  amp: number
  period: number
}

function makePlan(): Plan {
  return {
    kind: 'idle',
    heading: 0,
    x: NaN,
    y: NaN,
    target: -1,
    since: 0,
    until: Infinity,
    low: false,
    turn: 1,
    flapped: false,
    cx: 0,
    cy: 0,
    ax: 1,
    ay: 0,
    lane: 0,
    lanes: 1,
    laneStep: 1,
    lanesDone: 0,
    spacing: RULES.botFurrowSpacing,
    halfLen: 30,
    dir: 1,
    turned: 0,
    lastHeading: 0,
    amp: 0,
    period: 1,
  }
}

export interface PaintOptions {
  /** Multiplicateur de la valeur basse (défaut : celui du caractère). */
  lowBias?: number
  /** Cap vers lequel pencher et force (fraction de l'échelle des valeurs). */
  goal?: number
  goalGain?: number
  forceLow?: boolean
  forceHigh?: boolean
  /** Oiseau dont le sable vaut plus et multiplicateur. */
  focus?: number
  focusMul?: number
  /** Multiplicateur de scellage (défaut : celui du caractère, selon le niveau). */
  seal?: number
  /** Pénalité supplémentaire par cap (Grande Ombre : ne pas voler vers la nuit). */
  penalty?: (heading: number) => number
}

export interface PaintChoice {
  heading: number
  low: boolean
  value: number
  valueHigh: number
  valueLow: number
}

export class BotBrain implements Bot {
  readonly slot: number
  readonly personality: BotPersonality
  readonly level: BotLevel
  readonly substitute: boolean
  readonly intent: BotIntent = { kind: 'idle', target: -1, x: NaN, y: NaN, low: false, blunder: null }

  readonly lp: LevelParams
  readonly traits: Traits
  readonly rng: Rng
  readonly plan: Plan = makePlan()

  state!: SimState
  co!: BotCoordinator
  /** Oiseau piloté (état courant). */
  me!: BirdState
  now = 0

  private readonly input: BirdInput = { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
  private attached: SimState | null = null
  private resetSeen = -1
  private readonly seenA: Seen = makeSeen()
  private readonly seenB: Seen = makeSeen()
  private readonly valsHigh = new Float64Array(HEADINGS)
  private readonly valsLow = new Float64Array(HEADINGS)
  private readonly suns: SunState[] = []
  private readonly evalInput: EvalInput

  // décisions
  nextDecision = 0
  private noise = 0
  private paleOnStrongMistake = false
  /** Étage voulu par le plan et forçages temporaires. */
  private wantLow = false
  private forceHighUntil = -1
  private forceLowUntil = -1
  private wantHeading = 0
  /** Instant du dernier changement d'étage voulu. */
  private altitudeSince = -Infinity
  // boutons
  private held = false
  private diveHold = false
  private flapRequest = false
  private flapDirX = 0
  private flapDirY = 0
  // menace
  private dodgeAt = -1
  private dodgeHunter = -1
  private panicAt = -1
  private counterTurnAt = -1
  private counterTurnUntil = -1
  private counterSign = 1
  private lockedEpisode = -1
  private climbRoll = 1
  /** Coup d'aile programmé par anticipation (avant même le clac). */
  private anticipating = false
  // piqué
  private lockTarget = -1
  private lockSince = 0
  private lockRoll = 1
  private badRoll = 1
  private feintAt = -1
  /** Le piqué en cours a été vu (lancé par nous ou « tombé dessus ») et jugé. */
  private diveJudged = false
  /** Fin de la pause de peinture après un piqué (Faucon). */
  postDiveUntil = -1
  /** Dernière touche réussie (célébrations). */
  lastHitAt = -Infinity
  // erreurs
  private blunder: BlunderKind | null = null
  private blunderUntil = -1
  private nextBlunderAt = Infinity
  private blunderHeading = 0
  // mémoire du caractère
  homeX = 0
  homeY = 0
  private homeAt = -Infinity
  /** Horodatage de début du cercle au-dessus de la proie (Faucon), −1 sinon. */
  circleSince = -1
  /** Mémoire libre des styles (fin de cachette, de peinture, de raid…). */
  memo: Record<string, number> = {}

  constructor(opts: BotOptions) {
    this.slot = opts.slot
    this.personality = opts.personality
    // l'Horloger n'existe qu'en Voyageur et en Seigneur (GDD §14.2)
    this.level = opts.personality === 'watchmaker' && opts.level === 0 ? 1 : opts.level
    this.substitute = !!opts.substitute
    this.lp = levelParams(this.level)
    this.traits = TRAITS[opts.personality]
    this.rng = new Rng(opts.seed ^ Math.imul(opts.slot + 1, 0x9e3779b1))
    this.evalInput = {
      state: undefined as unknown as SimState,
      values: undefined as unknown as EvalInput['values'],
      forecast: new Uint8Array(0),
      slot: this.slot,
      x: 0,
      y: 0,
      heading: 0,
      comp: this.lp.shadowComp,
      suns: this.suns,
      paleOnStrong: false,
      towers: this.lp.towers,
      weights: { neutral: 1, steal: 1, crown: 1, upgrade: 1, seal: 1, focus: -1, focusMul: 1, rival: new Float32Array(12).fill(1) },
      turnCost: this.lp.turnCost * this.traits.turnMul,
      turnRel: 0,
      stormFrom: this.traits.stormFrom,
      // le Fou ne voit pas plus loin que le bout de son bec, quel que soit son niveau
      headingStep: opts.personality === 'fool' ? 2 : this.lp.headingStep,
      nearCount: opts.personality === 'fool' ? 2 : this.lp.nearCount,
      farCount: opts.personality === 'fool' ? 1 : this.lp.farCount,
      sweepSkill: opts.personality === 'fool' ? Math.min(0.5, this.lp.sweepSkill) : this.lp.sweepSkill,
    }
  }

  // ─── Cycle ────────────────────────────────────────────────────────────────

  think(state: SimState, events: readonly SimEvent[]): BirdInput {
    if (state !== this.attached) this.attach(state)
    const co = this.co
    co.update(state, events)
    this.now = state.time
    if (co.resetCount !== this.resetSeen) {
      this.resetSeen = co.resetCount
      this.clearPlan()
      this.nextDecision = this.now
    }
    const me = state.bySlot[this.slot]
    if (!me) {
      this.releaseButtons()
      return this.input
    }
    this.me = me
    this.handleEvents(events, me)
    const phase = state.sun.phase
    if (phase === 'countdown' || phase === 'night' || phase === 'over' || state.over) {
      this.idle()
      return this.input
    }
    if (me.stun > 0) {
      // décroché : plus aucun contrôle ; on replanifiera à la sortie
      this.setIntent('idle')
      this.diveHold = false
      this.dodgeAt = -1
      this.nextDecision = Math.max(this.nextDecision, this.now + me.stun + this.lp.reaction * 0.5)
      this.writeInput(me)
      return this.input
    }
    this.updateHome()
    this.threatTick(me)
    this.diveTick(me)
    if (me.dive === 'none' && this.now >= this.nextDecision) this.decide(me)
    this.steer(me)
    this.writeInput(me)
    return this.input
  }

  reset(): void {
    this.attached = null
  }

  private attach(state: SimState): void {
    this.attached = state
    this.state = state
    this.co = coordinatorFor(state)
    this.co.registerBot(this.slot, this.level)
    this.resetSeen = this.co.resetCount
    this.evalInput.state = state
    this.evalInput.values = this.co.values
    this.clearPlan()
    this.held = false
    this.diveHold = false
    this.lockTarget = -1
    this.dodgeAt = -1
    this.panicAt = -1
    this.forceHighUntil = -1
    this.forceLowUntil = -1
    this.postDiveUntil = -1
    this.blunder = null
    this.now = state.time
    this.nextDecision = state.time + this.rng.range(0, this.lp.decision)
    this.nextBlunderAt = state.time + Math.max(6, this.rng.exp(this.lp.errorEvery / this.traits.blunderRate))
    const me = state.bySlot[this.slot]
    this.homeX = me?.x ?? 0
    this.homeY = me?.y ?? 0
    this.homeAt = -Infinity
    this.wantHeading = me?.heading ?? 0
  }

  clearPlan(): void {
    const p = this.plan
    p.kind = 'idle'
    p.target = -1
    p.x = NaN
    p.y = NaN
    p.since = this.now
    p.until = this.now
    p.flapped = false
    this.circleSince = -1
    this.memo = {}
  }

  private idle(): void {
    this.setIntent('idle')
    this.dodgeAt = -1
    this.panicAt = -1
    this.diveHold = false
    this.flapRequest = false
    this.input.dirX = 0
    this.input.dirY = 0
    this.input.dive = false
    this.held = false
  }

  private releaseButtons(): void {
    this.input.dive = false
    this.held = false
    this.diveHold = false
  }

  // ─── Perception ───────────────────────────────────────────────────────────

  /** Ticks de retard de la perception (temps de réaction du niveau). */
  get delayTicks(): number {
    return Math.round(this.lp.reaction * RULES.tickHz)
  }

  /** L'oiseau `slot` tel que ce bot le voit (retardé). L'objet est réutilisé. */
  see(slot: number, out: Seen = this.seenA): Seen | null {
    return this.co.history.see(slot, this.delayTicks, out) ? out : null
  }

  /** Second tampon de perception (comparer deux oiseaux). */
  seeB(slot: number): Seen | null {
    return this.see(slot, this.seenB)
  }

  /** Temps de soleil mis à l'échelle d'une manche de 110 s (les repères du GDD). */
  get t110(): number {
    return this.state.sun.t / phaseScale(this.state.config.sunSeconds)
  }

  /** Meneur au sens de la bande de sable du HUD (plus de cellules), −1 si personne. */
  leader(): number {
    const counts = this.state.grid.counts
    let best = -1
    let c = 0
    for (const b of this.state.birds) {
      const n = counts[b.slot + 1]!
      if (n > c) {
        c = n
        best = b.slot
      }
    }
    return best
  }

  private handleEvents(events: readonly SimEvent[], me: BirdState): void {
    for (const e of events) {
      switch (e.type) {
        case 'diveWindup':
          if (e.target === this.slot) this.onWindup(e.hunter)
          break
        case 'diveCommit':
          if (e.target === this.slot) this.onClac(e.hunter, me)
          break
        case 'diveHit':
          if (e.hunter === this.slot) {
            this.lastHitAt = this.now
            this.onDiveOver()
          } else if (e.target === this.slot) this.clearPlan()
          break
        case 'diveMiss':
        case 'diveCancel':
          if (e.hunter === this.slot) this.onDiveOver()
          // ce piqué-là est fini : le coup d'aile prévu contre lui n'a plus lieu d'être
          if (e.target === this.slot && e.hunter === this.dodgeHunter) {
            this.dodgeAt = -1
            this.anticipating = false
          }
          break
        default:
          break
      }
    }
  }

  private onDiveOver(): void {
    this.diveHold = false
    this.feintAt = -1
    this.diveJudged = false
    this.circleSince = -1
    // le Faucon peint pâle entre deux attaques
    if (this.personality === 'falcon') this.postDiveUntil = this.now + (this.t110 < RULES.phaseGoldenAt ? this.rng.range(4, 7) : this.rng.range(2, 3.5))
    if (this.plan.kind === 'circle' || this.plan.kind === 'hunt' || this.plan.kind === 'ambush') this.clearPlan()
    this.nextDecision = this.now
  }

  // ─── Couche menace ────────────────────────────────────────────────────────

  /**
   * Prise d'élan contre soi (le « ! ») : certains paniquent et battent des ailes trop tôt ;
   * les meilleurs lisent la distance et préparent leur coup d'aile pour juste après le clac.
   */
  private onWindup(hunter: number): void {
    const chance = this.personality === 'fool' ? Math.max(0.5, this.lp.panicFlapChance) : this.lp.panicFlapChance
    if (this.rng.chance(chance)) {
      this.panicAt = this.now + this.lp.reaction * this.rng.range(0.5, 0.9)
      return
    }
    const me = this.me
    const h = this.see(hunter)
    if (!h || !this.rng.chance(this.lp.anticipateChance) || this.rng.chance(this.lp.flapForget)) return
    // clac attendu : fin de la prise d'élan, plus le temps de s'approcher à 0,65 s d'interception
    const tau = Math.hypot(h.x - me.x, h.y - me.y) / RULES.diveHSpeed
    const clacIn = RULES.diveWindup + Math.max(0, tau - RULES.diveCommitLead)
    const at = this.now + clacIn + Math.max(0.03, this.lp.anticipateDelay + this.lp.flapSd * this.rng.gauss())
    this.dodgeAt = this.dodgeAt > 0 ? Math.min(this.dodgeAt, at) : at
    this.dodgeHunter = hunter
    this.anticipating = true
  }

  /** Le « clac » : coup d'aile après un temps de réaction ~ N(moyenne, écart type), ou oubli. */
  private onClac(hunter: number, me: BirdState): void {
    if (me.flapCooldown > 0) {
      // plus de coup d'aile : un Seigneur tente le contre-virage (GDD §8.5)
      if (this.level === 2) {
        this.counterTurnAt = this.now + Math.max(0.1, this.lp.flapMean + this.lp.flapSd * this.rng.gauss() - 0.12)
        this.counterSign = me.turnRate >= 0 ? -1 : 1
      }
      return
    }
    if (this.anticipating && this.dodgeAt > 0 && this.dodgeHunter === hunter) return
    if (this.rng.chance(this.lp.flapForget)) return
    let react = this.lp.flapMean + this.lp.flapSd * this.rng.gauss()
    // l'Horloger, trop méthodique, réagit lentement au milieu de la manche
    if (this.personality === 'watchmaker' && this.t110 > 30 && this.t110 < 80) react += 0.07
    this.dodgeAt = this.now + Math.max(0.08, react)
    this.dodgeHunter = hunter
    this.anticipating = false
  }

  private threatTick(me: BirdState): void {
    this.flapRequest = false
    const ready = me.flapCooldown <= 0 && me.dive === 'none'
    if (this.dodgeAt > 0 && this.now >= this.dodgeAt) {
      this.dodgeAt = -1
      this.anticipating = false
      if (ready) this.requestDodge(me, this.dodgeHunter)
    }
    if (this.panicAt > 0 && this.now >= this.panicAt) {
      this.panicAt = -1
      if (ready) this.requestFlap(me.heading + this.rng.sym(80 * DEG))
    }
    if (this.counterTurnAt > 0 && this.now >= this.counterTurnAt) {
      this.counterTurnAt = -1
      this.counterTurnUntil = this.now + 0.45
    }
    // coups d'aile gratuits (Fou)
    if (ready && !this.flapRequest && this.traits.freeFlapRate > 0 && this.rng.chance(this.traits.freeFlapRate * DT)) {
      this.requestFlap(me.heading + this.rng.sym(60 * DEG))
    }
    // sprint pour peindre plus vite, seulement quand aucun chasseur ne peut piquer
    if (ready && !this.flapRequest && this.lp.sprintRate > 0 && this.rng.chance(this.lp.sprintRate * this.traits.sprintMul * DT) && this.sprintSafe(me)) {
      this.requestFlap(this.wantHeading)
    }
  }

  /** Sprint sans risque : on peint, rien au-dessus de soi à portée de piqué, pas de verrouillage. */
  private sprintSafe(me: BirdState): boolean {
    const k = this.plan.kind
    if (k !== 'paint' && k !== 'furrow' && k !== 'sweep' && k !== 'raid' && k !== 'seal' && k !== 'night') return false
    if (me.lockedBy >= 0) return false
    if (Math.abs(angDiff(this.wantHeading, me.heading)) > 30 * DEG) return false
    for (const b of this.state.birds) {
      if (b.slot === this.slot) continue
      const s = this.see(b.slot, this.seenB)
      if (!s) continue
      // un oiseau plus haut dans les parages pourrait piquer pendant la recharge (3 s)
      if (s.z - RULES.diveLockDz >= Math.min(me.z, RULES.strongMaxAlt) - 1 && Math.hypot(s.x - me.x, s.y - me.y) < this.lp.sprintSafeRadius) return false
    }
    return true
  }

  /** Coup d'aile perpendiculaire à l'approche du chasseur, du côté le plus sûr. */
  private requestDodge(me: BirdState, hunter: number): void {
    const h = this.see(hunter)
    let ax = me.x - (h?.x ?? me.x - Math.cos(me.heading))
    let ay = me.y - (h?.y ?? me.y - Math.sin(me.heading))
    // la trajectoire engagée du chasseur est rectiligne : on s'en écarte à angle droit
    if (h && Math.hypot(h.vx, h.vy) > 5) {
      ax = h.vx
      ay = h.vy
    }
    const L = Math.hypot(ax, ay) || 1
    let px = -ay / L
    let py = ax / L
    const { a, b } = this.state.arena
    const side = (sx: number, sy: number): number => {
      const x = me.x + sx * 7
      const y = me.y + sy * 7
      let cost = Math.max(0, ellipticRadius(x, y, a, b) - 0.8) * 10
      for (const t of this.state.towers) if (!t.outside && Math.hypot(t.x - x, t.y - y) < t.trunkRadius + 4) cost += 1
      return cost
    }
    // Seigneur : le meilleur côté ; sinon au hasard, sauf près du bord
    const cPlus = side(px, py)
    const cMinus = side(-px, -py)
    let flip = this.rng.chance(0.5)
    if (this.level === 2 || Math.abs(cPlus - cMinus) > 0.5) flip = cMinus < cPlus
    if (flip) {
      px = -px
      py = -py
    }
    const ang = Math.atan2(py, px) + this.rng.sym(this.lp.headingNoise * 0.5)
    this.requestFlap(ang)
    this.setIntent('flee')
  }

  private requestFlap(angle: number): void {
    this.flapRequest = true
    this.flapDirX = Math.cos(angle)
    this.flapDirY = Math.sin(angle)
  }

  /** Coup d'aile de sprint (Pie à l'entrée d'un raid), vers un cap donné. */
  sprint(angle: number): boolean {
    const me = this.me
    if (me.flapCooldown > 0 || me.dive !== 'none' || this.flapRequest) return false
    this.requestFlap(angle)
    return true
  }

  // ─── Couche piqué ─────────────────────────────────────────────────────────

  private diveTick(me: BirdState): void {
    if (me.dive !== 'none') {
      // piqué en cours : PLONGER maintenu jusqu'au clac, sauf feinte
      if (!this.diveJudged) {
        // lancé tout seul en « tombant » sur quelqu'un (PLONGER maintenu) : le veut-on ?
        this.diveJudged = true
        this.diveHold = this.acceptDive(me, me.diveTarget, true)
        if (this.diveHold) this.co.engage(this.slot, me.diveTarget, this.now)
      }
      if (me.dive !== 'committed' && this.feintAt > 0 && this.now >= this.feintAt) this.diveHold = false
      this.setIntent('dive', me.diveTarget)
      return
    }
    this.diveHold = false
    this.diveJudged = false
    this.feintAt = -1
    if (me.stun > 0 || me.diveCooldown > 0 || me.lockTarget < 0) {
      this.lockTarget = -1
      return
    }
    if (me.lockTarget !== this.lockTarget) {
      this.lockTarget = me.lockTarget
      this.lockSince = this.now
      this.lockRoll = this.rng.next()
      this.badRoll = this.rng.next()
    }
    const hold = this.personality === 'fool' ? Math.min(this.lp.lockHold, 0.1) : this.lp.lockHold
    if (this.now - this.lockSince < hold) return
    if (!this.acceptDive(me, me.lockTarget, false)) return
    this.launchDive(me, me.lockTarget)
  }

  private launchDive(me: BirdState, target: number): void {
    this.input.divePresses++
    this.held = true
    this.diveHold = true
    this.diveJudged = true
    this.lockTarget = target
    this.co.engage(this.slot, target, this.now)
    // feinte : relâcher PLONGER pendant la prise d'élan, pour faire gaspiller le coup d'aile
    const t = this.see(target)
    const feint = t !== null && t.flapReady && this.rng.chance(this.lp.feintChance)
    this.feintAt = feint ? this.now + this.rng.range(0.05, 0.13) : -1
    void me
  }

  /**
   * Faut-il piquer cette cible verrouillée ? Équité, choix des victimes du niveau,
   * géométrie (interception rapide, cible pas sur le point de se cacher), goût du
   * caractère et, pour le Seigneur, espérance de gain (traînée contre décrochage).
   */
  acceptDive(me: BirdState, target: number, falling: boolean): boolean {
    const t = this.see(target)
    if (!t || t.stunned || t.immune) return false
    if (!this.co.canEngage(this.slot, target, this.now)) return false
    if (!this.victimAllowed(t)) return false
    // pas d'acharnement : un oiseau qui vient de se faire piquer souffle un peu
    if (!t.crown && this.co.sinceHit(target, this.now) < MERCY_SECONDS) return false
    const isPrey = this.plan.target === target && (this.plan.kind === 'hunt' || this.plan.kind === 'circle' || this.plan.kind === 'ambush')
    // Faucon : un cercle au-dessus de la proie avant de piquer (sa signature)
    if (this.personality === 'falcon' && !falling) {
      if (this.circleSince < 0) return false
      const circling = this.now - this.circleSince
      // un vrai cercle, lisible : au moins 0,8 s (GDD) et un arc d'au moins 110°, ou 1,6 s
      if (circling < RULES.botCircleBeforeDiveSeconds) return false
      if (this.plan.kind === 'circle' && this.plan.turned < 110 * DEG && circling < 1.6) return false
    }
    if (!falling && !isPrey) {
      // écran titre : une démo doit montrer des piqués, les bots y sont plus joueurs
      let chance = this.traits.opportunism + (this.state.config.mode === 'demo' ? DEMO_FLAIR : 0)
      // au couchant, une traînée vaut cher : les meilleurs piquent davantage
      if (this.t110 >= RULES.phaseGoldenAt) chance = Math.min(1, chance + this.lp.sunsetHunt * clamp((this.t110 - RULES.phaseGoldenAt) / 30, 0, 1))
      if (this.personality === 'watchmaker' && this.t110 >= RULES.phaseSunsetAt) chance = 1
      if (t.crown) chance = Math.min(1, chance * (1 + RULES.botLeaderBias))
      if (this.lockRoll >= chance) return false
    }
    // géométrie
    const ic = predictInterception(this.state, this.slot, target)
    let good = ic.t <= RULES.diveWindup + 0.95 && me.z - t.z >= RULES.diveLockDz
    if (good && this.lp.towers !== 'ignore' && wouldBeHidden(this.state, ic.x, ic.y, t.z)) good = false
    if (!good && this.personality !== 'fool' && this.badRoll >= this.lp.badDiveChance) return false
    if (this.lp.victims === 'optimal' && !t.crown) {
      // espérance : traînée volée contre le temps perdu si l'on plante
      const sun = this.state.sun
      const shAng = Math.atan2(sun.shadowDirY, sun.shadowDirX)
      const trail = 2 * shadowRadius(t.z) * t.speed * (1 + (sun.stretch - 1) * Math.abs(Math.sin(t.heading - shAng))) * RULES.trailStealSeconds * 0.6
      const mine = 2 * shadowRadius(me.z) * cruiseSpeed(me.z) * (1 + (sun.stretch - 1) * 0.5) * (RULES.missStun + RULES.diveCooldown) * 0.35
      const pHit = t.flapReady ? 1 - DODGE_BY_LEVEL[this.co.levelOf(target) + 1]! : 0.95
      if (pHit * trail < (1 - pHit) * mine && !isPrey) return false
    }
    return true
  }

  /** Choix des victimes du niveau (GDD §14.3). */
  victimAllowed(t: Seen): boolean {
    switch (this.lp.victims) {
      case 'botsOrCrown':
        return !t.assist && (t.crown || this.co.isBot(t.slot))
      default:
        return true
    }
  }

  // ─── Décision ─────────────────────────────────────────────────────────────

  private decide(me: BirdState): void {
    this.nextDecision = this.now + this.lp.decision * this.rng.range(0.85, 1.15)
    this.noise = this.rng.sym(this.lp.headingNoise)
    this.paleOnStrongMistake = this.rng.chance(this.lp.paleOnStrongChance)
    if (this.blunder && this.now < this.blunderUntil) return
    this.blunder = null
    if (this.now >= this.nextBlunderAt && this.plan.kind !== 'circle' && this.plan.kind !== 'ambush') {
      this.nextBlunderAt = this.now + Math.max(4, this.rng.exp(this.lp.errorEvery / this.traits.blunderRate))
      this.startBlunder(me)
      if (this.blunder) return
    }
    if (this.threatDecision(me)) return
    if (this.nightDecision(me)) return
    decideStyle(this, me)
  }

  /** Chevron au-dessus de soi (vu avec retard) : se cacher, remonter, fuir ou l'ignorer. */
  private threatDecision(me: BirdState): boolean {
    const self = this.see(this.slot)
    const hunter = self?.lockedBy ?? -1
    if (hunter < 0 || hunter === this.slot) {
      this.lockedEpisode = -1
      if (this.plan.kind === 'hide' && this.now < this.plan.until) return true
      return false
    }
    if (hunter !== this.lockedEpisode) {
      this.lockedEpisode = hunter
      this.climbRoll = this.rng.next()
    }
    switch (this.traits.threat) {
      case 'ignore':
        return false
      case 'flee': {
        const h = this.see(hunter)
        if (!h) return false
        const p = this.plan
        if (p.kind !== 'flee') {
          p.kind = 'flee'
          p.since = this.now
          p.until = this.now + this.rng.range(1.2, 2)
          p.heading = Math.atan2(me.y - h.y, me.x - h.x)
          p.low = true
          p.target = hunter
        }
        return this.now < p.until
      }
      default: {
        if (this.lp.towers !== 'ignore') {
          const spot = this.bestHideSpot(me, 1.4)
          if (spot) {
            this.goTo('hide', spot.x, spot.y, true, 2.5)
            this.plan.target = hunter
            return true
          }
        }
        if (this.climbRoll < this.lp.climbWhenLocked) this.forceHighUntil = this.now + 1.8
        return false
      }
    }
  }

  /** Grande Ombre (GDD §14.3) : partir vers l'est à l'heure du niveau, ou quand le front arrive. */
  private nightDecision(me: BirdState): boolean {
    const st = this.state
    if (st.config.mode === 'lobby') return false
    const k = phaseScale(st.config.sunSeconds)
    const t = st.sun.t
    const leave = this.lp.nightLeaveAt
    let active = leave !== null && t >= (leave + this.traits.nightLeaveShift) * k
    const night = st.night
    const dirX = night.active ? night.dirX : st.sun.shadowDirX
    const dirY = night.active ? night.dirY : st.sun.shadowDirY
    const along = me.shadow.cx * dirX + me.shadow.cy * dirY
    if (!active && night.active && along - night.s < 40) active = true
    if (!active) return false
    // front dans 2 s (ou à son entrée s'il n'est pas encore là)
    const T = st.config.sunSeconds
    const ext = ellipseSupport(st.arena.a, st.arena.b, dirX, dirY)
    const s2 = frontPosition(Math.max(t + 2, RULES.greatShadowAt * k), T, ext)
    const east = Math.atan2(dirY, dirX)
    const v = cruiseSpeed(me.z)
    const lord = this.level === 2
    const danger = (h: number): number => {
      const x = me.x + Math.cos(h) * v * 2
      const y = me.y + Math.sin(h) * v * 2
      const margin = x * dirX + y * dirY - s2
      // le Seigneur accepte de peindre au ras du front (il y scelle), les autres gardent 25 m
      const keep = lord ? 8 : 25
      return margin < keep ? (keep - margin) * 40 : 0
    }
    const urgency = clamp(1 - (along - s2) / 90, 0.15, 1)
    const c = this.paintChoice({ goal: east, goalGain: lord ? 0.25 * urgency : 0.6 * urgency, penalty: danger })
    this.setPaint(c, 'night')
    return true
  }

  // ─── Erreurs volontaires ──────────────────────────────────────────────────

  private startBlunder(me: BirdState): void {
    // un Oisillon commet surtout les erreurs du débutant (tempête, hésitation, oubli de peindre)
    const list = this.level === 0 && this.rng.chance(0.6) ? BEGINNER_BLUNDERS : this.traits.blunders
    const kind = list[this.rng.weighted(list.map((b) => b[1]))]![0]
    this.blunder = kind
    this.blunderHeading = me.heading
    let dur = this.rng.range(1.2, 2.4)
    switch (kind) {
      case 'storm':
        this.blunderHeading = Math.atan2(me.y, me.x) + this.rng.sym(0.4)
        dur = this.rng.range(1.8, 3)
        break
      case 'stayLow':
        this.forceLowUntil = this.now + this.rng.range(2.5, 4)
        this.blunder = null
        return
      case 'panicFlap':
        if (me.flapCooldown <= 0) this.requestFlap(me.heading + this.rng.sym(1.2))
        this.blunder = null
        return
      case 'overshoot':
        // prolonge sa ligne tout droit, jusque dans la tempête (son ombre sort de l'arène)
        dur = this.rng.range(2, 3.5)
        break
      case 'overstay':
        this.memo.overstayUntil = this.now + this.rng.range(4, 7)
        this.blunder = null
        return
      case 'wander':
        // oublie de peindre : file vers son propre sable
        this.blunderHeading = Math.atan2(this.homeY - me.y, this.homeX - me.x)
        dur = this.rng.range(2, 3.5)
        break
      case 'hesitate':
        dur = this.rng.range(1.1, 2)
        break
    }
    this.blunderUntil = this.now + dur * this.lp.blunderScale
  }

  // ─── Outils des styles ────────────────────────────────────────────────────

  /** Entrée d'évaluation préparée pour la position courante (styles : valeur des blocs). */
  valuation(opts: PaintOptions = {}): EvalInput {
    return this.prepareEval(this.me, opts)
  }

  /** Prépare l'entrée d'évaluation (position, soleils, pondérations). */
  private prepareEval(me: BirdState, opts: PaintOptions): EvalInput {
    const inp = this.evalInput
    const st = this.state
    inp.x = me.x
    inp.y = me.y
    inp.heading = me.heading
    inp.paleOnStrong = this.paleOnStrongMistake
    inp.forecast = this.co.shade.mask
    const tr = this.traits
    const w = inp.weights
    w.neutral = RULES.botValueNeutral * tr.neutral
    w.steal = RULES.botValueSteal * tr.steal
    w.crown = RULES.botValueStealCrown * tr.crown
    w.upgrade = RULES.botValueUpgradeOwn * tr.upgrade
    // l'Oisillon ignore les ombres des tours ; le Voyageur scelle un peu ; le Seigneur pleinement.
    // Sceller ne rapporte vraiment qu'à partir de l'heure dorée : les ombres, longues et lentes,
    // gardent alors le sable jusqu'à la nuit (à midi, elles repartent aussitôt).
    const sealLevel = this.lp.towers === 'ignore' ? 0 : this.lp.towers === 'avoid' ? 0.5 : 1
    const sealPhase = clamp((this.t110 - RULES.phaseGoldenAt + 10) / 30, 0.15, 1)
    const sealBase = opts.seal ?? tr.seal + 0.3
    w.seal = 1 + (sealBase - 1) * sealLevel * sealPhase
    w.focus = opts.focus ?? -1
    w.focusMul = opts.focusMul ?? 1
    // rivalité : la bande de sable du HUD dit qui est devant, qui est loin derrière
    const counts = st.grid.counts
    const mine = Math.max(counts[this.slot + 1]!, 0.02 * st.grid.arenaCells)
    for (let s = 0; s < 12; s++) w.rival[s] = 1 + this.lp.rivalry * 0.5 * (clamp(counts[s + 1]! / mine, 0.4, 2) - 1)
    // soleils aux horizons 0,7 / 1,4 / 2,1 s (le Seigneur anticipe leur course)
    const sun = st.sun
    if (this.suns.length === 0) for (let i = 0; i < 3; i++) this.suns.push({ ...sun })
    for (let i = 0; i < 3; i++) {
      const s = this.suns[i]!
      if (this.lp.anticipateSun && st.config.mode !== 'lobby' && sun.t >= 0) updateRoundSun(s, Math.min(sun.T, sun.t + 0.7 * (i + 1)), sun.T)
      else Object.assign(s, sun)
    }
    return inp
  }

  /**
   * Meilleur cap et étage pour peindre (GDD §14.1), avec les penchants du caractère :
   * étage préféré, cap d'objectif, pénalités. Ne modifie pas le plan.
   */
  paintChoice(opts: PaintOptions = {}): PaintChoice {
    const me = this.me
    const inp = this.prepareEval(me, opts)
    const hi = this.valsHigh
    const lo = this.valsLow
    if (!opts.forceLow) evaluateHeadings(inp, RULES.altHigh, hi)
    else hi.fill(-Infinity)
    if (!opts.forceHigh) evaluateHeadings(inp, RULES.altLow, lo)
    else lo.fill(-Infinity)
    let scale = 50
    for (let q = 0; q < HEADINGS; q++) scale = Math.max(scale, Number.isFinite(hi[q]!) ? Math.abs(hi[q]!) : 0, Number.isFinite(lo[q]!) ? Math.abs(lo[q]!) : 0)
    const gain = (opts.goalGain ?? 0) * scale
    let bh = 0
    let bl = 0
    for (let q = 0; q < HEADINGS; q++) {
      const h = headingOf(q)
      let extra = 0
      if (opts.goal !== undefined && gain > 0) extra += gain * Math.cos(angDiff(h, opts.goal))
      if (opts.penalty) extra -= opts.penalty(h)
      hi[q] = hi[q]! + extra
      lo[q] = lo[q]! + extra
      if (hi[q]! > hi[bh]!) bh = q
      if (lo[q]! > lo[bl]!) bl = q
    }
    const vH = hi[bh]!
    const vL = lo[bl]!
    let bias = (opts.lowBias ?? this.traits.lowBias) * this.lp.lowShyness
    // hystérésis : changer d'étage coûte (la montée prend 1,75 s)
    if (this.wantLow) bias *= 1.15
    else bias /= 1.15
    let low = opts.forceLow ? true : opts.forceHigh ? false : vL * (vL > 0 ? bias : 1 / bias) > vH
    if (!Number.isFinite(vL)) low = false
    if (!Number.isFinite(vH)) low = true
    // un débutant ne change pas d'étage à tout bout de champ
    if (!opts.forceLow && !opts.forceHigh && low !== this.wantLow) {
      if (this.now - this.altitudeSince < this.lp.altitudeDwell) low = this.wantLow
    }
    return { heading: headingOf(low ? bl : bh), low, value: low ? vL : vH, valueHigh: vH, valueLow: vL }
  }

  /** Applique un choix de peinture comme plan à cap fixe. */
  setPaint(c: PaintChoice, kind: IntentKind = 'paint'): void {
    const p = this.plan
    if (p.kind !== kind) p.since = this.now
    p.kind = kind
    p.heading = c.heading
    p.low = c.low
    p.target = -1
    p.x = NaN
    p.y = NaN
    p.until = this.now + this.lp.decision
  }

  /** Plan « aller à un point » (raid, cachette, scellage…). */
  goTo(kind: IntentKind, x: number, y: number, low: boolean, duration: number): void {
    const p = this.plan
    if (p.kind !== kind || Math.hypot(p.x - x, p.y - y) > 4) p.since = this.now
    p.kind = kind
    p.x = x
    p.y = y
    p.low = low
    p.target = -1
    p.until = this.now + duration
  }

  /**
   * Proie visible : un oiseau assez bas pour être piqué, dans la portée donnée,
   * selon le choix des victimes du niveau, l'équité et la préférence pour la couronne.
   */
  choosePrey(maxDist: number, opts: { maxZ?: number } = {}): number {
    const me = this.me
    const maxZ = opts.maxZ ?? RULES.altHigh - RULES.diveLockDz
    let best = -1
    let bestScore = Infinity
    const sun = this.state.sun
    const shAng = Math.atan2(sun.shadowDirY, sun.shadowDirX)
    for (const b of this.state.birds) {
      if (b.slot === this.slot) continue
      const t = this.see(b.slot)
      if (!t || !isTargetableSeen(t) || t.z > maxZ) continue
      if (!this.victimAllowed(t) || !this.co.canEngage(this.slot, t.slot, this.now)) continue
      if (!t.crown && this.co.sinceHit(t.slot, this.now) < MERCY_SECONDS) continue
      const d = Math.hypot(t.x - me.x, t.y - me.y)
      if (d > maxDist) continue
      let score = d + 15
      if (t.crown) score /= 1 + RULES.botLeaderBias * (this.lp.victims === 'crownThenClosest' ? 2 : 1)
      if (this.lp.victims === 'optimal') {
        // grosse traînée (bas, étiré, en travers des ombres), coup d'aile en recharge
        const trail = shadowRadius(t.z) * (1 + (sun.stretch - 1) * Math.abs(Math.sin(t.heading - shAng)))
        score /= 0.5 + trail / 5
        if (!t.flapReady) score *= 0.6
        score /= this.evalInput.weights.rival[t.slot]!
      }
      // s'acharner (Faucon) : la proie courante reste préférée
      if (this.plan.target === t.slot) score *= 0.7
      // un chasseur averti préfère une proie dont le coup d'aile est en recharge
      if (this.personality === 'falcon' && !t.flapReady) score *= 0.5 + 0.2 * (2 - this.level)
      if (score < bestScore) {
        bestScore = score
        best = t.slot
      }
    }
    return best
  }

  /** Cachette atteignable en `maxSeconds` (au ras du sable), la plus proche. */
  bestHideSpot(me: BirdState, maxSeconds: number, preferStable = true): HideSpot | null {
    let best: HideSpot | null = null
    let bestD = Infinity
    const reach = maxSeconds * RULES.speedLow + 4
    for (const s of this.co.shade.spots) {
      let d = Math.hypot(s.x - me.x, s.y - me.y)
      if (d > reach) continue
      if (preferStable && !s.stable) d += 25
      if (d < bestD) {
        bestD = d
        best = s
      }
    }
    return best
  }

  /** Recentre la « maison » sur le territoire possédé (toutes les 5 s). */
  private updateHome(): void {
    if (this.now - this.homeAt < 5) return
    this.homeAt = this.now
    const m = this.co.values
    const c = m.cur
    let sx = 0
    let sy = 0
    let n = 0
    for (let bi = 0; bi < c.tot.length; bi++) {
      const own = c.pale[bi * 12 + this.slot]! + c.strong[bi * 12 + this.slot]!
      if (own <= 0) continue
      sx += own * m.blockCenterX(bi)
      sy += own * m.blockCenterY(bi)
      n += own
    }
    if (n > 50) {
      this.homeX = sx / n
      this.homeY = sy / n
    }
  }

  setIntent(kind: IntentKind, target = -1, x = NaN, y = NaN): void {
    const it = this.intent
    it.kind = kind
    it.target = target
    it.x = x
    it.y = y
  }

  // ─── Motricité ────────────────────────────────────────────────────────────

  /** Transforme le plan (ou l'erreur en cours) en cap voulu et en étage. */
  private steer(me: BirdState): void {
    const p = this.plan
    let heading = me.heading
    let low = p.low
    let kind: IntentKind = p.kind
    if (this.blunder && this.now < this.blunderUntil) {
      kind = 'blunder'
      switch (this.blunder) {
        case 'storm':
          heading = this.blunderHeading
          break
        case 'hesitate': {
          // godille sur place : à gauche, à droite, sans vraiment avancer
          const k = Math.floor((this.now - this.blunderUntil) / 0.35) & 1
          heading = this.blunderHeading + (k ? 1 : -1) * 80 * DEG
          break
        }
        default:
          heading = this.blunderHeading
      }
      this.intent.blunder = this.blunder
    } else {
      this.intent.blunder = null
      if (this.blunder) this.blunder = null
      heading = this.planHeading(me, p)
    }
    if (this.counterTurnUntil > this.now) heading = me.heading + this.counterSign * 120 * DEG
    if (this.forceHighUntil > this.now) low = false
    if (this.forceLowUntil > this.now) low = true
    this.wantHeading = heading
    if (low !== this.wantLow) this.altitudeSince = this.now
    this.wantLow = low
    if (me.dive === 'none') this.setIntent(kind, p.target, p.x, p.y)
    this.intent.low = low
  }

  /** Cap voulu pour le plan courant (appelé à chaque tick). */
  private planHeading(me: BirdState, p: Plan): number {
    switch (p.kind) {
      case 'idle':
        return me.heading
      case 'raid':
      case 'hide':
      case 'seal':
      case 'hunt':
      case 'ambush':
        return Number.isFinite(p.x) ? Math.atan2(p.y - me.y, p.x - me.x) : p.heading
      case 'circle': {
        // cercle au-dessus de la proie : on tourne autour d'elle en la gardant sur le flanc
        // intérieur (≈ 60°, donc dans le cône de verrouillage), rayon de 12 à 22 m
        const t = p.target >= 0 ? this.see(p.target) : null
        if (!t) return me.heading + p.turn * 100 * DEG
        const lead = this.lp.reaction * 0.5
        const tx = t.x + t.vx * lead
        const ty = t.y + t.vy * lead
        const d = Math.hypot(tx - me.x, ty - me.y)
        const bearing = Math.atan2(ty - me.y, tx - me.x)
        const offset = d > 22 ? 35 : d < 12 ? 85 : 60
        p.turned += Math.abs(angDiff(me.heading, p.lastHeading))
        p.lastHeading = me.heading
        return bearing - p.turn * offset * DEG
      }
      case 'loop': {
        // virage serré dans un sens constant : cercle au-dessus de la proie, looping
        const dh = angDiff(me.heading, p.lastHeading)
        p.turned += Math.abs(dh)
        p.lastHeading = me.heading
        return me.heading + p.turn * 100 * DEG
      }
      case 'lurk': {
        // cercles serrés autour de la cachette (poursuite d'un point qui tourne sur le cercle)
        const R = 7
        const phi = Math.atan2(me.y - p.y, me.x - p.x) + p.turn * 0.7
        return Math.atan2(p.y + R * Math.sin(phi) - me.y, p.x + R * Math.cos(phi) - me.x)
      }
      case 'furrow':
        return this.furrowHeading(me, p)
      case 'chaos': {
        const ph = ((this.now - p.since) / p.period) * TAU
        return p.heading + p.amp * Math.sin(ph)
      }
      default:
        return p.heading
    }
  }

  /** Sillons parallèles : suit la ligne du sillon courant, demi-tour au bout, sillon suivant. */
  private furrowHeading(me: BirdState, p: Plan): number {
    const px = -p.ay
    const py = p.ax
    const off = (p.lane - (p.lanes - 1) / 2) * p.spacing
    const ox = p.cx + px * off
    const oy = p.cy + py * off
    // abscisse le long du sillon (dans le sens de parcours)
    const s = ((me.x - ox) * p.ax + (me.y - oy) * p.ay) * p.dir
    if (s > p.halfLen) {
      // bout du sillon : demi-tour vers le suivant (va-et-vient sur la parcelle)
      let next = p.lane + p.laneStep
      if (next < 0 || next >= p.lanes) {
        p.laneStep = -p.laneStep
        next = p.lane + p.laneStep
      }
      p.lane = clamp(next, 0, p.lanes - 1)
      p.dir = -p.dir
      p.lanesDone++
      return this.furrowHeading(me, p)
    }
    const ahead = Math.max(s, -p.halfLen) + 9
    const tx = ox + p.ax * p.dir * ahead
    const ty = oy + p.ay * p.dir * ahead
    return Math.atan2(ty - me.y, tx - me.x)
  }

  /** Écrit le BirdInput : joystick (cap voulu + bruit), COUP D'AILE, PLONGER. */
  private writeInput(me: BirdState): void {
    const input = this.input
    let h = this.wantHeading + this.noise
    // près du bord, un joueur corrige de lui-même (sauf erreur « tempête » ou « trop loin » en cours)
    if (this.blunder !== 'storm' && this.blunder !== 'overshoot') {
      const rho = ellipticRadius(me.x, me.y, this.state.arena.a, this.state.arena.b)
      if (rho > this.traits.stormFrom + 0.03) {
        const inward = Math.atan2(-me.y, -me.x)
        const d = angDiff(inward, h)
        if (Math.abs(d) > Math.PI / 2) h += d - Math.sign(d) * (Math.PI / 2)
      }
    }
    input.dirX = Math.cos(h)
    input.dirY = Math.sin(h)
    if (this.flapRequest) {
      input.flapPresses++
      input.dirX = this.flapDirX
      input.dirY = this.flapDirY
      this.flapRequest = false
    }
    // PLONGER : maintenu en piqué (et seulement si on le veut), ou pour voler bas
    let hold = me.dive !== 'none' ? this.diveHold : this.diveHold || this.wantLow
    if (hold && !this.held && !this.diveHold && me.lockTarget >= 0 && me.dive === 'none' && me.diveCooldown <= 0) {
      // appuyer avec une cible verrouillée, c'est piquer : on attend si on n'en veut pas
      if (this.acceptDive(me, me.lockTarget, true)) {
        this.launchDive(me, me.lockTarget)
        hold = true
      } else hold = false
    } else if (hold && !this.held) input.divePresses++
    input.dive = hold
    this.held = hold
  }
}

/** Crée un bot (GDD §14). Voir src/bots/index.ts pour l'API complète. */
export function createBot(opts: BotOptions): Bot {
  return new BotBrain(opts)
}
