// Simulation d'Ombres : pas fixe de 1/RULES.tickHz s, pure, déterministe.
// Implémente le contrat Simulation de types.ts (GDD §4-§10).
//
// Ordre d'un tick :
//   1. entrées (appuis en tampon)        6. empreintes, cachette, nuit, Simoun
//   2. horloge, soleil, phases            7. verrouillages (chevrons)
//   3. ombres des tours, nuit             8. peinture (priorités multi-ombres)
//   4. décisions de piqué (lancer, feinte, annulations)
//   5. mouvements, piqués, touches, collisions
//                                         9. comptes, couronne, statistiques, gros vols

import { RULES, DEG } from './rules.ts'
import type {
  BirdInput,
  BirdSetup,
  SimConfig,
  SimEvent,
  SimSnapshot,
  Simulation,
  SunState,
  NightState,
} from './types.ts'
import { angDiff, clamp, expK, hash32, TAU } from './math.ts'
import { nextRandom } from './rng.ts'
import { getMap, type MapInfo } from './maps.ts'
import { ellipticRadius } from './arena.ts'
import { allocHulls, inHull, trunkAt, updateHulls, type ShadowHull } from './towers.ts'
import { createGrid, makeSpans, markAllDirty, markDirty, rasterHull, sweptEllipseSpans, type Spans } from './territory.ts'
import { altitudeAlpha, computeFootprint, cruiseSpeed, footprintSample } from './footprint.ts'
import { makeSun, phaseAt, phaseScale, setFixedSun, updateRoundSun } from './sun.ts'
import { ellipseSupport, frontPosition, isNightAt } from './night.ts'
import {
  HISTORY_TICKS,
  MAX_SLOTS,
  TRAIL_CAP,
  TRAIL_STRIDE,
  makeBird,
  makeBirdInternal,
  makeStats,
  type Bird,
  type BirdInternal,
  type Internal,
  type World,
} from './state.ts'
import { decodeWorld, encodeWorld } from './snapshot.ts'

const DT = 1 / RULES.tickHz
const LEVEL_PALE = RULES.levelPale
const LEVEL_STRONG = RULES.levelStrong

// ─── Données dérivées (non sérialisées) ────────────────────────────────────

interface Runtime {
  map: MapInfo
  hulls: ShadowHull[]
  spans: Spans
  claimStamp: Int32Array
  claimSlot: Uint8Array
  claimLevel: Uint8Array
  claimDist: Float64Array
  touched: Int32Array
  touchedCount: number
  stamp: number
  /** Index des oiseaux internes par slot. */
  bi: (BirdInternal | undefined)[]
  /** Positions au début du tick (piqués : test de contact balayé). */
  prevX: Float64Array
  prevY: Float64Array
  prevZ: Float64Array
  events: SimEvent[]
  /** Enveloppes candidates (préfiltre par oiseau). */
  hullScratch: Int32Array
  /** Distances du chasseur retenu par cible (chevron unique). */
  lockDist: Float64Array
  /** Segment balayé par le centre de chaque ombre ce tick (par code propriétaire). */
  segX0: Float64Array
  segY0: Float64Array
  segMX: Float64Array
  segMY: Float64Array
  segM2: Float64Array
  /** Compteurs du tick par code propriétaire : cellules peintes, volées, « tsk » et leur barycentre. */
  cPainted: Int32Array
  cStolen: Int32Array
  cTsk: Int32Array
  cTskX: Float64Array
  cTskY: Float64Array
  tmp: { x: number; y: number }
}

function makeRuntime(map: MapInfo, cols: number, rows: number): Runtime {
  const n = cols * rows
  const hulls = allocHulls(map.towers)
  return {
    map,
    hulls,
    spans: makeSpans(rows),
    claimStamp: new Int32Array(n),
    claimSlot: new Uint8Array(n),
    claimLevel: new Uint8Array(n),
    claimDist: new Float64Array(n),
    touched: new Int32Array(n),
    touchedCount: 0,
    stamp: 0,
    bi: new Array(MAX_SLOTS).fill(undefined),
    prevX: new Float64Array(MAX_SLOTS),
    prevY: new Float64Array(MAX_SLOTS),
    prevZ: new Float64Array(MAX_SLOTS),
    events: [],
    hullScratch: new Int32Array(Math.max(1, hulls.length)),
    lockDist: new Float64Array(MAX_SLOTS),
    segX0: new Float64Array(13),
    segY0: new Float64Array(13),
    segMX: new Float64Array(13),
    segMY: new Float64Array(13),
    segM2: new Float64Array(13),
    cPainted: new Int32Array(13),
    cStolen: new Int32Array(13),
    cTsk: new Int32Array(13),
    cTskX: new Float64Array(13),
    cTskY: new Float64Array(13),
    tmp: { x: 0, y: 0 },
  }
}

// ─── Création ──────────────────────────────────────────────────────────────

function mapFor(config: SimConfig): MapInfo {
  if (config.mode === 'lobby') {
    const arena = config.arenaOverride ?? { a: RULES.lobbyArenaA, b: RULES.lobbyArenaB }
    return getMap(config.mapId, config.birds.length, config.mirror ?? false, arena)
  }
  return getMap(config.mapId, config.birds.length, config.mirror ?? false, config.arenaOverride)
}

function makeNight(map: MapInfo): NightState {
  return { active: false, dirX: 1, dirY: 0, s: -1e6, jag: map.cliff.jag, jagSpan: map.cliff.jagSpan }
}

function initialSun(config: SimConfig): SunState {
  const T = config.sunSeconds
  if (config.mode === 'lobby') {
    const s = makeSun(0, T)
    setFixedSun(
      s,
      0,
      T,
      config.fixedSunElevDeg ?? RULES.lobbySunElevDeg,
      RULES.lobbySunAzDeg,
      RULES.lobbyPaletteElevDeg,
      'afternoon',
    )
    return s
  }
  return makeSun(startSunT(config), T)
}

function startSunT(config: SimConfig): number {
  return config.mode === 'round' && config.countdown ? -RULES.countdownSeconds : 0
}

function createWorld(config: SimConfig): { world: World; rt: Runtime } {
  const map = mapFor(config)
  const grid = createGrid(map.arena.a, map.arena.b, map.towers)
  const sun = initialSun(config)
  const state: World['state'] = {
    config,
    tick: 0,
    time: 0,
    sun,
    arena: { a: map.arena.a, b: map.arena.b, stormFrom: RULES.stormSoftFrom },
    towers: map.towers,
    birds: [],
    bySlot: new Array(MAX_SLOTS).fill(undefined),
    grid,
    night: makeNight(map),
    crownSlot: -1,
    timeScaleHint: 1,
    stats: new Array(MAX_SLOTS).fill(undefined),
    over: false,
  }
  const n = grid.cols * grid.rows
  const internal: Internal = {
    rng: hash32(config.seed >>> 0, 0x5eed),
    roundTick: 0,
    sunT: sun.t,
    birds: [],
    towerMask: new Uint8Array(n),
    nightMask: new Uint8Array(n),
    maskSunT: sun.t,
    nightCol: new Int32Array(grid.rows),
    owner60: new Uint8Array(n),
    owner60Taken: false,
    countHist: new Int32Array((HISTORY_TICKS + 1) * 13),
    stolenHist: new Float64Array((HISTORY_TICKS + 1) * MAX_SLOTS),
    histHead: 0,
    histCount: 0,
    crownCand: -1,
    crownCandSince: 0,
    nextCountdown: config.mode === 'round' && config.countdown ? RULES.countdownSeconds : -1,
    tenSecondsDone: false,
    lastSecondsNext: 5,
    nightDone: false,
    overDone: false,
    statMarks: 0,
    countsAt98: new Int32Array(13),
    lobbyResetAt: config.paintResetSeconds ?? RULES.lobbyResetSeconds,
    demoRestartAt: -1,
    loop: 0,
  }
  const world: World = { state, internal }
  const rt = makeRuntime(map, grid.cols, grid.rows)
  refreshTowerShade(world, rt, true)

  // apparitions régulières sur l'anneau (GDD §4.4)
  const setups = [...config.birds].sort((p, q) => p.slot - q.slot)
  const rot = nextRandom(internal) * TAU
  setups.forEach((setup, i) => {
    const theta = rot + (TAU * i) / Math.max(1, setups.length)
    spawnBird(world, rt, setup, theta, true)
  })
  if (config.mode === 'round' && config.countdown) for (const b of state.birds) placeOnRing(world, rt, b)
  return { world, rt }
}

/** Point de l'anneau d'apparition le plus proche de θ à au moins spawnMinTowerDist des fûts. */
function spawnAngle(world: World, theta: number): number {
  const { a, b } = world.state.arena
  const R = RULES.spawnRingFrac
  const clear = (th: number) => {
    const x = a * R * Math.cos(th)
    const y = b * R * Math.sin(th)
    for (const t of world.state.towers) {
      if (t.outside) continue
      if (Math.hypot(x - t.x, y - t.y) < RULES.spawnMinTowerDist + t.trunkRadius) return false
    }
    return true
  }
  for (let k = 0; k <= 30; k++) {
    for (const sgn of k === 0 ? [1] : [1, -1]) {
      const th = theta + sgn * k * 2 * DEG
      if (clear(th)) return th
    }
  }
  // Correctif agent bots : aucune place dégagée à ±60° (petites arènes encombrées, ex.
  // Parasols à 2 oiseaux où l'anneau passe sur le Grand Parasol). Au lieu de garder θ
  // (oiseau à 9 m d'un fût, boucle du compte à rebours à travers le fût), on prend le point
  // de l'anneau le plus dégagé des fûts et des oiseaux déjà posés, le plus près de θ.
  let best = theta
  let bestScore = -Infinity
  for (let k = 0; k < 180; k++) {
    const th = theta + k * 2 * DEG
    const x = a * R * Math.cos(th)
    const y = b * R * Math.sin(th)
    let clearance = Infinity
    for (const t of world.state.towers) if (!t.outside) clearance = Math.min(clearance, Math.hypot(x - t.x, y - t.y) - t.trunkRadius)
    for (const o of world.state.birds) clearance = Math.min(clearance, Math.hypot(x - o.x, y - o.y) - RULES.spawnMinTowerDist / 2)
    const score = Math.min(clearance, RULES.spawnMinTowerDist) - 0.02 * Math.abs(angDiff(th, theta)) / DEG
    if (score > bestScore) {
      bestScore = score
      best = th
    }
  }
  return best
}

