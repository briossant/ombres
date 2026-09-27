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

export type QualityLevel = 'low' | 'medium' | 'high' | 'ultra'
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high', 'ultra']

export interface QualityPreset {
  level: QualityLevel
  /** Hauteur de rendu visée (px) : le dpr est plafonné pour ne jamais la dépasser. */
  targetHeight: number
  /**
   * Suréchantillonnage permis (Ultra) : le dpr peut dépasser le dpr natif jusqu'à ce facteur tant que la
   * hauteur visée n'est pas atteinte (écran 1080p : rendu 2160p réduit par le compositeur = SSAA 4×).
   */
  supersample?: number
  /**
   * Échelle du G-buffer par rapport au canevas (défaut 1). < 1 (Medium) : la géométrie et les matériaux sont
   * rendus plus petit, mais l'encre (traits antialiasés), la couleur (reconstruction Catmull-Rom nette) et le
   * SMAA sont calculés à la résolution de l'écran : pas d'agrandissement flou du canevas par le navigateur.
   */
  gbufferScale?: number
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
  /** Budget GPU cible (ms, Vega 6 ; Ultra : GPU de la machine qui l'a choisi). */
  budgetMs: number
}

export const QUALITY_PRESETS: Record<QualityLevel, QualityPreset> = {
  low: {
    level: 'low',
    targetHeight: 720,
    // correcteur AA : SMAA LOW (avant : aucun AA ; les traits d'encre sont en plus lissés dans le shader)
    smaa: SMAAPreset.LOW,
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
    budgetMs: 6,
  },
  medium: {
    level: 'medium',
    // correcteur AA : canevas à la résolution de l'écran (plafond 1080p), G-buffer à 900p (0,833) ; encre et
    // couleur reconstruites en natif. Avant : canevas 900p agrandi par le navigateur (flou + marches). Le 1080p
    // natif coûte 1,3 à 1,5 × (p90 11,4 ms au climax à 4 oiseaux) ; pas de SMAA : les traits sont lissés dans
    // l'encre et il coûterait 1,4 ms pour un gain à peine visible (docs/polish/fix-antialiasing.md).
    targetHeight: 1080,
    gbufferScale: 900 / 1080,
    smaa: null,
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
    // 8 → 8,5 ms (correcteur AA) : encre reconstruite à la définition de l'écran (+0,25 à +0,45 ms) ; mesuré au
    // calme sur une manche entière : p50 6,3-7,5 ms, p90 7,0-8,7 ms (heure dorée, Grande Ombre) ; à 8 ms la
    // surveillance (p90 > 8,8 ms) aurait fait descendre en Low au moindre à-coup du CPU
    budgetMs: 8.5,
  },
  high: {
    level: 'high',
    targetHeight: 1080,
    // correcteur AA : SMAA MEDIUM (polish W3 / 2 : baissé à LOW pour le budget)
    smaa: SMAAPreset.MEDIUM,
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
  ultra: {
    level: 'ultra',
    // GPU puissants : résolution native jusqu'en 2160p (écran 4K ou HiDPI) ; sur un écran 1080p, rendu 2160p
    // réduit par le compositeur (SSAA 4×). SMAA HIGH. Voir docs/polish/fix-antialiasing.md (MSAA écarté).
    targetHeight: 2160,
    supersample: 2,
    smaa: SMAAPreset.HIGH,
    shadowRes: 2048,
    farShadowRes: 1024,
    hatching: true,
    granulation: true,
    ripples: true,
    wobble: 0.7,
    paper: 0.04,
    thick: 1.5,
    pebbles: 2200,
    pebbleShadows: true,
    clouds: 4,
    groundSegments: 200,
    fxCap: 1500,
    budgetMs: 10,
  },
}

/**
 * dpr effectif : jamais au-delà de la hauteur visée ; jamais au-delà du dpr natif, sauf suréchantillonnage
 * (Ultra : jusqu'à `supersample` × le dpr natif).
 */
export function presetDpr(preset: QualityPreset, cssHeight: number, deviceDpr: number): number {
  if (cssHeight <= 0) return 1
  return Math.max(0.25, Math.min(deviceDpr * (preset.supersample ?? 1), preset.targetHeight / cssHeight))
}

interface RenderQualityStore {
  level: QualityLevel
  /** Niveau choisi par le banc automatique (null tant qu'il n'a pas tourné). */
  benchLevel: QualityLevel | null
  setLevel: (level: QualityLevel) => void
  setBenchLevel: (level: QualityLevel) => void
}

// v2 (correcteur AA) : les presets ont changé (Medium natif, Ultra) : le banc repasse une fois
const BENCH_KEY = 'ombres.qualityBench.v2'

function loadBench(): QualityLevel | null {
  try {
    const v = localStorage.getItem(BENCH_KEY)
    return (QUALITY_LEVELS as readonly string[]).includes(v ?? '') ? (v as QualityLevel) : null
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

/**
 * Seuils du banc (médiane GPU en High, scène du titre) : High seulement avec de la marge. 8,5 → 8 ms (correcteur
 * AA) : High coûte ~0,6 ms de plus (traits antialiasés, SMAA MEDIUM) ; sur Renoir le titre en High mesure
 * 8,3-8,7 ms au banc (High une fois sur trois à 8,5 ms) pour un p90 de 9,6 à 10,6 ms au climax.
 */
export const BENCH_HIGH_MAX_MS = 8
/**
 * Medium coûte ≈ 0,74 × High au titre (mesuré : 7,1 contre 9,6 ms) : un titre High ≤ 11 ms garde Medium vers
 * 8 ms (avant le correcteur AA : 12 ms, pour un Medium à ≈ 0,75 × High mais un High moins cher).
 */
export const BENCH_MEDIUM_MAX_MS = 11
/** Titre High ≤ 3 ms : machine assez rapide pour essayer Ultra (≈ 4 × les pixels de High) par un 2e banc. */
export const BENCH_ULTRA_TRY_MS = 3
/** Ultra retenu si sa médiane au titre (2e banc, en Ultra) reste ≤ 8,5 ms (15 % sous son budget de 10 ms). */
export const BENCH_ULTRA_MAX_MS = 8.5

/** Niveau d'après la médiane du banc en High. */
export function benchLevelFromHigh(medianMs: number): QualityLevel {
  return medianMs <= BENCH_HIGH_MAX_MS ? 'high' : medianMs <= BENCH_MEDIUM_MAX_MS ? 'medium' : 'low'
}

/**
 * Banc court : on rend en 'high' pendant `frames` frames et on mesure le temps
 * GPU (timer queries si disponibles, sinon temps de frame). Choix : high si la
 * médiane est ≤ 8 ms, medium si ≤ 11 ms, sinon low ; si elle est ≤ 3 ms, un 2e banc
 * en Ultra décide entre ultra (≤ 8,5 ms) et high (voir `startQualityBench`).
 * Polish 3 (mesuré sur Renoir, High) : la scène du titre (6 oiseaux, plans rapprochés,
 * territoire lissé partout) coûte maintenant à peu près la médiane d'une manche à 12 au
 * climax (9,1 ms contre 8,8-9,2 ms), et non plus ~10 % de moins : un titre ≤ 8,5 ms
 * garde le p90 de manche sous ~9,5 ms, soit la marge voulue sous le budget de 10 ms.
 */
export class QualityBench {
  private samples: number[] = []
  done = false
  /** Médiane mesurée (NaN tant que le banc n'est pas fini). */
  median = Number.NaN
  constructor(
    private readonly frames = 120,
    private readonly skip = 20,
  ) {}

  /** Ajoute la mesure d'une frame (ms GPU, ou ms de frame à défaut) ; renvoie la médiane à la fin. */
  pushMs(ms: number): number | null {
    if (this.done) return null
    this.samples.push(ms)
    if (this.samples.length < this.frames + this.skip) return null
    const s = this.samples.slice(this.skip).sort((a, b) => a - b)
    this.median = s[Math.floor(s.length / 2)]!
    this.done = true
    return this.median
  }

  /** Ajoute la mesure d'une frame ; à la fin, le niveau d'après la médiane (banc en High). */
  push(ms: number): QualityLevel | null {
    const m = this.pushMs(ms)
    return m === null ? null : benchLevelFromHigh(m)
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
  /** 'high' : 1er banc ; 'ultra' : 2e banc (machine rapide), qui tranche entre ultra et high. */
  stage: 'high' | 'ultra'
  onDone?: (level: QualityLevel) => void
}

let activeBench: ActiveBench | null = null

/**
 * Lance le banc court (~2,3 s à 60 fps) : le pipeline mesure le temps GPU de chaque
 * frame (timer query, sinon l'intervalle entre frames) en preset High, puis retient
 * le niveau et l'applique si le réglage est « auto ». Machine rapide (médiane ≤ 3 ms) :
 * 2e banc de ~2,5 s en Ultra (50 images de chauffe : shaders du SMAA HIGH, rendu 2160p).
 * À lancer sur l'écran titre, une fois la scène chargée (premier lancement : pas de résultat
 * en mémoire).
 */
export function startQualityBench(onDone?: (level: QualityLevel) => void): void {
  useRenderQuality.getState().setLevel('high')
  activeBench = { bench: new QualityBench(), stage: 'high', onDone }
}

/** Le banc a-t-il déjà un résultat mémorisé ? */
export const hasQualityBench = (): boolean => useRenderQuality.getState().benchLevel !== null

/** @internal Appelé par NprPipeline avec la mesure d'une frame (ms). */
export function feedQualityBench(ms: number, autoSetting: boolean): void {
  const b = activeBench
  if (!b) return
  const median = b.bench.pushMs(ms)
  if (median === null) return
  const s = useRenderQuality.getState()
  let level: QualityLevel
  if (b.stage === 'high') {
    level = benchLevelFromHigh(median)
    if (median <= BENCH_ULTRA_TRY_MS && autoSetting) {
      s.setLevel('ultra')
      activeBench = { bench: new QualityBench(120, 50), stage: 'ultra', onDone: b.onDone }
      return
    }
  } else {
    level = median <= BENCH_ULTRA_MAX_MS ? 'ultra' : 'high'
  }
  s.setBenchLevel(level)
  if (autoSetting) s.setLevel(level)
  b.onDone?.(level)
  activeBench = null
}

/** @internal Un banc est-il en cours ? */
export const qualityBenchActive = (): boolean => activeBench !== null

/** Surveillance du temps de frame (alimentée par NprPipeline, lue entre deux manches). */
export const qualityMonitor = new QualityMonitor()
