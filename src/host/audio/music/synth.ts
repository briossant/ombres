// Voix de synthèse natives (WebAudio pur), créées à chaque note et libérées à la fin :
// aucun coût au repos, programmation à l'échantillon près, identiques en temps réel et dans
// un OfflineAudioContext. Mesuré (src/dev/audio/bench.ts, rendu hors ligne de 10 s) :
// 5 voix Tone.Synth « fatsawtooth » = 3,1 s de calcul, 15 oscillateurs natifs = 0,36 s.
import { mtof } from '../util.ts'

export interface Env {
  attack: number
  decay: number
  /** Niveau de maintien (fraction du pic). */
  sustain: number
  release: number
}

/**
 * Enveloppe ADSR sur un gain : attaque linéaire, décroissance et relâche exponentielles.
 * Renvoie l'instant où la voix est silencieuse (pour arrêter les sources).
 */
export function envelope(g: AudioParam, when: number, dur: number, peak: number, e: Env): number {
  const a = Math.min(e.attack, Math.max(0.002, dur * 0.9))
  g.setValueAtTime(0, when)
  g.linearRampToValueAtTime(peak, when + a)
  if (e.sustain < 1) g.setTargetAtTime(peak * e.sustain, when + a, Math.max(0.001, e.decay) / 3)
  const off = when + Math.max(dur, a)
  g.setTargetAtTime(0, off, Math.max(0.001, e.release) / 4)
  return off + e.release * 1.6
}

/** Bruit blanc partagé (une seconde, bouclé) pour les percussions et la montée. */
const noiseCache = new WeakMap<BaseAudioContext, AudioBuffer>()
export function whiteNoise(ctx: BaseAudioContext): AudioBuffer {
  let b = noiseCache.get(ctx)
  if (!b) {
    b = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate)
    const d = b.getChannelData(0)
    let s = 12345
    for (let i = 0; i < d.length; i++) {
      s = (s * 1103515245 + 12345) >>> 0
      d[i] = (s / 4294967296) * 2 - 1
    }
    noiseCache.set(ctx, b)
  }
  return b
}

/**
 * Nappe / cordes / braam : dents de scie désaccordées. Deux voix = une par oreille (fusion
 * L/R, sans panoramique) ; trois voix = une au centre en plus. Tout est libéré en fin de note.
 */
export function sawVoice(
  out: AudioNode, midi: number, when: number, dur: number, vel: number,
  o: Env & { voices: 2 | 3; spread: number; type?: OscillatorType },
): void {
  const ctx = out.context
  const g = ctx.createGain()
  g.connect(out)
  const end = envelope(g.gain, when, dur, vel / Math.sqrt(o.voices), o)
  const merger = ctx.createChannelMerger(2)
  merger.connect(g)
  const f = mtof(midi)
  const detunes = o.voices === 2 ? [-o.spread, o.spread] : [-o.spread, o.spread, 0]
  detunes.forEach((d, i) => {
    const osc = ctx.createOscillator()
    osc.type = o.type ?? 'sawtooth'
    osc.frequency.value = f
    osc.detune.value = d + (Math.random() - 0.5) * 3
    if (i < 2) osc.connect(merger, 0, i)
    else {
      osc.connect(merger, 0, 0)
      osc.connect(merger, 0, 1)
    }
    // départs décalés de quelques ms : pas de front commun à toutes les voix
    osc.start(when + Math.random() * 0.004)
    osc.stop(end)
    osc.onended = () => {
      osc.disconnect()
      if (i === 0) {
        merger.disconnect()
        g.disconnect()
      }
    }
  })
}