function spawnBird(world: World, rt: Runtime, setup: BirdSetup, theta: number, splash: boolean): Bird {
  const st = world.state
  const { a, b } = st.arena
  const R = RULES.spawnRingFrac
  const th = spawnAngle(world, theta)
  const bird = makeBird(setup.slot, setup.assist)
  bird.x = a * R * Math.cos(th)
  bird.y = b * R * Math.sin(th)
  // cap tangent, sens antihoraire
  bird.heading = Math.atan2(b * R * Math.cos(th), -a * R * Math.sin(th))
  bird.speed = RULES.speedHigh
  bird.z = RULES.altHigh
  bird.vx = Math.cos(bird.heading) * bird.speed
  bird.vy = Math.sin(bird.heading) * bird.speed
  const bi = makeBirdInternal(setup.slot)
  bi.spawnX = bird.x
  bi.spawnY = bird.y
  bi.spawnHeading = bird.heading
  bi.prevStrong = false
  st.birds.push(bird)
  st.bySlot[setup.slot] = bird
  st.stats[setup.slot] = st.stats[setup.slot] ?? makeStats()
  world.internal.birds.push(bi)
  rt.bi[setup.slot] = bi
  computeFootprint(st.sun, bird.x, bird.y, bird.z, bird.shadow)
  if (splash) paintSplash(world, bird.slot, bird.x, bird.y)
  return bird
}

/** Tache forte de départ (GDD §4.4). */
function paintSplash(world: World, slot: number, x: number, y: number): void {
  const g = world.state.grid
  const r = RULES.spawnSplashRadius
  const code = slot + 1
  const i0 = Math.max(0, Math.floor((x - r - g.x0) / g.cellW))
  const i1 = Math.min(g.cols - 1, Math.ceil((x + r - g.x0) / g.cellW))
  const j0 = Math.max(0, Math.floor((y - r - g.y0) / g.cellH))
  const j1 = Math.min(g.rows - 1, Math.ceil((y + r - g.y0) / g.cellH))
  for (let j = j0; j <= j1; j++) {
    const cy = g.y0 + (j + 0.5) * g.cellH - y
    for (let i = i0; i <= i1; i++) {
      const cx = g.x0 + (i + 0.5) * g.cellW - x
      if (cx * cx + cy * cy > r * r) continue
      const k = j * g.cols + i
      if (!g.inArena[k]) continue
      setCell(world, k, i, j, code, LEVEL_STRONG, world.state.time)
    }
  }
}

/** Change le propriétaire et le niveau d'une cellule (comptes, version, sale). */
function setCell(world: World, k: number, i: number, j: number, code: number, level: number, when: number): void {
  const g = world.state.grid
  const o = g.owner[k]!
  if (o === code && g.level[k] === level) return
  if (o !== code) {
    g.counts[o]!--
    g.counts[code]!++
  }
  g.prevOwner[k] = o
  g.owner[k] = code
  g.level[k] = level
  g.changedAt[k] = when
  markDirty(g, i, j)
  g.version++
}

/**
 * Compte à rebours : pilote automatique. L'oiseau décrit une boucle complète à gauche
 * (vitesse haute, en countdownSeconds) qui le ramène à t = 0 sur son point
 * d'apparition, cap tangent : il ne s'approche jamais d'un fût (la boucle reste à
 * moins de 2 × 10 m du point d'apparition, lui-même à 25 m au moins des fûts).
 */
function placeOnRing(world: World, rt: Runtime, b: Bird): void {
  const bi = rt.bi[b.slot]!
  const omega = TAU / RULES.countdownSeconds
  const R = RULES.speedHigh / omega
  const h0 = bi.spawnHeading
  // Correctif agent bots : boucle à gauche, sauf si elle frôle un fût et que la boucle à
  // droite est plus dégagée (point d'apparition proche d'une tour dans les petites arènes).
  const side = loopSide(world, bi.spawnX, bi.spawnY, h0, R)
  const h = h0 + side * omega * Math.min(0, world.internal.sunT)
  const cx = bi.spawnX - side * R * Math.sin(h0)
  const cy = bi.spawnY + side * R * Math.cos(h0)
  b.x = cx + side * R * Math.sin(h)
  b.y = cy - side * R * Math.cos(h)
  b.z = RULES.altHigh
  b.vz = 0
  b.heading = angDiff(h, 0)
  b.turnRate = side * omega
  b.speed = RULES.speedHigh
  b.vx = Math.cos(h) * b.speed
  b.vy = Math.sin(h) * b.speed
  void rt
}

/** +1 (boucle à gauche) ou −1 (à droite) : la gauche, sauf si la droite évite mieux les fûts. */
function loopSide(world: World, x0: number, y0: number, h0: number, R: number): number {
  const clearance = (side: number): number => {
    const cx = x0 - side * R * Math.sin(h0)
    const cy = y0 + side * R * Math.cos(h0)
    let c = Infinity
    for (const t of world.state.towers) {
      if (t.outside) continue
      c = Math.min(c, Math.hypot(t.x - cx, t.y - cy) - R - t.trunkRadius)
    }
    return c
  }
  const left = clearance(1)
  if (left >= RULES.towerCollisionMargin) return 1
  return clearance(-1) > left ? -1 : 1
}

// ─── Ombres des tours, nuit ────────────────────────────────────────────────

/** Recalcule les enveloppes (chaque tick) et, si demandé, le masque figé des tours. */
function refreshTowerShade(world: World, rt: Runtime, rebuildMask: boolean): void {
  const st = world.state
  const I = world.internal
  const sun = st.sun
  updateHulls(st.towers, sun.cotE, sun.shadowDirX, sun.shadowDirY, rt.hulls)
  if (!rebuildMask) return
  rebuildTowerMask(world, rt)
  I.maskSunT = I.sunT
}

function rebuildTowerMask(world: World, rt: Runtime): void {
  const st = world.state
  const I = world.internal
  const g = st.grid
  // figé = nuit ∪ ombres des tours : on repart de la nuit (copie mémoire) et on rastérise les ombres
  I.towerMask.fill(0)
  g.frozen.set(I.nightMask)
  for (const h of rt.hulls) {
    rasterHull(g, h, I.towerMask)
    rasterHull(g, h, g.frozen)
  }
  // Simoun resserré (levier de réserve, désactivé par défaut) : le sable avalé est figé
  if (RULES.simounShrinkEnabled && st.arena.stormFrom < RULES.stormSoftFrom) {
    const hard = st.arena.stormFrom + (RULES.stormHardAt - RULES.stormSoftFrom)
    const a = st.arena.a
    const b = st.arena.b
    for (let j = 0; j < g.rows; j++) {
      const y = g.y0 + (j + 0.5) * g.cellH
      for (let i = 0; i < g.cols; i++) {
        const x = g.x0 + (i + 0.5) * g.cellW
        if (ellipticRadius(x, y, a, b) > hard) {
          I.towerMask[j * g.cols + i] = 1
          g.frozen[j * g.cols + i] = 1
        }
      }
    }
  }
  g.frozenVersion++
}

/** Front de nuit : activation, avancée, masque incrémental ligne par ligne. */
function updateNight(world: World): void {
  const st = world.state
  const I = world.internal
  const night = st.night
  const cfg = st.config
  if (cfg.mode === 'lobby') return
  const T = cfg.sunSeconds
  const t0 = RULES.greatShadowAt * phaseScale(T)
  if (I.sunT < t0) return
  if (!night.active) {
    night.active = true
    night.dirX = st.sun.shadowDirX
    night.dirY = st.sun.shadowDirY
    I.nightCol.fill(0)
  }
  const ext = ellipseSupport(st.arena.a, st.arena.b, night.dirX, night.dirY)
  night.s = frontPosition(I.sunT, T, ext)
  const g = st.grid
  let changed = false
  if (night.dirX > 0.3) {
    for (let j = 0; j < g.rows; j++) {
      const y = g.y0 + (j + 0.5) * g.cellH
      let i = I.nightCol[j]!
      const row = j * g.cols
      while (i < g.cols) {
        const x = g.x0 + (i + 0.5) * g.cellW
        if (!isNightAt(night, x, y)) break
        I.nightMask[row + i] = 1
        g.frozen[row + i] = 1
        i++
        changed = true
      }
      I.nightCol[j] = i
    }
  } else {
    // direction inhabituelle : balayage complet
    for (let k = 0; k < g.frozen.length; k++) {
      if (I.nightMask[k]) continue
      const i = k % g.cols
      const j = (k - i) / g.cols
      if (isNightAt(night, g.x0 + (i + 0.5) * g.cellW, g.y0 + (j + 0.5) * g.cellH)) {
        I.nightMask[k] = 1
        g.frozen[k] = 1
        changed = true
      }
    }
  }
  if (changed) g.frozenVersion++
}

// ─── Horloge et phases ─────────────────────────────────────────────────────

function emit(rt: Runtime, e: SimEvent): void {
  rt.events.push(e)
}

/** Manche active : la peinture, les piqués et les statistiques tournent. */
function isActive(world: World): boolean {
  const cfg = world.state.config
  if (cfg.mode === 'lobby') return true
  const t = world.internal.sunT
  return t >= 0 && t < cfg.sunSeconds && world.internal.demoRestartAt < 0
}

