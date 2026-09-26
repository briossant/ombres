// Téléphone simulé en Node : parle le protocole de src/shared (protocol.ts + messages.ts) sur /ws.
// Rejoint une salle, envoie hello / profil / entrées 30 Hz / battement / pings, compte ce qu'il reçoit.
import { WebSocket } from 'ws'

const PROTOCOL_VERSION = 2

export class WsPhone {
  constructor(origin, room, { id, name, color = null, lang = 'fr' } = {}) {
    this.url = origin.replace(/^http/, 'ws') + '/ws?role=phone'
    this.room = room
    this.id = id ?? `sim-${Math.random().toString(16).slice(2, 12)}`
    this.name = name ?? `Sim${this.id.slice(-3)}`
    this.color = color
    this.lang = lang
    this.seq = 0
    this.x = 0
    this.y = 0
    this.b = 0
    this.d = 0
    this.f = 0
    this.state = 'idle'
    this.view = null
    this.st = null
    this.counts = {}
    this.bytesIn = 0
    this.msgsIn = 0
    this.errors = []
    this.hostOnline = null
    this.silent = false // socket ouvert mais plus aucun envoi
    this.autoReconnect = true
    this.timers = []
    this.rtts = []
  }

  connect() {
    return new Promise(resolve => {
      const ws = new WebSocket(this.url)
      this.ws = ws
      this.state = 'connecting'
      ws.on('open', () => ws.send(JSON.stringify({ t: 'phone:hello', room: this.room, id: this.id })))
      ws.on('message', data => {
        this.bytesIn += data.length
        this.msgsIn++
        let msg
        try {
          msg = JSON.parse(data.toString())
        } catch {
          return
        }
        switch (msg.t) {
          case 'phone:ready':
            this.state = 'online'
            this.hostOnline = msg.hostOnline
            this.sendHello()
            resolve(true)
            break
          case 'phone:error':
            this.errors.push(msg.code)
            this.state = 'error:' + msg.code
            resolve(false)
            // salle introuvable (serveur redémarré) : on réessaie comme le vrai client (patience 60 s)
            if (msg.code === 'room-not-found' && this.autoReconnect && !this.dead) {
              this.state = 'closed'
              ws.terminate()
            }
            break
          case 'host:status':
            this.hostOnline = msg.online
            break
          case 'host:msg': {
            const m = msg.m
            this.counts[m.k] = (this.counts[m.k] ?? 0) + 1
            if (m.k === 'who') this.sendHello()
            if (m.k === 'view') this.view = m
            if (m.k === 'st') this.st = { ...(this.st ?? {}), ...m }
            if (m.k === 'toast') this.lastToast = m.key
            break
          }
          case 'pong':
            this.rtts.push(Date.now() - msg.ts)
            break
        }
      })
      ws.on('close', code => {
        this.state = this.state.startsWith('error') ? this.state : 'closed'
        this.closeCode = code
        resolve(false)
        if (this.autoReconnect && !this.dead) setTimeout(() => !this.dead && this.connect(), 700)
      })
      ws.on('error', () => {})
    })
  }

  raw(o) {
    if (this.silent) return false
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(o))
      return true
    }
    return false
  }
  send(m) {
    return this.raw({ t: 'send', m })
  }
  sendHello() {
    this.send({ k: 'hello', v: PROTOCOL_VERSION, name: this.name, color: this.color, scheme: 'absolute', assist: false, lang: this.lang, caps: { vibrate: false, tilt: false, ios: false }, seenHints: [] })
  }
  profile(name = this.name, color = this.color) {
    this.send({ k: 'profile', name, color })
  }
  ready(r = true) {
    this.send({ k: 'ready', ready: r })
  }
  action(a) {
    this.send({ k: 'action', action: a })
  }
  input() {
    this.send({ k: 'in', seq: ++this.seq, x: +this.x.toFixed(3), y: +this.y.toFixed(3), b: this.b, d: this.d, f: this.f })
  }

  /** Pilotage aléatoire : 30 Hz, cap qui dérive, PLONGER par périodes, COUP D'AILE de temps en temps. */
  startPiloting(seed = 1) {
    let s = seed
    const rnd = () => ((s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff)
    let ang = rnd() * Math.PI * 2
    let t = 0
    const iv = setInterval(() => {
      t++
      ang += (rnd() - 0.5) * 0.4
      this.x = Math.cos(ang)
      this.y = Math.sin(ang)
      const wasDown = this.b & 1
      const down = Math.floor(t / 90) % 2 === 1
      if (down && !wasDown) this.d++
      this.b = (down ? 1 : 0) | (this.b & ~1)
      if (rnd() < 0.01) this.f++
      this.input()
      if (t % 60 === 0) this.raw({ t: 'ping', ts: Date.now() })
    }, 1000 / 30)
    this.timers.push(iv)
  }

  stopPiloting() {
    for (const iv of this.timers) clearInterval(iv)
    this.timers = []
  }

  drop() {
    // coupure brutale (Wi-Fi perdu) : pas de close propre
    this.ws?.terminate()
  }

  close() {
    this.dead = true
    this.stopPiloting()
    this.ws?.close()
  }
}
