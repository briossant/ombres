// Test d'intégration : vrai serveur relais (server/index.ts, mode production) + HostSession +
// PhoneHub + PhoneClient dans Node. Couvre : salle, hello, entrées, vues, reconnexion,
// redémarrage du serveur (salle recréée au même code), rafraîchissement du PC, retrait, salle inconnue.
import { spawn, type ChildProcess } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { HostSession } from './hostSession.ts'
import { PhoneHub, type PhoneInfo } from './phoneHub.ts'
import { PhoneClient } from './phoneClient.ts'
import { memoryStore, type KeyValueStore } from './util.ts'
import { BTN_DIVE, BTN_FLAP, type HostToPhone, type PhoneHello } from '../shared/messages.ts'

const ROOT = join(import.meta.dirname, '../..')
const PORT = 20000 + Math.floor(Math.random() * 20000)
const WS = `ws://127.0.0.1:${PORT}/ws`
let server: ChildProcess | null = null

async function startServer(): Promise<void> {
  const dist = mkdtempSync(join(tmpdir(), 'ombres-dist-'))
  server = spawn(process.execPath, ['--import', 'tsx', 'server/index.ts'], {
    cwd: ROOT,
    env: { ...process.env, NODE_ENV: 'production', PORT: String(PORT), HOST: '127.0.0.1', OMBRES_DIST: dist },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('serveur : démarrage trop long')), 15000)
    server!.stdout!.on('data', (d: Buffer) => {
      if (d.toString().includes('Ombres prod')) {
        clearTimeout(timer)
        resolve()
      }
    })
    server!.on('exit', code => reject(new Error(`serveur arrêté (${code})`)))
  })
}

async function stopServer(): Promise<void> {
  const s = server
  server = null
  if (!s || s.exitCode !== null) return
  await new Promise<void>(resolve => {
    s.removeAllListeners('exit')
    s.on('exit', () => resolve())
    s.kill('SIGKILL')
  })
}