function advanceClock(world: World, rt: Runtime): void {
  const st = world.state
  const I = world.internal
  const cfg = st.config
  I.roundTick++
  if (cfg.mode === 'lobby') {
    // soleil fixe : seule l'horloge avance
    I.sunT = st.time
    st.sun.t = st.time
    if (st.time >= I.lobbyResetAt) {
      I.lobbyResetAt += cfg.paintResetSeconds ?? RULES.lobbyResetSeconds
      resetTerritory(world)
      emit(rt, { type: 'territoryReset' })
    }
    return
  }
  const T = cfg.sunSeconds
  const prevPhase = st.sun.phase
  I.sunT = startSunT(cfg) + I.roundTick / RULES.tickHz
  const t = I.sunT
  updateRoundSun(st.sun, Math.min(t, T + RULES.nightHoldSeconds + 1e-6), T)
  st.sun.t = t
  st.sun.phase = phaseAt(t, T)
  const k = phaseScale(T)

  // compte à rebours : 3, 2, 1, 0 (« Envol ! »)
  while (I.nextCountdown >= 0 && t >= -I.nextCountdown - 1e-9) {
    emit(rt, { type: 'countdown', n: I.nextCountdown })
    I.nextCountdown--
  }
  if (st.sun.phase !== prevPhase) emit(rt, { type: 'phase', phase: st.sun.phase })
  if (!I.tenSecondsDone && t >= RULES.tenSecondsAt * k) {
    I.tenSecondsDone = true
    emit(rt, { type: 'tenSeconds' })
  }
  while (I.lastSecondsNext >= 1 && t >= T - I.lastSecondsNext - 1e-9) {
    emit(rt, { type: 'lastSeconds', n: I.lastSecondsNext })
    I.lastSecondsNext--
  }
  st.timeScaleHint = t >= T - 1 && t < T ? RULES.lastSecondTimeScale : 1
  // Simoun resserré (réserve) entre 40 et 98 s
  if (RULES.simounShrinkEnabled) {
    const f = clamp((t - 40 * k) / ((RULES.greatShadowAt - 40) * k), 0, 1)
    st.arena.stormFrom = RULES.stormSoftFrom - (RULES.stormSoftFrom - RULES.simounShrinkTo * RULES.stormSoftFrom) * f
  }
}

// ─── Entrées ───────────────────────────────────────────────────────────────

function readInput(b: Bird, bi: BirdInternal, input: BirdInput | undefined): void {
  const dirX = input?.dirX ?? 0
  const dirY = input?.dirY ?? 0
  const len = Math.hypot(dirX, dirY)
  const k = len > 1 ? 1 / len : 1
  bi.stickX = Number.isFinite(dirX) ? dirX * k : 0
  bi.stickY = Number.isFinite(dirY) ? dirY * k : 0
  bi.diveHeld = !!input?.dive
  const dp = input?.divePresses ?? bi.divePresses
  const fp = input?.flapPresses ?? bi.flapPresses
  if (dp !== bi.divePresses) {
    if (dp > bi.divePresses) {
      bi.diveBuffer = RULES.inputBufferSeconds
      bi.sinceDivePress = 0
    }
    bi.divePresses = dp
  }
  if (fp !== bi.flapPresses) {
    if (fp > bi.flapPresses) bi.flapBuffer = RULES.inputBufferSeconds
    bi.flapPresses = fp
  }
  b.targetLow = bi.diveHeld || bi.sinceDivePress < RULES.inputBufferSeconds
}

/** PLONGER est-il considéré comme maintenu (un appui bref compte pendant inputBufferSeconds) ? */
function diveHeld(bi: BirdInternal): boolean {
  return bi.diveHeld || bi.sinceDivePress < RULES.inputBufferSeconds
}

// ─── Piqué : décisions ─────────────────────────────────────────────────────

function isTargetable(t: Bird): boolean {
  return t.stun <= 0 && t.immune <= 0 && !t.hidden && !t.inNight && t.dive === 'none'
}

function launchDive(world: World, rt: Runtime, a: Bird, bi: BirdInternal, target: Bird): void {
  a.dive = 'windup'
  a.diveTarget = target.slot
  a.diveTime = 0
  a.lockTarget = target.slot
  bi.commitElapsed = 0
  bi.targetFlapped = false
  bi.pendingHit = -1
  bi.diveBuffer = 0
  world.state.stats[a.slot]!.divesStarted++
  emit(rt, { type: 'diveWindup', hunter: a.slot, target: target.slot })
}

function endDive(rt: Runtime, a: Bird, bi: BirdInternal): void {
  a.dive = 'none'
  a.diveTarget = -1
  a.diveTime = 0
  bi.pendingHit = -1
  a.diveCooldown = Math.max(a.diveCooldown, RULES.diveCooldown)
  if (a.lockTarget >= 0) {
    emit(rt, { type: 'unlock', hunter: a.slot, target: a.lockTarget })
    a.lockTarget = -1
    bi.lockAge = 0
  }
}

function cancelDive(world: World, rt: Runtime, a: Bird, bi: BirdInternal, reason: 'feint' | 'hidden' | 'immune' | 'lost'): void {
  emit(rt, { type: 'diveCancel', hunter: a.slot, target: a.diveTarget, reason })
  if (reason === 'feint') world.state.stats[a.slot]!.feints++
  endDive(rt, a, bi)
}

/** Lancements, feintes et annulations (avant le mouvement). */
function diveDecisions(world: World, rt: Runtime, active: boolean): void {
  const st = world.state
  for (const a of st.birds) {
    const bi = rt.bi[a.slot]!
    if (a.dive !== 'none') {
      const target = st.bySlot[a.diveTarget]
      if (!active || !target) {
        cancelDive(world, rt, a, bi, 'lost')
        continue
      }
      if (bi.pendingHit >= 0) continue // touche en attente : résolue au mouvement
      if (target.hidden || target.inNight) {
        cancelDive(world, rt, a, bi, 'hidden')
        continue
      }
      if (target.stun > 0 || target.immune > 0) {
        cancelDive(world, rt, a, bi, 'immune')
        continue
      }
      if (a.dive !== 'committed' && !diveHeld(bi)) {
        cancelDive(world, rt, a, bi, 'feint')
        continue
      }
      continue
    }
    if (!active || a.stun > 0 || a.diveCooldown > 0 || a.lockTarget < 0) continue
    const target = st.bySlot[a.lockTarget]
    if (!target || !isTargetable(target)) continue
    // appui sur PLONGER, ou PLONGER maintenu quand la cible devient verrouillable (GDD §8.2)
    const pressed = bi.diveBuffer > 0
    const fellOn = bi.diveHeld && bi.lockAge === 1
    if (pressed || fellOn) launchDive(world, rt, a, bi, target)
  }
}

// ─── Mouvement ─────────────────────────────────────────────────────────────

const _c = { x: 0, y: 0 }

/** Évitement des fûts (GDD §5.3) : dévie le cap voulu si un impact est prévu. */
function avoidTowers(world: World, b: Bird, want: number): number {
  const maxDev = (b.assist ? RULES.assistAvoidDeg : RULES.towerAvoidAssistDeg) * DEG
  const look = Math.max(b.speed, 1) * RULES.towerAvoidLookahead
  let result = want
  for (const t of world.state.towers) {
    if (t.outside) continue
    const r = trunkAt(t, b.z, _c)
    if (r <= 0) continue
    const R = r + RULES.towerCollisionMargin
    const ex = _c.x - b.x
    const ey = _c.y - b.y
    const dist = Math.hypot(ex, ey)
    if (dist <= R || dist > look + R) continue
    const cx = Math.cos(result)
    const cy = Math.sin(result)
    const proj = ex * cx + ey * cy
    if (proj <= 0) continue
    const perp2 = dist * dist - proj * proj
    if (perp2 >= R * R) continue
    const hitDist = proj - Math.sqrt(R * R - perp2)
    if (hitDist > look) continue
    const half = Math.asin(Math.min(1, R / dist)) + 1 * DEG
    const center = Math.atan2(ey, ex)
    const d1 = angDiff(center + half, result)
    const d2 = angDiff(center - half, result)
    const dev = Math.abs(d1) < Math.abs(d2) ? d1 : d2
    if (Math.abs(dev) <= maxDev) result += dev
  }
  return result
}

/** Aide au vol : évitement du Simoun (30° au plus). */
function avoidStorm(world: World, b: Bird, want: number): number {
  const { a, b: bb, stormFrom } = world.state.arena
  const look = Math.max(b.speed, 1) * RULES.assistStormLookahead
  const fx = b.x + Math.cos(want) * look
  const fy = b.y + Math.sin(want) * look
  if (ellipticRadius(fx, fy, a, bb) <= stormFrom) return want
  const toCenter = Math.atan2(-b.y, -b.x)
  const maxDev = RULES.assistAvoidDeg * DEG
  return want + clamp(angDiff(toCenter, want), -maxDev, maxDev)
}

function tryFlap(world: World, rt: Runtime, b: Bird, bi: BirdInternal, dirX: number, dirY: number): boolean {
  if (b.stun > 0 || b.dive !== 'none' || b.flapCooldown > 0) return false
  let dx = dirX
  let dy = dirY
  const len = Math.hypot(dx, dy)
  if (len <= RULES.stickDeadzone) {
    dx = Math.cos(b.heading)
    dy = Math.sin(b.heading)
  } else {
    dx /= len
    dy /= len
  }
  b.flap = RULES.flapDuration
  b.flapCooldown = RULES.flapCooldown
  b.flapDirX = dx
  b.flapDirY = dy
  bi.fvx = dx * RULES.flapImpulse
  bi.fvy = dy * RULES.flapImpulse
  bi.flapBuffer = 0
  bi.autoFlap = -1
  emit(rt, { type: 'flap', slot: b.slot })
  // esquive : les chasseurs en piqué sur cet oiseau le notent ; une touche en attente (grâce de latence) est annulée
  let underAttack = false
  for (const h of world.state.birds) {
    if (h.dive === 'none' || h.diveTarget !== b.slot) continue
    const hi = rt.bi[h.slot]!
    hi.targetFlapped = true
    underAttack = true
    if (hi.pendingHit >= 0) hi.pendingHit = -2 // marqueur : touche annulée par l'esquive
  }
  // compensation de latence (GDD §8.6) : sous un piqué, le coup d'aile d'un téléphone est
  // appliqué à son horodatage client, soit latencyGrace plus tôt (même déplacement total)
  if (underAttack && bi.latencyGrace > 0) {
    const g = Math.min(bi.latencyGrace, RULES.flapDuration)
    b.x += dx * RULES.flapImpulse * g
    b.y += dy * RULES.flapImpulse * g
    b.flap = RULES.flapDuration - g
  }
  return true
}

