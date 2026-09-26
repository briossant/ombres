// Les joueurs de la session (salon, partie) : slots, couleurs, noms, type de pilote.
// État sérialisable (rafraîchissement du PC) ; l'état vivant (connexion, remplaçant) est
// recalculé par le runner depuis le hub des téléphones.
import type { BotLevel, BotPersonality } from '../../bots/index.ts'
import type { LocalGroup } from '../../input/index.ts'
import { MAX_PLAYERS, PLAYER_COLORS, colorName } from '../../shared/players.ts'
import type { Lang } from '../../shared/protocol.ts'
import type { Vote } from '../../shared/messages.ts'
import type { MatchState, TitleAward } from '../../sim/index.ts'
import type { TitleId as UiTitleId } from '../ui/viewModel.ts'
import { t } from '../../shared/i18n.ts'
import type { PlayerKind, PlayerVisual } from '../view.ts'

export interface Player {
  slot: number
  colorIndex: number
  /** Nom choisi (téléphone) ; vide = nom de la couleur. */
  name: string
  kind: PlayerKind
  phoneId: string | null
  group: LocalGroup | null
  bot: { personality: BotPersonality; level: BotLevel } | null
  assist: boolean
  /** Le joueur a validé nom et couleur sur son téléphone. */
  profileSet: boolean
  /** « Prêt » / « Compris » sur le téléphone (écran courant). */
  ready: boolean
  vote: Vote | null
  /** Arrivé en cours de partie : entre en piste à la prochaine manche. */
  pending: boolean
  /** Ordre d'arrivée. */
  order: number
  /** Bot de la composition automatique (defaultBots), remplacé si le nombre d'humains change. */
  auto: boolean
}

export class Roster {
  players: Player[] = []
  private nextOrder = 1

  get size(): number {
    return this.players.length
  }

  bySlot(slot: number): Player | undefined {
    return this.players.find(p => p.slot === slot)
  }

  byPhone(id: string): Player | undefined {
    return this.players.find(p => p.phoneId === id)
  }

  byGroup(group: LocalGroup): Player | undefined {
    return this.players.find(p => p.kind === 'keyboard' && p.group === group)
  }

  humans(): Player[] {
    return this.players.filter(p => p.kind !== 'bot')
  }

  phones(): Player[] {
    return this.players.filter(p => p.kind === 'phone')
  }

  bots(): Player[] {
    return this.players.filter(p => p.kind === 'bot')
  }

  /** Meneur : premier téléphone arrivé (lance la partie depuis son téléphone). */
  leader(): Player | undefined {
    let best: Player | undefined
    for (const p of this.players) if (p.kind === 'phone' && !p.pending && (!best || p.order < best.order)) best = p
    return best
  }

  /** Plus petit slot libre (hors `reserved`), -1 si complet. */
  freeSlot(reserved = -1): number {
    for (let s = 0; s < MAX_PLAYERS; s++) if (s !== reserved && !this.bySlot(s)) return s
    return -1
  }

  colorTaken(color: number, except?: Player): boolean {
    return this.players.some(p => p !== except && p.colorIndex === color)
  }

  /** Couleur préférée si libre, sinon première libre dans l'ordre d'attribution (ART_BIBLE §3.2). */
  pickColor(pref: number | null | undefined, except?: Player): number {
    if (pref !== null && pref !== undefined && pref >= 0 && pref < MAX_PLAYERS && !this.colorTaken(pref, except)) return pref
    for (const c of PLAYER_COLORS) if (!this.colorTaken(c.index, except)) return c.index
    return 0
  }

  /**
   * Un humain prend une couleur : si un bot la porte, le bot passe à la première couleur libre
   * (les humains choisissent avant les bots). Faux si un autre humain la porte déjà.
   */
  claimColor(p: Player, color: number): boolean {
    if (color < 0 || color >= MAX_PLAYERS) return false
    const holder = this.players.find(o => o !== p && o.colorIndex === color)
    if (holder && holder.kind !== 'bot') return false
    p.colorIndex = color
    if (holder) holder.colorIndex = this.pickColor(null, holder)
    return true
  }

  /**
   * Première couleur qu'aucun AUTRE humain ne porte (un bot la cède, voir claimColor). `except` : le
   * joueur à colorer, déjà dans le roster (sinon sa couleur provisoire comptait comme prise et le
   * premier humain recevait Lagon au lieu de Corail).
   */
  humanColor(except?: Player): number {
    for (const c of PLAYER_COLORS) if (!this.players.some(o => o !== except && o.kind !== 'bot' && o.colorIndex === c.index)) return c.index
    return 0
  }

  /** Dernière couleur libre (mannequin du salon : loin des couleurs des joueurs). */
  lastFreeColor(): number {
    for (let i = PLAYER_COLORS.length - 1; i >= 0; i--) if (!this.colorTaken(i)) return i
    return PLAYER_COLORS.length - 1
  }

  add(p: Omit<Player, 'order'>): Player {
    const full: Player = { ...p, order: this.nextOrder++ }
    this.players.push(full)
    this.players.sort((a, b) => a.order - b.order)
    return full
  }

  remove(slot: number): Player | undefined {
    const i = this.players.findIndex(p => p.slot === slot)
    if (i < 0) return undefined
    return this.players.splice(i, 1)[0]
  }

  toJSON(): { players: Player[]; nextOrder: number } {
    return { players: this.players.map(p => ({ ...p, bot: p.bot ? { ...p.bot } : null })), nextOrder: this.nextOrder }
  }

  load(data: { players: Player[]; nextOrder: number }): void {
    this.players = data.players.map(p => ({ ...p }))
    this.nextOrder = data.nextOrder
  }
}

/** Nom affiché d'un joueur (même règle que l'UI : bot « Jade · Faucon », sinon nom ou couleur). */
export function displayName(p: Player, lang: Lang): string {
  const color = colorName(p.colorIndex, lang)
  if (p.kind === 'bot' && p.bot) return `${color} · ${t(`host.bot.${p.bot.personality}`, undefined, lang)}`
  return p.name.trim() || color
}

export function visualOf(p: Player, lang: Lang): PlayerVisual {
  return { slot: p.slot, colorIndex: p.colorIndex, name: displayName(p, lang), kind: p.kind, assist: p.assist }
}

/**
 * Chiffre affiché d'un titre. Le Pilleur est attribué sur le cumul de la partie (GDD §11.4), mais un
 * cumul de « désert pris aux autres » dépasse vite 100 % (repeint compris) : on l'affiche par manche,
 * comme la statistique « Volé » des cartes.
 */
/**
 * Identifiant d'un titre pour l'UI : le miroir de l'UI (viewModel.ts `TitleId`) suit la liste de la
 * sim, « souverain » (repli du vainqueur, polish G10) compris depuis la non-régression.
 */
export function uiTitleId(award: TitleAward): UiTitleId {
  return award.title as UiTitleId
}

export function titleDisplayValue(award: TitleAward, match: MatchState): number {
  if (award.title !== 'pilleur') return award.value
  const rounds = match.results.filter(r => r.slots.includes(award.slot)).length
  return award.value / Math.max(1, rounds)
}
