// Hub des téléphones, côté PC : ce que le runner (phase 3) branche pour parler aux manettes.
//
//   const session = new HostSession(); const hub = new PhoneHub(session); session.start()
//   hub.on('join', ({ phone, hello }) => …)      // créer / reprendre le joueur (slot, couleur)
//   hub.bindSlot(phone.id, slot)                 // lier le téléphone à son oiseau
//   // à chaque tick de simulation :
//   const input = hub.inputForSlot(slot, bird.heading)      // BirdInput (null si pas de téléphone)
//   hub.updateFromSim(sim.state, events, colorOf)           // vibrations + bandeau de chaque manette
//   // quand l'écran change :
//   hub.setView(phone.id, { screen: 'lobby', … })           // diffé, limité en fréquence
//
// Le hub ne décide rien du jeu (couleurs, lancement, remplacement par un bot) : il transporte,
// valide, convertit et limite. Détail de l'API : docs/agent-notes/net-phone.md.
import type { BirdInput, SimEvent, SimState } from '../sim/types.ts'
import { RULES } from '../sim/rules.ts'
import { MAX_PLAYERS } from '../shared/players.ts'
import {
  BTN_DIVE,
  CONTROL_SCHEMES,
  PROTOCOL_VERSION,
  sanitizeName,
  type ControlScheme,
  type HostToPhone,
  type PhoneAction,
  type PhoneCue,
  type PhoneHello,
  type PhoneStatus,
  type PhoneToHost,
  type PhoneView,
  type ToastParams,
  type ToastTone,
} from '../shared/messages.ts'
import type { HostReady, HostSession, HostSessionStatus } from './hostSession.ts'
import { CueRouter, statusEqual, statusFromSim, statusUrgent, type CueTarget } from './phoneCues.ts'
import { toBirdInput, type PhoneControlState } from './phoneInput.ts'
import { TypedEmitter, now, readJson, webStore, type KeyValueStore } from './util.ts'

/** Vue telle que le runner la fournit (le hub ajoute `k` et `v`). */
export type PhoneViewInput = Omit<PhoneView, 'k' | 'v'>

/** Ce que le runner peut lire d'un téléphone. */
export interface PhoneInfo {
  readonly id: string
  /** Socket connecté au relais. */
  readonly online: boolean
  /** Horloge `now()` (ms) de la déconnexion, null si en ligne. */
  readonly offlineSince: number | null
  /** Préférences envoyées par le téléphone (null tant qu'aucun hello n'est arrivé). */
  readonly hello: PhoneHello | null
  readonly scheme: ControlScheme
  readonly assist: boolean
  /** Slot lié (bindSlot), null si aucun. */
  readonly slot: number | null
  /** RTT téléphone ↔ serveur rapporté par le téléphone (ms), null avant la première mesure. */
  readonly phoneRtt: number | null
  /** Dernière entrée reçue. */
  readonly seq: number
  readonly x: number
  readonly y: number
  readonly buttons: number
  /** Compteurs monotones d'appuis (jamais remis à zéro, même si la page du téléphone recharge). */
  readonly divePresses: number
  readonly flapPresses: number
  /** now() (ms) du dernier paquet d'entrée, et de la dernière entrée non neutre. */
  readonly lastInputAt: number
  readonly lastActivityAt: number
}

export interface PhoneHubEvents {
  /** Salle prête (code + URL du QR), y compris après une reprise. */
  session: HostReady
  status: HostSessionStatus
  /**
   * Un téléphone rejoint (après son hello, ou 1,5 s sans hello) ou revient.
   * `known` : déjà connu de ce hub (reconnexion, rafraîchissement du PC).
   */
  join: { phone: PhoneInfo; known: boolean }
  /** Socket perdu. Le runner remplace le joueur par un bot après RULES.playerDropToBotSeconds (offlineSeconds). */
  leave: { phone: PhoneInfo }
  hello: { phone: PhoneInfo; hello: PhoneHello }
  profile: { phone: PhoneInfo; name: string; color: number | null }
  ready: { phone: PhoneInfo; ready: boolean }
  scheme: { phone: PhoneInfo; scheme: ControlScheme }
  assist: { phone: PhoneInfo; on: boolean }
  action: { phone: PhoneInfo; action: PhoneAction }
}

