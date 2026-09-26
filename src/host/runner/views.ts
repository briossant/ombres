// Vues des téléphones (PhoneView, src/shared/messages.ts) construites depuis l'état du runner.
// Le hub diffère : on peut rappeler `pushViews` à chaque changement sans inonder le réseau.
// Les échéances sont des secondes restantes AU MOMENT DE L'ENVOI (le téléphone décompte seul).
import type { PhoneViewInput, PhoneInfo } from '../../net/phoneHub.ts'
import type { LobbyGoals, MapKey, PlayerTag, RoundStatsView } from '../../shared/messages.ts'
import type { MatchState, RoundResult, TitleAward } from '../../sim/index.ts'
import { matchStandings } from '../../sim/index.ts'
import type { Lang } from '../../shared/protocol.ts'
import { t } from '../../shared/i18n.ts'
import { fmtNum, fmtPct, titleStat } from '../ui/format.ts'
import { getSettings } from '../settings.ts'
import { displayName, titleDisplayValue, uiTitleId, type Player, type Roster } from './players.ts'

/** Ce que les vues lisent du runner. */
export interface ViewContext {
  phase: 'boot' | 'title' | 'credits' | 'lobby' | 'rules' | 'round' | 'roundResults' | 'matchResults'
  lang: Lang
  colorblind: boolean
  roster: Roster
  match: MatchState | null
  /** Manche en cours ou qui vient de finir (0-based). */
  roundIndex: number
  rounds: number
  lastDouble: boolean
  /** Résultat de la dernière manche terminée (entracte), null sinon. */
  roundResult: RoundResult | null
  /** Les téléphones affichent l'entracte (le PC montre les résultats). */
  interlude: boolean
  /** Échéance (performance.now, ms) de l'écran courant (cartes, entracte, vote), null sinon. */
  deadline: number | null
  paused: boolean
  pausedBy: number
  /**
   * Pause que seul l'écran peut lever : le PC se recharge (vue de l'écran sauvegardé) ou son
   * onglet est en arrière-plan. Les téléphones affichent la pause sans « Reprendre ».
   */
  resuming?: boolean
  goals(slot: number): LobbyGoals
  titles: TitleAward[] | null
  winners: number[] | null
}

const MAP_KEYS: readonly MapKey[] = ['parasols', 'aiguilles', 'geantes', 'cadran', 'lobby']

function tag(p: Player | undefined, lang: Lang): PlayerTag | null {
  return p ? { name: displayName(p, lang), color: p.colorIndex } : null
}

function remaining(deadline: number | null): number | null {
  if (deadline === null) return null
  return Math.max(0, Math.round((deadline - performance.now()) / 100) / 10)
}

function mapOf(ctx: ViewContext, index: number): MapKey {
  const m = ctx.match?.maps[Math.min(index, (ctx.match?.maps.length ?? 1) - 1)]?.mapId ?? 'parasols'
  return MAP_KEYS.includes(m) ? m : 'parasols'
}

function isDouble(ctx: ViewContext, index: number): boolean {
  return ctx.lastDouble && ctx.rounds > 1 && index === ctx.rounds - 1
}

