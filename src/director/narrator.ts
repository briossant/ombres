// Directeur du narrateur : logique PURE (ni DOM, ni audio, ni React).
//
// Il consomme, à chaque tick de simulation, l'état et les SimEvent (plus, facultativement, les
// entrées des oiseaux pour détecter un joueur immobile), détecte les situations dignes d'une
// réplique (GDD §16.4) et DÉCIDE quelle réplique jouer et quand, selon les règles de fréquence
// de GDD §16.3 :
// - au moins RULES.narratorMinGap s entre deux débuts de réplique (RULES.narratorUrgentGap pour
//   la priorité 1), jamais de chevauchement ;
// - au plus RULES.narratorMaxPerRound répliques par manche hors ouverture et résultats, avec une
//   réserve pour les répliques d'horloge à venir (heure dorée, couchant, Grande Ombre, dix secondes) ;
// - péremption : RULES.narratorStaleSeconds (RULES.narratorUrgentStaleSeconds en priorité 1) ;
//   un événement plus prioritaire survenu entre-temps passe devant ;
// - plafonds par type et par manche/partie, écarts par groupe (piqués 25 s, meneur 20 s…) ;
// - silence pendant le compte à rebours et à partir de RULES.narratorQuietFrom ;
// - aucune variante rejouée dans une partie (sauf répliques structurelles, voir KindSpec.reuse) ;
// - à priorité égale, un événement qui concerne un humain passe devant ; un événement qui ne
//   concerne que des bots perd un niveau de priorité ; une variante qui nomme un humain est préférée.
//
// Deux horloges : les conditions de jeu se mesurent en temps de simulation (state.time, sun.t,
// mis à l'échelle × T/110) ; l'enchaînement des répliques en temps réel (`now`, secondes), celui
// que l'audio joue. Le directeur suppose qu'une réplique dure `durationOf()` secondes.
import { RULES } from '../sim/rules.ts'
import type { BirdInput, SimEvent, SimState } from '../sim/types.ts'
import { getLang, t } from '../shared/i18n.ts'
import { colorName } from '../shared/players.ts'
import { KIND_SPECS, LINES_BY_KIND, RESERVED_CLOCK, RESULT_ORDER, type NarratorKind, type NarratorLine } from './lines.ts'

// ─── Types publics ──────────────────────────────────────────────────────────

/** Joueur tel que le directeur le voit (adapter depuis PlayerVisual : human = kind !== 'bot'). */
export interface DirectorPlayer {
  slot: number
  /** Index dans PLAYER_COLORS : la couleur dite par le narrateur. */
  colorIndex: number
  human: boolean
}

/** Réplique à jouer MAINTENANT (voix + sous-titre). */
export interface NarratorCue {
  /** Id de réplique (catalogue src/director/lines.ts), ex. 'leaderChange2'. */
  lineId: string
  kind: NarratorKind
  /** Couleur nommée (index PLAYER_COLORS), absente pour une réplique neutre. */
  colorIndex?: number
  /** Slot du joueur nommé. */
  slot?: number
  /** Priorité effective (1 = passe toujours ; un événement 100 % bots perd un niveau). */
  priority: number
  /** Clé i18n du texte : t(key, { color: colorName(colorIndex, lang) }). */
  key: string
  /** Durée supposée (s), celle utilisée pour l'enchaînement. */
  duration: number
}

export interface MatchInfo {
  /** Nombre de manches de la partie (RULES.roundsOptions). */
  rounds: number
  /** Dernière manche comptée double (réglage de partie, RULES.lastRoundMultiplier). */
  lastRoundDouble: boolean
}

export interface NarratorOptions {
  /** Durée réelle d'un clip (manifest audio) ; undefined → estimation depuis le texte. */
  durationOf?: (lineId: string, colorIndex: number | undefined) => number | undefined
  /** Graine du tirage des variantes (déterministe pour les tests). */
  seed?: number
}

/** Mémoire de partie sérialisable (rafraîchissement du PC en cours de partie). */
export interface NarratorMemory {
  v: 1
  match: MatchInfo
  round: number
  used: Record<string, number>
  matchCount: Partial<Record<NarratorKind, number>>
  idleSaid: number[]
  lastRoundAnnounced: boolean
  seq: number
}

// ─── Réglages de présentation (pas du gameplay) ─────────────────────────────