/** Cloche de verre : modulation de fréquence (porteuse sinus, indice qui décroît vite). */
export function fmBell(out: AudioNode, midi: number, when: number, vel: number, o: { ratio: number; index: number; decay: number; indexDecay: number }): void {
  const ctx = out.context
  const f = mtof(midi)
  const car = ctx.createOscillator()
  car.frequency.value = f
  const mod = ctx.createOscillator()
  mod.frequency.value = f * o.ratio
  const mg = ctx.createGain()
  mg.gain.setValueAtTime(f * o.index, when)
  mg.gain.setTargetAtTime(f * o.index * 0.05, when + 0.002, o.indexDecay / 3)
  mod.connect(mg).connect(car.frequency)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vel, when + 0.004)
  g.gain.setTargetAtTime(0, when + 0.004, o.decay / 4)
  car.connect(g).connect(out)
  const end = when + o.decay * 1.8
  car.start(when)
  mod.start(when)
  car.stop(end)
  mod.stop(end)
  car.onended = () => {
    car.disconnect()
    mod.disconnect()
    mg.disconnect()
    g.disconnect()
  }
}

/** Note pincée filtrée (séquenceur, sous-basse) : oscillateur → passe-bas à enveloppe → gain. */
export function pluck(
  out: AudioNode, midi: number, when: number, dur: number, vel: number,
  o: Env & { type: OscillatorType; cutoff: number; envOctaves: number; filterDecay: number; q: number; detune?: number },
): void {
  const ctx = out.context
  const f = mtof(midi)
  const flt = ctx.createBiquadFilter()
  flt.type = 'lowpass'
  flt.Q.value = o.q
  flt.frequency.setValueAtTime(o.cutoff * Math.pow(2, o.envOctaves), when)
  flt.frequency.setTargetAtTime(o.cutoff, when, o.filterDecay / 3)
  const g = ctx.createGain()
  flt.connect(g).connect(out)
  const end = envelope(g.gain, when, dur, vel, o)
  const oscs = o.detune ? [-o.detune, o.detune] : [0]
  for (const [i, d] of oscs.entries()) {
    const osc = ctx.createOscillator()
    osc.type = o.type
    osc.frequency.value = f
    osc.detune.value = d
    osc.connect(flt)
    osc.start(when)
    osc.stop(end)
    osc.onended = () => {
      osc.disconnect()
      if (i === 0) {
        flt.disconnect()
        g.disconnect()
      }
    }
  }
}

/** Tambour sur cadre / tom : sinus dont la hauteur tombe très vite, enveloppe courte. */
export function membrane(out: AudioNode, freq: number, when: number, vel: number, o: { pitchDecay: number; octaves: number; decay: number; type?: OscillatorType }): void {
  const ctx = out.context
  const osc = ctx.createOscillator()
  osc.type = o.type ?? 'sine'
  osc.frequency.setValueAtTime(freq * Math.pow(2, o.octaves), when)
  osc.frequency.exponentialRampToValueAtTime(freq, when + o.pitchDecay)
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vel, when + 0.0015)
  g.gain.setTargetAtTime(0, when + 0.0015, o.decay / 4)
  osc.connect(g).connect(out)
  osc.start(when)
  osc.stop(when + o.decay * 1.8)
  osc.onended = () => {
    osc.disconnect()
    g.disconnect()
  }
}

/** Coup de bruit filtré (shaker, souffle). */
export function noiseHit(out: AudioNode, when: number, vel: number, o: { decay: number; type: BiquadFilterType; freq: number; q?: number }): void {
  const ctx = out.context
  const src = ctx.createBufferSource()
  src.buffer = whiteNoise(ctx)
  const flt = ctx.createBiquadFilter()
  flt.type = o.type
  flt.frequency.value = o.freq
  flt.Q.value = o.q ?? 0.7
  const g = ctx.createGain()
  g.gain.setValueAtTime(0, when)
  g.gain.linearRampToValueAtTime(vel, when + 0.002)
  g.gain.setTargetAtTime(0, when + 0.002, o.decay / 4)
  src.connect(flt).connect(g).connect(out)
  src.start(when, Math.random() * 0.9)
  src.stop(when + o.decay * 1.8)
  src.onended = () => {
    src.disconnect()
    flt.disconnect()
    g.disconnect()
  }
}

