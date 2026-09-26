// Banc d'essai du coût CPU : rend 10 s hors ligne avec une seule brique (Tone.js ou native) et
// mesure le temps de rendu. C'est ce banc qui a fait abandonner Tone.js pour la partition
// (tools/audio-render.mjs --bench ; résultats dans docs/agent-notes/audio.md).
import * as Tone from 'tone'
import { chorus, pingPong, pluck, sawVoice, whiteNoise } from '../../host/audio/music/synth.ts'
import { impulseResponse } from '../../host/audio/procedural.ts'

type Maker = (ctx: Tone.BaseContext, out: AudioNode) => void

const MAKERS: Record<string, Maker> = {
  empty: () => {},
  synth: (context, out) => {
    for (let i = 0; i < 14; i++) new Tone.Synth({ context, oscillator: { type: 'fatsawtooth', count: 3, spread: 22 } }).connect(out)
  },
  synthPlaying: (context, out) => {
    for (let i = 0; i < 5; i++) {
      const s = new Tone.Synth({ context, oscillator: { type: 'fatsawtooth', count: 3, spread: 22 } }).connect(out)
      s.triggerAttackRelease(220 + i * 30, 9, 0.1)
    }
  },
  nativeSaw: (_c, out) => {
    const ctx = out.context
    for (let i = 0; i < 15; i++) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      o.frequency.value = 220 + i * 10
      const g = ctx.createGain()
      g.gain.value = 0.02
      o.connect(g).connect(out)
      o.start(0.1)
      o.stop(9)
    }
  },
  fm: (context, out) => {
    for (let i = 0; i < 4; i++) new Tone.FMSynth({ context }).connect(out)
  },
  chorus: (context, out) => {
    new Tone.Chorus({ context, frequency: 0.13, delayTime: 5, depth: 0.6, spread: 160, wet: 0.5 }).start().connect(out)
  },
  tremolo: (context, out) => {
    new Tone.Tremolo({ context, frequency: 6.5, depth: 0.35, spread: 90 }).start().connect(out)
  },
  pingpong: (context, out) => {
    new Tone.PingPongDelay({ context, delayTime: 0.5, feedback: 0.4, wet: 0.4 }).connect(out)
  },
  sampler: (context, out) => {
    new Tone.Sampler({ context, urls: {} }).connect(out)
  },
  mono: (context, out) => {
    new Tone.MonoSynth({ context }).connect(out)
    new Tone.MembraneSynth({ context }).connect(out)
    new Tone.NoiseSynth({ context }).connect(out)
  },
  noise: (context, out) => {
    new Tone.Noise({ context, type: 'pink' }).connect(out).start(0)
  },
  filter24: (context, out) => {
    for (let i = 0; i < 6; i++) new Tone.Filter({ context, type: 'lowpass', frequency: 800, rolloff: -24 }).connect(out)
  },
  nativePad5: (_c, out) => {
    for (let i = 0; i < 5; i++) sawVoice(out, 57 + i * 3, 0.1, 9, 0.5, { voices: 2, spread: 11, attack: 2, decay: 1, sustain: 0.8, release: 1 })
  },
  nativeChorus: (_c, out) => {
    const c = chorus(out.context, 0.13, 3.5, 0.5)
    c.output.connect(out)
    const o = out.context.createOscillator()
    o.connect(c.input)
    o.start()
  },
  nativePingPong: (_c, out) => {
    const p = pingPong(out.context, 0.5, 0.4, 0.4)
    p.output.connect(out)
    const o = out.context.createOscillator()
    o.connect(p.input)
    o.start()
  },
  nativeSeq16: (_c, out) => {
    for (let k = 0; k < 80; k++) pluck(out, 45 + (k % 8), 0.1 + k * 0.11, 0.09, 0.6, { type: 'sawtooth', cutoff: 800, envOctaves: 2.6, filterDecay: 0.14, q: 3, detune: 7, attack: 0.003, decay: 0.16, sustain: 0.25, release: 0.08 })
  },
  seqNoFilterEnv: (_c, out) => {
    for (let k = 0; k < 80; k++) pluck(out, 45 + (k % 8), 0.1 + k * 0.11, 0.09, 0.6, { type: 'sawtooth', cutoff: 800, envOctaves: 0, filterDecay: 0.14, q: 3, detune: 7, attack: 0.003, decay: 0.16, sustain: 0.25, release: 0.08 })
  },
  seqOscOnly: (_c, out) => {
    const ctx = out.context
    for (let k = 0; k < 80; k++) {
      const o = ctx.createOscillator()
      o.type = 'sawtooth'
      const g = ctx.createGain()
      g.gain.value = 0.1
      o.connect(g).connect(out)
      o.start(0.1 + k * 0.11)
      o.stop(0.1 + k * 0.11 + 0.25)
    }
  },
  seqSineOnly: (_c, out) => {
    const ctx = out.context
    for (let k = 0; k < 80; k++) {
      const o = ctx.createOscillator()
      const g = ctx.createGain()
      g.gain.value = 0.1
      o.connect(g).connect(out)
      o.start(0.1 + k * 0.11)
      o.stop(0.1 + k * 0.11 + 0.25)
    }
  },
  buffers80: (_c, out) => {
    const ctx = out.context
    const b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    for (let k = 0; k < 80; k++) {
      const o = ctx.createBufferSource()
      o.buffer = b
      const g = ctx.createGain()
      g.gain.value = 0.1
      o.connect(g).connect(out)
      o.start(0.1 + k * 0.11)
      o.stop(0.1 + k * 0.11 + 0.25)
    }
  },
  monoSeq: (_c, out) => {
    const ctx = out.context
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const f = ctx.createBiquadFilter()
    const g = ctx.createGain()
    g.gain.value = 0
    o.connect(f).connect(g).connect(out)
    o.start()
    for (let k = 0; k < 80; k++) {
      const t = 0.1 + k * 0.11
      o.frequency.setValueAtTime(110 + k, t)
      f.frequency.setValueAtTime(3000, t)
      f.frequency.setTargetAtTime(800, t, 0.05)
      g.gain.setValueAtTime(0, t)
      g.gain.linearRampToValueAtTime(0.3, t + 0.003)
      g.gain.setTargetAtTime(0, t + 0.09, 0.02)
    }
  },
  filterAutomated: (_c, out) => {
    const ctx = out.context
    const o = ctx.createOscillator()
    o.type = 'sawtooth'
    const f = ctx.createBiquadFilter()
    f.frequency.setValueAtTime(300, 0)
    f.frequency.exponentialRampToValueAtTime(5000, 10)
    o.connect(f).connect(out)
    o.start()
  },
  noiseLoopBandpass: (_c, out) => {
    const ctx = out.context
    const s = ctx.createBufferSource()
    s.buffer = whiteNoise(ctx)
    s.loop = true
    const f = ctx.createBiquadFilter()
    f.type = 'bandpass'
    s.connect(f).connect(out)
    s.start()
  },
  convolverOurs: (_c, out) => {
    const ctx = out.context
    const c = ctx.createConvolver()
    c.buffer = impulseResponse(ctx, { seconds: 4.2 })
    const o = ctx.createOscillator()
    o.connect(c).connect(out)
    o.start()
  },
  convolverShort: (_c, out) => {
    const ctx = out.context
    const c = ctx.createConvolver()
    c.buffer = impulseResponse(ctx, { seconds: 2.2 })
    const o = ctx.createOscillator()
    o.connect(c).connect(out)
    o.start()
  },
  waveshaper2x: (_c, out) => {
    const ctx = out.context
    const w = ctx.createWaveShaper()
    w.curve = new Float32Array([-1, 0, 1])
    w.oversample = '2x'
    const o = ctx.createOscillator()
    o.connect(w).connect(out)
    o.start()
  },
  compressor2: (_c, out) => {
    const ctx = out.context
    const o = ctx.createOscillator()
    o.connect(ctx.createDynamicsCompressor()).connect(ctx.createDynamicsCompressor()).connect(out)
    o.start()
  },
  loops8: (_c, out) => {
    const ctx = out.context
    const b = ctx.createBuffer(2, ctx.sampleRate * 5, ctx.sampleRate)
    for (let i = 0; i < 8; i++) {
      const s = ctx.createBufferSource()
      s.buffer = b
      s.loop = true
      const g = ctx.createGain()
      g.gain.value = 0
      s.connect(g).connect(out)
      s.start()
    }
  },
  convolver: (_c, out) => {
    const ctx = out.context
    const c = ctx.createConvolver()
    const b = ctx.createBuffer(2, ctx.sampleRate * 4.2, ctx.sampleRate)
    for (let ch = 0; ch < 2; ch++) b.getChannelData(ch).forEach((_, i, a) => (a[i] = (Math.random() * 2 - 1) * Math.exp(-i / 30000)))
    c.buffer = b
    const o = ctx.createOscillator()
    o.connect(c).connect(out)
    o.start()
  },
}