/** Silence minimal entre la fin d'une réplique et le début de la suivante (s). */
const BREATH = 0.4
/** Estimation d'une durée de clip sans manifest (mesurée sur Pocket TTS, tempo 0,92, pauses à 420 ms). */
const EST_BASE = 0.35
const EST_PER_CHAR = 0.08
/** Deux changements d'entrée plus petits que ceci ne comptent pas comme une activité (dérive du stick). */
const INPUT_EPS = 0.05
/**
 * « Écart énorme » : seulement après 60 s de soleil (GDD §16.4, instant × T/110). Pas de constante
 * dans RULES (demandée dans docs/agent-notes/REQUESTS.md) : même instant que stats.cellsAt60.
 */
const RUNAWAY_FROM = 60

/** Instants (s, pour T = 110) des répliques d'horloge réservées. */
const CLOCK_AT: Partial<Record<NarratorKind, number>> = {
  golden: RULES.phaseGoldenAt,
  sunset: RULES.phaseSunsetAt,
  greatShadow: RULES.greatShadowAt,
  tenSeconds: RULES.tenSecondsAt,
}

// ─── Internes ───────────────────────────────────────────────────────────────

interface Pending {
  kind: NarratorKind
  /** Auteur de l'événement (ou -1). */
  actor: number
  /** Celui qui le subit (ou -1). */
  victim: number
  /** Instant réel de l'événement. */
  at: number
  maxAge: number
  priority: number
  specificity: number
  /** Candidats issus d'un même événement : un seul sera joué. */
  group: number
  valid?: (s: SimState) => boolean
}

interface HitRecord {
  hunter: number
  t: number
}

/** PRNG mulberry32 (déterministe, sans Math.random). */
function prng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export interface RankEntry {
  slot: number
  cells: number
  /** 1 = premier ; les ex æquo prennent le meilleur rang (GDD §11.1). */
  rank: number
}

/** Classement par territoire (cellules possédées), ex æquo au meilleur rang. */
export function rankBirds(state: SimState): RankEntry[] {
  const list = state.birds.map(b => ({ slot: b.slot, cells: state.grid.counts[b.slot + 1] ?? 0, rank: 0 }))
  list.sort((a, b) => b.cells - a.cells || a.slot - b.slot)
  list.forEach((e, i) => {
    e.rank = i > 0 && e.cells === list[i - 1].cells ? list[i - 1].rank : i + 1
  })
  return list
}

// ─── Directeur ──────────────────────────────────────────────────────────────

export class NarratorDirector {
  private readonly durationOf?: NarratorOptions['durationOf']
  private readonly rand: () => number

  private players: (DirectorPlayer | undefined)[] = []
  private match: MatchInfo = { rounds: RULES.roundsDefault, lastRoundDouble: true }
  private round = 0

  // Mémoire de partie
  /** Variante → numéro d'ordre de sa dernière diffusion (pour la réutilisation la moins récente). */
  private used = new Map<string, number>()
  private matchCount = new Map<NarratorKind, number>()
  private idleSaid = new Set<number>()
  private lastRoundAnnounced = false
  private seq = 0

  // Mémoire de manche
  private roundCount = new Map<NarratorKind, number>()
  private roundLines = 0
  private groupAt = new Map<string, number>()
  private clockFired = new Set<NarratorKind>()
  private openingDone = false
  private hits: HitRecord[] = []
  private hitsThisRound = 0
  private crownHolder = -1
  private crownSince = 0
  /** Couronne à confirmer (si RULES.leaderChangeStableSeconds dépasse l'hystérésis de la simulation). */
  private crownToConfirm: { slot: number; prevHeld: number; prev: number; at: number } | null = null
  private anyCrownThisMatch = false
  private hiddenSince: number[] = []
  private stormSince: number[] = []
  private lastActive: number[] = []
  /** Entrée au dernier instant actif, par slot. */
  private lastInput: (BirdInput | undefined)[] = []
  private rankAtComeback: Map<number, number> | null = null
  private leadersAtGreatShadow: Set<number> | null = null
  private cellsAtGreatShadow: Map<number, number> | null = null
  private photoChecked = false
  private runawayNextCheck = 0

  // File et lecture
  private queue: Pending[] = []
  private nextGroup = 1
  private lastStart = -Infinity
  private lastEnd = -Infinity

