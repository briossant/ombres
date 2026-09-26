// Point d'entrée autonome du rendu hors ligne (empaqueté par tools/audio-render.mjs avec
// esbuild, hors Vite : les rechargements HMR provoqués par les autres modules ne l'interrompent pas).
import { measureLoudness } from '../../host/audio/loudness.ts'
import { renderRound, toWav } from './offline.ts'
import { clacBuffer, sandGrainBuffer, tskBuffer } from '../../host/audio/procedural.ts'

/** Sons générés par le code, exportés en WAV (planches de vérification). */
function procWavs(): Record<string, Blob> {
  const ctx = new OfflineAudioContext(2, 44100, 44100)
  return { tsk: toWav(tskBuffer(ctx)), clac: toWav(clacBuffer(ctx)), grains: toWav(sandGrainBuffer(ctx, 2, 700, 17)) }
}

;(window as unknown as Record<string, unknown>).__audioDev = { renderRound, toWav, measureLoudness, procWavs }
;(window as unknown as Record<string, unknown>).__ready = true
import { bench, BENCH_NAMES, calibrateProc } from './bench.ts'
;(window as unknown as Record<string, unknown>).__audioBench = { bench, BENCH_NAMES, calibrateProc }
