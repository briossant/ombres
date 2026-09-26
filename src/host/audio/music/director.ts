// Directeur musical : une musique par écran, fondus enchaînés, partition générative en manche
// (chargée à la demande), étouffement en pause.
import type { SimEvent } from '../../../sim/types.ts'
import type { GameView } from '../../view.ts'
import type { AudioEngine } from '../engine.ts'
import type { AssetId } from '../manifest.gen.ts'
import type { RoundMusic } from './round.ts'
import { createTrack, type Track } from './tracks.ts'

/** Écrans du jeu vus par l'audio (l'UI appelle setScreen à chaque transition). */
export type AudioScreen =
  | 'loading' // chargement : silence (l'audio n'est pas encore autorisé)
  | 'title' // écran titre (bots en fond)
  | 'lobby' // salon : QR, joueurs, réglages de partie
  | 'intro' // cartes de règles / présentation de la manche
  | 'round' // manche : partition générative
  | 'roundResults' // résultats de manche
  | 'gameResults' // podium, titres, revanche
  | 'credits'

const TRACKS: Partial<Record<AudioScreen, AssetId>> = {
  title: 'title_zhelanov_ambient_1',
  lobby: 'lobby_isaiah658_relaxing_loop',
  intro: 'lobby_isaiah658_relaxing_loop',
  roundResults: 'results_cynicmusic_synthwave4k',
  gameResults: 'podium_cynicmusic_lifewave2k',
  credits: 'credits_tritachyon_dust',
}

export class MusicDirector {
  screen: AudioScreen = 'loading'
  private track: Track | null = null
  private round: RoundMusic | null = null
  private roundLoading: Promise<RoundMusic> | null = null

  constructor(
    readonly engine: AudioEngine,
    private readonly getView: () => GameView,
  ) {
    // avant le premier geste, le navigateur refuse de lancer les <audio> : on relance ensuite
    engine.onUnlock(() => this.track?.resume())
  }

  setScreen(screen: AudioScreen): void {
    if (screen === this.screen) return
    const prev = this.screen
    this.screen = screen
    const wanted = TRACKS[screen]
    // même piste (lobby → intro) : on garde, juste un peu plus bas pendant les règles
    if (wanted && this.track?.id === wanted) {
      this.track.setDb(screen === 'intro' ? -4 : 0, 1.5)
    } else {
      this.track?.stop(screen === 'round' ? 1.8 : 2.5)
      this.track = null
      if (wanted) {
        this.track = createTrack(this.engine, wanted)
        // après une manche, on laisse le gong respirer avant les résultats
        const delay = prev === 'round' ? 1.2 : 0.3
        const fade = screen === 'title' ? 3 : screen === 'roundResults' || screen === 'gameResults' ? 4 : 2.5
        this.track?.start(fade, delay)
      }
    }
    if (screen === 'round') void this.loadRound()
    else if (prev === 'round') this.round?.stop(0.6)
    // la partition et ses échantillons se préparent pendant le lobby
    if (screen === 'lobby' || screen === 'intro') void this.loadRound()
  }

  /** Charge la partition générative (code et échantillons). */
  loadRound(): Promise<RoundMusic> {
    if (!this.roundLoading) {
      this.roundLoading = import('./round.ts').then(async m => {
        const r = new m.RoundMusic(this.engine)
        await r.prepare()
        this.round = r
        return r
      })
      this.roundLoading.catch(err => console.warn('[audio] partition générative indisponible', err))
    }
    return this.roundLoading
  }

  get roundMusic(): RoundMusic | null {
    return this.round
  }

  onSimEvent(e: SimEvent): void {
    if (this.screen !== 'round') return
    this.round?.onEvent(e, this.getView())
  }

  update(): void {
    if (this.screen === 'round') this.round?.update(this.getView())
  }
}
