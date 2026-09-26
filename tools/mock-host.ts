// Faux PC (Node) pour tester la manette de bout en bout, sans le jeu :
// crée une salle via le vrai relais (HostSession + PhoneHub), affiche le code, fait défiler les
// écrans du téléphone (salon → cartes → manette → entre manches → fin), simule verrouillage,
// prise d'élan, clac, rang, couronne, caché, et journalise les entrées reçues.
//
//   npx tsx tools/mock-host.ts [--url=ws://localhost:8803/ws] [--lang=fr|en] [--demo]
//   Commandes (stdin) : lobby | intro | play | roundEnd | matchEnd | pause | resume |
//                       cue <nom> | toast <clé> | kick <n> | status | quit
//
// Importable (tools/phone-e2e.mjs) : `new MockHost({ url })`, puis méthodes publiques.
import { createInterface } from 'node:readline'
import { HostSession } from '../src/net/hostSession.ts'
import { PhoneHub, type PhoneInfo, type PhoneViewInput } from '../src/net/phoneHub.ts'
import { LobbyGoalTracker } from '../src/net/lobbyGoals.ts'
import { memoryStore, type KeyValueStore } from '../src/net/util.ts'
import { RULES } from '../src/sim/rules.ts'
import { PLAYER_COLORS, colorName } from '../src/shared/players.ts'
import type { Lang } from '../src/shared/protocol.ts'
import type { ControlScheme, LobbyGoals, MapKey, PhoneAction, PhoneCue, PhoneScreen, PhoneStatus, Vote } from '../src/shared/messages.ts'

export interface MockPlayer {
  id: string
  slot: number
  name: string
  color: number
  profileSet: boolean
  ready: boolean
  assist: boolean
  scheme: ControlScheme
  vote: Vote | null
  /** Faux état de manche. */
  share: number
  suns: number
  flapReadyAt: number
  lastFlap: number
  lastDive: number
  goalsStrikeAt: number | null
}

export interface MockHostOptions {
  url: string
  lang?: Lang
  log?: (line: string) => void
  /** Journal détaillé des entrées (une ligne par changement). */
  logInputs?: boolean
  /** Stockage partagé entre deux instances : simule un rafraîchissement du PC (même salle). */
  storage?: KeyValueStore
}

const TICK_MS = 1000 / RULES.tickHz
const BOT_COLORS = [11, 6] // Jade, Prune : deux bots factices dans le salon

export class MockHost {
  readonly session: HostSession
  readonly hub: PhoneHub
  readonly players = new Map<string, MockPlayer>()
  readonly inputLog: { at: number; id: string; x: number; y: number; dive: boolean; d: number; f: number }[] = []
  readonly actions: { at: number; id: string; action: PhoneAction | 'ready' | 'profile' | 'scheme' | 'assist' }[] = []
  screen: PhoneScreen = 'lobby'
  lang: Lang
  round = 1
  readonly rounds = 3
  paused: { by: string | null } | null = null
  colorblind = false
  private readonly goals = new LobbyGoalTracker()
  private readonly storage: KeyValueStore
  private readonly log: (line: string) => void
  private readonly logInputs: boolean
  private timer: ReturnType<typeof setInterval> | null = null
  private screenAt = Date.now()
  private statusOverride: Partial<PhoneStatus> = {}
  private lastLogged = new Map<string, string>()
  private readyWaiter: (() => void) | null = null

