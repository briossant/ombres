// Client réseau du téléphone (la manette).
//
// - Identifiant persistant (localStorage) : le serveur reconnaît le téléphone à la reconnexion.
// - Reconnexion automatique et silencieuse (0,5 → 4 s). Si la salle a disparu parce que le
//   serveur redémarre (redeploy ≈ 30 s), on réessaie pendant ROOM_GRACE_MS avant d'afficher
//   une erreur : le PC recrée la salle avec le même code dès qu'il revient.
// - Entrées envoyées à RULES.inputSendHz quand elles changent, immédiatement à l'appui / au relâché
//   d'un bouton, et en battement à 1 Hz ; compteurs d'appuis monotones.
// - Ping applicatif : RTT téléphone ↔ serveur, remonté au PC (grâce de latence, GDD §8.6),
//   et chien de garde (connexion silencieuse = morte).
import { WS_PATH, ROOM_ALPHABET, ROOM_CODE_LENGTH, type PhoneToServer, type ServerToPhone } from '../shared/protocol.ts'
import {
  BTN_DIVE,
  BTN_FLAP,
  PROTOCOL_VERSION,
  type HostToPhone,
  type PhoneHello,
  type PhoneInput,
  type PhoneToHost,
} from '../shared/messages.ts'
import { PHONE_RULES } from './phoneRules.ts'
import { Backoff, RttEstimator, TypedEmitter, defaultWsUrl, now, randomHex, webStore, withRole, type KeyValueStore } from './util.ts'

export type PhoneConnState =
  | 'idle'
  | 'connecting' // première connexion (recherche de la salle)
  | 'online' // dans la salle
  | 'reconnecting' // connexion perdue, on réessaie sans rien demander
  | 'error' // arrêt : voir `error`

export type PhoneFatal =
  | 'room-not-found'
  | 'room-full'
  | 'kicked'
  | 'bad-request'
  /** La même manette (même id) a été ouverte dans un autre onglet. */
  | 'replaced'

export interface PhoneClientEvents {
  state: { state: PhoneConnState; error: PhoneFatal | null }
  hostOnline: boolean
  message: HostToPhone
  /** RTT téléphone ↔ serveur (ms, médiane glissante). */
  rtt: number
}

export interface PhoneClientOptions {
  room: string
  /** URL WebSocket du relais, sans le rôle (défaut : même origine que la page + WS_PATH). */
  url?: string
  /** Stockage persistant (id du téléphone). Défaut : localStorage. */
  storage?: KeyValueStore
  /** Stockage de session (salles déjà rejointes). Défaut : sessionStorage. */
  sessionStorage?: KeyValueStore
  createSocket?: (url: string) => WebSocket
  /** Préférences envoyées au PC à chaque (re)connexion. */
  hello: () => Omit<PhoneHello, 'k' | 'v'>
  pingMs?: number
  /** Patience quand une salle déjà rejointe est introuvable (défaut ROOM_GRACE_MS). */
  roomGraceMs?: number
  /** Patience pour une salle jamais rejointe (défaut FRESH_ROOM_GRACE_MS). */
  freshRoomGraceMs?: number
}

const ID_KEY = 'ombres.phone.id'
const JOINED_KEY = 'ombres.phone.joined'
/** Salle déjà rejointe puis introuvable : le serveur redémarre sans doute, on patiente. */
export const ROOM_GRACE_MS = 60_000
/** Salle jamais rejointe : petite marge (QR scanné pendant un redéploiement). */
export const FRESH_ROOM_GRACE_MS = 6_000
const HEARTBEAT_MS = 1000
const DEAD_AFTER_MS = 5500
const CONNECT_TIMEOUT_MS = 8000

/** Normalise un code saisi à la main (majuscules, alphabet des codes uniquement). */
export function normalizeRoomCode(raw: string): string {
  return [...raw.toUpperCase()].filter(c => ROOM_ALPHABET.includes(c)).join('').slice(0, ROOM_CODE_LENGTH)
}

export function isRoomCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && [...code].every(c => ROOM_ALPHABET.includes(c))
}

/** Identifiant persistant du téléphone (créé au premier lancement). */
export function phoneId(store: KeyValueStore = webStore('local')): string {
  let id = store.get(ID_KEY)
  if (!id || !/^[0-9a-f]{16,64}$/.test(id)) {
    id = randomHex(16)
    store.set(ID_KEY, id)
  }
  return id
}

const round3 = (v: number) => Math.round(v * 1000) / 1000

