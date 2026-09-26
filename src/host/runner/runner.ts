// Le runner : orchestre le jeu complet côté PC (écrans, simulation, entrées, réseau, directeurs,
// audio, persistance). Aucune logique de jeu ici (elle est dans src/sim) : le runner décide
// QUAND on joue, QUI pilote et QUOI montrer.
//
//   chargement → titre (démo de bots) → salon (lobby jouable) → cartes des règles (1re partie)
//   → manche (compte à rebours, soleil, nuit) → résultats de manche → … → podium → revanche / salon
//
// La boucle à pas fixe (RULES.tickHz) est appelée depuis un useFrame de priorité négative
// (RunnerFrame.tsx), avant la caméra, les oiseaux et les FX. Le temps de simulation est dosé
// (ralentis, pause, dernière seconde) : on ne change jamais le dt d'un tick.
//
// Documentation : docs/agent-notes/runner.md.
import { createBot, createLobbyDummy, createSubstituteBot, defaultBots, demoTeam, BOT_PERSONALITIES, type Bot, type BotLevel, type BotPersonality } from '../../bots/index.ts'
import {
  HintsDirector,
  NarratorDirector,
  createKeyValueHintMemory,
  hintDisplaySeconds,
  hintParams,
  hintText,
  type HintCue,
  type HintMemory,
  type NarratorClipIndex,
  type NarratorCue,
} from '../../director/index.ts'
import { InputRouter, LocalInput, localButtonLabels, loadKeyboardLayout, type InputSource, type LocalGroup } from '../../input/index.ts'
import { HostSession, type HostSessionStatus } from '../../net/hostSession.ts'
import { LobbyGoalTracker } from '../../net/lobbyGoals.ts'
import { PhoneHub, type PhoneInfo } from '../../net/phoneHub.ts'
import type { PhoneAction } from '../../shared/messages.ts'
import { getLang } from '../../shared/i18n.ts'
import { MAX_PLAYERS } from '../../shared/players.ts'
import {
  RULES,
  createMatch,
  createSimulation,
  finishRound,
  isMatchOver,
  matchPlayerSummaries,
  matchStandings,
  matchTitles,
  matchWinners,
  roundConfig,
  roundMultiplier,
  restoreMatch,
  restoreSimulation,
  type BirdState,
  type MatchState,
  type RoundResult,
  type SimEvent,
  type SimMode,
  type SimSnapshot,
  type Simulation,
  type TitleAward,
} from '../../sim/index.ts'
import { isAudioUnlocked, onAudioUnlock, playNarratorLine, playStinger, playUi, preloadNarrator, setAudioPaused, setAudioScreen, type AudioScreen } from '../audio/index.ts'
import { simEvents, subtitleEvents } from '../bus.ts'
import { cueCamera, cameraBeats, cameraCue, type CameraMode } from '../camera/cue.ts'
import { requestPlancheFlash } from '../render/npr/index.ts'
import { applyQualitySetting, hasQualityBench, qualityMonitor, startQualityBench, useRenderQuality } from '../render/quality.ts'
import { worldView } from '../render/worldView.ts'
import { getSettings, useSettings } from '../settings.ts'
import { setGamepadClaim, setNavSound } from '../ui/nav.ts'
import {
  DEFAULT_MATCH,
  connectHudEvents,
  hudFromSim,
  pushToast,
  resetHud,
  setScreenState,
  setUiActions,
  showBanner,
  showHint,
  showSubtitle,
  useHud,
  useLobby,
  useMatchResults,
  useRoster,
  useRoundResults,
  useRulesCards,
  useUi,
  type MatchSettingsVM,
  type ScreenId,
  type SlotVM,
} from '../ui/viewModel.ts'
import { gameView } from '../view.ts'
import { DEBUG, DEBUG_FAST, INTERLUDE_FACTOR, SIM_SPEED } from './debug.ts'
import { clearSnapshot, readSnapshot, writeSnapshot, type RunnerSnapshot } from './persist.ts'
import { Roster, displayName, titleDisplayValue, uiTitleId, visualOf, type Player } from './players.ts'
import { phoneView, type ViewContext } from './views.ts'
import { useStage } from './stageStore.ts'

export type RunnerPhase = ViewContext['phase']

const TICK = 1 / RULES.tickHz
const SLOTS = MAX_PLAYERS
/** Nombre de ticks au plus par frame (au-delà, on lâche du temps plutôt que de spiraler). */
const MAX_TICKS_PER_FRAME = 5
/** Salon : un téléphone hors ligne plus longtemps que ça quitte le salon (il pourra revenir). */
const LOBBY_DROP_OFFLINE_S = 60
/** Au-delà de ce silence, un téléphone connecté ne pilote plus (page suspendue). */
const PHONE_SILENT_S = 2.5
/** Délai maximal d'attente d'un temps fort de caméra (carte cadrée, podium installé). */
const BEAT_TIMEOUT_S = 7
/** Reprise après un rafraîchissement du PC en pleine manche : « 3, 2, 1 ». */
const RESUME_HOLD_S = 3
/** Dévoilement du vainqueur dans le panneau des résultats (RoundResults.tsx : REVEAL_MS). */
const RESULTS_REVEAL_S = 3.25
/** Réplique des résultats de manche : 1,5 s après le stinger du dévoilement, pas dessous (audio A1). */
const RESULTS_LINE_DELAY_S = 1.5
/** Réplique du champion au podium : 2,2 s après le stinger (gong, harpe, cri), pas dessous (audio A1). */
const PODIUM_LINE_DELAY_S = 2.2
/** Un téléphone parti moins longtemps que ça (page rechargée) ne déclenche pas de toast. */
const LEAVE_TOAST_DELAY_S = 1.5
/** Au plus un toast « a perdu la connexion » par téléphone toutes les … s (Wi-Fi instable). */
const LEAVE_TOAST_MIN_GAP_S = 20
/** Sauvegarde de session périodique (s réelles). */
const SAVE_EVERY_S = 2.5
/** Sous-titre du narrateur : filet au-delà de la durée conseillée si le 'hide' du lecteur ne vient pas. */
const SUBTITLE_SAFETY_S = 4
/** Salon avec des téléphones : fenêtre du second Échap qui ramène au titre (s réelles). */
const LOBBY_ESC_CONFIRM_S = 2

const now = (): number => performance.now()
const nowSec = (): number => performance.now() / 1000

/** Graine 32 bits (hors simulation : Math.random est permis ici). */
const freshSeed = (): number => (Math.random() * 0x7fffffff) | 0

function hashSeed(a: number, b: number): number {
  let h = (a ^ 0x9e3779b9) >>> 0
  h = Math.imul(h ^ (b + 0x7f4a7c15), 0x85ebca6b) >>> 0
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35) >>> 0
  return (h ^ (h >>> 16)) >>> 0
}

interface Pending {
  at: number
  fn: () => void
}

export class Runner {
  readonly session: HostSession
  readonly hub: PhoneHub
  readonly local = new LocalInput()
  readonly router: InputRouter
  readonly roster = new Roster()
  readonly goals = new LobbyGoalTracker()
  readonly narrator: NarratorDirector
  readonly hints: HintsDirector

  phase: RunnerPhase = 'boot'
  sim: Simulation | null = null
  simKind: SimMode | null = null
  private lastEvents: SimEvent[] = []
  private readonly simBots = new Map<number, Bot>()
  private readonly substitutes = new Map<number, Bot>()
  private dummy: { slot: number; colorIndex: number; bot: Bot } | null = null

  match: MatchState | null = null
  roundIndex = 0
  roundResult: RoundResult | null = null
  /** Les téléphones affichent l'entracte (résultats de manche à l'écran). */
  private interlude = false
  private titles: TitleAward[] | null = null
  private winners: number[] | null = null
  /** Échéance de l'écran courant (performance.now, ms). */
  private deadline: number | null = null
  private rulesShown = false
  private botsCustomized = false
  private matchSeed = 0

  paused = false
  pausedBy = -1
  /** Reprise après rafraîchissement : simulation figée jusqu'à cet instant (temps réel, s). */
  private holdUntil = 0
  private holdShown = -1
  /** Pas de remplaçant avant cet instant (temps réel) : retour du serveur, reprise. */
  private substituteGraceUntil = 0

  // Boucle
  private acc = 0
  private realTime = 0
  private readonly prevPool: BirdState[] = []
  /** Tableau prevBirds du runner (le podium de la mise en scène substitue le sien à gameView). */
  private readonly prevBirds: (BirdState | undefined)[] = new Array(12).fill(undefined)
  private slowmoAt = -1
  /** Ralenti en cours : échelle et durée tenue (touche : hitSlowmo*, esquive : dodgeSlowmo*). */
  private slowmoScale: number = RULES.hitSlowmoScale
  private slowmoHold: number = RULES.hitSlowmoSeconds
  private lastSlowmoSimTime = -Infinity
  /** Pause posée parce que l'onglet du PC est passé en arrière-plan (reprise automatique au retour). */
  private hiddenPause = false
  /** Page en train de se fermer ou de se recharger (beforeunload / pagehide reçus). */
  private unloading = false
  /** Dernier toast « a perdu la connexion » par téléphone (temps réel). */
  private readonly leaveToastAt = new Map<string, number>()
  /** Dernière touche de retour (Échap / Retour arrière) et son instant (temps réel). */
  private lastBackKey = ''
  private lastBackKeyAt = -Infinity
  /** Échap au salon avec des téléphones : second appui attendu jusqu'à cet instant (temps réel). */
  private escArmedUntil = -1
  /** Écran sauvegardé montré aux téléphones pendant le rechargement du PC (null sinon). */
  private bootView: {
    phase: ViewContext['phase']
    match: MatchState
    roundIndex: number
    interlude: boolean
    roundResult: RoundResult | null
    titles: TitleAward[] | null
    winners: number[] | null
  } | null = null
  /** Dernier flash « planche » (temps réel) : au plus un toutes les RULES.plancheFlashMinGap s. */
  private lastFlashAt = -Infinity
  /** Flashs de la simulation en cours, dont « mineurs » (humain impliqué, petit vol). */
  private roundFlashes = 0
  private minorFlashes = 0
  /** ?debug : journal des flashs et des ralentis (vérification de la hiérarchie des impacts). */
  readonly impactLog: { t: number; kind: 'flash' | 'slowmo' | 'dodgeSlowmo'; why: string }[] = []
  private framesRendered = 0
  private tickCount = 0
  private lastSave = 0
  private lastSubCheck = 0
  private lastViewsPush = 0
  private viewsDirty = false
  private rosterDirty = false
  private readonly timers: Pending[] = []
  private waitingBeat: { type: 'mapReady' | 'podiumReady'; token: number } | null = null
  private beatToken = 0

  // Réseau
  private everOnline = false
  private hostStatus: HostSessionStatus = 'idle'
  private clips: NarratorClipIndex | null = null
  private readonly hintMemory: HintMemory
  private qualityBenchDone = false
  private started = false
  private snapshot: RunnerSnapshot | null = null

