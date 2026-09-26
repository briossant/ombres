// Les sept caractères (GDD §14.2) : ce que chacun décide à chaque intervalle de
// décision. Chaque style laisse une SIGNATURE lisible à l'écran :
//   Faucon     cercle au-dessus de sa proie, puis piqué
//   Laboureur  sillons parallèles espacés de 10 m, comme un tracteur
//   Pie        lignes droites vers la couleur du meneur, coup d'aile à l'entrée
//   Nomade     grandes lignes droites qui traversent l'arène, en travers des ombres
//   Guetteur   cercles serrés dans l'ombre d'une tour, puis sortie brusque
//   Fou        zigzags, coups d'aile gratuits, looping après une touche
//   Horloger   peint là où les ombres vont passer (scellage), file à l'est avant la nuit
// La mécanique commune (perception, menace, piqué, motricité) est dans brain.ts.

import { RULES, DEG } from '../sim/rules.ts'
import type { BirdState } from '../sim/types.ts'
import { angDiff, clamp } from '../sim/math.ts'
import { ellipticRadius } from '../sim/arena.ts'
import { cruiseSpeed, shadowRadius } from '../sim/footprint.ts'
import type { BotBrain } from './brain.ts'
import { blockValue } from './evaluate.ts'
import type { Seen } from './perception.ts'

export function decideStyle(bot: BotBrain, me: BirdState): void {
  switch (bot.personality) {
    case 'falcon':
      return falcon(bot, me)
    case 'ploughman':
      return ploughman(bot, me)
    case 'magpie':
      return magpie(bot, me)
    case 'nomad':
      return nomad(bot, me)
    case 'lookout':
      return lookout(bot, me)
    case 'fool':
      return fool(bot, me)
    case 'watchmaker':
      return watchmaker(bot, me)
  }
}

// ─── Outils ────────────────────────────────────────────────────────────────

/** Point où viser une proie vue (position + mouvement perçu), avec un temps d'avance. */
function interceptPoint(bot: BotBrain, me: BirdState, t: Seen, extra: number): { x: number; y: number; tau: number } {
  const v = Math.max(8, cruiseSpeed(me.z))
  let tau = 0
  for (let i = 0; i < 3; i++) tau = Math.min(3, Math.hypot(t.x + t.vx * tau - me.x, t.y + t.vy * tau - me.y) / v)
  const lead = tau + extra
  let x = t.x + t.vx * lead
  let y = t.y + t.vy * lead
  // un point hors de l'arène ne sert à rien : on le ramène à l'intérieur
  const { a, b } = bot.state.arena
  const rho = ellipticRadius(x, y, a, b)
  if (rho > 0.85) {
    x *= 0.85 / rho
    y *= 0.85 / rho
  }
  return { x, y, tau }
}

// Champs de blocs : une valeur par bloc, lissée sur le voisinage 3 × 3 (tampons partagés,
// recalculés à la demande, une seule passe sur les ~1 500 blocs de la carte).
let fieldRaw = new Float32Array(0)
let fieldSum = new Float32Array(0)

/** Remplit un champ f(bloc) puis le somme sur le voisinage 3 × 3. Le tableau renvoyé est réutilisé. */
function blockField(bot: BotBrain, f: (bi: number) => number): Float32Array {
  const m = bot.co.values
  const n = m.bw * m.bh
  if (fieldRaw.length < n) {
    fieldRaw = new Float32Array(n)
    fieldSum = new Float32Array(n)
  }
  const tot = m.cur.tot
  for (let bi = 0; bi < n; bi++) fieldRaw[bi] = tot[bi]! > 0 ? f(bi) : 0
  // somme séparable : lignes puis colonnes
  const w = m.bw
  const h = m.bh
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      fieldSum[i] = fieldRaw[i]! + (x > 0 ? fieldRaw[i - 1]! : 0) + (x < w - 1 ? fieldRaw[i + 1]! : 0)
    }
  }
  for (let x = 0; x < w; x++) {
    let prev = 0
    for (let y = 0; y < h; y++) {
      const i = y * w + x
      const cur = fieldSum[i]!
      fieldRaw[i] = prev + cur + (y < h - 1 ? fieldSum[i + w]! : 0)
      prev = cur
    }
  }
  return fieldRaw
}

