// Pipeline NPR complet, à monter dans un <Canvas flat> (ART_BIBLE §7.1) :
//   hooks « avant rendu » (palette, soleil, empreintes, territoire…)
//   → scene.updateMatrixWorld() → height shadow map (2 cascades)
//   → EffectComposer : GBufferPass (MRT) → InkEffect → SMAA (medium/high).
// Composer : multisampling 0, UnsignedByteType, pas de depth buffer (NPR §2).
// Il prend la main sur le rendu de R3F (useFrame priorité 1).
import { useFrame, useThree, type RootState } from '@react-three/fiber'
import { EffectComposer, EffectPass, SMAAEffect, type Pass } from 'postprocessing'
import { useEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { getSettings } from '../../settings.ts'
import { feedQualityBench, QUALITY_PRESETS, qualityBenchActive, qualityMonitor, type QualityLevel } from '../quality.ts'
import { createGBuffer, GBufferPass } from './gbuffer.ts'
import { InkEffect } from './InkEffect.ts'
import { GpuTimer } from './perf.ts'
import { HeightShadowMap, shadowCasters } from './shadowMap.ts'
import { NPR } from './uniforms.ts'
import { gameView } from '../../view.ts'
import type { RoundPhase } from '../../../sim/types.ts'

/** Phases surveillées par la qualité automatique : de l'heure dorée à la Grande Ombre (le climax). */
const MONITORED_PHASES: ReadonlySet<RoundPhase> = new Set<RoundPhase>(['golden', 'sunset', 'greatShadow'])

// ─── Hooks exécutés juste avant le rendu (après tous les useFrame de priorité ≤ 0) ──

export type NprFrameHook = (state: RootState, delta: number) => void
interface HookEntry {
  order: number
  fn: { current: NprFrameHook }
}
const hooks: HookEntry[] = []

/**
 * Enregistre un callback exécuté par le pipeline à chaque frame, AVANT la passe
 * d'ombres (ordre croissant de `order`). C'est l'endroit pour pousser palette,
 * soleil, empreintes, territoire… une fois que le runner, la caméra et les
 * oiseaux ont bougé (useFrame de priorité 0).
 */
export function useNprFrame(fn: NprFrameHook, order = 0): void {
  const ref = useRef(fn)
  ref.current = fn
  useEffect(() => {
    const entry: HookEntry = { order, fn: ref }
    hooks.push(entry)
    hooks.sort((a, b) => a.order - b.order)
    return () => {
      const i = hooks.indexOf(entry)
      if (i >= 0) hooks.splice(i, 1)
    }
  }, [order])
}

// ─── Flash « planche » (ART_BIBLE §6.8) ────────────────────────────────────

let flashRequested = false
let flashFrames = 0
let lastFlash = -Infinity

/**
 * Demande un flash « planche » : 2 frames où la couleur recule à 70 % vers le
 * papier et où les traits restent. Au plus 1 toutes les 2 s ; ignoré si le
 * réglage « Réduire les flashs » est actif.
 */
export function requestPlancheFlash(): void {
  flashRequested = true
}

// ─── Composant ─────────────────────────────────────────────────────────────

export interface NprPipelineProps {
  quality: QualityLevel
  /** Mesures GPU par passe (timer queries) exposées dans window.__timings. */
  measure?: boolean
  /** Mode debug de l'encre : 0 normal, 1 traits, 2 normales, 3 profondeur, 4 IDs. */
  inkDebug?: number
  /** Rappel à chaque relevé de mesures (≈ 2 Hz). */
  onTimings?: (t: Record<string, number>) => void
}

interface Passes {
  gbuffer: GBufferPass
  ink: EffectPass
  inkEffect: InkEffect
  aa: EffectPass | null
}

declare global {
  interface Window {
    __timings?: Record<string, number>
    __nprInfo?: { calls: number; triangles: number; programs: number; casters: number }
  }
}

export function NprPipeline({ quality, measure = false, inkDebug = 0, onTimings }: NprPipelineProps) {
  const gl = useThree((s) => s.gl)
  const scene = useThree((s) => s.scene)
  const camera = useThree((s) => s.camera) as THREE.PerspectiveCamera
  const size = useThree((s) => s.size)
  const dpr = useThree((s) => s.viewport.dpr)
  const preset = QUALITY_PRESETS[quality]
  // le dpr plafonné par le preset est passé en prop au <Canvas> (WorldCanvas) : jamais de setDpr ici

  const gbuffer = useMemo(() => createGBuffer(), [])
  const shadows = useMemo(() => new HeightShadowMap(preset.shadowRes, preset.farShadowRes), [])
  useEffect(() => shadows.setResolution(preset.shadowRes, preset.farShadowRes), [shadows, preset.shadowRes, preset.farShadowRes])
  useEffect(
    () => () => {
      gbuffer.dispose()
      shadows.dispose()
    },
    [gbuffer, shadows],
  )

  const composer = useMemo(
    () =>
      new EffectComposer(gl, {
        frameBufferType: THREE.UnsignedByteType,
        multisampling: 0,
        depthBuffer: false,
        stencilBuffer: false,
      }),
    [gl],
  )
  useEffect(() => () => composer.dispose(), [composer])

  const passes = useRef<Passes | null>(null)
  useEffect(() => {
    composer.removeAllPasses()
    const gpass = new GBufferPass(scene, camera, gbuffer)
    const inkEffect = new InkEffect(gbuffer, camera, preset)
    const ink = new EffectPass(camera, inkEffect)
    composer.addPass(gpass)
    composer.addPass(ink)
    let aa: EffectPass | null = null
    if (preset.smaa !== null) {
      aa = new EffectPass(camera, new SMAAEffect({ preset: preset.smaa }))
      composer.addPass(aa)
    }
    passes.current = { gbuffer: gpass, ink, inkEffect, aa }
    return () => {
      composer.removeAllPasses()
      ink.dispose()
      aa?.dispose()
      passes.current = null
    }
  }, [composer, scene, camera, gbuffer, preset])

  useEffect(() => {
    composer.setSize(size.width, size.height)
  }, [composer, size.width, size.height, dpr, preset])

  useEffect(() => {
    if (passes.current) passes.current.inkEffect.debug = inkDebug
  }, [inkDebug, preset, camera])

  // Qualité -> uniforms partagés
  useEffect(() => {
    NPR.uQuality.value.set(preset.hatching ? 1 : 0, preset.granulation ? 1 : 0, preset.ripples ? 1 : 0, preset.wobble > 0 ? 1 : 0)
  }, [preset])

  // Mesures GPU (debug seulement)
  const timer = useMemo(() => (measure ? new GpuTimer(gl.getContext() as WebGL2RenderingContext) : null), [gl, measure])
  // Mesure d'une frame entière (hors debug) : banc de qualité automatique au titre, et
  // surveillance des manches (heure dorée → Grande Ombre) lue entre deux manches
  const benchTimer = useMemo(() => new GpuTimer(gl.getContext() as WebGL2RenderingContext, 1), [gl])
  // la surveillance ne mélange pas deux presets : on repart de zéro à chaque changement
  useEffect(() => qualityMonitor.reset(), [preset])
  const lastReport = useRef(0)
  const timed = (name: string, pass: Pass | null) => {
    if (!pass || !timer) return
    const p = pass as Pass & { __timed?: boolean }
    if (p.__timed) return
    const orig = pass.render.bind(pass)
    pass.render = (...args: Parameters<Pass['render']>) => timer.time(name, () => orig(...args))
    p.__timed = true
  }

  useEffect(() => {
    const prev = gl.info.autoReset
    gl.info.autoReset = false // compteurs de la frame entière (ombres + G-buffer + post)
    return () => {
      gl.info.autoReset = prev
    }
  }, [gl])

  const cpuTimes = useMemo(() => new Float32Array(120), [])
  const cpuIdx = useRef(0)

  useFrame((state, delta) => {
    const cpuStart = timer ? performance.now() : 0
    gl.info.reset()
    for (const h of hooks) h.fn.current(state, delta)

    // uniforms dépendant de la résolution et du temps
    const h = gl.domElement.height
    NPR.uPx.value = h / 1080
    NPR.uResolution.value.set(gl.domElement.width, h)
    NPR.uTime.value = state.clock.elapsedTime

    // flash « planche »
    if (flashRequested) {
      flashRequested = false
      const now = state.clock.elapsedTime
      if (now - lastFlash >= 2 && !getSettings().reduceFlashes) {
        lastFlash = now
        flashFrames = 2
      }
    }
    NPR.uFlash.value = flashFrames > 0 ? 1 : 0
    if (flashFrames > 0) flashFrames--

    scene.updateMatrixWorld()
    camera.updateMatrixWorld()
    const p = passes.current
    if (p && timer) {
      timed('gbuffer', p.gbuffer)
      timed('ink', p.ink)
      timed('smaa', p.aa)
    }
    const renderAll = () => {
      if (timer) timer.time('shadow', () => shadows.render(gl))
      else shadows.render(gl)
      composer.render(delta)
    }
    // banc de qualité et surveillance : temps GPU de la frame entière (requête lue plus tard) ;
    // sans timer query, l'intervalle entre frames (borné à 100 ms par le moniteur)
    const bench = qualityBenchActive()
    const sim = gameView.sim
    const watch = sim !== null && sim.config.mode === 'round' && MONITORED_PHASES.has(sim.sun.phase)
    if ((bench || watch) && !timer && benchTimer.supported) benchTimer.time(bench ? 'bench' : 'round', renderAll)
    else renderAll()
    if (!timer && benchTimer.supported) {
      benchTimer.poll((name, ms) => {
        if (name === 'bench') feedQualityBench(ms, getSettings().quality === 'auto')
        else qualityMonitor.pushGpu(ms)
      })
    } else if (timer) {
      // ?debug=perf : somme des passes mesurées (médianes glissantes)
      if (bench || watch) {
        const m = timer.medians()
        const sum = (m.shadow ?? 0) + (m.gbuffer ?? 0) + (m.ink ?? 0) + (m.smaa ?? 0)
        if (sum > 0) {
          if (bench) feedQualityBench(sum, getSettings().quality === 'auto')
          else qualityMonitor.pushGpu(sum)
        }
      }
    } else {
      if (bench) feedQualityBench(Math.min(delta * 1000, 100), getSettings().quality === 'auto')
      else if (watch) qualityMonitor.push(delta * 1000)
    }

    if (timer) {
      // temps CPU du pipeline (hooks du monde + soumission des passes), médiane glissante
      cpuTimes[cpuIdx.current++ % cpuTimes.length] = performance.now() - cpuStart
      timer.poll()
      if (state.clock.elapsedTime - lastReport.current > 0.5 && timer.samples > 30) {
        lastReport.current = state.clock.elapsedTime
        const m = timer.medians()
        m.total = +Object.values(m)
          .reduce((a, b) => a + b, 0)
          .toFixed(3)
        const sorted = Array.from(cpuTimes.subarray(0, Math.min(cpuIdx.current, cpuTimes.length))).sort((a, b) => a - b)
        m.cpu = +(sorted[Math.floor(sorted.length / 2)] ?? 0).toFixed(3)
        window.__timings = m
        const info = gl.info.render
        window.__nprInfo = { calls: info.calls, triangles: info.triangles, programs: gl.info.programs?.length ?? 0, casters: shadowCasters.size }
        onTimings?.(m)
      }
    }
  }, 1)

  return null
}