  constructor() {
    this.session = new HostSession()
    this.hub = new PhoneHub(this.session)
    this.router = new InputRouter(this.local, this.hub)
    this.narrator = new NarratorDirector({
      durationOf: (lineId, colorIndex) => this.clips?.duration(getLang(), lineId, colorIndex),
    })
    this.hintMemory = this.createHintMemory()
    this.hints = new HintsDirector({ memory: this.hintMemory, mode: getSettings().hints })
    for (let s = 0; s < SLOTS; s++) this.prevPool.push(blankBird(s))
  }

  // ─── Démarrage ─────────────────────────────────────────────────────────

  /** Branche tout (réseau, entrées, UI, réglages). Idempotent. */
  start(): void {
    if (this.started) return
    this.started = true
    loadKeyboardLayout()
    this.local.keyboard.install()
    this.local.keyboard.onDivePress = g => this.onLocalDivePress(g)
    this.local.pads.onDivePress = g => this.onLocalDivePress(g)
    setGamepadClaim(index => this.padClaimed(index))
    // sons de l'interface : focus qui bouge, sélecteurs, curseurs (GDD : « bruitages pour l'interface »)
    setNavSound((name, value) => playUi(name, value === undefined ? undefined : { value }))
    connectHudEvents()
    this.bindHub()
    this.bindUi()
    this.bindSettings()
    // sous-titre du narrateur : affiché à 'show', retiré à la fin RÉELLE de la voix ('hide', demande audio A8)
    let shownSub = { bus: -1, vm: -1 }
    subtitleEvents.on(e => {
      if (e.type === 'hide') {
        if (e.id === shownSub.bus && useHud.getState().subtitle?.id === shownSub.vm) useHud.setState({ subtitle: null })
        return
      }
      const text = e.parts.map(p => (p.colorIndex !== undefined ? '{color}' : p.text)).join('')
      // le lecteur émet 'hide' à max(durée conseillée, fin réelle de la voix) : c'est lui qui retire le
      // sous-titre ; la durée locale n'est qu'un filet (voix en retard sur une machine chargée)
      showSubtitle({ text, colorIndex: e.colorIndex ?? null, seconds: e.durationMs / 1000 + SUBTITLE_SAFETY_S })
      shownSub = { bus: e.id, vm: useHud.getState().subtitle?.id ?? -1 }
    })
    cameraBeats.on(b => {
      // montée de nuit : le HUD s'efface, la carte se dessine seule jusqu'au panneau des résultats
      if (b.type === 'riseStart' && this.phase === 'round' && this.roundResult && !this.paused) setScreenState('cinematic')
      const w = this.waitingBeat
      if (w && b.type === w.type) {
        this.waitingBeat = null
        if (w.type === 'mapReady') this.showRoundResults()
        else this.showMatchPanel()
      }
    })
    const persistNow = () => {
      // la page se ferme ou se recharge : le passage en arrière-plan qui suit n'est pas une pause
      this.unloading = true
      this.hub.persistNow()
      this.save(true)
    }
    // Salon avec un joueur au clavier : les flèches pilotent son oiseau (le focus de l'UI est
    // figé), Entrée lance donc toujours la partie (GDD §12.2, docs/agent-notes/ui.md §4).
    window.addEventListener(
      'keydown',
      e => {
        if (!e.isTrusted || e.repeat || (e.code !== 'Enter' && e.code !== 'NumpadEnter')) return
        if (this.phase !== 'lobby' || useUi.getState().overlay || !this.roster.players.some(p => p.kind === 'keyboard')) return
        if (e.code === 'NumpadEnter' && this.roster.byGroup(2)) return // COUP D'AILE du joueur 2 au pavé
        e.preventDefault()
        e.stopImmediatePropagation()
        this.startMatch()
      },
      true,
    )
    window.addEventListener('pagehide', persistNow)
    // onglet du PC en arrière-plan : pause (les téléphones l'affichent), reprise en « 3, 2, 1 » au retour
    document.addEventListener('visibilitychange', () => this.onVisibilityChange())
    // page rendue par le cache de navigation (retour arrière du navigateur) : elle vit de nouveau
    window.addEventListener('pageshow', () => (this.unloading = false))
    // touche de retour utilisée (l'UI appelle uiActions.back() pour Échap comme pour Retour arrière)
    window.addEventListener(
      'keydown',
      e => {
        if (e.code !== 'Escape' && e.code !== 'Backspace') return
        this.lastBackKey = e.code
        this.lastBackKeyAt = this.realTime
      },
      true,
    )
    window.addEventListener('beforeunload', persistNow)
    // Rafraîchissement du PC : les joueurs d'abord (les téléphones se réannoncent dès que la
    // salle est reprise), la partie après le chargement.
    this.snapshot = readSnapshot()
    if (this.snapshot && !this.restoreEarly(this.snapshot)) this.snapshot = null
    this.session.start()
    // Scène vivante dès le chargement : la démo tourne derrière l'écran de chargement
    // (compilation des shaders, rendu de chauffe).
    this.startDemo()
    cueCamera('loading', { cut: true })
  }

  /** Index de voix du narrateur (chargement). */
  setNarratorClips(clips: NarratorClipIndex | null): void {
    this.clips = clips
  }

  /** Frames rendues depuis le démarrage (chauffe des shaders). */
  get renderedFrames(): number {
    return this.framesRendered
  }

  /** Fin du chargement : reprise d'une partie sauvegardée, sinon écran titre. */
  finishLoading(): void {
    const snap = this.snapshot
    this.snapshot = null
    this.bootView = null
    if (snap && this.restoreGame(snap)) {
      this.promptAudioUnlock()
      return
    }
    // un téléphone a déjà rejoint pendant le chargement : directement au salon
    if (this.roster.phones().length) this.enterLobby()
    else this.enterTitle()
  }

  /**
   * Après un rafraîchissement, le navigateur garde le son bloqué jusqu'au premier geste : invite
   * discrète (toast) tant que personne n'a touché le PC. Au titre, « appuie sur une touche » suffit.
   */
  private audioPrompted = false
  private promptAudioUnlock(): void {
    if (isAudioUnlocked() || this.audioPrompted) return
    this.audioPrompted = true
    const KEY = 'runner.audioUnlock'
    pushToast(KEY, { seconds: 45 })
    let off = (): void => undefined
    off = onAudioUnlock(() => {
      off()
      useHud.setState(s => ({ toasts: s.toasts.filter(t => t.key !== KEY) }))
    })
  }

  // ─── Boucle ────────────────────────────────────────────────────────────

  /** Une frame (appelée par RunnerFrame, useFrame de priorité négative). */
  frame(dtRaw: number): void {
    const dt = Math.min(Math.max(dtRaw, 0), 0.1)
    this.framesRendered++
    this.realTime += dt
    gameView.realTime = this.realTime
    gameView.colorblind = getSettings().colorblind
    this.local.pads.poll(now())
    this.runTimers()
    this.updateHold()
    const sim = this.sim
    if (sim) {
      // gameView est réécrit à chaque frame : <PodiumStage/> peut l'avoir substitué à la frame d'avant
      gameView.sim = sim.state
      gameView.prevBirds = this.prevBirds
      const scale = this.timeScale()
      gameView.timeScale = scale
      this.acc += dt * scale * SIM_SPEED
      let n = 0
      const max = MAX_TICKS_PER_FRAME * SIM_SPEED
      while (this.acc >= TICK && n < max) {
        this.copyPrev()
        this.tick()
        this.acc -= TICK
        n++
        if (this.sim !== sim) break // changement de simulation pendant le tick
      }
      if (n >= max) this.acc = Math.min(this.acc, TICK)
      gameView.alpha = Math.min(1, Math.max(0, this.acc / TICK))
    }
    if (this.phase === 'round' && this.realTime - this.lastSubCheck > 0.2) {
      this.lastSubCheck = this.realTime
      this.checkSubstitutes()
    }
    if (this.phase === 'lobby' && this.realTime - this.lastSubCheck > 1) {
      this.lastSubCheck = this.realTime
      this.dropStalePhones()
    }
    if (!this.paused) {
      const cue = this.narrator.poll(nowSec(), this.simKind === 'round' ? this.sim?.state : undefined)
      if (cue) this.playCue(cue)
    }
    this.flushOutputs()
    if (this.realTime - this.lastSave > SAVE_EVERY_S) {
      this.lastSave = this.realTime
      this.save(false)
    }
  }

  private timeScale(): number {
    if (this.paused || this.realTime < this.holdUntil) return 0
    if (this.phase === 'round' && useUi.getState().hostLink !== 'ok') return 0
    let s = 1
    if (this.slowmoAt >= 0) {
      const e = this.realTime - this.slowmoAt
      const hold = this.slowmoHold
      const ramp = RULES.hitSlowmoRampSeconds
      const k = this.slowmoScale
      if (e < hold) s = k
      else if (e < hold + ramp) s = k + ((1 - k) * (e - hold)) / ramp
      else this.slowmoAt = -1
    }
    const hint = this.sim?.state.timeScaleHint ?? 1
    return Math.min(s, hint)
  }

  /** État précédent des oiseaux (copie, sans allocation) pour l'interpolation du rendu. */
  private copyPrev(): void {
    const st = this.sim!.state
    const prev = this.prevBirds
    for (let s = 0; s < SLOTS; s++) {
      const b = st.bySlot[s]
      if (!b) {
        prev[s] = undefined
        continue
      }
      const dst = this.prevPool[s]!
      const shadow = dst.shadow
      Object.assign(dst, b)
      dst.shadow = shadow
      Object.assign(shadow, b.shadow)
      prev[s] = dst
    }
  }

  private tick(): void {
    const sim = this.sim!
    const st = sim.state
    const kind = this.simKind
    const inputs = this.router.collect(st, this.lastEvents)
    if (kind === 'lobby') {
      for (const p of this.roster.players) {
        if (p.kind === 'bot') continue
        const inp = inputs[p.slot]
        if (inp && this.goals.update(p.slot, inp, TICK)) this.onGoal(p)
      }
    }
    if (kind === 'round' && this.tickCount % RULES.tickHz === 0) {
      for (const p of this.roster.phones()) if (st.bySlot[p.slot] && p.phoneId) sim.setLatencyGrace(p.slot, this.substitutes.has(p.slot) ? 0 : this.hub.latencyGraceSeconds(p.phoneId))
    }
    this.tickCount++
    const events = sim.step(inputs)
    this.lastEvents = events
    gameView.sim = st
    for (const e of events) {
      this.onSimEvent(e)
      simEvents.emit(e)
      if (this.sim !== sim) return
    }
    if (kind === 'round' || kind === 'lobby') this.hub.updateFromSim(st, events, s => this.colorOf(s))
    if (kind === 'round') {
      const t = nowSec()
      if (!this.paused) {
        const cue = this.narrator.update(st, events, t, inputs)
        if (cue) this.playCue(cue)
        const hints = this.hints.update(st, events, inputs)
        if (hints.length) this.showHints(hints)
      }
      hudFromSim(st)
    }
  }