  constructor(options: NarratorOptions = {}) {
    this.durationOf = options.durationOf
    this.rand = prng(options.seed ?? 0x0b5e)
  }

  // ─── Cycle de partie ──────────────────────────────────────────────────────

  /** Joueurs présents (à rappeler à chaque changement : bot remplaçant, reconnexion…). */
  setPlayers(players: readonly DirectorPlayer[]): void {
    this.players = []
    for (const p of players) this.players[p.slot] = p
  }

  /** Nouvelle partie (y compris une revanche) : efface la mémoire des variantes. */
  startMatch(info: MatchInfo): void {
    this.match = { ...info }
    this.round = 0
    this.used.clear()
    this.matchCount.clear()
    this.idleSaid.clear()
    this.lastRoundAnnounced = false
    this.anyCrownThisMatch = false
    this.queue = []
  }

  /**
   * Nouvelle manche (1-based). À appeler pendant la présentation de la manche, AVANT le compte à
   * rebours : pour la dernière manche comptée double, la réplique « dernier soleil » part tout de suite
   * (récupérée par le retour, ou par le prochain poll/update).
   */
  startRound(round: number, now: number): NarratorCue | null {
    this.round = round
    this.roundCount.clear()
    this.roundLines = 0
    this.groupAt.clear()
    this.clockFired.clear()
    this.openingDone = false
    this.hits = []
    this.hitsThisRound = 0
    this.crownHolder = -1
    this.crownSince = 0
    this.crownToConfirm = null
    this.hiddenSince = []
    this.stormSince = []
    this.lastActive = []
    this.lastInput = []
    this.rankAtComeback = null
    this.leadersAtGreatShadow = null
    this.cellsAtGreatShadow = null
    this.photoChecked = false
    this.runawayNextCheck = 0
    this.queue = []
    if (this.isLastDoubleRound()) this.push({ kind: 'lastRound', at: now })
    return this.poll(now)
  }

  /**
   * Un tick de simulation. `events` = retour de sim.step() ; `inputs` = les entrées passées à step
   * (facultatif : sert à la réplique « immobile »). Retourne la réplique à lancer maintenant, ou null.
   */
  update(state: SimState, events: readonly SimEvent[], now: number, inputs?: ReadonlyArray<BirdInput | undefined>): NarratorCue | null {
    if (state.config.mode !== 'round') return null
    for (const e of events) this.onEvent(state, e, now)
    this.watch(state, now, inputs)
    return this.poll(now, state)
  }

  /** Sans nouvel état (entre deux manches, pause) : sert les répliques en attente. */
  poll(now: number, state?: SimState): NarratorCue | null {
    this.purge(now, state)
    if (!this.queue.length || now < this.lastEnd + BREATH) return null
    const quiet = state ? this.isQuiet(state) : false
    const ordered = [...this.queue].sort(
      (a, b) => a.priority - b.priority || b.specificity - a.specificity || b.at - a.at,
    )
    for (const p of ordered) {
      const spec = KIND_SPECS[p.kind]
      const inRound = spec.scope === 'round' || spec.scope === 'clock'
      if (inRound && quiet) continue
      const gap = p.priority <= 1 ? RULES.narratorUrgentGap : RULES.narratorMinGap
      if (now - this.lastStart < gap) continue
      if (!this.allowed(p, now)) {
        this.drop(p)
        continue
      }
      const pick = this.pickVariant(p)
      if (!pick) {
        this.drop(p)
        continue
      }
      const duration = this.lineDuration(pick.line, pick.slot)
      if (state && !this.clearOfClock(p, duration, state)) continue
      return this.dispatch(p, pick.line, pick.slot, duration, now)
    }
    return null
  }

