// Podium de fin de partie (GDD §11.5, §13.1) : plan bas face à l'ouest, les trois premiers
// perchés sur trois tours dont les sommets tombent juste au-dessus des plaques de l'UI
// (PODIUM_X de src/host/ui/screens/MatchResults.tsx), silhouettes sur le ciel du couchant ;
// les autres oiseaux tournent au loin. Scène = état de simulation SYNTHÉTIQUE cloné du dernier
// état de manche (le territoire peint reste au sol), jamais réinjecté dans la simulation.
import type { BirdState, SimState, TowerDef, TowerSegment } from '../../sim/types.ts'
import { DEG } from './math.ts'

/** Plaques de l'UI (fractions de l'écran) : [2e, 1er, 3e], comme PODIUM_X de l'UI. */
export const PODIUM_SCREEN_X: readonly [number, number, number] = [0.3, 0.5, 0.7]
/** Haut des plaques (fraction de la hauteur) : 37 % (25 % au-delà de 6 joueurs), + décalages px 1080p. */
const PLATE_TOP = 0.37
/** Même hauteur qu'en mode normal depuis que les cartes de titres denses se resserrent (qa). */
const PLATE_TOP_DENSE = 0.37
const PLATE_DY_PX: readonly [number, number, number] = [40, 0, 70]
/**
 * Le plateau de la tour (pieds de l'oiseau) tombe à cette hauteur au-dessus du haut de la plaque
 * (px 1080p) : l'oiseau perché, corps et tête, reste entier au-dessus de la plaque et de sa pastille
 * de rang (polish S5 ; 26 px cachaient le bas du corps). Par colonne [2e, 1er, 3e] : le vainqueur, dont
 * la plaque est la plus haute, un peu moins haut pour que sa couronne reste sous le bandeau du titre.
 * Non-régression du polish (S5 × B3) : [84, 72, 84] et 46 m posaient la couronne du vainqueur (sur sa
 * tête, `PERCH_CROWN_TOP_M`) SOUS le bandeau du champion à 4 joueurs ; 25 px plus bas et 48 m, elle
 * reste ≈ 10 px sous le bandeau (1080p comme 4K), sans déplacer les plaques de l'UI.
 */
export const PERCH_ABOVE_PLATE_PX: readonly [number, number, number] = [59, 47, 59]

/** Caméra du podium : basse, face à l'ouest, légère contre-plongée (horizon au tiers bas). */
export const PODIUM_CAMERA = {
  /** Entrée (s) : plan pur, poussée lente sur le vainqueur jusqu'à l'entrée de l'UI (podiumReady à 2,2 s + 2,5 s de délai de l'UI). */
  introSeconds: 4.5,
  /** Focale de départ de la poussée (× la focale posée). */
  introFovScale: 1.16,
  /** Ensuite, respiration lente de la focale (± 2 % du cadrage) : l'image n'est jamais figée. */
  driftFov: 0.02,
  driftPeriod: 17,
  height: 5.5,
  /** Regard relevé (°) : horizon vers 64 % de la hauteur. */
  lookUpDeg: 6,
  fov: 40,
  /** Distance caméra → ligne des tours (m) ; plus loin quand les plaques remontent (> 6 joueurs). */
  towersDist: 48,
  towersDistDense: 80,
  /** Azimut du soleil (°, depuis le nord) et élévation : bas sur la Falaise, en face, derrière le vainqueur. */
  sunAzDeg: 270,
  sunElevDeg: 12,
  /** Palette du couchant (KF1 = « soleil sur la Falaise »). */
  paletteElev: 1.6,
}

/** Hauteur au-dessus du plateau d'une tour du point de repos de l'oiseau perché (m). */
export const PERCH_BODY_LIFT = 1.1

export interface PodiumLayout {
  /** Caméra (repère sim). */
  cam: { x: number; y: number; z: number; yaw: number; pitch: number; fov: number }
  /** Tours par rang : 0 = 1er, 1 = 2e, 2 = 3e (x, y sim ; hauteur du plateau). */
  spots: { x: number; y: number; top: number }[]
  aspect: number
}

/**
 * Place la caméra et les tours pour un rapport d'aspect donné : les sommets des tours se
 * projettent au-dessus des plaques (PODIUM_SCREEN_X), à la bonne hauteur d'écran.
 */
