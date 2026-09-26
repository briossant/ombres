// Mesure de sonie BS.1770 (pondération K) dans le navigateur : sonie momentanée (400 ms),
// intégrée (avec portes absolue et relative), crête. Sert à régler les sons générés par le
// code en sonie perçue et à vérifier les rendus hors ligne dans la page de dev.

interface Biquad {
  b0: number
  b1: number
  b2: number
  a1: number
  a2: number
}

/** Coefficients des deux filtres de la pondération K pour une fréquence d'échantillonnage donnée. */
function kFilters(sr: number): [Biquad, Biquad] {
  // étagère haute (pré-filtre), formules de pyloudnorm / BS.1770-4
  const G = 3.99984385397, Q = 0.7071752369554193, fc = 1681.9744509555319
  const A = Math.pow(10, G / 40)
  let w0 = (2 * Math.PI * fc) / sr
  let alpha = Math.sin(w0) / (2 * Q)
  const cw = Math.cos(w0)
  const sA = Math.sqrt(A)
  let a0 = A + 1 - (A - 1) * cw + 2 * sA * alpha
  const shelf: Biquad = {
    b0: (A * (A + 1 + (A - 1) * cw + 2 * sA * alpha)) / a0,
    b1: (-2 * A * (A - 1 + (A + 1) * cw)) / a0,
    b2: (A * (A + 1 + (A - 1) * cw - 2 * sA * alpha)) / a0,
    a1: (2 * (A - 1 - (A + 1) * cw)) / a0,
    a2: (A + 1 - (A - 1) * cw - 2 * sA * alpha) / a0,
  }
  // passe-haut RLB
  const fc2 = 38.13547087613982, Q2 = 0.5003270373253953
  w0 = (2 * Math.PI * fc2) / sr
  alpha = Math.sin(w0) / (2 * Q2)
  const c2 = Math.cos(w0)
  a0 = 1 + alpha
  const hp: Biquad = {
    b0: (1 + c2) / 2 / a0,
    b1: -(1 + c2) / a0,
    b2: (1 + c2) / 2 / a0,
    a1: (-2 * c2) / a0,
    a2: (1 - alpha) / a0,
  }
  return [shelf, hp]
}

function filter(x: Float32Array, f: Biquad): Float32Array {
  const y = new Float32Array(x.length)
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0
  for (let i = 0; i < x.length; i++) {
    const v = f.b0 * x[i]! + f.b1 * x1 + f.b2 * x2 - f.a1 * y1 - f.a2 * y2
    x2 = x1
    x1 = x[i]!
    y2 = y1
    y1 = v
    y[i] = v
  }
  return y
}

export interface LoudnessReport {
  /** Sonie intégrée (LUFS), portes −70 LUFS et relative −10 LU. */
  integrated: number
  /** Sonie momentanée maximale (LUFS). */
  momentaryMax: number
  /** Sonie momentanée tous les 100 ms (LUFS). */
  momentary: Float32Array
  /** Crête échantillon (dBFS). */
  peakDb: number
}

/** Mesure un tampon (ou une portion [from, to] en secondes). */
export function measureLoudness(buf: AudioBuffer, from = 0, to = buf.duration): LoudnessReport {
  const sr = buf.sampleRate
  const [shelf, hp] = kFilters(sr)
  const i0 = Math.max(0, Math.floor(from * sr))
  const i1 = Math.min(buf.length, Math.floor(to * sr))
  const win = Math.floor(0.4 * sr), hop = Math.floor(0.1 * sr)
  const nWin = Math.max(1, Math.floor((i1 - i0 - win) / hop) + 1)
  const power = new Float64Array(nWin)
  let peak = 0
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const raw = buf.getChannelData(ch).subarray(i0, i1)
    for (let i = 0; i < raw.length; i++) peak = Math.max(peak, Math.abs(raw[i]!))
    const y = filter(filter(raw, shelf), hp)
    // somme cumulée des carrés → fenêtres glissantes en O(n)
    const cum = new Float64Array(y.length + 1)
    for (let i = 0; i < y.length; i++) cum[i + 1] = cum[i]! + y[i]! * y[i]!
    for (let w = 0; w < nWin; w++) {
      const a = w * hop, b = Math.min(a + win, y.length)
      power[w] = power[w]! + (cum[b]! - cum[a]!) / Math.max(1, b - a)
    }
  }
  const lk = new Float32Array(nWin)
  let mmax = -120
  for (let w = 0; w < nWin; w++) {
    lk[w] = -0.691 + 10 * Math.log10(power[w]! + 1e-15)
    mmax = Math.max(mmax, lk[w]!)
  }
  let sum = 0, n = 0
  for (let w = 0; w < nWin; w++) if (lk[w]! > -70) (sum += power[w]!), n++
  let integrated = -70
  if (n) {
    const rel = -0.691 + 10 * Math.log10(sum / n) - 10
    let s2 = 0, n2 = 0
    for (let w = 0; w < nWin; w++) if (lk[w]! > -70 && lk[w]! > rel) (s2 += power[w]!), n2++
    if (n2) integrated = -0.691 + 10 * Math.log10(s2 / n2)
  }
  return { integrated, momentaryMax: mmax, momentary: lk, peakDb: 20 * Math.log10(peak + 1e-12) }
}
