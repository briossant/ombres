// Indications contextuelles (apprentissage intégré, GDD §15.4) : logique PURE.
//
// Dix indications, chacune montrée au plus une fois à un joueur humain, au plus une toutes les
// RULES.hintMinGap s par joueur, au moment où elle sert. Réglage « Conseils » (settings.hints) :
// - auto     : seulement celles que ce joueur n'a jamais vues (mémoire injectée : localStorage du
//              PC par identifiant de téléphone, ou ce que le téléphone renvoie) ;
// - always   : toutes, une fois par partie, même déjà vues ;
// - never    : aucune.
// Sortie : des HintCue { slot, hintId, … } → bulle à la couleur du joueur près de son oiseau sur la TV
// (ou bandeau pour les indications générales) et message sur son téléphone.
//
// Temps : tout se mesure en temps de simulation (state.time) ; la pause gèle donc les indications.
import { RULES } from '../sim/rules.ts'
import type { BirdInput, BirdState, SimEvent, SimState } from '../sim/types.ts'
import type { HintsMode } from '../host/settings.ts'

export type HintId =
  | 'holdDive' // 6 s sans PLONGER
  | 'releaseClimb' // 8 s d'affilée au ras du sable
  | 'firstLock' // première cible verrouillée
  | 'dodge' // premier piqué subi (prise d'élan)
  | 'paleOnStrong' // ombre pâle sur du fort adverse pendant 1,5 s
  | 'towerShade' // première cachette dans l'ombre d'une tour
  | 'aimShadow' // premier décalage oiseau-ombre > 15 m
  | 'crown' // première couronne de la partie (tous)
  | 'golden' // début de l'heure dorée (tous, bandeau)
  | 'greatShadow' // début de la Grande Ombre (tous, bandeau)

export type HintEffect =
  | 'pulseThread' // le fil d'encre oiseau → ombre pulse (rendu des oiseaux)
  | 'arrowNorthSouth' // flèche nord-sud dans le bandeau : voler en travers des ombres
  | 'arrowEast' // flèche vers l'est dans le bandeau : fuir la nuit

export interface HintDef {
  id: HintId
  /** 'player' : concerne un joueur ; 'all' : tous les humains en même temps. */
  audience: 'player' | 'all'
  /** TV : bulle près d'un oiseau, ou bandeau. */
  display: 'bubble' | 'banner'
  effect?: HintEffect
  /** Ordre quand plusieurs attendent pour un même joueur (1 = le plus urgent). */
  urgency: number
}

export const HINT_DEFS: Readonly<Record<HintId, HintDef>> = {
  dodge: { id: 'dodge', audience: 'player', display: 'bubble', urgency: 1 },
  firstLock: { id: 'firstLock', audience: 'player', display: 'bubble', urgency: 2 },
  paleOnStrong: { id: 'paleOnStrong', audience: 'player', display: 'bubble', urgency: 3 },
  releaseClimb: { id: 'releaseClimb', audience: 'player', display: 'bubble', urgency: 4 },
  holdDive: { id: 'holdDive', audience: 'player', display: 'bubble', urgency: 5 },
  towerShade: { id: 'towerShade', audience: 'player', display: 'bubble', urgency: 6 },
  aimShadow: { id: 'aimShadow', audience: 'player', display: 'bubble', effect: 'pulseThread', urgency: 7 },
  crown: { id: 'crown', audience: 'all', display: 'bubble', urgency: 0 },
  golden: { id: 'golden', audience: 'all', display: 'banner', effect: 'arrowNorthSouth', urgency: 0 },
  greatShadow: { id: 'greatShadow', audience: 'all', display: 'banner', effect: 'arrowEast', urgency: 0 },
}

export const HINT_IDS = Object.keys(HINT_DEFS) as HintId[]

/** Indication à afficher MAINTENANT pour un joueur. */
export interface HintCue {
  /** Destinataire (son téléphone ; sa bulle sur la TV). */
  slot: number
  hintId: HintId
  /** Clé i18n : t(key, hintParams(cue, lang)) — voir hintText(). */
  key: string
  display: 'bubble' | 'banner'
  /** Oiseau près duquel placer la bulle sur la TV (le destinataire, ou le couronné) ; -1 pour un bandeau. */
  anchorSlot: number
  /** Couleur citée dans le texte (firstLock : la cible). */
  colorIndex?: number
  effect?: HintEffect
  /** Indication générale : la TV n'en montre qu'une, quel que soit le nombre de destinataires. */
  broadcast: boolean
}

