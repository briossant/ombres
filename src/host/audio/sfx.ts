// Bruitages : table événement de simulation → sons (couches décalées de quelques ms),
// sons continus des oiseaux (battements de montée, souffle du piqué qui suit l'oiseau),
// interface (playUi) et ponctuations (stinger). Spatialisés selon la position à l'écran.
import { RULES } from '../../sim/rules.ts'
import type { SimEvent, SimMode, SimState } from '../../sim/types.ts'
import type { GameView } from '../view.ts'
import type { AudioEngine } from './engine.ts'
import type { AudioScreen } from './music/director.ts'
import { measureLoudness } from './loudness.ts'
import { clacBuffer, tskBuffer } from './procedural.ts'
import { SOUNDS, type SoundName } from './sounds.ts'
import { whiteNoise } from './music/synth.ts'
import { clamp, dbToGain, glide, noteToMidi } from './util.ts'
import { SoundPlayer, type PlayOptions, type Voice } from './voices.ts'
import type { AssetId } from './manifest.gen.ts'

/** Sons d'interface disponibles pour l'UI (PC). */
export type UiSound =
  | 'hover' // survol / focus
  | 'click' // clic, sélection
  | 'confirm' // valider
  | 'back' // retour, annuler
  | 'error'
  | 'toggle' // bascule d'un réglage
  | 'open' // ouverture d'un panneau
  | 'close'
  | 'slider' // cran d'un curseur (value 0..1 → hauteur)
  | 'join' // un joueur rejoint (colorIndex → sa note)
  | 'leave' // un joueur part (colorIndex)
  | 'botAdd' // ajout de bot (colorIndex)
  | 'botRemove'
  | 'ready' // un joueur est prêt
  | 'unready'
  | 'launch' // lancement de la partie
  | 'count' // décompte des pourcentages aux résultats (value 0..1 → hauteur)
  | 'sun' // un soleil vole vers un nom (value = rang 0..)

/** Ponctuations musicales hors manche. */
export type Stinger =
  | 'roundWin' // vainqueur de manche (colorIndex)
  | 'gameWin' // vainqueur de la partie (colorIndex)
  | 'lastRound' // annonce de la dernière manche (× 2)
  | 'pause'
  | 'resume'
  | 'rematch'

export interface UiOptions {
  colorIndex?: number
  /** Valeur 0..1 (curseur, décompte) ou rang (soleil). */
  value?: number
}

/** Note de chaque couleur de joueur : la mineur pentatonique, de la2 à do5 (transposée par le code). */
export const PLAYER_NOTES = ['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5', 'G5', 'A5', 'C6'] as const
const TONGUE: readonly { midi: number; id: AssetId }[] = (['A3', 'C4', 'D4', 'E4', 'G4', 'A4', 'C5', 'D5', 'E5'] as const).map(
  n => ({ midi: noteToMidi(n), id: `tongue_${n}` as AssetId }),
)

/** Échantillon de tongue drum le plus proche d'une note, et transposition à appliquer. */
export function tongueFor(midi: number): { id: AssetId; semitones: number } {
  let best = TONGUE[0]!
  for (const t of TONGUE) if (Math.abs(t.midi - midi) < Math.abs(best.midi - midi)) best = t
  return { id: best.id, semitones: midi - best.midi }
}

type Profile = 'round' | 'lobby' | 'demo' | 'none'

const nightOf = (sim: SimState) => sim.sun.phase === 'night' || sim.sun.phase === 'over'

// ─── Mixage des bruitages de jeu (présentation, pas du gameplay) ─────────────
/**
 * Profils : écran titre lointain ; salon nettement sous sa musique (on y lit le QR, on discute).
 * Salon : −10 dB (mesuré à 12 oiseaux : −8 dB laissait les bruitages 2,2 LU seulement sous la musique).
 */
const PROFILE_DB: Record<Profile, number> = { round: 0, lobby: -10, demo: -12, none: 0 }
/** Cartes des règles (écran audio 'intro') : le groupe lit, la simulation du salon continue. */
const INTRO_EXTRA_DB = -8
/**
 * Sons de « lit » (battements, souffles, piqué qui descend, « tsk », tours) : un bot y est
 * BOT_BED_DB sous un humain, et au-delà de CROWD_FROM oiseaux tout le lit baisse de
 * −10·log10(n / CROWD_FROM) dB (−3 dB à 12) : on entend son propre coup d'aile dans la mêlée.
 */
