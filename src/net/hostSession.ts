// Session réseau du PC (hôte) : un WebSocket vers le relais (server/), une salle.
//
// - Crée la salle, ou la reprend après un rafraîchissement du PC (code + jeton en sessionStorage).
// - Se reconnecte seule (0,5 → 4 s) ; si le serveur a redémarré (redeploy ≈ 30 s), la salle est
//   recréée avec le même code et le même jeton : les téléphones s'y reconnectent d'eux-mêmes.
// - Ping applicatif (RTT hôte ↔ serveur, maintien des proxys) et chien de garde : une connexion
//   silencieuse trop longtemps est considérée morte et relancée.
// - Événements typés : ready, status, peerJoin, peerLeave, peerMsg, rtt.
//
// Ce module ne connaît pas le jeu : l'abstraction « téléphones / joueurs » est dans phoneHub.ts.
import {
  PING_INTERVAL_MS,
  WS_PATH,
  type HostToServer,
  type ServerToHost,
} from '../shared/protocol.ts'
import type { HostToPhone, PhoneToHost } from '../shared/messages.ts'
import {
  Backoff,
  RttEstimator,
  TypedEmitter,
  defaultWsUrl,
  now,
  withRole,
  readJson,
  webStore,
  type KeyValueStore,
} from './util.ts'

export type HostSessionStatus =
  | 'idle' // pas encore démarrée, ou arrêtée
  | 'connecting' // première connexion
  | 'online' // salle prête
  | 'reconnecting' // connexion perdue, nouvelle tentative programmée
  | 'replaced' // un autre onglet a repris la salle : on ne se reconnecte pas tout seul

export interface HostReady {
  room: string
  /** true si la salle existait déjà (rafraîchissement du PC ou redémarrage du serveur). */
  resumed: boolean
  /** Téléphones connectés à la salle au moment de la reprise. */
  peers: string[]
  /** Origine à encoder dans le QR code. */
  joinOrigin: string
  /** URL complète à encoder dans le QR code (…/play?r=CODE). */
  joinUrl: string
}

export interface HostSessionEvents {
  ready: HostReady
  status: HostSessionStatus
  peerJoin: { id: string; resumed: boolean }
  peerLeave: { id: string }
  peerMsg: { id: string; m: PhoneToHost }
  /** RTT hôte ↔ serveur (ms, médiane glissante). */
  rtt: number
}

export interface HostSessionOptions {
  /** URL WebSocket du relais, sans le rôle (défaut : même origine que la page + WS_PATH). */
  url?: string
  /** Où garder code + jeton (défaut : sessionStorage, propre à l'onglet). */
  storage?: KeyValueStore
  /** Fabrique de WebSocket (tests). */
  createSocket?: (url: string) => WebSocket
  /** Intervalle de ping (ms). */
  pingMs?: number
}

interface SavedRoom {
  room: string
  hostToken: string
}

const STORAGE_KEY = 'ombres.host.room.v1'
/** Sans aucun message pendant ce délai, la connexion est jugée morte. */
const DEAD_AFTER_PINGS = 2.5
/** Connexion encore en cours après ce délai : abandon et nouvelle tentative. */
const CONNECT_TIMEOUT_MS = 8000

/** Construit l'URL du QR code. Corrige le schéma quand un proxy TLS l'a mal transmis. */
export function joinUrlFor(joinOrigin: string, room: string, pageProtocol?: string): string {
  let origin = joinOrigin.replace(/\/$/, '')
  if (pageProtocol === 'https:' && origin.startsWith('http://')) {
    const host = origin.slice('http://'.length)
    // Même hôte que la page servie en https : le proxy a oublié x-forwarded-proto.
    if (globalThis.location && host === globalThis.location.host) origin = `https://${host}`
  }
  return `${origin}/play?r=${encodeURIComponent(room)}`
}

export class HostSession extends TypedEmitter<HostSessionEvents> {
  private readonly store: KeyValueStore
  private readonly url: string
  private readonly createSocket: (url: string) => WebSocket
  private readonly pingMs: number
  private readonly backoff = new Backoff()
  private readonly rttEstimator = new RttEstimator()

