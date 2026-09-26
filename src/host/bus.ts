// Bus d'événements du PC : le runner publie les événements de simulation et de
// session ; l'audio, le narrateur, les FX, la caméra, le HUD et les vibrations s'y abonnent.
import type { SimEvent } from '../sim/types.ts'
import type { Lang } from '../shared/protocol.ts'

type Handler<T> = (e: T) => void

export class Emitter<T> {
  private handlers = new Set<Handler<T>>()
  on(h: Handler<T>): () => void {
    this.handlers.add(h)
    return () => this.handlers.delete(h)
  }
  emit(e: T): void {
    for (const h of this.handlers) h(e)
  }
}

/** Événements de la simulation, publiés au tick où ils se produisent. */
export const simEvents = new Emitter<SimEvent>()

/**
 * Sous-titre du narrateur, publié par l'audio (src/host/audio/narrator.ts) à chaque réplique
 * jouée — y compris quand la voix manque ou que le réglage narrateur vaut 'text' (rien si 'off').
 * L'UI l'affiche en récitatif (ART_BIBLE §8.2) : `parts` isole le nom de couleur (pastille).
 */
export type SubtitleEvent =
  | {
      type: 'show'
      /** Identifiant unique de cet affichage (pour le 'hide' correspondant). */
      id: number
      lineId: string
      /** Texte complet, traduit, couleur substituée. */
      text: string
      /** Le même texte découpé ; un morceau avec `colorIndex` est un nom de couleur. */
      parts: { text: string; colorIndex?: number }[]
      colorIndex?: number
      lang: Lang
      /** Durée d'affichage conseillée (ms) : voix + 0,6 s, ou temps de lecture estimé. */
      durationMs: number
      /** Vrai si la voix est jouée. */
      voiced: boolean
    }
  | { type: 'hide'; id: number }

export const subtitleEvents = new Emitter<SubtitleEvent>()
