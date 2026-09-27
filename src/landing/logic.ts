// Logique pure de la page d'accueil mobile (/m) : langue, détection du téléphone, code de salle,
// traduction. Aucune dépendance au jeu (ni three.js, ni React, ni l'i18n complet).
import { ROOM_ALPHABET, ROOM_CODE_LENGTH, type Lang } from '../shared/protocol.ts'
import type { StringTable } from '../shared/strings/index.ts'

/** Adresse publique du jeu (liens copiés, partagés, affichés). */
export const PUBLIC_URL = 'https://ombres.deploy.breizhware.com'
export const PUBLIC_HOST = 'ombres.deploy.breizhware.com'
export const GITHUB_URL = 'https://github.com/briossant/ombres'

/** Plus petit côté d'écran (px CSS) sous lequel un appareil tactile est un téléphone. */
export const PHONE_MAX_SHORT_SIDE = 600

/**
 * Téléphone = pointeur grossier ET petit écran. Les tablettes (côté court ≥ 600 px) et les PC
 * (pointeur fin, même tactiles) gardent le jeu. Même règle que le script en tête d'index.html.
 */
export function isPhone(screenW: number, screenH: number, coarsePointer: boolean): boolean {
  return coarsePointer && Math.min(screenW, screenH) < PHONE_MAX_SHORT_SIDE
}

/** Langue de la page : choix mémorisé, sinon la première langue du navigateur (fr* → fr, sinon en). */
export function pickLang(stored: string | null, navLangs: readonly string[]): Lang {
  if (stored === 'fr' || stored === 'en') return stored
  for (const l of navLangs) {
    const k = l.toLowerCase()
    if (k.startsWith('fr')) return 'fr'
    if (k.startsWith('en')) return 'en'
  }
  return 'en'
}

/** Garde les lettres du code (majuscules, alphabet des salles, sans I/O), 4 au plus. */
export function normalizeCode(raw: string): string {
  return [...raw.toUpperCase()].filter(c => ROOM_ALPHABET.includes(c)).join('').slice(0, ROOM_CODE_LENGTH)
}

export function isCode(code: string): boolean {
  return code.length === ROOM_CODE_LENGTH && normalizeCode(code) === code
}

/** Adresse de la manette pour un code (même forme que le QR code du salon). */
export function playUrl(code: string): string {
  return `/play?r=${encodeURIComponent(code)}`
}

/** Traducteur minimal sur une table ; `{name}` remplacé par params.name. Clé absente → la clé. */
export function makeT(table: StringTable, lang: Lang) {
  return (key: string, params?: Record<string, string | number>): string => {
    const raw = table[lang][key] ?? table.fr[key] ?? key
    return params ? raw.replace(/\{(\w+)\}/g, (m, k: string) => (k in params ? String(params[k]) : m)) : raw
  }
}