  /** Résultats de manche (vainqueur révélé, GDD §11.3) : une seule réplique parmi RESULT_ORDER. */
  roundResults(state: SimState, now: number): NarratorCue | null {
    this.queue = this.queue.filter(p => KIND_SPECS[p.kind].scope === 'match')
    const ranking = rankBirds(state)
    if (!ranking.length) return this.poll(now)
    const arena = Math.max(1, state.grid.arenaCells)
    const first = ranking[0]
    const second = ranking[1]
    const winners = ranking.filter(e => e.rank === 1)
    const n = ranking.length
    const lead = second ? (first.cells - second.cells) / arena : 1
    const podium = n >= 4 ? 3 : Math.max(1, n - 1)

    const candidates: Partial<Record<NarratorKind, { actor: number }>> = {}
    if (winners.length > 1) {
      candidates.tie = { actor: -1 }
      candidates.closeFinish = { actor: -1 } // si l'égalité a déjà servi dans la partie
    } else {
      const w = first.slot
      if (second && lead >= RULES.landslideGap) candidates.landslide = { actor: w }
      if (second && lead < RULES.closeFinishGap) candidates.closeFinish = { actor: -1 }
      if (this.cellsAtGreatShadow) {
        let best = -Infinity
        let bestSlot = -1
        for (const e of ranking) {
          const gain = e.cells - (this.cellsAtGreatShadow.get(e.slot) ?? e.cells)
          if (gain > best) {
            best = gain
            bestSlot = e.slot
          }
        }
        if (bestSlot === w && best > 0) candidates.lastRay = { actor: w }
      }
      if (this.rankAtComeback && n >= 2) {
        const at80 = this.rankAtComeback
        const lastRank = Math.max(...at80.values())
        const rise = lastRank > 1 ? ranking.find(e => at80.get(e.slot) === lastRank && e.rank <= podium) : undefined
        if (rise) candidates.comeback = { actor: rise.slot }
      }
      if (this.leadersAtGreatShadow) {
        const fallen = ranking.find(e => this.leadersAtGreatShadow!.has(e.slot) && e.rank > 1)
        if (fallen) candidates.mirage = { actor: fallen.slot }
      }
      candidates.roundWin = { actor: w }
    }
    for (const kind of RESULT_ORDER) {
      const c = candidates[kind]
      if (!c) continue
      const lines = LINES_BY_KIND[kind]
      if (!KIND_SPECS[kind].reuse && lines.every(l => this.used.has(l.id))) continue
      this.push({ kind, actor: c.actor, at: now })
      break
    }
    return this.poll(now)
  }

  /** Podium : vainqueur(s) de la partie. Plusieurs slots = co-victoire. */
  matchResults(winnerSlots: readonly number[], now: number): NarratorCue | null {
    this.queue = []
    if (winnerSlots.length === 1) this.push({ kind: 'matchWin', actor: winnerSlots[0], at: now })
    else if (winnerSlots.length > 1) this.push({ kind: 'matchTie', at: now })
    return this.poll(now)
  }

  /** Revanche lancée (appeler avant startMatch de la nouvelle partie). */
  rematch(now: number): NarratorCue | null {
    this.queue = []
    this.push({ kind: 'rematch', at: now })
    return this.poll(now)
  }

  /** Abandonne tout ce qui est en attente (pause, retour au salon). */
  clear(): void {
    this.queue = []
  }

  exportMemory(): NarratorMemory {
    return {
      v: 1,
      match: { ...this.match },
      round: this.round,
      used: Object.fromEntries(this.used),
      matchCount: Object.fromEntries(this.matchCount),
      idleSaid: [...this.idleSaid],
      lastRoundAnnounced: this.lastRoundAnnounced,
      seq: this.seq,
    }
  }

  importMemory(m: NarratorMemory): void {
    if (m?.v !== 1) return
    this.match = { ...m.match }
    this.round = m.round
    this.used = new Map(Object.entries(m.used))
    this.matchCount = new Map(Object.entries(m.matchCount) as [NarratorKind, number][])
    this.idleSaid = new Set(m.idleSaid)
    this.lastRoundAnnounced = m.lastRoundAnnounced
    this.seq = m.seq
  }

  // ─── Détection : événements ───────────────────────────────────────────────

  private scale(state: SimState): number {
    return state.sun.T / RULES.roundSunSeconds
  }

