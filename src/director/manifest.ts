// Lecture du manifest des voix (public/audio/narrator/manifest.json, écrit par tools/tts).
// Pur : le chargement (fetch) est à la charge de l'appelant (audio).
import type { Lang } from '../shared/protocol.ts'
import { NARRATOR_LINES, lineHasColor } from './lines.ts'
import { narratorClipId } from './text.ts'

/** Une entrée du manifest (seuls les champs utiles au jeu sont typés). */
export interface NarratorManifestLine {
  /** `<lineId>` ou `<lineId>.<colorIndex>`. */
  id: string
  lang: Lang
  /** Chemin relatif au dossier du manifest, ex. « fr/leaderChange2.5.mp3 ». */
  file: string
  /** Durée réelle du MP3 (s), silences de tête et de queue compris. */
  duration_s: number
  text?: string
}

export interface NarratorManifest {
  generator: string
  format: { codec: string; sample_rate: number; channels: number }
  total_duration_s: number
  lines: NarratorManifestLine[]
}

export interface NarratorClipIndex {
  /** Durée d'un clip (pour NarratorOptions.durationOf), undefined s'il manque. */
  duration(lang: Lang, lineId: string, colorIndex?: number): number | undefined
  /** Chemin du fichier relatif au dossier du manifest, undefined s'il manque. */
  file(lang: Lang, lineId: string, colorIndex?: number): string | undefined
  /**
   * Fichiers à précharger pour une partie : répliques neutres + répliques des seules couleurs
   * présentes, dans la seule langue active (GDD §16.2).
   */
  preload(lang: Lang, colorIndices: readonly number[]): string[]
}

export function indexNarratorManifest(manifest: NarratorManifest): NarratorClipIndex {
  const byKey = new Map<string, NarratorManifestLine>()
  for (const l of manifest.lines) byKey.set(`${l.lang}/${l.id}`, l)
  const get = (lang: Lang, lineId: string, colorIndex?: number) => byKey.get(`${lang}/${narratorClipId(lineId, colorIndex)}`)
  return {
    duration: (lang, lineId, colorIndex) => get(lang, lineId, colorIndex)?.duration_s,
    file: (lang, lineId, colorIndex) => get(lang, lineId, colorIndex)?.file,
    preload: (lang, colors) => {
      const out: string[] = []
      for (const line of NARRATOR_LINES) {
        const ids = lineHasColor(line) ? colors.map(c => narratorClipId(line.id, c)) : [line.id]
        for (const id of ids) {
          const e = byKey.get(`${lang}/${id}`)
          if (e) out.push(e.file)
        }
      }
      return out
    },
  }
}