  constructor(opts: MockHostOptions) {
    this.lang = opts.lang ?? 'fr'
    this.log = opts.log ?? (line => console.log(line))
    this.logInputs = opts.logInputs ?? true
    const storage = opts.storage ?? memoryStore()
    this.storage = storage
    // Comme le vrai runner (D20), l'état de partie survit au rafraîchissement du PC.
    try {
      const saved = JSON.parse(storage.get('mock.state') ?? 'null') as { players: MockPlayer[]; screen: PhoneScreen; round: number } | null
      if (saved) {
        for (const p of saved.players) this.players.set(p.id, p)
        this.screen = saved.screen
        this.round = saved.round
      }
    } catch {
      // état illisible : partie neuve
    }
    this.session = new HostSession({ url: opts.url, storage, pingMs: 2000 })
    this.hub = new PhoneHub(this.session, { storage })
    this.hub.on('session', r => {
      this.log(`[salle] ${r.room}${r.resumed ? ' (reprise)' : ''} — ${r.joinUrl}`)
      this.readyWaiter?.()
    })
    this.hub.on('status', s => this.log(`[relais] ${s}`))
    this.hub.on('join', ({ phone, known }) => this.onJoin(phone, known))
    this.hub.on('leave', ({ phone }) => this.log(`[départ] ${this.label(phone.id)} (le runner le remplacerait par un bot après ${RULES.playerDropToBotSeconds} s)`))
    this.hub.on('profile', ({ phone, name, color }) => this.onProfile(phone, name, color))
    this.hub.on('ready', ({ phone, ready }) => this.onReady(phone, ready))
    this.hub.on('action', ({ phone, action }) => this.onAction(phone, action))
    this.hub.on('scheme', ({ phone, scheme }) => {
      const p = this.players.get(phone.id)
      if (p) p.scheme = scheme
      this.actions.push({ at: Date.now(), id: phone.id, action: 'scheme' })
      this.log(`[contrôle] ${this.label(phone.id)} → ${scheme}`)
      this.pushViews()
    })
    this.hub.on('assist', ({ phone, on }) => {
      const p = this.players.get(phone.id)
      if (p) p.assist = on
      this.actions.push({ at: Date.now(), id: phone.id, action: 'assist' })
      this.log(`[aide au vol] ${this.label(phone.id)} → ${on}`)
      this.pushViews()
    })
  }

  // ─── Cycle de vie ──────────────────────────────────────────────────────

  /** Démarre la session et attend la salle. */
  async start(): Promise<string> {
    const ready = new Promise<void>(resolve => (this.readyWaiter = resolve))
    this.session.start()
    await ready
    this.readyWaiter = null
    this.timer = setInterval(() => this.tick(), TICK_MS)
    return this.session.room!
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.hub.dispose()
    this.session.stop()
  }

  get room(): string | null {
    return this.session.room
  }

  get joinUrl(): string | null {
    return this.session.ready?.joinUrl ?? null
  }

  // ─── Écrans ────────────────────────────────────────────────────────────

  setScreen(screen: PhoneScreen): void {
    this.screen = screen
    this.screenAt = Date.now()
    this.statusOverride = {}
    for (const p of this.players.values()) {
      p.ready = false
      p.vote = null
      if (screen === 'play') {
        p.share = 0
        p.flapReadyAt = 0
      }
    }
    if (screen === 'play') {
      this.hub.resetRound()
      // Compte à rebours joué sur les téléphones (3, 2, 1, Envol !).
      for (let n = RULES.countdownSeconds; n >= 0; n--)
        setTimeout(() => {
          if (this.screen === 'play') this.cueAll(n > 0 ? 'countdown' : 'go', n || undefined)
        }, (RULES.countdownSeconds - n) * 1000)
    }
    this.log(`[écran] ${screen}`)
    this.pushViews()
  }

  pause(byId: string | null = null): void {
    this.paused = { by: byId }
    this.log(`[pause] ${byId ? this.label(byId) : 'écran'}`)
    this.pushViews()
  }

  resume(): void {
    this.paused = null
    this.log('[reprise]')
    this.pushViews()
  }

  /** Force des champs du statut de manche (tests : cible, caché, décroché…). */
  setStatusOverride(o: Partial<PhoneStatus>): void {
    this.statusOverride = o
  }

  cue(id: string, cue: PhoneCue, n?: number): void {
    this.hub.cue(id, cue, n)
  }

  cueAll(cue: PhoneCue, n?: number): void {
    for (const p of this.players.values()) this.hub.cue(p.id, cue, n)
  }

  toast(id: string, key: string, params?: Record<string, string | number>): void {
    this.hub.toast(id, key, params, 'hint')
  }