const BOT_BED_DB = -5
const CROWD_FROM = 6
/** « Tsk » : au plus TSK_PER_SECOND par seconde, tous oiseaux confondus. */
const TSK_PER_SECOND = 3
/** Creux de musique sous un accent (couronne, gros vol, dix secondes ; esquive plus court). */
const DIP_DB = -3
const DIP_S = 0.25
const DODGE_DIP_S = 0.2
/** Voix simultanées pendant la Grande Ombre (thread audio chargé) ; les signaux de manche passent. */
const MAX_VOICES = 48
const MAX_VOICES_GREAT_SHADOW = 24
/** Un bot hors cadre ne joue pas ses battements de montée (gain spatial < ceci). */
const BOT_FLAP_MIN_GAIN = 0.86
/** Résultats (do majeur) : degrés d'une gamme montante pour le décompte et les soleils. */
const COUNT_STEPS = [0, 2, 4, 5, 7, 9, 11, 12]
const SUN_STEPS = [0, 2, 4, 7, 9, 12, 14, 16]
/**
 * Soleils des résultats : jusqu'à 4 par nom, une quarantaine en 3 s à 12 joueurs, pendant la
 * réplique du narrateur. Une note au plus toutes les SUN_MIN_GAP_S (l'arpège monte, puis repart),
 * le verre une fois sur trois, et plus bas, sans verre, tant que la voix parle.
 */
const SUN_MIN_GAP_S = 0.12
const SUN_UNDER_VOICE_DB = -4
/** Écran titre en mi♭ mineur : les sons d'interface accordés en la montent d'un demi-ton (si♭). */
const TITLE_TRANSPOSE = 1
/** Gel de la nuit : le monde se tait (le gong arrive à 1,5 s). */
const NIGHT_SILENCE_S = 1.4

/** Atténuation du lit de bruitages quand la foule dépasse CROWD_FROM oiseaux (dB, ≤ 0). */
function crowdDb(sim: SimState): number {
  const n = sim.birds.length
  return n > CROWD_FROM ? -10 * Math.log10(n / CROWD_FROM) : 0
}

export class SfxSystem {
  readonly player: SoundPlayer
  /** Gain global des bruitages de jeu selon le contexte (écran titre : lointain). */
  private profileDb = 0
  private profile: Profile = 'none'
  private diveVoices = new Map<number, Voice>()
  /** Sifflement du piqué (air dans les plumes) : bruit en bande étroite qui monte avec la vitesse. */
  private whistles = new Map<number, { src: AudioBufferSourceNode; filter: BiquadFilterNode; gain: GainNode; pan: StereoPannerNode }>()
  private flapPhase = new Float64Array(12)
  /** Dernier battement signalé par l'animation, par oiseau (s, horloge audio). */
  private externalBeatAt = new Float64Array(12).fill(-1e9)
  private lastCryAt = -1e9
  private nightGongTimer: ReturnType<typeof setTimeout> | null = null
  /** Écran audio courant (cartes des règles plus calmes, transposition de l'écran titre). */
  private screen: AudioScreen = 'loading'
  /** Derniers « tsk » joués (horloge audio), pour le plafond global. */
  private tskTimes: number[] = []
  /** Soleils des résultats : chacun monte d'un degré (remis à zéro après une pause). */
  private sunStep = 0
  private lastSunAt = -1e9
  /**
   * Vrai quand la partition de manche joue elle-même les coups de bois des 5 dernières secondes
   * (calés sur le battement de cœur) : l'événement de simulation ne les rejoue pas.
   */
  scoreKeepsTime: () => boolean = () => false

  constructor(
    readonly engine: AudioEngine,
    private readonly getView: () => GameView,
  ) {
    this.player = new SoundPlayer(engine, SOUNDS)
    // sons générés : réglés en sonie perçue comme les fichiers
    for (const [id, make] of [
      ['proc_tsk', tskBuffer],
      ['proc_clac', clacBuffer],
    ] as const) {
      const buf = make(engine.ctx)
      engine.assets.put(id, buf, measureLoudness(buf).momentaryMax)
    }
  }

  // ─── API ─────────────────────────────────────────────────────────────────

  play(name: SoundName, o?: PlayOptions): Voice | null {
    return this.player.play(name, o)
  }

