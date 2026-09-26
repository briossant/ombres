// Rig de cadrage dynamique (GDD §13.1) : manche, salon, cartes des règles.
// Cible au sol + largeur cadrée suivies par des ressorts critiques (position ω 1,8, zoom ω 1,2),
// zone morte de 4 m, lacet fixe (nord en haut), tangage selon l'avancée du soleil.
// Manche : les ombres (poids 1) et les oiseaux tirés vers elles (poids 0,7) sont le SUJET, centré
// dans les marges du GDD ; la boîte de chaque oiseau réel (envergure, couronne, étiquette) est une
// CONTRAINTE DURE : elle tient toujours dans le rectangle utile, sous la bande du HUD (polish S1).
// Dramatisation : zoom vers un piqué engagé, « punch-in » sur les touches qui comptent (S6),
// tremblement de touche, Grande Ombre (plan serré sur le front, les humains et les bots proches du
// front, poussée, tangage abaissé si les tours le permettent ; S2, vague 2), travelling d'ouverture
// du compte à rebours ; le tangage remonte, le cadre glisse (vague 3) ou recule, quand une tour bouche le
// cadre, l'encombre au premier plan ou frôle la caméra (S3, vagues 2 et 3).
import { RULES } from '../../sim/rules.ts'
import type { SimEvent, SimState } from '../../sim/types.ts'
import { birdAnchors, crownLift } from '../render/bird/anchors.ts'
import { gameView, type GameView } from '../view.ts'
import { clampRigToSets, fitSets, makeRig, makeSetsFit, projectRig, type FitSet, type Rig, type ScreenRect } from './framing.ts'
import { clamp, clamp01, DEG, lerp, smoother, Spring } from './math.ts'
import { foregroundHats, FULL_SCREEN, HAT_NEAR, towerClearance, towerCover, towerCoverStats } from './towerCover.ts'

export type FramingKind = 'round' | 'lobby' | 'rules'

/** Rectangles d'écran à respecter (fractions). Sujet de la manche : marges du GDD (12 % / 15 %). */
export const ROUND_RECT: ScreenRect = { x0: RULES.camMarginX, x1: 1 - RULES.camMarginX, y0: RULES.camMarginY, y1: 1 - RULES.camMarginY }
/**
 * Rectangle utile de la manche (contrainte dure sur la boîte de chaque oiseau) : sous la bande
 * du HUD (bas à 116 px en 1080p, plus l'onglet de couronne), au-dessus des sous-titres.
 */
export const USEFUL_RECT: ScreenRect = { x0: 0.06, x1: 0.94, y0: 0.21, y1: 0.87 }
/**
 * Au-delà de CROWDED_BIRDS oiseaux, la caméra cadre presque toujours l'arène entière : elle occupe
 * le rectangle utile avec une marge basse réduite (sinon 15 % de sable vide en bas), posée contre
 * le bas quand elle ne le remplit pas en hauteur (tangage bas) ; les oiseaux ont la même marge.
 */
export const USEFUL_RECT_CROWDED: ScreenRect = { x0: 0.06, x1: 0.94, y0: 0.21, y1: 0.975 }
export const ARENA_RECT_CROWDED: ScreenRect = { x0: 0.06, x1: 0.94, y0: 0.21, y1: 0.96 }
export const CROWDED_BIRDS = 8
/** Punch-in : les oiseaux humains restent au moins à l'écran, sous la bande du HUD. */
const HUMAN_RECT: ScreenRect = { x0: 0.02, x1: 0.98, y0: 0.13, y1: 0.97 }
/** Salon : centre haut, entre le panneau QR/règles (gauche), les oiseaux (droite) et la partie (bas). */
export const LOBBY_RECT: ScreenRect = { x0: 0.3, x1: 0.69, y0: 0.13, y1: 0.63 }

const FOV = 40
/** Tangage du salon et des règles (vue 3/4, pas de ciel). */
const LOBBY_PITCH = 50 * DEG
const RULES_PITCH = 54 * DEG
/** Largeur minimale cadrée au salon, dans le rectangle libre (m). */
const LOBBY_MIN_RECT_WIDTH = 72
/** Décalage vers l'est pendant la Grande Ombre (fraction de la largeur cadrée). */
const GREAT_SHADOW_EAST = 0.06
/**
 * Grande Ombre : le front n'est cadré qu'à cette distance à l'ouest de l'oiseau cadré le plus à
 * l'ouest (m) : 90 m au début (le mur de nuit se voit arriver), 40 m à la fin (plan serré).
 */
const GS_FRONT_BACK_START = 90
const GS_FRONT_BACK_END = 40
/** Grande Ombre : poussée lente (le sujet occupe jusqu'à 10 % de plus de l'écran). */
const GS_PUSH = 0.1
/**
 * Grande Ombre : tangage abaissé de 5° sur la phase (plan plus rasant, le mur de nuit se lit), mais
 * seulement tant que les tours ne bouchent pas le cadre abaissé (au-delà de 15 %, on garde le
 * tangage du GDD ; polish vague 2).
 */
const GS_PITCH = 5 * DEG
/**
 * Grande Ombre, plan serré (polish vague 2) : à 8 oiseaux ou moins, le cadre ne suit plus toute la
 * dispersion de l'arène. Il cadre le front, les humains (toujours), le porteur de la couronne (sous
 * GS_CROWN_CAP), puis les bots les plus proches du front tant que la largeur reste sous la largeur visée,
 * qui se resserre de 1,2 a à 0,8 a (a : demi-grand axe de l'arène) ; les autres bots peuvent sortir
 * (flèche hors champ du HUD, GDD §13.1).
 */
const GS_WIDTH_START = 1.2
const GS_WIDTH_END = 0.8
/** Hystérésis du choix (un bot déjà cadré le reste jusqu'à 1,15 × la largeur visée) et période (s). */
const GS_KEEP = 1.15
/**
 * (vague 3) Plan serré de la Grande Ombre : une parade de recul ne mène pas au-delà de GS_PARRY_MAX_W m
 * (plan moyen reproché au Cadran, 298 m à 108 s) ; on garde alors la meilleure parade sans recul excessif.
 */
const GS_PARRY_MAX_W = 250
/** Resserrement maximal du choix des bots cadrés quand les tours imposent un grand recul (vague 3). */
const GS_SQUEEZE = 0.7
const GS_SELECT_PERIOD = 0.2
/**
 * Porteur de la couronne (bot) cadré en premier tant que le cadre reste sous GS_CROWN_CAP × a (× GS_KEEP
 * s'il l'était déjà) : non-régression vague 2. Banc (tools/polish/verify2/crownbench.ts), part de la
 * Grande Ombre où la couronne est hors champ ou coupée : 4 oiseaux / 1 humain 49 → 28 %, 4 / 2 : 48 → 35 %,
 * 6 / 1 : 57 → 17 %, 4 / 3 : 81 → 26 % ; envergure médiane −2 à −5 %, tours inchangées. Plus haut, la
 * couronne reste mieux cadrée mais les oiseaux rapetissent (1,6 : −11 % ; toujours cadrée : −25 % au début
 * et des cadres jusqu'à 1,8 a) : choix de DA laissé ouvert (docs/polish/verify2-regression.md).
 */
const GS_CROWN_CAP = 1.5
/**
 * (vague 3) Plafond de la couronne en début de Grande Ombre (il descend vers GS_CROWN_CAP à la nuit),
 * jamais au-delà de GS_CROWN_MAX_W m (au-delà de ~250 m, c'est le plan moyen reproché au Cadran).
 * Banc climax3, 8 graines × 4 cartes : couronne (bot) à l'écran 73 → 83 % à 4 oiseaux.
 */
const GS_CROWN_CAP_START = 1.7
const GS_CROWN_MAX_W = 235
/** Au-delà de cette distance (m) de son oiseau, une ombre n'est pas cadrée à la Grande Ombre (soleil rasant). */
const GS_SHADOW_NEAR = 45
/**
 * Le plan serré part GS_LEAD_IN s avant la Grande Ombre (vague 3 : 2 s au lieu de 1,2 ; à 98 s, le cadre
 * est déjà serré : 123 px et 177 m médians à 97-98 s au banc, au lieu de 113 px et 194 m) et le zoom avant
 * y est GS_ZOOM_BOOST fois plus vif pendant les GS_ENTRY premières secondes : à l'annonce, la caméra
 * pousse déjà vers le front au lieu de montrer l'arène entière.
 */
const GS_LEAD_IN = 2.0
const GS_ENTRY = 3
const GS_ZOOM_BOOST = 1.8
const ALL_SLOTS = 0xfff
/** Enveloppe du zoom de piqué : montée, tenue, retour (s réelles). */
const DIVE_IN = RULES.camDiveZoomSeconds * 0.6
const DIVE_OUT = 0.9
/** Part du chemin vers la paire (chasseur, cible) pendant le zoom de piqué. */
const DIVE_PULL = 0.14
/** Tremblement : durée, et amplitude = camShakeAmp par tranche de SHAKE_PER m cadrés (≈ 11 px en 1080p). */
const SHAKE_SECONDS = 0.42
const SHAKE_PER = 26
/** Travelling d'ouverture (compte à rebours) : recul et tangage supplémentaires au départ. */
const OPEN_BACK = 0.32
const OPEN_PITCH = 10 * DEG

/**
 * Boîte d'un oiseau, en fractions de son envergure affichée W (autour du point de l'oiseau) :
 * ± W/2 sur les côtés, W/2 au-dessus, 0,74 W en dessous (l'ancre de l'étiquette est 0,24 W sous
 * l'oiseau, HudProjector, plus une demi-envergure). La couronne du meneur s'ajoute au-dessus.
 */
const BOX_SIDE = 0.5
const BOX_TOP = 0.5
const BOX_BOTTOM = 0.74
/** Taille de la couronne au-dessus de son point d'ancrage (m, avant échelle). */
const CROWN_EXTRA = 1.6