/** Échantillonneur : note la plus proche + transposition, attaque et relâche douces. */
export class NativeSampler {
  private readonly zones: { midi: number; buf: AudioBuffer }[]

  constructor(
    zones: { midi: number; buf: AudioBuffer | undefined }[],
    private readonly o: { attack: number; release: number },
  ) {
    this.zones = zones.filter((z): z is { midi: number; buf: AudioBuffer } => !!z.buf).sort((a, b) => a.midi - b.midi)
  }

  get ready(): boolean {
    return this.zones.length > 0
  }

  play(out: AudioNode, midi: number, when: number, dur: number, vel: number, release = this.o.release): void {
    if (!this.zones.length) return
    let z = this.zones[0]!
    for (const c of this.zones) if (Math.abs(c.midi - midi) < Math.abs(z.midi - midi)) z = c
    const ctx = out.context
    const src = ctx.createBufferSource()
    src.buffer = z.buf
    src.playbackRate.value = Math.pow(2, (midi - z.midi) / 12)
    const g = ctx.createGain()
    const a = this.o.attack
    g.gain.setValueAtTime(a > 0.003 ? 0 : vel, when)
    if (a > 0.003) g.gain.linearRampToValueAtTime(vel, when + a)
    const natural = z.buf.duration / src.playbackRate.value
    const off = when + Math.min(dur, natural)
    g.gain.setTargetAtTime(0, off, release / 4)
    src.connect(g).connect(out)
    src.start(when)
    src.stop(Math.min(when + natural, off + release * 1.6))
    src.onended = () => {
      src.disconnect()
      g.disconnect()
    }
  }
}

/**
 * Délai ping-pong stéréo (retour croisé gauche ↔ droite), assombri à chaque passage.
 * `dryThrough` : faut-il laisser passer le son direct (sinon seulement l'écho).
 */
export function pingPong(ctx: BaseAudioContext, time: number, feedback: number, wet: number, dryThrough = true): { input: GainNode; output: GainNode } {
  const input = ctx.createGain()
  const output = ctx.createGain()
  if (dryThrough) input.connect(output)
  // entrée ramenée en mono, puis alternance gauche / droite
  input.channelCount = 1
  input.channelCountMode = 'explicit'
  const dl = ctx.createDelay(4), dr = ctx.createDelay(4)
  dl.delayTime.value = time
  dr.delayTime.value = time
  const fl = ctx.createGain(), fr = ctx.createGain()
  fl.gain.value = feedback
  fr.gain.value = feedback
  const tone = ctx.createBiquadFilter()
  tone.type = 'lowpass'
  tone.frequency.value = 4500
  input.connect(tone).connect(dl)
  dl.connect(fl).connect(dr)
  dr.connect(fr).connect(dl)
  const merger = ctx.createChannelMerger(2)
  dl.connect(merger, 0, 0)
  dr.connect(merger, 0, 1)
  const w = ctx.createGain()
  w.gain.value = wet
  merger.connect(w).connect(output)
  return { input, output }
}

/** Chorus léger : deux retards modulés par des LFO lents, un par oreille. */
export function chorus(ctx: BaseAudioContext, rate: number, depthMs: number, wet: number): { input: GainNode; output: GainNode } {
  const input = ctx.createGain()
  const output = ctx.createGain()
  input.connect(output)
  const merger = ctx.createChannelMerger(2)
  const w = ctx.createGain()
  w.gain.value = wet
  merger.connect(w).connect(output)
  for (let ch = 0; ch < 2; ch++) {
    const d = ctx.createDelay(0.1)
    d.delayTime.value = 0.014 + ch * 0.004
    const lfo = ctx.createOscillator()
    lfo.frequency.value = rate * (ch ? 1.13 : 1)
    const depth = ctx.createGain()
    depth.gain.value = depthMs / 1000
    lfo.connect(depth).connect(d.delayTime)
    lfo.start()
    input.connect(d)
    d.connect(merger, 0, ch)
  }
  return { input, output }
}
