// Presets de qualité graphique (ART_BIBLE §7.4) + choix automatique + bascule à chaud.
//
// - `QUALITY_PRESETS` : les réglages de chaque niveau (lus par le pipeline et le monde).
// - `useRenderQuality` (zustand) : niveau courant, hors React via getRenderQuality().
//   `setLevel()` change le preset à chaud (le pipeline se reconfigure sans rechargement).
// - `applyQualitySetting(setting)` : traduit le réglage utilisateur ('auto' | niveau).
// - `QualityBench` : banc court (≈ 2 s) qui mesure le coût GPU réel et choisit le niveau.
// - `QualityMonitor` : temps GPU des images de manche (heure dorée → Grande Ombre) ;
//   `shouldDowngrade()` à interroger ENTRE deux manches seulement (jamais pendant, le
//   changement se verrait).
import { SMAAPreset } from 'postprocessing'
import { create } from 'zustand'
import type { QualityPreset as QualitySetting } from '../settings.ts'

export type QualityLevel = 'low' | 'medium' | 'high'
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high']

export interface QualityPreset {
  level: QualityLevel
  /** Hauteur de rendu visée (px) : le dpr est plafonné pour ne jamais la dépasser. */
  targetHeight: number
  smaa: SMAAPreset | null
  /** Seuil de détection des bords du SMAA (défaut : celui du preset SMAA). */
  smaaThreshold?: number
  /** Détection des bords sur la luminance (défaut : couleur). */
  smaaLuma?: boolean
  shadowRes: number
  farShadowRes: number
  hatching: boolean
  /** Pointillé, granulation du lavis. */
  granulation: boolean
  /** Rides de vent (les crêtes restent en low). */
  ripples: boolean
  wobble: number
  paper: number
  thick: number
  pebbles: number
  pebbleShadows: boolean
  clouds: number
  groundSegments: number
  fxCap: number
  /** Budget GPU cible (ms, Vega 6). */
  budgetMs: number
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    targetHeight: 720,
    smaa: null,
    shadowRes: 1024,
    farShadowRes: 512,
    hatching: false,
    granulation: false,
    ripples: false,
    wobble: 0,
    paper: 0,
    thick: 1.0,
    pebbles: 800,
    pebbleShadows: false,
    clouds: 1,
    groundSegments: 128,
    fxCap: 300,
    budgetMs: 5,
  },
  medium: {
    level: 'medium',
    targetHeight: 900,
    // SMAA LOW (polish 2, W3) : seuil 0,15 et 4 pas de recherche. Les traits d'encre (contraste > 0,3)
    // restent lissés ; le grain et les liserés du lavis, les bords d'ombre (déjà antialiasés dans le shader)
    // ne passent plus dans la passe de poids. Recadrages × 3 identiques à MEDIUM au couchant
    // (shots/polish2/world/smaa3/cmp.png) ; A/B entrelacé ≈ −0,5 ms à 12 oiseaux (GPU partagé).
    smaa: SMAAPreset.LOW,
    shadowRes: 2048,
    farShadowRes: 1024,
    hatching: true,
    granulation: true,
    ripples: true,
    wobble: 0.7,
    paper: 0.04,
    thick: 1.25,
    pebbles: 1500,
    pebbleShadows: true,
    clouds: 3,
    groundSegments: 200,
    fxCap: 800,
    budgetMs: 8,
  },
  high: {
    level: 'high',
    targetHeight: 1080,
    // SMAA LOW (polish W3 : MEDIUM, −0,3 ms à 1080p ; polish 2 : LOW, voir Medium)
    smaa: SMAAPreset.LOW,
    shadowRes: 2048,
    farShadowRes: 1024,
    hatching: true,
    granulation: true,
    ripples: true,
    wobble: 0.7,
    paper: 0.04,
    thick: 1.5,
    // 1 500 cailloux comme Medium (polish W3 : budget GPU à 12 oiseaux)
    pebbles: 1500,
    pebbleShadows: true,
    clouds: 4,
    groundSegments: 200,
    fxCap: 1500,
    budgetMs: 10,
  },
}

/** dpr effectif : jamais au-delà de la hauteur visée, jamais au-delà du dpr natif. */
export function presetDpr(preset: QualityPreset, cssHeight: number, deviceDpr: number): number {
  if (cssHeight <= 0) return 1
  return Math.max(0.25, Math.min(deviceDpr, preset.targetHeight / cssHeight))
}

interface RenderQualityStore {
  level: QualityLevel
  /** Niveau choisi par le banc automatique (null tant qu'il n'a pas tourné). */
  benchLevel: QualityLevel | null
  setLevel: (level: QualityLevel) => void
  setBenchLevel: (level: QualityLevel) => void
}

