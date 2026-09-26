// Sons générés par le code (aucun fichier) : bruits bouclables, réponses impulsionnelles de
// réverbération, « tsk » granuleux, « clac » d'ailes, grains de sable. Tout est déterministe
// (graine fixe) pour que les rendus hors ligne soient reproductibles.
import { Rng } from './util.ts'

export type NoiseColor = 'white' | 'pink' | 'brown'

/** Fondu enchaîné à puissance constante fin → début : la boucle n'a pas de couture. */
function loopify(data: Float32Array, xfade: number): Float32Array {
  const L = data.length - xfade
  const out = new Float32Array(L)
  for (let i = 0; i < xfade; i++) {
    const a = (i / xfade) * (Math.PI / 2)
    out[i] = data[i]! * Math.sin(a) + data[L + i]! * Math.cos(a)
  }
  out.set(data.subarray(xfade, L), xfade)
  return out
}

/** Bruit coloré stéréo (canaux décorrélés), bouclable sans couture. */
export function noiseBuffer(ctx: BaseAudioContext, seconds: number, color: NoiseColor, seed = 1, channels = 2): AudioBuffer {
  const sr = ctx.sampleRate
  const xf = Math.floor(sr * 0.25)
  const n = Math.floor(seconds * sr) + xf
  const buf = ctx.createBuffer(channels, n - xf, sr)
  for (let ch = 0; ch < channels; ch++) {
    const rng = new Rng(seed * 7919 + ch * 104729)
    const d = new Float32Array(n)
    let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0
    for (let i = 0; i < n; i++) {
      const w = rng.next() * 2 - 1
      if (color === 'white') d[i] = w * 0.5
      else if (color === 'pink') {
        // Filtre de Paul Kellet
        b0 = 0.99886 * b0 + w * 0.0555179
        b1 = 0.99332 * b1 + w * 0.0750759
        b2 = 0.969 * b2 + w * 0.153852
        b3 = 0.8665 * b3 + w * 0.3104856
        b4 = 0.55 * b4 + w * 0.5329522
        b5 = -0.7616 * b5 - w * 0.016898
        d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11
        b6 = w * 0.115926
      } else {
        last = (last + 0.02 * w) / 1.02
        d[i] = last * 3.5
      }
    }
    buf.copyToChannel(loopify(d, xf) as Float32Array<ArrayBuffer>, ch)
  }
  return buf
}

/**
 * Réponse impulsionnelle stéréo : premières réflexions éparses puis queue de bruit à
 * décroissance exponentielle, qui s'assombrit avec le temps (l'air absorbe les aigus).
 */
export function impulseResponse(
  ctx: BaseAudioContext,
  opts: { seconds: number; preDelay?: number; brightness?: number; seed?: number },
): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(opts.seconds * sr)
  const pre = Math.floor((opts.preDelay ?? 0.02) * sr)
  const bright = opts.brightness ?? 0.6
  const buf = ctx.createBuffer(2, n, sr)
  const tau = opts.seconds / 6.9 // −60 dB à `seconds`
  for (let ch = 0; ch < 2; ch++) {
    const rng = new Rng((opts.seed ?? 3) * 31 + ch * 977)
    const d = new Float32Array(n)
    let lp = 0
    for (let i = pre; i < n; i++) {
      const t = (i - pre) / sr
      const env = Math.exp(-t / tau) * Math.min(1, t / 0.012)
      // coefficient du passe-bas : de clair (bright) à sombre en fin de queue
      const k = bright * Math.exp(-t / (opts.seconds * 0.35)) + 0.04
      lp += k * (rng.next() * 2 - 1 - lp)
      d[i] = lp * env
    }
    // premières réflexions (sol de sable, pas de murs : peu nombreuses)
    for (let r = 0; r < 7; r++) {
      const at = pre + Math.floor(rng.range(0.004, 0.07) * sr)
      if (at < n) d[at] = d[at]! + rng.range(-0.5, 0.5) * (1 - r / 8)
    }
    let peak = 0
    for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(d[i]!))
    let energy = 0
    for (let i = 0; i < n; i++) energy += d[i]! * d[i]!
    // normalisation en énergie : la réverbe ne change pas de volume avec sa durée
    const g = 0.5 / Math.sqrt(energy + 1e-9)
    for (let i = 0; i < n; i++) d[i] = d[i]! * g
    buf.copyToChannel(d as Float32Array<ArrayBuffer>, ch)
  }
  return buf
}

/** « Tsk » granuleux : l'ombre pâle crépite sur le sable fort sans le prendre. */
export function tskBuffer(ctx: BaseAudioContext, seed = 5): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(0.11 * sr)
  const buf = ctx.createBuffer(1, n, sr)
  const d = new Float32Array(n)
  const rng = new Rng(seed)
  // souffle « ts » : bruit passe-bande 3-8 kHz, décroissance rapide
  let hp = 0, lp = 0, prev = 0
  for (let i = 0; i < n; i++) {
    const t = i / sr
    const w = rng.next() * 2 - 1
    hp = 0.82 * (hp + w - prev)
    prev = w
    lp += 0.55 * (hp - lp)
    d[i] = lp * 0.35 * Math.exp(-t / 0.028) * Math.min(1, t / 0.002)
  }
  // grains : petits craquements secs, en grappe au début
  for (let g = 0; g < 16; g++) {
    const at = Math.floor(Math.pow(rng.next(), 1.8) * 0.075 * sr)
    const len = Math.floor(rng.range(0.0004, 0.0016) * sr)
    const amp = rng.range(0.25, 0.9) * (1 - at / n)
    for (let j = 0; j < len && at + j < n; j++) {
      d[at + j] = d[at + j]! + amp * (rng.next() * 2 - 1) * (1 - j / len)
    }
  }
  normalize(d, 0.89)
  buf.copyToChannel(d as Float32Array<ArrayBuffer>, 0)
  return buf
}