  private ws: WebSocket | null = null
  private _status: HostSessionStatus = 'idle'
  private _ready: HostReady | null = null
  private saved: SavedRoom | null
  private lastMessageAt = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null
  private tickTimer: ReturnType<typeof setInterval> | null = null
  private lastPingAt = 0
  private connectStartedAt = 0
  private detachWindow: (() => void) | null = null

  constructor(opts: HostSessionOptions = {}) {
    super()
    this.store = opts.storage ?? webStore('session')
    this.url = withRole(opts.url ?? defaultWsUrl(WS_PATH), 'host')
    this.createSocket = opts.createSocket ?? (url => new WebSocket(url))
    this.pingMs = opts.pingMs ?? PING_INTERVAL_MS
    this.saved = readJson<SavedRoom>(this.store, STORAGE_KEY)
  }

  // ─── État public ───────────────────────────────────────────────────────

  get status(): HostSessionStatus {
    return this._status
  }

  /** Dernière salle prête (reste disponible pendant une reconnexion). */
  get ready(): HostReady | null {
    return this._ready
  }

  get room(): string | null {
    return this._ready?.room ?? this.saved?.room ?? null
  }

  get online(): boolean {
    return this._status === 'online'
  }

  /** RTT hôte ↔ serveur en ms (médiane glissante, 0 avant la première mesure). */
  get rtt(): number {
    return this.rttEstimator.value
  }

  // ─── Cycle de vie ──────────────────────────────────────────────────────

  start(): void {
    if (this._status !== 'idle' && this._status !== 'replaced') return
    this.setStatus('connecting')
    this.attachWindow()
    this.tickTimer ??= setInterval(() => this.tick(), 1000)
    this.connect()
  }

  stop(): void {
    this.clearReconnect()
    if (this.tickTimer) clearInterval(this.tickTimer)
    this.tickTimer = null
    this.detachWindow?.()
    this.detachWindow = null
    this.dropSocket(1000, 'stop')
    this.setStatus('idle')
  }

  /** Reprend la salle quand un autre onglet l'avait prise (statut 'replaced'). */
  takeOver(): void {
    if (this._status !== 'replaced') return
    this.backoff.reset()
    this.setStatus('connecting')
    this.connect()
  }

  /** Oublie la salle : la prochaine connexion (ou `restart`) en crée une nouvelle. */
  forgetRoom(): void {
    this.saved = null
    this._ready = null
    this.store.remove(STORAGE_KEY)
  }

  /** Nouvelle salle immédiatement (nouveau code, les téléphones actuels sont perdus). */
  newRoom(): void {
    this.forgetRoom()
    this.dropSocket(1000, 'new room')
    this.backoff.reset()
    this.setStatus('connecting')
    this.connect()
  }

  // ─── Envoi ─────────────────────────────────────────────────────────────

  /** Message à un téléphone. Faux si la connexion n'est pas prête (le message est perdu). */
  send(to: string, m: HostToPhone): boolean {
    return this.raw({ t: 'send', to, m })
  }

  /** Message à tous les téléphones de la salle. */
  broadcast(m: HostToPhone): boolean {
    return this.raw({ t: 'send', to: '*', m })
  }

  /** Retire un téléphone de la salle (il reçoit l'erreur « kicked »). */
  kick(id: string): boolean {
    return this.raw({ t: 'kick', to: id })
  }

  private raw(msg: HostToServer): boolean {
    const ws = this.ws
    if (!ws || ws.readyState !== WebSocket.OPEN || this._status !== 'online') return false
    try {
      ws.send(JSON.stringify(msg))
      return true
    } catch {
      return false
    }
  }

  // ─── Connexion ─────────────────────────────────────────────────────────