  kick(id: string): void {
    this.hub.kick(id)
    this.players.delete(id)
    this.log(`[retrait] ${id.slice(0, 6)}`)
    this.pushViews()
  }

  // ─── Événements du hub ─────────────────────────────────────────────────

  private label(id: string): string {
    const p = this.players.get(id)
    return p ? `${p.name || '(sans nom)'} [${colorName(p.color, 'fr')}]` : id.slice(0, 6)
  }

  private takenColors(exceptId?: string): Set<number> {
    const taken = new Set<number>(BOT_COLORS)
    for (const p of this.players.values()) if (p.id !== exceptId) taken.add(p.color)
    return taken
  }

  private onJoin(phone: PhoneInfo, known: boolean): void {
    let p = this.players.get(phone.id)
    if (!p) {
      const taken = this.takenColors()
      const pref = phone.hello?.color
      const color = pref !== null && pref !== undefined && !taken.has(pref) ? pref : (PLAYER_COLORS.find(c => !taken.has(c.index))?.index ?? 0)
      const usedSlots = new Set([...this.players.values()].map(x => x.slot))
      let slot = 0
      while (usedSlots.has(slot)) slot++
      p = {
        id: phone.id,
        slot,
        name: phone.hello?.name ?? '',
        color,
        profileSet: false,
        ready: false,
        assist: phone.assist,
        scheme: phone.scheme,
        vote: null,
        share: 0,
        suns: 0,
        flapReadyAt: 0,
        lastFlap: phone.flapPresses,
        lastDive: phone.divePresses,
        goalsStrikeAt: null,
      }
      this.players.set(phone.id, p)
      this.hub.bindSlot(phone.id, slot)
    }
    this.log(`[arrivée] ${this.label(phone.id)}${known ? ' (retour)' : ''} — ${this.players.size} téléphone(s)`)
    this.pushViews()
  }

  private onProfile(phone: PhoneInfo, name: string, color: number | null): void {
    const p = this.players.get(phone.id)
    if (!p || !name) return
    p.name = name
    if (color !== null && !this.takenColors(p.id).has(color)) p.color = color
    p.profileSet = true
    this.actions.push({ at: Date.now(), id: phone.id, action: 'profile' })
    this.log(`[profil] ${this.label(phone.id)}`)
    this.pushViews()
  }

  private onReady(phone: PhoneInfo, ready: boolean): void {
    const p = this.players.get(phone.id)
    if (!p) return
    p.ready = ready
    this.actions.push({ at: Date.now(), id: phone.id, action: 'ready' })
    this.log(`[prêt] ${this.label(phone.id)}`)
    const all = [...this.players.values()].every(x => x.ready)
    if (all && this.screen === 'intro') this.setScreen('play')
    else if (all && this.screen === 'roundEnd') this.nextRound()
    else this.pushViews()
  }

  private onAction(phone: PhoneInfo, action: PhoneAction): void {
    const p = this.players.get(phone.id)
    this.actions.push({ at: Date.now(), id: phone.id, action })
    this.log(`[action] ${this.label(phone.id)} → ${action}`)
    switch (action) {
      case 'start':
        if (this.screen === 'lobby' && p && this.leaderId() === p.id) {
          this.round = 1
          this.setScreen('intro')
        }
        break
      case 'pause':
        this.pause(phone.id)
        break
      case 'resume':
        this.resume()
        break
      case 'rematch':
      case 'toLobby':
        if (p && this.screen === 'matchEnd') {
          p.vote = action
          const humans = this.players.size
          const rematch = [...this.players.values()].filter(x => x.vote === 'rematch').length
          const lobby = [...this.players.values()].filter(x => x.vote === 'toLobby').length
          if (rematch > humans / 2) {
            this.round = 1
            this.setScreen('intro')
          } else if (lobby > humans / 2) this.setScreen('lobby')
          else this.pushViews()
        }
        break
    }
  }

  nextRound(): void {
    if (this.round >= this.rounds) {
      this.setScreen('matchEnd')
      return
    }
    this.round++
    this.setScreen('play')
  }