/**
 * Meilleur bloc d'un champ (déjà lissé) dans un rayon donné, pondéré par la distance.
 * Retourne son centre, ou null.
 */
function bestBlock(bot: BotBrain, me: BirdState, field: Float32Array, radius: number, weight: (bi: number, d: number) => number): { x: number; y: number; score: number } | null {
  const m = bot.co.values
  const { a, b } = bot.state.arena
  // un débutant choisit un « bon » endroit parmi plusieurs, pas le meilleur (levels.planSpread)
  const K = Math.max(1, bot.lp.planSpread)
  const top: { bi: number; s: number }[] = []
  const n = m.bw * m.bh
  const tot = m.cur.tot
  for (let bi = 0; bi < n; bi++) {
    if (tot[bi]! <= 0) continue
    const x = m.blockCenterX(bi)
    const y = m.blockCenterY(bi)
    const d = Math.hypot(x - me.x, y - me.y)
    if (d > radius || ellipticRadius(x, y, a, b) > 0.84) continue
    const s = field[bi]! * weight(bi, d)
    if (top.length < K || s > top[top.length - 1]!.s) {
      top.push({ bi, s })
      top.sort((p, q) => q.s - p.s)
      if (top.length > K) top.pop()
    }
  }
  if (top.length === 0) return null
  const pick = top[bot.rng.int(top.length)]!
  return { x: m.blockCenterX(pick.bi), y: m.blockCenterY(pick.bi), score: pick.s }
}

// ─── Faucon : chasse d'en haut, cercle avant le piqué ──────────────────────

function falcon(bot: BotBrain, me: BirdState): void {
  const p = bot.plan
  // entre deux attaques, il peint pâle (haut)
  if (bot.now < bot.postDiveUntil) {
    bot.setPaint(bot.paintChoice({ lowBias: bot.t110 >= RULES.phaseGoldenAt ? 1 : bot.traits.lowBias }))
    return
  }
  // jusqu'au milieu de l'après-midi, il rafle le sable neutre : la chasse commence quand les traînées grossissent
  const huntFrom = bot.state.config.mode === 'demo' ? 12 : 40
  if (bot.t110 < huntFrom && p.kind !== 'hunt' && p.kind !== 'circle') {
    bot.setPaint(bot.paintChoice({ forceHigh: true }))
    return
  }
  // s'acharne : garde sa proie tant qu'elle reste ciblable
  let prey = -1
  if ((p.kind === 'hunt' || p.kind === 'circle') && p.target >= 0) {
    const t = bot.see(p.target)
    if (t && !t.stunned && !t.hidden && !t.inNight && t.z <= RULES.altHigh - RULES.diveLockDz && bot.co.canEngage(bot.slot, p.target, bot.now)) prey = p.target
  }
  if (prey < 0) prey = bot.choosePrey(bot.state.sun.stretch > 3 ? 65 : 50)
  if (prey < 0) {
    bot.setPaint(bot.paintChoice())
    return
  }
  const t = bot.see(prey)!
  bot.co.engage(bot.slot, prey, bot.now)
  const d = Math.hypot(t.x - me.x, t.y - me.y)
  if (p.kind === 'circle' && p.target === prey) {
    // un tour complet au plus (≈ 3,4 s en haut), puis on reprend l'approche
    if (bot.now - p.since < 3.6 && d < 50) return
  }
  const ic = interceptPoint(bot, me, t, 0.5)
  const ahead = Math.abs(angDiff(Math.atan2(t.y - me.y, t.x - me.x), me.heading)) < 95 * DEG
  if (me.z > 14 && (d < 16 || (d < 34 && ahead))) {
    // le cercle au-dessus de la proie (signature) : on tourne du côté où elle se trouve
    p.kind = 'circle'
    p.target = prey
    p.since = bot.now
    p.until = bot.now + 3.6
    p.low = false
    const cross = Math.cos(me.heading) * (t.y - me.y) - Math.sin(me.heading) * (t.x - me.x)
    p.turn = cross >= 0 ? 1 : -1
    p.turned = 0
    p.lastHeading = me.heading
    p.x = NaN
    p.y = NaN
    bot.circleSince = bot.now
    return
  }
  if (d > 45) {
    // approche lointaine : il peint en route, en penchant vers la proie
    bot.setPaint(bot.paintChoice({ forceHigh: true, goal: Math.atan2(ic.y - me.y, ic.x - me.x), goalGain: 0.6 }), 'hunt')
  } else bot.goTo('hunt', ic.x, ic.y, false, 3)
  bot.plan.target = prey
  bot.circleSince = -1
}