/** Punch-in (S6) : largeur × 0,75 au moins ; plus serré si l'échelle cosmétique masque le zoom. */
const PUNCH_WIDTH = 0.75
/** Gain d'envergure visé à l'écran pendant le punch-in, et facteur de largeur plancher. */
const PUNCH_SPAN_GAIN = 1.3
const PUNCH_MIN_FACTOR = 0.5
/** Vol minimal (part de l'arène) pour qu'une touche compte, à 8 oiseaux ou moins. */
const PUNCH_STEAL_FRAC = 0.01
/** Montée (s réelles) ; tenue = ralenti (tenue + rampe) + 0,5 s ; retour en ressort. */
const PUNCH_IN = 0.3
const PUNCH_HOLD = RULES.hitSlowmoSeconds + RULES.hitSlowmoRampSeconds + 0.5
const PUNCH_RETURN_OMEGA = 2.6
/** Plan refusé s'il n'est pas assez serré (largeur > 85 % de l'actuelle) ou si la paire n'y est pas près du centre. */
const PUNCH_USEFUL = 0.85
const PUNCH_CENTER_X = 0.24
const PUNCH_CENTER_Y = 0.19
/** Essais de rapprochements moindres quand un humain empêche le plan idéal. */
const PUNCH_TRIES = 3

/**
 * Tours (S3) : part de l'écran couverte par les parties au-dessus de COVER_MIN_Z au-delà de laquelle on
 * relève le tangage. Vague 2 : 4 m (tour presque entière ; le critère est « aucune tour ne couvre plus
 * de 15 % du cadre ») et, à moins de COVER_CLEAR m d'une tour, le cadre compte comme bouché.
 */
const COVER_MIN_Z = 4
const COVER_CLEAR = 45
/** Une tour seule compte pour 0,35 × sa largeur à l'écran (fraction) : au-delà de ~34 % de large, le cadre est bouché (vague 2 : 0,45). */
const COVER_WIDTH_K = 0.35
/**
 * Seuils (vague 3 : « aucune tour au-delà de 12 % du cadre », verify2-eyes ; vague 2 : 15 / 11 / 12 %) :
 * parade au-delà de COVER_MAX, retenue si elle ramène sous COVER_GOAL, tangage qui ne redescend que sous COVER_OK.
 */
const COVER_MAX = 0.12
const COVER_OK = 0.085
const COVER_GOAL = 0.11
/**
 * Le critère porte sur CHAQUE tour prise seule (vague 3) ; toutes les tours ensemble comptent pour
 * COVER_TOTAL_K × leur part (18 % de tours au total pèsent comme une tour de 12 %).
 */
const COVER_TOTAL_K = 0.12 / 0.18
/**
 * Premier plan (vague 3) : une tour plantée entre la caméra et la cible (moitié basse de l’image)
 * (à moins de FG_NEAR × la distance au sol de la caméra à la cible) compte FG_K fois : un parasol
 * de 6 % au premier plan pèse comme 12 % (verify2-eyes : parasol plein de ~8 % au premier plan).
 */
const FG_NEAR = 0.8
const FG_K = 2
/** Relèvements essayés ; (vague 3) −5° aussi : une tour voisine des oiseaux (pas au premier plan) sort du cadre en rasant. */
const COVER_BOOSTS = [5 * DEG, 8 * DEG, -5 * DEG] as const
/** Si relever de 8° ne suffit pas (caméra juste au-dessus d'un disque, cadre serré) : on recule. */
const COVER_WIDEN = [1.2, 1.45, 1.8] as const
/**
 * Glissements du cadre (vague 3), en fraction de la largeur cadrée : est / ouest / nord / sud, puis plus loin. Chaque
 * glissement est ramené dans la marge que laissent les boîtes des oiseaux cadrés (contrainte dure S1,
 * clampRigToSets) : il ne sort jamais un oiseau cadré du rectangle utile. Essayés avant de reculer :
 * sur le Cadran, la caméra du plan serré passe juste au-dessus du gnomon et reculait × 1,45 à 1,8.
 */
const COVER_SHIFTS: readonly (readonly [number, number])[] = [
  [0.14, 0],
  [-0.14, 0],
  [0, 0.14],
  [0, -0.14],
  [0.28, 0],
  [-0.28, 0],
  [0.42, 0],
  [-0.42, 0],
]
const COVER_PERIOD = 0.1
/**
 * (vague 3) Une parade qui tient est gardée (chemin de la caméra jusqu'à COVER_PATH : elle y arrive) ;
 * toutes les COVER_RESEARCH s, on cherche une parade moins coûteuse.
 */
const COVER_RESEARCH = 0.5
const COVER_PATH = 0.16
/**
 * Parades candidates (recul, relèvement, glissement) dans l'ordre d'essai : relever (+5, +8, −5°),
 * glisser (est / ouest / nord / sud, puis plus loin), reculer × 1,2 et × 1,45 (seul, relevé, glissé),
 * reculer × 1,8. Chaque essai coûte ~0,03 ms au cadre visé ; la recherche ne tourne (10 Hz) que si la
 * parade en cours ne tient plus.
 */
const COVER_CANDIDATES: readonly (readonly [number, number, number])[] = (() => {
  const out: [number, number, number][] = []
  for (let bi = 1; bi <= COVER_BOOSTS.length; bi++) out.push([0, bi, -1])
  for (let si = 0; si < COVER_SHIFTS.length; si++) out.push([0, 0, si])
  for (let wi = 1; wi <= 2; wi++) out.push([wi, 0, -1], [wi, 1, -1], [wi, 0, 4], [wi, 0, 5])
  out.push([3, 0, -1], [3, 1, -1])
  return out
})()

const MAX_PTS = 64
const MAX_HARD = 32
/** Les centres d'ombre sont ramenés dans l'arène (rayon elliptique ≤ 1,04) avant cadrage. */
const SHADOW_RHO_MAX = 1.04
/** Si la boîte d'un oiseau force le cadre, les ombres au-delà de ce rayon (dans le Simoun) sont abandonnées d'abord. */
const SHADOW_RHO_DROP = 1.0
/** Anticipation du cadrage de jeu (s) : les points sont aussi pris à leur position future. */
const LEAD = 0.7
/** Le dézoom répond plus vite que le zoom (ω × 1,6) : un oiseau qui s'échappe reste dans le cadre. */
const ZOOM_OUT_BOOST = 1.6
/** (vague 3) Dézoom × TOWER_OUT_BOOST plus vif quand un recul d'évitement des tours vient d'être décidé. */
const TOWER_OUT_BOOST = 1.6
const ARENA_PTS = 20

type HitEvent = Extract<SimEvent, { type: 'diveHit' }>

export class FramingRig {
  readonly rig: Rig = makeRig()
  private readonly sx = new Spring()
  private readonly sy = new Spring()
  private readonly sw = new Spring() // log(largeur)
  private goalX = 0
  private goalY = 0
  private goalW = 200
  private readonly pts = new Float64Array(MAX_PTS * 3)
  private readonly hard = new Float64Array(MAX_HARD * 3)
  private readonly hardExt = new Float64Array(MAX_HARD * 3)
  /** Boîtes des oiseaux à leur position actuelle seulement (garde-fou derrière les ressorts). */
  private readonly now = new Float64Array(MAX_HARD * 3)
  private readonly nowExt = new Float64Array(MAX_HARD * 3)
  private readonly pairPts = new Float64Array(2 * 3)
  private readonly pairExt = new Float64Array(2 * 3)
  private readonly humanPts = new Float64Array(12 * 3)
  private readonly humanExt = new Float64Array(12 * 3)
  private readonly softSet: FitSet = { pts: this.pts, count: 0, rect: ROUND_RECT, ext: null }
  private readonly hardSet: FitSet = { pts: this.hard, count: 0, rect: USEFUL_RECT, ext: this.hardExt }
  private readonly nowSet: FitSet = { pts: this.now, count: 0, rect: USEFUL_RECT, ext: this.nowExt }
  private readonly nowSets: FitSet[] = [this.nowSet]
  private readonly guardRig: Rig = makeRig()
  private readonly pairSet: FitSet = { pts: this.pairPts, count: 0, rect: USEFUL_RECT, ext: this.pairExt }
  private readonly humanSet: FitSet = { pts: this.humanPts, count: 0, rect: HUMAN_RECT, ext: this.humanExt }
  private readonly sets1: FitSet[] = [this.softSet]
  private readonly sets2: FitSet[] = [this.softSet, this.hardSet]
  private readonly punchSets: FitSet[] = [this.pairSet, this.humanSet]
  private readonly pushRect: ScreenRect = { ...ROUND_RECT }
  private readonly fit = makeSetsFit()
  private readonly fit2 = makeSetsFit()
  private readonly pfit = makeSetsFit()
  /** Nombre d'oiseaux dont l'ombre est au-delà de SHADOW_RHO_DROP (dernière collecte). */
  private farShadows = 0
  private diveT = -1
  private diveHunter = -1
  private diveTarget = -1
  private diveHold = 0
  private shakeT = -1
  private shakePhase = 0
  /** Décalage de tremblement à appliquer (m, dans le plan de l'écran : droite, haut). */
  readonly shake = { x: 0, y: 0 }
  private drift = 0
  // punch-in
  private punchT = -1
  private punchHunter = -1
  private punchTarget = -1
  private punchFactor = 1
  private punchDist = 0
  private punchW0 = 0
  private readonly punchE = new Spring()
  private lastPunchSim = -Infinity
  private punchGoalX = 0
  private punchGoalY = 0
  private punchGoalW = 0
  private punchValid = false
  private punchCheck = 0
  /** Punch-in refusé à la dernière touche qui comptait : '' , 'large', 'décentré' ou 'tours' (debug). */
  punchReject = ''
  /** Punch-in : nombre lancé depuis la création, enveloppe courante (0..1). Pour le debug et les scripts. */
  punchCount = 0
  punchLevel = 0
  // tours
  private readonly boost = new Spring()
  private boostGoal = 0
  /** Recul (log de la largeur) quand le tangage ne suffit pas à dégager les tours. */
  private readonly widen = new Spring()
  private widenGoal = 0
  /** Glissement de la cible (m, est / nord) décidé contre les tours (vague 3) ; lissé par les ressorts de position. */
  private shiftGoalX = 0
  private shiftGoalY = 0
  /** Cible du cadre visé AVANT glissement (le glissement s'évalue autour d'elle). */
  private fitX = 0
  private fitY = 0
  private readonly hardSets: FitSet[] = [this.hardSet]
  /** Dernière estimation des tours (debug, scripts) : encombrement sans parade, prévu avec la parade choisie. */
  readonly coverTrace = { base: 0, chosen: 0, pick: -1, evals: 0 }
  private coverClock = 0
  private coverSearch = 0
  /** Indice (COVER_CANDIDATES) de la parade en cours. */
  private coverIdx = 0
  /** Part de l'écran couverte par les tours au-dessus de 4 m (COVER_MIN_Z) (dernière estimation, au tangage courant). */
  towerCover = 0
  // Grande Ombre (polish vague 2)
  /** Oiseaux cadrés (masque de slots) ; tous hors de la Grande Ombre. */
  gsMask = ALL_SLOTS
  private gsClock = 0
  /** Tangage abaissé de la Grande Ombre autorisé (1) ou bloqué par les tours (0), lissé. */
  private readonly gsLow = new Spring()
  private gsLowGoal = 1
  private readonly gsOrder: number[] = []
  private readonly gsKey = new Float64Array(12)
  /**
   * (vague 3) Resserrement du choix des bots cadrés quand les tours imposent un grand recul (× 1,45 et
   * plus) : moins de bots cadrés, un cadre plus serré qui a la marge de glisser à côté de la tour.
   */
  private gsSqueeze = 1
  kind: FramingKind = 'round'