const BENCH_KEY = 'ombres.qualityBench.v1'

function loadBench(): QualityLevel | null {
  try {
    const v = localStorage.getItem(BENCH_KEY)
    return v === 'low' || v === 'medium' || v === 'high' ? v : null
  } catch {
    return null
  }
}

// Sans banc mémorisé (premier lancement), on démarre en Medium : la chauffe du chargement (compilation
// des shaders, premières images) ne doit pas se faire dans le preset le plus cher sur une machine inconnue.
export const useRenderQuality = create<RenderQualityStore>((set) => ({
  level: loadBench() ?? 'medium',
  benchLevel: loadBench(),
  setLevel: (level) => set({ level }),
  setBenchLevel: (level) => {
    try {
      localStorage.setItem(BENCH_KEY, level)
    } catch {
      // stockage indisponible : le banc retournera au prochain lancement
    }
    set({ benchLevel: level })
  },
}))

export const getRenderQuality = (): QualityPreset => QUALITY_PRESETS[useRenderQuality.getState().level]

/** Applique le réglage utilisateur : un niveau explicite, ou le résultat du banc en 'auto'. */
export function applyQualitySetting(setting: QualitySetting): void {
  const s = useRenderQuality.getState()
  if (setting === 'auto') s.setLevel(s.benchLevel ?? 'medium')
  else s.setLevel(setting)
}

/** Seuils du banc (médiane GPU en High, scène du titre) : High seulement avec 15 % de marge. */
export const BENCH_HIGH_MAX_MS = 8.5
export const BENCH_MEDIUM_MAX_MS = 12

/**
 * Banc court : on rend en 'high' pendant `frames` frames et on mesure le temps
 * GPU (timer queries si disponibles, sinon temps de frame). Choix : high si la
 * médiane est ≤ 8,5 ms, medium si ≤ 12 ms (900p ≈ 0,75 × High), sinon low.
 * Polish 3 (mesuré sur Renoir, High) : la scène du titre (6 oiseaux, plans rapprochés,
 * territoire lissé partout) coûte maintenant à peu près la médiane d'une manche à 12 au
 * climax (9,1 ms contre 8,8-9,2 ms), et non plus ~10 % de moins : un titre ≤ 8,5 ms
 * garde le p90 de manche sous ~9,5 ms, soit la marge voulue sous le budget de 10 ms.
 */
export class QualityBench {
  private samples: number[] = []
  done = false
  constructor(
    private readonly frames = 120,
    private readonly skip = 20,
  ) {}

  /** Ajoute la mesure d'une frame (ms GPU, ou ms de frame à défaut). */
  push(ms: number): QualityLevel | null {
    if (this.done) return null
    this.samples.push(ms)
    if (this.samples.length < this.frames + this.skip) return null
    const s = this.samples.slice(this.skip).sort((a, b) => a - b)
    const median = s[Math.floor(s.length / 2)]!
    this.done = true
    return median <= BENCH_HIGH_MAX_MS ? 'high' : median <= BENCH_MEDIUM_MAX_MS ? 'medium' : 'low'
  }
}

/** Plus long intervalle d'image retenu (ms) : un retour d'onglet caché ne pèse pas plus qu'une image ratée. */
export const MONITOR_MAX_FRAME_MS = 100
/** Nombre minimal d'images mesurées au GPU pour décider sur le p90 (≈ 4 s à 60 i/s). */
export const MONITOR_MIN_GPU_SAMPLES = 240
/** Tolérance du p90 GPU au-dessus du budget du preset avant de descendre d'un cran. */
export const MONITOR_BUDGET_TOLERANCE = 1.1

/**
 * Surveillance de la qualité pendant les manches, lue ENTRE deux manches (`shouldDowngrade`).
 *
 * - Source principale : temps GPU de chaque image (requête TIME_ELAPSED, lue de façon
 *   asynchrone par le pipeline), gardé de l'heure dorée à la Grande Ombre, là où la manche
 *   coûte le plus. Décision : p90 > budget du preset × 1,1 → un cran plus bas.
 * - Repli (pas de timer query) : intervalles d'image de la même fenêtre, bornés à 100 ms,
 *   comparés à `limitMs()` (calé sur l'intervalle d'affichage).
 * Chaque appel de `shouldDowngrade` clôt la manche : les mesures repartent de zéro.
 */
export class QualityMonitor {
  private gpu = new Float32Array(4096)
  private gpuI = 0
  private gpuN = 0
  private buf = new Float32Array(1200)
  private i = 0
  private n = 0

