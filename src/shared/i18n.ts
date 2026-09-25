// Internationalisation FR/EN minimale et typée.
// Les chaînes sont réparties par domaine (src/shared/strings/*.ts) pour que
// chaque module possède son fichier. Clé manquante → la clé elle-même (visible en dev).
import type { Lang } from './protocol.ts'
import { STRING_TABLES } from './strings/index.ts'

type Params = Record<string, string | number>

const tables: Record<Lang, Record<string, string>> = { fr: {}, en: {} }
for (const table of STRING_TABLES) {
  Object.assign(tables.fr, table.fr)
  Object.assign(tables.en, table.en)
}

let current: Lang = 'fr'
const listeners = new Set<(lang: Lang) => void>()

export function detectLang(): Lang {
  const nav = typeof navigator !== 'undefined' ? navigator.language : 'fr'
  return nav.toLowerCase().startsWith('fr') ? 'fr' : 'en'
}

export function getLang(): Lang {
  return current
}

export function setLang(lang: Lang): void {
  if (lang === current) return
  current = lang
  for (const l of listeners) l(lang)
}

export function onLangChange(fn: (lang: Lang) => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Traduit une clé ; `{name}` dans la chaîne est remplacé par params.name. */
export function t(key: string, params?: Params, lang: Lang = current): string {
  const raw = tables[lang][key] ?? tables.fr[key] ?? key
  if (!params) return raw
  return raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m))
}

export function hasKey(key: string): boolean {
  return key in tables.fr
}