  private onSimEvent(e: SimEvent): void {
    const kind = this.simKind
    switch (e.type) {
      case 'diveHit':
        if (kind === 'round' || kind === 'lobby') this.maybeFlash(e)
        if (kind === 'round') this.maybeSlowmo(RULES.hitSlowmoScale, RULES.hitSlowmoSeconds, 'slowmo', `h${e.hunter}→t${e.target}`)
        if (kind === 'lobby') {
          const slot = this.goals.onSimEvent(e)
          if (slot !== null) {
            const p = this.roster.bySlot(slot)
            if (p) this.onGoal(p)
          }
        }
        break
      case 'diveMiss':
        // esquive d'un humain (ou par un humain) : court ralenti, le geste se voit
        if (kind === 'round' && e.dodged && (this.isHumanSlot(e.target) || this.isHumanSlot(e.hunter))) {
          this.maybeSlowmo(RULES.dodgeSlowmoScale, RULES.dodgeSlowmoSeconds, 'dodgeSlowmo', `h${e.hunter}→t${e.target}`)
        }
        break
      case 'night':
        if (kind === 'round') this.onNight()
        break
      case 'over':
        if (kind === 'round') this.onOver()
        break
      case 'territoryReset':
        if (kind === 'demo') this.onDemoLoop()
        break
      default:
        break
    }
  }

  private maybeSlowmo(scale: number, hold: number, kind: 'slowmo' | 'dodgeSlowmo', why: string): void {
    const st = this.sim!.state
    if (st.sun.t > st.sun.T - RULES.noSlowmoLastSeconds) return
    if (st.time - this.lastSlowmoSimTime < RULES.hitSlowmoMinGap) return
    this.lastSlowmoSimTime = st.time
    this.slowmoAt = this.realTime
    this.slowmoScale = scale
    this.slowmoHold = hold
    if (DEBUG) this.impactLog.push({ t: st.sun.t, kind, why })
  }

  /** Un oiseau piloté par un joueur (téléphone, clavier, manette), remplaçant compris. */
  private isHumanSlot(slot: number): boolean {
    const p = this.roster.bySlot(slot)
    return !!p && p.kind !== 'bot'
  }

  /**
   * Flash « planche » (bible §6.8), réservé aux touches qui comptent (polish G4) : couronne,
   * humain impliqué, ou vol d'au moins RULES.plancheFlashMinStealFrac de l'arène ; au plus un
   * toutes les RULES.plancheFlashMinGap s et RULES.plancheFlashMaxPerRound par manche. Les petites
   * touches d'un humain (hors couronne, vol < 1 %) : au plus RULES.plancheFlashMinorMaxPerRound
   * par manche, espacées de RULES.plancheFlashMinorGap s. Réglage « Réduire les flashs » respecté.
   */
  private maybeFlash(e: Extract<SimEvent, { type: 'diveHit' }>): void {
    if (getSettings().reduceFlashes || !this.sim) return
    if (this.realTime - this.lastFlashAt < RULES.plancheFlashMinGap || this.roundFlashes >= RULES.plancheFlashMaxPerRound) return
    const frac = e.stolenCells / Math.max(1, this.sim.state.grid.arenaCells)
    const human = this.isHumanSlot(e.hunter) || this.isHumanSlot(e.target)
    const major = e.crown || frac >= RULES.plancheFlashMinStealFrac
    if (!major && !human) return
    if (!major) {
      // petite touche d'un humain : elle compte pour lui, mais un joueur très actif ne doit pas
      // blanchir l'écran toutes les 6 s (réservé aux moments forts)
      if (this.minorFlashes >= RULES.plancheFlashMinorMaxPerRound || this.realTime - this.lastFlashAt < RULES.plancheFlashMinorGap) return
      this.minorFlashes++
    }
    this.roundFlashes++
    this.lastFlashAt = this.realTime
    requestPlancheFlash()
    if (DEBUG) this.impactLog.push({ t: this.sim.state.sun.t, kind: 'flash', why: `${e.crown ? 'couronne ' : ''}${human ? 'humain ' : ''}vol ${(frac * 100).toFixed(2)} % (h${e.hunter}→t${e.target})` })
  }

  // ─── Minuteries (temps réel) ───────────────────────────────────────────

  private later(seconds: number, fn: () => void): void {
    this.timers.push({ at: this.realTime + seconds, fn })
  }

  private runTimers(): void {
    if (!this.timers.length) return
    const due = this.timers.filter(t => t.at <= this.realTime)
    if (!due.length) return
    for (let i = this.timers.length - 1; i >= 0; i--) if (this.timers[i]!.at <= this.realTime) this.timers.splice(i, 1)
    for (const t of due) t.fn()
    if (this.deadline !== null && now() >= this.deadline) this.onDeadline()
  }

  private clearTimers(): void {
    this.timers.length = 0
    this.waitingBeat = null
  }

  /** Échéance de l'écran courant (performance.now). Vérifiée à chaque frame. */
  private setDeadline(seconds: number | null): void {
    this.deadline = seconds === null ? null : now() + seconds * 1000 * INTERLUDE_FACTOR
    if (this.deadline !== null) this.later(seconds! * INTERLUDE_FACTOR + 0.05, () => this.checkDeadline())
  }

  private checkDeadline(): void {
    if (this.deadline !== null && now() >= this.deadline - 30) this.onDeadline()
  }

  private onDeadline(): void {
    this.deadline = null
    switch (this.phase) {
      case 'rules':
        this.finishRules()
        break
      case 'roundResults':
        this.continueResults()
        break
      case 'matchResults': {
        const votes = this.roster.phones().filter(p => p.vote === 'rematch').length
        if (votes > 0) this.rematch()
        else {
          useMatchResults.setState(s => ({ rematch: { ...s.rematch, deadline: null } }))
          this.markViews()
        }
        break
      }
      default:
        break
    }
  }

  // ─── Simulations ───────────────────────────────────────────────────────

  private setSim(sim: Simulation, kind: SimMode): void {
    this.sim = sim
    this.simKind = kind
    this.lastEvents = []
    this.acc = 0
    this.slowmoAt = -1
    this.lastSlowmoSimTime = -Infinity
    this.minorFlashes = 0
    this.roundFlashes = 0
    gameView.sim = sim.state
    gameView.alpha = 0
    gameView.timeScale = 1
    for (let s = 0; s < SLOTS; s++) this.prevBirds[s] = undefined
    gameView.prevBirds = this.prevBirds
    this.simBots.clear()
    this.substitutes.clear()
    this.router.reset()
  }

  /** Écran titre : une vraie manche de bots au coucher accéléré, qui boucle (GDD §15.1). */
  private startDemo(): void {
    const seed = freshSeed()
    const team = demoTeam(6, seed)
    const maps = ['parasols', 'aiguilles', 'geantes', 'cadran'] as const
    this.demoMap = (this.demoMap + 1) % maps.length
    const sim = createSimulation({
      mode: 'demo',
      seed,
      mapId: maps[this.demoMap]!,
      birds: team.map((_, i) => ({ slot: i, assist: false })),
      sunSeconds: RULES.titleDemoSunSeconds,
      countdown: false,
    })
    this.setSim(sim, 'demo')
    gameView.players = []
    team.forEach((spec, i) => {
      const bot = createBot({ slot: i, personality: spec.personality, level: spec.level, seed: hashSeed(seed, i) })
      this.simBots.set(i, bot)
      this.router.set(i, { kind: 'bot', bot })
      gameView.players[i] = { slot: i, colorIndex: i, name: '', kind: 'bot', assist: false }
    })
  }
  private demoMap = -1
  private demoLoops = 0

  /** Chaque boucle de la démo : une autre carte (coupe de caméra). */
  private onDemoLoop(): void {
    this.demoLoops++
    if (this.phase === 'title' || this.phase === 'credits' || this.phase === 'boot') this.later(0, () => this.simKind === 'demo' && this.startDemo())
  }

  /** Salon : désert jouable, un oiseau par joueur + le mannequin (GDD §15.2). */
  private startLobbySim(): void {
    const seed = freshSeed()
    const players = this.roster.players
    this.dummy = null
    const birds = players.map(p => ({ slot: p.slot, assist: p.assist }))
    const dummySlot = this.dummySlot()
    if (dummySlot >= 0) birds.push({ slot: dummySlot, assist: false })
    const sim = createSimulation({ mode: 'lobby', seed, mapId: 'lobby', birds, sunSeconds: RULES.roundSunSeconds, countdown: false })
    this.setSim(sim, 'lobby')
    for (const p of players) this.attachPlayer(p)
    if (dummySlot >= 0) this.attachDummy(dummySlot)
    this.refreshVisuals()
  }

  /** Slot du mannequin : le plus haut slot libre ; aucun si le salon est plein. */
  private dummySlot(): number {
    for (let s = SLOTS - 1; s >= 0; s--) if (!this.roster.bySlot(s)) return s
    return -1
  }

  private attachDummy(slot: number): void {
    const bot = createLobbyDummy(slot)
    this.dummy = { slot, colorIndex: this.roster.lastFreeColor(), bot }
    this.router.set(slot, { kind: 'bot', bot })
  }

  /** Le mannequin cède sa place (salon plein) ou change de couleur (couleur prise). */
  private refreshDummy(): void {
    const sim = this.sim
    if (this.simKind !== 'lobby' || !sim) return
    const want = this.dummySlot()
    const d = this.dummy
    if (d && (want < 0 || this.roster.bySlot(d.slot))) {
      if (!this.roster.bySlot(d.slot)) {
        sim.removeBird(d.slot)
        this.router.set(d.slot, { kind: 'none' })
      }
      this.dummy = null
    }
    if (!this.dummy && want >= 0) {
      sim.addBird({ slot: want, assist: false })
      this.router.resetSlot(want)
      this.attachDummy(want)
    } else if (this.dummy && this.roster.colorTaken(this.dummy.colorIndex)) {
      this.dummy.colorIndex = this.roster.lastFreeColor()
    }
    this.refreshVisuals()
  }

  /** Source d'entrée et bot d'un joueur dans la simulation courante. */
  private attachPlayer(p: Player): void {
    const sim = this.sim
    if (!sim || !sim.state.bySlot[p.slot]) return
    this.router.set(p.slot, this.sourceFor(p))
    sim.setAssist(p.slot, p.assist)
  }

  private sourceFor(p: Player): InputSource {
    switch (p.kind) {
      case 'bot': {
        let bot = this.simBots.get(p.slot)
        if (!bot || bot.personality !== p.bot!.personality || bot.level !== effectiveLevel(p.bot!.personality, p.bot!.level)) {
          bot = createBot({ slot: p.slot, personality: p.bot!.personality, level: p.bot!.level, seed: hashSeed(this.sim?.state.config.seed ?? 1, p.slot) })
          this.simBots.set(p.slot, bot)
        }
        return { kind: 'bot', bot }
      }
      case 'keyboard':
        return { kind: 'local', group: p.group ?? 1 }
      case 'phone': {
        const sub = this.substitutes.get(p.slot)
        if (sub) return { kind: 'bot', bot: sub }
        return p.phoneId ? { kind: 'phone', phoneId: p.phoneId } : { kind: 'none' }
      }
    }
  }