export async function bench(names: string[], seconds = 10): Promise<Record<string, number>> {
  const out: Record<string, number> = {}
  for (const name of names) {
    const ctx = new OfflineAudioContext(2, 44100 * seconds, 44100)
    const tctx = new Tone.OfflineContext(ctx)
    const g = ctx.createGain()
    g.connect(ctx.destination)
    MAKERS[name]!(tctx, g)
    const t0 = performance.now()
    await ctx.startRendering()
    out[name] = Math.round(performance.now() - t0)
  }
  return out
}

export const BENCH_NAMES = Object.keys(MAKERS)

/**
 * Sonie (LUFS intégrés, gain 1) des couches d'ambiance générées, filtres au repos : valeurs de
 * PROC_REF dans ambience.ts.
 */
export async function calibrateProc(): Promise<Record<string, number>> {
  const { noiseBuffer, sandGrainBuffer } = await import('../../host/audio/procedural.ts')
  const { measureLoudness } = await import('../../host/audio/loudness.ts')
  const layers: Record<string, (ctx: OfflineAudioContext) => void> = {
    body: ctx => chain(ctx, noiseBuffer(ctx, 6, 'pink', 1), [['bandpass', 500, 0.7]]),
    whistle: ctx => chain(ctx, noiseBuffer(ctx, 6, 'pink', 2), [['bandpass', 1100, 11]]),
    souffle: ctx => chain(ctx, noiseBuffer(ctx, 6, 'brown', 3), [['lowpass', 260, 0.9]]),
    grains: ctx => chain(ctx, sandGrainBuffer(ctx, 4, 700, 17), [['highpass', 1400, 0.7]]),
    front: ctx => chain(ctx, noiseBuffer(ctx, 6, 'brown', 4), [['lowpass', 140, 0.7]]),
  }
  const out: Record<string, number> = {}
  for (const [name, build] of Object.entries(layers)) {
    const ctx = new OfflineAudioContext(2, 44100 * 6, 44100)
    build(ctx)
    out[name] = Math.round(measureLoudness(await ctx.startRendering()).integrated * 10) / 10
  }
  return out
}

function chain(ctx: OfflineAudioContext, buf: AudioBuffer, filters: [BiquadFilterType, number, number][]): void {
  const s = ctx.createBufferSource()
  s.buffer = buf
  s.loop = true
  let node: AudioNode = s
  for (const [type, f, q] of filters) {
    const b = ctx.createBiquadFilter()
    b.type = type
    b.frequency.value = f
    b.Q.value = q
    node.connect(b)
    node = b
  }
  node.connect(ctx.destination)
  s.start()
}
