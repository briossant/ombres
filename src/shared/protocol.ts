// Protocole réseau d'Ombres.
//
// Le serveur Node n'est qu'un relais : il gère les salles, les identités et les
// reconnexions, et transporte des messages applicatifs opaques entre le PC
// (l'hôte, qui fait autorité sur la partie) et les téléphones (manettes).
//
//   téléphone ──PhoneToServer──▶ serveur ──ServerToHost (peer:msg)──▶ PC
//   PC ──HostToServer (send)──▶ serveur ──ServerToPhone (host:msg)──▶ téléphone
//
// Tous les messages sont du JSON sur un unique WebSocket par client, chemin /ws.

export const WS_PATH = '/ws'
export const MAX_PHONES = 12
/** Alphabet des codes de salle : pas de lettres ambiguës (I, O, 0, 1). */
export const ROOM_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
export const ROOM_CODE_LENGTH = 4
/** Durée pendant laquelle le serveur garde une salle dont l'hôte est parti. */
export const HOST_GRACE_MS = 10 * 60_000
/** Intervalle des pings applicatifs (mesure de RTT, maintien des proxys). */
export const PING_INTERVAL_MS = 5_000

export type Lang = 'fr' | 'en'

// ─── Transport : hôte ↔ serveur ────────────────────────────────────────────

export type HostToServer =
  /** Créer une salle, ou reprendre une salle existante après un rafraîchissement. */
  | { t: 'host:hello'; room?: string; hostToken?: string }
  /** Relayer un message à un téléphone précis, ou à tous ('*'). */
  | { t: 'send'; to: string; m: HostToPhone }
  /** Retirer un téléphone de la salle (il reçoit phone:error 'kicked'). */
  | { t: 'kick'; to: string }
  | { t: 'ping'; ts: number }

export type ServerToHost =
  | {
      t: 'host:ready'
      room: string
      hostToken: string
      /** true si une salle existante a été reprise (rafraîchissement du PC). */
      resumed: boolean
      /** Téléphones actuellement connectés à la salle. */
      peers: string[]
      /** Origine à encoder dans le QR code (IP LAN en dev, URL publique en prod). */
      joinOrigin: string
    }
  | { t: 'peer:join'; id: string; resumed: boolean }
  | { t: 'peer:leave'; id: string }
  | { t: 'peer:msg'; id: string; m: PhoneToHost }
  | { t: 'pong'; ts: number }

// ─── Transport : téléphone ↔ serveur ───────────────────────────────────────

export type PhoneToServer =
  /** `id` est un identifiant persistant (localStorage) : il permet la reconnexion. */
  | { t: 'phone:hello'; room: string; id: string }
  | { t: 'send'; m: PhoneToHost }
  | { t: 'ping'; ts: number }

export type PhoneErrorCode = 'room-not-found' | 'room-full' | 'kicked' | 'bad-request'

export type ServerToPhone =
  | { t: 'phone:ready'; room: string; hostOnline: boolean }
  | { t: 'phone:error'; code: PhoneErrorCode }
  /** L'écran PC s'est déconnecté (rafraîchissement…) ou est revenu. */
  | { t: 'host:status'; online: boolean }
  | { t: 'host:msg'; m: HostToPhone }
  | { t: 'pong'; ts: number }

// ─── Messages applicatifs (opaques pour le serveur) ────────────────────────
// Ils sont définis dans src/shared/messages.ts, qui évolue avec le jeu.

export type { HostToPhone, PhoneToHost } from './messages.ts'
import type { HostToPhone, PhoneToHost } from './messages.ts'