  /** Ajoute l'oiseau d'un joueur à la simulation du salon (ou de l'écran courant si possible). */
  private addPlayerToSim(p: Player): void {
    const sim = this.sim
    if (!sim || this.simKind !== 'lobby') return
    if (this.dummy && this.dummy.slot === p.slot) {
      sim.removeBird(this.dummy.slot)
      this.router.set(this.dummy.slot, { kind: 'none' })
      this.dummy = null
    }
    if (!sim.state.bySlot[p.slot]) {
      sim.addBird({ slot: p.slot, assist: p.assist })
      this.router.resetSlot(p.slot)
    }
    this.simBots.delete(p.slot)
    this.attachPlayer(p)
    this.refreshDummy()
  }

  private removePlayerFromSim(slot: number): void {
    const sim = this.sim
    if (!sim || this.simKind !== 'lobby') return
    if (sim.state.bySlot[slot]) sim.removeBird(slot)
    this.router.set(slot, { kind: 'none' })
    this.simBots.delete(slot)
    this.goals.reset(slot)
    this.refreshDummy()
  }

  /** gameView.players : joueurs du roster (+ mannequin au salon). */
  private refreshVisuals(): void {
    if (this.simKind === 'demo') return
    const lang = getLang()
    const players: typeof gameView.players = []
    for (const p of this.roster.players) players[p.slot] = visualOf(p, lang)
    if (this.dummy) players[this.dummy.slot] = { slot: this.dummy.slot, colorIndex: this.dummy.colorIndex, name: '', kind: 'bot', assist: false }
    gameView.players = players
  }

  private colorOf(slot: number): number {
    return gameView.players[slot]?.colorIndex ?? slot
  }

  // ─── Écrans ────────────────────────────────────────────────────────────

  private setPhase(phase: RunnerPhase, screen: ScreenId, camera: CameraMode, audio: AudioScreen): void {
    this.phase = phase
    setScreenState(screen)
    if (cameraCue.mode !== camera) cueCamera(camera)
    setAudioScreen(audio)
    this.syncCapture()
    this.markRoster()
    this.markViews()
    if (phase !== 'matchResults') useStage.setState({ glorySlot: -1 })
  }

  enterTitle(): void {
    const fromBoot = this.phase === 'boot'
    this.clearTimers()
    this.leaveMatch()
    if (this.simKind !== 'demo') this.startDemo()
    this.setPhase('title', 'title', 'title', 'title')
    // fin du chargement : coupe franche (sinon la caméra glissait 2 s depuis le plan fixe du
    // chargement, parfois dans le fût d'une tour : un mur brun en guise de première image)
    if (fromBoot) cueCamera('title', { cut: true })
    this.maybeQualityBench()
    this.save(true)
  }

  enterCredits(): void {
    if (this.simKind !== 'demo') this.startDemo()
    this.setPhase('credits', 'credits', 'credits', 'credits')
  }

  enterLobby(): void {
    this.clearTimers()
    this.leaveMatch()
    this.phase = 'lobby'
    for (const p of this.roster.players) {
      p.ready = false
      p.vote = null
      p.pending = false
    }
    this.autoCompose()
    this.startLobbySim()
    this.setPhase('lobby', 'lobby', 'lobby', 'lobby')
    this.promptAudioUnlock()
    this.save(true)
  }

  /** Quitte la partie en cours (pause, directeurs, résultats). */
  private leaveMatch(): void {
    if (this.paused) this.setPaused(false, -1)
    this.holdUntil = 0
    this.narrator.clear()
    this.hints.clear()
    this.match = null
    this.roundResult = null
    this.interlude = false
    this.titles = null
    this.winners = null
    this.deadline = null
    useStage.setState({ glorySlot: -1 })
  }

  private maybeQualityBench(): void {
    if (this.qualityBenchDone || hasQualityBench() || getSettings().quality !== 'auto') return
    this.qualityBenchDone = true
    // après quelques secondes de titre : shaders compilés, scène stable
    this.later(2.5, () => {
      if (this.phase === 'title') startQualityBench()
      else this.qualityBenchDone = false
    })
  }

  // ─── Partie ────────────────────────────────────────────────────────────

  /** Salon → partie (cartes des règles à la première partie de la session, puis manche 1). */
  startMatch(): void {
    if (this.phase !== 'lobby') return
    if (this.roster.humans().length === 0) {
      playUi('error')
      return
    }
    this.autoCompose()
    playUi('launch')
    this.newMatch()
    if (!this.rulesShown) this.enterRules()
    else this.startRound(0)
  }

  private newMatch(): void {
    const settings = useLobby.getState().match
    this.matchSeed = freshSeed()
    for (const p of this.roster.players) {
      p.pending = false
      p.ready = false
      p.vote = null
    }
    this.match = createMatch({
      seed: this.matchSeed,
      rounds: settings.rounds,
      length: DEBUG_FAST ? 'short' : settings.length,
      lastDouble: settings.lastRoundDouble,
      birds: this.roster.players.map(p => ({ slot: p.slot, assist: p.assist })),
    })
    this.titles = null
    this.winners = null
    this.narrator.startMatch({ rounds: this.match.config.rounds, lastRoundDouble: this.match.config.lastDouble !== false, seed: this.matchSeed })
    this.hints.startMatch()
    void preloadNarrator(
      getLang(),
      this.roster.players.map(p => p.colorIndex),
    )
  }

  private enterRules(): void {
    this.rulesShown = true
    for (const p of this.roster.players) p.ready = false
    this.setDeadline(RULES.rulesCardsSeconds)
    this.syncRulesCards()
    this.setPhase('rules', 'rules', 'rules', 'intro')
    this.save(true)
  }

  private syncRulesCards(): void {
    const phones = this.activePhones()
    useRulesCards.setState({ deadline: this.deadline, okCount: phones.filter(p => p.ready).length, humanCount: phones.length })
  }

  private finishRules(): void {
    if (this.phase !== 'rules') return
    this.startRound(0)
  }

  private startRound(index: number): void {
    const match = this.match
    if (!match) return
    this.clearTimers()
    this.deadline = null
    // les arrivés en cours de partie entrent en piste
    for (const p of this.roster.players) {
      if (p.pending) p.pending = false
      p.ready = false
    }
    const birds = this.roster.players.map(p => ({ slot: p.slot, assist: p.assist }))
    match.config.birds = birds.map(b => ({ ...b }))
    this.roundIndex = index
    this.roundResult = null
    this.interlude = false
    const sim = createSimulation(roundConfig(match, index, birds))
    this.setSim(sim, 'round')
    this.dummy = null
    for (const p of this.roster.players) {
      if (p.kind === 'phone' && this.awaySeconds(p) >= RULES.playerDropToBotSeconds) this.substitutes.set(p.slot, createSubstituteBot(p.slot, hashSeed(this.matchSeed, 100 + p.slot)))
      this.attachPlayer(p)
    }
    this.refreshVisuals()
    this.syncDirectors()
    this.hints.startRound()
    this.hub.resetRound()
    const rounds = match.config.rounds
    const double = roundMultiplier(match, index) > 1
    resetHud(index + 1, rounds, double)
    hudFromSim(sim.state, true)
    this.setPhase('round', 'game', 'round', 'round')
    cueCamera('round', { cut: true })
    if (double) {
      showBanner('host.banner.lastRound', { subKey: 'host.banner.lastRoundSub', tone: 'alert', seconds: RULES.countdownSeconds + 0.5 })
      playStinger('lastRound')
    } else showBanner('host.banner.round', { params: { n: index + 1 }, seconds: RULES.countdownSeconds - 0.5 })
    const cue = this.narrator.startRound(index + 1, nowSec())
    if (cue) this.playCue(cue)
    this.save(true)
  }

  /**
   * Nuit (t = T) : la manche est jouée, on compte (finishRound). La caméra marque la pause de
   * nuit puis monte à la verticale ; le panneau des résultats attend la carte cadrée (mapReady).
   */
  private onNight(): void {
    const match = this.match
    const sim = this.sim
    if (!match || !sim) return
    const done = match.results.find(r => r.index === this.roundIndex)
    const r = done ?? finishRound(match, sim.state)
    this.roundResult = r
    this.hints.clear()
    const winner = r.winners.length === 1 ? r.winners[0]! : -1
    cueCamera('roundResults', { winnerSlot: winner, coWinners: r.winners.length > 1 ? r.winners : [] })
    this.waitBeat('mapReady')
    this.save(true)
  }

  private onOver(): void {
    // rien : les résultats attendent le beat « mapReady » de la caméra (ou son délai de secours)
  }

  private waitBeat(type: 'mapReady' | 'podiumReady'): void {
    const token = ++this.beatToken
    this.waitingBeat = { type, token }
    this.later(BEAT_TIMEOUT_S, () => {
      if (this.waitingBeat?.token !== token) return
      this.waitingBeat = null
      if (type === 'mapReady') this.showRoundResults()
      else this.showMatchPanel()
    })
  }

  /** Résultats de manche (GDD §11.3) : panneau, soleils, fait marquant, téléphones en entracte. */
  private showRoundResults(): void {
    const match = this.match
    const r = this.roundResult
    if (!match || !r || this.phase !== 'round') return
    this.interlude = true
    for (const p of this.roster.players) p.ready = false
    const standings = matchStandings(match)
    const total = new Map(standings.map(s => [s.slot, s.suns]))
    const rows = r.slots
      .map(slot => ({ slot, share: r.shares[slot] ?? 0, cells: r.cells[slot] ?? 0, rank: r.ranks[slot] ?? 0, suns: r.suns[slot] ?? 0, totalSuns: total.get(slot) ?? 0 }))
      .sort((a, b) => a.rank - b.rank || b.cells - a.cells || a.slot - b.slot)
    const next = r.index + 1 < match.config.rounds ? match.maps[r.index + 1]!.mapId : null
    this.setDeadline(RULES.interludeMaxSeconds)
    useRoundResults.setState({
      round: r.index + 1,
      rounds: match.config.rounds,
      double: r.multiplier > 1,
      mapId: r.mapId,
      nextMapId: next,
      rows,
      tie: r.tie,
      fact: r.highlight ? { kind: r.highlight.kind, slot: r.highlight.slot, value: r.highlight.value } : null,
      deadline: this.deadline,
      readyCount: 0,
      humanCount: this.activePhones().length,
    })
    this.setPhase('roundResults', 'roundResults', 'roundResults', 'roundResults')
    const sim = this.sim
    this.later(RESULTS_REVEAL_S, () => {
      if (this.phase !== 'roundResults' || !sim) return
      const w = r.winners.length === 1 ? r.winners[0]! : -1
      playStinger('roundWin', w >= 0 ? { colorIndex: this.colorOf(w) } : undefined)
      this.later(RESULTS_LINE_DELAY_S, () => {
        if (this.phase !== 'roundResults') return
        const cue = this.narrator.roundResults(sim.state, nowSec())
        if (cue) this.playCue(cue)
      })
    })
    // bascule de qualité automatique : seulement entre deux manches
    if (getSettings().quality === 'auto') {
      const down = qualityMonitor.shouldDowngrade(useRenderQuality.getState().level)
      if (down) useRenderQuality.getState().setLevel(down)
    }
    this.save(true)
  }

  /** Manche suivante déjà programmée (annonce de la dernière manche en cours), en temps réel. */
  private nextRoundAt = 0