/** Mémoire « déjà vue », fournie par l'appelant (persistance hors de ce module). */
export interface HintMemory {
  has(playerKey: string, hintId: HintId): boolean
  add(playerKey: string, hintId: HintId): void
}

export interface HintPlayer {
  slot: number
  /** Identité persistante du joueur (id du téléphone, « kb1 » pour le clavier…). */
  key: string
  human: boolean
  colorIndex: number
}

interface PendingHint {
  hintId: HintId
  since: number
  colorIndex?: number
  /** L'indication est-elle encore d'actualité ? */
  valid: (s: SimState) => boolean
  /**
   * « dodge » : chasseur dont on attend le clac (diveCommit) avant d'afficher, −1 sinon.
   * Une feinte annule le piqué avant le clac : l'indication tombe sans être marquée vue.
   */
  awaitClacFrom?: number
}

interface PlayerTrack {
  lastHintAt: number
  pending: PendingHint[]
  divedThisRound: boolean
  lowSince: number
  paleSince: number
  lastPaleEventAt: number
}

// ─── Réglages de présentation ───────────────────────────────────────────────

/** Un événement « tsk » (paleOnStrong) compte comme présent pendant cette durée (s). */
const PALE_EVENT_HOLD = 0.5
/** Part de l'empreinte d'ombre sur du sable fort adverse à partir de laquelle on parle de « pâle sur fort ». */
const PALE_ON_STRONG_FRAC = 0.5
/** Au-delà, une indication d'événement (verrouillage, piqué) qui n'a pas pu s'afficher est oubliée (s). */
const EVENT_HINT_MAX_AGE = 3
/**
 * Plus aucune bulle individuelle à partir de la Grande Ombre (tout le monde fuit vers l'est ;
 * seul le bandeau parle), ni dans les … s qui la précèdent (T = 110) : une bulle dure 2,5 à 6 s.
 */
const QUIET_BEFORE_GREAT_SHADOW = 1.5
const NO_CUES: readonly HintCue[] = Object.freeze([])

// ─── Mémoires fournies ──────────────────────────────────────────────────────

/** Mémoire en RAM (tests, mode sans stockage). */
export function createMemoryHintStore(): HintMemory & { clear(): void } {
  const seen = new Set<string>()
  return {
    has: (k, id) => seen.has(`${k}:${id}`),
    add: (k, id) => void seen.add(`${k}:${id}`),
    clear: () => seen.clear(),
  }
}