  private leaderId(): string | null {
    let best: MockPlayer | null = null
    for (const p of this.players.values()) if (!best || p.slot < best.slot) best = p
    return best?.id ?? null
  }

  // ─── Boucle (30 Hz) : entrées, objectifs du salon, faux état de manche ──

  private tick(): void {
    const now = Date.now()
    for (const p of this.players.values()) {
      const info = this.hub.phone(p.id)
      if (!info) continue
      const input = this.hub.input(p.id)
      if (this.logInputs) this.logInput(p, info, input.dive)
      if (this.screen === 'lobby' && !this.paused) {
        const before = this.goals.goals(p.slot)
        this.goals.update(p.slot, input, TICK_MS / 1000)
        // « Pique » : simulé au premier appui de PLONGER une seconde après « Plonge » (pas de vraie simulation ici).
        const g = this.goals.goals(p.slot)
        if (g.dive && p.goalsStrikeAt === null) p.goalsStrikeAt = now + 1000
        if (g.dive && !g.strike && p.goalsStrikeAt !== null && now > p.goalsStrikeAt && info.divePresses > p.lastDive) {
          this.goals.onSimEvent({ type: 'diveHit', hunter: p.slot, target: 11, x: 0, y: 0, z: 0, stolenCells: 0, crown: false })
          this.log(`[objectif] ${this.label(p.id)} : Pique`)
        }
        const after = this.goals.goals(p.slot)
        if (before.fly !== after.fly || before.dive !== after.dive || before.strike !== after.strike) this.pushViews()
      }
      if (this.screen === 'play' && !this.paused) this.playTick(p, info, now)
      p.lastDive = info.divePresses
      p.lastFlap = info.flapPresses
    }
  }

  private logInput(p: MockPlayer, info: PhoneInfo, dive: boolean): void {
    const line = `x ${info.x.toFixed(2)} y ${info.y.toFixed(2)} ${dive ? 'PLONGER' : '-------'} d${info.divePresses} f${info.flapPresses}`
    if (this.lastLogged.get(p.id) === line) return
    this.lastLogged.set(p.id, line)
    this.inputLog.push({ at: Date.now(), id: p.id, x: info.x, y: info.y, dive, d: info.divePresses, f: info.flapPresses })
    if (this.inputLog.length > 5000) this.inputLog.splice(0, 1000)
    this.log(`[entrée] ${this.label(p.id)} ${line}`)
  }

  /** Faux état de manche : soleil, part, rang, couronne, verrouillages et piqués scénarisés. */
  private playTick(p: MockPlayer, info: PhoneInfo, now: number): void {
    const t = (now - this.screenAt) / 1000 - RULES.countdownSeconds
    const T = 45 // manche courte pour la démo
    const u = Math.max(0, Math.min(1, t / T))
    if (t > 0) p.share = Math.max(0, Math.min(0.6, p.share + (info.buttons ? 0.0009 : 0.0005) * (0.6 + Math.sin(now / 900 + p.slot))))
    if (info.flapPresses > p.lastFlap && now >= p.flapReadyAt) p.flapReadyAt = now + RULES.flapCooldown * 1000
    const all = [...this.players.values()]
    const botShares = [0.18 + 0.05 * Math.sin(now / 2000), 0.12 + 0.04 * Math.cos(now / 2600)].map(v => v * u)
    const rank = 1 + all.filter(o => o !== p && o.share > p.share).length + botShares.filter(s => s > p.share).length
    const phase = Math.floor(t / 4)
    // Toutes les 8 s : 2 s de cible verrouillée (PIQUER) ; décalé : prise d'élan + clac contre toi.
    const target = t > 2 && phase % 2 === 0 && (t % 4) < 2 ? BOT_COLORS[phase % BOT_COLORS.length]! : -1
    const status: PhoneStatus = {
      k: 'st',
      rank,
      of: all.length + BOT_COLORS.length,
      share: Math.round(p.share * 1000) / 1000,
      crown: rank === 1 && t > 3,
      sun: Math.round(u * 200) / 200,
      countdown: t < 0 ? Math.ceil(-t) : 0,
      low: (info.buttons & 1) !== 0,
      target,
      hunter: -1,
      diving: false,
      hidden: t > 20 && t < 23,
      night: u > 0.95,
      stun: 0,
      immune: false,
      flapCd: Math.max(0, Math.round((p.flapReadyAt - now) / 100) / 10),
      ...this.statusOverride,
    }
    this.hub.setStatus(p.id, status)
    // Scénario de piqué contre le joueur, toutes les 8 s (prise d'élan, puis clac 0,6 s après).
    const tick = Math.floor(now / TICK_MS)
    const cyc = t % 8
    if (t > 5 && Math.abs(cyc - 5) < TICK_MS / 1000 && tick % 1 === 0) this.hub.cue(p.id, 'windup')
    if (t > 5 && Math.abs(cyc - 5.6) < TICK_MS / 1000) this.hub.cue(p.id, 'clac')
    if (t > 5 && Math.abs(cyc - 6.1) < TICK_MS / 1000) this.hub.cue(p.id, info.flapPresses > p.lastFlap || now - p.flapReadyAt > -2600 ? 'dodge' : 'stunned')
    if (t >= T - 5 && t < T && Math.abs((T - t) % 1) < TICK_MS / 1000) this.hub.cue(p.id, 'tick', Math.ceil(T - t))
    if (t >= T && t < T + TICK_MS / 1000) {
      if (rank === 1) this.hub.cue(p.id, 'roundWin')
      setTimeout(() => this.screen === 'play' && this.setScreen('roundEnd'), 1500)
    }
  }