  /** Suite des résultats ; `byPlayer` : demandée par un joueur (le clic de confirmation ne sonne qu'alors). */
  continueResults(byPlayer = false): void {
    if (this.phase !== 'roundResults' || !this.match || this.realTime < this.nextRoundAt) return
    if (byPlayer) playUi('confirm')
    if (isMatchOver(this.match)) {
      this.showMatchResults()
      return
    }
    const next = this.roundIndex + 1
    // dernière manche comptée double : « le dernier soleil… » est dit ici, puis la manche démarre ;
    // son compte à rebours reste silencieux (GDD §16.3) et le riser culmine sur « Envol » (audio A3)
    const cue = this.narrator.announceLastRound(next + 1, nowSec())
    if (!cue) {
      this.startRound(next)
      return
    }
    this.playCue(cue)
    this.deadline = null
    this.nextRoundAt = this.realTime + cue.duration + 0.3
    this.later(cue.duration + 0.3, () => {
      if (this.phase === 'roundResults') this.startRound(next)
    })
  }

  /** Fin de partie : podium (contrat caméra), titres, votes. */
  private showMatchResults(): void {
    const match = this.match
    if (!match) return
    this.clearTimers()
    this.deadline = null
    const standings = matchStandings(match)
    const winners = matchWinners(match)
    const titles = matchTitles(match)
    const summaries = new Map(matchPlayerSummaries(match).map(s => [s.slot, s]))
    this.titles = titles
    this.winners = winners
    for (const p of this.roster.players) p.vote = null
    useMatchResults.setState({
      rows: standings.map(s => {
        const sum = summaries.get(s.slot)
        const award = titles.find(a => a.slot === s.slot)
        return {
          slot: s.slot,
          rank: s.rank,
          suns: s.suns,
          totalShare: s.cumulativeShare,
          title: award ? { id: uiTitleId(award), value: titleDisplayValue(award, match) } : null,
          stats: {
            hits: sum?.hits ?? 0,
            gotHit: sum?.gotHit ?? 0,
            dodges: sum?.dodges ?? 0,
            misses: sum?.misses ?? 0,
            // moyenne par manche : le cumul brut (repeint compris) dépasse 100 % et se lit mal
            stolenFrac: (sum?.stolenFrac ?? 0) / Math.max(1, match.results.filter(r => r.slots.includes(s.slot)).length),
            lowFrac: sum?.lowFrac ?? 0,
            hiddenSeconds: sum?.hiddenSeconds ?? 0,
            roundsWon: sum?.roundsWon ?? 0,
          },
          votedRematch: false,
        }
      }),
      coWinners: winners.length > 1,
      rematch: { votes: 0, humans: this.activePhones().length, deadline: null },
    })
    this.phase = 'matchResults'
    // arrivée du podium sans panneau (plan de mise en scène), le panneau au beat podiumReady
    setScreenState('cinematic')
    const winner = winners.length === 1 ? winners[0]! : -1
    useStage.setState({ glorySlot: winner })
    cueCamera('podium', { winnerSlot: winner, podium: standings.slice(0, 3).map(s => s.slot), coWinners: winners.length > 1 ? winners : [] })
    setAudioScreen('gameResults')
    this.markViews()
    this.waitBeat('podiumReady')
    this.save(true)
  }

  private showMatchPanel(): void {
    if (this.phase !== 'matchResults') return
    setScreenState('matchResults')
    this.syncCapture()
    const winners = this.winners ?? []
    playStinger('gameWin', winners.length === 1 ? { colorIndex: this.colorOf(winners[0]!) } : undefined)
    this.later(PODIUM_LINE_DELAY_S, () => {
      if (this.phase !== 'matchResults') return
      const cue = this.narrator.matchResults(winners, nowSec())
      if (cue) this.playCue(cue)
    })
  }

  rematch(): void {
    if (this.phase !== 'matchResults') return
    const cue = this.narrator.rematch(nowSec())
    if (cue) this.playCue(cue)
    playStinger('rematch')
    this.newMatch()
    this.startRound(0)
  }

  quitToLobby(): void {
    if (this.phase === 'lobby') return
    playUi('back')
    this.enterLobby()
  }

  // ─── Pause ─────────────────────────────────────────────────────────────

  private setPaused(paused: boolean, by: number): void {
    if (paused === this.paused) return
    this.paused = paused
    this.pausedBy = paused ? by : -1
    useUi.setState(paused ? { paused: true, pausedBy: by } : { paused: false, overlay: null })
    setAudioPaused(paused)
    playStinger(paused ? 'pause' : 'resume')
    if (paused) {
      this.narrator.clear()
      this.hints.clear()
    }
    this.syncCapture()
    this.markViews()
  }

  pause(by = -1): void {
    // pas de pause une fois la nuit tombée (la manche est jouée : on va aux résultats)
    if (this.phase !== 'round' || this.paused || this.roundResult) return
    this.setPaused(true, by)
    if (by >= 0) {
      const p = this.roster.bySlot(by)
      if (p) pushToast('host.toast.paused', { params: { name: displayName(p, getLang()) }, slot: by })
    }
    this.save(true)
  }

  resume(): void {
    if (!this.paused) return
    // PC en arrière-plan : on ne reprend pas une manche que personne ne voit
    if (this.hiddenPause && document.hidden) return
    this.hiddenPause = false
    this.setPaused(false, -1)
    this.save(true)
  }

  /**
   * Onglet du PC masqué pendant une manche non terminée (polish G11) : le navigateur ralentit
   * l'animation à ~1 image/s, la simulation se figeait sans pause visible. Pause « depuis l'écran »
   * (sans « Reprendre » sur les téléphones) ; au retour, reprise avec le compte « 3, 2, 1 ».
   */
  private onVisibilityChange(): void {
    if (document.hidden) {
      if (this.unloading || this.phase !== 'round' || this.paused || this.roundResult) return
      this.pause(-1)
      this.hiddenPause = this.paused
      this.markViews()
      return
    }
    if (!this.hiddenPause) return
    this.hiddenPause = false
    if (!this.paused || this.phase !== 'round') return
    this.setPaused(false, -1)
    const st = this.sim?.state
    if (st && st.sun.phase !== 'countdown') {
      this.holdUntil = this.realTime + RESUME_HOLD_S
      this.holdShown = -1
      this.substituteGraceUntil = Math.max(this.substituteGraceUntil, this.holdUntil + 2)
    }
    this.save(true)
  }

  // ─── Joueurs ───────────────────────────────────────────────────────────

  private inMatch(): boolean {
    return this.phase === 'rules' || this.phase === 'round' || this.phase === 'roundResults' || this.phase === 'matchResults'
  }

  /** Téléphones qui jouent (hors spectateurs), en ligne ou non. */
  private activePhones(): Player[] {
    return this.roster.phones().filter(p => !p.pending)
  }

  /** Libère une place pour un humain : retire le dernier bot (hors partie). */
  private makeRoom(): number {
    let slot = this.roster.freeSlot()
    if (slot >= 0) return slot
    if (this.inMatch()) return -1
    const bots = this.roster.bots()
    const last = bots[bots.length - 1]
    if (!last) return -1
    this.roster.remove(last.slot)
    this.removePlayerFromSim(last.slot)
    slot = this.roster.freeSlot()
    return slot
  }

  private addPhonePlayer(phone: PhoneInfo): Player | null {
    const slot = this.makeRoom()
    if (slot < 0) {
      pushToast('host.toast.full', { tone: 'alert' })
      this.hub.kick(phone.id)
      return null
    }
    const hello = phone.hello
    const p = this.roster.add({
      slot,
      colorIndex: this.roster.pickColor(null),
      name: hello?.name ?? '',
      kind: 'phone',
      phoneId: phone.id,
      group: null,
      bot: null,
      assist: phone.assist,
      profileSet: false,
      ready: false,
      vote: null,
      pending: this.inMatch(),
      auto: false,
    })
    this.hub.bindSlot(phone.id, slot)
    if (hello?.color === null || hello?.color === undefined || !this.roster.claimColor(p, hello.color)) this.roster.claimColor(p, this.roster.humanColor(p))
    this.afterRosterChange()
    this.addPlayerToSim(p)
    playUi('join', { colorIndex: p.colorIndex })
    // le toast « X rejoint le désert » attend la validation du profil (nom et couleur définitifs)
    // un téléphone qui arrive sur l'écran titre ouvre le salon
    if (this.phase === 'title' || this.phase === 'credits') this.enterLobby()
    return p
  }

  /**
   * Échap au salon (polish G7) : retire d'abord le dernier joueur au clavier (il peut quitter
   * seul) ; s'il reste des téléphones, un second Échap dans les 2 s ramène au titre (les
   * téléphones passent en attente de l'écran). Retour arrière ne quitte jamais le salon.
   */
  private lobbyBack(): void {
    if (this.lastBackKey === 'Backspace' && this.realTime - this.lastBackKeyAt < 0.5) return
    const kb = this.roster.byGroup(2) ?? this.roster.byGroup(1)
    if (kb) {
      this.escArmedUntil = -1
      this.leaveLocal(kb)
      return
    }
    if (this.roster.phones().length > 0 && this.realTime > this.escArmedUntil) {
      this.escArmedUntil = this.realTime + LOBBY_ESC_CONFIRM_S
      playUi('back')
      pushToast('runner.toast.escAgain', { seconds: LOBBY_ESC_CONFIRM_S })
      return
    }
    this.escArmedUntil = -1
    playUi('back')
    this.enterTitle()
    useUi.setState({ titleMenuOpen: true })
    this.markViews()
  }

  /** Un joueur au clavier (ou à la manette de son groupe) quitte le salon. */
  private leaveLocal(p: Player): void {
    if (this.phase !== 'lobby' || p.kind !== 'keyboard') return
    const group = p.group ?? 1
    const colorIndex = p.colorIndex
    this.roster.remove(p.slot)
    this.removePlayerFromSim(p.slot)
    useLobby.setState({ keyboardJoined: this.roster.players.some(x => x.kind === 'keyboard') })
    this.local.keyboard.setShared(!!this.roster.byGroup(2))
    this.syncCapture()
    this.afterRosterChange()
    playUi('back', { colorIndex })
    pushToast('runner.toast.keyboardLeft', { params: { n: group } })
  }

  /** Premier appui de PLONGER d'un groupe local : rejoindre le salon (GDD §12.2). */
  private onLocalDivePress(group: LocalGroup): void {
    if (this.phase !== 'lobby' || this.roster.byGroup(group)) return
    if (useUi.getState().overlay) return
    this.joinLocal(group)
  }

  joinLocal(group: LocalGroup): void {
    if (this.phase !== 'lobby' || this.roster.byGroup(group)) return
    const slot = this.makeRoom()
    if (slot < 0) {
      pushToast('host.toast.full', { tone: 'alert' })
      return
    }
    const p = this.roster.add({
      slot,
      colorIndex: this.roster.pickColor(null),
      name: '',
      kind: 'keyboard',
      phoneId: null,
      group,
      bot: null,
      assist: false,
      profileSet: true,
      ready: false,
      vote: null,
      pending: false,
      auto: false,
    })
    this.roster.claimColor(p, this.roster.humanColor(p))
    const colorIndex = p.colorIndex
    this.afterRosterChange()
    this.addPlayerToSim(p)
    useLobby.setState({ keyboardJoined: true })
    this.local.keyboard.setShared(!!this.roster.byGroup(2))
    this.syncCapture()
    playUi('join', { colorIndex })
    pushToast('host.toast.keyboard', { params: { n: group }, slot })
  }