  reset(kind: FramingKind): void {
    this.kind = kind
    this.diveT = -1
    this.shakeT = -1
    this.shake.x = this.shake.y = 0
    this.drift = 0
    this.punchT = -1
    this.punchE.snap(0)
    this.punchLevel = 0
    this.lastPunchSim = -Infinity
    this.boost.snap(0)
    this.boostGoal = 0
    this.widen.snap(0)
    this.widenGoal = 0
    this.shiftGoalX = this.shiftGoalY = 0
    this.coverClock = 0
    this.gsMask = ALL_SLOTS
    this.gsClock = 0
    this.gsLow.snap(1)
    this.gsLowGoal = 1
    this.gsSqueeze = 1
  }

  /** Piqué engagé (clac) : zoom vers la paire si les deux sont dans le champ (vérifié par l'appelant) et à découvert. */
  onDiveCommit(hunter: number, target: number, sim?: SimState | null): void {
    if (sim && (birdUnderDisc(sim, hunter) || birdUnderDisc(sim, target))) return
    this.diveT = 0
    this.diveHunter = hunter
    this.diveTarget = target
    this.diveHold = RULES.camDiveZoomSeconds * 0.4
  }

  /** Fin du piqué (touche, raté, annulation) : le zoom retombe. */
  onDiveEnd(hunter: number, hit: boolean): void {
    // après une touche, on reste serré pendant le ralenti ; sinon on relâche aussitôt
    if (hunter === this.diveHunter && this.diveT >= 0) this.diveHold = Math.max(0, Math.min(hit ? 9 : this.diveHold, this.diveT - DIVE_IN + (hit ? 0.35 : 0.1)))
  }

  onHit(): void {
    this.shakeT = 0
    this.shakePhase = Math.random() * 100
  }

  /**
   * Touche : « punch-in » (S6) si elle compte — elle vole la couronne, implique un humain, ou vole
   * au moins 1 % de l'arène (au-delà de 8 oiseaux : couronne ou humain seulement). Au plus un
   * toutes les RULES.hitSlowmoMinGap s de sim, jamais dans les RULES.noSlowmoLastSeconds dernières
   * secondes, ni sous un disque de tour. L'appelant vérifie que la touche est dans le champ.
   * Renvoie vrai si le punch-in part.
   */
  onDiveHit(e: HitEvent, sim: SimState, view: GameView, aspect = 16 / 9): boolean {
    if (this.kind !== 'round' || sim.sun.t < 0) return false
    if (sim.sun.t > sim.sun.T - RULES.noSlowmoLastSeconds) return false
    if (sim.time - this.lastPunchSim < RULES.hitSlowmoMinGap) return false
    const human = isHuman(view, e.hunter) || isHuman(view, e.target)
    const frac = sim.grid.arenaCells > 0 ? e.stolenCells / sim.grid.arenaCells : 0
    const counts = sim.birds.length > CROWDED_BIRDS ? e.crown || human : e.crown || human || frac >= PUNCH_STEAL_FRAC
    if (!counts) return false
    if (birdUnderDisc(sim, e.hunter) || birdUnderDisc(sim, e.target)) return false
    // Distance caméra → paire visée : l'envergure à l'écran doit gagner PUNCH_SPAN_GAIN. L'échelle
    // cosmétique (<Birds renderScale="auto">) garde les petits oiseaux vers 60 px : un rapprochement
    // de × 1/k ne les grandit que de × 1/(k·échelle) ; et une paire déjà proche de la caméra (bas du
    // cadre) grandit moins qu'une paire au centre. Largeur × 0,75 au moins, × 0,5 au plus.
    const scale = Math.max(birdAnchors.scale[e.hunter] || 1, birdAnchors.scale[e.target] || 1, 1)
    const r = this.rig
    const cp = Math.cos(r.pitch)
    const camX = r.tx
    const camY = r.ty - cp * r.dist
    const camZ = Math.sin(r.pitch) * r.dist
    const h = sim.bySlot[e.hunter]
    const g = sim.bySlot[e.target]
    let dPair = r.dist
    if (h && g) dPair = (Math.hypot(h.x - camX, h.y - camY, h.z - camZ) + Math.hypot(g.x - camX, g.y - camY, g.z - camZ)) / 2
    const ideal = clamp(Math.min(PUNCH_WIDTH, dPair / (PUNCH_SPAN_GAIN * scale) / Math.max(1, r.dist)), PUNCH_MIN_FACTOR, PUNCH_WIDTH)
    this.punchHunter = e.hunter
    this.punchTarget = e.target
    this.punchW0 = Math.exp(this.sw.x)
    // le plan doit valoir le coup : vraiment plus serré, et la paire près du centre. Un humain
    // éloigné qui doit rester à l'écran peut l'empêcher : on essaie alors un rapprochement moindre,
    // puis on renonce plutôt que de montrer un plan bancal.
    const pr = _probeRig
    for (let k = 0; k <= PUNCH_TRIES; k++) {
      this.punchFactor = ideal + ((PUNCH_USEFUL - ideal) * k) / (PUNCH_TRIES + 1)
      this.punchDist = this.punchFactor * r.dist
      if (!this.punchFit(sim, view, aspect)) return false
      pr.tx = this.pfit.tx
      pr.ty = this.pfit.ty
      pr.tz = 0
      pr.yaw = 0
      pr.pitch = this.pitchFor(sim)
      pr.dist = this.pfit.dist
      pr.fov = FOV
      projectRig(pr, aspect, (this.pairPts[0]! + this.pairPts[3]!) / 2, (this.pairPts[1]! + this.pairPts[4]!) / 2, (this.pairPts[2]! + this.pairPts[5]!) / 2, _pa)
      this.punchReject = this.pfit.width > this.punchW0 * PUNCH_USEFUL ? 'large' : Math.abs(_pa.x - 0.5) > PUNCH_CENTER_X || Math.abs(_pa.y - 0.54) > PUNCH_CENTER_Y ? 'décentré' : ''
      if (!this.punchReject) break
    }
    if (this.punchReject) return false
    // tours (vague 2) : le plan serré ne frôle aucune tour et n'en est pas bouché (ex. : plongée sur
    // le Cadran à la hauteur des disques du gnomon)
    if (punchBlocked(sim, pr, aspect)) {
      this.punchReject = 'tours'
      return false
    }
    this.punchT = 0
    this.punchCheck = 0
    this.lastPunchSim = sim.time
    this.punchCount++
    return true
  }

  /** Cadre du punch-in (this.pfit) : la paire dans le rectangle utile, les humains à l'écran, distance ≤ punchDist. */
  private punchFit(sim: SimState, view: GameView, aspect: number): boolean {
    if (!sim.bySlot[this.punchHunter] || !sim.bySlot[this.punchTarget]) return false
    const pitch = this.pitchFor(sim)
    const sinP = Math.sin(pitch)
    const alpha = view.alpha
    let n = 0
    for (let q = 0; q < 2; q++) {
      const s = q === 0 ? this.punchHunter : this.punchTarget
      const b = sim.bySlot[s]!
      const p = view.prevBirds[s] ?? b
      boxOf(sim, s, sinP, _box)
      this.pairPts[n * 3] = p.x + (b.x - p.x) * alpha
      this.pairPts[n * 3 + 1] = p.y + (b.y - p.y) * alpha
      this.pairPts[n * 3 + 2] = p.z + (b.z - p.z) * alpha
      this.pairExt[n * 3] = _box.side
      this.pairExt[n * 3 + 1] = _box.top
      this.pairExt[n * 3 + 2] = _box.bottom
      n++
    }
    this.pairSet.count = n
    this.pairSet.rect = sim.birds.length > CROWDED_BIRDS ? USEFUL_RECT_CROWDED : USEFUL_RECT
    let m = 0
    for (const b of sim.birds) {
      if (!isHuman(view, b.slot) || b.slot === this.punchHunter || b.slot === this.punchTarget) continue
      const p = view.prevBirds[b.slot] ?? b
      boxOf(sim, b.slot, sinP, _box)
      this.humanPts[m * 3] = p.x + (b.x - p.x) * alpha
      this.humanPts[m * 3 + 1] = p.y + (b.y - p.y) * alpha
      this.humanPts[m * 3 + 2] = p.z + (b.z - p.z) * alpha
      // l'oiseau lui-même (pas toute sa boîte) : il peut frôler le bord le temps du punch-in
      this.humanExt[m * 3] = 0.3 * _box.side
      this.humanExt[m * 3 + 1] = 0.3 * _box.top
      this.humanExt[m * 3 + 2] = 0.3 * _box.bottom
      m++
    }
    this.humanSet.count = m
    fitSets(this.punchSets, 0, pitch, FOV, aspect, this.punchDist, 1e5, this.pfit)
    return true
  }