/** Mouvement d'un oiseau piloté (ni en piqué, ni décroché). */
function moveControlled(world: World, rt: Runtime, b: Bird, bi: BirdInternal): void {
  const st = world.state
  // pilotage : cap absolu, zone morte = on garde le cap
  const stickLen = Math.hypot(bi.stickX, bi.stickY)
  let want = stickLen > RULES.stickDeadzone ? Math.atan2(bi.stickY, bi.stickX) : b.heading
  want = avoidTowers(world, b, want)
  if (b.assist) want = avoidStorm(world, b, want)
  const alpha = altitudeAlpha(b.z)
  const maxRate = (RULES.turnLowDegPerS + (RULES.turnHighDegPerS - RULES.turnLowDegPerS) * alpha) * DEG
  const acc = RULES.yawAccelDegPerS2 * DEG
  const d = angDiff(want, b.heading)
  const absD = Math.abs(d)
  const desired = Math.sign(d) * Math.min(maxRate, Math.sqrt(2 * acc * absD), absD / DT)
  bi.ctrlTurnRate += clamp(desired - bi.ctrlTurnRate, -acc * DT, acc * DT)
  let heading = b.heading + bi.ctrlTurnRate * DT
  // Simoun : cap tiré vers le centre (GDD §4.3)
  let stormRate = 0
  const rho = ellipticRadius(b.x, b.y, st.arena.a, st.arena.b)
  if (rho > st.arena.stormFrom) {
    const pull = angDiff(Math.atan2(-b.y, -b.x), heading)
    const turn = clamp(pull, -RULES.stormTurnDegPerS * DEG * DT, RULES.stormTurnDegPerS * DEG * DT)
    heading += turn
    stormRate = turn / DT
  }
  b.heading = angDiff(heading, 0)
  b.turnRate = bi.ctrlTurnRate + stormRate
  // altitude : PLONGER maintenu = bas, relâché = haut
  const targetZ = b.targetLow ? RULES.altLow : RULES.altHigh
  if (b.z > targetZ) {
    const nz = Math.max(targetZ, b.z - RULES.descendRate * DT)
    b.vz = (nz - b.z) / DT
    b.z = nz
  } else if (b.z < targetZ) {
    const nz = Math.min(targetZ, b.z + RULES.climbRate * DT)
    b.vz = (nz - b.z) / DT
    b.z = nz
  } else b.vz = 0
  // vitesse de croisière lissée
  b.speed += (cruiseSpeed(b.z) - b.speed) * expK(DT, RULES.speedTau)
  // coup d'aile
  if (bi.flapBuffer > 0) tryFlap(world, rt, b, bi, bi.stickX, bi.stickY)
  if (bi.autoFlap >= 0) {
    bi.autoFlap -= DT
    if (bi.autoFlap < 0) tryFlap(world, rt, b, bi, bi.autoFlapX, bi.autoFlapY)
  }
  integrate(b, bi)
}

/** Intègre la position (croisière + coup d'aile + poussées), puis amortit les vitesses additionnelles. */
function integrate(b: Bird, bi: BirdInternal): void {
  if (b.flap > 0) {
    bi.fvx = b.flapDirX * RULES.flapImpulse
    bi.fvy = b.flapDirY * RULES.flapImpulse
  }
  b.vx = Math.cos(b.heading) * b.speed + bi.fvx + bi.pvx
  b.vy = Math.sin(b.heading) * b.speed + bi.fvy + bi.pvy
  b.x += b.vx * DT
  b.y += b.vy * DT
  const k = expK(DT, RULES.speedTau)
  if (b.flap <= 0) {
    bi.fvx -= bi.fvx * k
    bi.fvy -= bi.fvy * k
  }
  bi.pvx -= bi.pvx * k
  bi.pvy -= bi.pvy * k
}

/** Décroché : dérive à stunDriftSpeed, retour au ras du sable, aucun contrôle. */
function moveStunned(b: Bird, bi: BirdInternal): void {
  const target = RULES.altLow
  const dz = clamp(target - b.z, -RULES.descendRate * DT, RULES.descendRate * DT)
  b.z += dz
  b.vz = dz / DT
  b.speed += (RULES.stunDriftSpeed - b.speed) * expK(DT, RULES.speedTau)
  bi.ctrlTurnRate = 0
  b.turnRate = 0
  integrate(b, bi)
}

const _pred = { x: 0, y: 0 }

/** Position de la cible extrapolée sur un arc (vitesse et lacet constants), GDD §8.3. */
function predictTarget(t: Bird, tt: number, out: { x: number; y: number }): { x: number; y: number } {
  const om = t.turnRate
  const v = t.speed
  if (Math.abs(om) < 1e-3) {
    out.x = t.x + v * Math.cos(t.heading) * tt
    out.y = t.y + v * Math.sin(t.heading) * tt
  } else {
    out.x = t.x + (v / om) * (Math.sin(t.heading + om * tt) - Math.sin(t.heading))
    out.y = t.y + (v / om) * (-Math.cos(t.heading + om * tt) + Math.cos(t.heading))
  }
  return out
}

/** Mouvement d'un chasseur en piqué (prise d'élan, chute guidée, engagement balistique). */
function moveDiving(world: World, rt: Runtime, a: Bird, bi: BirdInternal): void {
  const st = world.state
  const target = st.bySlot[a.diveTarget]!
  a.diveTime += DT
  if (a.dive === 'windup') {
    // prise d'élan : le chasseur se cabre et s'oriente vers sa cible
    const h = Math.atan2(target.y - a.y, target.x - a.x)
    a.turnRate = clamp(angDiff(h, a.heading) / DT, -10, 10)
    a.heading = h
    a.speed = cruiseSpeed(a.z) * RULES.diveWindupSpeedFactor
    a.vz = 0
    a.vx = Math.cos(h) * a.speed
    a.vy = Math.sin(h) * a.speed
    a.x += a.vx * DT
    a.y += a.vy * DT
    if (a.diveTime >= RULES.diveWindup - 1e-9) {
      a.dive = 'guided'
      a.speed = RULES.diveHSpeed
    }
    bi.fvx = bi.fvy = bi.pvx = bi.pvy = 0
    return
  }
  if (a.dive === 'guided') {
    // interception à diveHSpeed vers le point prédit sur l'arc de la cible
    let tau = Math.hypot(target.x - a.x, target.y - a.y) / RULES.diveHSpeed
    for (let it = 0; it < 6; it++) {
      predictTarget(target, tau, _pred)
      tau = Math.hypot(_pred.x - a.x, _pred.y - a.y) / RULES.diveHSpeed
    }
    predictTarget(target, tau, _pred)
    const want = Math.atan2(_pred.y - a.y, _pred.x - a.x)
    const maxTurn = RULES.diveTurnDegPerS * DEG * DT
    const turn = clamp(angDiff(want, a.heading), -maxTurn, maxTurn)
    a.heading = angDiff(a.heading + turn, 0)
    a.turnRate = turn / DT
    a.vz = -(a.z - target.z) / Math.max(tau, 0.05)
    a.speed = RULES.diveHSpeed
    a.vx = Math.cos(a.heading) * a.speed
    a.vy = Math.sin(a.heading) * a.speed
    a.x += a.vx * DT
    a.y += a.vy * DT
    a.z = Math.max(1, a.z + a.vz * DT)
    if (tau <= RULES.diveCommitLead) {
      // engagement (« clac ») : trajectoire rectiligne vers le point prédit, au moins diveCommitLead
      const tc = Math.max(tau, RULES.diveCommitLead)
      predictTarget(target, tc, _pred)
      bi.commitVx = (_pred.x - a.x) / tc
      bi.commitVy = (_pred.y - a.y) / tc
      bi.commitVz = -(a.z - target.z) / tc
      bi.commitDur = tc
      bi.commitElapsed = 0
      a.dive = 'committed'
      emit(rt, { type: 'diveCommit', hunter: a.slot, target: target.slot })
      // aide au vol : coup d'aile automatique une fois sur deux s'il est rechargé
      const ti = rt.bi[target.slot]!
      if (target.assist && target.flapCooldown <= 0 && nextRandom(world.internal) < RULES.assistAutoFlapChance) {
        ti.autoFlap = RULES.assistAutoFlapDelay
        // perpendiculaire à l'approche, du côté du centre de l'arène
        const ax = target.x - a.x
        const ay = target.y - a.y
        const L = Math.hypot(ax, ay) || 1
        let px = -ay / L
        let py = ax / L
        if (px * -target.x + py * -target.y < 0) {
          px = -px
          py = -py
        }
        ti.autoFlapX = px
        ti.autoFlapY = py
      }
    }
    bi.fvx = bi.fvy = bi.pvx = bi.pvy = 0
    return
  }
  // engagé : balistique
  bi.commitElapsed += DT
  a.vx = bi.commitVx
  a.vy = bi.commitVy
  a.vz = bi.commitVz
  a.speed = Math.hypot(a.vx, a.vy)
  if (a.speed > 0.1) {
    const h = Math.atan2(a.vy, a.vx)
    a.turnRate = angDiff(h, a.heading) / DT
    a.heading = h
  }
  a.x += a.vx * DT
  a.y += a.vy * DT
  a.z = Math.max(1, a.z + a.vz * DT)
  bi.fvx = bi.fvy = bi.pvx = bi.pvy = 0
}

/** Distance minimale entre deux segments de trajectoire parcourus pendant le tick. */
function sweptContact(rt: Runtime, a: Bird, t: Bird): { dist: number; dz: number } {
  const r0x = rt.prevX[a.slot]! - rt.prevX[t.slot]!
  const r0y = rt.prevY[a.slot]! - rt.prevY[t.slot]!
  const r0z = rt.prevZ[a.slot]! - rt.prevZ[t.slot]!
  const r1x = a.x - t.x
  const r1y = a.y - t.y
  const r1z = a.z - t.z
  const ex = r1x - r0x
  const ey = r1y - r0y
  const ez = r1z - r0z
  const e2 = ex * ex + ey * ey + ez * ez
  let s = e2 > 1e-12 ? -(r0x * ex + r0y * ey + r0z * ez) / e2 : 1
  s = clamp(s, 0, 1)
  const dx = r0x + ex * s
  const dy = r0y + ey * s
  const dz = r0z + ez * s
  _contact.dist = Math.sqrt(dx * dx + dy * dy + dz * dz)
  _contact.dz = dz
  return _contact
}
const _contact = { dist: 0, dz: 0 }