  /** Salon : ajoute un bot choisi par l'utilisateur (personality null = première absente). */
  addBot(personality: BotPersonality | null, level: BotLevel): Player | null {
    if (this.phase !== 'lobby') return null
    const p = this.insertBot(personality, level, false)
    if (!p) return null
    this.botsCustomized = true
    playUi('botAdd', { colorIndex: p.colorIndex })
    this.afterRosterChange()
    return p
  }

  /** Ajoute un bot au roster et à la simulation du salon, sans recomposer. */
  private insertBot(personality: BotPersonality | null, level: BotLevel, auto: boolean): Player | null {
    const slot = this.roster.freeSlot()
    if (slot < 0) return null
    const present = new Set(this.roster.bots().map(b => b.bot!.personality))
    const pool = BOT_PERSONALITIES.filter(p => p !== 'watchmaker' || level > 0)
    const pers = personality ?? pool.find(p => !present.has(p)) ?? pool[this.roster.bots().length % pool.length]!
    const p = this.roster.add({
      slot,
      colorIndex: this.roster.pickColor(null),
      name: '',
      kind: 'bot',
      phoneId: null,
      group: null,
      bot: { personality: pers, level: effectiveLevel(pers, level) },
      assist: false,
      profileSet: true,
      ready: true,
      vote: null,
      pending: false,
      auto,
    })
    this.addPlayerToSim(p)
    return p
  }

  removeBot(slot: number): void {
    if (this.phase !== 'lobby') return
    const p = this.roster.bySlot(slot)
    if (!p || p.kind !== 'bot') return
    this.botsCustomized = true
    this.roster.remove(slot)
    this.removePlayerFromSim(slot)
    playUi('botRemove')
    this.afterRosterChange()
  }

  setBotLevel(slot: number, level: BotLevel): void {
    const p = this.roster.bySlot(slot)
    if (!p?.bot || this.phase !== 'lobby') return
    const lv = p.bot.personality === 'watchmaker' && level === 0 ? 1 : level
    if (lv === p.bot.level) return
    p.bot = { ...p.bot, level: lv }
    this.botsCustomized = true
    playUi('toggle', { value: lv / 2 })
    this.attachPlayer(p)
    this.afterRosterChange()
  }

  setBotPersonality(slot: number, personality: BotPersonality): void {
    const p = this.roster.bySlot(slot)
    if (!p?.bot || this.phase !== 'lobby') return
    p.bot = { personality, level: personality === 'watchmaker' && p.bot.level === 0 ? 1 : p.bot.level }
    this.botsCustomized = true
    playUi('click')
    this.attachPlayer(p)
    this.afterRosterChange()
  }

  setMatchSetting<K extends keyof MatchSettingsVM>(key: K, value: MatchSettingsVM[K]): void {
    useLobby.setState(s => ({ match: { ...s.match, [key]: value } }))
    if (key === 'botLevel') {
      for (const p of this.roster.bots()) {
        p.bot = { ...p.bot!, level: p.bot!.personality === 'watchmaker' && value === 0 ? 1 : (value as BotLevel) }
        this.attachPlayer(p)
      }
    }
    this.afterRosterChange()
  }

  /**
   * Composition par défaut (GDD §14.3) tant que l'utilisateur n'a pas composé lui-même :
   * suit le nombre d'humains au salon (1 → Faucon, Laboureur, Nomade ; 2 → Pie, Guetteur…).
   */
  private autoCompose(): void {
    if (this.botsCustomized || this.phase === 'rules' || this.phase === 'round' || this.phase === 'roundResults' || this.phase === 'matchResults') return
    const humans = this.roster.humans().length
    const level = useLobby.getState().match.botLevel
    const want = humans > 0 ? defaultBots(humans, level) : []
    const have = this.roster.bots().filter(p => p.auto)
    const same = have.length === want.length && have.every((p, i) => p.bot!.personality === want[i]!.personality && p.bot!.level === effectiveLevel(want[i]!.personality, want[i]!.level))
    if (same) return
    for (const p of have) {
      this.roster.remove(p.slot)
      this.removePlayerFromSim(p.slot)
    }
    for (const spec of want) if (this.roster.size < SLOTS) this.insertBot(spec.personality, spec.level, true)
  }

  /** Après tout changement du roster : composition, visuels, directeurs, UI, téléphones. */
  private afterRosterChange(): void {
    if (this.phase === 'lobby' || this.phase === 'title' || this.phase === 'credits') this.autoCompose()
    this.refreshVisuals()
    this.refreshDummy()
    this.syncDirectors()
    this.markRoster()
    this.markViews()
  }

  private syncDirectors(): void {
    const players = this.roster.players.filter(p => !p.pending)
    this.narrator.setPlayers(players.map(p => ({ slot: p.slot, colorIndex: p.colorIndex, human: p.kind !== 'bot' && !this.substitutes.has(p.slot) })))
    this.hints.setPlayers(
      players.map(p => ({
        slot: p.slot,
        key: p.phoneId ?? `kb${p.group ?? 1}`,
        human: p.kind !== 'bot' && !this.substitutes.has(p.slot),
        colorIndex: p.colorIndex,
      })),
    )
  }

  private onGoal(p: Player): void {
    const g = this.goals.goals(p.slot)
    playUi('ready', { colorIndex: p.colorIndex })
    if (g.fly && g.dive && g.strike) playUi('confirm')
    this.markRoster()
    this.markViews()
  }

  // ─── Téléphones ────────────────────────────────────────────────────────

  private bindHub(): void {
    const hub = this.hub
    hub.on('session', r => {
      useLobby.setState({ roomCode: r.room, joinUrl: r.joinUrl, connection: 'online' })
      this.markViews()
    })
    hub.on('status', s => this.onHostStatus(s))
    hub.on('join', ({ phone, known }) => this.onPhoneJoin(phone, known))
    hub.on('leave', ({ phone }) => this.onPhoneLeave(phone))
    hub.on('profile', ({ phone, name, color }) => this.onPhoneProfile(phone, name, color))
    hub.on('ready', ({ phone, ready }) => this.onPhoneReady(phone, ready))
    hub.on('action', ({ phone, action }) => this.onPhoneAction(phone, action))
    hub.on('assist', ({ phone, on }) => {
      const p = this.roster.byPhone(phone.id)
      if (!p) return
      p.assist = on
      if (this.sim?.state.bySlot[p.slot] && this.simKind !== 'demo') this.sim.setAssist(p.slot, on)
      this.refreshVisuals()
      this.markRoster()
      this.markViews()
    })
    hub.on('scheme', () => this.markViews())
    hub.on('hello', ({ phone }) => {
      // préférences arrivées après l'annonce : nom proposé si le profil n'est pas encore fait
      const p = this.roster.byPhone(phone.id)
      if (p && !p.profileSet && !p.name && phone.hello?.name) {
        p.name = phone.hello.name
        this.afterRosterChange()
      }
    })
  }

  private onHostStatus(s: HostSessionStatus): void {
    if (s === 'online' && this.hostStatus !== 'online') this.substituteGraceUntil = this.realTime + RULES.playerDropToBotSeconds + 3
    this.hostStatus = s
    if (s === 'online') this.everOnline = true
    useLobby.setState({ connection: s === 'online' ? 'online' : s === 'connecting' || s === 'idle' ? 'connecting' : 'offline' })
    this.syncHostLink()
  }

  /** Surcouche « reconnexion » : seulement si des téléphones jouent (le clavier n'a pas besoin du serveur). */
  private syncHostLink(): void {
    const s = this.hostStatus
    const phones = this.roster.phones().length > 0
    const link = s === 'replaced' ? 'lost' : s !== 'online' && this.everOnline && phones && this.phase !== 'boot' ? 'reconnecting' : 'ok'
    if (useUi.getState().hostLink !== link) useUi.setState({ hostLink: link })
  }

  private onPhoneJoin(phone: PhoneInfo, known: boolean): void {
    let p = this.roster.byPhone(phone.id)
    if (!p) {
      p = this.addPhonePlayer(phone) ?? undefined
      if (!p) return
    } else {
      this.hub.bindSlot(phone.id, p.slot)
      if (known && this.inMatch()) {
        // le remplaçant rend la main (checkSubstitutes) dès que les entrées reviennent
        this.checkSubstitutes()
      }
    }
    this.syncHostLink()
    this.markRoster()
    this.markViews()
  }

  private onPhoneLeave(phone: PhoneInfo): void {
    const p = this.roster.byPhone(phone.id)
    if (!p) return
    // toast seulement si le téléphone ne revient pas tout de suite (page rechargée, micro-coupure :
    // « X a perdu la connexion » s'affichait pour une absence d'une demi-seconde)
    this.later(LEAVE_TOAST_DELAY_S, () => {
      const q = this.roster.byPhone(phone.id)
      if (!q || this.hub.phone(phone.id)?.online) return
      if (this.hostStatus === 'online' && (this.inMatch() || this.phase === 'lobby')) {
        // Wi-Fi qui clignote : un seul toast (et un seul son) par téléphone toutes les 20 s
        const last = this.leaveToastAt.get(phone.id) ?? -Infinity
        if (this.realTime - last < LEAVE_TOAST_MIN_GAP_S) return
        this.leaveToastAt.set(phone.id, this.realTime)
        pushToast('host.toast.left', { params: { name: displayName(q, getLang()) }, slot: q.slot, tone: 'alert' })
        playUi('leave', { colorIndex: q.colorIndex })
      }
    })
    this.markRoster()
    this.markViews()
  }

  private onPhoneProfile(phone: PhoneInfo, name: string, color: number | null): void {
    const p = this.roster.byPhone(phone.id)
    if (!p) return
    if (name) p.name = name
    if (color !== null) this.roster.claimColor(p, color)
    const first = !p.profileSet
    p.profileSet = true
    playUi('ready', { colorIndex: p.colorIndex })
    // première validation du profil : la TV annonce le joueur sous son nom et sa couleur définitifs
    if (first) pushToast('host.toast.joined', { params: { name: displayName(p, getLang()) }, slot: p.slot })
    this.afterRosterChange()
  }

  private onPhoneReady(phone: PhoneInfo, ready: boolean): void {
    const p = this.roster.byPhone(phone.id)
    if (!p) return
    p.ready = ready
    if (ready) playUi('ready', { colorIndex: p.colorIndex })
    else playUi('unready')
    const phones = this.activePhones()
    const allReady = phones.length > 0 && phones.filter(x => this.hub.phone(x.phoneId!)?.online).every(x => x.ready)
    if (this.phase === 'rules') {
      this.syncRulesCards()
      if (allReady) this.finishRules()
    } else if (this.phase === 'roundResults') {
      useRoundResults.setState({ readyCount: phones.filter(x => x.ready).length })
      if (allReady) this.continueResults(true)
    }
    this.markRoster()
    this.markViews()
  }

