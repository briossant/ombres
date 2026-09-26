// Scénarios de la page de dev de la manette : chaque scénario fixe l'état de connexion, la vue
// et le statut envoyés par un faux PC, pour juger chaque écran sans serveur.
import type { PhoneCue, PhoneStatus, PhoneView } from '../../shared/messages.ts'
import { PROTOCOL_VERSION } from '../../shared/messages.ts'
import type { Lang } from '../../shared/protocol.ts'
import type { PhoneConnState, PhoneFatal } from '../../net/phoneClient.ts'

export interface Scenario {
  conn: PhoneConnState
  error?: PhoneFatal
  room?: string
  hostOnline?: boolean
  everOnline?: boolean
  view?: PhoneView
  status?: PhoneStatus
  /** Retours joués en boucle (ms entre deux). */
  cues?: { cue: PhoneCue; n?: number; every: number; delay?: number }[]
  sheet?: 'settings' | 'profile'
  touched?: boolean
  localGoals?: { fly: boolean; dive: boolean }
  troubleAgoMs?: number
}

export const SCENARIO_NAMES = [
  'join',
  'connecting',
  'waiting',
  'error-room-not-found',
  'error-room-full',
  'error-kicked',
  'profile',
  'lobby',
  'lobby-guest',
  'lobby-done',
  'settings',
  'intro',
  'countdown',
  'play',
  'play-target',
  'play-hunted',
  'play-stunned',
  'play-hidden',
  'roundEnd',
  'roundEnd-winner',
  'matchEnd',
  'matchEnd-winner',
  'spectate',
  'paused',
  'reconnect',
  'hostAway',
] as const