/** Résolution des piqués après le mouvement : touche, raté, grâce de latence. */
function resolveDives(world: World, rt: Runtime): void {
  const st = world.state
  for (const a of st.birds) {
    if (a.dive === 'none' || a.dive === 'windup') continue
    const bi = rt.bi[a.slot]!
    const target = st.bySlot[a.diveTarget]
    if (!target) continue
    if (bi.pendingHit === -2) {
      // la cible a battu des ailes pendant la grâce de latence : esquive
      resolveMiss(world, rt, a, bi, target, true)
      continue
    }
    if (bi.pendingHit >= 0) {
      if (target.stun > 0) {
        // un autre chasseur l'a touchée pendant la grâce : ce piqué s'annule
        cancelDive(world, rt, a, bi, 'immune')
        continue
      }
      bi.pendingHit -= DT
      if (bi.pendingHit <= 1e-9) resolveHit(world, rt, a, bi, target, bi.pendingX, bi.pendingY, bi.pendingZ)
      continue
    }
    const c = sweptContact(rt, a, target)
    if (c.dist <= RULES.diveHitRadius && c.dz >= -RULES.diveHitMaxBelow) {
      const ti = rt.bi[target.slot]!
      if (ti.latencyGrace > 0) {
        bi.pendingHit = ti.latencyGrace
        bi.pendingX = target.x
        bi.pendingY = target.y
        bi.pendingZ = target.z
      } else resolveHit(world, rt, a, bi, target, target.x, target.y, target.z)
      continue
    }
    if (a.z < target.z - RULES.diveMissBelow || a.diveTime >= RULES.diveWindup + RULES.diveMaxTime - 1e-9) {
      resolveMiss(world, rt, a, bi, target, bi.targetFlapped)
    }
  }
}

function resolveHit(world: World, rt: Runtime, a: Bird, bi: BirdInternal, v: Bird, x: number, y: number, z: number): void {
  const st = world.state
  const vi = rt.bi[v.slot]!
  const wasCrown = v.crown
  const seconds = wasCrown ? RULES.trailStealCrownSeconds : RULES.trailStealSeconds
  const stolen = stealTrail(world, rt, v, a, seconds)
  st.stats[a.slot]!.hits++
  st.stats[v.slot]!.gotHit++
  emit(rt, { type: 'diveHit', hunter: a.slot, target: v.slot, x, y, z, stolenCells: stolen, crown: wasCrown })
  // la victime décroche (son propre piqué éventuel s'arrête)
  if (v.dive !== 'none') cancelDive(world, rt, v, vi, 'lost')
  if (v.lockTarget >= 0) {
    emit(rt, { type: 'unlock', hunter: v.slot, target: v.lockTarget })
    v.lockTarget = -1
    vi.lockAge = 0
  }
  v.stun = RULES.stunHit
  v.stunKind = 'hit'
  v.flap = 0
  vi.fvx = vi.fvy = 0
  vi.autoFlap = -1
  vi.immunityPending = v.assist ? RULES.assistImmunity : RULES.immunityAfterStun
  vi.trailCount = 0
  vi.prevFp = false
  // le chasseur rebondit et garde sa vitesse
  a.z = Math.min(RULES.altHigh, a.z + RULES.diveReboundDz)
  a.speed = Math.max(a.speed, cruiseSpeed(a.z))
  endDive(rt, a, bi)
}

function resolveMiss(world: World, rt: Runtime, a: Bird, bi: BirdInternal, v: Bird, dodged: boolean): void {
  const st = world.state
  st.stats[a.slot]!.misses++
  if (dodged) st.stats[v.slot]!.dodges++
  emit(rt, { type: 'diveMiss', hunter: a.slot, target: v.slot, dodged, x: a.x, y: a.y })
  endDive(rt, a, bi)
  // « Raté, c'est toi qui décroches » : au ras du sable, recharge après le décrochage
  a.stun = RULES.missStun
  a.stunKind = 'miss'
  a.diveCooldown = RULES.missStun + RULES.diveCooldown
  bi.prevFp = false
}

/** Collisions avec les fûts (GDD §5.3) : glissade tangentielle, ralentissement. */
function collideTowers(world: World, rt: Runtime, b: Bird, bi: BirdInternal): void {
  for (const t of world.state.towers) {
    if (t.outside) continue
    const r = trunkAt(t, b.z, _c)
    if (r <= 0) continue
    const R = r + RULES.towerCollisionMargin
    const dx = b.x - _c.x
    const dy = b.y - _c.y
    const d2 = dx * dx + dy * dy
    if (d2 >= R * R) continue
    const d = Math.sqrt(d2) || 1e-6
    const nx = d2 > 1e-12 ? dx / d : Math.cos(b.heading + Math.PI)
    const ny = d2 > 1e-12 ? dy / d : Math.sin(b.heading + Math.PI)
    b.x = _c.x + nx * R
    b.y = _c.y + ny * R
    const hx = Math.cos(b.heading)
    const hy = Math.sin(b.heading)
    if (hx * nx + hy * ny < 0) {
      let tx = -ny
      let ty = nx
      if (hx * tx + hy * ty < 0) {
        tx = -tx
        ty = -ty
      }
      b.heading = Math.atan2(ty, tx)
    }
    // on retire la composante entrante des vitesses additionnelles
    const fin = bi.fvx * nx + bi.fvy * ny
    if (fin < 0) {
      bi.fvx -= fin * nx
      bi.fvy -= fin * ny
    }
    const pin = bi.pvx * nx + bi.pvy * ny
    if (pin < 0) {
      bi.pvx -= pin * nx
      bi.pvy -= pin * ny
    }
    if (bi.towerBumpCooldown <= 0) {
      bi.towerBumpCooldown = RULES.towerBumpRepeatSeconds
      b.speed *= 1 - RULES.towerSlideSlow
      b.towerSlide = RULES.towerSlideTime
      emit(rt, { type: 'towerBump', slot: b.slot, tower: t.id })
    }
  }
  void rt
}

/** Collisions entre oiseaux (GDD §5.3) : poussée latérale, sans effet de jeu. */
function collideBirds(world: World, rt: Runtime): void {
  const birds = world.state.birds
  for (let i = 0; i < birds.length; i++) {
    const p = birds[i]!
    if (p.stun > 0 || p.dive !== 'none') continue
    for (let j = i + 1; j < birds.length; j++) {
      const q = birds[j]!
      if (q.stun > 0 || q.dive !== 'none') continue
      if (Math.abs(p.z - q.z) >= RULES.bumpDz) continue
      const dx = q.x - p.x
      const dy = q.y - p.y
      const d2 = dx * dx + dy * dy
      if (d2 >= RULES.bumpDist * RULES.bumpDist) continue
      const d = Math.sqrt(d2)
      const ux = d > 1e-6 ? dx / d : Math.cos(p.heading + Math.PI / 2)
      const uy = d > 1e-6 ? dy / d : Math.sin(p.heading + Math.PI / 2)
      const pi = rt.bi[p.slot]!
      const qi = rt.bi[q.slot]!
      // poussée d'au moins bumpImpulse, qui s'écarte l'un de l'autre
      const pAlong = pi.pvx * -ux + pi.pvy * -uy
      if (pAlong < RULES.bumpImpulse) {
        pi.pvx += -ux * (RULES.bumpImpulse - pAlong)
        pi.pvy += -uy * (RULES.bumpImpulse - pAlong)
      }
      const qAlong = qi.pvx * ux + qi.pvy * uy
      if (qAlong < RULES.bumpImpulse) {
        qi.pvx += ux * (RULES.bumpImpulse - qAlong)
        qi.pvy += uy * (RULES.bumpImpulse - qAlong)
      }
      if (pi.bumpCooldown[q.slot]! <= 0) {
        pi.bumpCooldown[q.slot] = RULES.bumpRepeatSeconds
        qi.bumpCooldown[p.slot] = RULES.bumpRepeatSeconds
        emit(rt, { type: 'bump', a: p.slot, b: q.slot, x: (p.x + q.x) / 2, y: (p.y + q.y) / 2, z: (p.z + q.z) / 2 })
      }
    }
  }
}

/** Minuteries des oiseaux (début de tick). */
function tickTimers(world: World, rt: Runtime): void {
  for (const b of world.state.birds) {
    const bi = rt.bi[b.slot]!
    bi.diveBuffer = Math.max(0, bi.diveBuffer - DT)
    bi.flapBuffer = Math.max(0, bi.flapBuffer - DT)
    bi.sinceDivePress = Math.min(1e3, bi.sinceDivePress + DT)
    bi.tskCooldown = Math.max(0, bi.tskCooldown - DT)
    bi.towerBumpCooldown = Math.max(0, bi.towerBumpCooldown - DT)
    for (let s = 0; s < MAX_SLOTS; s++) if (bi.bumpCooldown[s]! > 0) bi.bumpCooldown[s] = Math.max(0, bi.bumpCooldown[s]! - DT)
    if (b.flap > 0) b.flap = Math.max(0, b.flap - DT)
    b.towerSlide = Math.max(0, b.towerSlide - DT)
    if (b.flapCooldown > 0) {
      b.flapCooldown = Math.max(0, b.flapCooldown - DT)
      if (b.flapCooldown === 0) emit(rt, { type: 'flapReady', slot: b.slot })
    }
    if (b.diveCooldown > 0) b.diveCooldown = Math.max(0, b.diveCooldown - DT)
    if (b.immune > 0) {
      b.immune = Math.max(0, b.immune - DT)
      if (b.immune === 0) emit(rt, { type: 'immuneEnd', slot: b.slot })
    }
    if (b.stun > 0) {
      b.stun = Math.max(0, b.stun - DT)
      if (b.stun === 0) {
        const kind = b.stunKind
        b.stunKind = 'none'
        emit(rt, { type: 'stunEnd', slot: b.slot })
        if (kind === 'hit' && bi.immunityPending > 0) {
          b.immune = bi.immunityPending
          bi.immunityPending = 0
        }
      }
    }
  }
}