  /** Note d'une couleur de joueur (tongue drum), à l'instant `when`. */
  playerNote(colorIndex: number, o: PlayOptions & { octave?: number } = {}): Voice | null {
    const name = PLAYER_NOTES[((colorIndex % 12) + 12) % 12]!
    const t = tongueFor(noteToMidi(name) + 12 * (o.octave ?? 0) + this.uiTranspose)
    return this.player.play('ui_note', { ...o, file: t.id, semitones: (o.semitones ?? 0) + t.semitones })
  }

  /** Écran audio (appelé par AudioSystem.setScreen). */
  setScreen(screen: AudioScreen): void {
    this.screen = screen
    if (screen === 'roundResults') this.sunStep = 0
  }

  /** Transposition des sons d'interface accordés : l'écran titre est en mi♭ mineur. */
  private get uiTranspose(): number {
    return this.screen === 'title' ? TITLE_TRANSPOSE : 0
  }

  /** Gain des bruitages de jeu selon le contexte (profil de simulation, cartes des règles). */
  private get gameDb(): number {
    return this.profileDb + (this.screen === 'intro' ? INTRO_EXTRA_DB : 0)
  }

  playUi(name: UiSound, o: UiOptions = {}): void {
    const p = this.player
    const now = this.engine.now
    const color = o.colorIndex ?? 0
    switch (name) {
      case 'hover':
        p.play('ui_hover')
        break
      case 'click':
        p.play('ui_click')
        break
      case 'confirm':
        p.play('ui_confirm', { semitones: this.uiTranspose })
        p.play('ui_confirm_wood', { when: now + 0.012 })
        break
      case 'back':
        p.play('ui_back')
        p.play('ui_back_paper', { when: now + 0.02 })
        break
      case 'error':
        p.play('ui_error')
        p.play('ui_error', { when: now + 0.11, db: -3, semitones: -2 })
        break
      case 'toggle':
        p.play('ui_toggle', { semitones: (o.value ?? 1) > 0.5 ? 2 : -1 })
        break
      case 'open':
        p.play('ui_open')
        break
      case 'close':
        p.play('ui_close')
        break
      case 'slider':
        p.play('ui_slider', { semitones: Math.round(clamp(o.value ?? 0.5, 0, 1) * 12) - 4 })
        break
      case 'join':
        p.play('ui_flap')
        this.playerNote(color, { when: now + 0.06 })
        this.playerNote(color, { when: now + 0.36, octave: 1, db: -7 })
        break
      case 'leave':
        p.play('ui_fold')
        this.playerNote(color, { when: now + 0.05, octave: -1, db: -4 })
        break
      case 'botAdd':
        p.play('ui_click')
        this.playerNote(color, { when: now + 0.04, db: -3 })
        break
      case 'botRemove':
        p.play('ui_back')
        break
      case 'ready':
        p.play('ui_ready')
        if (o.colorIndex !== undefined) this.playerNote(color, { when: now + 0.03, octave: 1, db: -6 })
        break
      case 'unready':
        p.play('ui_unready')
        break
      case 'launch':
        p.play('st_launch')
        p.play('st_launch_bell', { when: now + 0.5 })
        break
      case 'count':
        // décompte des parts : gamme de do majeur qui monte avec le décompte (0..1)
        p.play('ui_count', { semitones: COUNT_STEPS[Math.min(COUNT_STEPS.length - 1, Math.floor(clamp(o.value ?? 0, 0, 1) * COUNT_STEPS.length))]! })
        break
      case 'sun': {
        // chaque soleil joué monte d'un degré (do majeur pentatonique), quel que soit son rang
        if (now - this.lastSunAt > 1.5) this.sunStep = 0
        if (now - this.lastSunAt < SUN_MIN_GAP_S) break
        this.lastSunAt = now
        const step = this.sunStep++
        const t = tongueFor(noteToMidi('C5') + SUN_STEPS[step % SUN_STEPS.length]!)
        const voice = this.engine.ducking
        p.play('ui_note', { file: t.id, semitones: t.semitones, db: -8 + (voice ? SUN_UNDER_VOICE_DB : 0) })
        if (!voice && step % 3 === 0) p.play('ui_ready', { when: now + 0.02, db: -14 })
        break
      }
    }
  }