  /** Cadre désiré (cible, largeur) pour l'état courant. */
  private desired(sim: SimState, view: GameView, aspect: number): void {
    const a = sim.arena.a
    const kind = this.kind
    const pitch = this.pitchFor(sim)
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    const fit = this.fit
    if (kind !== 'round') {
      const rect = kind === 'lobby' ? LOBBY_RECT : ROUND_RECT
      const rectW = rect.x1 - rect.x0
      let minW = kind === 'lobby' ? LOBBY_MIN_RECT_WIDTH / rectW : RULES.camMinWidth
      let maxW = kind === 'lobby' ? (2 * a * 1.15) / rectW : 2 * a * RULES.camMaxWidthFactor
      if (kind === 'rules') minW = maxW = 2 * a * 0.95
      if (maxW < minW) maxW = minW
      this.softSet.count = this.collectSoft(sim, view, false)
      this.softSet.rect = rect
      this.softSet.alignY = 0.5
      fitSets(this.sets1, 0, pitch, FOV, aspect, minW / (2 * tanH), 1e5, fit)
    } else this.roundFit(sim, view, aspect, pitch)
    let tx = fit.tx
    let ty = fit.ty
    // recul d'évitement des tours (S3) : les points convergent vers le centre, tout reste cadré
    // (vague 2) un recul décidé s'applique tout de suite au cadre visé (le ressort de zoom le lisse
    // déjà) ; seul le retour passe par le ressort du recul, lent
    const w = kind === 'round' ? fit.width * Math.exp(Math.max(this.widen.x, this.widenGoal)) : fit.width
    if (kind === 'round' && isClimax(sim)) {
      // décalage vers l'est (GDD §13.1), sans pousser le cadre au-delà du bord est de l'arène
      // ni sortir un oiseau du rectangle utile
      const room = Math.max(0, Math.min(fit.slackRight, a * 1.06 - w / 2 - tx))
      tx += Math.min(GREAT_SHADOW_EAST * w, room)
    }
    this.fitX = tx
    this.fitY = ty
    // glissement d'évitement des tours (vague 3) : décidé autour de (fitX, fitY), borné par les boîtes des oiseaux cadrés
    if (kind === 'round') {
      tx += this.shiftGoalX
      ty += this.shiftGoalY
    }
    if (kind === 'rules') {
      // dérive lente et régulière d'ouest en est, puis retour (jamais hors de l'arène)
      tx = Math.sin(this.drift * 0.045) * a * 0.18
      ty = -sim.arena.b * 0.12
    }
    // zone morte (4 m) sur la cible et la largeur
    const dz = RULES.camDeadzone
    const dx = tx - this.goalX
    const dy = ty - this.goalY
    const d = Math.hypot(dx, dy)
    if (d > dz) {
      const k = 1 - dz / d
      this.goalX += dx * k
      this.goalY += dy * k
    }
    const dw = w - this.goalW
    if (Math.abs(dw) > dz) this.goalW += dw - Math.sign(dw) * dz
  }

  /**
   * Manche : sujet (ombres + oiseaux tirés vers elles) dans les marges du GDD, boîtes des oiseaux
   * réels dans le rectangle utile. Si ces boîtes forcent le cadre, les ombres parties dans le
   * Simoun sont abandonnées d'abord ; au-delà du dézoom maximal, l'arène entière est le sujet.
   */
  private roundFit(sim: SimState, view: GameView, aspect: number, pitch: number): void {
    const a = sim.arena.a
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    const minDist = RULES.camMinWidth / (2 * tanH)
    const maxW = 2 * a * RULES.camMaxWidthFactor
    const fit = this.fit
    const crowded = sim.birds.length > CROWDED_BIRDS
    this.hardSet.count = this.collectHard(sim, view, pitch)
    this.hardSet.rect = crowded ? USEFUL_RECT_CROWDED : USEFUL_RECT
    this.softSet.alignY = 0.5
    // Grande Ombre : poussée lente = le sujet peut occuper un peu plus de l'écran (les oiseaux restent tenus)
    this.softSet.rect = this.updatePushRect(sim)
    this.softSet.count = this.collectSoft(sim, view, false)
    fitSets(this.sets2, 0, pitch, FOV, aspect, minDist, 1e5, fit)
    if (this.farShadows > 0) {
      // les boîtes des oiseaux forcent-elles le cadre ? alors on lâche d'abord les ombres du Simoun
      fitSets(this.sets1, 0, pitch, FOV, aspect, minDist, 1e5, this.fit2)
      if (fit.width > this.fit2.width * 1.01) {
        this.softSet.count = this.collectSoft(sim, view, true)
        fitSets(this.sets2, 0, pitch, FOV, aspect, minDist, 1e5, this.fit2)
        if (this.fit2.width < fit.width) copyFit(fit, this.fit2)
      }
    }
    if (fit.width > maxW) {
      // les oiseaux débordent le dézoom maximal : l'arène entière devient le sujet (elle les contient)
      this.arenaPoints(sim)
      this.softSet.count = ARENA_PTS
      this.softSet.rect = crowded ? ARENA_RECT_CROWDED : ROUND_RECT
      this.softSet.alignY = crowded ? 1 : 0.5
      fitSets(this.sets2, 0, pitch, FOV, aspect, minDist, 1e5, fit)
      this.softSet.alignY = 0.5
      if (!crowded) {
        // à 8 oiseaux ou moins, les seuls oiseaux (sans ombres ni front) donnent parfois un cadre plus
        // serré que l'arène entière : on garde le plus serré
        this.softSet.count = 0
        fitSets(this.sets2, 0, pitch, FOV, aspect, minDist, 1e5, this.fit2)
        if (this.fit2.width < fit.width) copyFit(fit, this.fit2)
      }
    }
  }

  /** Rectangle du sujet : marges du GDD, élargies par la poussée lente de la Grande Ombre (le sujet occupe plus de l'écran). */
  private updatePushRect(sim: SimState): ScreenRect {
    const push = isClimax(sim) ? GS_PUSH * greatShadowProgress(sim) : 0
    const k = 1 / (1 - push)
    const R = this.pushRect
    R.x0 = 0.5 - (0.5 - ROUND_RECT.x0) * k
    R.x1 = 0.5 + (ROUND_RECT.x1 - 0.5) * k
    R.y0 = 0.5 - (0.5 - ROUND_RECT.y0) * k
    R.y1 = 0.5 + (ROUND_RECT.y1 - 0.5) * k
    return R
  }

  /** L'ellipse de l'arène (dézoom maximal : l'arène entière à l'écran). */
  private arenaPoints(sim: SimState): void {
    const P = this.pts
    for (let i = 0; i < ARENA_PTS; i++) {
      const th = (i / ARENA_PTS) * Math.PI * 2
      P[i * 3] = Math.cos(th) * sim.arena.a
      P[i * 3 + 1] = Math.sin(th) * sim.arena.b
      P[i * 3 + 2] = 0
    }
  }

  /**
   * Sujet : ombres (poids 1) et oiseaux (poids 0,7, tirés vers leur ombre), plus leur position
   * dans LEAD s. `dropFar` : sans les oiseaux dont l'ombre est dans le Simoun (ρ > 1,0).
   */
  private collectSoft(sim: SimState, view: GameView, dropFar: boolean): number {
    if (this.gsOn(sim)) return this.collectGsSoft(sim, view, this.gsMask)
    const P = this.pts
    let n = 0
    const push = (x: number, y: number, z: number) => {
      if (n >= MAX_PTS) return
      P[n * 3] = x
      P[n * 3 + 1] = y
      P[n * 3 + 2] = z
      n++
    }
    const alpha = view.alpha
    const wb = RULES.camBirdWeight / RULES.camShadowWeight
    const round = this.kind === 'round'
    const countdown = round && sim.sun.t < 0
    let far = 0
    for (const b of sim.birds) {
      if (countdown) {
        // compte à rebours : chaque oiseau boucle sur un cercle fixe ; on cadre son centre (cadre immobile)
        loopCenter(b, _loop)
        push(_loop.x, _loop.y, 0)
        push(_loop.x, _loop.y, b.z * wb)
        continue
      }
      const p = view.prevBirds[b.slot] ?? b
      const x = p.x + (b.x - p.x) * alpha
      const y = p.y + (b.y - p.y) * alpha
      const z = p.z + (b.z - p.z) * alpha
      let scx = p.shadow.cx + (b.shadow.cx - p.shadow.cx) * alpha
      let scy = p.shadow.cy + (b.shadow.cy - p.shadow.cy) * alpha
      // une ombre hors de l'arène ne peint pas (grisée sur le Simoun) : inutile de cadrer au-delà du bord
      const rho = Math.hypot(scx / sim.arena.a, scy / sim.arena.b)
      if (rho > SHADOW_RHO_DROP) {
        far++
        if (dropFar) continue
      }
      if (rho > SHADOW_RHO_MAX) {
        scx *= SHADOW_RHO_MAX / rho
        scy *= SHADOW_RHO_MAX / rho
      }
      push(scx, scy, 0)
      push(scx + (x - scx) * wb, scy + (y - scy) * wb, z * wb)
      // anticipation : où seront l'oiseau et son ombre dans LEAD s (les ressorts ne traînent plus)
      if (round) {
        const lx = b.vx * LEAD
        const ly = b.vy * LEAD
        push(scx + lx, scy + ly, 0)
        push(scx + (x - scx) * wb + lx, scy + (y - scy) * wb + ly, z * wb)
      }
    }
    if (!dropFar) this.farShadows = far
    if (round && sim.sun.phase === 'greatShadow' && sim.night.active && sim.birds.length) {
      // le front de nuit à la hauteur de chaque oiseau (la « lèvre dorée » entre dans le cadre), mais
      // jamais plus de GS_FRONT_BACK_END m à l'ouest de l'oiseau le plus à l'ouest : pas de plan large imposé
      const nt = sim.night
      const px = -nt.dirY
      const py = nt.dirX
      let west = Infinity
      for (const b of sim.birds) west = Math.min(west, b.x * nt.dirX + b.y * nt.dirY)
      const s = Math.max(nt.s, -sim.arena.a * 1.05, west - GS_FRONT_BACK_END)
      for (const b of sim.birds) {
        const q = b.x * px + b.y * py
        push(nt.dirX * s + px * q, nt.dirY * s + py * q, 0)
      }
    }
    // salon, règles, manche sans oiseau : le centre de l'arène et ses tours (en manche, si toutes les
    // ombres sont abandonnées, les boîtes des oiseaux deviennent le sujet)
    if (!round || (n === 0 && !dropFar)) {
      const a = sim.arena.a
      const b = sim.arena.b
      const k = this.kind === 'lobby' ? 0.55 : 0.8
      push(-a * k, 0, 0)
      push(a * k, 0, 0)
      push(0, -b * k, 0)
      push(0, b * k, 0)
      if (this.kind === 'lobby') for (const t of sim.towers) if (!t.outside) push(t.x, t.y, t.height * 0.5)
    }
    return n
  }