function moveBirds(world: World, rt: Runtime): void {
  const st = world.state
  const I = world.internal
  const countdown = st.config.mode === 'round' && I.sunT < 0
  for (const b of st.birds) {
    rt.prevX[b.slot] = b.x
    rt.prevY[b.slot] = b.y
    rt.prevZ[b.slot] = b.z
  }
  for (const b of st.birds) {
    const bi = rt.bi[b.slot]!
    if (countdown) {
      placeOnRing(world, rt, b)
      continue
    }
    if (b.dive !== 'none') moveDiving(world, rt, b, bi)
    else if (b.stun > 0) moveStunned(b, bi)
    else moveControlled(world, rt, b, bi)
  }
  resolveDives(world, rt)
  if (countdown) return
  collideBirds(world, rt)
  const { a, b: bb } = st.arena
  for (const b of st.birds) {
    const bi = rt.bi[b.slot]!
    if (b.dive === 'none') collideTowers(world, rt, b, bi)
    // mur dur du Simoun
    const rho = ellipticRadius(b.x, b.y, a, bb)
    if (rho > RULES.stormHardAt * (st.arena.stormFrom / RULES.stormSoftFrom)) {
      const k = (RULES.stormHardAt * (st.arena.stormFrom / RULES.stormSoftFrom)) / rho
      b.x *= k
      b.y *= k
    }
  }
}

// ─── Empreintes, cachette, nuit, Simoun ────────────────────────────────────

function updateVisibility(world: World, rt: Runtime, active: boolean): void {
  const st = world.state
  const sun = st.sun
  const hulls = rt.hulls
  const night = st.night
  const scratch = rt.hullScratch
  const n = RULES.hideSamplePoints
  for (const b of st.birds) {
    const bi = rt.bi[b.slot]!
    const fp = computeFootprint(sun, b.x, b.y, b.z, b.shadow)
    b.strong = fp.strong
    // préfiltre des enveloppes par boîte englobante de l'empreinte
    const ex = Math.abs(fp.rAlong * sun.shadowDirX) + Math.abs(fp.r * sun.shadowDirY)
    const ey = Math.abs(fp.rAlong * sun.shadowDirY) + Math.abs(fp.r * sun.shadowDirX)
    let m = 0
    for (let h = 0; h < hulls.length; h++) {
      const hl = hulls[h]!
      if (hl.maxX < fp.cx - ex || hl.minX > fp.cx + ex || hl.maxY < fp.cy - ey || hl.minY > fp.cy + ey) continue
      scratch[m++] = h
    }
    let shaded = 0
    let dark = 0
    for (let i = 0; i < n; i++) {
      const p = footprintSample(fp, sun, i, rt.tmp)
      const inNight = isNightAt(night, p.x, p.y)
      if (inNight) {
        dark++
        shaded++
        continue
      }
      for (let q = 0; q < m; q++) {
        if (inHull(hulls[scratch[q]!]!, p.x, p.y)) {
          shaded++
          break
        }
      }
    }
    const inNight = dark / n >= RULES.hideCoverFrac
    const hidden = !inNight && shaded / n >= RULES.hideCoverFrac
    b.inNight = inNight
    b.hidden = hidden
    if (hidden !== bi.prevHidden) {
      bi.prevHidden = hidden
      emit(rt, { type: 'hidden', slot: b.slot, hidden })
    }
    // bande du Simoun, avec une petite hystérésis contre le clignotement des événements
    const rhoB = ellipticRadius(b.x, b.y, st.arena.a, st.arena.b)
    const storm = rhoB > st.arena.stormFrom || (bi.prevStorm && rhoB > st.arena.stormFrom - RULES.stormEventHysteresis)
    b.inStorm = storm
    if (storm !== bi.prevStorm) {
      bi.prevStorm = storm
      emit(rt, { type: 'storm', slot: b.slot, inside: storm })
    }
    if (b.strong !== bi.prevStrong) {
      bi.prevStrong = b.strong
      emit(rt, { type: 'altitude', slot: b.slot, strong: b.strong })
    }
    if (active) {
      const s = st.stats[b.slot]!
      if (b.z <= RULES.strongMaxAlt) s.timeLow += DT
      else s.timeHigh += DT
      if (hidden) s.hiddenTime += DT
      if (storm) s.stormTime += DT
    }
  }
}

// ─── Verrouillage (chevrons) ───────────────────────────────────────────────

function updateLocks(world: World, rt: Runtime, active: boolean): void {
  const st = world.state
  for (const a of st.birds) {
    const bi = rt.bi[a.slot]!
    if (a.dive !== 'none') continue // la cible du piqué reste affichée
    let best = -1
    if (active && a.stun <= 0 && a.diveCooldown <= 0) {
      const range = a.assist ? RULES.assistLockRange : RULES.diveLockRange
      const cone = (a.assist ? RULES.assistLockConeDeg : RULES.diveLockConeDeg) * DEG
      let bestScore = Infinity
      for (const t of st.birds) {
        if (t === a || !isTargetable(t)) continue
        if (a.z - t.z < RULES.diveLockDz) continue
        const dx = t.x - a.x
        const dy = t.y - a.y
        const d = Math.hypot(dx, dy)
        if (d > range) continue
        const ang = d > 1e-6 ? Math.abs(angDiff(Math.atan2(dy, dx), a.heading)) : 0
        if (d > RULES.diveLockNoConeDist && ang > cone) continue
        const score = d * (1 + ang / cone)
        if (score < bestScore) {
          bestScore = score
          best = t.slot
        }
      }
    }
    if (best !== a.lockTarget) {
      if (a.lockTarget >= 0) emit(rt, { type: 'unlock', hunter: a.slot, target: a.lockTarget })
      if (best >= 0) emit(rt, { type: 'lock', hunter: a.slot, target: best })
      a.lockTarget = best
      bi.lockAge = best >= 0 ? 1 : 0
    } else if (best >= 0) bi.lockAge++
  }
  // un seul chevron par cible : le chasseur en piqué, sinon le plus proche
  for (const t of st.birds) t.lockedBy = -1
  const bestD = rt.lockDist
  for (const t of st.birds) bestD[t.slot] = Infinity
  for (const a of st.birds) {
    if (a.lockTarget < 0) continue
    const t = st.bySlot[a.lockTarget]
    if (!t) continue
    const d = a.dive !== 'none' ? -1 : Math.hypot(t.x - a.x, t.y - a.y)
    if (d < bestD[t.slot]!) {
      bestD[t.slot] = d
      t.lockedBy = a.slot
    }
  }
}

// ─── Peinture ──────────────────────────────────────────────────────────────

/** Distance² d'un point au segment balayé par le centre de l'ombre du code `code` (ce tick). */
function segDist2(rt: Runtime, code: number, px: number, py: number): number {
  let qx = px - rt.segX0[code]!
  let qy = py - rt.segY0[code]!
  const m2 = rt.segM2[code]!
  if (m2 > 1e-9) {
    const mx = rt.segMX[code]!
    const my = rt.segMY[code]!
    const t = clamp((qx * mx + qy * my) / m2, 0, 1)
    qx -= mx * t
    qy -= my * t
  }
  return qx * qx + qy * qy
}

/**
 * Conflit sur une cellule déjà revendiquée ce tick (rare) : la plus forte gagne ; à
 * niveau égal, le centre le plus proche ; à égalité exacte, un hachage (tick, cellule).
 * Les distances ne sont calculées qu'ici (paresseusement).
 */
function contestClaim(rt: Runtime, g: TerritoryGridLike, tick: number, k: number, i: number, j: number, code: number, level: number): void {
  const L = rt.claimLevel[k]!
  if (level < L) return
  if (level === L) {
    const px = g.x0 + (i + 0.5) * g.cellW
    const py = g.y0 + (j + 0.5) * g.cellH
    let cd = rt.claimDist[k]!
    if (cd < 0) {
      cd = segDist2(rt, rt.claimSlot[k]!, px, py)
      rt.claimDist[k] = cd
    }
    const d2 = segDist2(rt, code, px, py)
    if (d2 > cd) return
    if (d2 === cd && hash32(tick, k, code) >= hash32(tick, k, rt.claimSlot[k]!)) return
    rt.claimDist[k] = d2
  } else rt.claimDist[k] = -1
  rt.claimSlot[k] = code
  rt.claimLevel[k] = level
}

type TerritoryGridLike = { x0: number; y0: number; cellW: number; cellH: number }

function pushTrail(bi: BirdInternal, time: number, x0: number, y0: number, x1: number, y1: number, A: number, B: number, dx: number, dy: number): void {
  const o = bi.trailHead * TRAIL_STRIDE
  const tr = bi.trail
  tr[o] = time
  tr[o + 1] = x0
  tr[o + 2] = y0
  tr[o + 3] = x1
  tr[o + 4] = y1
  tr[o + 5] = A
  tr[o + 6] = B
  tr[o + 7] = dx
  tr[o + 8] = dy
  bi.trailHead = (bi.trailHead + 1) % TRAIL_CAP
  if (bi.trailCount < TRAIL_CAP) bi.trailCount++
}