export interface PhoneHubOptions {
  /** Persistance des téléphones connus (défaut : sessionStorage, survit au rafraîchissement du PC). */
  storage?: KeyValueStore
  /** Intervalle minimal entre deux statuts non urgents (ms). */
  statusMinGapMs?: number
}

interface PhoneRecord {
  id: string
  online: boolean
  offlineSince: number | null
  hello: PhoneHello | null
  scheme: ControlScheme
  assist: boolean
  slot: number | null
  phoneRtt: number | null
  seq: number
  x: number
  y: number
  buttons: number
  divePresses: number
  flapPresses: number
  lastInputAt: number
  lastActivityAt: number
  // interne
  /** Derniers compteurs bruts du téléphone (base de calcul des deltas), null = prochain paquet sert de base. */
  lastD: number | null
  lastF: number | null
  joinAnnounced: boolean
  helloTimer: ReturnType<typeof setTimeout> | null
  view: string | null
  viewSentAt: number
  viewPending: boolean
  status: PhoneStatus | null
  statusSent: PhoneStatus | null
  statusSentAt: number
}

interface SavedPhone {
  id: string
  slot: number | null
  scheme: ControlScheme
  assist: boolean
  hello: PhoneHello | null
  d: number
  f: number
}

const STORAGE_KEY = 'ombres.hub.phones.v1'
const HELLO_WAIT_MS = 1500
const VIEW_MIN_GAP_MS = 50
const FLUSH_MS = 50

const ACTIONS: readonly PhoneAction[] = ['start', 'rematch', 'toLobby', 'pause', 'resume']

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v)
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
const isColor = (v: unknown): v is number => isInt(v) && v >= 0 && v < MAX_PLAYERS