export function podiumLayout(arena: { a: number; b: number }, aspect: number, dense: boolean): PodiumLayout {
  const C = PODIUM_CAMERA
  const dist = dense ? C.towersDistDense : C.towersDist
  const towersX = Math.min(arena.a * 0.3, arena.a - dist - 25)
  const camX = towersX + dist
  const pitch = -C.lookUpDeg * DEG
  const tanV = Math.tan((C.fov * DEG) / 2)
  const tanH = tanV * aspect
  const plate = dense ? PLATE_TOP_DENSE : PLATE_TOP
  const spots: PodiumLayout['spots'] = []
  // rang 1 → colonne 1 (centre), rang 2 → colonne 0 (gauche), rang 3 → colonne 2 (droite)
  const columnOfRank = [1, 0, 2]
  for (let rank = 0; rank < 3; rank++) {
    const col = columnOfRank[rank]!
    const sx = PODIUM_SCREEN_X[col]!
    // px de conception → fraction de hauteur (zoom de l'UI : min(h / 1080, l / 1600))
    const sy = plate + (PLATE_DY_PX[col]! - PERCH_ABOVE_PLATE_PX[col]!) * Math.min(1 / 1080, aspect / 1600)
    // rayon caméra (repère caméra : x droite, y haut, −z avant), puis monde (regard vers l'ouest)
    const rx = (sx * 2 - 1) * tanH
    const ry = (1 - sy * 2) * tanV
    // tangage : rotation autour de l'axe droite de la caméra (qui pointe vers le nord quand on regarde l'ouest)
    const cp = Math.cos(pitch)
    const sp = Math.sin(pitch)
    // avant (vers l'ouest, relevé) : (−cp, 0, −sp) en (x est, y nord, z haut) ; droite : nord ; haut : (−sp·…)
    const fx = -cp
    const fz = -sp
    const ux = -sp
    const uz = cp
    // direction = avant + rx·droite + ry·haut
    const dx = fx + ry * ux
    const dy = rx // droite = +y (nord)
    const dz = fz + ry * uz
    // intersection avec le plan vertical x = towersX
    const t = (towersX - camX) / dx
    spots.push({ x: towersX, y: dy * t, top: C.height + dz * t })
  }
  return { cam: { x: camX, y: 0, z: C.height, yaw: 90 * DEG, pitch, fov: C.fov }, spots, aspect }
}

/**
 * Profil d'une tour de podium, archétype Pile (ART_BIBLE §6.6) : fût crème évasé au pied, disque
 * ocre étagé sous le sommet, plateau turquoise où l'oiseau se perche (le monde colore la Pile ainsi :
 * fût crème, disques ocre, couronne turquoise). Remplace les « troncs bruns » de l'archétype colonne.
 */
function podiumTower(id: number, x: number, y: number, top: number): TowerDef {
  // plateau turquoise assez épais pour se lire sous l'oiseau perché
  const th = 1.9
  const R = 3.9
  // disque étagé ocre sous la plaque de l'UI (qui couvre ≈ 3 à 8 m sous le plateau) : visible
  // entre la plaque et la grille des titres
  const zd = Math.max(3.5, top * 0.42)
  const dth = 1.1
  const segments: TowerSegment[] = [
    { z0: 0, r0: 3.4, z1: 2.2, r1: 2.7 },
    { z0: 2.2, r0: 2.7, z1: zd, r1: 2.45 },
    { z0: zd, r0: 2.45, z1: zd, r1: 5.8 },
    { z0: zd, r0: 5.8, z1: zd + dth, r1: 5.8 },
    { z0: zd + dth, r0: 5.8, z1: zd + dth, r1: 2.35 },
    { z0: zd + dth, r0: 2.35, z1: top - th - 1.2, r1: 2.2 },
    { z0: top - th - 1.2, r0: 2.2, z1: top - th, r1: 2.9 },
    { z0: top - th, r0: 2.9, z1: top - th, r1: R },
    { z0: top - th, r0: R, z1: top, r1: R },
    { z0: top, r0: R, z1: top, r1: 0 },
  ]
  return { id, x, y, archetype: 'pile', segments, height: top, trunkRadius: R, outside: true, seed: PODIUM_SEEDS[id - 900] ?? 0x5eed00 }
}

/**
 * Graines du décor des tours de podium (regard final) : choisies pour que le décor du monde ne
 * plante PAS de mât à fanion au sommet (towerGeometry.ts, étape 4, 85 % des Piles) : le mât
 * passait derrière l'oiseau perché et semblait l'empaler, la couronne au bout du bâton.
 * Vérifié hors ligne sur des plateaux de 12 à 30 m (le podium va de 14,8 à 24,3 m).
 */
const PODIUM_SEEDS: readonly number[] = [0x5eed00, 0x5eed02, 0x5eed05]

function blankBird(slot: number, src?: BirdState): BirdState {
  const b: BirdState = {
    slot,
    x: 0,
    y: 0,
    z: 20,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    turnRate: 0,
    speed: 0,
    targetLow: false,
    strong: false,
    shadow: { cx: 0, cy: 0, r: 0.01, rAlong: 0.01, strong: false, paints: false },
    dive: 'none',
    diveTarget: -1,
    diveTime: 0,
    lockTarget: -1,
    lockedBy: -1,
    stun: 0,
    stunKind: 'none',
    immune: 0,
    flap: 0,
    flapCooldown: 0,
    diveCooldown: 0,
    hidden: false,
    inNight: false,
    inStorm: false,
    crown: false,
    assist: src?.assist ?? false,
    towerSlide: 0,
  }
  return b
}