  private onPhoneAction(phone: PhoneInfo, action: PhoneAction): void {
    const p = this.roster.byPhone(phone.id)
    if (!p) return
    switch (action) {
      case 'start':
        if (this.phase === 'lobby' && this.roster.leader() === p) this.startMatch()
        break
      case 'pause':
        if (this.phase === 'round') this.pause(p.slot)
        break
      case 'resume':
        this.resume()
        break
      case 'rematch':
      case 'toLobby':
        if (this.phase === 'matchResults') this.vote(p, action)
        break
    }
  }

  private vote(p: Player, v: 'rematch' | 'toLobby'): void {
    p.vote = v
    playUi(v === 'rematch' ? 'ready' : 'toggle', { colorIndex: p.colorIndex })
    const voters = this.activePhones()
    const rematch = voters.filter(x => x.vote === 'rematch').length
    const lobby = voters.filter(x => x.vote === 'toLobby').length
    if (v === 'rematch' && this.deadline === null) this.setDeadline(RULES.rematchVoteSeconds)
    useMatchResults.setState(s => ({
      rows: s.rows.map(r => ({ ...r, votedRematch: this.roster.bySlot(r.slot)?.vote === 'rematch' })),
      rematch: { votes: rematch, humans: voters.length, deadline: this.deadline },
    }))
    this.markViews()
    if (rematch > voters.length / 2) this.rematch()
    else if (lobby > voters.length / 2) this.quitToLobby()
  }

  /** Secondes depuis que le téléphone ne pilote plus (0 s'il pilote). */
  private awaySeconds(p: Player): number {
    if (!p.phoneId) return 0
    const info = this.hub.phone(p.phoneId)
    if (!info) return Infinity
    if (!info.online) return this.hub.offlineSeconds(p.phoneId)
    // muet (battement 1 Hz manqué) : absent depuis son dernier message, pas depuis le constat
    // (GDD §14.3 : remplacé au bout de 3 s ; on comptait 2,5 + 3 = 5,5 s)
    const age = this.hub.inputAgeSeconds(p.phoneId)
    return age > PHONE_SILENT_S ? age : 0
  }

  /** Remplaçant après RULES.playerDropToBotSeconds ; il rend la main au retour du téléphone (GDD §14.3). */
  private checkSubstitutes(): void {
    const sim = this.sim
    if (!sim || this.simKind !== 'round' || this.phase !== 'round') return
    // pas de remplaçant pendant une pause, une reprise, ou juste après le retour du serveur
    // (les téléphones se reconnectent) : ils ne sont pas partis, c'est le PC qui l'était
    if (this.paused || this.realTime < this.holdUntil || this.realTime < this.substituteGraceUntil) return
    if (this.hostStatus !== 'online') return
    let changed = false
    for (const p of this.roster.phones()) {
      if (p.pending || !sim.state.bySlot[p.slot]) continue
      const away = this.awaySeconds(p)
      const sub = this.substitutes.get(p.slot)
      if (!sub && away >= RULES.playerDropToBotSeconds) {
        const bot = createSubstituteBot(p.slot, hashSeed(this.matchSeed, 100 + p.slot + this.tickCount))
        this.substitutes.set(p.slot, bot)
        this.router.set(p.slot, { kind: 'bot', bot })
        sim.setLatencyGrace(p.slot, 0)
        pushToast('host.toast.substitute', { params: { name: displayName(p, getLang()) }, slot: p.slot })
        changed = true
      } else if (sub && away === 0 && this.hub.inputAgeSeconds(p.phoneId!) < 1.5) {
        this.substitutes.delete(p.slot)
        this.router.set(p.slot, { kind: 'phone', phoneId: p.phoneId! })
        pushToast('host.toast.back', { params: { name: displayName(p, getLang()) }, slot: p.slot })
        playUi('join', { colorIndex: p.colorIndex })
        changed = true
      }
    }
    if (changed) {
      this.syncDirectors()
      this.markRoster()
      this.markViews()
    }
  }

  /** Salon : un téléphone parti depuis longtemps libère sa place. */
  private dropStalePhones(): void {
    for (const p of this.roster.phones()) {
      if (!p.phoneId) continue
      const info = this.hub.phone(p.phoneId)
      if (info && !info.online && this.hub.offlineSeconds(p.phoneId) > LOBBY_DROP_OFFLINE_S) {
        this.hub.forget(p.phoneId)
        this.roster.remove(p.slot)
        this.removePlayerFromSim(p.slot)
        this.afterRosterChange()
        this.syncHostLink()
      }
    }
  }

  // ─── Directeurs ────────────────────────────────────────────────────────

  private playCue(cue: NarratorCue): void {
    playNarratorLine({ lineId: cue.lineId, colorIndex: cue.colorIndex, lang: getLang() })
  }

  private showHints(cues: readonly HintCue[]): void {
    const lang = getLang()
    const shown = new Set<string>()
    for (const cue of cues) {
      const p = this.roster.bySlot(cue.slot)
      const labels = p?.kind === 'keyboard' && p.group ? localButtonLabels(p.group) : {}
      // TV : bulle près de l'oiseau (les bandeaux « à tous » sont déjà dans les bannières de phase)
      if (cue.display === 'bubble' && cue.anchorSlot >= 0) {
        const key = cue.broadcast ? cue.hintId : `${cue.hintId}:${cue.slot}`
        if (!shown.has(key)) {
          shown.add(key)
          const text = hintText(cue, lang, labels)
          showHint(cue.anchorSlot, cue.key, hintParams(cue, lang, labels), hintDisplaySeconds(text))
        }
      }
      // téléphone du destinataire
      if (p?.kind === 'phone') this.hub.toastSlot(cue.slot, cue.key, cue.colorIndex !== undefined ? { color: cue.colorIndex } : undefined, 'hint')
    }
  }

  /** Mémoire des indications : localStorage du PC + indications déjà vues sur le téléphone. */
  private createHintMemory(): HintMemory {
    let store: HintMemory
    try {
      store = createKeyValueHintMemory(localStorage)
    } catch {
      const seen = new Set<string>()
      store = { has: (k, id) => seen.has(`${k}/${id}`), add: (k, id) => void seen.add(`${k}/${id}`) }
    }
    return {
      has: (key, id) => store.has(key, id) || !!this.hub?.phone(key)?.hello?.seenHints?.includes(`hints.${id}`),
      add: (key, id) => store.add(key, id),
    }
  }

  // ─── Sorties (UI, téléphones) ──────────────────────────────────────────

  markRoster(): void {
    this.rosterDirty = true
  }

  markViews(): void {
    this.viewsDirty = true
  }

  private flushOutputs(): void {
    if (this.rosterDirty) {
      this.rosterDirty = false
      this.syncRoster()
    }
    if (this.viewsDirty && this.realTime - this.lastViewsPush > 0.05) {
      this.viewsDirty = false
      this.lastViewsPush = this.realTime
      this.pushViews()
    }
  }

  private syncRoster(): void {
    const leader = this.roster.leader()
    const slots: SlotVM[] = this.roster.players.map(p => {
      const online = p.kind === 'phone' ? (this.hub.phone(p.phoneId!)?.online ?? false) : true
      return {
        slot: p.slot,
        colorIndex: p.colorIndex,
        name: p.name,
        kind: p.kind,
        bot: p.bot ? { personality: p.bot.personality, level: p.bot.level } : undefined,
        connected: online,
        ready: p.ready,
        goals: p.kind === 'bot' ? { fly: false, dive: false, strike: false } : this.goals.goals(p.slot),
        assist: p.assist,
        substitute: this.substitutes.has(p.slot),
        keyboardGroup: p.kind === 'keyboard' ? (p.group ?? 1) : undefined,
        host: p === leader,
      }
    })
    useRoster.setState({ slots })
    this.syncHostLink()
  }

  private viewContext(): ViewContext {
    const settings = useLobby.getState().match
    const match = this.match
    // PC en train de se recharger : les téléphones gardent l'écran sauvegardé (manche, résultats,
    // podium), en pause « depuis l'écran », au lieu de repasser par le salon (polish G5)
    const b = this.phase === 'boot' ? this.bootView : null
    if (b) {
      return {
        phase: b.phase,
        lang: getLang(),
        colorblind: getSettings().colorblind,
        roster: this.roster,
        match: b.match,
        roundIndex: b.roundIndex,
        rounds: b.match.config.rounds,
        lastDouble: b.match.config.lastDouble !== false,
        roundResult: b.roundResult,
        interlude: b.interlude,
        deadline: null,
        paused: true,
        pausedBy: -1,
        resuming: true,
        goals: slot => this.goals.goals(slot),
        titles: b.titles,
        winners: b.winners,
      }
    }
    return {
      phase: this.phase,
      lang: getLang(),
      colorblind: getSettings().colorblind,
      roster: this.roster,
      match,
      roundIndex: this.roundIndex,
      rounds: match?.config.rounds ?? settings.rounds,
      lastDouble: match ? match.config.lastDouble !== false : settings.lastRoundDouble,
      roundResult: this.roundResult,
      interlude: this.interlude,
      deadline: this.deadline,
      paused: this.paused,
      pausedBy: this.pausedBy,
      resuming: this.paused && this.hiddenPause,
      goals: slot => this.goals.goals(slot),
      titles: this.titles,
      winners: this.winners,
    }
  }

  pushViews(): void {
    const ctx = this.viewContext()
    this.hub.setViews(phone => phoneView(ctx, phone))
  }

  // ─── Capture du clavier / des manettes ─────────────────────────────────

  private syncCapture(): void {
    const kb = this.local.keyboard
    const playing = this.phase === 'lobby' || (this.phase === 'round' && !this.paused)
    kb.capture = playing
    kb.swallowNumpadEnter = playing && !!this.roster.byGroup(2)
  }

  /**
   * Manettes 1 et 2 réservées au jeu : au salon (A = PLONGER = rejoindre, jamais « Entrée »), et
   * en manche pour celles qui pilotent un oiseau. Start reste à l'UI (lancer, pause).
   */
  private padClaimed(index: number): boolean {
    const group = (index + 1) as LocalGroup
    if (group !== 1 && group !== 2) return false
    if (useUi.getState().overlay) return false
    if (this.phase === 'lobby') return true
    return this.phase === 'round' && !this.paused && !!this.roster.byGroup(group)
  }

  // ─── UI ────────────────────────────────────────────────────────────────

  private bindUi(): void {
    setUiActions({
      play: () => {
        playUi('confirm')
        this.enterLobby()
      },
      openCredits: () => {
        playUi('open')
        this.enterCredits()
      },
      back: () => {
        const ui = useUi.getState()
        if (ui.overlay) {
          useUi.setState({ overlay: null })
          playUi('close')
          return
        }
        if (this.phase === 'lobby') {
          this.lobbyBack()
          return
        }
        if (this.phase === 'credits') {
          playUi('back')
          this.enterTitle()
          useUi.setState({ titleMenuOpen: true })
        }
      },
      openSettings: () => {
        playUi('open')
        useUi.setState({ overlay: 'settings' })
      },
      closeSettings: () => {
        playUi('close')
        useUi.setState({ overlay: null })
      },
      startMatch: () => this.startMatch(),
      addBot: (p, l) => void this.addBot(p, l),
      removeBot: s => this.removeBot(s),
      setBotLevel: (s, l) => this.setBotLevel(s, l),
      setBotPersonality: (s, p) => this.setBotPersonality(s, p),
      setMatchSetting: (k, v) => this.setMatchSetting(k, v),
      joinKeyboard: () => this.joinLocal(this.roster.byGroup(1) ? 2 : 1),
      skipRules: () => {
        if (this.phase === 'rules') playUi('confirm')
        this.finishRules()
      },
      pause: () => this.pause(-1),
      resume: () => this.resume(),
      quitToLobby: () => this.quitToLobby(),
      continueResults: () => this.continueResults(true),
      rematch: () => this.rematch(),
    })
  }

