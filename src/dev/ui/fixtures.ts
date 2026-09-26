// Données factices réalistes pour la page de dev de l'UI (dev/ui.html).
import type { MapId } from '../../sim/types.ts'
import { RULES } from '../../sim/rules.ts'
import {
  BOT_PERSONALITIES,
  hudAnchors,
  useHud,
  useLobby,
  useMatchResults,
  useRoster,
  useRoundResults,
  useRulesCards,
  type MatchRowVM,
  type RoundRowVM,
  type SlotVM,
  type TitleId,
} from '../../host/ui/viewModel.ts'

const HUMAN_NAMES = ['Brieuc', 'Léa', 'Momo', 'Anouk', 'Tanguy', 'Inès', 'Sacha', 'Yasmine']

/** Joueurs : environ moitié humains, moitié bots ; quelques cas limites. */
export function makeRoster(n: number): SlotVM[] {
  const humans = Math.max(1, Math.min(n, Math.ceil(n * 0.5)))
  const slots: SlotVM[] = []
  for (let i = 0; i < n; i++) {
    const human = i < humans
    const s: SlotVM = {
      slot: i,
      colorIndex: i,
      name: human ? HUMAN_NAMES[i % HUMAN_NAMES.length] : '',
      kind: human ? (i === 1 && n >= 3 ? 'keyboard' : 'phone') : 'bot',
      bot: human ? undefined : { personality: BOT_PERSONALITIES[(i - humans) % BOT_PERSONALITIES.length], level: ((i - humans) % 3) as 0 | 1 | 2 },
      connected: true,
      ready: human && i % 2 === 0,
      goals: human ? { fly: true, dive: i !== 2, strike: i === 0 || i === 3 } : { fly: false, dive: false, strike: false },
      assist: human && i === 2,
      substitute: false,
      keyboardGroup: i === 1 && n >= 3 ? 1 : undefined,
      host: i === 0,
    }
    slots.push(s)
  }
  // Un humain déconnecté remplacé par un bot (≥ 6 joueurs).
  if (n >= 6) {
    const s = slots[humans - 1]
    s.kind = 'bot'
    s.substitute = true
    s.connected = false
    s.bot = { personality: 'ploughman', level: 1 }
  }
  return slots
}

/** Parts décroissantes plausibles (le reste est neutre). */
export function makeShares(n: number, neutral = 0.14): number[] {
  const w = Array.from({ length: n }, (_, i) => Math.pow(0.8, i) * (1 + 0.15 * Math.sin(i * 2.3)))
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map(x => (x / sum) * (1 - neutral)).sort((a, b) => b - a)
}

export const ARENA_CELLS = 128_000

export function fillRoster(n: number): SlotVM[] {
  const slots = makeRoster(n)
  useRoster.setState({ slots })
  return slots
}

export function fillLobby(n: number, url: string): void {
  fillRoster(n)
  useLobby.setState({
    roomCode: 'KX4P',
    joinUrl: url,
    connection: 'online',
    keyboardJoined: n >= 3,
  })
}

export function fillRulesCards(n: number): void {
  const humans = useRoster.getState().slots.filter(s => s.kind !== 'bot').length || Math.ceil(n / 2)
  useRulesCards.setState({ deadline: performance.now() + RULES.rulesCardsSeconds * 1000 - 2600, okCount: Math.max(0, humans - 1), humanCount: humans })
}

/** Ancres écran factices, calées sur les oiseaux de docs/art/img/jeu-*.jpg (1280 × 720). */
const BIRD_POS_720: [number, number][] = [
  [345, 470],
  [447, 262],
  [650, 210],
  [775, 352],
  [662, 432],
  [972, 452],
  [1000, 150],
  [240, 300],
  [1180, 600],
  [-120, 380],
  [1500, 250],
  [640, 900],
]

export function placeAnchors(n: number): void {
  const k = window.innerWidth / 1280
  for (let i = 0; i < 12; i++) {
    const a = hudAnchors.birds[i]
    const p = BIRD_POS_720[i]
    a.active = i < n
    a.x = p[0] * k
    a.y = p[1] * k + 26 * k
    a.behind = false
    a.hidden = i === 4
  }
}

export interface HudFixture {
  u: number
  elev: number
  phase: import('../../sim/types.ts').RoundPhase
  bg: string
}