async function until(cond: () => boolean, ms = 8000, what = 'condition'): Promise<void> {
  const t0 = Date.now()
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout : ${what}`)
    await new Promise(r => setTimeout(r, 20))
  }
}

const helloOf = (name: string): Omit<PhoneHello, 'k' | 'v'> => ({
  name,
  color: 4,
  scheme: 'absolute',
  assist: false,
  lang: 'fr',
  caps: { vibrate: true, tilt: false, ios: false },
})

interface TestPhone {
  client: PhoneClient
  inbox: HostToPhone[]
  sockets: WebSocket[]
}

function makePhone(room: string, name: string, local: KeyValueStore = memoryStore(), session: KeyValueStore = memoryStore()): TestPhone {
  const sockets: WebSocket[] = []
  const client = new PhoneClient({
    room,
    url: WS,
    storage: local,
    sessionStorage: session,
    hello: () => helloOf(name),
    createSocket: url => {
      const ws = new WebSocket(url)
      sockets.push(ws)
      return ws
    },
    freshRoomGraceMs: 400,
    roomGraceMs: 20_000,
  })
  const inbox: HostToPhone[] = []
  client.on('message', m => inbox.push(m))
  client.start()
  return { client, inbox, sockets }
}

describe('session réseau de bout en bout', () => {
  const hostStore = memoryStore()
  let session: HostSession
  let hub: PhoneHub
  let room = ''
  const joins: { phone: PhoneInfo; known: boolean }[] = []
  const leaves: string[] = []
  let phone: TestPhone
  const phoneLocal = memoryStore()
  const phoneSession = memoryStore()

  beforeAll(async () => {
    await startServer()
    session = new HostSession({ url: WS, storage: hostStore, pingMs: 1000 })
    hub = new PhoneHub(session, { storage: hostStore })
    hub.on('join', j => joins.push(j))
    hub.on('leave', l => leaves.push(l.phone.id))
    session.start()
    await until(() => session.status === 'online', 8000, 'salle prête')
    room = session.room!
  }, 30_000)

  afterAll(async () => {
    phone?.client.stop()
    hub?.dispose()
    session?.stop()
    await stopServer()
  })

  it('crée une salle et donne l’URL du QR', () => {
    expect(room).toMatch(/^[A-Z]{4}$/)
    expect(session.ready!.joinUrl).toMatch(new RegExp(`/play\\?r=${room}$`))
  })

  it('un téléphone rejoint : join après son hello', async () => {
    phone = makePhone(room, 'Brieuc', phoneLocal, phoneSession)
    await until(() => joins.length === 1, 5000, 'join')
    expect(joins[0]!.known).toBe(false)
    expect(joins[0]!.phone.hello?.name).toBe('Brieuc')
    expect(joins[0]!.phone.hello?.color).toBe(4)
    expect(phone.client.state).toBe('online')
    expect(phone.client.hostOnline).toBe(true)
  })

  it('entrées : stick, PLONGER maintenu, compteurs d’appuis', async () => {
    const c = phone.client
    const id = c.id
    c.setStick(0.3, 0.4)
    c.setButton(BTN_DIVE, true)
    c.setButton(BTN_DIVE, false)
    c.setButton(BTN_DIVE, true)
    c.setButton(BTN_FLAP, true)
    c.setButton(BTN_FLAP, false)
    await until(() => hub.phone(id)!.flapPresses === 1 && hub.phone(id)!.divePresses === 2, 3000, 'compteurs')
    const input = hub.input(id)
    expect(input.dirX).toBeCloseTo(0.3)
    expect(input.dirY).toBeCloseTo(0.4)
    expect(input.dive).toBe(true)
    c.setButton(BTN_DIVE, false)
    await until(() => !hub.input(id).dive, 2000, 'relâché')
  })

  it('RTT remonté par le téléphone', async () => {
    await until(() => hub.phone(phone.client.id)!.phoneRtt !== null, 5000, 'rtt')
    expect(hub.rtt(phone.client.id)).toBeGreaterThanOrEqual(0)
    expect(hub.latencyGraceSeconds(phone.client.id)).toBeLessThanOrEqual(0.1)
  })

  it('vues diffées et retours', async () => {
    const id = phone.client.id
    hub.bindSlot(id, 0)
    const view = {
      screen: 'lobby' as const,
      lang: 'fr' as const,
      you: { slot: 0, name: 'Brieuc', color: 4, leader: true, profileSet: false, ready: false, assist: false, scheme: 'absolute' as const },
      paused: null,
    }
    hub.setView(id, view)
    hub.setView(id, view) // identique : pas renvoyée
    hub.cue(id, 'windup')
    await until(() => phone.inbox.some(m => m.k === 'cue'), 3000, 'cue')
    await new Promise(r => setTimeout(r, 150))
    expect(phone.inbox.filter(m => m.k === 'view')).toHaveLength(1)
    expect(phone.inbox.find(m => m.k === 'cue')).toEqual({ k: 'cue', cue: 'windup' })
  })

  it('reconnexion du téléphone : même id, vue renvoyée', async () => {
    const before = joins.length
    phone.inbox.length = 0
    phone.sockets.at(-1)!.close() // coupure brutale côté téléphone
    await until(() => joins.length === before + 1, 8000, 'rejoin')
    expect(joins.at(-1)!.known).toBe(true)
    expect(leaves).toContain(phone.client.id)
    await until(() => phone.inbox.some(m => m.k === 'view'), 3000, 'vue renvoyée')
  })

  it('redémarrage du serveur : salle recréée au même code, téléphone revenu', async () => {
    const id = phone.client.id
    const presses = hub.phone(id)!.divePresses
    const before = joins.length
    await stopServer()
    await until(() => session.status === 'reconnecting', 8000, 'hôte en reconnexion')
    await until(() => phone.client.state === 'reconnecting', 8000, 'téléphone en reconnexion')
    await new Promise(r => setTimeout(r, 1500))
    await startServer()
    await until(() => session.status === 'online', 10_000, 'hôte revenu')
    expect(session.room).toBe(room)
    await until(() => phone.client.state === 'online' && joins.length > before, 12_000, 'téléphone revenu')
    expect(joins.at(-1)!.known).toBe(true)
    // Les compteurs du hub restent monotones.
    phone.client.setButton(BTN_DIVE, true)
    phone.client.setButton(BTN_DIVE, false)
    await until(() => hub.phone(id)!.divePresses === presses + 1, 3000, 'appui après redémarrage')
  }, 40_000)

  it('rafraîchissement du PC : même salle, téléphones repris, préférences redemandées', async () => {
    const id = phone.client.id
    hub.dispose()
    session.stop()
    await until(() => !phone.client.hostOnline, 5000, 'hôte hors ligne vu par le téléphone')
    const session2 = new HostSession({ url: WS, storage: hostStore, pingMs: 1000 })
    const hub2 = new PhoneHub(session2, { storage: hostStore })
    const joins2: { phone: PhoneInfo; known: boolean }[] = []
    let hellos = 0
    hub2.on('join', j => joins2.push(j))
    hub2.on('hello', () => hellos++)
    session2.start()
    await until(() => session2.status === 'online', 8000, 'reprise')
    expect(session2.ready!.resumed).toBe(true)
    expect(session2.room).toBe(room)
    await until(() => joins2.length === 1 && hellos >= 1, 5000, 'téléphone repris')
    expect(joins2[0]!.known).toBe(true)
    expect(hub2.phone(id)!.slot).toBe(0)
    await until(() => phone.client.hostOnline, 3000, 'hôte en ligne vu par le téléphone')
    session = session2
    hub = hub2
  })

  it('retrait (kick)', async () => {
    const other = makePhone(room, 'Intrus')
    await until(() => other.client.state === 'online', 5000, 'intrus en ligne')
    hub.kick(other.client.id)
    await until(() => other.client.state === 'error', 5000, 'intrus retiré')
    expect(other.client.error).toBe('kicked')
    other.client.stop()
  })

  it('salle inconnue : erreur après une courte patience', async () => {
    const lost = makePhone('ZZZZ', 'Perdu')
    await until(() => lost.client.state === 'error', 5000, 'erreur')
    expect(lost.client.error).toBe('room-not-found')
    lost.client.stop()
  })

  it('même manette ouverte deux fois : la plus ancienne s’arrête', async () => {
    const twin = makePhone(room, 'Jumeau', phoneLocal, memoryStore())
    await until(() => twin.client.state === 'online', 5000, 'jumeau en ligne')
    await until(() => phone.client.state === 'error', 5000, 'original remplacé')
    expect(phone.client.error).toBe('replaced')
    twin.client.stop()
  })
})