  stinger(name: Stinger, o: UiOptions = {}): void {
    const p = this.player
    const now = this.engine.now
    const color = o.colorIndex ?? 0
    switch (name) {
      case 'roundWin':
        // arpège montant sur la note du vainqueur, puis cloches et harpe (do majeur, comme la musique
        // des résultats) ; la harpe culmine avant la réplique du narrateur (1,5 s après, runner)
        for (const [i, oct] of [0, 0, 1].entries()) this.playerNote(color, { when: now + i * 0.16, octave: oct, semitones: [0, 7, 0][i]!, db: -2 })
        p.play('st_round_win_harp', { when: now + 0.2, fadeIn: 0.3 })
        p.play('st_round_win_chord', { when: now + 0.45 })
        break
      case 'gameWin':
        // entrées étalées (et non empilées) : le gong, la harpe, la note du champion, le cri ; tout
        // est retombé quand le narrateur nomme le champion (2,2 s après, runner)
        p.play('st_game_win_gong')
        p.play('st_game_win_harp', { when: now + 0.3 })
        for (let i = 0; i < 4; i++) this.playerNote(color, { when: now + 0.75 + i * 0.16, octave: i >> 1, semitones: [0, 7, 0, 7][i]!, db: -10 })
        p.play('st_game_win_cry', { when: now + 1.1 })
        break
      case 'lastRound':
        // la montée démarre en cours de route (calée sur « Envol ») : fondu d'entrée
        p.play('st_last_round', { fadeIn: 0.3 })
        break
      case 'pause':
        p.play('st_pause')
        break
      case 'resume':
        p.play('st_resume')
        break
      case 'rematch':
        p.play('st_rematch')
        p.play('st_launch_bell', { when: now + 0.3, db: -3 })
        break
    }
  }

  /**
   * Coup de bois d'une des 5 dernières secondes (n = 5..1), à l'instant `when` : la partition
   * l'appelle sur le battement de cœur le plus proche de la seconde (sinon l'événement de simulation).
   */
  lastSecond(n: number, when: number): void {
    if (this.profile !== 'round') return
    this.player.play('last_tick', { when, semitones: 5 - n, db: n === 1 ? 2 : 0 })
  }

  // ─── Événements de simulation ───────────────────────────────────────────