  /**
   * Grande Ombre, plan serré (vague 2) : les oiseaux cadrés (et leur position dans LEAD s), leur
   * ombre si elle est proche (au soleil rasant, elle file au bord est et n'est pas cadrée), et le front
   * à leur hauteur, au plus 90 → 40 m à l'ouest du plus à l'ouest d'entre eux.
   */
  private collectGsSoft(sim: SimState, view: GameView, mask: number): number {
    const P = this.pts
    let n = 0
    const push = (x: number, y: number, z: number) => {
      if (n >= MAX_PTS) return
      P[n * 3] = x
      P[n * 3 + 1] = y
      P[n * 3 + 2] = z
      n++
    }
    const alpha = view.alpha
    const nt = sim.night
    let west = Infinity
    for (const b of sim.birds) {
      if (!((mask >> b.slot) & 1)) continue
      const p = view.prevBirds[b.slot] ?? b
      const x = p.x + (b.x - p.x) * alpha
      const y = p.y + (b.y - p.y) * alpha
      const z = p.z + (b.z - p.z) * alpha
      push(x, y, z)
      push(x + b.vx * LEAD, y + b.vy * LEAD, z)
      const scx = p.shadow.cx + (b.shadow.cx - p.shadow.cx) * alpha
      const scy = p.shadow.cy + (b.shadow.cy - p.shadow.cy) * alpha
      if (Math.hypot(scx - x, scy - y) < GS_SHADOW_NEAR && Math.hypot(scx / sim.arena.a, scy / sim.arena.b) <= SHADOW_RHO_DROP) push(scx, scy, 0)
      west = Math.min(west, x * nt.dirX + y * nt.dirY)
    }
    this.farShadows = 0
    if (nt.active && n > 0) {
      const px = -nt.dirY
      const py = nt.dirX
      const back = lerp(GS_FRONT_BACK_START, GS_FRONT_BACK_END, smoother(greatShadowProgress(sim)))
      const s = Math.max(nt.s, -sim.arena.a * 1.05, west - back)
      for (const b of sim.birds) {
        if (!((mask >> b.slot) & 1)) continue
        const q = b.x * px + b.y * py
        push(nt.dirX * s + px * q, nt.dirY * s + py * q, 0)
      }
    }
    return n
  }

  /** Plan serré de la Grande Ombre actif : manche lancée, Grande Ombre (ou GS_LEAD_IN s avant), 8 oiseaux ou moins. */
  private gsOn(sim: SimState): boolean {
    if (this.kind !== 'round' || sim.sun.t < 0 || sim.birds.length === 0 || sim.birds.length > CROWDED_BIRDS) return false
    return isClimax(sim) || (sim.sun.phase === 'sunset' && sim.sun.t >= gsStart(sim) - GS_LEAD_IN)
  }

  /** Largeur visée à la Grande Ombre (m) : de 1,2 a au début à 0,8 a à la nuit, jamais sous camMinWidth. */
  private gsTargetWidth(sim: SimState): number {
    return Math.max(RULES.camMinWidth, sim.arena.a * lerp(GS_WIDTH_START, GS_WIDTH_END, smoother(greatShadowProgress(sim))))
  }

  /**
   * Choix des oiseaux cadrés à la Grande Ombre (5 Hz) : les humains toujours ; puis les bots, des
   * voisins des humains aux plus lointains (sans humain : du plus proche du front au plus lointain ;
   * ceux déjà dans la nuit en dernier), chacun gardé si le cadre reste sous la largeur visée
   * (× GS_KEEP pour un bot déjà cadré : pas de va-et-vient).
   */
  private updateGsMask(dt: number, sim: SimState, view: GameView, aspect: number): void {
    if (!this.gsOn(sim)) {
      this.gsMask = ALL_SLOTS
      this.gsClock = 0
      return
    }
    this.gsClock -= dt
    if (this.gsClock > 0 && this.gsMask !== ALL_SLOTS) return
    // pause de la nuit : le choix est figé (les oiseaux planent, la montée part de ce cadre)
    if (sim.sun.phase === 'night' && this.gsMask !== ALL_SLOTS) return
    this.gsClock = GS_SELECT_PERIOD
    const prev = this.gsMask
    const target = this.gsTargetWidth(sim) * this.gsSqueeze
    const nt = sim.night
    const order = this.gsOrder
    const key = this.gsKey
    order.length = 0
    let mask = 0
    for (const b of sim.birds) if (isHuman(view, b.slot)) mask |= 1 << b.slot
    const humans = mask
    // le porteur de la couronne (bot) d'abord, sous GS_CROWN_CAP × a (le narrateur dit « elle se voit de loin »)
    const cs = sim.crownSlot
    if (cs >= 0 && sim.bySlot[cs] && !((mask >> cs) & 1)) {
      const m2 = mask | (1 << cs)
      const keep = prev !== ALL_SLOTS && (prev >> cs) & 1 ? GS_KEEP : 1
      const cap = Math.min(GS_CROWN_MAX_W, lerp(GS_CROWN_CAP_START, GS_CROWN_CAP, smoother(greatShadowProgress(sim))) * sim.arena.a)
      if (mask === 0 || this.gsWidth(sim, view, aspect, m2) <= Math.max(target, cap) * keep) mask = m2
    }
    for (const b of sim.birds) {
      if ((mask >> b.slot) & 1) continue
      // distance devant le front (m) ; avant la nuit, depuis le bord ouest
      const d = nt.active ? b.x * nt.dirX + b.y * nt.dirY - nt.s : b.x + sim.arena.a
      // avec des humains : d'abord leurs voisins (plan compact autour du joueur), le front départage ;
      // sans humain (démo, page de dev) : les plus menacés par le front
      let near = 0
      if (humans) {
        near = Infinity
        for (const h of sim.birds) if ((humans >> h.slot) & 1) near = Math.min(near, Math.hypot(h.x - b.x, h.y - b.y))
      }
      key[b.slot] = (d >= -8 ? 0 : 1e4) + near + 0.35 * Math.abs(d)
      // tri par insertion (≤ 12 oiseaux, sans allocation)
      let i = order.length
      order.push(b.slot)
      while (i > 0 && key[order[i - 1]!]! > key[b.slot]!) {
        order[i] = order[i - 1]!
        i--
      }
      order[i] = b.slot
    }
    for (const s of order) {
      const m2 = mask | (1 << s)
      const keep = prev !== ALL_SLOTS && (prev >> s) & 1 ? GS_KEEP : 1
      if (mask === 0 || this.gsWidth(sim, view, aspect, m2) <= target * keep) mask = m2
    }
    this.gsMask = mask
  }

  /** Largeur du cadre (m) qui tient les oiseaux du masque et le front, au tangage courant. */
  private gsWidth(sim: SimState, view: GameView, aspect: number, mask: number): number {
    const pitch = this.pitchFor(sim)
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    this.hardSet.count = this.collectHard(sim, view, pitch, mask)
    this.hardSet.rect = USEFUL_RECT
    this.softSet.rect = this.updatePushRect(sim)
    this.softSet.alignY = 0.5
    this.softSet.count = this.collectGsSoft(sim, view, mask)
    fitSets(this.sets2, 0, pitch, FOV, aspect, RULES.camMinWidth / (2 * tanH), 1e5, this.fit2)
    return this.fit2.width
  }

  /** Boîtes des oiseaux réels (contrainte dure) : maintenant et dans LEAD s ; la boucle entière au compte à rebours. */
  private collectHard(sim: SimState, view: GameView, pitch: number, mask = this.gsOn(sim) ? this.gsMask : ALL_SLOTS): number {
    const P = this.hard
    const E = this.hardExt
    let n = 0
    const alpha = view.alpha
    const countdown = sim.sun.t < 0
    const sinP = Math.sin(pitch)
    this.nowSet.count = 0
    for (const b of sim.birds) {
      if (n + 2 > MAX_HARD) break
      if (!((mask >> b.slot) & 1)) continue
      boxOf(sim, b.slot, sinP, _box)
      if (countdown) {
        const R = loopCenter(b, _loop)
        P[n * 3] = _loop.x
        P[n * 3 + 1] = _loop.y
        P[n * 3 + 2] = b.z
        E[n * 3] = _box.side + R
        E[n * 3 + 1] = _box.top + R * sinP
        E[n * 3 + 2] = _box.bottom + R * sinP
        n++
        continue
      }
      const p = view.prevBirds[b.slot] ?? b
      const x = p.x + (b.x - p.x) * alpha
      const y = p.y + (b.y - p.y) * alpha
      const z = p.z + (b.z - p.z) * alpha
      const m = this.nowSet.count++
      this.now[m * 3] = x
      this.now[m * 3 + 1] = y
      this.now[m * 3 + 2] = z
      this.nowExt[m * 3] = _box.side
      this.nowExt[m * 3 + 1] = _box.top
      this.nowExt[m * 3 + 2] = _box.bottom
      for (let k = 0; k < 2; k++) {
        P[n * 3] = x + b.vx * LEAD * k
        P[n * 3 + 1] = y + b.vy * LEAD * k
        P[n * 3 + 2] = z
        E[n * 3] = _box.side
        E[n * 3 + 1] = _box.top
        E[n * 3 + 2] = _box.bottom
        n++
      }
    }
    return n
  }