function paint(world: World, rt: Runtime, active: boolean): void {
  const st = world.state
  const g = st.grid
  const sun = st.sun
  const dirX = sun.shadowDirX
  const dirY = sun.shadowDirY
  const stamp = ++rt.stamp
  let tc = 0
  const tick = st.tick
  const cols = g.cols
  const inArena = g.inArena
  const frozen = g.frozen
  const claimStamp = rt.claimStamp
  const claimSlot = rt.claimSlot
  const claimLevel = rt.claimLevel
  const claimDist = rt.claimDist
  const touched = rt.touched
  rt.cPainted.fill(0)
  rt.cStolen.fill(0)
  rt.cTsk.fill(0)
  rt.cTskX.fill(0)
  rt.cTskY.fill(0)
  for (const b of st.birds) {
    const bi = rt.bi[b.slot]!
    const fp = b.shadow
    fp.paints = false
    if (!active || b.stun > 0) {
      bi.prevFp = false
      continue
    }
    let x0 = fp.cx
    let y0 = fp.cy
    if (bi.prevFp) {
      const jump = Math.hypot(bi.prevFpX - fp.cx, bi.prevFpY - fp.cy)
      if (jump < 60) {
        x0 = bi.prevFpX
        y0 = bi.prevFpY
      }
    }
    const code = b.slot + 1
    rt.segX0[code] = x0
    rt.segY0[code] = y0
    rt.segMX[code] = fp.cx - x0
    rt.segMY[code] = fp.cy - y0
    rt.segM2[code] = (fp.cx - x0) * (fp.cx - x0) + (fp.cy - y0) * (fp.cy - y0)
    const spans = sweptEllipseSpans(g, x0, y0, fp.cx, fp.cy, fp.rAlong, fp.r, dirX, dirY, rt.spans)
    const level = fp.strong ? LEVEL_STRONG : LEVEL_PALE
    const data = spans.data
    let any = false
    for (let s = 0; s < spans.count; s++) {
      const j = data[3 * s]!
      const i1 = data[3 * s + 2]!
      const row = j * cols
      for (let i = data[3 * s + 1]!; i <= i1; i++) {
        const k = row + i
        if (inArena[k] === 0 || frozen[k] === 1) continue
        any = true
        if (claimStamp[k] !== stamp) {
          claimStamp[k] = stamp
          claimSlot[k] = code
          claimLevel[k] = level
          claimDist[k] = -1
          touched[tc++] = k
        } else contestClaim(rt, g, tick, k, i, j, code, level)
      }
    }
    fp.paints = any
    pushTrail(bi, st.time, x0, y0, fp.cx, fp.cy, fp.rAlong, fp.r, dirX, dirY)
    bi.prevFp = true
    bi.prevFpX = fp.cx
    bi.prevFpY = fp.cy
  }
  rt.touchedCount = tc
  // application de la table de peinture (GDD §6.2)
  const owner = g.owner
  const lvl = g.level
  const counts = g.counts
  const prevOwner = g.prevOwner
  const changedAt = g.changedAt
  const cPainted = rt.cPainted
  const cStolen = rt.cStolen
  const cTsk = rt.cTsk
  const time = st.time
  let minI = cols
  let maxI = -1
  let minK = Infinity
  let maxK = -1
  for (let q = 0; q < tc; q++) {
    const k = touched[q]!
    const s = claimSlot[k]!
    const L = claimLevel[k]!
    const o = owner[k]!
    const l = lvl[k]!
    if (o === s) {
      if (L <= l) continue
      lvl[k] = L
    } else if (o === 0 || l === LEVEL_PALE || L === LEVEL_STRONG) {
      owner[k] = s
      lvl[k] = L
      counts[o]!--
      counts[s]!++
      if (o !== 0) cStolen[s]!++
    } else {
      // pâle sur fort adverse : aucun effet (« tsk »)
      cTsk[s]!++
      const i = k % cols
      rt.cTskX[s]! += g.x0 + (i + 0.5) * g.cellW
      rt.cTskY[s]! += g.y0 + ((k - i) / cols + 0.5) * g.cellH
      continue
    }
    cPainted[s]!++
    prevOwner[k] = o
    changedAt[k] = time
    const i = k % cols
    if (i < minI) minI = i
    if (i > maxI) maxI = i
    if (k < minK) minK = k
    if (k > maxK) maxK = k
  }
  if (maxK >= 0) {
    g.version++
    markDirty(g, minI, Math.floor(minK / cols))
    markDirty(g, maxI, Math.floor(maxK / cols))
  }
  // retombées par oiseau : statistiques, « tsk »
  for (const b of st.birds) {
    const bi = rt.bi[b.slot]!
    const code = b.slot + 1
    b.paintedCells = cPainted[code]!
    const stolen = cStolen[code]!
    if (stolen) {
      st.stats[b.slot]!.stolenCells += stolen
      bi.stolenTotal += stolen
    }
    const tsk = cTsk[code]!
    if (tsk >= RULES.paleOnStrongMinCells) {
      b.paleOnStrong += DT
      if (bi.tskCooldown <= 0) {
        bi.tskCooldown = RULES.paleOnStrongEventGap
        emit(rt, { type: 'paleOnStrong', slot: b.slot, x: rt.cTskX[code]! / tsk, y: rt.cTskY[code]! / tsk })
      }
    } else b.paleOnStrong = 0
  }
}

/** Vol de traînée (GDD §8.4) : les cellules couvertes par les dernières empreintes de la victime. */
function stealTrail(world: World, rt: Runtime, victim: Bird, hunter: Bird, seconds: number): number {
  const st = world.state
  const g = st.grid
  const vi = rt.bi[victim.slot]!
  const vcode = victim.slot + 1
  const hcode = hunter.slot + 1
  const now = st.time
  let n = 0
  for (let q = 0; q < vi.trailCount; q++) {
    const idx = (vi.trailHead - 1 - q + TRAIL_CAP) % TRAIL_CAP
    const o = idx * TRAIL_STRIDE
    const tr = vi.trail
    const age = now - tr[o]!
    if (age > seconds + 1e-6) break
    const spans = sweptEllipseSpans(g, tr[o + 1]!, tr[o + 2]!, tr[o + 3]!, tr[o + 4]!, tr[o + 5]!, tr[o + 6]!, tr[o + 7]!, tr[o + 8]!, rt.spans)
    // la vague remonte la traînée depuis la victime (changedAt dans le futur, ≤ trailStealWaveSeconds)
    const when = now + RULES.trailStealWaveSeconds * clamp(age / seconds, 0, 1)
    const data = spans.data
    for (let s = 0; s < spans.count; s++) {
      const j = data[3 * s]!
      const row = j * g.cols
      for (let i = data[3 * s + 1]!; i <= data[3 * s + 2]!; i++) {
        const k = row + i
        if (g.owner[k] !== vcode || g.frozen[k]) continue
        g.owner[k] = hcode
        g.counts[vcode]!--
        g.counts[hcode]!++
        g.prevOwner[k] = vcode
        g.changedAt[k] = when
        markDirty(g, i, j)
        n++
      }
    }
  }
  if (n > 0) g.version++
  const hs = st.stats[hunter.slot]!
  hs.stolenCells += n
  hs.trailStolenCells += n
  rt.bi[hunter.slot]!.stolenTotal += n
  return n
}

// ─── Comptes, couronne, statistiques ───────────────────────────────────────

function rankOf(world: World, slot: number): number {
  const counts = world.state.grid.counts
  const c = counts[slot + 1]!
  let r = 1
  for (const b of world.state.birds) if (counts[b.slot + 1]! > c) r++
  return r
}

function updateHistory(world: World, rt: Runtime, active: boolean): void {
  const st = world.state
  const I = world.internal
  const g = st.grid
  const H = HISTORY_TICKS + 1
  // enregistre l'état courant
  const head = I.histHead
  for (let c = 0; c < 13; c++) I.countHist[head * 13 + c] = g.counts[c]!
  for (let s = 0; s < MAX_SLOTS; s++) I.stolenHist[head * MAX_SLOTS + s] = rt.bi[s]?.stolenTotal ?? 0
  I.histHead = (head + 1) % H
  if (I.histCount < H) I.histCount++
  const old = (head - (I.histCount - 1) + H) % H
  const arena = Math.max(1, g.arenaCells)
  const threshold = RULES.bigStealFrac * arena
  for (const b of st.birds) {
    const code = b.slot + 1
    const gain = g.counts[code]! - I.countHist[old * 13 + code]!
    b.gain3s = gain / arena
    b.stolen3s = ((rt.bi[b.slot]?.stolenTotal ?? 0) - I.stolenHist[old * MAX_SLOTS + b.slot]!) / arena
    if (!active) continue
    const s = st.stats[b.slot]!
    if (gain > s.maxGain3s) s.maxGain3s = gain
    const bi = rt.bi[b.slot]!
    if (!bi.bigStealActive && gain >= threshold) {
      bi.bigStealActive = true
      // victime : le propriétaire qui a le plus perdu sur la fenêtre
      let victim = -1
      let worst = 0
      for (const o of st.birds) {
        if (o === b) continue
        const loss = I.countHist[old * 13 + o.slot + 1]! - g.counts[o.slot + 1]!
        if (loss > worst) {
          worst = loss
          victim = o.slot
        }
      }
      emit(rt, { type: 'bigSteal', slot: b.slot, frac: gain / arena, victim })
    } else if (bi.bigStealActive && gain < threshold * RULES.bigStealRearmFrac) bi.bigStealActive = false
  }
}

function resetHistory(world: World): void {
  world.internal.histHead = 0
  world.internal.histCount = 0
}

function updateCrown(world: World, rt: Runtime): void {
  const st = world.state
  const I = world.internal
  if (st.config.mode === 'lobby') return
  const counts = st.grid.counts
  let leader = -1
  let best = 0
  let tie = false
  for (const b of st.birds) {
    const c = counts[b.slot + 1]!
    if (c > best) {
      best = c
      leader = b.slot
      tie = false
    } else if (c === best && c > 0) tie = true
  }
  let cand = leader
  if (tie) cand = st.crownSlot >= 0 && counts[st.crownSlot + 1] === best ? st.crownSlot : -1
  if (cand !== I.crownCand) {
    I.crownCand = cand
    I.crownCandSince = st.time
  }
  if (cand !== st.crownSlot && st.time - I.crownCandSince >= RULES.crownHysteresis - 1e-9) {
    const prev = st.crownSlot
    st.crownSlot = cand
    for (const b of st.birds) b.crown = b.slot === cand
    emit(rt, { type: 'crown', slot: cand, prev })
  }
}