  handle(e: SimEvent): void {
    const view = this.getView()
    const sim = view.sim
    if (!sim) return
    this.setProfile(sim.config.mode)
    if (this.profile === 'none') return
    const p = this.player
    const now = this.engine.now
    const pos = (slot: number): { x?: number; y?: number } => {
      const b = sim.bySlot[slot]
      return b ? { x: b.x, y: b.y } : {}
    }
    const db = this.gameDb
    const human = (slot: number) => {
      const k = view.players[slot]?.kind
      return k !== undefined && k !== 'bot'
    }
    /** Gain d'un son de « lit » : un bot plus bas qu'un humain, et la foule plus basse. */
    const bed = (slot: number) => db + (human(slot) ? 0 : BOT_BED_DB) + crowdDb(sim)
    const roundCues = this.profile === 'round'
    /** Au salon, les sons de combat lourds seulement si un humain est en cause (entre bots : rien). */
    const heavy = (...slots: number[]) => this.profile !== 'lobby' || slots.some(human)
    // nuit : tout est figé, silence (seul le gong viendra) ; les oiseaux qui planent se taisent
    if (roundCues && nightOf(sim) && e.type !== 'night') return
    switch (e.type) {
      case 'countdown':
        if (!roundCues) break
        if (e.n > 0) p.play('count_tick', { semitones: (3 - e.n) * 2 })
        else {
          p.play('count_tick', { semitones: 7 })
          p.play('count_conch', { when: now + 0.02 })
          p.play('count_bell', { when: now + 0.05 })
        }
        break
      case 'phase':
        if (!roundCues) break
        if (e.phase === 'afternoon' || e.phase === 'golden' || e.phase === 'sunset') p.play('phase_chime')
        else if (e.phase === 'greatShadow') {
          p.play('gs_boom')
          p.play('gs_tremor', { when: now + 0.15 })
        }
        break
      case 'tenSeconds':
        if (!roundCues) break
        p.play('ten_seconds')
        this.engine.dipMusic(DIP_DB, DIP_S)
        break
      case 'lastSeconds':
        // la partition les joue elle-même, calés sur le battement de cœur (lastSecond)
        if (roundCues && !this.scoreKeepsTime()) this.lastSecond(e.n, now)
        break
      case 'night':
        if (!roundCues) break
        // coupure nette (la musique se coupe d'elle-même), 1,5 s de vrai silence, puis le gong
        p.stopAll(undefined, 0.15)
        this.stopDiveVoices()
        this.engine.silenceWorld(NIGHT_SILENCE_S)
        if (this.nightGongTimer) clearTimeout(this.nightGongTimer)
        if (this.engine.offline) p.play('night_gong', { when: now + 1.5 })
        else this.nightGongTimer = setTimeout(() => p.play('night_gong'), 1500)
        break
      case 'altitude':
        if (e.strong) p.play('dive_down', { ...pos(e.slot), db: bed(e.slot) })
        break
      case 'lock':
        if (human(e.target)) p.play('lock_tick', { ...pos(e.target), db })
        break
      case 'diveWindup': {
        const at = pos(e.hunter)
        // un cri par prise d'élan, mais pas un chœur : 0,6 s mini entre deux cris
        if (now - this.lastCryAt > 0.6) {
          p.play('cry_windup', { ...at, db })
          this.lastCryAt = now
        }
        p.play('wing_fold', { ...at, db: db - 2, when: now + 0.03 })
        break
      }
      case 'diveCommit': {
        const at = pos(e.hunter)
        p.play('clac', { ...at, db })
        if (heavy(e.hunter, e.target)) p.play('dive_boom', { ...at, db, when: now + 0.01 })
        break
      }
      case 'diveCancel':
        this.stopDive(e.hunter)
        if (e.reason === 'feint') p.play('feint', { ...pos(e.hunter), db })
        break
      case 'diveHit': {
        this.stopDive(e.hunter, 0.06)
        const at = { x: e.x, y: e.y }
        const big = e.crown ? 3 : 0
        p.play('hit_punch', { ...at, db: db + big })
        p.play('hit_body', { ...at, db: db + big, when: now + 0.03 })
        p.play('feathers', { ...at, db, when: now + 0.06 })
        if (heavy(e.hunter, e.target)) {
          p.play('victim_cry', { ...at, db: db - 1, when: now + 0.09 })
          p.play('stun_tumble', { ...pos(e.target), db, when: now + 0.25 })
        }
        if (e.crown) {
          p.play('steal_sub', { db: db - 2, when: now + 0.04 })
          p.play('crown_bell', { ...at, db: db - 4, when: now + 0.12, semitones: -5 })
        }
        break
      }
      case 'diveMiss': {
        this.stopDive(e.hunter, 0.05)
        const at = { x: e.x, y: e.y }
        p.play('miss_thud', { ...pos(e.hunter), db })
        p.play('miss_sand', { ...pos(e.hunter), db, when: now + 0.03 })
        if (e.dodged) {
          p.play('dodge_whoosh', { ...pos(e.target), db })
          if (human(e.target)) p.play('dodge_ting', { ...at, db, when: now + 0.08 })
          // l'esquive d'un humain (ou contre un humain) creuse la musique : elle se lit
          if (roundCues && (human(e.target) || human(e.hunter))) this.engine.dipMusic(DIP_DB, DODGE_DIP_S)
        }
        break
      }
      case 'flap':
        p.play('flap_strong', { ...pos(e.slot), db: bed(e.slot) })
        p.play('flap_whoosh', { ...pos(e.slot), db: bed(e.slot), when: now + 0.05 })
        break
      case 'flapReady':
        if (human(e.slot) && this.profile !== 'demo') p.play('flap_ready', { ...pos(e.slot), db })
        break
      case 'bump':
        p.play('bump', { x: e.x, y: e.y, db })
        p.play('bump_feathers', { x: e.x, y: e.y, db, when: now + 0.03 })
        break
      case 'towerBump':
        p.play('tower_bump', { ...pos(e.slot), db: bed(e.slot) })
        p.play('tower_scrape', { ...pos(e.slot), db: bed(e.slot), when: now + 0.02 })
        break
      case 'paleOnStrong': {
        // plafond global : un grésillement de fond, pas une pluie
        const recent = this.tskTimes.filter(t => now - t < 1)
        this.tskTimes = recent
        if (recent.length >= TSK_PER_SECOND) break
        if (p.play('tsk', { x: e.x, y: e.y, db: bed(e.slot) })) recent.push(now)
        break
      }
      case 'hidden':
        if (e.hidden && human(e.slot)) p.play('hidden_in', { ...pos(e.slot), db: bed(e.slot), fadeIn: 0.08 })
        break
      case 'storm':
        if (e.inside) p.play('storm_gust', { ...pos(e.slot), db })
        break
      case 'crown': {
        // la cloche, entendue d'où que soit le nouveau meneur (panoramique sans atténuation), et un
        // creux de musique ; la note du nouveau meneur est jouée en rythme par la partition
        if (e.slot < 0 || this.profile !== 'round') break
        const b = sim.bySlot[e.slot]
        p.play('crown_bell', { db, ...(b ? { pan: this.engine.spatial(b.x, b.y).pan } : {}) })
        this.engine.dipMusic(DIP_DB, DIP_S)
        break
      }
      case 'bigSteal':
        // au salon, seulement un vrai vol (à un autre oiseau) commis par un humain : son propre retour
        if (this.profile === 'demo' || (this.profile === 'lobby' && (e.victim < 0 || !human(e.slot)))) break
        p.play('steal_sub', { db: db - 2 })
        p.play('steal_sand', { ...pos(e.slot), db, when: now + 0.05 })
        if (roundCues) this.engine.dipMusic(DIP_DB, DIP_S)
        break
      case 'territoryReset':
        p.play('territory_reset', { db })
        break
      default:
        break
    }
  }