  /** Tangage : GDD (58° → 42°), Grande Ombre −5° (si les tours le permettent), + relèvement quand des tours bouchent le cadre (S3). */
  private pitchFor(sim: SimState): number {
    if (this.kind === 'lobby') return LOBBY_PITCH
    if (this.kind === 'rules') return RULES_PITCH
    return this.basePitch(sim) + this.boost.x
  }

  /** Tangage du GDD (58° → 42°) moins l'abaissement de la Grande Ombre, s'il est autorisé (lissé). */
  private basePitch(sim: SimState): number {
    return gddPitch(sim) - gsDrop(sim) * this.gsLow.x
  }

  /**
   * Estime l'encombrement du cadre par les tours (obstruction : au-dessus de 4 m, tour trop large,
   * tour de premier plan, caméra trop proche) et choisit la parade (10 Hz) : relever le tangage de 5
   * puis 8°, glisser le cadre (vague 3 : est, ouest, nord, dans la marge des boîtes des oiseaux
   * cadrés), puis reculer (× 1,2, × 1,45, × 1,8) — une caméra qui passe juste au-dessus d'un grand
   * disque ne s'en dégage qu'en reculant ou en glissant. Chaque essai est évalué au cadre visé (qui a
   * de l'avance) ET au cadre courant : la parade part avant que la tour n'entre.
   */
  private updateTowers(dt: number, sim: SimState, view: GameView, aspect: number): void {
    this.coverClock -= dt
    if (this.coverClock <= 0) {
      this.coverClock = COVER_PERIOD
      const tanH2 = 2 * Math.tan((FOV * DEG) / 2) * aspect
      // largeurs sans le recul d'évitement (sinon il ne redescendrait jamais)
      const wNow = Math.exp(this.sw.x - this.widen.x)
      // (vague 2) le cadre visé contient lui aussi le recul courant : on l'en retire, sinon chaque
      // parade était évaluée sur un cadre déjà reculé et la prévision était trop optimiste
      const wGoal = this.goalW / Math.exp(Math.max(this.widen.x, this.widenGoal))
      // (vague 3) cadre visé sans le glissement en cours ; cadre courant tel qu'il est (ressorts)
      const gx = this.fitX
      const gy = this.fitY
      const nx = this.sx.x
      const ny = this.sy.x
      const gdd = gddPitch(sim)
      const drop = gsDrop(sim)
      const gs = this.gsOn(sim)
      let base = gdd - drop * this.gsLowGoal
      // boîtes des oiseaux cadrés, pour borner les glissements (updateGsMask laisse un masque d'essai dans hardSet)
      let hardReady = false
      const sh = _shift
      // encombrement au cadre visé (qui a de l'avance) et, sauf `goalOnly`, au cadre courant ; glissement
      // (dx, dy) ramené dans la marge des oiseaux cadrés si `clamp` (résultat dans _shift)
      const cover = (boost: number, k: number, dx: number, dy: number, clamp: boolean, goalOnly = false): number => {
        const r = _probeRig
        r.tz = 0
        r.yaw = 0
        r.fov = FOV
        r.pitch = base + boost
        r.tx = gx + dx
        r.ty = gy + dy
        r.dist = (wGoal * k) / tanH2
        if (clamp && (dx !== 0 || dy !== 0)) {
          if (!hardReady) {
            this.hardSet.count = this.collectHard(sim, view, this.pitchFor(sim))
            this.hardSet.rect = sim.birds.length > CROWDED_BIRDS ? USEFUL_RECT_CROWDED : USEFUL_RECT
            hardReady = true
          }
          if (this.hardSet.count) clampRigToSets(r, this.hardSets, aspect)
        }
        sh.x = r.tx - gx
        sh.y = r.ty - gy
        const g = obstruction(sim, r, aspect)
        if (goalOnly) return g
        // cadre courant (le glissement n'y arrive que par les ressorts de position ; relèvement et recul, tout de suite)
        const tx = r.tx
        const ty = r.ty
        r.tx = nx
        r.ty = ny
        r.pitch = base + boost
        r.dist = (wNow * k) / tanH2
        const c = obstruction(sim, r, aspect)
        // (vague 3) en plein trajet (entrée de la Grande Ombre : le cadre file vers le plan serré, ou
        // glisse), le milieu du chemin aussi : la caméra ne traverse pas une tour entre les deux
        if (Math.hypot(tx - nx, ty - ny) < 0.15 * wGoal) return Math.max(g, c)
        r.tx = (tx + nx) / 2
        r.ty = (ty + ny) / 2
        r.dist = (Math.sqrt(wNow * wGoal) * k) / tanH2
        return Math.max(g, c, obstruction(sim, r, aspect))
      }
      // Grande Ombre (vague 2) : le tangage abaissé n'est gardé que si les tours ne bouchent pas le
      // cadre abaissé (> COVER_MAX) ; il revient sous COVER_OK (hystérésis). Sinon, tangage du GDD.
      if (drop > 0) {
        base = gdd - drop
        const cLow = cover(0, 1, 0, 0, false)
        if (cLow > COVER_MAX) this.gsLowGoal = 0
        else if (cLow < COVER_OK) this.gsLowGoal = 1
        base = gdd - drop * this.gsLowGoal
      } else this.gsLowGoal = 1
      const c0 = cover(0, 1, 0, 0, false)
      let goal = 0
      let widen = 0
      let sx = 0
      let sy = 0
      let chosen = c0
      const kept = this.boostGoal !== 0 || this.widenGoal !== 0 || this.shiftGoalX !== 0 || this.shiftGoalY !== 0
      if (c0 > COVER_MAX || (kept && c0 > COVER_OK)) {
        // (vague 3) la parade en cours (glissement ramené dans la marge) tient-elle encore, au cadre visé
        // comme en chemin ? on la garde ; sinon, recherche
        let found = false
        let limit = COVER_CANDIDATES.length
        // (vague 3) la parade en cours est gardée tant que son cadre visé reste sous COVER_MAX et son chemin
        // sous COVER_PATH (la caméra y va) : pas de va-et-vient d'un glissement à l'autre. Toutes les
        // COVER_RESEARCH s, on cherche seulement parmi les parades moins coûteuses (indices plus petits).
        this.coverSearch -= COVER_PERIOD
        if (kept) {
          const k = Math.exp(this.widenGoal)
          const gk = cover(this.boostGoal, k, this.shiftGoalX, this.shiftGoalY, true, true)
          const ex = sh.x
          const ey = sh.y
          const pk = gk <= COVER_MAX ? cover(this.boostGoal, k, ex, ey, false) : Infinity
          if (c0 > COVER_MAX ? pk <= COVER_PATH : pk <= c0) {
            chosen = pk
            goal = this.boostGoal
            widen = this.widenGoal
            sx = ex
            sy = ey
            found = true
            this.coverTrace.pick = -2
            if (this.coverSearch <= 0 && c0 > COVER_MAX && this.coverIdx > 0) {
              this.coverSearch = COVER_RESEARCH
              limit = this.coverIdx
              found = false
            }
          }
        }
        if (!found && c0 > COVER_MAX) {
          if (limit === COVER_CANDIDATES.length) this.coverSearch = COVER_RESEARCH
          // parades dans l'ordre (relever, glisser, reculer) : la première dont le cadre visé ET le chemin
          // sont sous COVER_GOAL ; sinon, parmi celles dont le cadre visé est propre, le chemin le moins
          // encombré (on y arrive) ; sinon le cadre visé le moins encombré (recherche complète seulement)
          let bestGoal = c0
          let bestPath = Infinity
          let pickGoal = -1
          let pickPath = -1
          const pk = _pick
          for (let ci = 0; ci < limit; ci++) {
            const [wi, bi, si] = COVER_CANDIDATES[ci]!
            this.coverTrace.evals++
            const k = wi === 0 ? 1 : COVER_WIDEN[wi - 1]!
            const b = bi === 0 ? 0 : COVER_BOOSTS[bi - 1]!
            const w = wGoal * k
            // (vague 3) à la Grande Ombre, pas de recul qui mène au plan moyen (au-delà de GS_PARRY_MAX_W m)
            if (k > 1 && gs && w > GS_PARRY_MAX_W) continue
            const dx = si < 0 ? 0 : COVER_SHIFTS[si]![0] * w
            const dy = si < 0 ? 0 : COVER_SHIFTS[si]![1] * w
            const g = cover(b, k, dx, dy, true, true)
            // glissement sans marge (les oiseaux cadrés le bloquent) : essai inutile
            if (si >= 0 && Math.hypot(sh.x, sh.y) < 0.04 * w) continue
            const ex = sh.x
            const ey = sh.y
            if (g <= COVER_GOAL) {
              const p = cover(b, k, ex, ey, false)
              if (p < bestPath - 0.005) {
                bestPath = p
                pickPath = ci
                pk[0] = b
                pk[1] = k
                pk[2] = ex
                pk[3] = ey
              }
              if (p <= COVER_GOAL) break
            } else if (pickPath < 0 && g < bestGoal - 0.01) {
              bestGoal = g
              pickGoal = ci
              pk[4] = b
              pk[5] = k
              pk[6] = ex
              pk[7] = ey
            }
          }
          if (limit < COVER_CANDIDATES.length) {
            // recherche partielle (parade gardée) : on ne change que pour une parade moins coûteuse et propre
            if (pickPath >= 0 && bestPath <= COVER_GOAL) {
              chosen = bestPath
              goal = pk[0]!
              widen = Math.log(pk[1]!)
              sx = pk[2]!
              sy = pk[3]!
              this.coverIdx = pickPath
              this.coverTrace.pick = pickPath
            }
          } else if (pickPath >= 0) {
            this.coverIdx = pickPath
            chosen = bestPath
            goal = pk[0]!
            widen = Math.log(pk[1]!)
            sx = pk[2]!
            sy = pk[3]!
            this.coverTrace.pick = pickPath
          } else if (pickGoal >= 0) {
            this.coverIdx = pickGoal
            chosen = bestGoal
            goal = pk[4]!
            widen = Math.log(pk[5]!)
            sx = pk[6]!
            sy = pk[7]!
            this.coverTrace.pick = pickGoal
          } else this.coverTrace.pick = -1
        }
      }
      // (vague 3) grand recul à la Grande Ombre : on cadre moins de bots (le recul revient avec eux)
      if (this.gsOn(sim)) this.gsSqueeze = widen >= Math.log(COVER_WIDEN[1]) - 1e-6 ? Math.max(GS_SQUEEZE, this.gsSqueeze - 0.05) : widen === 0 ? Math.min(1, this.gsSqueeze + 0.02) : this.gsSqueeze
      else this.gsSqueeze = 1
      this.boostGoal = goal
      this.widenGoal = widen
      this.shiftGoalX = sx
      this.shiftGoalY = sy
      this.coverTrace.base = c0
      this.coverTrace.chosen = chosen
      const r = _probeRig
      r.tx = this.sx.x
      r.ty = this.sy.x
      r.pitch = base + this.boost.x
      r.dist = Math.exp(this.sw.x) / tanH2
      this.towerCover = towerCoverage(sim, r, aspect, COVER_MIN_Z, Infinity, foregroundHats(sim) ? HAT_NEAR : 0)
    }
    this.boost.step(this.boostGoal, 2.2, dt)
    // (vague 2) retour du recul plus vif (1,6 au lieu de 1,0) : le plan serré revient dès que la tour est passée
    this.widen.step(this.widenGoal, this.widenGoal > this.widen.x ? 2.4 : 1.6, dt)
    // remonter vite (une tour entre), redescendre lentement
    this.gsLow.step(this.gsLowGoal, this.gsLowGoal < this.gsLow.x ? 2.6 : 1.2, dt)
  }

