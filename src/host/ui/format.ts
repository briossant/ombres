// Mise en forme (nombres, noms, rangs) et abonnement à la langue.
import { useSyncExternalStore } from 'react'
import { getLang, onLangChange, t } from '../../shared/i18n.ts'
import type { Lang } from '../../shared/protocol.ts'
import { colorName } from '../../shared/players.ts'
import type { BotLevel, BotPersonality, SlotVM, TitleId, TitleUnit } from './viewModel.ts'
import { TITLE_UNITS } from './viewModel.ts'

/** Re-rend le composant quand la langue change. */
export function useLang(): Lang {
  return useSyncExternalStore(onLangChange, getLang, getLang)
}

const NNBSP = ' '

/** Pourcentage d'une fraction : FR « 23,4 % », EN « 23.4% ». */
export function fmtPct(frac: number, digits = 1, lang: Lang = getLang()): string {
  const v = (frac * 100).toFixed(digits)
  return lang === 'fr' ? `${v.replace('.', ',')}${NNBSP}%` : `${v}%`
}

/** Nombre décimal localisé. */
export function fmtNum(n: number, digits = 0, lang: Lang = getLang()): string {
  const v = n.toFixed(digits)
  return lang === 'fr' ? v.replace('.', ',') : v
}

/** Rang ordinal court : FR « 1er », « 2e » ; EN « 1st », « 2nd ». */
export function ordinal(rank: number, lang: Lang = getLang()): string {
  if (lang === 'fr') return rank === 1 ? '1er' : `${rank}e`
  const m100 = rank % 100
  const m10 = rank % 10
  const suf = m100 >= 11 && m100 <= 13 ? 'th' : m10 === 1 ? 'st' : m10 === 2 ? 'nd' : m10 === 3 ? 'rd' : 'th'
  return `${rank}${suf}`
}

export function botPersonalityName(p: BotPersonality): string {
  return t(`host.bot.${p}`)
}

export function botLevelName(level: BotLevel): string {
  return t(`host.botLevel.${level}`)
}

/** Nom affiché d'un joueur : nom choisi, sinon couleur ; bot : « Jade · Faucon ». */
export function slotDisplayName(s: SlotVM | undefined, lang: Lang = getLang()): string {
  if (!s) return '?'
  const color = colorName(s.colorIndex, lang)
  if (s.kind === 'bot' && s.bot && !s.substitute) return `${color} · ${botPersonalityName(s.bot.personality)}`
  return s.name.trim() || color
}

/** Nom court (cartes étroites) : le jeton porte déjà la couleur, un bot garde son caractère. */
export function slotShortName(s: SlotVM | undefined, lang: Lang = getLang()): string {
  if (!s) return '?'
  if (s.kind === 'bot' && s.bot && !s.substitute) return botPersonalityName(s.bot.personality)
  return s.name.trim() || colorName(s.colorIndex, lang)
}

/** Chiffre d'un titre avec son unité : « 4 piqués réussis », « 12,3 % du désert pris »… */
export function titleStat(id: TitleId, value: number, lang: Lang = getLang()): string {
  const unit: TitleUnit = TITLE_UNITS[id]
  const n =
    unit === 'frac' ? fmtPct(value, 1, lang) : unit === 'seconds' ? `${fmtNum(value, 0, lang)}${lang === 'fr' ? NNBSP : ''}s` : fmtNum(value, 0, lang)
  return t(`titles.${id}.stat`, { n, count: Math.round(value) }, lang)
}

/**
 * Coupe un texte court en deux lignes aux frontières de phrase, en équilibrant
 * leur longueur (cartes des règles : « Bas : fort. Haut : grand. » / « Le fort gagne. »).
 */
export function sentenceLines(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+\s*/g)?.map(p => p.trim()) ?? [text]
  if (parts.length < 2) {
    // Une seule phrase longue : on coupe après les deux-points (« Pique d'en haut : » / « sa traînée… »).
    const colon = text.match(/^(.{8,}?\s?:)\s+(.{8,})$/)
    return colon && text.length > 28 ? [colon[1]!, colon[2]!] : [text]
  }
  let best = 1
  let bestCost = Infinity
  for (let k = 1; k < parts.length; k++) {
    const a = parts.slice(0, k).join(' ').length
    const b = parts.slice(k).join(' ').length
    const cost = Math.max(a, b)
    // À égalité, on coupe le plus tard possible (la chute reste courte).
    if (cost <= bestCost) {
      bestCost = cost
      best = k
    }
  }
  return [parts.slice(0, best).join(' '), parts.slice(best).join(' ')]
}