  private connect(): void {
    this.clearReconnect()
    this.dropSocket(1000, 'reconnect')
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
      const hello: HostToServer = this.saved
        ? { t: 'host:hello', room: this.saved.room, hostToken: this.saved.hostToken }
        : { t: 'host:hello' }
      ws.send(JSON.stringify(hello))
    })
    ws.addEventListener('message', ev => {
      if (this.ws !== ws) return
      this.lastMessageAt = now()
      let msg: ServerToHost
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : String(ev.data)) as ServerToHost
      } catch {
        return
      }
      this.onMessage(msg)
    })
    // Socket perdu : `close` dans les navigateurs ; Node (undici) n'émet parfois que `error`
    // quand la connexion est refusée. Les deux mènent ici, une seule fois par socket.
    const down = (code: number) => {
      if (this.ws !== ws) return
      this.ws = null
      try {
        ws.close()
      } catch {
        // ignoré
      }
      if (code === 4000) {
        // Un autre onglet (onglet dupliqué, même sessionStorage) a repris la salle.
        this.setStatus('replaced')
        return
      }
      if (this._status === 'idle') return
      this.scheduleReconnect()
    }
    ws.addEventListener('close', ev => down(ev.code))
    ws.addEventListener('error', () => down(1006))
  }

  private onMessage(msg: ServerToHost): void {
    switch (msg.t) {
      case 'host:ready': {
        this.saved = { room: msg.room, hostToken: msg.hostToken }
        this.store.set(STORAGE_KEY, JSON.stringify(this.saved))
        this.backoff.reset()
        const pageProtocol = globalThis.location?.protocol
        this._ready = {
          room: msg.room,
          resumed: msg.resumed,
          peers: msg.peers,
          joinOrigin: msg.joinOrigin,
          joinUrl: joinUrlFor(msg.joinOrigin, msg.room, pageProtocol),
        }
        this.setStatus('online')
        this.emit('ready', this._ready)
        this.ping()
        break
      }
      case 'peer:join':
        this.emit('peerJoin', { id: msg.id, resumed: msg.resumed })
        break
      case 'peer:leave':
        this.emit('peerLeave', { id: msg.id })
        break
      case 'peer:msg':
        if (msg.m && typeof msg.m === 'object') this.emit('peerMsg', { id: msg.id, m: msg.m })
        break
      case 'pong': {
        const rtt = now() - msg.ts
        if (rtt >= 0 && rtt < 30_000) this.emit('rtt', this.rttEstimator.add(rtt))
        break
      }
    }
  }

  private ping(): void {
    this.lastPingAt = now()
    this.raw({ t: 'ping', ts: this.lastPingAt })
  }

  /** Battement d'une seconde : ping périodique et chien de garde. */
  private tick(): void {
    const t = now()
    const ws = this.ws
    if (ws && ws.readyState === WebSocket.CONNECTING && t - this.connectStartedAt > CONNECT_TIMEOUT_MS) {
      // Poignée de main TCP/TLS qui traîne (réseau mobile) : on recommence.
      this.dropSocket(1000, 'connect timeout')
      this.scheduleReconnect()
      return
    }
    if (ws && ws.readyState === WebSocket.OPEN && this._status !== 'online' && t - this.lastMessageAt > CONNECT_TIMEOUT_MS) {
      // Socket ouvert mais pas de host:ready : poignée de main perdue, on recommence.
      this.dropSocket(4100, 'no ready')
      this.scheduleReconnect()
      return
    }
    if (this._status === 'online' && ws) {
      if (t - this.lastMessageAt > this.pingMs * DEAD_AFTER_PINGS) {
        // Connexion à moitié morte (Wi-Fi coupé, proxy) : on n'attend pas le timeout TCP.
        this.dropSocket(4100, 'silent')
        this.scheduleReconnect()
        return
      }
      if (t - this.lastPingAt >= this.pingMs) this.ping()
    }
  }

  private scheduleReconnect(): void {
    if (this._status === 'idle' || this._status === 'replaced') return
    this.clearReconnect()
    this.setStatus(this._ready || this.saved ? 'reconnecting' : 'connecting')
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this.connect()
    }, this.backoff.next())
  }

  /** Reconnexion immédiate (retour au premier plan, réseau revenu). */
  private reconnectNow(): void {
    if (this._status !== 'reconnecting' && this._status !== 'connecting') return
    if (this.ws && this.ws.readyState === WebSocket.CONNECTING) return
    this.backoff.reset()
    this.connect()
  }

  private clearReconnect(): void {
    if (this.reconnectTimer) clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  /** Abandonne le socket courant sans attendre sa fermeture (ses événements sont ignorés). */
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

  private setStatus(status: HostSessionStatus): void {
    if (status === this._status) return
    this._status = status
    this.emit('status', status)
  }

  private attachWindow(): void {
    if (this.detachWindow || typeof window === 'undefined' || typeof document === 'undefined') return
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (this._status === 'online') this.ping()
      else this.reconnectNow()
    }
    const onOnline = () => this.reconnectNow()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    this.detachWindow = () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }
}