  private onEvent(state: SimState, e: SimEvent, now: number): void {
    switch (e.type) {
      case 'countdown':
        if (e.n === 0) this.opening(now)
        break
      case 'phase':
        if (e.phase === 'noon') this.opening(now)
        else if (e.phase === 'golden' || e.phase === 'sunset' || e.phase === 'greatShadow') this.clock(e.phase, state, now)
        break
      case 'tenSeconds':
        this.clock('tenSeconds', state, now)
        break
      case 'diveHit':
        this.onHit(state, e.hunter, e.target, e.stolenCells, e.crown, now)
        break
      case 'diveMiss':
        if (e.dodged) this.push({ kind: 'dodge', actor: e.target, victim: e.hunter, at: now })
        else this.push({ kind: 'miss', actor: e.hunter, at: now })
        break
      case 'crown':
        this.onCrown(state, e.slot, e.prev, now)
        break
      case 'bigSteal':
        this.onBigSteal(state, e.slot, e.frac, e.victim, now)
        break
      case 'over':
      case 'night':
        this.queue = this.queue.filter(p => KIND_SPECS[p.kind].scope === 'match')
        break
      default:
        break
    }
  }

  private opening(now: number): void {
    if (this.openingDone) return
    this.openingDone = true
    if (this.round <= 1) this.push({ kind: 'matchOpen', at: now })
    else if (!(this.isLastDoubleRound() && this.lastRoundAnnounced)) this.push({ kind: 'roundOpen', at: now })
  }

  private clock(kind: NarratorKind, state: SimState, now: number): void {
    if (this.clockFired.has(kind)) return
    this.clockFired.add(kind)
    if (kind === 'greatShadow') this.snapshotGreatShadow(state)
    this.push({ kind, at: now })
  }

  private onHit(state: SimState, hunter: number, target: number, stolenCells: number, crown: boolean, now: number): void {
    const t = state.time
    this.hitsThisRound++
    this.hits.push({ hunter, t })
    this.hits = this.hits.filter(h => t - h.t <= Math.max(RULES.huntStreakWindow, RULES.doubleHitWindow))
    const mine = this.hits.filter(h => h.hunter === hunter)
    const group = this.nextGroup++
    const base = { actor: hunter, victim: target, at: now, group }
    if (mine.some(h => h !== mine[mine.length - 1] && t - h.t <= RULES.doubleHitWindow)) this.push({ ...base, kind: 'doubleHit' })
    if (crown) this.push({ ...base, kind: 'crownDown' })
    if (mine.filter(h => t - h.t <= RULES.huntStreakWindow).length >= RULES.huntStreakHits) this.push({ ...base, kind: 'huntStreak' })
    if (stolenCells >= RULES.trailStealNarrFrac * state.grid.arenaCells) this.push({ ...base, kind: 'trailSteal' })
    if (this.hitsThisRound === 1) this.push({ ...base, kind: 'firstHit' })
    else this.push({ ...base, kind: 'hit' })
  }

  private onCrown(state: SimState, slot: number, prev: number, now: number): void {
    const t = state.time
    const prevHeld = prev >= 0 && this.crownHolder === prev ? t - this.crownSince : 0
    this.crownHolder = slot
    this.crownSince = t
    this.crownToConfirm = null
    if (slot < 0) return
    // L'événement 'crown' arrive après RULES.crownHysteresis s de meneur stable ; si la règle du
    // narrateur (RULES.leaderChangeStableSeconds) demande plus, on attend le complément.
    const extra = RULES.leaderChangeStableSeconds - RULES.crownHysteresis
    if (extra > 0) this.crownToConfirm = { slot, prev, prevHeld, at: t + extra }
    else this.confirmCrown(state, slot, prev, prevHeld, now)
  }

  private confirmCrown(state: SimState, slot: number, prev: number, prevHeld: number, now: number): void {
    const stillCrowned = (s: SimState) => s.crownSlot === slot
    const group = this.nextGroup++
    if (!this.anyCrownThisMatch) {
      this.anyCrownThisMatch = true
      this.push({ kind: 'firstCrown', actor: slot, at: now, group, valid: stillCrowned })
    }
    // Changement de meneur : l'ancien avait vraiment mené, et la manche a dépassé la ruée de midi.
    if (
      prev >= 0 &&
      prevHeld >= RULES.leaderChangePrevHoldSeconds &&
      state.sun.t > RULES.phaseAfternoonAt * this.scale(state)
    ) {
      this.push({ kind: 'leaderChange', actor: slot, victim: prev, at: now, group, valid: stillCrowned })
    }
  }