export interface PodiumView {
  sim: SimState
  prevBirds: (BirdState | undefined)[]
  /** Modes d'animation par slot ('perch' pour le podium). */
  modes: ('fly' | 'perch' | undefined)[]
  layout: PodiumLayout
  /** Oiseaux qui tournent au loin : centre et rayon de leur cercle, phase. */
  circlers: { slot: number; cx: number; cy: number; r: number; z: number; phase: number; dir: number }[]
}

/**
 * Scène du podium (pure) : clone l'état `state` (territoire gardé), remplace les tours par les
 * trois tours du podium et place les oiseaux de `ranking` ([1er, 2e, 3e], 1 à 3 slots) perchés
 * à leur sommet ; les autres oiseaux tournent au loin, à l'ouest, au-dessus du désert.
 */
export function buildPodiumView(state: SimState, ranking: readonly number[], aspect = 16 / 9, dense = false): PodiumView {
  const layout = podiumLayout(state.arena, aspect, dense)
  const towers: TowerDef[] = []
  const birds: BirdState[] = []
  const bySlot: (BirdState | undefined)[] = new Array(12).fill(undefined)
  const modes: PodiumView['modes'] = new Array(12).fill(undefined)
  const podium = ranking.slice(0, 3)
  podium.forEach((slot, rank) => {
    const s = layout.spots[rank]!
    towers.push(podiumTower(900 + rank, s.x, s.y, s.top))
    const b = blankBird(slot, state.bySlot[slot])
    b.x = s.x
    b.y = s.y
    b.z = s.top + PERCH_BODY_LIFT
    // face à la caméra (est), les deux autres tournés vers le vainqueur
    b.heading = rank === 0 ? 0 : rank === 1 ? 24 * DEG : -24 * DEG
    b.shadow.cx = b.x
    b.shadow.cy = b.y
    b.crown = rank === 0
    birds.push(b)
    bySlot[slot] = b
    modes[slot] = 'perch'
  })
  const circlers: PodiumView['circlers'] = []
  let k = 0
  for (const src of state.birds) {
    if (bySlot[src.slot]) continue
    const b = blankBird(src.slot, src)
    const lane = k++
    circlers.push({
      slot: src.slot,
      cx: layout.spots[0]!.x - 150 - (lane % 3) * 45,
      cy: ((lane % 2 === 0 ? 1 : -1) * (30 + lane * 22)) % 140,
      r: 26 + (lane % 3) * 8,
      z: 30 + (lane % 4) * 6,
      phase: lane * 1.7,
      dir: lane % 2 === 0 ? 1 : -1,
    })
    birds.push(b)
    bySlot[src.slot] = b
    modes[src.slot] = 'fly'
  }
  const sim: SimState = {
    config: state.config,
    tick: state.tick,
    time: state.time,
    sun: {
      ...state.sun,
      elevation: PODIUM_CAMERA.sunElevDeg * DEG,
      azimuth: PODIUM_CAMERA.sunAzDeg * DEG,
      paletteElevDeg: PODIUM_CAMERA.paletteElev,
      // pas 'over' : le monde passerait le ciel en nuit (étoiles) ; c'est un couchant
      phase: 'sunset',
    },
    arena: state.arena,
    towers,
    birds,
    bySlot,
    grid: state.grid,
    night: { ...state.night, active: false },
    crownSlot: podium[0] ?? -1,
    timeScaleHint: 1,
    stats: state.stats,
    over: true,
  }
  const view: PodiumView = { sim, prevBirds: [], modes, layout, circlers }
  animatePodium(view, 0)
  return view
}

/** Fait tourner les oiseaux du fond (temps réel `t`, s) ; les perchés restent immobiles. */
export function animatePodium(view: PodiumView, t: number): void {
  for (const c of view.circlers) {
    const b = view.sim.bySlot[c.slot]
    if (!b) continue
    const prev = view.prevBirds[c.slot]
    if (prev) Object.assign(prev, b, { shadow: prev.shadow })
    const w = (18 / c.r) * c.dir
    const ang = c.phase + t * w
    b.x = c.cx + Math.cos(ang) * c.r
    b.y = c.cy + Math.sin(ang) * c.r
    b.z = c.z + Math.sin(t * 0.4 + c.phase) * 3
    b.vx = -Math.sin(ang) * c.r * w
    b.vy = Math.cos(ang) * c.r * w
    b.vz = Math.cos(t * 0.4 + c.phase) * 1.2
    b.speed = 18
    b.heading = Math.atan2(b.vy, b.vx)
    b.turnRate = w
    b.shadow.cx = b.x
    b.shadow.cy = b.y
    if (!prev) view.prevBirds[c.slot] = { ...b, shadow: { ...b.shadow } }
  }
  for (const b of view.sim.birds) if (!view.prevBirds[b.slot]) view.prevBirds[b.slot] = { ...b, shadow: { ...b.shadow } }
}
