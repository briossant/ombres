// Presets de qualité graphique (ART_BIBLE §7.4) + choix automatique + bascule à chaud.
//
// - `QUALITY_PRESETS` : les réglages de chaque niveau (lus par le pipeline et le monde).
// - `useRenderQuality` (zustand) : niveau courant, hors React via getRenderQuality().
//   `setLevel()` change le preset à chaud (le pipeline se reconfigure sans rechargement).
// - `applyQualitySetting(setting)` : traduit le réglage utilisateur ('auto' | niveau).
// - `QualityBench` : banc court (≈ 2 s) qui mesure le coût GPU réel et choisit le niveau.
// - `QualityMonitor` : moyenne glissante du temps de frame ; `shouldDowngrade()` à
//   interroger ENTRE deux manches seulement (jamais pendant, le changement se verrait).
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
    smaa: SMAAPreset.MEDIUM,
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

export const useRenderQuality = create<RenderQualityStore>((set) => ({
  level: loadBench() ?? 'high',
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
  if (setting === 'auto') s.setLevel(s.benchLevel ?? 'high')
  else s.setLevel(setting)
}

/**
 * Banc court : on rend en 'high' pendant `frames` frames et on mesure le temps
 * GPU (timer queries si disponibles, sinon temps de frame). Choix : high si
 * ≤ 10 ms, medium si ≤ 14 ms (on descend à 900p et SMAA medium), sinon low.
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
    return median <= 10 ? 'high' : median <= 14 ? 'medium' : 'low'
  }
}

/** Moyenne glissante sur ~2 s ; descente d'un cran si > 15 ms (entre deux manches). */
export class QualityMonitor {
  private buf = new Float32Array(120)
  private i = 0
  private n = 0

  push(frameMs: number): void {
    this.buf[this.i] = frameMs
    this.i = (this.i + 1) % this.buf.length
    this.n = Math.min(this.n + 1, this.buf.length)
  }

  average(): number {
    let s = 0
    for (let k = 0; k < this.n; k++) s += this.buf[k]!
    return this.n ? s / this.n : 0
  }

  /** À appeler entre deux manches : renvoie le niveau inférieur si la moyenne dépasse 15 ms. */
  shouldDowngrade(level: QualityLevel): QualityLevel | null {
    if (this.n < this.buf.length || this.average() <= 15) return null
    const i = QUALITY_LEVELS.indexOf(level)
    return i > 0 ? QUALITY_LEVELS[i - 1]! : null
  }

  reset(): void {
    this.n = 0
    this.i = 0
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