  private bindSettings(): void {
    let prev = getSettings()
    applyQualitySetting(prev.quality)
    document.documentElement.lang = prev.lang
    useSettings.subscribe(s => {
      if (s.quality !== prev.quality) applyQualitySetting(s.quality)
      if (s.hints !== prev.hints) this.hints.setMode(s.hints)
      if (s.lang !== prev.lang) {
        document.documentElement.lang = s.lang
        this.refreshVisuals()
        this.markRoster()
        this.markViews()
      }
      if (s.colorblind !== prev.colorblind) {
        gameView.colorblind = s.colorblind
        this.markViews()
      }
      // « Réduire les flashs » vaut aussi pour les téléphones (lu par phoneView, demande phone P4)
      if (s.reduceFlashes !== prev.reduceFlashes) this.markViews()
      prev = s
    })
  }

  // ─── Reprise après rafraîchissement ────────────────────────────────────

  private updateHold(): void {
    if (this.holdUntil <= 0) return
    const left = this.holdUntil - this.realTime
    if (left <= 0) {
      this.holdUntil = 0
      this.holdShown = -1
      if (this.phase === 'round' && !this.sim?.state.over) {
        useHud.setState({ countdown: 0 })
        this.later(0.9, () => useHud.getState().countdown === 0 && useHud.setState({ countdown: null }))
      }
      return
    }
    const n = Math.ceil(left)
    if (n !== this.holdShown && this.phase === 'round') {
      this.holdShown = n
      useHud.setState({ countdown: n })
      playUi('count', { value: 1 - n / RESUME_HOLD_S })
    }
  }

  save(force: boolean): void {
    if (this.phase === 'boot') return
    if (!force && (this.phase === 'title' || this.phase === 'credits')) return
    const snap: RunnerSnapshot = {
      v: 1,
      savedAt: Date.now(),
      phase: this.phase,
      roster: this.roster.toJSON(),
      matchSettings: { ...useLobby.getState().match },
      botsCustomized: this.botsCustomized,
      rulesShown: this.rulesShown,
      matchSeed: this.matchSeed,
      match: this.match,
      roundIndex: this.roundIndex,
      sim: this.simKind === 'round' && this.sim ? this.sim.snapshot() : null,
      roundResult: this.roundResult ? { index: this.roundResult.index } : null,
      interlude: this.interlude,
      deadlineLeft: this.deadline !== null ? Math.max(0, this.deadline - now()) : null,
      paused: this.paused,
      pausedBy: this.pausedBy,
      narrator: this.narrator.exportMemory(),
      goals: this.roster.players.filter(p => p.kind !== 'bot').map(p => ({ slot: p.slot, ...this.goals.goals(p.slot) })),
      roundResultsVM: this.phase === 'roundResults' ? { ...useRoundResults.getState() } : null,
      matchResultsVM: this.phase === 'matchResults' ? { ...useMatchResults.getState() } : null,
      titles: this.titles,
      winners: this.winners,
    }
    writeSnapshot(snap)
  }

  /** Reprise, 1er temps (au démarrage) : joueurs, réglages de partie, objectifs du salon. */
  private restoreEarly(s: RunnerSnapshot): boolean {
    try {
      this.roster.load(s.roster)
      // écran sauvegardé, montré aux téléphones pendant le chargement (voir viewContext)
      this.bootView = null
      if (s.match && (s.phase === 'rules' || s.phase === 'round' || s.phase === 'roundResults' || s.phase === 'matchResults')) {
        const match = restoreMatch(s.match)
        const ri = s.roundResult?.index
        this.bootView = {
          phase: s.phase,
          match,
          roundIndex: s.roundIndex,
          interlude: s.interlude,
          roundResult: ri !== undefined ? (match.results.find(r => r.index === ri) ?? null) : null,
          titles: s.titles,
          winners: s.winners,
        }
      }
      useLobby.setState({ match: { ...DEFAULT_MATCH, ...s.matchSettings }, keyboardJoined: this.roster.players.some(p => p.kind === 'keyboard') })
      this.local.keyboard.setShared(!!this.roster.byGroup(2))
      this.botsCustomized = s.botsCustomized
      this.rulesShown = s.rulesShown
      this.matchSeed = s.matchSeed
      for (const g of s.goals) {
        // le suivi des objectifs est pur : on rejoue ce qui était coché
        if (g.fly) this.goals.update(g.slot, { dirX: 1, dirY: 0, dive: false, divePresses: 0, flapPresses: 0 }, RULES.lobbyGoalFlySeconds + 0.01)
        if (g.dive) this.goals.update(g.slot, { dirX: 0, dirY: 0, dive: true, divePresses: 0, flapPresses: 0 }, RULES.lobbyGoalDiveHoldSeconds + 0.01)
        if (g.strike) this.goals.onSimEvent({ type: 'diveHit', hunter: g.slot, target: -1, x: 0, y: 0, z: 0, stolenCells: 0, crown: false })
      }
      for (const p of this.roster.phones()) if (p.phoneId) this.hub.bindSlot(p.phoneId, p.slot)
      this.markRoster()
      return true
    } catch (err) {
      console.warn('[runner] reprise impossible', err)
      this.roster.load({ players: [], nextOrder: 1 })
      clearSnapshot()
      return false
    }
  }

  /** Reprise, 2e temps (après le chargement) : l'écran en cours, la partie, la simulation. */
  private restoreGame(s: RunnerSnapshot): boolean {
    try {
      if (s.phase === 'title' || s.phase === 'credits' || s.phase === 'boot') {
        this.enterTitle()
        return true
      }
      // cartes des règles : même partie, cartes relancées (avant : retour au salon, partie perdue)
      if (s.phase === 'rules' && s.match) {
        this.enterLobby()
        this.match = restoreMatch(s.match)
        this.matchSeed = s.matchSeed
        this.narrator.importMemory(s.narrator)
        this.hints.startMatch()
        this.enterRules()
        return true
      }
      if (s.phase === 'lobby' || s.phase === 'rules' || !s.match) {
        this.enterLobby()
        return true
      }
      this.match = restoreMatch(s.match)
      // mémoire importée : pas de narrator.startMatch, qui l'effacerait
      this.narrator.importMemory(s.narrator)
      this.hints.startMatch()
      this.roundIndex = s.roundIndex
      this.titles = s.titles
      this.winners = s.winners
      void preloadNarrator(
        getLang(),
        this.roster.players.map(p => p.colorIndex),
      )
      if (s.phase === 'round' && s.sim) {
        this.restoreRound(s.sim, s.paused, s.pausedBy)
        return true
      }
      const last = this.match.results[this.match.results.length - 1]
      if (!last) {
        this.enterLobby()
        return true
      }
      this.roundResult = last
      this.roundIndex = last.index
      this.setSim(s.sim ? restoreSimulation(s.sim) : createSimulation(roundConfig(this.match, last.index)), 'round')
      for (const p of this.roster.players) this.attachPlayer(p)
      this.refreshVisuals()
      this.syncDirectors()
      if (s.phase === 'roundResults') {
        this.interlude = true
        this.phase = 'roundResults'
        if (s.roundResultsVM) useRoundResults.setState(s.roundResultsVM)
        this.setDeadline((s.deadlineLeft ?? RULES.interludeMaxSeconds * 1000 * INTERLUDE_FACTOR) / 1000 / INTERLUDE_FACTOR)
        useRoundResults.setState({ deadline: this.deadline, readyCount: 0 })
        const winner = last.winners.length === 1 ? last.winners[0]! : -1
        cueCamera('roundResults', { winnerSlot: winner, cut: true })
        this.setPhase('roundResults', 'roundResults', 'roundResults', 'roundResults')
        return true
      }
      this.showMatchResults()
      if (s.matchResultsVM) useMatchResults.setState(s.matchResultsVM)
      return true
    } catch (err) {
      console.warn('[runner] reprise impossible', err)
      clearSnapshot()
      this.match = null
      this.enterLobby()
      return true
    }
  }

  private restoreRound(snap: SimSnapshot, paused: boolean, pausedBy: number): void {
    const match = this.match!
    const sim = restoreSimulation(snap)
    this.setSim(sim, 'round')
    this.interlude = false
    const done = match.results.find(r => r.index === this.roundIndex)
    this.roundResult = done ?? (sim.state.over || sim.state.sun.phase === 'night' ? finishRound(match, sim.state) : null)
    for (const p of this.roster.players) {
      if (!sim.state.bySlot[p.slot]) p.pending = true
      this.attachPlayer(p)
    }
    this.refreshVisuals()
    this.syncDirectors()
    this.hints.startRound()
    this.hub.resetRound()
    const double = roundMultiplier(match, this.roundIndex) > 1
    resetHud(this.roundIndex + 1, match.config.rounds, double)
    hudFromSim(sim.state, true)
    this.setPhase('round', 'game', 'round', 'round')
    cueCamera('round', { cut: true })
    if (sim.state.over || sim.state.sun.phase === 'night') {
      this.onNight()
    } else if (paused) {
      this.setPaused(true, pausedBy)
    } else if (sim.state.sun.phase !== 'countdown') {
      this.holdUntil = this.realTime + RESUME_HOLD_S
      this.holdShown = -1
      this.substituteGraceUntil = Math.max(this.substituteGraceUntil, this.holdUntil + 2)
    }
  }
}

function effectiveLevel(p: BotPersonality, level: BotLevel): BotLevel {
  return p === 'watchmaker' && level === 0 ? 1 : level
}

function blankBird(slot: number): BirdState {
  return {
    slot,
    x: 0,
    y: 0,
    z: 0,
    vx: 0,
    vy: 0,
    vz: 0,
    heading: 0,
    turnRate: 0,
    speed: 0,
    targetLow: false,
    strong: false,
    shadow: { cx: 0, cy: 0, r: 0, rAlong: 0, strong: false, paints: false },
    dive: 'none',
    diveTarget: -1,
    diveTime: 0,
    lockTarget: -1,
    lockedBy: -1,
    stun: 0,
    stunKind: 'none',
    immune: 0,
    flap: 0,
    flapCooldown: 0,
    diveCooldown: 0,
    hidden: false,
    inNight: false,
    inStorm: false,
    crown: false,
    assist: false,
    towerSlide: 0,
  }
}

/** Le runner du jeu (un seul par page). */
export const runner = new Runner()

if (DEBUG && typeof window !== 'undefined') {
  ;(window as unknown as { __ombres?: unknown }).__ombres = { runner, gameView, cameraCue, worldView, useUi, useLobby, useRoster, useHud, useRoundResults, useMatchResults, simEvents, useSettings, useRenderQuality }
}
