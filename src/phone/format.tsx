// Mise en forme (langue, nombres, couleurs de joueur) pour l'app téléphone.
import type { CSSProperties, ReactNode } from 'react'
import { t } from '../shared/i18n.ts'
import type { Lang } from '../shared/protocol.ts'
import { PLAYER_COLORS, PALETTE_CONSTANTS, colorName } from '../shared/players.ts'
import type { ToastParams } from '../shared/messages.ts'
import { usePhone } from './store.ts'

export type Translate = (key: string, params?: ToastParams) => string

/** Paramètres de message : `color` / `…Color` numériques → nom de couleur dans la langue affichée. */
export function resolveParams(params: ToastParams | undefined, lang: Lang): Record<string, string | number> | undefined {
  if (!params) return undefined
  const out: Record<string, string | number> = {}
  for (const [k, v] of Object.entries(params)) out[k] = typeof v === 'number' && (k === 'color' || k.endsWith('Color')) ? colorName(v, lang) : v
  return out
}

/** Traduction qui se met à jour quand la langue change (la langue suit celle du PC). */
export function useT(): Translate {
  const lang = usePhone(s => s.lang)
  return (key, params) => t(key, resolveParams(params, lang), lang)
}

/**
 * Traduction « riche » : les paramètres numériques sont composés en Averia (classe t-num).
 * Règle ART_BIBLE §8.1 : jamais de chiffres en Patrick Hand SC.
 */
export function useTn(): (key: string, params?: ToastParams) => ReactNode {
  const lang = usePhone(s => s.lang)
  return (key, params) => {
    const template = t(key, undefined, lang)
    const values = resolveParams(params, lang)
    if (!values) return template
    return template.split(/(\{\w+\})/).map((part, i) => {
      const m = /^\{(\w+)\}$/.exec(part)
      const v = m ? values[m[1]!] : undefined
      if (v === undefined) return part
      return typeof v === 'number' || /^\d/.test(v) ? (
        <span key={i} className="t-num">
          {v}
        </span>
      ) : (
        v
      )
    })
  }
}

/**
 * Texte déjà formaté (valeur de titre venue du PC : « 4 piqués réussis », « +2 places… ») : seuls les
 * nombres passent en Averia, le reste reste dans la police d'interface (ART_BIBLE §8.1).
 */
export function NumText({ text }: { text: string }): ReactNode {
  return splitNumbers(text).map((part, i) =>
    part.num ? (
      <span key={i} className="t-num">
        {part.text}
      </span>
    ) : (
      part.text
    ),
  )
}

/** Découpe un texte en morceaux « nombre » (signe, décimales, % collé ou après espace fine) et texte. */
export function splitNumbers(text: string): { text: string; num: boolean }[] {
  const out: { text: string; num: boolean }[] = []
  const re = /[+\u2212-]?\d+(?:[.,]\d+)?(?:[\u202F\u00A0 ]?%)?/g
  let last = 0
  for (const m of text.matchAll(re)) {
    const at = m.index ?? 0
    if (at > last) out.push({ text: text.slice(last, at), num: false })
    out.push({ text: m[0], num: true })
    last = at + m[0].length
  }
  if (last < text.length) out.push({ text: text.slice(last), num: false })
  return out
}

/** Forme du pluriel : en français, 0 et 1 sont au singulier (« 0 soleil »). */
export function pluralOne(n: number, lang: Lang): boolean {
  return lang === 'fr' ? Math.abs(n) < 2 : n === 1
}

/**
 * Coupe un texte court aux frontières de phrase, en deux lignes équilibrées (cartes des règles :
 * « Pique d'en haut. » / « À la nuit, on compte. »). Même règle que la TV (src/host/ui/format.ts).
 */
export function sentenceLines(text: string): string[] {
  const parts = text.match(/[^.!?]+[.!?]+\s*/g)?.map(p => p.trim()) ?? [text]
  if (parts.length < 2) return [text]
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

export function useLang(): Lang {
  return usePhone(s => s.lang)
}

const NNBSP = ' '

/** Part du désert : « 23,4 % » / « 23.4% ». */
export function formatPct(share: number, lang: Lang, digits = 1): string {
  const v = (share * 100).toFixed(digits)
  return lang === 'fr' ? `${v.replace('.', ',')}${NNBSP}%` : `${v}%`
}

/** Rang ordinal : 1er, 2e / 1st, 2nd, 3rd, 4th, 11th… */
export function ordinal(n: number, lang: Lang): string {
  if (lang === 'fr') return n === 1 ? '1er' : `${n}e`
  const mod100 = n % 100
  if (mod100 >= 11 && mod100 <= 13) return `${n}th`
  return `${n}${['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`
}

/** Séparation entre la partie numérique et le suffixe d'un ordinal (pour composer « 2 » + « e »). */
export function splitOrdinal(n: number, lang: Lang): [string, string] {
  const s = ordinal(n, lang)
  const i = String(n).length
  return [s.slice(0, i), s.slice(i)]
}

export const PAPER = PALETTE_CONSTANTS.paper
export const INK = '#2B1D23'

/** Luminosité OKLCH de la couleur d'un joueur. */
export function colorL(index: number): number {
  return PLAYER_COLORS[index]?.oklch[0] ?? 0.7
}

/** Texte (ou glyphe) lisible posé sur la couleur pleine d'un joueur : papier sur les couleurs sombres. */
export function inkOn(index: number): string {
  return colorL(index) < 0.56 ? PAPER : INK
}

/** Variables CSS d'un joueur : --pc (identité), --pc-text (texte sur papier), --pc-on (encre ou papier posé dessus). */
export function playerVars(index: number | null | undefined): CSSProperties {
  const c = index === null || index === undefined ? null : PLAYER_COLORS[index]
  if (!c) return {} as CSSProperties
  return { '--pc': c.hex, '--pc-text': c.text, '--pc-on': inkOn(c.index) } as CSSProperties
}