/** Stockage clé-valeur minimal (localStorage convient). Erreurs d'accès ignorées. */
export interface KeyValueStore {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

/**
 * Mémoire persistée dans un stockage clé-valeur : une entrée JSON par joueur,
 * `<prefix><playerKey>` → liste des indications vues.
 */
export function createKeyValueHintMemory(store: KeyValueStore, prefix = 'ombres.hints.v1.'): HintMemory {
  const cache = new Map<string, Set<HintId>>()
  const load = (k: string): Set<HintId> => {
    let set = cache.get(k)
    if (set) return set
    set = new Set()
    try {
      const raw = store.getItem(prefix + k)
      if (raw) for (const id of JSON.parse(raw) as HintId[]) if (id in HINT_DEFS) set.add(id)
    } catch {
      // stockage indisponible ou corrompu : on repart de zéro
    }
    cache.set(k, set)
    return set
  }
  return {
    has: (k, id) => load(k).has(id),
    add: (k, id) => {
      const set = load(k)
      set.add(id)
      try {
        store.setItem(prefix + k, JSON.stringify([...set]))
      } catch {
        // ignoré : la mémoire reste valable pour la session
      }
    },
  }
}

// ─── Géométrie ──────────────────────────────────────────────────────────────

/**
 * Part (0..1) de l'empreinte d'ombre d'un oiseau PÂLE posée sur du sable FORT d'un autre joueur
 * (non figé) : la situation où son ombre ne peint rien (GDD §6.2). 9 points dans l'ellipse.
 */
export function paleOnStrongFraction(state: SimState, b: BirdState): number {
  if (b.strong || b.stun > 0 || b.hidden || b.inNight) return 0
  const g = state.grid
  const sh = b.shadow
  const ax = state.sun.shadowDirX
  const ay = state.sun.shadowDirY
  let total = 0
  let hit = 0
  for (let k = -1; k < 8; k++) {
    let x = sh.cx
    let y = sh.cy
    if (k >= 0) {
      const a = (k / 8) * Math.PI * 2
      const along = Math.cos(a) * 0.6 * sh.rAlong
      const across = Math.sin(a) * 0.6 * sh.r
      x += ax * along - ay * across
      y += ay * along + ax * across
    }
    const col = Math.floor((x - g.x0) / g.cellW)
    const row = Math.floor((y - g.y0) / g.cellH)
    if (col < 0 || row < 0 || col >= g.cols || row >= g.rows) continue
    const i = row * g.cols + col
    if (!g.inArena[i]) continue
    total++
    const owner = g.owner[i]
    if (g.level[i] === RULES.levelStrong && owner !== 0 && owner !== b.slot + 1 && !g.frozen[i]) hit++
  }
  return total ? hit / total : 0
}

// ─── Directeur ──────────────────────────────────────────────────────────────

export class HintsDirector {
  private memory: HintMemory
  private mode: HintsMode
  private players: (HintPlayer | undefined)[] = []
  private tracks: PlayerTrack[] = []
  /** Indications montrées dans la partie en cours, par joueur (clé persistante). */
  private shownThisMatch = new Map<string, Set<HintId>>()
  private crownSeenThisMatch = false

  constructor(options: { memory: HintMemory; mode?: HintsMode }) {
    this.memory = options.memory
    this.mode = options.mode ?? 'auto'
  }

  setMode(mode: HintsMode): void {
    this.mode = mode
    if (mode === 'never') for (const t of this.tracks) if (t) t.pending = []
  }

  setMemory(memory: HintMemory): void {
    this.memory = memory
  }

  /** Joueurs présents (à rappeler à chaque changement ; human = kind !== 'bot'). */
  setPlayers(players: readonly HintPlayer[]): void {
    this.players = []
    for (const p of players) this.players[p.slot] = p
  }

  startMatch(): void {
    this.shownThisMatch.clear()
    this.crownSeenThisMatch = false
  }

  startRound(): void {
    this.tracks = []
  }

  /** Un tick de simulation. Retourne les indications à afficher maintenant (souvent aucune). */
  update(state: SimState, events: readonly SimEvent[], inputs?: ReadonlyArray<BirdInput | undefined>): readonly HintCue[] {
    if (state.config.mode !== 'round' || this.mode === 'never') return NO_CUES
    const sun = state.sun
    if (sun.phase === 'countdown' || sun.phase === 'night' || sun.phase === 'over' || state.over) return NO_CUES
    const now = state.time
    let out: HintCue[] | null = null // appelé à 30 Hz : on n'alloue que s'il y a quelque chose à montrer
    const emit = (cue: HintCue) => void (out ??= []).push(cue)
    const quiet = sun.phase === 'greatShadow' || sun.t >= (RULES.greatShadowAt - QUIET_BEFORE_GREAT_SHADOW) * (sun.T / RULES.roundSunSeconds)
    for (const e of events) this.onEvent(e, now, emit, quiet)
    if (quiet) {
      // la fin de manche appartient au bandeau de la Grande Ombre : les bulles en attente tombent
      this.clear()
      return out ?? NO_CUES
    }
    for (const b of state.birds) {
      if (this.players[b.slot]?.human) this.watchBird(state, b, now, inputs?.[b.slot])
    }
    for (const b of state.birds) {
      const cue = this.serve(state, b.slot, now)
      if (cue) emit(cue)
    }
    return out ?? NO_CUES
  }

  /** Oublie les indications en attente (pause, fin de manche). */
  clear(): void {
    for (const t of this.tracks) if (t) t.pending = []
  }

