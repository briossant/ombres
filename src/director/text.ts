// Mise en forme des répliques et des indications pour l'affichage (sous-titres, bulles,
// téléphones) et chemins des clips audio. Pur : pas de DOM.
import { RULES } from '../sim/rules.ts'
import { getLang, t } from '../shared/i18n.ts'
import { colorName } from '../shared/players.ts'
import type { Lang } from '../shared/protocol.ts'
import type { HintCue } from './hints.ts'
import type { NarratorCue } from './narrator.ts'

/** Morceau de texte ; `colorIndex` présent = c'est un nom de couleur (à écrire en variante texte, avec pastille/glyphe). */
export interface TextPart {
  text: string
  colorIndex?: number
}

/** Découpe un modèle i18n autour de {color}, les autres paramètres étant déjà substitués. */
function splitColor(template: string, colorIndex: number | undefined, lang: Lang): TextPart[] {
  const i = template.indexOf('{color}')
  if (i < 0 || colorIndex === undefined) return [{ text: template }]
  const parts: TextPart[] = []
  if (i > 0) parts.push({ text: template.slice(0, i) })
  parts.push({ text: colorName(colorIndex, lang), colorIndex })
  const rest = template.slice(i + '{color}'.length)
  if (rest) parts.push({ text: rest })
  return parts
}

// ─── Narrateur ──────────────────────────────────────────────────────────────

/** Texte du sous-titre, découpé pour colorer le nom (récitatif, ART_BIBLE §8.2). */
export function narratorTextParts(cue: Pick<NarratorCue, 'key' | 'colorIndex'>, lang: Lang = getLang()): TextPart[] {
  return splitColor(t(cue.key, undefined, lang), cue.colorIndex, lang)
}

export function narratorText(cue: Pick<NarratorCue, 'key' | 'colorIndex'>, lang: Lang = getLang()): string {
  return narratorTextParts(cue, lang)
    .map(p => p.text)
    .join('')
}

/** Id du clip : `<lineId>` (neutre) ou `<lineId>.<colorIndex>`. */
export function narratorClipId(lineId: string, colorIndex?: number): string {
  return colorIndex === undefined ? lineId : `${lineId}.${colorIndex}`
}

/** Chemin du MP3 (relatif à la racine publique) : audio/narrator/<lang>/<id>.mp3. */
export function narratorClipPath(cue: Pick<NarratorCue, 'lineId' | 'colorIndex'>, lang: Lang, base = 'audio/narrator'): string {
  return `${base}/${lang}/${narratorClipId(cue.lineId, cue.colorIndex)}.mp3`
}

/**
 * Durée d'affichage du sous-titre (docs/research/tts.md §9) : durée du clip + 0,6 s avec la voix ;
 * en texte seul, 0,9 s + 0,06 s par caractère, entre 1,8 et 5 s. Jamais moins que RULES.subtitleSeconds avec la voix.
 */
export function subtitleSeconds(cue: Pick<NarratorCue, 'key' | 'colorIndex' | 'duration'>, voice: boolean, lang: Lang = getLang()): number {
  if (voice) return Math.max(cue.duration + 0.6, RULES.subtitleSeconds)
  const n = narratorText(cue, lang).length
  return Math.min(5, Math.max(1.8, 0.9 + 0.06 * n))
}

// ─── Indications ────────────────────────────────────────────────────────────

export interface ButtonLabels {
  /** Libellé du bouton PLONGER (ex. « Espace » pour le clavier). Défaut : hints.btn.dive. */
  dive?: string
  /** Libellé du bouton COUP D'AILE. Défaut : hints.btn.flap. */
  flap?: string
}

/**
 * Paramètres i18n complets d'une indication : `t(cue.key, hintParams(cue, lang))`. C'est ce qu'il faut
 * envoyer au téléphone dans un message `{ k: 'toast', key: cue.key, params }`.
 */
export function hintParams(cue: Pick<HintCue, 'colorIndex'>, lang: Lang = getLang(), labels: ButtonLabels = {}): Record<string, string> {
  return {
    dive: labels.dive ?? t('hints.btn.dive', undefined, lang),
    flap: labels.flap ?? t('hints.btn.flap', undefined, lang),
    ...(cue.colorIndex !== undefined ? { color: colorName(cue.colorIndex, lang) } : {}),
  }
}

export function hintTextParts(cue: Pick<HintCue, 'key' | 'colorIndex'>, lang: Lang = getLang(), labels: ButtonLabels = {}): TextPart[] {
  const { color: _color, ...buttons } = hintParams(cue, lang, labels)
  return splitColor(t(cue.key, buttons, lang), cue.colorIndex, lang)
}

export function hintText(cue: Pick<HintCue, 'key' | 'colorIndex'>, lang: Lang = getLang(), labels: ButtonLabels = {}): string {
  return hintTextParts(cue, lang, labels)
    .map(p => p.text)
    .join('')
}

/** Durée d'affichage conseillée d'une bulle d'indication (s), toujours < RULES.hintMinGap. */
export function hintDisplaySeconds(text: string): number {
  return Math.min(RULES.hintMinGap - 2, Math.max(2.5, 1 + 0.06 * text.length))
}