export function buildScenario(name: string, lang: Lang, color: number, colorblind: boolean): Scenario {
  const you = { slot: 0, name: lang === 'fr' ? 'Brieuc' : 'Robin', color, leader: true, profileSet: true, ready: false, assist: false, scheme: 'absolute' as const }
  const base = (screen: PhoneView['screen'], extra: Partial<PhoneView> = {}): PhoneView => ({
    k: 'view',
    v: PROTOCOL_VERSION,
    screen,
    lang,
    you,
    paused: null,
    colorblind,
    ...extra,
  })
  const lobby = {
    taken: [1, 2, 4, 8],
    goals: { fly: true, dive: false, strike: false },
    canStart: true,
    leaderName: null,
    humans: 3,
    bots: 1,
    rounds: 3,
    lastDouble: true,
  }
  const status: PhoneStatus = {
    k: 'st',
    rank: 2,
    of: 5,
    share: 0.234,
    crown: false,
    sun: 0.42,
    countdown: 0,
    low: false,
    target: -1,
    hunter: -1,
    diving: false,
    hidden: false,
    night: false,
    stun: 0,
    immune: false,
    flapCd: 0,
  }
  const play = { round: 2, rounds: 3, map: 'aiguilles' as const, double: false }
  switch (name) {
    case 'join':
      return { conn: 'idle', room: '' }
    case 'connecting':
      return { conn: 'connecting', everOnline: false }
    case 'waiting':
      return { conn: 'online' }
    case 'error-room-not-found':
      return { conn: 'error', error: 'room-not-found' }
    case 'error-room-full':
      return { conn: 'error', error: 'room-full' }
    case 'error-kicked':
      return { conn: 'error', error: 'kicked' }
    case 'profile':
      return { conn: 'online', view: base('lobby', { you: { ...you, profileSet: false }, lobby }) }
    case 'lobby':
      return { conn: 'online', view: base('lobby', { lobby }) }
    case 'lobby-guest':
      return { conn: 'online', view: base('lobby', { you: { ...you, leader: false }, lobby: { ...lobby, leaderName: 'Maëlle', goals: { fly: false, dive: false, strike: false } } }), touched: false }
    case 'lobby-done':
      return { conn: 'online', view: base('lobby', { lobby: { ...lobby, goals: { fly: true, dive: true, strike: true } } }), touched: true }
    case 'settings':
      return { conn: 'online', view: base('lobby', { lobby }), sheet: 'settings', touched: true }
    case 'intro':
      return {
        conn: 'online',
        view: base('intro', { intro: { round: 1, rounds: 3, map: 'parasols', double: false, ok: 2, total: 4, deadlineIn: 8 } }),
      }
    case 'countdown':
      return { conn: 'online', view: base('play', { play }), status: { ...status, countdown: 3, share: 0, rank: 1, sun: 0 }, cues: [{ cue: 'countdown', n: 3, every: 4000 }, { cue: 'countdown', n: 2, every: 4000, delay: 1000 }, { cue: 'countdown', n: 1, every: 4000, delay: 2000 }, { cue: 'go', every: 4000, delay: 3000 }] }
    case 'play':
      return { conn: 'online', view: base('play', { play }), status }
    case 'play-target':
      return { conn: 'online', view: base('play', { play }), status: { ...status, target: 5, crown: true, rank: 1, share: 0.312 } }
    case 'play-hunted':
      return {
        conn: 'online',
        view: base('play', { play }),
        status: { ...status, hunter: 5, low: true },
        cues: [
          { cue: 'windup', every: 3000 },
          { cue: 'clac', every: 3000, delay: 600 },
        ],
      }
    case 'play-stunned':
      return { conn: 'online', view: base('play', { play }), status: { ...status, stun: 1.2, rank: 3 }, cues: [{ cue: 'stunned', every: 3000 }] }
    case 'play-hidden':
      return { conn: 'online', view: base('play', { play }), status: { ...status, hidden: true, flapCd: 1.8 } }
    case 'roundEnd':
    case 'roundEnd-winner': {
      const win = name === 'roundEnd-winner'
      return {
        conn: 'online',
        view: base('roundEnd', {
          roundEnd: {
            round: 1,
            rounds: 3,
            rank: win ? 1 : 3,
            of: 5,
            share: win ? 0.318 : 0.187,
            suns: win ? 5 : 2,
            total: win ? 5 : 2,
            totalRank: win ? 1 : 3,
            winner: win ? { name: you.name, color } : { name: 'Maëlle', color: 1 },
            stats: { hits: 3, gotHit: 1, dodges: 2, misses: 1, stolen: 0.064, lowFrac: 0.47, hidden: 6 },
            mention: null,
            readyCount: 2,
            readyTotal: 4,
            deadlineIn: 15,
            nextDouble: false,
          },
        }),
      }
    }
    case 'matchEnd':
    case 'matchEnd-winner': {
      const win = name === 'matchEnd-winner'
      return {
        conn: 'online',
        view: base('matchEnd', {
          matchEnd: {
            rank: win ? 1 : 2,
            of: 5,
            suns: win ? 14 : 11,
            winners: win ? [{ name: you.name, color }] : [{ name: 'Maëlle', color: 1 }],
            title: { key: 'titles.rapace', label: lang === 'fr' ? 'Le Rapace' : 'The Raptor', value: lang === 'fr' ? '4 piqués réussis' : '4 successful dives' },
            podium: [
              { name: win ? you.name : 'Maëlle', color: win ? color : 1, suns: 14 },
              { name: win ? 'Maëlle' : you.name, color: win ? 1 : color, suns: 11 },
              { name: 'Jade · Faucon', color: 11, suns: 7 },
            ],
            vote: { rematch: 1, toLobby: 0, humans: 3, mine: null, deadlineIn: 15 },
          },
        }),
      }
    }
    case 'spectate':
      return { conn: 'online', view: base('spectate', { spectate: { round: 2, rounds: 3 } }) }
    case 'paused':
      return { conn: 'online', view: base('play', { play, paused: { by: { name: 'Maëlle', color: 1 }, canResume: true } }), status }
    case 'reconnect':
      return { conn: 'reconnecting', view: base('play', { play }), status, troubleAgoMs: 5000 }
    case 'hostAway':
      return { conn: 'online', hostOnline: false, view: base('play', { play }), status, troubleAgoMs: 5000 }
    default:
      return { conn: 'online', view: base('lobby', { lobby }) }
  }
}