  // ─── Événements ───────────────────────────────────────────────────────────

  private onEvent(e: SimEvent, now: number, out: (cue: HintCue) => void, quiet: boolean): void {
    switch (e.type) {
      case 'phase':
        if (e.phase === 'golden' || e.phase === 'greatShadow') this.broadcast(e.phase, -1, now, out)
        break
      case 'crown':
        // bulle sur le couronné : pas pendant la fuite de la Grande Ombre (elle attendra une autre couronne)
        if (e.slot >= 0 && !this.crownSeenThisMatch && !quiet) {
          this.crownSeenThisMatch = true
          this.broadcast('crown', e.slot, now, out)
        }
        break
      case 'lock': {
        const target = this.players[e.target]
        if (!this.players[e.hunter]?.human || !target) break
        this.queue(e.hunter, {
          hintId: 'firstLock',
          since: now,
          colorIndex: target.colorIndex,
          valid: s => s.bySlot[e.hunter]?.lockTarget === e.target && s.time - now <= EVENT_HINT_MAX_AGE,
        })
        break
      }
      case 'diveWindup':
        // mise en file à la prise d'élan, montrée seulement au clac (« Au clac : COUP D'AILE ! »)
        if (!this.players[e.target]?.human || quiet) break
        this.queue(e.target, {
          hintId: 'dodge',
          since: now,
          awaitClacFrom: e.hunter,
          valid: s => {
            const h = s.bySlot[e.hunter]
            return !!h && h.dive !== 'none' && h.diveTarget === e.target && s.time - now <= EVENT_HINT_MAX_AGE
          },
        })
        break
      case 'diveCommit': {
        const tr = this.tracks[e.target]
        if (tr) for (const q of tr.pending) if (q.hintId === 'dodge' && q.awaitClacFrom === e.hunter) q.awaitClacFrom = -1
        break
      }
      case 'paleOnStrong':
        this.track(e.slot).lastPaleEventAt = now
        break
      default:
        break
    }
  }

  // ─── Conditions durables ──────────────────────────────────────────────────

  private watchBird(state: SimState, b: BirdState, now: number, input: BirdInput | undefined): void {
    const s = b.slot
    const tr = this.track(s)
    const tSun = state.sun.t

    // PLONGER jamais utilisé depuis le début de la manche
    if (b.targetLow || input?.dive) tr.divedThisRound = true
    if (!tr.divedThisRound && tSun >= RULES.hintNoDiveAfter && this.wants(s, 'holdDive')) {
      this.queue(s, { hintId: 'holdDive', since: now, valid: () => !this.track(s).divedThisRound })
    }

    // Au ras du sable trop longtemps
    if (!b.targetLow) tr.lowSince = NaN
    else if (Number.isNaN(tr.lowSince)) tr.lowSince = now
    else if (now - tr.lowSince >= RULES.hintLowTooLong && this.wants(s, 'releaseClimb')) {
      this.queue(s, { hintId: 'releaseClimb', since: now, valid: st => !!st.bySlot[s]?.targetLow })
    }

    // Ombre pâle sur du sable fort adverse (la grille n'est lue que si l'indication peut encore servir)
    const pale =
      !b.strong &&
      this.eligible(s, 'paleOnStrong') &&
      (now - tr.lastPaleEventAt <= PALE_EVENT_HOLD || paleOnStrongFraction(state, b) >= PALE_ON_STRONG_FRAC)
    if (!pale) tr.paleSince = NaN
    else if (Number.isNaN(tr.paleSince)) tr.paleSince = now
    else if (now - tr.paleSince >= RULES.hintPaleOnStrongSeconds && this.wants(s, 'paleOnStrong')) {
      this.queue(s, { hintId: 'paleOnStrong', since: now, valid: () => !Number.isNaN(this.track(s).paleSince) })
    }

    // Caché dans l'ombre d'une tour
    if (b.hidden && !b.inNight && this.wants(s, 'towerShade')) {
      this.queue(s, { hintId: 'towerShade', since: now, valid: st => !!st.bySlot[s]?.hidden && !st.bySlot[s]?.inNight })
    }

    // L'ombre s'éloigne de l'oiseau
    const off = Math.hypot(b.shadow.cx - b.x, b.shadow.cy - b.y)
    if (off > RULES.hintShadowOffsetMin && this.wants(s, 'aimShadow')) {
      this.queue(s, {
        hintId: 'aimShadow',
        since: now,
        valid: st => {
          const bb = st.bySlot[s]
          return !!bb && Math.hypot(bb.shadow.cx - bb.x, bb.shadow.cy - bb.y) > RULES.hintShadowOffsetMin
        },
      })
    }
  }