// ─── Laboureur : sillons parallèles, scelle, balaie en travers au couchant ──

function ploughman(bot: BotBrain, me: BirdState): void {
  const p = bot.plan
  const sun = bot.state.sun
  const across = sun.stretch >= 1.8
  if (p.kind === 'furrow') {
    const axisOk = !across || Math.abs(p.ax * sun.shadowDirX + p.ay * sun.shadowDirY) < 0.35
    // une seule passe par parcelle, et on change de parcelle dès que le sillon suivant ne rapporte plus
    const fieldDone = p.lanesDone >= p.lanes
    if (axisOk && !fieldDone && laneValue(bot, p) > 0.3) return
  }
  startFurrow(bot, me, across)
}

/** Valeur moyenne (bas) le long du sillon courant, là où tombera l'ombre. */
function laneValue(bot: BotBrain, p: BotBrain['plan']): number {
  const inp = bot.valuation()
  const sun = bot.state.sun
  const off = (p.lane - (p.lanes - 1) / 2) * p.spacing
  const shift = RULES.altLow * sun.cotE * bot.lp.shadowComp
  let v = 0
  let n = 0
  for (let s = -1; s <= 1.001; s += 0.5) {
    const x = p.cx - p.ay * off + p.ax * p.halfLen * s + shift * sun.shadowDirX
    const y = p.cy + p.ax * off + p.ay * p.halfLen * s + shift * sun.shadowDirY
    v += blockValue(inp, bot.co.values.blockAt(x, y), true)
    n++
  }
  return v / n
}