  // ─── Sons continus des oiseaux (appelé à chaque image) ──────────────────

  private lastTick = -1
  private stalledFor = 0

  update(dt: number): void {
    const sim = this.getView().sim
    if (!sim) return
    this.setProfile(sim.config.mode)
    if (this.profile === 'none') return
    // simulation figée (pause, fin de manche, écran de résultats) : les oiseaux se taisent
    this.stalledFor = sim.tick === this.lastTick ? this.stalledFor + dt : 0
    this.lastTick = sim.tick
    if (this.stalledFor > 0.25 || (this.profile === 'round' && nightOf(sim))) {
      if (this.diveVoices.size || this.whistles.size) this.stopDiveVoices()
      return
    }
    // Grande Ombre : le thread audio est le plus chargé (partition au complet) ; moins de voix
    const gs = this.profile === 'round' && sim.sun.t >= RULES.greatShadowAt * (sim.sun.T / RULES.roundSunSeconds)
    this.player.maxTotalVoices = gs ? MAX_VOICES_GREAT_SHADOW : MAX_VOICES
    this.updateDives(sim)
    this.updateFlaps(sim, dt)
  }

  /** Un humain pilote cet oiseau (clavier, manette, téléphone). */
  private isHuman(slot: number): boolean {
    const k = this.getView().players[slot]?.kind
    return k !== undefined && k !== 'bot'
  }

  /** Battement de montée : bots hors cadre muets, lit plus bas pour les bots et la foule. */
  private climbFlap(sim: SimState, slot: number, x: number, y: number, db: number): void {
    const human = this.isHuman(slot)
    if (this.engine.spatial(x, y).gain < (human ? 0.45 : BOT_FLAP_MIN_GAIN)) return // hors cadre : on économise les voix
    this.player.play('flap_climb', { x, y, db: this.gameDb + db + (human ? 0 : BOT_BED_DB) + crowdDb(sim) })
  }

  /**
   * Battement d'aile synchronisé sur l'animation (optionnel) : le rendu peut l'appeler à chaque
   * coup d'aile vers le bas ; sinon le rythme est estimé depuis la vitesse de montée.
   */
  wingbeat(slot: number, strength: number): void {
    const sim = this.getView().sim
    const b = sim?.bySlot[slot]
    if (!sim || !b || this.profile === 'none') return
    this.externalBeatAt[slot] = this.engine.now
    if (clamp(strength, 0, 1) < 0.3) return
    this.climbFlap(sim, slot, b.x, b.y, (clamp(strength, 0, 1) - 1) * 8)
  }