  // ─── File et diffusion ────────────────────────────────────────────────────

  private track(slot: number): PlayerTrack {
    return (this.tracks[slot] ??= {
      lastHintAt: -Infinity,
      pending: [],
      divedThisRound: false,
      lowSince: NaN,
      paleSince: NaN,
      lastPaleEventAt: -Infinity,
    })
  }

  private eligible(slot: number, hintId: HintId): boolean {
    const p = this.players[slot]
    if (!p?.human || this.mode === 'never') return false
    if (this.shownThisMatch.get(p.key)?.has(hintId)) return false
    return this.mode === 'always' || !this.memory.has(p.key, hintId)
  }

  /** L'indication peut-elle encore être mise en attente pour ce joueur ? (sans rien allouer) */
  private wants(slot: number, hintId: HintId): boolean {
    const tr = this.tracks[slot]
    if (tr) for (const q of tr.pending) if (q.hintId === hintId) return false
    return this.eligible(slot, hintId)
  }

  private queue(slot: number, h: PendingHint): void {
    if (!this.eligible(slot, h.hintId)) return
    const tr = this.track(slot)
    if (tr.pending.some(q => q.hintId === h.hintId)) return
    tr.pending.push(h)
  }

  private serve(state: SimState, slot: number, now: number): HintCue | null {
    const tr = this.tracks[slot]
    if (!tr?.pending.length) return null
    // Tri sur place des indications encore d'actualité (30 Hz : pas d'allocation).
    let n = 0
    let awaiting = false
    for (const h of tr.pending) {
      if (!this.eligible(slot, h.hintId) || !h.valid(state)) continue
      tr.pending[n++] = h
      if ((h.awaitClacFrom ?? -1) >= 0) awaiting = true
    }
    tr.pending.length = n
    // un piqué arrive sur lui : rien d'autre avant son clac (l'indication du coup d'aile passe alors devant)
    if (!n || awaiting || now - tr.lastHintAt < RULES.hintMinGap) return null
    tr.pending.sort((a, b) => HINT_DEFS[a.hintId].urgency - HINT_DEFS[b.hintId].urgency || a.since - b.since)
    const h = tr.pending.shift()!
    return this.emit(slot, h.hintId, slot, now, h.colorIndex)
  }

  /** Indication générale : tous les humains qui ne l'ont pas encore vue, sans attendre l'écart. */
  private broadcast(hintId: HintId, anchorSlot: number, now: number, out: (cue: HintCue) => void): void {
    for (const p of this.players) {
      if (!p || !this.eligible(p.slot, hintId)) continue
      out(this.emit(p.slot, hintId, anchorSlot, now))
    }
  }

  private emit(slot: number, hintId: HintId, anchorSlot: number, now: number, colorIndex?: number): HintCue {
    const def = HINT_DEFS[hintId]
    const p = this.players[slot]!
    let shown = this.shownThisMatch.get(p.key)
    if (!shown) this.shownThisMatch.set(p.key, (shown = new Set()))
    shown.add(hintId)
    this.memory.add(p.key, hintId)
    const tr = this.track(slot)
    tr.lastHintAt = now
    tr.pending = tr.pending.filter(h => h.hintId !== hintId)
    return {
      slot,
      hintId,
      key: `hints.${hintId}`,
      display: def.display,
      anchorSlot: def.display === 'banner' ? -1 : anchorSlot,
      ...(colorIndex !== undefined ? { colorIndex } : {}),
      ...(def.effect ? { effect: def.effect } : {}),
      broadcast: def.audience === 'all',
    }
  }
}