function startFurrow(bot: BotBrain, me: BirdState, across: boolean): void {
  const inp = bot.valuation()
  // champ : près de chez lui en début de manche, là où il est ensuite
  const early = bot.t110 < RULES.phaseGoldenAt
  const ox = early ? (bot.homeX + me.x) / 2 : me.x
  const oy = early ? (bot.homeY + me.y) / 2 : me.y
  const values = blockField(bot, (bi) => blockValue(inp, bi, true))
  const field = bestBlock(bot, me, values, 75, (bi, d) => {
    const fromHome = Math.hypot(bot.co.values.blockCenterX(bi) - ox, bot.co.values.blockCenterY(bi) - oy)
    return (1 - d / 170) * (1 - Math.min(0.5, fromHome / 300))
  })
  const p = bot.plan
  const sun = bot.state.sun
  let cx = field?.x ?? me.x
  let cy = field?.y ?? me.y
  // axe des sillons : en travers des ombres au couchant ; sinon celui qui prolonge son cap
  let ax: number
  let ay: number
  if (across) {
    ax = -sun.shadowDirY
    ay = sun.shadowDirX
  } else {
    // mêmes rangs d'une parcelle à l'autre : le champ reste labouré dans un seul sens
    const q = bot.memo.furrowAxis ?? Math.round(me.heading / (Math.PI / 4)) * (Math.PI / 4)
    bot.memo.furrowAxis = q
    ax = Math.cos(q)
    ay = Math.sin(q)
  }
  const r = shadowRadius(RULES.altLow)
  // l'Oisillon serre trop ses sillons (il repasse sur sa propre bande)
  const spacing = Math.max(RULES.botFurrowSpacing, 1.8 * r * (across ? sun.stretch : 1)) * (bot.level === 0 ? 0.7 : 1)
  const lanes = 5
  // longueur : 18 à 42 m, raccourcie (puis la parcelle recentrée) pour que les quatre
  // coins restent loin de la tempête
  const { a, b } = bot.state.arena
  const fits = (half: number): boolean => {
    for (const lane of [0, lanes - 1]) {
      const off = (lane - (lanes - 1) / 2) * spacing
      for (const s of [-1, 1]) {
        const x = cx - ay * off + ax * half * s
        const y = cy + ax * off + ay * half * s
        if (ellipticRadius(x, y, a, b) > 0.86) return false
      }
    }
    return true
  }
  let half = 42
  while (half > 18 && !fits(half)) half -= 4
  for (let k = 0; k < 12 && !fits(half); k++) {
    cx *= 0.9
    cy *= 0.9
  }
  // sillon de départ : le plus proche de l'oiseau, dans le sens de son cap
  const lateral = (me.x - cx) * -ay + (me.y - cy) * ax
  p.kind = 'furrow'
  p.since = bot.now
  p.until = Infinity
  p.cx = cx
  p.cy = cy
  p.ax = ax
  p.ay = ay
  p.spacing = spacing
  p.lanes = lanes
  p.lane = clamp(Math.round(lateral / spacing + (lanes - 1) / 2), 0, lanes - 1)
  p.laneStep = p.lane >= lanes / 2 ? -1 : 1
  p.lanesDone = 0
  p.halfLen = half
  p.dir = Math.cos(me.heading) * ax + Math.sin(me.heading) * ay >= 0 ? 1 : -1
  p.low = true
  p.target = -1
  p.x = cx
  p.y = cy
}

// ─── Pie : ligne droite vers le sable du meneur, coup d'aile à l'entrée ────

function magpie(bot: BotBrain, me: BirdState): void {
  const p = bot.plan
  const memo = bot.memo
  if (p.kind === 'raid' && bot.now < p.until) {
    const d = Math.hypot(p.x - me.x, p.y - me.y)
    if (!p.flapped && d < 30) p.flapped = bot.sprint(Math.atan2(p.y - me.y, p.x - me.x)) || me.flapCooldown > 0
    if (d > 10) return
    memo.pillageUntil = bot.now + bot.rng.range(3, 5.5)
    memo.victim = p.target
  }
  if (bot.now < (memo.pillageUntil ?? -1)) {
    bot.setPaint(bot.paintChoice({ focus: memo.victim ?? -1, focusMul: 1.8 }))
    return
  }
  // victime : la couronne, sinon le plus gros territoire adverse (la bande du HUD)
  const counts = bot.state.grid.counts
  let victim = bot.state.crownSlot !== bot.slot ? bot.state.crownSlot : -1
  if (victim < 0) {
    let c = 0
    for (const o of bot.state.birds) if (o.slot !== bot.slot && counts[o.slot + 1]! > c) {
      c = counts[o.slot + 1]!
      victim = o.slot
    }
  }
  const m = bot.co.values
  const loot = blockField(bot, (bj) => {
    let s = 0.4 * m.cur.neutral[bj]!
    for (const o of bot.state.birds) {
      if (o.slot === bot.slot) continue
      s += (o.slot === victim ? 1.8 : 1) * m.ownedBy(bj, o.slot)
    }
    return s
  })
  const target = bestBlock(bot, me, loot, 120, (_bi, d) => 1 / (1 + d / 60))
  if (!target || victim < 0) {
    bot.setPaint(bot.paintChoice())
    return
  }
  bot.goTo('raid', target.x, target.y, true, Math.hypot(target.x - me.x, target.y - me.y) / RULES.speedLow + 2)
  p.target = victim
  p.flapped = false
}

