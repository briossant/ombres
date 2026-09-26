// Lien entre le client réseau (src/net/phoneClient.ts) et l'app : messages du PC → store / effets,
// gestes du joueur → messages au PC. Le client est injecté (la page de dev branche un faux PC).
import { PROTOCOL_VERSION, sanitizeName, type ControlScheme, type HostToPhone, type PhoneAction, type PhoneHello, type PhoneToHost } from '../shared/messages.ts'
import type { PhoneClientEvents, PhoneConnState, PhoneFatal } from '../net/phoneClient.ts'
import { canVibrate, vibrate } from './device/haptics.ts'
import { isIOS } from './device/screen.ts'
import { tiltSupport } from './device/tilt.ts'
import { fx } from './fx.ts'
import { phoneState, pushToast, setPhoneLang, setPrefs, usePhone } from './store.ts'
import { readJson, webStore } from '../net/util.ts'

/** Ce dont l'app a besoin d'un client réseau (PhoneClient le satisfait tel quel). */
export interface ClientLike {
  readonly id: string
  readonly state: PhoneConnState
  readonly error: PhoneFatal | null
  readonly hostOnline: boolean
  readonly roomCode: string
  on<K extends keyof PhoneClientEvents>(event: K, handler: (payload: PhoneClientEvents[K]) => void): () => void
  start(): void
  retry(room?: string): void
  setStick(x: number, y: number): void
  setButton(btn: number, down: boolean): void
  releaseAll(): void
  send(m: PhoneToHost): boolean
  sendHello(): void
}

let client: ClientLike | null = null

export function getClient(): ClientLike | null {
  return client
}

const HINTS_KEY = 'ombres.phone.seenHints.v1'
const localStore = webStore('local')

function seenHints(): string[] {
  const list = readJson<string[]>(localStore, HINTS_KEY)
  return Array.isArray(list) ? list.filter(k => typeof k === 'string') : []
}

/** Indication contextuelle vue sur ce téléphone : le PC ne la remontrera pas (réglage « Auto »). */
function rememberHint(key: string): void {
  const list = seenHints()
  if (list.includes(key)) return
  list.push(key)
  localStore.set(HINTS_KEY, JSON.stringify(list.slice(-64)))
}

/** Préférences envoyées au PC à chaque (re)connexion (PhoneHello sans k/v). */
export function helloFromPrefs(): Omit<PhoneHello, 'k' | 'v'> {
  const { prefs } = phoneState()
  return {
    name: prefs.name,
    color: prefs.color,
    scheme: prefs.scheme,
    assist: prefs.assist,
    lang: navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en',
    caps: { vibrate: canVibrate(), tilt: tiltSupport() !== 'no', ios: isIOS() },
    seenHints: seenHints(),
  }
}

const RELOAD_KEY = 'ombres.phone.reloadedFor'

function onHostMessage(m: HostToPhone): void {
  const now = performance.now()
  switch (m.k) {
    case 'view': {
      if (m.v !== PROTOCOL_VERSION) {
        // Le PC a été mis à jour (redéploiement) : on recharge une fois la page, même salle, même id.
        try {
          if (sessionStorage.getItem(RELOAD_KEY) !== String(m.v)) {
            sessionStorage.setItem(RELOAD_KEY, String(m.v))
            location.reload()
            return
          }
        } catch {
          // stockage indisponible : on tente quand même d'afficher
        }
      }
      setPhoneLang(m.lang)
      const s = phoneState()
      const patch: Partial<ReturnType<typeof phoneState>> = { view: m, viewAt: now }
      // Confirmations des actions optimistes.
      if (s.pendingProfile && (m.you.profileSet || now - s.pendingProfile.at > 4000)) patch.pendingProfile = null
      if (s.pendingReady !== null && (m.you.ready === s.pendingReady || m.screen !== s.view?.screen)) patch.pendingReady = null
      if (s.view && m.screen !== s.view.screen) {
        patch.pendingVote = null
        // Nouvel écran : le statut de la manche précédente (recharges, cible) n'a plus cours.
        patch.status = null
        if (m.screen !== 'lobby') patch.localGoals = { fly: false, dive: false }
      }
      if (m.screen === 'matchEnd' && m.matchEnd?.vote.mine) patch.pendingVote = null
      usePhone.setState(patch)
      break
    }
    case 'st':
      usePhone.setState({ status: m, statusAt: now })
      break
    case 'cue':
      fx.cue(m.cue, m.n)
      break
    case 'haptic':
      if (!vibrate(m.pattern)) fx.flash()
      break
    case 'toast':
      pushToast(m.key, m.params, m.tone)
      if (m.key.startsWith('hints.')) rememberHint(m.key)
      break
    case 'who':
      break
  }
}

/** Branche un client sur le store et le démarre. Retourne la fonction de débranchement. */
export function attachClient(c: ClientLike): () => void {
  client = c
  usePhone.setState({ room: c.roomCode, conn: c.state, error: c.error, hostOnline: c.hostOnline })
  const offs = [
    c.on('state', ({ state, error }) => {
      const s = phoneState()
      const trouble = state === 'reconnecting' || state === 'connecting'
      usePhone.setState({
        conn: state,
        error,
        room: c.roomCode,
        everOnline: s.everOnline || state === 'online',
        troubleSince: trouble ? (s.troubleSince ?? performance.now()) : state === 'online' && !c.hostOnline ? s.troubleSince : null,
      })
    }),
    c.on('hostOnline', online => {
      usePhone.setState(s => ({ hostOnline: online, troubleSince: online ? null : (s.troubleSince ?? performance.now()) }))
    }),
    c.on('message', onHostMessage),
  ]
  c.start()
  return () => {
    for (const off of offs) off()
    if (client === c) client = null
  }
}

// ─── Actions du joueur ─────────────────────────────────────────────────────

function send(m: PhoneToHost): boolean {
  return client?.send(m) ?? false
}

export function sendProfile(rawName: string, color: number | null): void {
  const name = sanitizeName(rawName)
  if (!name) return
  setPrefs({ name, color })
  usePhone.setState({ pendingProfile: { name, color, at: performance.now() }, sheet: null })
  send({ k: 'profile', name, color })
}

export function sendReady(ready: boolean): void {
  usePhone.setState({ pendingReady: ready })
  send({ k: 'ready', ready })
}

export function sendAction(action: PhoneAction): void {
  if (action === 'rematch' || action === 'toLobby') usePhone.setState({ pendingVote: action })
  send({ k: 'action', action })
}

export function setScheme(scheme: ControlScheme): void {
  setPrefs({ scheme })
  send({ k: 'scheme', scheme })
}

export function setAssist(on: boolean): void {
  setPrefs({ assist: on })
  send({ k: 'assist', on })
}

export function retryConnection(room?: string): void {
  client?.retry(room)
}