export class PhoneClient extends TypedEmitter<PhoneClientEvents> {
  readonly id: string
  private room: string
  private readonly url: string
  private readonly session: KeyValueStore
  private readonly createSocket: (url: string) => WebSocket
  private readonly helloProvider: () => Omit<PhoneHello, 'k' | 'v'>
  private readonly pingMs: number
  private readonly roomGraceMs: number
  private readonly freshRoomGraceMs: number
  private readonly backoff = new Backoff()
  private readonly rttEstimator = new RttEstimator()

  private ws: WebSocket | null = null
  private _state: PhoneConnState = 'idle'
  private _error: PhoneFatal | null = null
  private _hostOnline = false
  private lastMessageAt = 0
  private lastPingAt = 0
  private connectStartedAt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private sendTimer: ReturnType<typeof setTimeout> | null = null
  private notFoundSince: number | null = null
  private detachWindow: (() => void) | null = null
  private lastRttReport = { value: -1, at: -Infinity }

  // Entrée courante
  private seq = 0
  private x = 0
  private y = 0
  private buttons = 0
  private presses = { d: 0, f: 0 }
  private lastInputSentAt = 0
  private inputDirty = false

  constructor(opts: PhoneClientOptions) {
    super()
    this.room = normalizeRoomCode(opts.room)
    this.url = withRole(opts.url ?? defaultWsUrl(WS_PATH), 'phone')
    this.id = phoneId(opts.storage ?? webStore('local'))
    this.session = opts.sessionStorage ?? webStore('session')
    this.createSocket = opts.createSocket ?? (url => new WebSocket(url))
    this.helloProvider = opts.hello
    this.pingMs = opts.pingMs ?? 2000
    this.roomGraceMs = opts.roomGraceMs ?? ROOM_GRACE_MS
    this.freshRoomGraceMs = opts.freshRoomGraceMs ?? FRESH_ROOM_GRACE_MS
  }

  // ─── État ──────────────────────────────────────────────────────────────

  get state(): PhoneConnState {
    return this._state
  }
  get error(): PhoneFatal | null {
    return this._error
  }
  get hostOnline(): boolean {
    return this._hostOnline
  }
  get roomCode(): string {
    return this.room
  }
  /** RTT téléphone ↔ serveur (ms), 0 avant la première mesure. */
  get rtt(): number {
    return this.rttEstimator.value
  }

  // ─── Cycle de vie ──────────────────────────────────────────────────────

  start(): void {
    if (this._state !== 'idle' && this._state !== 'error') return
    this._error = null
    this.notFoundSince = null
    this.backoff.reset()
    this.setState('connecting')
    this.attachWindow()
    this.tickTimer ??= setInterval(() => this.tick(), 250)
    this.connect()
  }

  stop(): void {
    this.clearTimers()
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
    this.detachWindow?.()
    this.detachWindow = null
    this.dropSocket(1000, 'stop')
    this.setState('idle')
  }

  /** Nouvelle tentative après une erreur (bouton « Réessayer »), éventuellement vers une autre salle. */
  retry(room?: string): void {
    if (room !== undefined) this.room = normalizeRoomCode(room)
    this.clearTimers()
    this.dropSocket(1000, 'retry')
    this._error = null
    this._state = 'idle'
    this.start()
  }

  // ─── Entrées de manette ────────────────────────────────────────────────

  /** Vecteur de pilotage (repère écran, y > 0 = haut), disque unité. Envoi limité à RULES.inputSendHz. */
  setStick(x: number, y: number): void {
    const m = Math.hypot(x, y)
    const nx = round3(m > 1 ? x / m : x)
    const ny = round3(m > 1 ? y / m : y)
    if (nx === this.x && ny === this.y) return
    this.x = nx
    this.y = ny
    this.inputDirty = true
    this.scheduleInput()
  }

  /** Appui / relâché d'un bouton (BTN_DIVE, BTN_FLAP) : envoyé immédiatement. */
  setButton(btn: number, down: boolean): void {
    const was = (this.buttons & btn) !== 0
    if (was === down) return
    this.buttons = down ? this.buttons | btn : this.buttons & ~btn
    if (down) {
      if (btn === BTN_DIVE) this.presses.d++
      if (btn === BTN_FLAP) this.presses.f++
    }
    this.sendInputNow()
  }

  /** Relâche tout (perte de focus, changement d'écran). */
  releaseAll(): void {
    const changed = this.buttons !== 0 || this.x !== 0 || this.y !== 0
    this.buttons = 0
    this.x = this.y = 0
    if (changed) this.sendInputNow()
  }

