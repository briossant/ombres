// Horloge musicale : relie le temps de soleil (simulation) au temps audio.
// La simulation avance par ticks de 30 Hz, avec des ralentis ; l'audio a besoin d'une horloge
// lisse et monotone pour programmer ses notes un peu à l'avance. On suit donc le temps de
// simulation avec une boucle à verrouillage de phase : on prédit à la vitesse courante,
// on corrige doucement l'écart, on recale d'un coup s'il dépasse 250 ms (pause, reprise).

export class MusicClock {
  /** Temps de soleil estimé à l'instant audio `audioT`. */
  simT = 0
  audioT = 0
  /** Vitesse du temps de soleil par seconde audio (1 = normal, 0,35 = ralenti, 0 = pause). */
  rate = 1
  private locked = false
  private lastSimSample = NaN
  private stallFor = 0

  reset(): void {
    this.locked = false
    this.lastSimSample = NaN
    this.stallFor = 0
  }

  /**
   * @param simNow temps de soleil mesuré (interpolé entre deux ticks)
   * @param timeScale facteur de temps annoncé par le runner
   * @param audioNow horloge audio
   */
  sync(simNow: number, timeScale: number, audioNow: number): void {
    const dtA = Math.max(0, audioNow - this.audioT)
    // une simulation arrêtée (pause, onglet caché) fige l'horloge, quel que soit timeScale
    if (simNow === this.lastSimSample) this.stallFor += dtA
    else this.stallFor = 0
    this.lastSimSample = simNow
    const rate = this.stallFor > 0.2 ? 0 : Math.max(0, timeScale)
    if (!this.locked) {
      this.simT = simNow
      this.locked = true
    } else {
      const predicted = this.simT + dtA * this.rate
      const err = simNow - predicted
      this.simT = Math.abs(err) > 0.25 ? simNow : predicted + err * 0.1
    }
    this.audioT = audioNow
    this.rate = rate
  }

  /** Instant audio d'un instant de soleil (valable dans la courte fenêtre d'anticipation). */
  toAudio(simTime: number): number {
    return this.audioT + (simTime - this.simT) / Math.max(this.rate, 0.05)
  }
}