  private onBigSteal(state: SimState, slot: number, frac: number, victim: number, now: number): void {
    const group = this.nextGroup++
    if (frac >= RULES.hugeSweepFrac && state.sun.t >= RULES.phaseSunsetAt * this.scale(state)) {
      this.push({ kind: 'hugeSweep', actor: slot, victim, at: now, group })
    }
    if (frac >= RULES.bigStealFracNarr) this.push({ kind: 'bigSteal', actor: slot, victim, at: now, group })
  }

  // ─── Détection : état (conditions durables) ───────────────────────────────

  private watch(state: SimState, now: number, inputs?: ReadonlyArray<BirdInput | undefined>): void {
    const sun = state.sun
    if (sun.phase === 'countdown' || state.over) return
    const t = state.time
    const k = this.scale(state)

    const c = this.crownToConfirm
    if (c && t >= c.at) {
      this.crownToConfirm = null
      if (state.crownSlot === c.slot) this.confirmCrown(state, c.slot, c.prev, c.prevHeld, now)
    }

    for (const b of state.birds) {
      const s = b.slot
      // Caché longtemps (ombre de tour, pas la nuit qui cache tout le monde)
      const hidden = b.hidden && !b.inNight
      if (!hidden) this.hiddenSince[s] = NaN
      else if (Number.isNaN(this.hiddenSince[s] ?? NaN)) this.hiddenSince[s] = t
      else if (t - this.hiddenSince[s] >= RULES.hiddenLongSeconds && !this.hasPending('hiddenLong', s)) {
        this.hiddenSince[s] = Infinity // une seule fois par épisode
        this.push({ kind: 'hiddenLong', actor: s, at: now, valid: st => !!st.bySlot[s]?.hidden })
      }
      // Tempête
      if (!b.inStorm) this.stormSince[s] = NaN
      else if (Number.isNaN(this.stormSince[s] ?? NaN)) this.stormSince[s] = t
      else if (t - this.stormSince[s] >= RULES.stormLongSeconds) {
        this.stormSince[s] = Infinity
        this.push({ kind: 'storm', actor: s, at: now, valid: st => !!st.bySlot[s]?.inStorm })
      }
      // Immobile (humains seulement, entrées fournies)
      if (inputs && this.isHuman(s)) {
        // Comparaison avec l'entrée du dernier instant actif (pas du tick précédent) : un stick qui
        // dérive lentement finit par compter, un stick immobile jamais.
        const cur = inputs[s]
        const ref = this.lastInput[s]
        if (this.lastActive[s] === undefined || (cur && (!ref || inputChanged(ref, cur)))) {
          this.lastActive[s] = t
          this.lastInput[s] = cur ? { ...cur } : undefined
        }
        if (t - this.lastActive[s] >= RULES.idleSeconds && !this.idleSaid.has(s) && !this.hasPending('idle', s)) {
          this.push({
            kind: 'idle',
            actor: s,
            at: now,
            valid: st => st.time - (this.lastActive[s] ?? st.time) >= RULES.idleSeconds,
          })
        }
      }
    }

    // Instantanés pour les résultats (remontée, mirage)
    if (!this.rankAtComeback && sun.t >= RULES.comebackFromLastAt * k) {
      this.rankAtComeback = new Map(rankBirds(state).map(e => [e.slot, e.rank]))
    }
    if (!this.cellsAtGreatShadow && sun.t >= RULES.greatShadowAt * k) this.snapshotGreatShadow(state)

    // Écart énorme (vérifié deux fois par seconde)
    if (sun.t >= RUNAWAY_FROM * k && t >= this.runawayNextCheck) {
      this.runawayNextCheck = t + 0.5
      const r = rankBirds(state)
      if (r.length >= 2 && r[1].cells > 0 && r[0].cells >= RULES.runawayRatio * r[1].cells && !this.hasPending('runaway', r[0].slot)) {
        const leader = r[0].slot
        this.push({
          kind: 'runaway',
          actor: leader,
          at: now,
          valid: st => {
            const rr = rankBirds(st)
            return rr[0]?.slot === leader && rr.length >= 2 && rr[0].cells >= RULES.runawayRatio * rr[1].cells
          },
        })
      }
    }

    // Photo-finish
    if (!this.photoChecked && sun.t >= RULES.photoFinishAt * k) {
      this.photoChecked = true
      const r = rankBirds(state)
      if (r.length >= 2 && (r[0].cells - r[1].cells) / Math.max(1, state.grid.arenaCells) <= RULES.photoFinishGap) {
        this.push({ kind: 'photoFinish', actor: r[0].slot, victim: r[1].slot, at: now })
      }
    }
  }