  /**
   * Garde-fou dur (S1) : le cadre suivi par les ressorts traîne derrière le cadre visé ; s'il laisse
   * une boîte d'oiseau sortir du rectangle utile, il est ramené au plus près (recul, glissement) et
   * les vitesses qui s'y opposent sont annulées. Continu : pas de saut, le ressort repart de là.
   */
  private guard(sim: SimState, aspect: number): void {
    if (!this.nowSet.count) return
    const r = this.guardRig
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    r.tx = this.sx.x
    r.ty = this.sy.x
    r.tz = 0
    r.yaw = 0
    r.pitch = this.pitchFor(sim)
    r.fov = FOV
    r.dist = Math.exp(this.sw.x) / (2 * tanH)
    this.nowSet.rect = this.hardSet.rect
    if (!clampRigToSets(r, this.nowSets, aspect)) return
    const lw = Math.log(2 * r.dist * tanH)
    const fix = (s: Spring, x: number) => {
      if ((x - s.x) * s.v < 0) s.v = 0
      s.x = x
    }
    fix(this.sx, r.tx)
    fix(this.sy, r.ty)
    fix(this.sw, lw)
  }

  /** Cadre du punch-in : la paire dans le rectangle utile, les humains à l'écran, largeur ≥ facteur × largeur de départ. */
  private updatePunch(dt: number, sim: SimState, view: GameView, aspect: number): void {
    this.punchValid = false
    if (this.punchT < 0) {
      this.punchLevel = this.punchE.step(0, PUNCH_RETURN_OMEGA, dt)
      return
    }
    this.punchT += dt
    if (this.kind !== 'round' || !this.punchFit(sim, view, aspect)) {
      this.punchT = -1
      return
    }
    this.punchGoalX = this.pfit.tx
    this.punchGoalY = this.pfit.ty
    this.punchGoalW = Math.min(this.pfit.width, this.punchW0)
    this.punchValid = true
    // la paire file vers une tour : le plan serré se relâche plus tôt (10 Hz)
    this.punchCheck -= dt
    if (this.punchT < PUNCH_IN + PUNCH_HOLD && this.punchCheck <= 0) {
      this.punchCheck = COVER_PERIOD
      const pr = _probeRig
      pr.tx = this.pfit.tx
      pr.ty = this.pfit.ty
      pr.tz = 0
      pr.yaw = 0
      pr.pitch = this.pitchFor(sim)
      pr.dist = this.pfit.dist
      pr.fov = FOV
      if (punchBlocked(sim, pr, aspect)) this.punchT = PUNCH_IN + PUNCH_HOLD
    }
    if (this.punchT < PUNCH_IN + PUNCH_HOLD) {
      const e = smoother(this.punchT / PUNCH_IN)
      this.punchE.x = Math.max(this.punchE.x, e)
      this.punchE.v = 0
    } else {
      // retour en ressort
      this.punchE.step(0, PUNCH_RETURN_OMEGA, dt)
      if (this.punchE.x < 0.01) this.punchT = -1
    }
    this.punchLevel = this.punchE.x
  }

  /** Saute directement au cadre désiré (coupe). */
  snap(sim: SimState, view: GameView, aspect: number): Rig {
    this.goalW = 0
    this.punchT = -1
    this.punchE.snap(0)
    this.punchLevel = 0
    if (this.kind === 'round') {
      this.gsClock = 0
      this.updateGsMask(0, sim, view, aspect)
    }
    this.desired(sim, view, aspect)
    this.goalX = this.fit.tx
    this.goalY = this.fit.ty
    this.goalW = this.fit.width
    this.desired(sim, view, aspect)
    this.sx.snap(this.goalX)
    this.sy.snap(this.goalY)
    this.sw.snap(Math.log(this.goalW))
    return this.build(sim, aspect, 0)
  }

  update(dt: number, sim: SimState, view: GameView, aspect: number): Rig {
    this.drift += dt
    if (this.kind === 'round') {
      this.updateGsMask(dt, sim, view, aspect)
      this.updateTowers(dt, sim, view, aspect)
    }
    // compte à rebours : les oiseaux bouclent sur place ; le cadre (centres et cercles des boucles) ne bouge pas
    this.desired(sim, view, aspect)
    this.sx.step(this.goalX, RULES.camPosOmega, dt)
    this.sy.step(this.goalY, RULES.camPosOmega, dt)
    // dézoomer plus vite que zoomer : on ne perd jamais un oiseau au bord du cadre
    const lw = Math.log(this.goalW)
    // entrée dans la Grande Ombre : poussée plus vive vers le plan serré
    const zin = this.gsOn(sim) && sim.sun.t < gsStart(sim) + GS_ENTRY ? GS_ZOOM_BOOST : 1
    // (vague 3) recul d'évitement des tours en cours : le dézoom est plus vif encore (la tour entre vite)
    const zout = this.widenGoal > this.widen.x + 0.02 ? ZOOM_OUT_BOOST * TOWER_OUT_BOOST : ZOOM_OUT_BOOST
    this.sw.step(lw, lw > this.sw.x ? RULES.camZoomOmega * zout : RULES.camZoomOmega * zin, dt)
    if (this.kind === 'round' && sim.sun.t >= 0) this.guard(sim, aspect)
    if (this.kind === 'round') {
      this.updatePunch(dt, sim, view, aspect)
      // la paire passe sous un disque : pas de zoom de piqué (il la cacherait)
      if (this.diveT >= 0 && this.diveT < DIVE_IN + this.diveHold && (birdUnderDisc(sim, this.diveHunter) || birdUnderDisc(sim, this.diveTarget)))
        this.diveHold = Math.max(0, this.diveT - DIVE_IN)
    }
    return this.build(sim, aspect, dt)
  }

  private build(sim: SimState, aspect: number, dt: number): Rig {
    const r = this.rig
    let tx = this.sx.x
    let ty = this.sy.x
    let w = Math.exp(this.sw.x)
    let pitch = this.pitchFor(sim)
    if (this.kind === 'round') {
      // travelling d'ouverture pendant « 3, 2, 1 » : léger recul + plongée, qui se referment à l'Envol
      if (sim.sun.t < 0) {
        const k = smoother(-sim.sun.t / RULES.countdownSeconds)
        w *= 1 + OPEN_BACK * k
        pitch += OPEN_PITCH * k
        ty -= w * 0.04 * k
      }
      // punch-in : cible sur la paire, largeur serrée ; retour en ressort vers le cadrage courant
      const pe = this.punchLevel
      if (pe > 1e-3 && this.punchGoalW > 0) {
        if (this.punchValid || this.punchT < 0) {
          tx = lerp(tx, this.punchGoalX, pe)
          ty = lerp(ty, this.punchGoalY, pe)
          w = Math.exp(lerp(Math.log(w), Math.log(Math.min(w, this.punchGoalW)), pe))
        }
      }
      // zoom de piqué (+8 %) vers la paire (effacé par le punch-in, qui fait mieux)
      if (this.diveT >= 0) {
        this.diveT += dt
        const t = this.diveT
        const inK = smoother(t / DIVE_IN)
        const outK = t > DIVE_IN + this.diveHold ? smoother((t - DIVE_IN - this.diveHold) / DIVE_OUT) : 0
        const e = inK * (1 - outK) * (1 - pe)
        if (outK >= 1) this.diveT = -1
        const h = sim.bySlot[this.diveHunter]
        const g = sim.bySlot[this.diveTarget]
        if (h && g && e > 0) {
          const mx = (h.x + g.x) / 2
          const my = (h.y + g.y) / 2
          tx += (mx - tx) * DIVE_PULL * e
          ty += (my - ty) * DIVE_PULL * e
          w *= 1 - RULES.camDiveZoom * e
        }
      }
      // tremblement de touche (désactivable : réglage « tremblement »)
      this.shake.x = this.shake.y = 0
      if (this.shakeT >= 0) {
        this.shakeT += dt
        const k = 1 - this.shakeT / SHAKE_SECONDS
        if (k <= 0) this.shakeT = -1
        else {
          const amp = RULES.camShakeAmp * (w / SHAKE_PER) * k * k
          const t = this.shakeT * 1 + this.shakePhase
          this.shake.x = amp * (Math.sin(t * 61.3) * 0.65 + Math.sin(t * 37.9 + 1.3) * 0.35)
          this.shake.y = amp * (Math.sin(t * 53.7 + 2.1) * 0.6 + Math.sin(t * 29.1 + 0.4) * 0.4)
        }
      }
    } else if (this.kind === 'rules') {
      w *= 1 + 0.04 * Math.sin(this.drift * 0.07)
    }
    const tanH = Math.tan((FOV * DEG) / 2) * aspect
    r.tx = tx
    r.ty = ty
    r.tz = 0
    r.yaw = 0
    r.pitch = pitch
    r.dist = w / (2 * tanH)
    r.fov = FOV
    return r
  }