export const HUD_PHASES: Record<string, HudFixture> = {
  countdown: { u: 0, elev: 80, phase: 'countdown', bg: 'jeu-kf80-zenith' },
  noon: { u: 0.06, elev: 80, phase: 'noon', bg: 'jeu-kf80-zenith' },
  afternoon: { u: 0.3, elev: 50, phase: 'afternoon', bg: 'jeu-kf50-apresmidi' },
  golden: { u: 0.52, elev: 22, phase: 'golden', bg: 'jeu-kf16-heure-doree' },
  sunset: { u: 0.8, elev: 9, phase: 'sunset', bg: 'jeu-kf3-coucher' },
  great: { u: 0.905, elev: 3, phase: 'greatShadow', bg: 'jeu-kf1-falaise' },
  last: { u: 0.975, elev: 1.5, phase: 'greatShadow', bg: 'jeu-kf1-falaise' },
}

export function fillHud(n: number, fx: HudFixture): void {
  const slots = fillRoster(n)
  const shares = makeShares(n, Math.max(0.04, 0.5 - fx.u * 0.5))
  useHud.setState({
    round: 2,
    rounds: 3,
    doubleRound: false,
    phase: fx.phase,
    sunU: fx.u,
    paletteElevDeg: fx.elev,
    shares: slots.map((s, i) => ({ slot: s.slot, cells: Math.round(shares[(i + 1) % n] * ARENA_CELLS) })),
    arenaCells: ARENA_CELLS,
    // Le meneur (plus grosse part) porte la couronne.
    crownSlot: n > 1 ? n - 1 : 0,
  })
  placeAnchors(n)
}

export function makeRoundRows(n: number, round: number, double: boolean): RoundRowVM[] {
  const shares = makeShares(n, 0.03)
  const rows: RoundRowVM[] = shares.map((share, i) => ({ slot: (i + 2) % n, share, cells: Math.round(share * ARENA_CELLS), rank: i + 1, suns: 0, totalSuns: 0 }))
  for (const r of rows) {
    const beaten = n - r.rank
    r.suns = (beaten + (r.rank === 1 ? RULES.winnerBonusSuns : 0)) * (double ? RULES.lastRoundMultiplier : 1)
    r.totalSuns = r.suns + Math.max(0, (n - r.rank) * (round - 1) + ((r.slot * 3) % 4))
  }
  return rows
}

export function fillRoundResults(n: number): void {
  fillRoster(n)
  const round = 2
  const maps: MapId[] = ['parasols', 'aiguilles', 'cadran']
  useRoundResults.setState({
    round,
    rounds: 3,
    double: false,
    mapId: maps[round - 1],
    nextMapId: 'cadran',
    rows: makeRoundRows(n, round, false),
    tie: false,
    fact: { kind: 'bigSteal', slot: 3 % n, value: 0.062 },
    deadline: performance.now() + 11_000,
    readyCount: 1,
    humanCount: Math.ceil(n / 2),
  })
}

const TITLE_ORDER: [TitleId, number][] = [
  ['rapace', 5],
  ['dernierRayon', 0.071],
  ['anguille', 3],
  ['batisseur', 0.46],
  ['gibier', 4],
  ['lezard', 19],
  ['nuage', 0.81],
  ['kamikaze', 3],
  ['pilleur', 0.112],
  ['revenant', 3],
  ['notaire', 0.041],
  ['raseMottes', 0.62],
]

export function fillMatchResults(n: number): void {
  fillRoster(n)
  const rows: MatchRowVM[] = Array.from({ length: n }, (_, i) => {
    const slot = (i + 2) % n
    const [tid, tval] = TITLE_ORDER[i % TITLE_ORDER.length]
    return {
      slot,
      rank: i + 1,
      suns: Math.max(0, (n - i) * 3 + 2 - i),
      totalShare: 0.9 - i * 0.07,
      title: i === n - 1 && n > 4 ? null : { id: tid, value: tval },
      stats: { hits: (7 - i + n) % 6, gotHit: (i * 3) % 5, dodges: (i + 1) % 4, misses: i % 3, stolenFrac: 0.12 - i * 0.012, lowFrac: 0.3 + ((i * 17) % 50) / 100, hiddenSeconds: (i * 7) % 20, roundsWon: Math.max(0, 2 - i) },
      votedRematch: i % 2 === 0,
    }
  })
  const humans = Math.ceil(n / 2)
  useMatchResults.setState({ rows, coWinners: false, rematch: { votes: Math.min(humans, 2), humans, deadline: performance.now() + 12_000 } })
}