/** Vue d'un téléphone lié à un joueur ; null = rien à envoyer. */
export function phoneView(ctx: ViewContext, phone: PhoneInfo): PhoneViewInput | null {
  const p = ctx.roster.byPhone(phone.id)
  if (!p) return null
  const lang = ctx.lang
  const roster = ctx.roster
  // hors du salon (PC au titre, aux crédits, en chargement), personne ne lance : les téléphones
  // attendent l'écran (« La partie se lance depuis l'écran ») au lieu d'un « Lancer » inerte (G7)
  const leader = ctx.phase === 'boot' || ctx.phase === 'title' || ctx.phase === 'credits' ? undefined : roster.leader()
  const byP = ctx.pausedBy >= 0 ? roster.bySlot(ctx.pausedBy) : undefined
  const base: PhoneViewInput = {
    screen: 'lobby',
    lang,
    you: {
      slot: p.slot,
      name: displayName(p, lang),
      color: p.colorIndex,
      leader: leader === p,
      profileSet: p.profileSet,
      ready: p.ready,
      assist: p.assist,
      scheme: phone.scheme,
    },
    paused: ctx.resuming ? { by: null, canResume: false } : ctx.paused ? { by: byP ? tag(byP, lang) : null, canResume: true } : null,
    colorblind: ctx.colorblind,
    // « Réduire les flashs » vaut aussi pour les téléphones (polish P4) : lu ici, pas besoin d'un champ du runner.
    reduceFlashes: getSettings().reduceFlashes,
  }
  const phones = roster.phones().filter(x => !x.pending)
  const inMatch = ctx.phase === 'rules' || ctx.phase === 'round' || ctx.phase === 'roundResults' || ctx.phase === 'matchResults'
  if (p.pending && inMatch) {
    base.screen = 'spectate'
    base.spectate = { round: ctx.roundIndex + 1, rounds: ctx.rounds }
    return base
  }
  switch (ctx.phase) {
    case 'boot':
    case 'title':
    case 'credits':
    case 'lobby': {
      base.screen = 'lobby'
      const humans = roster.humans().length
      base.lobby = {
        // les couleurs des bots restent prenables (le bot change de couleur)
        taken: roster.players.filter(o => o !== p && o.kind !== 'bot').map(o => o.colorIndex),
        goals: ctx.goals(p.slot),
        canStart: ctx.phase === 'lobby' && humans > 0,
        leaderName: leader && leader !== p ? displayName(leader, lang) : null,
        humans,
        bots: roster.bots().length,
        rounds: ctx.rounds,
        lastDouble: ctx.lastDouble,
      }
      return base
    }
    case 'rules':
      base.screen = 'intro'
      base.intro = {
        round: 1,
        rounds: ctx.rounds,
        map: mapOf(ctx, 0),
        double: isDouble(ctx, 0),
        ok: phones.filter(x => x.ready).length,
        total: phones.length,
        deadlineIn: remaining(ctx.deadline),
      }
      return base
    case 'round':
    case 'roundResults': {
      const r = ctx.roundResult
      if (!ctx.interlude || !r) {
        base.screen = 'play'
        base.play = { round: ctx.roundIndex + 1, rounds: ctx.rounds, map: mapOf(ctx, ctx.roundIndex), double: isDouble(ctx, ctx.roundIndex) }
        return base
      }
      base.screen = 'roundEnd'
      const standings = ctx.match ? matchStandings(ctx.match) : []
      const mine = standings.find(s => s.slot === p.slot)
      const st = r.stats[p.slot]
      const arena = Math.max(1, r.arenaCells)
      const flight = st ? st.timeLow + st.timeHigh : 0
      const stats: RoundStatsView = {
        hits: st?.hits ?? 0,
        gotHit: st?.gotHit ?? 0,
        dodges: st?.dodges ?? 0,
        misses: st?.misses ?? 0,
        stolen: st ? st.stolenCells / arena : 0,
        lowFrac: flight > 0 && st ? st.timeLow / flight : 0,
        hidden: st?.hiddenTime ?? 0,
      }
      const h = r.highlight
      const hp = h ? roster.bySlot(h.slot) : undefined
      const winner = r.winners.length === 1 ? tag(roster.bySlot(r.winners[0]!), lang) : null
      base.roundEnd = {
        round: r.index + 1,
        rounds: ctx.rounds,
        rank: r.ranks[p.slot] || r.slots.length,
        of: r.slots.length,
        share: r.shares[p.slot] ?? 0,
        suns: r.suns[p.slot] ?? 0,
        total: mine?.suns ?? 0,
        totalRank: mine?.rank ?? 0,
        winner,
        stats,
        mention: h
          ? {
              key: `host.fact.${h.kind}`,
              // écarts (photo-finish, raz-de-marée) en points, comme sur le PC (RoundResults) : « 0,3 pt », pas « 0,3 % »
              params: {
                name: hp ? displayName(hp, lang) : '?',
                value:
                  h.kind === 'hunter' || h.kind === 'dodger'
                    ? String(h.value)
                    : h.kind === 'landslide' || h.kind === 'photoFinish'
                      ? t(h.value * 100 < 2 ? 'host.fact.pt' : 'host.fact.pts', { n: fmtNum(h.value * 100, 1, lang) }, lang)
                      : fmtPct(h.value, 1, lang),
              },
            }
          : null,
        readyCount: phones.filter(x => x.ready).length,
        readyTotal: phones.length,
        deadlineIn: remaining(ctx.deadline),
        nextDouble: isDouble(ctx, r.index + 1),
      }
      return base
    }
    case 'matchResults': {
      base.screen = 'matchEnd'
      const standings = ctx.match ? matchStandings(ctx.match) : []
      const mine = standings.find(s => s.slot === p.slot)
      const award = ctx.titles?.find(a => a.slot === p.slot)
      const winners = (ctx.winners ?? []).map(s => tag(roster.bySlot(s), lang)).filter((x): x is PlayerTag => !!x)
      const voters = roster.phones().filter(x => !x.pending)
      base.matchEnd = {
        rank: mine?.rank ?? standings.length,
        of: standings.length,
        suns: mine?.suns ?? 0,
        winners,
        title: award ? { key: `titles.${award.title}.name`, value: titleStat(uiTitleId(award), ctx.match ? titleDisplayValue(award, ctx.match) : award.value, lang), label: t(`titles.${award.title}.name`, undefined, lang) } : null,
        podium: standings.slice(0, 3).flatMap(s => {
          const tg = tag(roster.bySlot(s.slot), lang)
          return tg ? [{ ...tg, suns: s.suns }] : []
        }),
        vote: {
          rematch: voters.filter(x => x.vote === 'rematch').length,
          toLobby: voters.filter(x => x.vote === 'toLobby').length,
          humans: voters.length,
          mine: p.vote,
          deadlineIn: remaining(ctx.deadline),
        },
      }
      return base
    }
  }
}