// ─── Nomade : grandes lignes droites en travers des ombres ─────────────────

function nomad(bot: BotBrain, me: BirdState): void {
  const p = bot.plan
  const { a, b } = bot.state.arena
  // une ligne engagée se tient jusqu'au bout (5 à 7 s), sauf si la tempête approche
  if (p.kind === 'sweep' && bot.now < p.until) {
    const ax = me.x + Math.cos(p.heading) * 25
    const ay = me.y + Math.sin(p.heading) * 25
    if (ellipticRadius(ax, ay, a, b) < 0.86) return
  }
  // nouvelle ligne : le meilleur cap (il aime le haut), et loin du centre il repart en
  // travers de l'arène, du côté de son cap, plutôt que de longer le bord
  const rho = ellipticRadius(me.x, me.y, a, b)
  const toCenter = Math.atan2(-me.y, -me.x)
  const side = angDiff(me.heading, toCenter) >= 0 ? 1 : -1
  const goal = toCenter + side * 30 * DEG
  const goalGain = clamp((rho - 0.45) / 0.3, 0, 1) * 1.2
  // à l'heure dorée, le haut se fait voler par les oiseaux bas : il balaie aussi au ras du sable
  const lowBias = bot.t110 >= RULES.phaseGoldenAt ? 1.3 : bot.traits.lowBias
  bot.setPaint(bot.paintChoice({ goal, goalGain, lowBias }), 'sweep')
  p.until = bot.now + bot.rng.range(5, 7.5)
}

// ─── Guetteur : cercles serrés à l'ombre d'une tour, puis sortie brusque ───

function lookout(bot: BotBrain, me: BirdState): void {
  const p = bot.plan
  const memo = bot.memo
  // en retard au couchant : il cherche encore des refuges qui n'existent plus, puis peint
  if (bot.t110 >= RULES.phaseSunsetAt + 4) {
    bot.setPaint(bot.paintChoice())
    return
  }
  if (p.kind === 'ambush' && bot.now < p.until && p.target >= 0) {
    const t = bot.see(p.target)
    if (t && !t.stunned && !t.immune && !t.hidden) {
      const ic = interceptPoint(bot, me, t, 0.2)
      p.x = ic.x
      p.y = ic.y
      bot.co.engage(bot.slot, p.target, bot.now)
      return
    }
  }
  if (p.kind === 'lurk') {
    // une proie basse passe à portée : sortie brusque (remonte, coup d'aile vers elle)
    const prey = bot.choosePrey(42, { maxZ: 8 })
    if (prey >= 0) {
      const t = bot.see(prey)!
      const ic = interceptPoint(bot, me, t, 0.2)
      bot.goTo('ambush', ic.x, ic.y, false, 3.5)
      p.target = prey
      bot.co.engage(bot.slot, prey, bot.now)
      bot.sprint(Math.atan2(ic.y - me.y, ic.x - me.x))
      return
    }
    const stillHidden = bot.co.shade.spots.some((s) => Math.hypot(s.x - p.x, s.y - p.y) < 8)
    if (stillHidden && (bot.now < p.until || bot.now < (memo.overstayUntil ?? -1))) return
    memo.paintUntil = bot.now + bot.rng.range(3, 6)
  }
  if (bot.now < (memo.paintUntil ?? -1)) {
    // entre deux affûts, il peint près des tours, devant les éclipses (scellage)
    bot.setPaint(bot.paintChoice())
    return
  }
  // un affût ne vaut que s'il passe du monde au ras du sable dans les parages
  const spot = bot.bestHideSpot(me, 3.5)
  let lowNear = 0
  if (spot) {
    for (const o of bot.state.birds) {
      if (o.slot === bot.slot) continue
      const t = bot.see(o.slot)
      if (t && t.z <= 8 && Math.hypot(t.x - spot.x, t.y - spot.y) < 70) lowNear++
    }
  }
  if (!spot || lowNear === 0 || bot.t110 > 80) {
    memo.paintUntil = bot.now + bot.rng.range(2, 4)
    bot.setPaint(bot.paintChoice())
    return
  }
  p.kind = 'lurk'
  p.x = spot.x
  p.y = spot.y
  p.low = true
  p.turn = bot.rng.chance(0.5) ? 1 : -1
  p.since = bot.now
  p.until = bot.now + Math.hypot(spot.x - me.x, spot.y - me.y) / RULES.speedLow + bot.rng.range(2, 4)
  p.target = -1
}