  private updateFlaps(sim: SimState, dt: number): void {
    const now = this.engine.now
    for (const b of sim.birds) {
      const s = b.slot
      // l'animation signale ses battements : on ne les estime plus pour cet oiseau
      if (now - this.externalBeatAt[s]! < 1.5) continue
      if (b.stun > 0 || b.dive !== 'none') {
        this.flapPhase[s] = 0
        continue
      }
      const climb = clamp(b.vz / RULES.climbRate, 0, 1.5)
      if (climb < 0.25) {
        this.flapPhase[s] = 0.6 // prêt à battre dès la reprise de la montée
        continue
      }
      // 0,9 Hz en montée douce → 1,6 Hz en montée franche (comme l'animation procédurale)
      const hz = 0.9 + 0.7 * Math.min(1, climb)
      this.flapPhase[s]! += hz * dt
      if (this.flapPhase[s]! >= 1) {
        this.flapPhase[s]! -= 1
        this.climbFlap(sim, s, b.x, b.y, (Math.min(1, climb) - 1) * 6)
      }
    }
  }

  private updateDives(sim: SimState): void {
    for (const b of sim.birds) {
      const v = this.diveVoices.get(b.slot)
      const diving = b.dive === 'guided' || b.dive === 'committed'
      if (diving && !v) {
        const nv = this.player.play('dive_whoosh', { x: b.x, y: b.y, db: this.gameDb, fadeIn: 0.12 })
        if (nv) this.diveVoices.set(b.slot, nv)
        this.startWhistle(b.slot, b.x, b.y)
      } else if (v) {
        if (!diving || v.ended) {
          this.stopDive(b.slot)
          continue
        }
        const sp = this.engine.spatial(b.x, b.y)
        v.setPan(sp.pan)
        // le souffle s'aiguise quand la chute accélère
        v.setRate(1 + Math.min(0.25, b.diveTime * 0.2))
        const w = this.whistles.get(b.slot)
        if (w) {
          const now = this.engine.now
          const k = Math.min(1, b.diveTime / 0.9)
          glide(w.filter.frequency, 750 * Math.pow(2.3, k), now, 0.06)
          // bruit blanc en bande étroite (Q 16) ≈ −30 LUFS à gain 1 : sifflement de −32 à −22 LUFS
          glide(w.gain.gain, dbToGain(this.gameDb - 2 + 10 * k) * sp.gain, now, 0.06)
          glide(w.pan.pan, sp.pan, now, 0.06, 0.03)
        }
      }
    }
    for (const slot of [...this.diveVoices.keys()]) if (!sim.bySlot[slot]) this.stopDive(slot)
  }

  private stopDive(slot: number, fade = 0.12): void {
    const v = this.diveVoices.get(slot)
    if (v) v.stop(fade)
    this.diveVoices.delete(slot)
    const w = this.whistles.get(slot)
    if (w) {
      const now = this.engine.now
      w.gain.gain.cancelScheduledValues(now)
      w.gain.gain.setTargetAtTime(0, now, fade / 4)
      w.src.stop(now + fade + 0.05)
      this.whistles.delete(slot)
    }
  }

  private startWhistle(slot: number, x: number, y: number): void {
    if (this.whistles.has(slot)) return
    const e = this.engine
    const ctx = e.ctx
    const src = ctx.createBufferSource()
    src.buffer = whiteNoise(ctx)
    src.loop = true
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.value = 750
    filter.Q.value = 16
    const gain = ctx.createGain()
    const pan = ctx.createStereoPanner()
    pan.pan.value = e.spatial(x, y).pan
    gain.gain.setValueAtTime(0, e.now)
    gain.gain.linearRampToValueAtTime(dbToGain(this.gameDb - 2) * e.spatial(x, y).gain, e.now + 0.15)
    src.connect(filter).connect(gain).connect(pan).connect(e.buses.sfx)
    src.start(e.now, Math.random() * 0.9)
    src.onended = () => {
      src.disconnect()
      filter.disconnect()
      gain.disconnect()
      pan.disconnect()
    }
    this.whistles.set(slot, { src, filter, gain, pan })
  }

  private stopDiveVoices(): void {
    for (const slot of new Set([...this.diveVoices.keys(), ...this.whistles.keys()])) this.stopDive(slot)
  }

  private setProfile(mode: SimMode): void {
    const p: Profile = mode === 'round' ? 'round' : mode === 'lobby' ? 'lobby' : mode === 'demo' ? 'demo' : 'none'
    if (p === this.profile) return
    this.profile = p
    this.profileDb = PROFILE_DB[p]
    this.stopDiveVoices()
  }

  dispose(): void {
    if (this.nightGongTimer) clearTimeout(this.nightGongTimer)
    this.player.stopAll(undefined, 0.05)
  }
}