/** « Clac » : deux claquements d'ailes serrés, corps boisé autour de 900 Hz et souffle aigu. */
export function clacBuffer(ctx: BaseAudioContext, seed = 9): AudioBuffer {
  const sr = ctx.sampleRate
  const n = Math.floor(0.16 * sr)
  const buf = ctx.createBuffer(1, n, sr)
  const d = new Float32Array(n)
  const rng = new Rng(seed)
  const hits = [0, 0.009]
  for (const [h, t0] of hits.entries()) {
    const start = Math.floor(t0 * sr)
    // résonateur (deux modes) excité par un bruit bref
    const modes = [
      { f: 880 + h * 60, q: 0.9965, a: 0.9 },
      { f: 2350 + h * 150, q: 0.992, a: 0.5 },
    ]
    for (const m of modes) {
      const w = (2 * Math.PI * m.f) / sr
      const c = 2 * m.q * Math.cos(w)
      let y1 = 0, y2 = 0
      for (let i = start; i < n; i++) {
        const k = i - start
        const x = k < sr * 0.0015 ? (rng.next() * 2 - 1) * m.a : 0
        const y = x + c * y1 - m.q * m.q * y2
        y2 = y1
        y1 = y
        d[i] = d[i]! + y * 0.08 * (h === 0 ? 0.8 : 1)
      }
    }
    // souffle
    for (let i = start; i < n; i++) {
      const t = (i - start) / sr
      d[i] = d[i]! + (rng.next() * 2 - 1) * 0.5 * Math.exp(-t / 0.012) * (h === 0 ? 0.7 : 1)
    }
  }
  normalize(d, 0.89)
  buf.copyToChannel(d as Float32Array<ArrayBuffer>, 0)
  return buf
}

/**
 * Grains de sable qui coulent : impulsions de Poisson d'amplitude log-normale, filtrées vers
 * les aigus, stéréo, bouclables. La densité perçue se règle ensuite par le gain et la vitesse.
 */
export function sandGrainBuffer(ctx: BaseAudioContext, seconds = 4, density = 900, seed = 11): AudioBuffer {
  const sr = ctx.sampleRate
  const xf = Math.floor(sr * 0.1)
  const n = Math.floor(seconds * sr) + xf
  const buf = ctx.createBuffer(2, n - xf, sr)
  for (let ch = 0; ch < 2; ch++) {
    const rng = new Rng(seed * 13 + ch)
    const d = new Float32Array(n)
    let t = 0
    while (true) {
      t += -Math.log(1 - rng.next()) / density
      const i = Math.floor(t * sr)
      if (i >= n) break
      const amp = Math.exp(rng.range(-3.2, 0)) * 0.6
      const len = Math.floor(rng.range(0.0002, 0.0012) * sr)
      for (let j = 0; j < len && i + j < n; j++) d[i + j] = d[i + j]! + amp * (rng.next() * 2 - 1) * (1 - j / len)
    }
    // passe-haut doux (enlève le « pop ») + léger lissage
    let prevIn = 0, hp = 0, lp = 0
    for (let i = 0; i < n; i++) {
      hp = 0.9 * (hp + d[i]! - prevIn)
      prevIn = d[i]!
      lp += 0.7 * (hp - lp)
      d[i] = lp
    }
    const out = loopify(d, xf)
    normalize(out, 0.7)
    buf.copyToChannel(out as Float32Array<ArrayBuffer>, ch)
  }
  return buf
}

/** Copie inversée d'un tampon (souffle « à l'envers » vers un temps fort). */
export function reversed(ctx: BaseAudioContext, src: AudioBuffer): AudioBuffer {
  const buf = ctx.createBuffer(src.numberOfChannels, src.length, src.sampleRate)
  for (let ch = 0; ch < src.numberOfChannels; ch++) {
    const d = src.getChannelData(ch).slice().reverse()
    buf.copyToChannel(d, ch)
  }
  return buf
}

function normalize(d: Float32Array, peak: number): void {
  let m = 0
  for (let i = 0; i < d.length; i++) m = Math.max(m, Math.abs(d[i]!))
  if (m > 0) for (let i = 0; i < d.length; i++) d[i] = (d[i]! * peak) / m
}

/** Courbe de saturation douce (plafond ≈ −0,5 dBFS) pour le WaveShaper du master. */
export function softClipCurve(n = 4096, ceiling = 0.944): Float32Array {
  const c = new Float32Array(n)
  const knee = 0.72
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1
    const a = Math.abs(x)
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee))
    c[i] = Math.sign(x) * Math.min(y, ceiling)
  }
  return c
}