  /** Temps GPU d'une image de manche (ms), fenêtre heure dorée → Grande Ombre. */
  pushGpu(ms: number): void {
    if (!(ms > 0) || !Number.isFinite(ms)) return
    this.gpu[this.gpuI] = ms
    this.gpuI = (this.gpuI + 1) % this.gpu.length
    this.gpuN = Math.min(this.gpuN + 1, this.gpu.length)
  }

  /** Intervalle d'image (ms), même fenêtre ; borné à 100 ms (onglet caché, chargement). */
  push(frameMs: number): void {
    if (!(frameMs > 0)) return
    this.buf[this.i] = Math.min(frameMs, MONITOR_MAX_FRAME_MS)
    this.i = (this.i + 1) % this.buf.length
    this.n = Math.min(this.n + 1, this.buf.length)
  }

  /** p90 des temps GPU mesurés (null s'il n'y en a pas assez). */
  gpuP90(): number | null {
    if (this.gpuN < MONITOR_MIN_GPU_SAMPLES) return null
    const s = Array.from(this.gpu.subarray(0, this.gpuN)).sort((a, b) => a - b)
    return s[Math.min(s.length - 1, Math.floor(s.length * 0.9))]!
  }

  average(): number {
    let s = 0
    for (let k = 0; k < this.n; k++) s += this.buf[k]!
    return this.n ? s / this.n : 0
  }

  /**
   * Seuil de descente du repli (ms) : 15 ms, ou 1,15 × l'intervalle d'affichage à 60 Hz. Correctif qa : les
   * intervalles d'images sont calés sur la synchro verticale, donc jamais sous 16,7 ms sur un écran
   * 60 Hz (la cible : une TV) ; avec le seul seuil de 15 ms, le preset descendait d'un cran à
   * CHAQUE entracte (High → Medium → Low en trois manches), même à 60 i/s constants.
   * Intervalle d'affichage estimé = 20ᵉ centile des intervalles (plafonné à 60 Hz : à 30 i/s
   * constants, 33 ms ne passe pas pour un écran 30 Hz).
   */
  limitMs(): number {
    const s = Array.from(this.buf.subarray(0, this.n)).sort((a, b) => a - b)
    const refresh = s.length ? s[Math.floor(s.length * 0.2)]! : 1000 / 60
    return Math.max(15, Math.min(refresh, 1000 / 60) * 1.15)
  }

  /** Décision sans la clore (tests, debug). */
  verdict(level: QualityLevel): QualityLevel | null {
    const i = QUALITY_LEVELS.indexOf(level)
    if (i <= 0) return null
    const p90 = this.gpuP90()
    const over = p90 !== null ? p90 > QUALITY_PRESETS[level].budgetMs * MONITOR_BUDGET_TOLERANCE : this.n >= 120 && this.average() > this.limitMs()
    return over ? QUALITY_LEVELS[i - 1]! : null
  }

  /** À appeler entre deux manches : renvoie le niveau inférieur si la manche a dépassé le budget. */
  shouldDowngrade(level: QualityLevel): QualityLevel | null {
    const v = this.verdict(level)
    this.reset()
    return v
  }

  reset(): void {
    this.n = 0
    this.i = 0
    this.gpuN = 0
    this.gpuI = 0
  }
}

// ─── Banc automatique et surveillance (branchés dans NprPipeline) ──────────

interface ActiveBench {
  bench: QualityBench
  onDone?: (level: QualityLevel) => void
}

let activeBench: ActiveBench | null = null

/**
 * Lance le banc court (~2,3 s à 60 fps) : le pipeline mesure le temps GPU de chaque
 * frame (timer query, sinon l'intervalle entre frames) en preset High, puis retient
 * le niveau et l'applique si le réglage est « auto ». À lancer sur l'écran titre,
 * une fois la scène chargée (premier lancement : pas de résultat en mémoire).
 */
export function startQualityBench(onDone?: (level: QualityLevel) => void): void {
  useRenderQuality.getState().setLevel('high')
  activeBench = { bench: new QualityBench(), onDone }
}

/** Le banc a-t-il déjà un résultat mémorisé ? */
export const hasQualityBench = (): boolean => useRenderQuality.getState().benchLevel !== null

/** @internal Appelé par NprPipeline avec la mesure d'une frame (ms). */
export function feedQualityBench(ms: number, autoSetting: boolean): void {
  if (!activeBench) return
  const level = activeBench.bench.push(ms)
  if (!level) return
  const s = useRenderQuality.getState()
  s.setBenchLevel(level)
  if (autoSetting) s.setLevel(level)
  activeBench.onDone?.(level)
  activeBench = null
}

/** @internal Un banc est-il en cours ? */
export const qualityBenchActive = (): boolean => activeBench !== null

/** Surveillance du temps de frame (alimentée par NprPipeline, lue entre deux manches). */
export const qualityMonitor = new QualityMonitor()