// ─── Fou : zigzags, coups d'aile gratuits, looping de célébration ──────────

function fool(bot: BotBrain, me: BirdState): void {
  const p = bot.plan
  if (bot.now - bot.lastHitAt < 0.6 && p.kind !== 'loop') {
    p.kind = 'loop'
    p.turn = bot.rng.chance(0.5) ? 1 : -1
    p.since = bot.now
    p.until = bot.now + 4
    p.turned = 0
    p.lastHeading = me.heading
    p.low = false
    p.target = -1
    return
  }
  if (p.kind === 'loop' && p.turned < Math.PI * 2 && bot.now < p.until) return
  // parfois il file droit sur quelqu'un, pour le plaisir
  if (bot.rng.chance(0.25)) {
    const prey = bot.choosePrey(45)
    if (prey >= 0) {
      const t = bot.see(prey)!
      bot.goTo('hunt', t.x, t.y, false, 1.5)
      bot.plan.target = prey
      return
    }
  }
  const c = bot.paintChoice()
  if (p.kind !== 'chaos') p.since = bot.now
  p.kind = 'chaos'
  // souvent un cap au hasard : on ne sait jamais où il va
  p.heading = bot.rng.chance(0.5) ? bot.rng.sym(Math.PI) : c.heading + bot.rng.sym(0.6)
  p.low = bot.rng.chance(0.2) ? !c.low : c.low
  p.amp = bot.rng.range(50, 80) * DEG
  p.period = bot.rng.range(0.8, 1.4)
  p.target = -1
  p.x = NaN
  p.y = NaN
}

// ─── Horloger : scelle devant les ombres, file à l'est, pique au couchant ──

function watchmaker(bot: BotBrain, me: BirdState): void {
  const t = bot.t110
  // scelle : peint fort, de préférence là où les ombres des tours vont passer
  const seal = bot.traits.seal + 0.3
  if (t < 75) {
    bot.setPaint(bot.paintChoice({ seal, lowBias: t < 20 ? 1 : 2.2 }), 'seal')
    return
  }
  // au couchant, il pique pour priver l'adversaire : le meneur, s'il est à portée et bas
  const leader = bot.leader()
  if (t >= RULES.phaseSunsetAt - 3 && leader >= 0 && leader !== bot.slot) {
    const s = bot.see(leader)
    if (s && !s.stunned && !s.immune && !s.hidden && !s.inNight && s.z <= RULES.altHigh - RULES.diveLockDz && bot.co.canEngage(bot.slot, leader, bot.now)) {
      const d = Math.hypot(s.x - me.x, s.y - me.y)
      if (d < 35) {
        const ic = interceptPoint(bot, me, s, 0.3)
        bot.goTo('hunt', ic.x, ic.y, false, 1.5)
        bot.plan.target = leader
        bot.co.engage(bot.slot, leader, bot.now)
        return
      }
    }
  }
  // se place à l'est avant la Grande Ombre, en scellant ce qui va être couvert
  bot.setPaint(bot.paintChoice({ seal, goal: 0, goalGain: 0.15 }), 'seal')
}
