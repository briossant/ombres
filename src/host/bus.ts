// Bus d'événements du PC : le runner publie les événements de simulation et de
// session ; l'audio, le narrateur, les FX, la caméra, le HUD et les vibrations s'y abonnent.
import type { SimEvent } from '../sim/types.ts'

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