  get pressCounts(): { dive: number; flap: number } {
    return { dive: this.presses.d, flap: this.presses.f }
  }

  // ─── Messages applicatifs ──────────────────────────────────────────────

  /** Envoie un message au PC. Faux si hors ligne (le message est perdu : l'interface le sait). */
  send(m: PhoneToHost): boolean {
    return this.raw({ t: 'send', m })
  }

  /** Renvoie les préférences (nom, couleur préférée, contrôle, aide) au PC. */
  sendHello(): void {
    this.send({ k: 'hello', v: PROTOCOL_VERSION, ...this.helloProvider() })
  }

  private raw(msg: PhoneToServer): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN) return false
    if (msg.t === 'send' && this._state !== 'online') return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }

  private scheduleInput(): void {
    if (this.sendTimer) return
    const gap = 1000 / PHONE_RULES.inputSendHz
    const wait = gap - (now() - this.lastInputSentAt)
    if (wait <= 0) {
      this.sendInputNow()
      return
    }
    this.sendTimer = setTimeout(() => {
      this.sendTimer = null
      if (this.inputDirty) this.sendInputNow()
    }, wait)
  }

  private sendInputNow(): void {
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.sendTimer = null
    const msg: PhoneInput = { k: 'in', seq: ++this.seq, x: this.x, y: this.y, b: this.buttons, d: this.presses.d, f: this.presses.f }
    if (this.send(msg)) {
      this.inputDirty = false
      this.lastInputSentAt = now()
    }
  }

  // ─── Connexion ─────────────────────────────────────────────────────────

  private connect(): void {
    this.clearReconnect()
    this.dropSocket(1000, 'reconnect')
    if (!isRoomCode(this.room)) {
      this.fail('room-not-found')
      return
    }
    let ws: WebSocket
    try {
      ws = this.createSocket(this.url)
    } catch {
      this.scheduleReconnect()
      return
    }
    this.ws = ws
    this.lastMessageAt = this.connectStartedAt = now()
    ws.addEventListener('open', () => {
      if (this.ws !== ws) return
      this.lastMessageAt = now()
      ws.send(JSON.stringify({ t: 'phone:hello', room: this.room, id: this.id } satisfies PhoneToServer))
    })
    ws.addEventListener('message', ev => {
      if (this.ws !== ws) return
      this.lastMessageAt = now()
      let msg: ServerToPhone
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as ServerToPhone
      } catch {
        return
      }
      this.onMessage(msg)
    })
    // `close` dans les navigateurs ; Node (undici) n'émet parfois que `error` sur un refus.
    const down = (code: number) => {
      if (this.ws !== ws) return
      this.ws = null
      try {
        ws.close()
      } catch {
        // ignoré
      }
      if (this._state === 'error' || this._state === 'idle') return
      if (code === 4001) return this.fail('kicked')
      if (code === 4002) return this.fail('replaced')
      this.scheduleReconnect()
    }
    ws.addEventListener('close', ev => down(ev.code))
    ws.addEventListener('error', () => down(1006))
  }

  private onMessage(msg: ServerToPhone): void {
    switch (msg.t) {
      case 'phone:ready': {
        this.notFoundSince = null
        this.backoff.reset()
        this.markJoined()
        this.setState('online')
        this.setHostOnline(msg.hostOnline)
        this.sendHello()
        this.sendInputNow()
        this.ping()
        break
      }
      case 'phone:error':
        if (msg.code === 'room-not-found') this.onRoomNotFound()
        else this.fail(msg.code)
        break
      case 'host:status':
        this.setHostOnline(msg.online)
        break
      case 'host:msg':
        if (!msg.m || typeof msg.m !== 'object') return
        if (msg.m.k === 'who') this.sendHello()
        this.emit('message', msg.m)
        break
      case 'pong': {
        const rtt = now() - msg.ts
        if (rtt < 0 || rtt > 30_000) return
        const value = this.rttEstimator.add(rtt)
        this.emit('rtt', value)
        this.reportRtt(value)
        break
      }
    }
  }

  /** La salle n'existe pas (ou plus) : patience si on l'a déjà rejointe, erreur sinon. */
  private onRoomNotFound(): void {
    const t = now()
    this.notFoundSince ??= t
    const grace = this.hasJoined() ? this.roomGraceMs : this.freshRoomGraceMs
    this.dropSocket(1000, 'room-not-found')
    if (t - this.notFoundSince >= grace) {
      this.fail('room-not-found')
      return
    }
    this.scheduleReconnect()
  }

  private reportRtt(value: number): void {
    const t = now()
    const r = Math.round(value)
    if (Math.abs(r - this.lastRttReport.value) < 4 && t - this.lastRttReport.at < 10_000) return
    if (this.send({ k: 'net', rtt: r })) this.lastRttReport = { value: r, at: t }
  }

  private ping(): void {
    this.lastPingAt = now()
    this.raw({ t: 'ping', ts: this.lastPingAt })
  }

  private tick(): void {
    const t = now()
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.CONNECTING && t - this.connectStartedAt > CONNECT_TIMEOUT_MS) {
      this.dropSocket(1000, 'connect timeout')
      this.scheduleReconnect()
      return
    }
    if (ws && ws.readyState === WebSocket.OPEN && this._state !== 'online' && t - this.lastMessageAt > DEAD_AFTER_MS) {
      // Socket ouvert mais aucune réponse au phone:hello : poignée de main perdue, on recommence.
      this.dropSocket(4100, 'no ready')
      this.scheduleReconnect()
      return
    }
    if (this._state !== 'online' || !ws) return
    if (t - this.lastMessageAt > Math.max(DEAD_AFTER_MS, this.pingMs * 2.5)) {
      this.dropSocket(4100, 'silent')
      this.scheduleReconnect()
      return
    }
    // Rafale de pings juste après la connexion : RTT fiable en quelques secondes.
    const gap = this.rttEstimator.count < 3 ? 500 : this.pingMs
    if (t - this.lastPingAt >= gap) this.ping()
    if (t - this.lastInputSentAt >= HEARTBEAT_MS) this.sendInputNow()
  }

  private scheduleReconnect(): void {
    if (this._state === 'error' || this._state === 'idle') return
    this.clearReconnect()
    if (this._state === 'online') this.setState('reconnecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.backoff.next())
  }

  private reconnectNow(): void {
    if (this._state !== 'reconnecting' && this._state !== 'connecting') return
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return
    this.backoff.reset()
    this.connect()
  }

  private fail(error: PhoneFatal): void {
    this.clearTimers()
    this.dropSocket(1000, error)
    this._error = error
    this.setHostOnline(false)
    this.setState('error')
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  private clearTimers(): void {
    this.clearReconnect()
    if (this.sendTimer) clearTimeout(this.sendTimer)
    this.sendTimer = null
  }

  private dropSocket(code: number, reason: string): void {
    const ws = this.ws
    this.ws = null
    if (!ws) return
    try {
      if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.close(code, reason)
    } catch {
      // ignoré
    }
  }

  private setState(state: PhoneConnState): void {
    if (state === this._state) return
    this._state = state
    this.emit('state', { state, error: this._error })
  }

  private setHostOnline(online: boolean): void {
    if (online === this._hostOnline) return
    this._hostOnline = online
    this.emit('hostOnline', online)
  }

  private hasJoined(): boolean {
    try {
      const list = JSON.parse(this.session.get(JOINED_KEY) ?? '[]') as unknown
      return Array.isArray(list) && list.includes(this.room)
    } catch {
      return false
    }
  }

  private markJoined(): void {
    if (this.hasJoined()) return
    let list: string[] = []
    try {
      const parsed = JSON.parse(this.session.get(JOINED_KEY) ?? '[]') as unknown
      if (Array.isArray(parsed)) list = parsed.filter((c): c is string => typeof c === 'string')
    } catch {
      // ignoré
    }
    list.push(this.room)
    this.session.set(JOINED_KEY, JSON.stringify(list.slice(-8)))
  }

  private attachWindow(): void {
    if (this.detachWindow || typeof window === 'undefined' || typeof document === 'undefined') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') {
        // Page cachée : on relâche tout, l'oiseau ne doit pas rester en piqué.
        this.releaseAll()
        return
      }
      if (this._state === 'online') {
        if (now() - this.lastMessageAt > this.pingMs * 1.5) {
          // Retour de veille : le socket est probablement mort, inutile d'attendre le chien de garde.
          this.dropSocket(4100, 'resume')
          this.setState('reconnecting')
          this.backoff.reset()
          this.connect()
        } else this.ping()
      } else this.reconnectNow()
    }
    const onOnline = () => this.reconnectNow()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    window.addEventListener('pageshow', onVisible)
    this.detachWindow = () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
      window.removeEventListener('pageshow', onVisible)
    }
  }
}