  /** Largeur cadrée courante (m). */
  get width(): number {
    return Math.exp(this.sw.x)
  }
}

function copyFit(dst: ReturnType<typeof makeSetsFit>, src: ReturnType<typeof makeSetsFit>): void {
  dst.tx = src.tx
  dst.ty = src.ty
  dst.dist = src.dist
  dst.width = src.width
  dst.slackLeft = src.slackLeft
  dst.slackRight = src.slackRight
}

/** Tangage du GDD : 58° → 42° linéaire sur la manche. */
function gddPitch(sim: SimState): number {
  return lerp(RULES.camPitchStartDeg, RULES.camPitchEndDeg, clamp(sim.sun.u, 0, 1)) * DEG
}

/** Abaissement du tangage de la Grande Ombre (rad), avant blocage par les tours. */
function gsDrop(sim: SimState): number {
  return isClimax(sim) ? GS_PITCH * greatShadowProgress(sim) : 0
}

/** Grande Ombre ou pause de la nuit qui la suit (le cadrage du climax y est gardé tel quel). */
function isClimax(sim: SimState): boolean {
  return sim.sun.phase === 'greatShadow' || sim.sun.phase === 'night'
}

/** Instant de soleil (s) du début de la Grande Ombre. */
function gsStart(sim: SimState): number {
  return (RULES.greatShadowAt * sim.sun.T) / RULES.roundSunSeconds
}

/** Avancée de la Grande Ombre (0 à son début, 1 à la nuit). */
export function greatShadowProgress(sim: SimState): number {
  const t0 = gsStart(sim)
  return clamp01((sim.sun.t - t0) / Math.max(1, sim.sun.T - t0))
}

function isHuman(view: GameView, slot: number): boolean {
  const k = view.players[slot]?.kind
  return k === 'phone' || k === 'keyboard'
}

const _loop = { x: 0, y: 0 }
/** Centre de la boucle du compte à rebours (sim : cercle à vitesse et virage constants) ; renvoie son rayon. */
function loopCenter(b: SimState['birds'][number], out: { x: number; y: number }): number {
  const w = b.turnRate
  if (Math.abs(w) < 1e-3) {
    out.x = b.x
    out.y = b.y
    return 0
  }
  const R = Math.abs(b.speed / w)
  const side = Math.sign(w)
  // b.x = cx + side·R·sin h, b.y = cy − side·R·cos h (placeOnRing)
  out.x = b.x - side * R * Math.sin(b.heading)
  out.y = b.y + side * R * Math.cos(b.heading)
  return R
}

const _box = { side: 0, top: 0, bottom: 0 }
/** Demi-étendues (m, axes de la caméra) de la boîte d'un oiseau : envergure affichée, étiquette, couronne. */
function boxOf(sim: SimState, slot: number, sinPitch: number, out: typeof _box): typeof _box {
  const scale = Math.max(1, birdAnchors.scale[slot] || 1)
  const W = RULES.wingspan * scale
  out.side = BOX_SIDE * W
  out.top = BOX_TOP * W
  out.bottom = BOX_BOTTOM * W
  if (sim.crownSlot === slot) out.top = Math.max(out.top, (crownLift(sinPitch) + CROWN_EXTRA) * scale)
  return out
}

/** L'oiseau passe-t-il sous un disque (ou toute partie large) d'une tour ? */
export function birdUnderDisc(sim: SimState, slot: number): boolean {
  const b = sim.bySlot[slot]
  if (!b) return false
  for (const t of sim.towers) {
    if (t.height <= b.z + 1) continue
    const dx0 = b.x - t.x
    const dy0 = b.y - t.y
    if (dx0 * dx0 + dy0 * dy0 > 45 * 45) continue
    for (const g of t.segments) {
      if (g.z1 <= b.z + 1) continue
      const r = Math.max(g.r0, g.r1)
      if (r <= t.trunkRadius + 1) continue
      const dx = dx0 - (g.ox1 ?? g.ox0 ?? 0)
      const dy = dy0 - (g.oy1 ?? g.oy0 ?? 0)
      if (dx * dx + dy * dy < r * r) return true
    }
  }
  return false
}

// ─── Couverture des tours (S3) ───────────────────────────────────────────────

const _probeRig: Rig = makeRig()
const _pa = { x: 0, y: 0, z: 0 }
const _shift = { x: 0, y: 0 }
/** Parades retenues pendant la recherche : (relèvement, recul, glissement x, y) chemin propre, puis cadre visé seul. */
const _pick = new Float64Array(8)
let _covRig: Rig = _probeRig
let _covAspect = 16 / 9
const rigProjector = (x: number, y: number, z: number, out: { x: number; y: number; z: number }) => {
  projectRig(_covRig, _covAspect, x, y, z, out)
}

/** Part de l'écran (0..1) couverte par les parties de tours au-dessus de `minZ` m, pour un rig (voir towerCover.ts). */
export function towerCoverage(sim: SimState, r: Rig, aspect: number, minZ = COVER_MIN_Z, maxDist = Infinity, hatNear = 0): number {
  _covRig = r
  _covAspect = aspect
  const tanV = Math.tan((r.fov * DEG) / 2)
  const cp = Math.cos(r.pitch)
  const camZ = r.tz + Math.sin(r.pitch) * r.dist
  const camX = r.tx + Math.sin(r.yaw) * cp * r.dist
  const camY = r.ty - Math.cos(r.yaw) * cp * r.dist
  return towerCover(sim, camX, camY, camZ, rigProjector, tanV * aspect, tanV, minZ, FULL_SCREEN, Infinity, maxDist, hatNear)
}

/**
 * Encombrement d'un cadre par les tours, comparé à COVER_MAX (vague 3) : part d'écran couverte par la
 * tour la plus couvrante prise seule (au-dessus de COVER_MIN_Z), toutes les tours × COVER_TOTAL_K, une
 * tour trop large (plus de COVER_MAX / COVER_WIDTH_K de la largeur, ~34 % : un disque qui barre le cadre
 * même vu par la tranche), tours de premier plan × FG_K, ou caméra trop près d'une tour. À la Grande
 * Ombre, les chapeaux de premier plan (effacés par le matériau) ne comptent pas.
 */
function obstruction(sim: SimState, r: Rig, aspect: number): number {
  // (vague 3) Grande Ombre : les chapeaux de premier plan (à moins de HAT_NEAR m) sont effacés par le matériau : ils ne comptent pas
  const hn = foregroundHats(sim) ? HAT_NEAR : 0
  const c = towerCoverage(sim, r, aspect, COVER_MIN_Z, Infinity, hn)
  const one = towerCoverStats.maxSingle
  const mw = towerCoverStats.maxWidth
  // (vague 3) premier plan : tours plantées près de la caméra, entre elle et la cible (tours entières : leur pied se voit)
  const fg = towerCoverage(sim, r, aspect, 0.5, FG_NEAR * Math.cos(r.pitch) * r.dist, hn)
  return Math.max(one, COVER_TOTAL_K * c, COVER_WIDTH_K * mw, FG_K * fg, clearPenalty(sim, r))
}

/**
 * Caméra à moins de COVER_CLEAR m d'une tour (au-dessus de 20 m) : pénalité qui compte comme une
 * couverture au-delà du seuil (et croît en s'approchant), sinon 0. La trame du matériau des tours
 * efface ces fragments proches, mais le cadre ne doit pas s'y installer.
 */
function clearPenalty(sim: SimState, r: Rig): number {
  const cp = Math.cos(r.pitch)
  const d = towerClearance(sim, r.tx + Math.sin(r.yaw) * cp * r.dist, r.ty - Math.cos(r.yaw) * cp * r.dist, r.tz + Math.sin(r.pitch) * r.dist, 20, foregroundHats(sim) ? HAT_NEAR : 0)
  return d < COVER_CLEAR ? COVER_MAX + 0.02 + (COVER_CLEAR - d) * 0.01 : 0
}

/** Distance minimale (m) entre la caméra d'un punch-in et une tour (au-dessus de 20 m). */
const PUNCH_CLEAR = 42
/** Encombrement au-delà duquel un punch-in est refusé (seuil de parade de la vague 2 : un plan de 0,8 s). */
const PUNCH_COVER = 0.12

/** Le rig d'un plan serré est-il bouché par les tours (au-delà de COVER_GOAL, avec marge) ou trop près de l'une d'elles ? */
function punchBlocked(sim: SimState, r: Rig, aspect: number): boolean {
  if (obstruction(sim, r, aspect) > PUNCH_COVER) return true
  const cp = Math.cos(r.pitch)
  return towerClearance(sim, r.tx + Math.sin(r.yaw) * cp * r.dist, r.ty - Math.cos(r.yaw) * cp * r.dist, r.tz + Math.sin(r.pitch) * r.dist, 20, foregroundHats(sim) ? HAT_NEAR : 0) < PUNCH_CLEAR
}

/** Point interpolé d'un oiseau (repère sim) — commodité pour les autres plans. */
export function birdAt(slot: number, out: { x: number; y: number; z: number }, view: GameView = gameView): boolean {
  const s = view.sim
  const b = s?.bySlot[slot]
  if (!b) return false
  const p = view.prevBirds[slot] ?? b
  const a = view.alpha
  out.x = p.x + (b.x - p.x) * a
  out.y = p.y + (b.y - p.y) * a
  out.z = p.z + (b.z - p.z) * a
  return true
}