  private snapshotGreatShadow(state: SimState): void {
    if (this.cellsAtGreatShadow) return
    const r = rankBirds(state)
    this.cellsAtGreatShadow = new Map(r.map(e => [e.slot, e.cells]))
    this.leadersAtGreatShadow = new Set(r.filter(e => e.rank === 1 && e.cells > 0).map(e => e.slot))
  }

  // ─── File ─────────────────────────────────────────────────────────────────

  private push(p: {
    kind: NarratorKind
    at: number
    actor?: number
    victim?: number
    group?: number
    valid?: (s: SimState) => boolean
  }): void {
    const spec = KIND_SPECS[p.kind]
    const actor = p.actor ?? -1
    const victim = p.victim ?? -1
    // Plafonds déjà atteints : inutile de mettre en file.
    if (spec.capPerRound !== undefined && (this.roundCount.get(p.kind) ?? 0) >= spec.capPerRound) return
    if (spec.capPerMatch !== undefined && (this.matchCount.get(p.kind) ?? 0) >= spec.capPerMatch) return
    const concernsPlayers = actor >= 0 || victim >= 0
    const human = this.isHuman(actor) || this.isHuman(victim)
    const demoted = (spec.scope === 'round') && concernsPlayers && !human
    const stale = spec.priority === 1 ? RULES.narratorUrgentStaleSeconds : RULES.narratorStaleSeconds
    this.queue.push({
      kind: p.kind,
      actor,
      victim,
      at: p.at,
      maxAge: spec.scope === 'results' || spec.scope === 'match' ? RULES.narratorUrgentStaleSeconds + RULES.narratorMinGap : spec.sustained ? RULES.narratorMinGap : stale,
      priority: spec.priority + (demoted ? 1 : 0),
      specificity: spec.specificity ?? 0,
      group: p.group ?? this.nextGroup++,
      valid: p.valid,
    })
  }

  private purge(now: number, state?: SimState): void {
    if (!this.queue.length) return // appelé à 30 Hz : pas d'allocation quand la file est vide
    if (this.queue.every(p => now - p.at <= p.maxAge && (!p.valid || !state || p.valid(state)))) return
    this.queue = this.queue.filter(p => now - p.at <= p.maxAge && (!p.valid || !state || p.valid(state)))
  }

  private drop(p: Pending): void {
    this.queue = this.queue.filter(q => q !== p)
  }

  private hasPending(kind: NarratorKind, actor: number): boolean {
    return this.queue.some(p => p.kind === kind && p.actor === actor)
  }

  private isQuiet(state: SimState): boolean {
    const sun = state.sun
    return sun.phase === 'countdown' || sun.phase === 'night' || sun.phase === 'over' || sun.t >= RULES.narratorQuietFrom * this.scale(state)
  }

  private allowed(p: Pending, now: number): boolean {
    const spec = KIND_SPECS[p.kind]
    if (spec.capPerRound !== undefined && (this.roundCount.get(p.kind) ?? 0) >= spec.capPerRound) return false
    if (spec.capPerMatch !== undefined && (this.matchCount.get(p.kind) ?? 0) >= spec.capPerMatch) return false
    if (p.kind === 'idle' && this.idleSaid.has(p.actor)) return false
    if (spec.groupGap !== undefined) {
      const last = this.groupAt.get(spec.gapGroup ?? p.kind)
      if (last !== undefined && now - last < spec.groupGap) return false
    }
    if ((spec.scope === 'round' || spec.scope === 'clock') && p.priority > 1) {
      // Budget de manche : on garde de la place pour les répliques d'horloge encore à venir.
      const reserved = RESERVED_CLOCK.filter(k => k !== p.kind && !this.clockFired.has(k)).length
      if (this.roundLines >= RULES.narratorMaxPerRound - reserved) return false
    }
    return true
  }