/** Relevés à 60, 80, 90, 98 s (× T/110). Sans fermeture ni allocation. */
function statMarks(world: World): void {
  const st = world.state
  const I = world.internal
  const k = phaseScale(st.config.sunSeconds)
  const t = I.sunT
  const g = st.grid
  if (!(I.statMarks & 1) && t >= 60 * k - 1e-9) {
    I.statMarks |= 1
    I.owner60.set(g.owner)
    I.owner60Taken = true
    for (const b of st.birds) st.stats[b.slot]!.cellsAt60 = g.counts[b.slot + 1]!
  }
  if (!(I.statMarks & 2) && t >= 80 * k - 1e-9) {
    I.statMarks |= 2
    for (const b of st.birds) st.stats[b.slot]!.rankAt80 = rankOf(world, b.slot)
  }
  if (!(I.statMarks & 4) && t >= 90 * k - 1e-9) {
    I.statMarks |= 4
    for (const b of st.birds) st.stats[b.slot]!.rankAt90 = rankOf(world, b.slot)
  }
  if (!(I.statMarks & 8) && t >= RULES.greatShadowAt * k - 1e-9) {
    I.statMarks |= 8
    I.countsAt98.set(g.counts)
    for (const b of st.birds) st.stats[b.slot]!.rankAt98 = rankOf(world, b.slot)
  }
}

function finalStats(world: World): void {
  const st = world.state
  const I = world.internal
  const g = st.grid
  const n = g.owner.length
  for (const b of st.birds) {
    const s = st.stats[b.slot]!
    const code = b.slot + 1
    s.rankAtNight = rankOf(world, b.slot)
    s.finalCells = g.counts[code]!
    s.gainGreatShadow = g.counts[code]! - I.countsAt98[code]!
    let frozenOwn = 0
    let kept = 0
    for (let k = 0; k < n; k++) {
      if (g.owner[k] !== code) continue
      if (I.towerMask[k] && g.inArena[k]) frozenOwn++
      if (I.owner60Taken && I.owner60[k] === code) kept++
    }
    s.frozenOwnAtNight = frozenOwn
    s.keptFrom60 = kept
  }
}

/** Nuit et fin de manche (round, démo). */
function endOfRound(world: World, rt: Runtime): void {
  const st = world.state
  const I = world.internal
  const cfg = st.config
  if (cfg.mode === 'lobby') return
  const T = cfg.sunSeconds
  if (!I.nightDone && I.sunT >= T - 1e-9) {
    I.nightDone = true
    // gel : toute la manche est figée
    const g = st.grid
    g.frozen.fill(1)
    I.nightMask.fill(1)
    g.frozenVersion++
    for (const b of st.birds) {
      const bi = rt.bi[b.slot]!
      if (b.dive !== 'none') cancelDive(world, rt, b, bi, 'lost')
      if (b.lockTarget >= 0) {
        emit(rt, { type: 'unlock', hunter: b.slot, target: b.lockTarget })
        b.lockTarget = -1
      }
      b.lockedBy = -1
    }
    finalStats(world)
    emit(rt, { type: 'night' })
  }
  if (!I.overDone && I.sunT >= T + RULES.nightHoldSeconds - 1e-9) {
    I.overDone = true
    emit(rt, { type: 'over' })
    if (cfg.mode === 'round') st.over = true
    else I.demoRestartAt = st.time + RULES.demoLoopPauseSeconds
  }
  if (cfg.mode === 'demo' && I.demoRestartAt >= 0 && st.time >= I.demoRestartAt) restartDemo(world, rt)
}

/** Remise à zéro du territoire (lobby, boucle de démo). */
function resetTerritory(world: World): void {
  const g = world.state.grid
  const time = world.state.time
  for (let k = 0; k < g.owner.length; k++) {
    if (g.owner[k] === 0) continue
    g.prevOwner[k] = g.owner[k]!
    g.owner[k] = 0
    g.level[k] = 0
    g.changedAt[k] = time
  }
  g.counts.fill(0)
  g.counts[0] = g.arenaCells
  g.version++
  markAllDirty(g)
}

function restartDemo(world: World, rt: Runtime): void {
  const st = world.state
  const I = world.internal
  I.loop++
  I.roundTick = 0
  I.sunT = 0
  I.demoRestartAt = -1
  I.nightDone = false
  I.overDone = false
  I.tenSecondsDone = false
  I.lastSecondsNext = 5
  I.statMarks = 0
  I.owner60Taken = false
  I.crownCand = -1
  I.countsAt98.fill(0)
  I.nightMask.fill(0)
  I.nightCol.fill(0)
  st.night.active = false
  st.night.s = -1e6
  st.crownSlot = -1
  for (const b of st.birds) {
    b.crown = false
    st.stats[b.slot] = makeStats()
  }
  resetTerritory(world)
  resetHistory(world)
  updateRoundSun(st.sun, 0, st.config.sunSeconds)
  refreshTowerShade(world, rt, true)
  for (const b of st.birds) paintSplash(world, b.slot, b.x, b.y)
  emit(rt, { type: 'territoryReset' })
  emit(rt, { type: 'phase', phase: st.sun.phase })
}

// ─── Tick ──────────────────────────────────────────────────────────────────

function step(world: World, rt: Runtime, inputs: ReadonlyArray<BirdInput | undefined>): SimEvent[] {
  const st = world.state
  const I = world.internal
  // les événements émis entre deux ticks (removeBird…) sont rendus avec ceux de ce tick
  const events = rt.events
  st.tick++
  st.time = st.tick / RULES.tickHz
  for (const b of st.birds) readInput(b, rt.bi[b.slot]!, inputs[b.slot])
  advanceClock(world, rt)
  const active = isActive(world)
  // ombres des tours : enveloppes à chaque tick, masque figé à RULES.towerMaskHz
  const maskEvery = Math.max(1, Math.round(RULES.tickHz / RULES.towerMaskHz))
  refreshTowerShade(world, rt, st.config.mode !== 'lobby' && I.roundTick % maskEvery === 0 && !I.nightDone)
  updateNight(world)
  tickTimers(world, rt)
  diveDecisions(world, rt, active)
  moveBirds(world, rt)
  updateVisibility(world, rt, active)
  updateLocks(world, rt, active)
  paint(world, rt, active)
  if (active && st.config.mode !== 'lobby') {
    statMarks(world)
    updateCrown(world, rt)
  }
  updateHistory(world, rt, active)
  endOfRound(world, rt)
  rt.events = []
  return events
}

// ─── Emballage public ──────────────────────────────────────────────────────

class SimulationImpl implements Simulation {
  constructor(
    private world: World,
    private rt: Runtime,
  ) {}
  get state() {
    return this.world.state
  }
  step(inputs: ReadonlyArray<BirdInput | undefined>): SimEvent[] {
    return step(this.world, this.rt, inputs)
  }
  addBird(setup: BirdSetup): void {
    const st = this.world.state
    if (setup.slot < 0 || setup.slot >= MAX_SLOTS || st.bySlot[setup.slot]) return
    const theta = -Math.PI / 2 + (setup.slot * TAU) / MAX_SLOTS
    const bird = spawnBird(this.world, this.rt, setup, theta, st.config.mode === 'lobby' || isActive(this.world))
    if (st.config.mode === 'round' && this.world.internal.sunT < 0) placeOnRing(this.world, this.rt, bird)
  }
  removeBird(slot: number): void {
    const world = this.world
    const rt = this.rt
    const st = world.state
    const bird = st.bySlot[slot]
    if (!bird) return
    // les piqués et verrouillages qui le visaient s'arrêtent
    for (const a of st.birds) {
      if (a === bird) continue
      const ai = rt.bi[a.slot]!
      if (a.dive !== 'none' && a.diveTarget === slot) cancelDive(world, rt, a, ai, 'lost')
      if (a.lockTarget === slot) {
        a.lockTarget = -1
        ai.lockAge = 0
      }
    }
    st.birds.splice(st.birds.indexOf(bird), 1)
    st.bySlot[slot] = undefined
    const idx = world.internal.birds.findIndex((b) => b.slot === slot)
    if (idx >= 0) world.internal.birds.splice(idx, 1)
    rt.bi[slot] = undefined
    if (st.crownSlot === slot) st.crownSlot = -1
    // au lobby, son sable redevient neutre ; en manche, il reste compté
    if (st.config.mode === 'lobby') {
      const g = st.grid
      const code = slot + 1
      for (let k = 0; k < g.owner.length; k++) {
        if (g.owner[k] !== code) continue
        const i = k % g.cols
        setCell(world, k, i, (k - i) / g.cols, 0, 0, st.time)
      }
      st.stats[slot] = undefined
    }
  }
  setAssist(slot: number, on: boolean): void {
    const b = this.world.state.bySlot[slot]
    if (b) b.assist = on
  }
  setLatencyGrace(slot: number, seconds: number): void {
    const bi = this.rt.bi[slot]
    if (bi) bi.latencyGrace = clamp(Number.isFinite(seconds) ? seconds : 0, 0, RULES.latencyGraceMax)
  }
  snapshot(): SimSnapshot {
    return encodeWorld(this.world)
  }
}

/** Crée une simulation (manche, lobby ou démo). */
export function createSimulation(config: SimConfig): Simulation {
  const { world, rt } = createWorld(structuredCloneConfig(config))
  return new SimulationImpl(world, rt)
}

/** Recrée une simulation à l'identique depuis un snapshot (rafraîchissement du PC). */
export function restoreSimulation(snapshot: SimSnapshot): Simulation {
  const config = structuredCloneConfig(snapshot.config)
  const { world, rt } = createWorld(config)
  decodeWorld(world, snapshot)
  // données dérivées
  for (let s = 0; s < MAX_SLOTS; s++) rt.bi[s] = undefined
  for (const bi of world.internal.birds) rt.bi[bi.slot] = bi
  updateHulls(world.state.towers, world.state.sun.cotE, world.state.sun.shadowDirX, world.state.sun.shadowDirY, rt.hulls)
  return new SimulationImpl(world, rt)
}

function structuredCloneConfig(c: SimConfig): SimConfig {
  return JSON.parse(JSON.stringify(c)) as SimConfig
}

/** Accès interne (tests, outils) : le monde et son runtime. */
export function internalsOf(sim: Simulation): { world: World; rt: unknown } | null {
  if (sim instanceof SimulationImpl) {
    const s = sim as unknown as { world: World; rt: unknown }
    return { world: s.world, rt: s.rt }
  }
  return null
}

