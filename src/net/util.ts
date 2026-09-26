// Petits outils partagés par la session hôte et le client téléphone.
// Aucune dépendance au DOM obligatoire : ces modules tournent aussi dans Node (tools/mock-host.ts).

// ─── Stockage clé/valeur protégé ───────────────────────────────────────────

export interface KeyValueStore {
  get(key: string): string | null
  set(key: string, value: string): void
  remove(key: string): void
}

/** Stockage en mémoire (Node, navigation privée stricte, tests). */
export function memoryStore(): KeyValueStore {
  const map = new Map<string, string>()
  return {
    get: key => map.get(key) ?? null,
    set: (key, value) => void map.set(key, value),
    remove: key => void map.delete(key),
  }
}

/**
 * localStorage / sessionStorage avec repli en mémoire : l'accès peut lever
 * (Safari privé, stockage bloqué) ou ne pas exister (Node).
 */
export function webStore(kind: 'local' | 'session'): KeyValueStore {
  const fallback = memoryStore()
  const storage = (): Storage | null => {
    try {
      return kind === 'local' ? globalThis.localStorage : globalThis.sessionStorage
    } catch {
      return null
    }
  }
  return {
    get(key) {
      try {
        return storage()?.getItem(key) ?? fallback.get(key)
      } catch {
        return fallback.get(key)
      }
    },
    set(key, value) {
      fallback.set(key, value)
      try {
        storage()?.setItem(key, value)
      } catch {
        // quota ou stockage refusé : la copie mémoire suffit pour cette page
      }
    },
    remove(key) {
      fallback.remove(key)
      try {
        storage()?.removeItem(key)
      } catch {
        // ignoré
      }
    },
  }
}

export function readJson<T>(store: KeyValueStore, key: string): T | null {
  const raw = store.get(key)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    return null
  }
}

// ─── Émetteur typé ─────────────────────────────────────────────────────────

/** Émetteur d'événements typé par une table { nom: charge utile }. */
export class TypedEmitter<Events extends object> {
  private handlers = new Map<keyof Events, Set<(payload: never) => void>>()

  on<K extends keyof Events>(event: K, handler: (payload: Events[K]) => void): () => void {
    let set = this.handlers.get(event)
    if (!set) this.handlers.set(event, (set = new Set()))
    set.add(handler as (payload: never) => void)
    return () => void set.delete(handler as (payload: never) => void)
  }

  protected emit<K extends keyof Events>(event: K, payload: Events[K]): void {
    const set = this.handlers.get(event)
    if (!set) return
    for (const h of [...set]) {
      try {
        ;(h as (p: Events[K]) => void)(payload)
      } catch (err) {
        // Un abonné fautif ne doit pas casser la session réseau.
        console.error(`[net] handler "${String(event)}"`, err)
      }
    }
  }
}

// ─── Reconnexion ───────────────────────────────────────────────────────────

/** Délais de reconnexion : 0,5 → 1 → 2 → 4 s (plafond), avec ±20 % de gigue pour étaler une salle entière. */
export class Backoff {
  private attempt = 0
  constructor(
    private readonly minMs = 500,
    private readonly maxMs = 4000,
    private readonly jitter = 0.2,
    private readonly random: () => number = Math.random,
  ) {}

  next(): number {
    const base = Math.min(this.maxMs, this.minMs * 2 ** this.attempt)
    this.attempt++
    return Math.round(base * (1 + (this.random() * 2 - 1) * this.jitter))
  }

  reset(): void {
    this.attempt = 0
  }

  get attempts(): number {
    return this.attempt
  }
}

// ─── Mesure de RTT ─────────────────────────────────────────────────────────

/**
 * Estimation robuste du RTT : médiane glissante des derniers échantillons
 * (une pointe Wi-Fi isolée ne fait pas bondir la grâce de latence).
 */
export class RttEstimator {
  private samples: number[] = []
  constructor(private readonly size = 7) {}

  add(ms: number): number {
    if (!Number.isFinite(ms) || ms < 0) return this.value
    this.samples.push(ms)
    if (this.samples.length > this.size) this.samples.shift()
    return this.value
  }

  /** Médiane en ms (0 tant qu'aucun échantillon). */
  get value(): number {
    if (this.samples.length === 0) return 0
    const sorted = [...this.samples].sort((a, b) => a - b)
    const mid = sorted.length >> 1
    return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2
  }

  get count(): number {
    return this.samples.length
  }

  reset(): void {
    this.samples = []
  }
}

/** Horloge monotone en ms. */
export const now = (): number => (typeof performance !== 'undefined' ? performance.now() : Date.now())

/** URL WebSocket du serveur de jeu depuis la page courante (ws: en http, wss: en https). */
export function defaultWsUrl(path: string): string {
  const loc = globalThis.location
  if (!loc) throw new Error('defaultWsUrl: pas de location (passer une URL explicite hors navigateur)')
  const proto = loc.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${loc.host}${path}`
}

/** Ajoute le rôle attendu par le relais (`?role=host|phone`) à une URL WebSocket. */
export function withRole(url: string, role: 'host' | 'phone'): string {
  const u = new URL(url)
  u.searchParams.set('role', role)
  return u.toString()
}

/** Identifiant aléatoire hexadécimal (crypto si disponible). */
export function randomHex(bytes: number): string {
  const buf = new Uint8Array(bytes)
  if (globalThis.crypto?.getRandomValues) globalThis.crypto.getRandomValues(buf)
  else for (let i = 0; i < bytes; i++) buf[i] = Math.floor(Math.random() * 256)
  return [...buf].map(b => b.toString(16).padStart(2, '0')).join('')
}