  // ─── Vues ──────────────────────────────────────────────────────────────

  pushViews(): void {
    for (const p of this.players.values()) this.hub.setView(p.id, this.viewFor(p))
    this.storage.set('mock.state', JSON.stringify({ players: [...this.players.values()], screen: this.screen, round: this.round }))
  }

  viewFor(p: MockPlayer): PhoneViewInput {
    const leader = this.leaderId() === p.id
    const leaderP = this.players.get(this.leaderId() ?? '')
    const byP = this.paused?.by ? this.players.get(this.paused.by) : null
    const all = [...this.players.values()]
    const base: PhoneViewInput = {
      screen: this.screen,
      lang: this.lang,
      you: { slot: p.slot, name: p.name || colorName(p.color, this.lang), color: p.color, leader, profileSet: p.profileSet, ready: p.ready, assist: p.assist, scheme: p.scheme },
      paused: this.paused ? { by: byP ? { name: byP.name, color: byP.color } : null, canResume: true } : null,
      colorblind: this.colorblind,
    }
    const map: MapKey = (['parasols', 'aiguilles', 'cadran'] as const)[this.round - 1] ?? 'parasols'
    const goals: LobbyGoals = this.goals.goals(p.slot)
    switch (this.screen) {
      case 'lobby':
        base.lobby = {
          taken: [...this.takenColors(p.id)],
          goals,
          canStart: true,
          leaderName: leader ? null : (leaderP?.name ?? null),
          humans: all.length,
          bots: BOT_COLORS.length,
          rounds: this.rounds,
          lastDouble: true,
        }
        break
      case 'intro':
        base.intro = { round: this.round, rounds: this.rounds, map, double: this.round === this.rounds, ok: all.filter(x => x.ready).length, total: all.length, deadlineIn: RULES.rulesCardsSeconds - (Date.now() - this.screenAt) / 1000 }
        break
      case 'play':
        base.play = { round: this.round, rounds: this.rounds, map, double: this.round === this.rounds }
        break
      case 'roundEnd': {
        const rank = 1 + all.filter(o => o !== p && o.share > p.share).length
        const suns = Math.max(0, all.length + BOT_COLORS.length - rank + (rank === 1 ? 1 : 0))
        const winner = [...all].sort((a, b) => b.share - a.share)[0]
        base.roundEnd = {
          round: this.round,
          rounds: this.rounds,
          rank,
          of: all.length + BOT_COLORS.length,
          share: p.share,
          suns,
          total: p.suns + suns,
          totalRank: rank,
          winner: winner ? { name: winner.name, color: winner.color } : null,
          stats: { hits: 2, gotHit: 1, dodges: 1, misses: 0, stolen: 0.041, lowFrac: 0.52, hidden: 3 },
          mention: null,
          readyCount: all.filter(x => x.ready).length,
          readyTotal: all.length,
          deadlineIn: RULES.interludeMaxSeconds - (Date.now() - this.screenAt) / 1000,
          nextDouble: this.round + 1 === this.rounds,
        }
        break
      }
      case 'matchEnd': {
        const sorted = [...all].sort((a, b) => b.share - a.share)
        const rank = sorted.indexOf(p) + 1
        base.matchEnd = {
          rank,
          of: all.length + BOT_COLORS.length,
          suns: 12 - rank * 2,
          winners: sorted[0] ? [{ name: sorted[0].name, color: sorted[0].color }] : [],
          title: { key: 'titles.rapace', label: this.lang === 'fr' ? 'Le Rapace' : 'The Raptor', value: this.lang === 'fr' ? '3 piqués réussis' : '3 successful dives' },
          podium: sorted.slice(0, 3).map((x, i) => ({ name: x.name, color: x.color, suns: 12 - (i + 1) * 2 })),
          vote: {
            rematch: all.filter(x => x.vote === 'rematch').length,
            toLobby: all.filter(x => x.vote === 'toLobby').length,
            humans: all.length,
            mine: p.vote,
            deadlineIn: RULES.rematchVoteSeconds - (Date.now() - this.screenAt) / 1000,
          },
        }
        break
      }
      case 'spectate':
        base.spectate = { round: this.round, rounds: this.rounds }
        break
    }
    return base
  }

