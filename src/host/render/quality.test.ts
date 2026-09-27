// Qualité automatique : banc avec marge, surveillance GPU des manches, repli sur les intervalles d'image.
import { describe, expect, it } from 'vitest'
import { benchLevelFromHigh, BENCH_ULTRA_TRY_MS, feedQualityBench, MONITOR_MIN_GPU_SAMPLES, presetDpr, QUALITY_PRESETS, QualityBench, QualityMonitor, startQualityBench, useRenderQuality } from './quality.ts'

const feed = (m: QualityMonitor, f: (i: number) => number, n = 120) => {
  for (let i = 0; i < n; i++) m.push(f(i))
}
const feedGpu = (m: QualityMonitor, f: (i: number) => number, n = MONITOR_MIN_GPU_SAMPLES) => {
  for (let i = 0; i < n; i++) m.pushGpu(f(i))
}

describe('QualityMonitor (repli : intervalles d’image)', () => {
  it('60 i/s constants sur un écran 60 Hz : on garde le preset (16,7 ms > 15 ms)', () => {
    const m = new QualityMonitor()
    feed(m, () => 16.67)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('quelques images perdues (8 %) : on garde', () => {
    const m = new QualityMonitor()
    feed(m, i => (i % 12 === 0 ? 33.3 : 16.67))
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('une image sur trois perdue à 60 Hz : on descend', () => {
    const m = new QualityMonitor()
    feed(m, i => (i % 3 === 0 ? 33.3 : 16.67))
    expect(m.shouldDowngrade('high')).toBe('medium')
  })
  it('30 i/s constants : on descend (33 ms ne passe pas pour un écran 30 Hz)', () => {
    const m = new QualityMonitor()
    feed(m, () => 33.3)
    expect(m.shouldDowngrade('medium')).toBe('low')
  })
  it('écran 144 Hz à 90 i/s : on garde ; à 50 i/s : on descend', () => {
    const a = new QualityMonitor()
    feed(a, i => (i % 3 === 0 ? 6.9 : 13.9))
    expect(a.shouldDowngrade('high')).toBeNull()
    const b = new QualityMonitor()
    feed(b, () => 20)
    expect(b.shouldDowngrade('high')).toBe('medium')
  })
  it('déjà au plus bas : rien', () => {
    const m = new QualityMonitor()
    feed(m, () => 40)
    expect(m.shouldDowngrade('low')).toBeNull()
  })
  it('retour d’un onglet caché : une image de 6 s pèse comme une image de 100 ms, on garde', () => {
    const m = new QualityMonitor()
    feed(m, i => (i === 60 ? 6000 : 16.67), 600)
    expect(m.average()).toBeLessThan(16.67 * 1.01 + 100 / 600)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('trop peu d’images mesurées : pas de décision', () => {
    const m = new QualityMonitor()
    feed(m, () => 50, 60)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
})

describe('QualityMonitor (temps GPU des manches)', () => {
  it('High à 9 ms constants : on garde (budget 10 ms)', () => {
    const m = new QualityMonitor()
    feedGpu(m, () => 9)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('High, p90 à 11,4 ms (climax à 12 oiseaux) : on descend', () => {
    const m = new QualityMonitor()
    feedGpu(m, i => (i % 10 < 8 ? 10.4 : 11.4), 600)
    expect(m.gpuP90()).toBeCloseTo(11.4, 1)
    expect(m.shouldDowngrade('high')).toBe('medium')
  })
  it('High, p90 à 10,9 ms (dans la tolérance de 10 %) : on garde', () => {
    const m = new QualityMonitor()
    feedGpu(m, i => (i % 10 < 8 ? 9.5 : 10.9), 600)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('le GPU prime sur les intervalles calés sur la synchro (montée de caméra saccadée sous contention)', () => {
    const m = new QualityMonitor()
    feedGpu(m, () => 8.5, 600)
    feed(m, () => 49.7, 120)
    expect(m.shouldDowngrade('high')).toBeNull()
  })
  it('Medium au-delà de 9,35 ms au p90 (budget 8,5 ms) : on descend en Low ; 8,7 ms (climax mesuré) : on garde', () => {
    const m = new QualityMonitor()
    feedGpu(m, () => 9.6, 400)
    expect(m.shouldDowngrade('medium')).toBe('low')
    const ok = new QualityMonitor()
    feedGpu(ok, () => 8.7, 400)
    expect(ok.shouldDowngrade('medium')).toBeNull()
  })
  it('Ultra trop cher pour la machine : on descend en High', () => {
    const m = new QualityMonitor()
    feedGpu(m, () => 12, 400)
    expect(m.shouldDowngrade('ultra')).toBe('high')
  })
  it('shouldDowngrade clôt la manche : la suivante repart de zéro', () => {
    const m = new QualityMonitor()
    feedGpu(m, () => 14, 400)
    expect(m.shouldDowngrade('high')).toBe('medium')
    expect(m.gpuP90()).toBeNull()
    expect(m.shouldDowngrade('medium')).toBeNull()
  })
  it('mesures aberrantes ignorées (0, NaN, négatif)', () => {
    const m = new QualityMonitor()
    m.pushGpu(0)
    m.pushGpu(Number.NaN)
    m.pushGpu(-3)
    expect(m.gpuP90()).toBeNull()
  })
})

describe('QualityBench', () => {
  const run = (ms: number) => {
    const b = new QualityBench(40, 5)
    let r = null
    for (let i = 0; i < 45 && !r; i++) r = b.push(ms)
    return r
  }
  it('High seulement avec de la marge (médiane ≤ 8 ms) ; Medium jusqu’à 11 ms', () => {
    expect(run(7.9)).toBe('high')
    expect(run(8.2)).toBe('medium')
    expect(run(9.8)).toBe('medium')
    expect(run(10.9)).toBe('medium')
    expect(run(11.5)).toBe('low')
    expect(benchLevelFromHigh(2)).toBe('high')
  })
})

describe('banc en deux temps (Ultra)', () => {
  const feed = (ms: number, n: number, auto = true) => {
    for (let i = 0; i < n; i++) feedQualityBench(ms, auto)
  }
  it('machine rapide : 2e banc en Ultra, retenu s’il tient 8,5 ms', () => {
    startQualityBench()
    feed(2.5, 140)
    expect(useRenderQuality.getState().level).toBe('ultra')
    feed(7.9, 170)
    expect(useRenderQuality.getState().benchLevel).toBe('ultra')
    expect(useRenderQuality.getState().level).toBe('ultra')
  })
  it('machine rapide, mais Ultra trop cher : High', () => {
    startQualityBench()
    feed(BENCH_ULTRA_TRY_MS, 140)
    feed(11, 170)
    expect(useRenderQuality.getState().benchLevel).toBe('high')
    expect(useRenderQuality.getState().level).toBe('high')
  })
  it('machine moyenne : pas de 2e banc', () => {
    startQualityBench()
    feed(9.5, 140)
    expect(useRenderQuality.getState().benchLevel).toBe('medium')
    expect(useRenderQuality.getState().level).toBe('medium')
  })
})

describe('presetDpr', () => {
  it('plafonne la hauteur de rendu au preset, jamais au-delà du dpr natif', () => {
    expect(presetDpr(QUALITY_PRESETS.low, 1080, 1)).toBeCloseTo(720 / 1080)
    expect(presetDpr(QUALITY_PRESETS.high, 2160, 1)).toBeCloseTo(0.5)
    expect(presetDpr(QUALITY_PRESETS.high, 1080, 2)).toBe(1)
    expect(presetDpr(QUALITY_PRESETS.medium, 720, 1)).toBe(1)
    // Medium en natif (correcteur AA : plus de canevas 900p agrandi)
    expect(presetDpr(QUALITY_PRESETS.medium, 1080, 1)).toBe(1)
  })
  it('Ultra : natif jusqu’en 2160p (4K, HiDPI), suréchantillonné ×2 sur un écran 1080p', () => {
    expect(presetDpr(QUALITY_PRESETS.ultra, 2160, 1)).toBe(1)
    expect(presetDpr(QUALITY_PRESETS.ultra, 1080, 2)).toBe(2)
    expect(presetDpr(QUALITY_PRESETS.ultra, 1080, 1)).toBe(2)
    expect(presetDpr(QUALITY_PRESETS.ultra, 1440, 1)).toBeCloseTo(1.5)
  })
})