export class PhoneHub extends TypedEmitter<PhoneHubEvents> {
  private readonly records = new Map<string, PhoneRecord>()
  private readonly store: KeyValueStore
  private readonly statusMinGapMs: number
  private readonly cues = new CueRouter()
  private readonly scratch: PhoneControlState = { x: 0, y: 0, dive: false, divePresses: 0, flapPresses: 0, scheme: 'absolute' }
  private readonly offSession: (() => void)[] = []
  private flushTimer: ReturnType<typeof setInterval> | null = null
  private saveTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    readonly session: HostSession,
    opts: PhoneHubOptions = {},
  ) {
    super()
    this.store = opts.storage ?? webStore('session')
    this.statusMinGapMs = opts.statusMinGapMs ?? 250
    this.restore()
    this.offSession.push(
      session.on('ready', r => this.onReady(r)),
      session.on('status', s => this.onSessionStatus(s)),
      session.on('peerJoin', p => this.onPeerJoin(p.id)),
      session.on('peerLeave', p => this.onPeerLeave(p.id)),
      session.on('peerMsg', p => this.onPeerMsg(p.id, p.m)),
    )
    this.flushTimer = setInterval(() => this.flush(), FLUSH_MS)
  }

  dispose(): void {
    for (const off of this.offSession) off()
    this.offSession.length = 0
    if (this.flushTimer) clearInterval(this.flushTimer)
    this.flushTimer = null
    this.saveNow()
    for (const r of this.records.values()) if (r.helloTimer) clearTimeout(r.helloTimer)
  }

  // ─── Lecture ───────────────────────────────────────────────────────────

  /** Téléphones connus (en ligne ou non), dans l'ordre d'arrivée. */
  phones(): PhoneInfo[] {
    return [...this.records.values()]
  }

  phone(id: string): PhoneInfo | undefined {
    return this.records.get(id)
  }

  phoneForSlot(slot: number): PhoneInfo | undefined {
    for (const r of this.records.values()) if (r.slot === slot) return r
    return undefined
  }

  /** Secondes depuis la déconnexion (0 si en ligne, Infinity si inconnu). */
  offlineSeconds(id: string): number {
    const r = this.records.get(id)
    if (!r) return Infinity
    if (r.online || r.offlineSince === null) return 0
    return (now() - r.offlineSince) / 1000
  }

  /**
   * Âge de la dernière entrée (s). Un téléphone connecté envoie un battement à 1 Hz :
   * au-delà de ~2,5 s, sa page est probablement suspendue (écran verrouillé) même si le socket tient.
   */
  inputAgeSeconds(id: string): number {
    const r = this.records.get(id)
    if (!r || r.lastInputAt === 0) return Infinity
    return (now() - r.lastInputAt) / 1000
  }

  /** Téléphone qui ne pilote plus (déconnecté, ou silencieux depuis `silentSeconds`). */
  isAway(id: string, silentSeconds = 2.5): boolean {
    const r = this.records.get(id)
    if (!r) return true
    return !r.online || this.inputAgeSeconds(id) > silentSeconds
  }

  /** RTT complet téléphone → serveur → PC (ms) : RTT du téléphone + RTT du PC. */
  rtt(id: string): number {
    const r = this.records.get(id)
    const host = this.session.rtt
    return (r?.phoneRtt ?? host) + host
  }

  /** Grâce de latence pour l'esquive (GDD §8.6) : min(RULES.latencyGraceMax, RTT/2), en secondes. */
  latencyGraceSeconds(id: string): number {
    return Math.min(RULES.latencyGraceMax, this.rtt(id) / 2000)
  }

  // ─── Entrées ───────────────────────────────────────────────────────────

  /**
   * BirdInput d'un téléphone. `heading` (cap courant de l'oiseau) sert au mode Relatif.
   * Hors ligne : stick neutre et PLONGER relâché, compteurs conservés.
   */
  input(id: string, heading = 0, out?: BirdInput): BirdInput {
    const r = this.records.get(id)
    const res = out ?? { dirX: 0, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }
    if (!r) {
      res.dirX = res.dirY = 0
      res.dive = false
      return res
    }
    // Objet de travail réutilisé : appelé à chaque tick pour chaque téléphone, sans allocation.
    const live = r.online
    const s = this.scratch
    s.x = live ? r.x : 0
    s.y = live ? r.y : 0
    s.dive = live && (r.buttons & BTN_DIVE) !== 0
    s.divePresses = r.divePresses
    s.flapPresses = r.flapPresses
    s.scheme = r.scheme
    return toBirdInput(s, heading, res)
  }

  /** BirdInput du téléphone lié à un slot, null si aucun téléphone n'y est lié. */
  inputForSlot(slot: number, heading = 0, out?: BirdInput): BirdInput | null {
    const r = this.phoneForSlot(slot)
    return r ? this.input(r.id, heading, out) : null
  }

  // ─── Liaison joueur ────────────────────────────────────────────────────

  /** Lie un téléphone à un slot (null pour délier). Un slot n'a qu'un téléphone. */
  bindSlot(id: string, slot: number | null): void {
    const r = this.records.get(id)
    if (!r) return
    if (slot !== null) for (const other of this.records.values()) if (other !== r && other.slot === slot) other.slot = null
    if (r.slot !== slot) {
      r.slot = slot
      r.status = r.statusSent = null
      this.scheduleSave()
    }
  }

  /** Oublie un téléphone (joueur retiré du salon). Ne le déconnecte pas : voir kick. */
  forget(id: string): void {
    const r = this.records.get(id)
    if (!r) return
    if (r.helloTimer) clearTimeout(r.helloTimer)
    this.records.delete(id)
    this.scheduleSave()
  }

  /** Retire un téléphone de la salle (écran « Tu as été retiré » sur le téléphone). */
  kick(id: string): void {
    this.session.kick(id)
    this.forget(id)
  }

  // ─── Sorties ───────────────────────────────────────────────────────────

  /** Écran d'un téléphone. Envoyé seulement s'il a changé (≤ 20 envois/s), renvoyé à chaque reconnexion. */
  setView(id: string, view: PhoneViewInput): void {
    const r = this.records.get(id)
    if (!r) return
    const full: PhoneView = { k: 'view', v: PROTOCOL_VERSION, ...view }
    const json = JSON.stringify(full)
    if (json === r.view) return
    r.view = json
    r.viewPending = true
    if (now() - r.viewSentAt >= VIEW_MIN_GAP_MS) this.sendView(r)
  }

  /** Même vue pour tous les téléphones connus, personnalisée par `build` (null = ne rien envoyer). */
  setViews(build: (phone: PhoneInfo) => PhoneViewInput | null): void {
    for (const r of this.records.values()) {
      const v = build(r)
      if (v) this.setView(r.id, v)
    }
  }

  /** Dernière vue envoyée (ou en attente) à un téléphone. */
  lastView(id: string): PhoneView | null {
    const json = this.records.get(id)?.view
    return json ? (JSON.parse(json) as PhoneView) : null
  }

  /** État vivant de la manette (diffé : urgent = immédiat, le reste ≤ 4 Hz). */
  setStatus(id: string, status: PhoneStatus): void {
    const r = this.records.get(id)
    if (!r) return
    if (statusEqual(r.statusSent, status)) {
      r.status = null
      return
    }
    r.status = status
    if (statusUrgent(r.statusSent, status) || now() - r.statusSentAt >= this.statusMinGapMs) this.sendStatus(r)
  }

  /** Retour d'événement (vibration + visuel) à un téléphone. */
  cue(id: string, cue: PhoneCue, n?: number): void {
    const r = this.records.get(id)
    if (r?.online) this.session.send(id, n === undefined ? { k: 'cue', cue } : { k: 'cue', cue, n })
  }

  /** Retour d'événement au téléphone lié à un slot (sans effet pour un bot ou le clavier). */
  cueSlot(slot: number, cue: PhoneCue, n?: number): void {
    const r = this.phoneForSlot(slot)
    if (r) this.cue(r.id, cue, n)
  }

  /** Retour d'événement à tous les téléphones liés à un oiseau. */
  cueAll(cue: PhoneCue, n?: number): void {
    for (const r of this.records.values()) if (r.slot !== null) this.cue(r.id, cue, n)
  }

  /** Vibration brute. */
  haptic(id: string, pattern: number[]): void {
    this.send(id, { k: 'haptic', pattern })
  }

  /**
   * Message court traduit sur le téléphone. Un paramètre numérique `color` (ou `…Color`)
   * est un index de couleur, affiché par son nom dans la langue du téléphone.
   */
  toast(id: string, key: string, params?: ToastParams, tone: ToastTone = 'info'): void {
    this.send(id, params ? { k: 'toast', key, params, tone } : { k: 'toast', key, tone })
  }

  toastSlot(slot: number, key: string, params?: ToastParams, tone: ToastTone = 'info'): void {
    const r = this.phoneForSlot(slot)
    if (r) this.toast(r.id, key, params, tone)
  }

  /**
   * Branchement direct sur la simulation, à appeler après chaque step() :
   * vibrations et retours de chaque téléphone lié, puis bandeau (rang, part, PIQUER, recharges).
   * @param colorOf index de couleur d'un slot (PIQUER prend la couleur de la cible).
   */
  updateFromSim(state: SimState, events: readonly SimEvent[], colorOf: (slot: number) => number): void {
    if (events.length) this.cues.route(events, state, (target: CueTarget, cue, n) => (target === 'all' ? this.cueAll(cue, n) : this.cueSlot(target, cue, n)))
    for (const r of this.records.values()) {
      if (r.slot === null || !r.online) continue
      const st = statusFromSim(state, r.slot, colorOf)
      if (st) this.setStatus(r.id, st)
    }
  }

  /** Nouvelle manche : oublie les limitations de fréquence liées à la précédente. */
  resetRound(): void {
    this.cues.reset()
    for (const r of this.records.values()) r.status = r.statusSent = null
  }

  private send(id: string, m: HostToPhone): boolean {
    const r = this.records.get(id)
    if (!r?.online) return false
    return this.session.send(id, m)
  }

  private sendView(r: PhoneRecord): void {
    if (!r.view || !r.online) return
    if (this.session.send(r.id, JSON.parse(r.view) as PhoneView)) {
      r.viewPending = false
      r.viewSentAt = now()
    }
  }

  private sendStatus(r: PhoneRecord): void {
    const st = r.status
    if (!st || !r.online) return
    if (this.session.send(r.id, st)) {
      r.statusSent = st
      r.status = null
      r.statusSentAt = now()
    }
  }

  /** Envois différés (vues trop rapprochées, statuts non urgents). */
  private flush(): void {
    const t = now()
    for (const r of this.records.values()) {
      if (!r.online) continue
      if (r.viewPending && t - r.viewSentAt >= VIEW_MIN_GAP_MS) this.sendView(r)
      if (r.status && t - r.statusSentAt >= this.statusMinGapMs) this.sendStatus(r)
    }
  }

  // ─── Session ───────────────────────────────────────────────────────────

  private onReady(ready: HostReady): void {
    const peers = new Set(ready.peers)
    const t = now()
    for (const r of this.records.values()) {
      if (peers.has(r.id)) continue
      if (r.online) {
        r.online = false
        r.offlineSince = t
        this.emit('leave', { phone: r })
      }
    }
    this.emit('session', ready)
    for (const id of peers) this.onPeerJoin(id)
    // Rafraîchissement du PC : les téléphones n'ont pas bougé, on leur redemande leurs préférences.
    if (ready.peers.length) this.session.broadcast({ k: 'who' })
  }

  private onSessionStatus(status: HostSessionStatus): void {
    this.emit('status', status)
    if (status === 'online') return
    // Connexion au relais perdue : du point de vue du jeu, tous les téléphones sont injoignables.
    const t = now()
    for (const r of this.records.values()) {
      if (!r.online) continue
      r.online = false
      r.offlineSince = t
      this.emit('leave', { phone: r })
    }
  }

  private onPeerJoin(id: string): void {
    let r = this.records.get(id)
    const known = !!r
    if (!r) {
      r = this.newRecord(id)
      this.records.set(id, r)
    }
    r.online = true
    r.offlineSince = null
    r.lastD = r.lastF = null
    r.buttons = 0
    r.lastInputAt = now()
    r.statusSent = null
    // Renvoi de l'écran courant : le téléphone a pu tout perdre (rechargement de page).
    if (r.view) r.viewPending = true
    this.flush()
    if (known && r.joinAnnounced) {
      this.emit('join', { phone: r, known: true })
      return
    }
    // Nouveau téléphone : on attend son hello (nom, couleur préférée) avant d'annoncer le joueur.
    if (r.helloTimer) clearTimeout(r.helloTimer)
    const rec = r
    rec.helloTimer = setTimeout(() => this.announce(rec, known), HELLO_WAIT_MS)
    if (rec.hello) this.announce(rec, known)
    this.scheduleSave()
  }

  private announce(r: PhoneRecord, known: boolean): void {
    if (r.helloTimer) clearTimeout(r.helloTimer)
    r.helloTimer = null
    if (r.joinAnnounced && !known) return
    if (!this.records.has(r.id) || !r.online) return
    r.joinAnnounced = true
    this.emit('join', { phone: r, known })
  }

  private onPeerLeave(id: string): void {
    const r = this.records.get(id)
    if (!r || !r.online) return
    r.online = false
    r.offlineSince = now()
    r.buttons = 0
    if (r.joinAnnounced) this.emit('leave', { phone: r })
  }

  private onPeerMsg(id: string, m: PhoneToHost): void {
    let r = this.records.get(id)
    if (!r) {
      // Message d'un téléphone dont le peer:join a été manqué (reprise) : on l'adopte.
      this.onPeerJoin(id)
      r = this.records.get(id)
      if (!r) return
    }
    if (!r.online) {
      r.online = true
      r.offlineSince = null
    }
    switch (m.k) {
      case 'in':
        this.onInput(r, m)
        break
      case 'hello':
        this.onHello(r, m)
        break
      case 'profile': {
        if (typeof m.name !== 'string') return
        const color = isColor(m.color) ? m.color : null
        this.emit('profile', { phone: r, name: sanitizeName(m.name), color })
        break
      }
      case 'ready':
        if (typeof m.ready === 'boolean') this.emit('ready', { phone: r, ready: m.ready })
        break
      case 'scheme':
        if (CONTROL_SCHEMES.includes(m.scheme) && m.scheme !== r.scheme) {
          r.scheme = m.scheme
          this.scheduleSave()
          this.emit('scheme', { phone: r, scheme: m.scheme })
        }
        break
      case 'assist':
        if (typeof m.on === 'boolean' && m.on !== r.assist) {
          r.assist = m.on
          this.scheduleSave()
          this.emit('assist', { phone: r, on: m.on })
        }
        break
      case 'action':
        if (ACTIONS.includes(m.action)) this.emit('action', { phone: r, action: m.action })
        break
      case 'net':
        if (isNum(m.rtt) && m.rtt >= 0 && m.rtt < 10_000) r.phoneRtt = m.rtt
        break
      default:
        break
    }
  }

  private onInput(r: PhoneRecord, m: { seq: number; x: number; y: number; b: number; d: number; f: number }): void {
    if (!isInt(m.seq) || !isNum(m.x) || !isNum(m.y) || !isInt(m.b) || !isInt(m.d) || !isInt(m.f)) return
    // Paquet plus ancien que le dernier reçu sur cette connexion : ignoré.
    if (r.lastD !== null && m.seq <= r.seq) return
    const t = now()
    if (r.lastD === null || r.lastF === null) {
      // Premier paquet de la connexion : sert de base (le téléphone a pu recharger sa page).
      r.lastD = m.d
      r.lastF = m.f
    } else {
      const dd = Math.max(0, Math.min(16, m.d - r.lastD))
      const df = Math.max(0, Math.min(16, m.f - r.lastF))
      r.divePresses += dd
      r.flapPresses += df
      r.lastD = m.d
      r.lastF = m.f
      if (dd || df) this.scheduleSave()
    }
    const m2 = Math.hypot(m.x, m.y)
    const x = m2 > 1 ? m.x / m2 : m.x
    const y = m2 > 1 ? m.y / m2 : m.y
    if (x !== r.x || y !== r.y || m.b !== r.buttons) r.lastActivityAt = t
    r.seq = m.seq
    r.x = x
    r.y = y
    r.buttons = m.b & 0xff
    r.lastInputAt = t
  }

  private onHello(r: PhoneRecord, h: PhoneHello): void {
    const hello: PhoneHello = {
      k: 'hello',
      v: isInt(h.v) ? h.v : 0,
      name: typeof h.name === 'string' ? sanitizeName(h.name) || null : null,
      color: isColor(h.color) ? h.color : null,
      scheme: CONTROL_SCHEMES.includes(h.scheme) ? h.scheme : 'absolute',
      assist: h.assist === true,
      lang: h.lang === 'en' ? 'en' : 'fr',
      caps: {
        vibrate: h.caps?.vibrate === true,
        tilt: h.caps?.tilt === true,
        ios: h.caps?.ios === true,
      },
      seenHints: Array.isArray(h.seenHints) ? h.seenHints.filter((k): k is string => typeof k === 'string' && k.length <= 64).slice(0, 64) : [],
    }
    r.hello = hello
    const schemeChanged = r.scheme !== hello.scheme
    const assistChanged = r.assist !== hello.assist
    r.scheme = hello.scheme
    r.assist = hello.assist
    this.scheduleSave()
    this.emit('hello', { phone: r, hello })
    if (r.helloTimer) this.announce(r, false)
    else if (r.joinAnnounced) {
      if (schemeChanged) this.emit('scheme', { phone: r, scheme: r.scheme })
      if (assistChanged) this.emit('assist', { phone: r, on: r.assist })
    }
  }

  // ─── Persistance (rafraîchissement du PC) ──────────────────────────────

  private newRecord(id: string): PhoneRecord {
    return {
      id,
      online: false,
      offlineSince: null,
      hello: null,
      scheme: 'absolute',
      assist: false,
      slot: null,
      phoneRtt: null,
      seq: -1,
      x: 0,
      y: 0,
      buttons: 0,
      divePresses: 0,
      flapPresses: 0,
      lastInputAt: 0,
      lastActivityAt: 0,
      lastD: null,
      lastF: null,
      joinAnnounced: false,
      helloTimer: null,
      view: null,
      viewSentAt: 0,
      viewPending: false,
      status: null,
      statusSent: null,
      statusSentAt: 0,
    }
  }

  private restore(): void {
    const saved = readJson<SavedPhone[]>(this.store, STORAGE_KEY)
    if (!Array.isArray(saved)) return
    const t = now()
    for (const s of saved) {
      if (!s || typeof s.id !== 'string') continue
      const r = this.newRecord(s.id)
      r.slot = isInt(s.slot) ? s.slot : null
      r.scheme = CONTROL_SCHEMES.includes(s.scheme) ? s.scheme : 'absolute'
      r.assist = s.assist === true
      r.hello = s.hello ?? null
      r.divePresses = isInt(s.d) ? s.d : 0
      r.flapPresses = isInt(s.f) ? s.f : 0
      r.offlineSince = t
      r.joinAnnounced = true
      this.records.set(r.id, r)
    }
  }

  private scheduleSave(): void {
    if (this.saveTimer) return
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null
      this.saveNow()
    }, 500)
  }

  private saveNow(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer)
    this.saveTimer = null
    const data: SavedPhone[] = [...this.records.values()].map(r => ({
      id: r.id,
      slot: r.slot,
      scheme: r.scheme,
      assist: r.assist,
      hello: r.hello,
      d: r.divePresses,
      f: r.flapPresses,
    }))
    this.store.set(STORAGE_KEY, JSON.stringify(data))
  }

  /** À appeler juste avant de quitter la page (pagehide) : garde les compteurs d'appuis à jour. */
  persistNow(): void {
    this.saveNow()
  }
}