  private pickVariant(p: Pending): { line: NarratorLine; slot: number | undefined } | null {
    const spec = KIND_SPECS[p.kind]
    const subjectSlot = (l: NarratorLine): number | undefined | null => {
      if (l.subject === 'none') return undefined
      const s = l.subject === 'actor' ? p.actor : p.victim
      return s >= 0 && this.players[s] ? s : null
    }
    const all = LINES_BY_KIND[p.kind].filter(l => subjectSlot(l) !== null)
    let pool = all.filter(l => !this.used.has(l.id))
    if (!pool.length) {
      if (!spec.reuse || !all.length) return null
      const oldest = Math.min(...all.map(l => this.used.get(l.id) ?? 0))
      pool = all.filter(l => (this.used.get(l.id) ?? 0) === oldest)
    }
    const naming = pool.filter(l => {
      const s = subjectSlot(l)
      return s !== undefined && s !== null && this.isHuman(s)
    })
    if (naming.length) pool = naming
    const line = pool[Math.floor(this.rand() * pool.length)] ?? pool[0]
    const slot = subjectSlot(line)
    return { line, slot: slot ?? undefined }
  }

  private lineDuration(line: NarratorLine, slot: number | undefined): number {
    const colorIndex = slot !== undefined ? this.players[slot]?.colorIndex : undefined
    return this.durationOf?.(line.id, colorIndex) ?? estimateDuration(line.id, colorIndex)
  }

  /**
   * Une réplique d'événement ne doit pas empêcher une réplique d'horloge imminente (heure dorée,
   * couchant, Grande Ombre, dix secondes) : elle ne démarre que si l'écart qu'elle imposerait est
   * écoulé avant l'instant de l'horloge (temps réel ≈ temps de soleil hors ralenti).
   */
  private clearOfClock(p: Pending, duration: number, state: SimState): boolean {
    if (KIND_SPECS[p.kind].scope !== 'round') return true
    const k = this.scale(state)
    for (const kind of RESERVED_CLOCK) {
      const at = CLOCK_AT[kind]
      if (at === undefined || this.clockFired.has(kind)) continue
      const dt = at * k - state.sun.t
      if (dt < 0) continue
      const need = KIND_SPECS[kind].priority <= 1 ? Math.max(RULES.narratorUrgentGap, duration + BREATH) : RULES.narratorMinGap
      if (dt < need) return false
    }
    return true
  }

  private dispatch(p: Pending, line: NarratorLine, slot: number | undefined, duration: number, now: number): NarratorCue {
    const spec = KIND_SPECS[p.kind]
    const colorIndex = slot !== undefined ? this.players[slot]?.colorIndex : undefined
    this.used.set(line.id, ++this.seq)
    this.roundCount.set(p.kind, (this.roundCount.get(p.kind) ?? 0) + 1)
    this.matchCount.set(p.kind, (this.matchCount.get(p.kind) ?? 0) + 1)
    this.groupAt.set(spec.gapGroup ?? p.kind, now)
    if (spec.scope === 'round' || spec.scope === 'clock') this.roundLines++
    if (p.kind === 'idle') this.idleSaid.add(p.actor)
    if (p.kind === 'lastRound') this.lastRoundAnnounced = true
    this.lastStart = now
    this.lastEnd = now + duration
    this.queue = this.queue.filter(q => q.group !== p.group)
    return {
      lineId: line.id,
      kind: p.kind,
      ...(colorIndex !== undefined ? { colorIndex, slot } : {}),
      priority: p.priority,
      key: `narrator.${line.id}`,
      duration,
    }
  }

  private isHuman(slot: number): boolean {
    return slot >= 0 && !!this.players[slot]?.human
  }

  private isLastDoubleRound(): boolean {
    return this.match.lastRoundDouble && this.match.rounds > 1 && this.round === this.match.rounds
  }
}

function inputChanged(a: BirdInput, b: BirdInput): boolean {
  return (
    Math.abs(a.dirX - b.dirX) > INPUT_EPS ||
    Math.abs(a.dirY - b.dirY) > INPUT_EPS ||
    a.dive !== b.dive ||
    a.divePresses !== b.divePresses ||
    a.flapPresses !== b.flapPresses
  )
}

/** Durée estimée d'un clip (texte de la langue courante), quand le manifest audio manque. */
export function estimateDuration(lineId: string, colorIndex: number | undefined): number {
  const lang = getLang()
  const text = t(`narrator.${lineId}`, { color: colorIndex === undefined ? '' : colorName(colorIndex, lang) }, lang)
  return EST_BASE + EST_PER_CHAR * text.replace(/\s/g, '').length
}