  // ─── Démo automatique ──────────────────────────────────────────────────

  /** Fait défiler les écrans en boucle (sans attendre les joueurs). */
  runDemo(): void {
    const steps: [PhoneScreen, number][] = [
      ['lobby', 20_000],
      ['intro', 8_000],
      ['play', 50_000],
      ['roundEnd', 12_000],
      ['matchEnd', 12_000],
    ]
    let i = 0
    const next = () => {
      const [screen, ms] = steps[i % steps.length]!
      i++
      this.setScreen(screen)
      setTimeout(next, ms)
    }
    next()
  }
}

// ─── Ligne de commande ─────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = Object.fromEntries(process.argv.slice(2).map(a => (a.includes('=') ? a.replace(/^--/, '').split('=') : [a.replace(/^--/, ''), 'true'])))
  const url = args.url ?? `ws://localhost:${process.env.PORT ?? 8803}/ws`
  const host = new MockHost({ url, lang: args.lang === 'en' ? 'en' : 'fr' })
  const room = await host.start()
  console.log(`\n  Salle ${room}   →   ${host.joinUrl}\n`)
  if (args.demo === 'true') host.runDemo()
  const rl = createInterface({ input: process.stdin })
  rl.on('line', line => {
    const [cmd, arg] = line.trim().split(/\s+/)
    const ids = [...host.players.keys()]
    switch (cmd) {
      case 'lobby':
      case 'intro':
      case 'play':
      case 'roundEnd':
      case 'matchEnd':
      case 'spectate':
        host.setScreen(cmd)
        break
      case 'pause':
        host.pause()
        break
      case 'resume':
        host.resume()
        break
      case 'cue':
        host.cueAll((arg ?? 'windup') as PhoneCue)
        break
      case 'toast':
        for (const id of ids) host.toast(id, arg ?? 'phone.card.1')
        break
      case 'kick':
        if (ids[Number(arg ?? 0)]) host.kick(ids[Number(arg ?? 0)]!)
        break
      case 'cb':
        host.colorblind = !host.colorblind
        host.pushViews()
        break
      case 'status':
        for (const p of host.players.values()) console.log(p)
        break
      case 'quit':
        host.stop()
        process.exit(0)
    }
  })
}

if (process.argv[1] && /mock-host\.ts$/.test(process.argv[1])) void main()
