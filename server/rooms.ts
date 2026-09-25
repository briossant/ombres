import { randomBytes, randomInt } from 'node:crypto'
import type { WebSocket } from 'ws'
import {
  HOST_GRACE_MS,
  MAX_PHONES,
  ROOM_ALPHABET,
  ROOM_CODE_LENGTH,
  type HostToServer,
  type PhoneToServer,
  type ServerToHost,
  type ServerToPhone,
} from '../src/shared/protocol.ts'

/** Un téléphone connu de la salle (même déconnecté : il peut revenir). */
interface Peer {
  id: string
  socket: WebSocket | null
}

interface Room {
  code: string
  hostToken: string
  host: WebSocket | null
  hostGoneAt: number
  peers: Map<string, Peer>
}

const rooms = new Map<string, Room>()

function send(ws: WebSocket | null, msg: ServerToHost | ServerToPhone): void {
  if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg))
}

function newRoomCode(): string {
  for (;;) {
    let code = ''
    for (let i = 0; i < ROOM_CODE_LENGTH; i++) code += ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]
    if (!rooms.has(code)) return code
  }
}

function connectedPeerIds(room: Room): string[] {
  return [...room.peers.values()].filter(p => p.socket).map(p => p.id)
}

/** Connexion d'un PC. Retourne le gestionnaire de messages et de fermeture. */
export function attachHost(ws: WebSocket, joinOrigin: string) {
  let room: Room | null = null

  const onMessage = (msg: HostToServer) => {
    switch (msg.t) {
      case 'host:hello': {
        const existing = msg.room ? rooms.get(msg.room) : undefined
        let resumed = false
        if (existing && existing.hostToken === msg.hostToken) {
          // Rafraîchissement du PC : on reprend la salle et ses téléphones.
          if (existing.host && existing.host !== ws) existing.host.close(4000, 'replaced')
          room = existing
          resumed = true
        } else {
          room = {
            code: newRoomCode(),
            hostToken: randomBytes(16).toString('hex'),
            host: null,
            hostGoneAt: 0,
            peers: new Map(),
          }
          rooms.set(room.code, room)
        }
        room.host = ws
        room.hostGoneAt = 0
        send(ws, {
          t: 'host:ready',
          room: room.code,
          hostToken: room.hostToken,
          resumed,
          peers: connectedPeerIds(room),
          joinOrigin,
        })
        for (const p of room.peers.values()) send(p.socket, { t: 'host:status', online: true })
        break
      }
      case 'send': {
        if (!room) return
        const out: ServerToPhone = { t: 'host:msg', m: msg.m }
        if (msg.to === '*') for (const p of room.peers.values()) send(p.socket, out)
        else send(room.peers.get(msg.to)?.socket ?? null, out)
        break
      }
      case 'kick': {
        if (!room) return
        const peer = room.peers.get(msg.to)
        if (peer) {
          send(peer.socket, { t: 'phone:error', code: 'kicked' })
          peer.socket?.close(4001, 'kicked')
          room.peers.delete(msg.to)
        }
        break
      }
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts })
        break
    }
  }

  const onClose = () => {
    if (!room || room.host !== ws) return
    room.host = null
    room.hostGoneAt = Date.now()
    for (const p of room.peers.values()) send(p.socket, { t: 'host:status', online: false })
  }

  return { onMessage, onClose }
}

/** Connexion d'un téléphone. */
export function attachPhone(ws: WebSocket) {
  let room: Room | null = null
  let peer: Peer | null = null

  const onMessage = (msg: PhoneToServer) => {
    switch (msg.t) {
      case 'phone:hello': {
        const r = rooms.get(String(msg.room).toUpperCase())
        if (!r) return send(ws, { t: 'phone:error', code: 'room-not-found' })
        if (typeof msg.id !== 'string' || msg.id.length < 8 || msg.id.length > 64)
          return send(ws, { t: 'phone:error', code: 'bad-request' })
        let p = r.peers.get(msg.id)
        const resumed = !!p
        if (!p) {
          if (r.peers.size >= MAX_PHONES) {
            // Place libérée par un téléphone parti depuis longtemps ? Sinon, salle pleine.
            const gone = [...r.peers.values()].find(x => !x.socket)
            if (!gone) return send(ws, { t: 'phone:error', code: 'room-full' })
            r.peers.delete(gone.id)
          }
          p = { id: msg.id, socket: null }
          r.peers.set(p.id, p)
        }
        if (p.socket && p.socket !== ws) p.socket.close(4002, 'replaced')
        p.socket = ws
        room = r
        peer = p
        send(ws, { t: 'phone:ready', room: r.code, hostOnline: !!r.host })
        send(r.host, { t: 'peer:join', id: p.id, resumed })
        break
      }
      case 'send':
        if (room && peer) send(room.host, { t: 'peer:msg', id: peer.id, m: msg.m })
        break
      case 'ping':
        send(ws, { t: 'pong', ts: msg.ts })
        break
    }
  }

  const onClose = () => {
    if (!room || !peer || peer.socket !== ws) return
    peer.socket = null
    send(room.host, { t: 'peer:leave', id: peer.id })
  }

  return { onMessage, onClose }
}

/** Purge des salles abandonnées (hôte parti depuis trop longtemps). */
export function sweepRooms(now = Date.now()): void {
  for (const [code, room] of rooms) {
    if (!room.host && now - room.hostGoneAt > HOST_GRACE_MS) {
      for (const p of room.peers.values()) {
        send(p.socket, { t: 'phone:error', code: 'room-not-found' })
        p.socket?.close(4003, 'room closed')
      }
      rooms.delete(code)
    }
  }
}

export function roomStats() {
  return { rooms: rooms.size, phones: [...rooms.values()].reduce((n, r) => n + connectedPeerIds(r).length, 0) }
}
